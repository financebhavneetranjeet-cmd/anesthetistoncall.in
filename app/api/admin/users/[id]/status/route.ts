import { env } from "cloudflare:workers";
import { z } from "zod";
import { getAdminIdentity } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";
import { isAdminMobile } from "@/lib/server/login";

const schema = z.object({
  action: z.enum(["suspend", "block", "restore", "delete", "reject", "ban", "clear-ban"]),
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
  const db = env.DB;
  if (!db) return jsonError("Database unavailable.", 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Valid action and reason required.");
  const { id } = await params;
  const { action, reason, suspensionExpiresAt } = parsed.data;
  const user = await db.prepare(`SELECT u.role, u.status, u.account_status AS rawStatus,
    CASE WHEN u.status = 'suspended' THEN 'suspended' ELSE u.account_status END AS accountStatus,
    a.user_id IS NOT NULL AS archived, COALESCE(a.mobile, u.mobile) AS mobile,
    EXISTS (SELECT 1 FROM mobile_security_bans b WHERE b.mobile = COALESCE(a.mobile, u.mobile) AND b.cleared_at IS NULL) AS banned
    FROM users u LEFT JOIN archived_accounts a ON a.user_id = u.id WHERE u.id = ?`)
    .bind(id).first<{ role: string; status: string; rawStatus: string; accountStatus: string; archived: number; mobile: string; banned: number }>();
  if (!user) return jsonError("User not found.", 404);
  if (user.role === "admin") return jsonError("Admin accounts cannot be changed from this control.", 403);
  const audit = (newStatus: string) => db.prepare(`INSERT INTO admin_audit_logs
    (id, actor_email, action, target_type, target_id, details)
    SELECT ?, ?, ?, 'user', ?, ? WHERE changes() > 0`)
    .bind(crypto.randomUUID(), admin.actor, `user_${action}`, id, JSON.stringify({ reason, previousStatus: user.accountStatus, newStatus }));

  if (action === "ban" || action === "clear-ban") {
    if (isAdminMobile(user.mobile)) return jsonError("This number belongs to an administrator.", 403);
    if (action === "ban" && user.accountStatus !== "blocked") return jsonError("Block the account before banning its number.", 409);
    const change = action === "ban"
      ? db.prepare(`INSERT INTO mobile_security_bans(mobile,reason) VALUES (?,?)
          ON CONFLICT(mobile) DO UPDATE SET reason=excluded.reason, banned_at=excluded.banned_at, cleared_at=NULL
          WHERE mobile_security_bans.cleared_at IS NOT NULL`).bind(user.mobile, reason)
      : db.prepare("UPDATE mobile_security_bans SET cleared_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE mobile=? AND cleared_at IS NULL").bind(user.mobile);
    const result = await db.batch([change, audit(action)]);
    return result[0].meta.changes ? jsonOk({ user: { id } }) : jsonError("The ban status has already changed.", 409);
  }
  if (user.archived) return jsonError("This account has been deleted.", 409);
  if (action === "delete") {
    if (user.rawStatus !== "blocked") return jsonError("Block the account before deleting it.", 409);
    const result = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO archived_accounts(user_id,mobile,blocking_reason)
        SELECT id,mobile,(SELECT reason FROM user_access_audit_logs WHERE user_id=users.id AND action IN ('block','reject') ORDER BY created_at DESC,rowid DESC LIMIT 1)
        FROM users WHERE id=? AND account_status='blocked' AND role!='admin'`).bind(id),
      audit("deleted"),
    ]);
    return result[0].meta.changes ? jsonOk({ user: { id, accountStatus: "deleted" } }) : jsonError("Account status changed. Refresh and retry.", 409);
  }
  if (action === "reject" && (user.status !== "pending" || user.rawStatus !== "active")) return jsonError("Only pending applications can be rejected.", 409);
  if (action === "restore" && (user.banned || user.status === "rejected")) return jsonError("This account cannot be restored.", 409);

  const newStatus = action === "restore" ? "active" : action === "block" || action === "reject" ? "blocked" : "suspended";
  if (user.accountStatus === newStatus) return jsonError(`Account is already ${newStatus}.`, 409);
  const expires = newStatus === "suspended" ? suspensionExpiresAt : null;
  const result = await db.batch([
    db.prepare(`UPDATE users SET account_status = ?, suspended_until = ?,
      status = CASE WHEN ? = 'reject' THEN 'rejected' WHEN ? = 'active' AND status = 'suspended' THEN 'verified' ELSE status END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role != 'admin' AND account_status = ? AND status = ?
      AND NOT EXISTS (SELECT 1 FROM archived_accounts WHERE user_id = users.id)
      AND (? != 'active' OR NOT EXISTS (SELECT 1 FROM mobile_security_bans b WHERE b.mobile = users.mobile AND b.cleared_at IS NULL))`)
      .bind(newStatus, expires, action, newStatus, id, user.rawStatus, user.status, newStatus),
    audit(newStatus),
    db.prepare(`INSERT INTO user_access_audit_logs (id, user_id, action, reason, admin_actor, previous_status, new_status, suspension_expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`).bind(crypto.randomUUID(), id, action, reason, admin.actor, user.accountStatus, newStatus, expires),
    ...(newStatus === "active" ? [] : [
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND account_status != 'active')").bind(id, id),
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND account_status != 'active')").bind(id, id),
    ]),
  ]);
  if (!result[0].meta.changes) return jsonError("Account status changed. Refresh and retry.", 409);
  return jsonOk({ user: { id, accountStatus: newStatus, suspensionExpiresAt: expires } });
}
