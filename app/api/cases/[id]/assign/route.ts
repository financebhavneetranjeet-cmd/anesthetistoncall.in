import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isApprovedHospital, isVerifiedClinician } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { auditCase } from "@/lib/server/case-audit";
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) {
  if (!env.DB) return jsonError("Database unavailable.", 503); const user = await getSessionUser(); if (!user || (!isApprovedHospital(user) && !(isVerifiedClinician(user)&&user.role==="surgeon"))) return jsonError("Approved hospital or verified surgeon access required.", 403);
  const parsed = z.object({ bidId: z.string().uuid() }).safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError("Valid bid is required."); const { id } = await params;
  const bid = await env.DB.prepare("SELECT r.clinician_user_id AS clinicianId,u.mobile,r.proposed_fee_paise AS bidFee,c.offered_fee_paise AS postedFee,c.is_emergency AS emergency,c.is_planned AS planned,c.scheduled_at AS scheduledAt,c.duration_minutes AS durationMinutes,c.booking_buffer_minutes AS bufferMinutes FROM case_responses r JOIN cases c ON c.id = r.case_id JOIN users u ON u.id=r.clinician_user_id WHERE r.id = ? AND r.case_id = ? AND r.status = 'available' AND c.status = 'open' AND (c.hospital_id = ? OR ((c.is_emergency=1 OR c.is_planned=1) AND c.posted_by_user_id=?))").bind(parsed.data.bidId, id, user.hospitalId, user.id).first<any>(); if (!bid) return jsonError("Available bid not found.", 404);
  if(bid.planned){const conflict=await env.DB.prepare("SELECT id FROM cases WHERE assigned_clinician_user_id=? AND is_planned=1 AND booking_status='confirmed' AND status NOT IN('cancelled','completed') AND datetime(scheduled_at)<datetime(?,'+'||(?+?)||' minutes') AND datetime(scheduled_at,'+'||(duration_minutes+booking_buffer_minutes)||' minutes')>datetime(?) LIMIT 1").bind(bid.clinicianId,bid.scheduledAt,bid.durationMinutes,bid.bufferMinutes,bid.scheduledAt).first();if(conflict)return jsonError("Scheduling conflict: this anaesthetist already has an overlapping confirmed booking, including the travel buffer.",409,"DOUBLE_BOOKING");}
  const finalFee=bid.bidFee??bid.postedFee;
  const offered = await env.DB.prepare("UPDATE cases SET status='offered',sos_status=CASE WHEN is_emergency=1 THEN 'matched' ELSE sos_status END,booking_status=CASE WHEN is_planned=1 THEN 'selected' ELSE booking_status END,assigned_clinician_user_id=?,assigned_at=NULL,final_agreed_fee_paise=?,fee_locked_at=CURRENT_TIMESTAMP WHERE id=? AND status='open' AND assigned_clinician_user_id IS NULL AND fee_locked_at IS NULL").bind(bid.clinicianId,finalFee,id).run();
  if (!offered.meta.changes) return jsonError("This case is no longer open.", 409);
  await env.DB.prepare("UPDATE case_responses SET status = CASE WHEN id = ? THEN 'selected' ELSE 'declined' END, updated_at = CURRENT_TIMESTAMP WHERE case_id = ? AND status = 'available'").bind(parsed.data.bidId, id).run();
  await notifyUser({userId:bid.clinicianId,caseId:id,kind:"bid_accepted",title:"Assignment awaiting your response",body:"The hospital selected you. Accept to unlock private contact and coordination details, or decline to reopen the case.",dedupeKey:`bid_accepted:${id}:${bid.clinicianId}`,mobile:bid.mobile});
  await auditCase(id,user.id,"bid_selected",{clinicianUserId:bid.clinicianId,postedFeePaise:bid.postedFee,bidFeePaise:bid.bidFee,finalAgreedFeePaise:finalFee});
  return jsonOk({ case: { id, status: "offered" } });
}
