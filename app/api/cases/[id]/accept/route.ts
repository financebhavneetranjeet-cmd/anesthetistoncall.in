import { env } from "cloudflare:workers";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { auditCase } from "@/lib/server/case-audit";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  const { id } = await params;
  const owner = await env.DB.prepare("SELECT h.owner_user_id AS id,u.mobile FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users u ON u.id=h.owner_user_id WHERE c.id=? AND c.status='offered' AND c.assigned_clinician_user_id=?").bind(id, user.id).first<{ id: string; mobile: string }>();
  if (!owner) return jsonError("Assignment offer not found.", 404);
  const conflict=await env.DB.prepare("SELECT x.id FROM cases c JOIN cases x ON x.assigned_clinician_user_id=c.assigned_clinician_user_id AND x.id<>c.id WHERE c.id=? AND c.is_planned=1 AND x.is_planned=1 AND x.booking_status='confirmed' AND x.status NOT IN('cancelled','completed') AND datetime(x.scheduled_at)<datetime(c.scheduled_at,'+'||(c.duration_minutes+c.booking_buffer_minutes)||' minutes') AND datetime(x.scheduled_at,'+'||(x.duration_minutes+x.booking_buffer_minutes)||' minutes')>datetime(c.scheduled_at) LIMIT 1").bind(id).first();if(conflict)return jsonError("Scheduling conflict detected. This booking cannot be confirmed.",409,"DOUBLE_BOOKING");
  const accepted = await env.DB.prepare("UPDATE cases SET status='assigned',assigned_at=CURRENT_TIMESTAMP,booking_status=CASE WHEN is_planned=1 THEN 'confirmed' ELSE booking_status END WHERE id=? AND status='offered' AND assigned_clinician_user_id=?").bind(id, user.id).run();
  if (!accepted.meta.changes) return jsonError("Assignment offer is no longer pending.", 409);
  await env.DB.prepare("UPDATE case_responses SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND clinician_user_id=? AND status='selected'").bind(id, user.id).run();
  await notifyUser({ userId: owner.id, caseId: id, kind: "assignment_accepted", title: "Anaesthetist accepted assignment", body: `${user.fullName} accepted the case assignment.`, dedupeKey: `assignment_accepted:${id}:${user.id}`, mobile: owner.mobile });
  await auditCase(id,user.id,"assignment_accepted");
  return jsonOk({ case: { id, status: "assigned" } });
}
