import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser,isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError,jsonOk } from "@/lib/server/http";
import { haversineMetres,roughEtaMinutes } from "@/lib/server/emergency";
import { notifyUser } from "@/lib/server/notifications";
import { auditCase } from "@/lib/server/case-audit";

const schema = z.object({
  action: z.enum(["accept_offer", "bid", "decline"]),
  feeRupees: z.number().int().positive().max(1_000_000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

type Search = {
  offerVersion: number;
  offeredFeePaise: number;
  latitude: string | null;
  longitude: string | null;
  ownerId: string;
  ownerMobile: string;
  postedByUserId: string | null;
};

const acceptingResponses = `c.id=? AND c.is_emergency=1 AND c.status='open'
  AND c.sos_status='searching'
  AND (c.required_arrival_at IS NULL OR julianday(c.required_arrival_at)>julianday('now'))`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = env.DB;
  if (!db) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid SOS response.");
  const { action, feeRupees, latitude, longitude } = parsed.data;
  if (action === "bid" && feeRupees === undefined) {
    return jsonError("Enter your additional bid above the hospital fee.");
  }

  const { id } = await params;
  const search = await db.prepare(`SELECT c.sos_offer_version AS offerVersion,
      c.offered_fee_paise AS offeredFeePaise, h.latitude, h.longitude,
      h.owner_user_id AS ownerId, u.mobile AS ownerMobile, c.posted_by_user_id AS postedByUserId
    FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users u ON u.id=h.owner_user_id
    WHERE ${acceptingResponses}`).bind(id).first<Search>();
  if (!search) return jsonError("This SOS is no longer accepting responses.", 409);

  let distance: number | null = null;
  let eta: number | null = null;
  if (latitude != null && longitude != null && search.latitude != null && search.longitude != null) {
    distance = haversineMetres(latitude, longitude, Number(search.latitude), Number(search.longitude));
    eta = roughEtaMinutes(distance);
  }

  const proposed = action === "decline" ? null : search.offeredFeePaise + (action === "bid" ? (feeRupees ?? 0) * 100 : 0);
  const status = action === "decline" ? "declined" : "available";
  // Recheck state and offer version in the write to handle a concurrent close or revised offer.
  const saved = await db.prepare(`INSERT INTO case_responses
    (id,case_id,clinician_user_id,proposed_fee_paise,status,response_type,offer_version,distance_metres,eta_minutes,location_captured_at)
    SELECT ?,?,?,?,?,?,?,?,?,CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
    FROM cases c WHERE ${acceptingResponses} AND c.sos_offer_version=?
    ON CONFLICT(case_id,clinician_user_id) DO UPDATE SET
      proposed_fee_paise=excluded.proposed_fee_paise,status=excluded.status,response_type=excluded.response_type,
      offer_version=excluded.offer_version,distance_metres=excluded.distance_metres,eta_minutes=excluded.eta_minutes,
      location_captured_at=excluded.location_captured_at,updated_at=CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(), id, user.id, proposed, status, action, search.offerVersion, distance, eta, distance, id, search.offerVersion)
    .run();
  if (!saved.meta.changes) return jsonError("This SOS is no longer accepting responses to that offer.", 409);

  const target = search.postedByUserId ?? search.ownerId;
  const description = action === "decline" ? "declined" : proposed !== null && action === "bid"
    ? `requested an extra ₹${feeRupees?.toLocaleString("en-IN")} (total ₹${(proposed / 100).toLocaleString("en-IN")})`
    : "accepted the offered fee";
  await notifyUser({
    userId: target,
    caseId: id,
    kind: "sos_response",
    title: "SOS response received",
    body: `${user.fullName} ${description}${eta ? ` · ETA about ${eta} min` : ""}.`,
    dedupeKey: `sos_response:${id}:${user.id}:${search.offerVersion}:${action}:${proposed ?? 0}`,
    mobile: target === search.ownerId ? search.ownerMobile : null,
  });
  await auditCase(id, user.id, "sos_response", {
    responseType: action, offerVersion: search.offerVersion, proposedFeePaise: proposed,
    distanceMetres: distance, etaMinutes: eta,
  });
  return jsonOk({ response: { status, responseType: action, distanceMetres: distance, etaMinutes: eta } });
}
