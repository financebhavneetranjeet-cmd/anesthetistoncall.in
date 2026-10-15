import { publishAdminNotice } from "@/lib/server/web-push";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { validateAvailabilityRange } from "@/lib/availability-time";
import {
  getSessionUser,
  isVerifiedClinician,
  isApprovedHospital,
} from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
const slot = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(["available", "unavailable"]),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  preferredArea: z.string().trim().max(120).optional(),
});
export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const u = await getSessionUser();
  if (!u) return jsonError("Login required.", 401);
  if (!isVerifiedClinician(u) && !isApprovedHospital(u))
    return jsonError("Verified access required.", 403);
  await env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key) SELECT lower(hex(randomblob(16))),c.assigned_clinician_user_id,c.id,'booking_reminder','Upcoming case reminder',h.name||': '||c.procedure_name||' at '||c.scheduled_at,'booking_reminder:'||c.id||':'||CASE WHEN datetime(c.scheduled_at)<=datetime('now','+30 minutes') THEN 'near' WHEN datetime(c.scheduled_at)<=datetime('now','+2 hours') THEN '2h' ELSE '24h' END FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.is_planned=1 AND c.booking_status='confirmed' AND c.assigned_clinician_user_id IS NOT NULL AND datetime(c.scheduled_at)>CURRENT_TIMESTAMP AND datetime(c.scheduled_at)<=datetime('now','+24 hours')`).run();
  const reminders = await env.DB.prepare("SELECT case_id AS caseId,title,body,dedupe_key AS eventKey FROM notifications WHERE kind='booking_reminder' AND datetime(created_at)>datetime('now','-1 day')").all<{caseId:string;title:string;body:string;eventKey:string}>();
  await Promise.all(reminders.results.map(notice => publishAdminNotice({title:notice.title,body:notice.body,url:"/admin",tag:notice.eventKey},notice.eventKey,notice.caseId)));
  if (isVerifiedClinician(u) && u.role === "anesthetist") {
    const slots = await env.DB.prepare(
      "SELECT id,status,start_at AS startAt,end_at AS endAt,preferred_area AS preferredArea FROM availability_slots WHERE clinician_user_id=? AND datetime(end_at)>CURRENT_TIMESTAMP ORDER BY start_at",
    )
      .bind(u.id)
      .all();
    const bookings = await env.DB.prepare(
      `SELECT c.id,c.procedure_name AS procedureName,c.scheduled_at AS startAt,datetime(c.scheduled_at,'+'||(c.duration_minutes+c.booking_buffer_minutes)||' minutes') AS endAt,c.booking_status AS bookingStatus,c.status,c.final_agreed_fee_paise AS finalFeePaise,h.name AS hospitalName FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.assigned_clinician_user_id=? AND c.is_planned=1 AND c.status NOT IN('cancelled','completed') ORDER BY c.scheduled_at`,
    )
      .bind(u.id)
      .all();
    return jsonOk({
      slots: slots.results,
      bookings: bookings.results,
      role: u.role,
    });
  }
  const bookings = await env.DB.prepare(
    `SELECT c.id,c.procedure_name AS procedureName,c.scheduled_at AS startAt,c.duration_minutes AS durationMinutes,c.booking_status AS bookingStatus,c.status,c.final_agreed_fee_paise AS finalFeePaise,h.name AS hospitalName FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.is_planned=1 AND (c.hospital_id=? OR c.posted_by_user_id=?) ORDER BY c.scheduled_at`,
  )
    .bind(u.hospitalId,u.id)
    .all();
  return jsonOk({ slots: [], bookings: bookings.results, role: u.role });
}
export async function POST(req: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const u = await getSessionUser();
  if (!isVerifiedClinician(u) || u.role !== "anesthetist")
    return jsonError("Verified anaesthetist access required.", 403);
  const p = slot.safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError("Valid future time range required.");
  const rangeError = validateAvailabilityRange(p.data.startAt, p.data.endAt);
  if (rangeError) return jsonError(rangeError);
  const id = p.data.id ?? crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO availability_slots(id,clinician_user_id,status,start_at,end_at,preferred_area) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,start_at=excluded.start_at,end_at=excluded.end_at,preferred_area=excluded.preferred_area,updated_at=CURRENT_TIMESTAMP WHERE clinician_user_id=?",
  )
    .bind(
      id,
      u.id,
      p.data.status,
      p.data.startAt,
      p.data.endAt,
      p.data.preferredArea || "Amritsar",
      u.id,
    )
    .run();
  return jsonOk({ slot: { id } }, 201);
}
export async function DELETE(req: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const u = await getSessionUser();
  if (!isVerifiedClinician(u) || u.role !== "anesthetist")
    return jsonError("Verified anaesthetist access required.", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("Slot required.");
  await env.DB.prepare(
    "DELETE FROM availability_slots WHERE id=? AND clinician_user_id=?",
  )
    .bind(id, u.id)
    .run();
  return jsonOk({ deleted: true });
}
