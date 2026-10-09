import { env } from "cloudflare:workers";
import {
  getSessionUser,
  isApprovedHospital,
  isVerifiedClinician,
} from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { canManageEmergency } from "@/lib/server/emergency";
import { scoreMatch } from "@/lib/server/performance";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const u = await getSessionUser();
  if (!u) return jsonError("Login required.", 401);
  const { id } = await params;
  const c = await env.DB.prepare(
    `SELECT c.id,c.hospital_id AS hospitalId,c.posted_by_user_id AS postedByUserId,c.procedure_name AS procedureName,c.urgency,c.required_arrival_at AS requiredArrivalAt,c.offered_fee_paise AS offeredFeePaise,c.duration_minutes AS durationMinutes,c.status,c.sos_status AS sosStatus,c.sos_offer_version AS offerVersion,c.sos_search_radius_km AS searchRadiusKm,c.created_at AS createdAt,h.name AS hospitalName,h.address FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id=? AND c.is_emergency=1`,
  )
    .bind(id)
    .first<any>();
  if (!c) return jsonError("SOS case not found.", 404);
  const manager =
    (isApprovedHospital(u) ||
      (isVerifiedClinician(u) && u.role === "surgeon")) &&
    (await canManageEmergency(u, c));
  if (!manager && u.role !== "anesthetist")
    return jsonError("Access denied.", 403);
  const rs = manager
    ? await env.DB.prepare(
        `SELECT r.id,r.clinician_user_id AS clinicianId,r.response_type AS responseType,r.proposed_fee_paise AS proposedFeePaise,r.status,r.distance_metres AS distanceMetres,r.eta_minutes AS etaMinutes,r.updated_at AS updatedAt,u.full_name AS clinicianName,cp.qualification FROM case_responses r JOIN users u ON u.id=r.clinician_user_id JOIN clinician_profiles cp ON cp.user_id=u.id WHERE r.case_id=? ORDER BY CASE r.response_type WHEN 'accept_offer' THEN 0 WHEN 'bid' THEN 1 ELSE 2 END,r.eta_minutes`,
      )
        .bind(id)
        .all()
    : { results: [] };
  const responses=manager?await Promise.all((rs.results as any[]).map(async r=>({...r,match:await scoreMatch({clinicianId:r.clinicianId,isEmergency:true,available:r.status==="available",etaMinutes:r.etaMinutes??null,offeredFeePaise:c.offeredFeePaise,bidFeePaise:r.proposedFeePaise})}))):[];return jsonOk({case:c,responses,canManage:manager});
}
