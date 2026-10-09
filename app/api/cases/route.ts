import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isApprovedHospital, isVerifiedAnaesthetist, isVerifiedClinician } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { auditCase } from "@/lib/server/case-audit";
import { reliabilityFor } from "@/lib/server/ratings";
import { sendCasePostedSmsForCase } from "@/lib/server/case-posted-sms";
import { sendWebPushForCase } from "@/lib/server/web-push";

const caseSchema = z.object({
  requestId: z.string().uuid().optional(),
  procedureName: z.string().trim().min(3).max(160), specialty: z.string().trim().min(2).max(100), location: z.string().trim().min(2).max(200), anaesthesiaType: z.string().trim().max(60).optional(), scheduledAt: z.string().datetime(),
  offeredFeeRupees: z.number().int().positive().max(1_000_000), urgency: z.enum(["routine", "urgent", "emergency"]), durationMinutes: z.number().int().min(15).max(1440), biddingEnabled: z.boolean().default(false),
  publicNotes: z.string().trim().max(1000).optional(), patientInitials: z.string().trim().max(12).optional(), patientAge: z.number().int().min(0).max(120).optional(), patientSex: z.enum(["female", "male", "other"]).optional(),
  contactPhone: z.string().trim().max(20).optional(), locationInstructions: z.string().trim().max(300).optional(), clinicalNotes: z.string().trim().max(1000).optional(),
});

export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const user = await getSessionUser();
  const clinician = isVerifiedAnaesthetist(user);
  if (!isVerifiedClinician(user) && !isApprovedHospital(user)) return jsonError("Verified member access required.", 403, "VERIFIED_MEMBER_REQUIRED");
  const where = user.role === "hospital" ? "c.hospital_id = ?" : user.role === "surgeon" ? "c.posted_by_user_id = ?" : "(c.status = 'open' OR (c.status IN ('offered','assigned','completed') AND c.assigned_clinician_user_id = ?))";
  const query = `SELECT c.id,c.procedure_name AS procedureName,c.specialty,c.location,c.anaesthesia_type AS anaesthesiaType,c.scheduled_at AS scheduledAt,c.offered_fee_paise AS offeredFeePaise,c.final_agreed_fee_paise AS finalAgreedFeePaise,c.fee_locked_at AS feeLockedAt,c.ot_status AS otStatus,c.arrived_at AS arrivedAt,c.ot_ready_at AS otReadyAt,c.case_started_at AS caseStartedAt,c.case_completed_at AS caseCompletedAt,c.actual_duration_minutes AS actualDurationMinutes,c.status,c.urgency,c.duration_minutes AS durationMinutes,c.public_notes AS publicNotes,c.bidding_enabled AS biddingEnabled,c.assigned_clinician_user_id AS assignedClinicianUserId,au.full_name AS assignedClinicianName,h.name AS hospitalName,h.owner_user_id AS hospitalUserId,(SELECT COUNT(*) FROM case_responses r WHERE r.case_id=c.id AND r.status='available') AS responseCount,(SELECT r.status FROM case_responses r WHERE r.case_id=c.id AND r.clinician_user_id=? LIMIT 1) AS currentResponseStatus,(SELECT r.proposed_fee_paise FROM case_responses r WHERE r.case_id=c.id AND r.clinician_user_id=? LIMIT 1) AS currentProposedFeePaise FROM cases c JOIN hospitals h ON h.id=c.hospital_id LEFT JOIN users au ON au.id=c.assigned_clinician_user_id WHERE ${where} ORDER BY c.scheduled_at ASC`;
  const result = await env.DB.prepare(query).bind(user.id, user.id, user.role === "hospital" ? user.hospitalId : user.id).all();
  const rows=result.results as any[];const enriched=clinician?await Promise.all(rows.map(async row=>({...row,hospitalReliability:await reliabilityFor(row.hospitalUserId)}))):rows;
  return jsonOk({ cases: enriched });
}

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const user = await getSessionUser();
  if (!user) return jsonError("Please login to post a case.", 401, "LOGIN_REQUIRED");
  if (!isApprovedHospital(user)) return jsonError("Only approved hospitals can post cases.", 403, "HOSPITAL_APPROVAL_REQUIRED");
  const parsed = caseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid case details.");
  if (new Date(parsed.data.scheduledAt).getTime() <= Date.now()) return jsonError("Scheduled time must be in the future.");
  const caseId = parsed.data.requestId ?? crypto.randomUUID(); const d = parsed.data;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO cases (id, hospital_id, posted_by_user_id, procedure_name, specialty, location, anaesthesia_type, scheduled_at, offered_fee_paise, urgency, duration_minutes, public_notes, bidding_enabled, status, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)").bind(caseId, user.hospitalId, user.id, d.procedureName, d.specialty, d.location, d.anaesthesiaType || "Not specified", d.scheduledAt, d.offeredFeeRupees * 100, d.urgency, d.durationMinutes, d.publicNotes ?? null, d.biddingEnabled ? 1 : 0),
    env.DB.prepare("INSERT OR IGNORE INTO case_private_details (id, case_id, patient_initials, patient_age, patient_sex, contact_phone, location_instructions, clinical_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(caseId, caseId, d.patientInitials ?? null, d.patientAge ?? null, d.patientSex ?? null, d.contactPhone ?? null, d.locationInstructions ?? null, d.clinicalNotes ?? null),
    env.DB.prepare(`INSERT OR IGNORE INTO notifications (id,user_id,case_id,kind,title,body,dedupe_key)
      SELECT lower(hex(randomblob(16))),u.id,?,'case_open',CASE WHEN ? IN ('urgent','emergency') THEN 'Urgent anaesthesia case' ELSE 'New open case' END,?,'case_open:'||?||':'||u.id
      FROM users u JOIN clinician_profiles cp ON cp.user_id=u.id
      WHERE u.role='anesthetist' AND u.status='verified' AND COALESCE(u.account_status,'active')='active'
      AND cp.verification_status='verified' AND cp.case_notifications_enabled=1
      AND cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP
      AND lower(cp.city)=lower((SELECT city FROM hospitals WHERE id=?))`).bind(caseId, d.urgency, `${d.procedureName} at ${d.location} is open for responses.`, caseId, user.hospitalId),
    env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(id,notification_id,channel,status) SELECT 'in-app:'||id,id,'in_app','sent' FROM notifications WHERE case_id=? AND kind='case_open'").bind(caseId),
    env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(id,notification_id,channel,status,error_code) SELECT 'sms:'||id,id,'sms','skipped','SMS_PENDING' FROM notifications WHERE case_id=? AND kind='case_open'").bind(caseId),
  ]);
  await auditCase(caseId,user.id,"case_posted",{postedFeePaise:d.offeredFeeRupees*100,estimatedDurationMinutes:d.durationMinutes,biddingEnabled:d.biddingEnabled});
  waitUntil(sendCasePostedSmsForCase(caseId));
  waitUntil(sendWebPushForCase(caseId, "case_open"));
  return jsonOk({ case: { id: caseId, status: "open" } }, 201);
}
