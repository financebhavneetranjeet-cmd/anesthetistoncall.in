import { env } from "cloudflare:workers";
import { z } from "zod";
import { getAdminIdentity } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

const schema = z.object({
  action: z.enum(["suspend", "block", "restore"]),
  reason: z.string().trim().min(3, "A reason is required.").max(500),
  suspensionExpiresAt: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if (value.action === "suspend" && (!value.suspensionExpiresAt || new Date(value.suspensionExpiresAt).getTime() <= Date.now())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suspensionExpiresAt"], message: "Choose a future suspension expiry." });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminIdentity();
  if (!admin) return jsonError("Admin access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Valid action and reason required.");
  const { id } = await params;
  const user = await env.DB.prepare("SELECT id, role, CASE WHEN status = 'suspended' THEN 'suspended' ELSE account_status END AS accountStatus FROM users WHERE id = ?").bind(id).first<{ id: string; role: string; accountStatus: "active" | "suspended" | "blocked" }>();
  if (!user) return jsonError("User not found.", 404);
  if (user.role === "admin") return jsonError("Admin accounts cannot be changed from this control.", 403);
  const newStatus = parsed.data.action === "restore" ? "active" : parsed.data.action === "block" ? "blocked" : "suspended";
  if (user.accountStatus === newStatus) return jsonError(`Account is already ${newStatus}.`, 409);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET account_status = ?, suspended_until = ?, status = CASE WHEN ? = 'active' AND status = 'suspended' THEN 'verified' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role != 'admin'").bind(newStatus, newStatus === "suspended" ? parsed.data.suspensionExpiresAt : null, newStatus, id),
    env.DB.prepare("INSERT INTO user_access_audit_logs (id, user_id, action, reason, admin_actor, previous_status, new_status, suspension_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, parsed.data.action, parsed.data.reason, admin.actor, user.accountStatus, newStatus, newStatus === "suspended" ? parsed.data.suspensionExpiresAt : null),
    env.DB.prepare("INSERT INTO admin_audit_logs (id, actor_email, action, target_type, target_id, details) VALUES (?, ?, ?, 'user', ?, ?)").bind(crypto.randomUUID(), admin.actor, `user_${parsed.data.action}`, id, JSON.stringify({ reason: parsed.data.reason, previousStatus: user.accountStatus, newStatus })),
    ...(newStatus === "active" ? [] : [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id)]),
  ]);
  return jsonOk({ user: { id, accountStatus: newStatus, suspensionExpiresAt: newStatus === "suspended" ? parsed.data.suspensionExpiresAt : null } });
}
