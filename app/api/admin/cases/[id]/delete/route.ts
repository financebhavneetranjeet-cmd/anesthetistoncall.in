import { ADMIN_CASE_DELETABLE_SQL } from "@/lib/server/admin-case-deletion";
import { env } from "cloudflare:workers";
import { getAdminIdentity } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

// A retained audit marker hides an eligible case from admin lists without
// removing clinical, payment, feedback or assignment records.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminIdentity();
  if (!admin) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const { id } = await params;
  const item = await env.DB.prepare(`SELECT c.status, ${ADMIN_CASE_DELETABLE_SQL} AS canDelete FROM cases c WHERE c.id=?`).bind(id).first<{ status: string; canDelete: number }>();
  if (!item) return jsonError("Case not found.", 404, "NOT_FOUND");
  if (!item.canDelete) return jsonError("Only completed, cancelled or expired unassigned cases can be deleted.", 409, "CASE_NOT_DELETABLE");
  const markerId = `admin-delete:${id}`;
  const details = JSON.stringify({ actor: admin.actor, retained: true });
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO case_audit_events(id,case_id,event_type,details) SELECT ?,c.id,'admin_case_deleted',? FROM cases c WHERE c.id=? AND ${ADMIN_CASE_DELETABLE_SQL}`).bind(markerId, details, id),
    env.DB.prepare("INSERT OR IGNORE INTO admin_audit_logs(id,actor_email,action,target_type,target_id,details) SELECT ?,?,'case_deleted','case',?,? WHERE EXISTS (SELECT 1 FROM case_audit_events WHERE id=? AND event_type='admin_case_deleted')").bind(markerId, admin.actor, id, details, markerId),
  ]);
  const deleted = await env.DB.prepare("SELECT id FROM case_audit_events WHERE id=? AND event_type='admin_case_deleted'").bind(markerId).first();
  if (!deleted) return jsonError("Case is no longer eligible for deletion. Refresh and try again.", 409, "CASE_NOT_DELETABLE");
  return jsonOk({ case: { id, deleted: true }, recordsRetained: true });
}
