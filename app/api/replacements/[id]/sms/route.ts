import { env } from "cloudflare:workers";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { replacementRecipients } from "@/lib/server/replacement-recipients";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  const { id } = await params;
  const item = await env.DB.prepare(`SELECT c.procedure_name AS procedureName,c.scheduled_at AS scheduledAt,c.duration_minutes AS durationMinutes,c.offered_fee_paise AS offeredFeePaise,h.name AS hospitalName,h.city
    FROM cases c JOIN hospitals h ON h.id=c.hospital_id
    JOIN users owner ON owner.id=h.owner_user_id
    WHERE c.id=? AND c.posted_by_user_id=? AND c.status='open' AND datetime(c.scheduled_at)>CURRENT_TIMESTAMP
      AND h.approval_status='approved' AND owner.status='verified' AND owner.account_status='active'
      AND EXISTS(SELECT 1 FROM case_audit_events e WHERE e.case_id=c.id AND e.event_type='replacement_requested')`)
    .bind(id, user.id).first<{ procedureName: string; scheduledAt: string; durationMinutes: number; offeredFeePaise: number; hospitalName: string; city: string }>();
  if (!item) return jsonError("An open replacement request belonging to you is required.", 404);
  // Contact details are only returned to the verified owner of this open request.
  const recipients = (await replacementRecipients(env.DB,user.id,item.city)).map(({name,number}) => ({name,number}));
  const time = new Date(item.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
  const message = `${user.fullName}: Anaesthetist replacement needed at ${item.hospitalName}, ${item.city}. Procedure: ${item.procedureName}. Reporting: ${time} IST. Duration: ${item.durationMinutes} min. Fee: Rs ${item.offeredFeePaise / 100}. Please respond if available: https://anesthetistoncall.in/cases`;
  // Explain why the public count may include the requesting anaesthetist.
  const ownAvailability = await env.DB.prepare(`SELECT 1 FROM availability_slots WHERE clinician_user_id=? AND status='available' AND datetime(start_at)<=CURRENT_TIMESTAMP AND datetime(end_at)>CURRENT_TIMESTAMP LIMIT 1`).bind(user.id).first();
  const response = jsonOk({ recipients, message, requesterAvailable: !!ownAvailability });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
