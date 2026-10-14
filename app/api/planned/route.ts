import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isApprovedHospital, isVerifiedClinician } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { auditCase } from "@/lib/server/case-audit";
import { sendWebPushForCase } from "@/lib/server/web-push";

const schema = z.object({ hospitalId: z.string().uuid().optional(), procedureName: z.string().trim().min(3), specialty: z.string().trim().optional(), scheduledAt: z.string().datetime(), durationMinutes: z.number().int().min(15), offeredFeeRupees: z.number().int().positive(), anaesthesiaType: z.string().trim().optional(), notes: z.string().trim().max(1000).optional() });

export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!user) return jsonError("Login required.", 401);
  if (!isApprovedHospital(user) && !(isVerifiedClinician(user) && user.role === "surgeon")) return jsonError("Authorized poster required.", 403);
  const hospitals = await env.DB.prepare("SELECT id,name,address FROM hospitals WHERE approval_status='approved' ORDER BY name").all();
  return jsonOk({ hospitals: hospitals.results, defaultHospitalId: user.hospitalId });
}

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!user || (!isApprovedHospital(user) && !(isVerifiedClinician(user) && user.role === "surgeon"))) return jsonError("Authorized poster required.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid booking.");
  const data = parsed.data;
  const hospitalId = user.role === "hospital" ? user.hospitalId : data.hospitalId;
  if (!hospitalId) return jsonError("Select hospital.");
  const hospital = await env.DB.prepare("SELECT id,name FROM hospitals WHERE id=? AND approval_status='approved'").bind(hospitalId).first<{ id: string; name: string }>();
  if (!hospital) return jsonError("Approved hospital required.");
  if (new Date(data.scheduledAt) <= new Date()) return jsonError("Choose a future reporting time.");
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cases(id,hospital_id,posted_by_user_id,procedure_name,specialty,location,anaesthesia_type,scheduled_at,offered_fee_paise,duration_minutes,public_notes,bidding_enabled,status,approved_at,is_planned,booking_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,'open',CURRENT_TIMESTAMP,1,'requested')").bind(id, hospitalId, user.id, data.procedureName, data.specialty || null, hospital.name, data.anaesthesiaType ?? "Not specified", data.scheduledAt, data.offeredFeeRupees * 100, data.durationMinutes, data.notes ?? null),
    env.DB.prepare("INSERT INTO case_private_details(id,case_id) VALUES(?,?)").bind(crypto.randomUUID(), id),
    env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key)
      SELECT lower(hex(randomblob(16))),u.id,?,'planned_case','New advance case',?,'planned:'||?||':'||u.id
      FROM users u JOIN clinician_profiles cp ON cp.user_id=u.id
      WHERE u.role='anesthetist' AND u.status='verified' AND COALESCE(u.account_status,'active')='active'
      AND cp.verification_status='verified' AND cp.case_notifications_enabled=1
      AND cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP
      AND EXISTS(SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id AND a.status IN('available','tentative') AND datetime(a.start_at)<=datetime(?) AND datetime(a.end_at)>=datetime(?,'+'||?||' minutes'))
      AND NOT EXISTS(SELECT 1 FROM cases x WHERE x.assigned_clinician_user_id=u.id AND x.booking_status='confirmed' AND datetime(x.scheduled_at)<datetime(?,'+'||(?+30)||' minutes') AND datetime(x.scheduled_at,'+'||(x.duration_minutes+x.booking_buffer_minutes)||' minutes')>datetime(?))`)
      .bind(id, `${hospital.name}: ${data.procedureName} on ${new Date(data.scheduledAt).toLocaleString("en-IN")}. Offer ₹${data.offeredFeeRupees}.`, id, data.scheduledAt, data.scheduledAt, data.durationMinutes, data.scheduledAt, data.durationMinutes, data.scheduledAt),
  ]);
  await auditCase(id, user.id, "advance_case_posted", { offeredFeePaise: data.offeredFeeRupees * 100, estimatedDurationMinutes: data.durationMinutes });
  await sendWebPushForCase(id, "planned_case");
  return jsonOk({ case: { id } }, 201);
}
