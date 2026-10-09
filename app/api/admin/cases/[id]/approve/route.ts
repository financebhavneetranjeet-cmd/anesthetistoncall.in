import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { recordAdminAudit } from "@/lib/server/audit";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return jsonError("Admin access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const { id } = await params;
  const row = await env.DB.prepare("SELECT procedure_name AS procedureName FROM cases WHERE id = ? AND status = 'pending_approval'").bind(id).first<{procedureName:string}>();
  if (!row) return jsonError("Pending case not found.", 404);
  const clinicians = await env.DB.prepare("SELECT u.id, u.mobile FROM users u JOIN clinician_profiles cp ON cp.user_id = u.id WHERE u.role='anesthetist' AND u.status='verified' AND COALESCE(u.account_status,'active')='active' AND cp.verification_status='verified' AND cp.case_notifications_enabled=1 AND cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP").all<{id:string;mobile:string}>();
  await env.DB.prepare("UPDATE cases SET status = 'open', approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status='pending_approval'").bind(id).run();
  let alerted=0; for(const c of clinicians.results){const notice=await notifyUser({userId:c.id,caseId:id,kind:"case_open",title:"New approved case",body:`${row.procedureName} is open for bids.`,dedupeKey:`case_open:${id}:${c.id}`,mobile:c.mobile});if(notice.created)alerted++;}
  await recordAdminAudit("case_approved", "case", id, `${alerted} clinicians alerted`);
  return jsonOk({ case: { id, status: "open" }, alertedClinicians: alerted });
}
