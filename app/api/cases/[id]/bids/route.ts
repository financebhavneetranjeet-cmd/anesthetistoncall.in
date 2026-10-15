import { feeBreakdown } from "@/lib/fee-breakdown.mjs";
import { getCurrentAnaesthetistAvailability } from "@/lib/server/emergency-availability-service";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  getSessionUser,
  isApprovedHospital,
  isVerifiedAnaesthetist,
  isVerifiedClinician,
} from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { auditCase } from "@/lib/server/case-audit";
import { scoreMatch } from "@/lib/server/performance";
import { reliabilityFor } from "@/lib/server/ratings";
import { distanceBetween, getTrafficRoute } from "@/lib/server/google-routes";
const bidSchema = z.object({
  proposedFeeRupees: z.number().int().positive().max(1_000_000).optional(),
  message: z.string().trim().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).refine((value) => (value.latitude == null) === (value.longitude == null), {
  message: "Share both latitude and longitude, or neither.",
});
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!user || (!isApprovedHospital(user) && !(isVerifiedClinician(user)&&user.role==="surgeon"))) return jsonError("Authorized case poster access required.",403);
  const { id } = await params;
  const owns = await env.DB.prepare(
    "SELECT c.id,c.hospital_id AS hospitalId,c.posted_by_user_id AS postedByUserId,c.is_emergency AS isEmergency,c.offered_fee_paise AS offeredFeePaise,h.owner_user_id AS hospitalOwnerUserId,h.name AS hospitalName,h.latitude AS hospitalLatitude,h.longitude AS hospitalLongitude FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id = ? AND (c.hospital_id = ? OR c.posted_by_user_id=?)",
  )
    .bind(id, user.hospitalId,user.id)
    .first<any>();
  if (!owns) return jsonError("Case not found.", 404);
  const canViewResponderMap = user.role === "hospital" && owns.hospitalId === user.hospitalId && owns.hospitalOwnerUserId === user.id;
  const result = await env.DB.prepare(
    "SELECT r.id,r.clinician_user_id AS clinicianId,r.proposed_fee_paise AS proposedFeePaise,r.response_type AS responseType,r.message,r.status,strftime('%Y-%m-%dT%H:%M:%SZ',r.created_at) AS createdAt,r.distance_metres AS distanceMetres,r.eta_minutes AS etaMinutes,u.full_name AS clinicianName,u.role,cp.qualification,cp.verification_status AS verificationStatus,CASE WHEN ?=1 AND r.status='available' THEN r.response_latitude ELSE NULL END AS latitude,CASE WHEN ?=1 AND r.status='available' THEN r.response_longitude ELSE NULL END AS longitude FROM case_responses r JOIN users u ON u.id=r.clinician_user_id JOIN clinician_profiles cp ON cp.user_id=u.id WHERE r.case_id=? ORDER BY r.created_at ASC",
  )
    .bind(canViewResponderMap ? 1 : 0, canViewResponderMap ? 1 : 0, id)
    .all();
  const bids=await Promise.all((result.results as any[]).map(async r=>({...r,...feeBreakdown(owns.offeredFeePaise,r.proposedFeePaise,r.responseType),match:await scoreMatch({clinicianId:r.clinicianId,isEmergency:Boolean(owns.isEmergency),available:r.status==="available",etaMinutes:r.etaMinutes??null,offeredFeePaise:owns.offeredFeePaise,bidFeePaise:feeBreakdown(owns.offeredFeePaise,r.proposedFeePaise,r.responseType).totalFeePaise}),reliability:await reliabilityFor(r.clinicianId)})));
  const hospitalLatitude=Number(owns.hospitalLatitude),hospitalLongitude=Number(owns.hospitalLongitude);
  const map=canViewResponderMap&&Number.isFinite(hospitalLatitude)&&Number.isFinite(hospitalLongitude)?{hospital:{name:owns.hospitalName,latitude:hospitalLatitude,longitude:hospitalLongitude}}:null;
  return jsonOk({bids,map});
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user))
    return jsonError("Verified anaesthetist access required.", 403);
  const availability = await getCurrentAnaesthetistAvailability(user.id);
  if (!availability) return jsonError("Your saved availability is not active now. Open Show Your Availability and save a period covering the current time.", 409, "AVAILABILITY_REQUIRED");
  const parsed = bidSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid bid.");
  const { id } = await params;
  const open = await env.DB.prepare(
    "SELECT c.id,c.hospital_id AS hospitalId,c.bidding_enabled AS biddingEnabled,c.offered_fee_paise AS offeredFeePaise,h.latitude AS hospitalLatitude,h.longitude AS hospitalLongitude FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id = ? AND c.status = 'open'",
  )
    .bind(id)
    .first<{ id: string; hospitalId: string; biddingEnabled: number; offeredFeePaise: number; hospitalLatitude:string|null; hospitalLongitude:string|null }>();
  if (!open) return jsonError("This case is not open for responses.", 409);
  if (parsed.data.proposedFeeRupees && !open.biddingEnabled)
    return jsonError(
      "Fee bidding is not enabled for this case.",
      409,
      "BIDDING_DISABLED",
    );
  const hospitalLatitude=Number(open.hospitalLatitude),hospitalLongitude=Number(open.hospitalLongitude);
  const hasLocation=parsed.data.latitude!=null&&parsed.data.longitude!=null;
  let distanceMetres:number|null=null,etaMinutes:number|null=null;
  if(hasLocation&&Number.isFinite(hospitalLatitude)&&Number.isFinite(hospitalLongitude)){
    const origin={latitude:parsed.data.latitude!,longitude:parsed.data.longitude!},destination={latitude:hospitalLatitude,longitude:hospitalLongitude};
    distanceMetres=Math.round(distanceBetween(origin,destination));
    const route=await getTrafficRoute(origin,destination).catch(()=>null);
    if(route){distanceMetres=route.distanceMetres||distanceMetres;etaMinutes=Math.max(1,Math.round(route.durationSeconds/60));}
  }
  await env.DB.prepare(
    "INSERT INTO case_responses (id, case_id, clinician_user_id, proposed_fee_paise, message, status, distance_metres, eta_minutes, response_latitude, response_longitude, location_captured_at) VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END) ON CONFLICT(case_id, clinician_user_id) DO UPDATE SET proposed_fee_paise = COALESCE(excluded.proposed_fee_paise, case_responses.proposed_fee_paise), message = excluded.message, response_type = CASE WHEN excluded.proposed_fee_paise IS NOT NULL THEN NULL ELSE case_responses.response_type END, status = 'available', distance_metres=COALESCE(excluded.distance_metres,case_responses.distance_metres),eta_minutes=COALESCE(excluded.eta_minutes,case_responses.eta_minutes),response_latitude=COALESCE(excluded.response_latitude,case_responses.response_latitude),response_longitude=COALESCE(excluded.response_longitude,case_responses.response_longitude),location_captured_at=COALESCE(excluded.location_captured_at,case_responses.location_captured_at),updated_at = CURRENT_TIMESTAMP",
  )
    .bind(
      crypto.randomUUID(),
      id,
      user.id,
      parsed.data.proposedFeeRupees
        ? parsed.data.proposedFeeRupees * 100
        : null,
      parsed.data.message ?? null,
      distanceMetres,
      etaMinutes,
      hasLocation?String(parsed.data.latitude):null,
      hasLocation?String(parsed.data.longitude):null,
      hasLocation?String(parsed.data.latitude):null,
    )
    .run();
  const owner = await env.DB.prepare(
    "SELECT h.owner_user_id AS id,u.mobile FROM hospitals h JOIN users u ON u.id=h.owner_user_id WHERE h.id = ?",
  )
    .bind(open.hospitalId)
    .first<{ id: string; mobile: string }>();
  if (owner)
    await notifyUser({
      userId: owner.id,
      caseId: id,
      kind: "case_response",
      title: "Anaesthetist available",
      body: parsed.data.proposedFeeRupees
        ? `${user.fullName} is available. Hospital fee ₹${open.offeredFeePaise / 100} + extra bid ₹${parsed.data.proposedFeeRupees} = total ₹${open.offeredFeePaise / 100 + parsed.data.proposedFeeRupees}.`
        : `${user.fullName} is available for this case.`,
      dedupeKey: `response:${id}:${user.id}:${parsed.data.proposedFeeRupees ?? "available"}:${parsed.data.message ?? ""}`,
      mobile: owner.mobile,
    });
  await auditCase(id, user.id, "bid_submitted", {
    proposedFeePaise: parsed.data.proposedFeeRupees
      ? parsed.data.proposedFeeRupees * 100
      : null,
    locationShared: hasLocation,
  });
  return jsonOk(
    {
      response: {
        caseId: id,
        status: "available",
        proposedFeeRupees: parsed.data.proposedFeeRupees ?? null,
      },
    },
    201,
  );
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user))
    return jsonError("Verified anaesthetist access required.", 403);
  const { id } = await params;
  const row = await env.DB.prepare(
    "SELECT h.owner_user_id AS ownerId,ou.mobile FROM case_responses r JOIN cases c ON c.id=r.case_id JOIN hospitals h ON h.id=c.hospital_id JOIN users ou ON ou.id=h.owner_user_id WHERE r.case_id=? AND r.clinician_user_id=? AND r.status='available' AND c.status='open'",
  )
    .bind(id, user.id)
    .first<{ ownerId: string; mobile: string }>();
  if (!row) return jsonError("Active bid not found.", 404);
  await env.DB.prepare(
    "UPDATE case_responses SET status='withdrawn',updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND clinician_user_id=? AND status='available'",
  )
    .bind(id, user.id)
    .run();
  await notifyUser({
    userId: row.ownerId,
    caseId: id,
    kind: "bid_withdrawn",
    title: "Bid withdrawn",
    body: `${user.fullName} withdrew their fee proposal.`,
    dedupeKey: `bid_withdrawn:${id}:${user.id}`,
    mobile: row.mobile,
  });
  return jsonOk({ bid: { caseId: id, status: "withdrawn" } });
}
