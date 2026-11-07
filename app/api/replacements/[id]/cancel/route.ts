import { env } from "cloudflare:workers";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  const { id } = await params;
  // The conditional update also protects a concurrent hospital selection.
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE cases SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,cancelled_by_user_id=?
      WHERE id=? AND posted_by_user_id=? AND status='open' AND assigned_clinician_user_id IS NULL
      AND EXISTS(SELECT 1 FROM case_audit_events e WHERE e.case_id=cases.id AND e.event_type='replacement_requested')`).bind(user.id,id,user.id),
    env.DB.prepare(`UPDATE notification_deliveries SET status='skipped',error_code='REQUEST_CANCELLED' WHERE status IN ('pending','sending','failed')
      AND notification_id IN(SELECT id FROM notifications WHERE case_id=?)
      AND EXISTS(SELECT 1 FROM cases WHERE id=? AND status='cancelled' AND cancelled_by_user_id=?)`).bind(id,id,user.id),
    env.DB.prepare(`UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),title='Replacement request cancelled',body='This replacement request is no longer accepting responses.'
      WHERE case_id=? AND kind IN ('case_open','replacement_requested')
      AND EXISTS(SELECT 1 FROM cases WHERE id=? AND status='cancelled' AND cancelled_by_user_id=?)`).bind(id,id,user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO case_audit_events(id,case_id,actor_user_id,event_type,details)
      SELECT ?,id,?,'replacement_cancelled','{}' FROM cases WHERE id=? AND status='cancelled' AND cancelled_by_user_id=?`).bind(id+':replacement-cancelled',user.id,id,user.id),
  ]);
  if (!result[0].meta.changes) return jsonError("Only your open, unselected replacement request can be cancelled. Refresh its status.",409);
  return jsonOk({status:'cancelled'});
}
