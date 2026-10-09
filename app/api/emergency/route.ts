import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  getSessionUser,
  isApprovedHospital,
  isVerifiedClinician,
  isVerifiedAnaesthetist,
} from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { alertEligibleAnaesthetists, expandExpiredSearches } from "@/lib/server/emergency";
import { auditCase } from "@/lib/server/case-audit";

const schema = z.object({
  hospitalId: z.string().uuid().optional(),
  procedureName: z.string().trim().min(3).max(160),
  urgency: z.enum(["urgent", "emergency"]),
  requiredArrivalAt: z.string().datetime(),
  offeredFeeRupees: z.number().int().positive().max(1_000_000),
  durationMinutes: z.number().int().min(15).max(1440),
  specialty: z.string().trim().max(100).optional(),
  anaesthesiaType: z.string().trim().max(60).optional(),
  publicNotes: z.string().trim().max(500).optional(),
});
export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const u = await getSessionUser();
  if (!u) return jsonError("Login required.", 401);
  await expandExpiredSearches();
  if (isVerifiedAnaesthetist(u)) {
    const cs = await env.DB.prepare(
      `SELECT c.id,c.procedure_name AS procedureName,c.urgency,c.required_arrival_at AS requiredArrivalAt,c.offered_fee_paise AS offeredFeePaise,c.duration_minutes AS durationMinutes,c.status,c.sos_status AS sosStatus,c.sos_offer_version AS offerVersion,c.created_at AS createdAt,h.name AS hospitalName,h.address,r.response_type AS currentResponseType,r.proposed_fee_paise AS currentBidPaise,r.eta_minutes AS currentEtaMinutes FROM cases c JOIN hospitals h ON h.id=c.hospital_id LEFT JOIN case_responses r ON r.case_id=c.id AND r.clinician_user_id=? WHERE c.is_emergency=1 AND (c.status='open' OR c.assigned_clinician_user_id=?) ORDER BY c.created_at DESC`,
    )
      .bind(u.id, u.id)
      .all();
    return jsonOk({ cases: cs.results, role: u.role });
  }
  if (
    !isApprovedHospital(u) &&
    !(isVerifiedClinician(u) && u.role === "surgeon")
  )
    return jsonError(
      "Approved hospital or verified surgeon access required.",
      403,
    );
  const hs = await env.DB.prepare(
    "SELECT id,name,address,latitude,longitude,google_place_id AS googlePlaceId FROM hospitals WHERE approval_status='approved' AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY name",
  ).all();
  const cs = await env.DB.prepare(
    `SELECT c.id,c.procedure_name AS procedureName,c.urgency,c.required_arrival_at AS requiredArrivalAt,c.offered_fee_paise AS offeredFeePaise,c.duration_minutes AS durationMinutes,c.status,c.sos_status AS sosStatus,c.sos_offer_version AS offerVersion,c.sos_search_radius_km AS searchRadiusKm,c.created_at AS createdAt,h.name AS hospitalName FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.is_emergency=1 AND (c.hospital_id=? OR c.posted_by_user_id=?) ORDER BY c.created_at DESC`,
  )
    .bind(u.hospitalId, u.id)
    .all();
  return jsonOk({
    hospitals: hs.results,
    defaultHospitalId: u.hospitalId,
    cases: cs.results,
    role: u.role,
  });
}
export async function POST(req: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const u = await getSessionUser();
  if (!u) return jsonError("Login required.", 401);
  const allowed =
    isApprovedHospital(u) || (isVerifiedClinician(u) && u.role === "surgeon");
  if (!allowed)
    return jsonError(
      "Approved hospital or verified surgeon access required.",
      403,
    );
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return jsonError(p.error.issues[0]?.message ?? "Invalid SOS details.");
  const d = p.data,
    hospitalId = u.role === "hospital" ? u.hospitalId : d.hospitalId;
  if (!hospitalId) return jsonError("Select a verified hospital.");
  const h = await env.DB.prepare(
    "SELECT id,name,address,latitude,longitude FROM hospitals WHERE id=? AND approval_status='approved' AND latitude IS NOT NULL AND longitude IS NOT NULL",
  )
    .bind(hospitalId)
    .first<{ id: string; name: string; address: string }>();
  if (!h)
    return jsonError(
      "A verified hospital location is required.",
      409,
      "LOCATION_REQUIRED",
    );
  const arrival = new Date(d.requiredArrivalAt);
  if (arrival.getTime() <= Date.now())
    return jsonError("Required arrival time must be in the future.");
  const id = crypto.randomUUID(),
    expires = new Date(Date.now() + 5 * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO cases (id,hospital_id,posted_by_user_id,procedure_name,specialty,location,anaesthesia_type,scheduled_at,required_arrival_at,offered_fee_paise,urgency,duration_minutes,public_notes,bidding_enabled,status,approved_at,is_emergency,sos_status,sos_offer_version,sos_search_radius_km,sos_expires_at,sos_last_alerted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'open',CURRENT_TIMESTAMP,1,'searching',1,15,?,CURRENT_TIMESTAMP)`,
    ).bind(
      id,
      hospitalId,
      u.id,
      d.procedureName,
      d.specialty ?? null,
      h.name,
      d.anaesthesiaType ?? "Not specified",
      d.requiredArrivalAt,
      d.requiredArrivalAt,
      d.offeredFeeRupees * 100,
      d.urgency,
      d.durationMinutes,
      d.publicNotes ?? null,
      expires,
    ),
    env.DB.prepare(
      "INSERT INTO case_private_details (id,case_id) VALUES (?,?)",
    ).bind(crypto.randomUUID(), id),
  ]);
  await alertEligibleAnaesthetists(
    id,
    1,
    `${h.name}: ${d.procedureName}. Arrival needed ${arrival.toLocaleString("en-IN")}. Offer ₹${d.offeredFeeRupees.toLocaleString("en-IN")}.`,
  );
  await auditCase(id, u.id, "sos_posted", {
    originalOfferedFeePaise: d.offeredFeeRupees * 100,
    requiredArrivalAt: d.requiredArrivalAt,
    estimatedDurationMinutes: d.durationMinutes,
    hospitalId,
  });
  return jsonOk({ case: { id, status: "open", sosStatus: "searching" } }, 201);
}
