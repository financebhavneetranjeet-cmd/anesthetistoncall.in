import { env, waitUntil } from "cloudflare:workers";
import { sendWebPushForCase } from "@/lib/server/web-push";
import type { SessionUser } from "@/lib/server/session";

export function haversineMetres(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const r = 6371000,
    toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat),
    dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(x)));
}
export function roughEtaMinutes(distanceMetres: number) {
  return Math.max(3, Math.ceil((distanceMetres / 1000 / 22) * 60));
}
export async function canManageEmergency(
  user: SessionUser,
  row: { hospitalId: string; postedByUserId: string | null },
) {
  return user.role === "hospital"
    ? user.hospitalId === row.hospitalId
    : user.role === "surgeon" && row.postedByUserId === user.id;
}
export async function alertEligibleAnaesthetists(
  caseId: string,
  offerVersion: number,
  body: string,
) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notifications (id,user_id,case_id,kind,title,body,dedupe_key)
 SELECT lower(hex(randomblob(16))),u.id,?,'sos_alert','🚨 Emergency / SOS Case',?,'sos:'||?||':'||?||':'||u.id
 FROM users u JOIN clinician_profiles cp ON cp.user_id=u.id JOIN cases c ON c.id=? JOIN hospitals h ON h.id=c.hospital_id
 WHERE u.role='anesthetist' AND u.status='verified' AND COALESCE(u.account_status,'active')='active' AND cp.verification_status='verified' AND (EXISTS (SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id AND a.status='available' AND datetime(a.start_at)<=CURRENT_TIMESTAMP AND datetime(a.end_at)>CURRENT_TIMESTAMP)
      OR (cp.case_notifications_enabled=1 AND cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP
        AND NOT EXISTS (SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id)))
 AND (cp.availability_latitude IS NULL OR (ABS(CAST(cp.availability_latitude AS REAL)-CAST(h.latitude AS REAL)) <= c.sos_search_radius_km/111.0 AND ABS(CAST(cp.availability_longitude AS REAL)-CAST(h.longitude AS REAL)) <= c.sos_search_radius_km/95.0))`,
  )
    .bind(caseId, body, caseId, offerVersion, caseId)
    .run();
  waitUntil(sendWebPushForCase(caseId, "sos_alert", `sos:${caseId}:${offerVersion}:`));
}

export async function expandExpiredSearches() {
  if (!env.DB) return;
  const expired = await env.DB.prepare(`SELECT c.id,c.sos_offer_version AS offerVersion,c.sos_search_radius_km AS radius,c.procedure_name AS procedureName,h.name AS hospitalName FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.is_emergency=1 AND c.status='open' AND c.sos_status='searching' AND datetime(c.sos_expires_at)<=CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM case_responses r WHERE r.case_id=c.id AND r.status='available') LIMIT 20`).all<any>();
  for (const c of expired.results) {
    const changed = await env.DB.prepare("UPDATE cases SET sos_offer_version=sos_offer_version+1,sos_search_radius_km=MIN(100,sos_search_radius_km+15),sos_expires_at=datetime('now','+5 minutes'),sos_last_alerted_at=CURRENT_TIMESTAMP WHERE id=? AND sos_offer_version=? AND status='open'").bind(c.id,c.offerVersion).run();
    if (changed.meta.changes) await alertEligibleAnaesthetists(c.id,c.offerVersion+1,`${c.hospitalName}: ${c.procedureName}. SOS search expanded to ${Math.min(100,c.radius+15)} km.`);
  }
}
