import { requireCompletionFeedback } from "@/lib/server/completion-feedback";
import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { sendWebPushForCase } from "@/lib/server/web-push";

import { replacementRecipients } from "@/lib/server/replacement-recipients";

const caseSchema = z.object({
  requestId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  procedureName: z.string().trim().min(3).max(160),
  scheduledAt: z.string().datetime(),
  offeredFeeRupees: z.number().int().positive().max(1_000_000),
  durationMinutes: z.number().int().min(15).max(1440),
});

export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  const [hospitals, requests] = await Promise.all([
    env.DB.prepare("SELECT h.id,h.name,h.address,h.city FROM hospitals h JOIN users u ON u.id=h.owner_user_id WHERE h.approval_status='approved' AND u.status='verified' AND u.account_status='active' ORDER BY h.name").all(),
    env.DB.prepare("SELECT c.id,c.procedure_name AS procedureName,h.name AS hospitalName,c.scheduled_at AS scheduledAt,c.offered_fee_paise AS offeredFeePaise,c.status,c.assigned_clinician_user_id AS assignedId,(SELECT COUNT(*) FROM case_responses r WHERE r.case_id=c.id AND r.status='available') AS responseCount FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.posted_by_user_id=? AND EXISTS(SELECT 1 FROM case_audit_events e WHERE e.case_id=c.id AND e.event_type='replacement_requested') ORDER BY c.created_at DESC LIMIT 50").bind(user.id).all(),
  ]);
  return jsonOk({ hospitals: hospitals.results, requests: requests.results.map(row => {
    const open = row.status === 'open';
    const future = new Date(String(row.scheduledAt)).getTime() > Date.now();
    const label = row.status === 'cancelled' ? 'Cancelled' : row.status === 'offered' ? 'Selected' : row.status === 'assigned' ? 'Confirmed' : row.status === 'completed' ? 'Completed' : open ? (!future ? 'Expired' : Number(row.responseCount) > 0 ? 'Responses received' : 'Searching') : String(row.status);
    return {...row, statusLabel: label, canCancel: open && !row.assignedId, canSms: open && future};
  }) });
}

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403, "VERIFIED_ANAESTHETIST_REQUIRED");
  const feedbackRequired=await requireCompletionFeedback(user.id);if(feedbackRequired)return feedbackRequired;
  const parsed = caseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid case details.");
  if (new Date(parsed.data.scheduledAt).getTime() <= Date.now()) return jsonError("Scheduled time must be in the future.");
  const caseId = parsed.data.requestId; const d = parsed.data;
  const existing = await env.DB.prepare("SELECT c.posted_by_user_id AS ownerId,c.status,EXISTS(SELECT 1 FROM case_audit_events e WHERE e.case_id=c.id AND e.event_type='replacement_requested') AS replacement FROM cases c WHERE c.id=?").bind(caseId).first<{ownerId: string; status: string; replacement: number}>();
  if (existing) return existing.ownerId === user.id && existing.replacement
    ? jsonOk({ case: { id: caseId, status: existing.status } })
    : jsonError("Request ID already used. Start a new request.", 409);
  const hospital = await env.DB.prepare("SELECT h.id,h.name,h.city,h.owner_user_id AS ownerId FROM hospitals h JOIN users u ON u.id=h.owner_user_id WHERE h.id=? AND h.approval_status='approved' AND u.status='verified' AND u.account_status='active'").bind(d.hospitalId).first<{id: string; name: string; city: string; ownerId: string}>();
  if (!hospital) return jsonError("Choose an approved hospital.", 400);
  const recipients = await replacementRecipients(env.DB, user.id, hospital.city);
  try {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cases (id, hospital_id, posted_by_user_id, procedure_name, specialty, location, anaesthesia_type, scheduled_at, offered_fee_paise, urgency, duration_minutes, public_notes, bidding_enabled, status, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)").bind(caseId, hospital.id, user.id, d.procedureName, null, hospital.name, "Not specified", d.scheduledAt, d.offeredFeeRupees * 100, "urgent", d.durationMinutes, "[Replacement requested by anaesthetist]", 0),
    env.DB.prepare("INSERT OR IGNORE INTO case_private_details (id, case_id, patient_initials, patient_age, patient_sex, contact_phone, location_instructions, clinical_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(caseId, caseId, null, null, null, null, null, null),
    ...recipients.map(recipient => env.DB!.prepare("INSERT OR IGNORE INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key) VALUES(?,?,?,'case_open','Replacement anaesthetist required',?,?)")
      .bind(crypto.randomUUID(),recipient.id,caseId,`Replacement required: ${d.procedureName} at ${hospital.name}.`,`case_open:${caseId}:${recipient.id}`)),
    env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(id,notification_id,channel,status) SELECT 'in-app:'||id,id,'in_app','sent' FROM notifications WHERE case_id=? AND kind='case_open'").bind(caseId),
    env.DB.prepare("INSERT OR IGNORE INTO case_audit_events(id,case_id,actor_user_id,event_type,details) VALUES(?,?,?,'replacement_requested',?)").bind(caseId + ':replacement', caseId, user.id, JSON.stringify({hospitalId: hospital.id, offeredFeePaise: d.offeredFeeRupees * 100})),
    env.DB.prepare("INSERT OR IGNORE INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key) VALUES(?,?,?,'replacement_requested','Replacement requested at your hospital',?,?)").bind(caseId + ':hospital', hospital.ownerId, caseId, user.fullName + ' requested a replacement for ' + d.procedureName + '. Review responses in your case dashboard.', 'replacement_requested:' + caseId + ':hospital'),
  ]);
  } catch (cause) {
    // A concurrent retry must not create another case or alert batch.
    const saved = await env.DB.prepare("SELECT c.status FROM cases c WHERE c.id=? AND c.posted_by_user_id=? AND EXISTS(SELECT 1 FROM case_audit_events e WHERE e.case_id=c.id AND e.event_type='replacement_requested')").bind(caseId,user.id).first<{status: string}>();
    if (saved) return jsonOk({case:{id:caseId,status:saved.status}});
    throw cause;
  }
  waitUntil(sendWebPushForCase(caseId, "case_open"));
  return jsonOk({ case: { id: caseId, status: "open" } }, 201);
}
