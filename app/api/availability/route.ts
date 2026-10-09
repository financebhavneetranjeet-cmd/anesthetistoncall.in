import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

const schema = z.object({ availableUntil: z.string().datetime(), latitude:z.number().min(-90).max(90).optional(), longitude:z.number().min(-180).max(180).optional(), preferredEmergencyFeeRupees:z.number().int().positive().max(1_000_000).optional() });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Clinician login required.", 401, "LOGIN_REQUIRED");
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access is required before viewing availability.", 403, "VERIFICATION_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const row = await env.DB.prepare("SELECT availability_status AS status, available_until AS availableUntil, case_notifications_enabled AS notificationsEnabled, preferred_emergency_fee_paise AS preferredEmergencyFeePaise, availability_latitude IS NOT NULL AND availability_longitude IS NOT NULL AS locationShared FROM clinician_profiles WHERE id=? LIMIT 1").bind(user.clinicianId).first<{ status: string; availableUntil: string | null; notificationsEnabled: number; preferredEmergencyFeePaise: number | null; locationShared: number }>();
  const active = Boolean(row?.status === "available" && row.availableUntil && new Date(row.availableUntil).getTime() > Date.now());
  if (row?.status === "available" && !active) {
    await env.DB.prepare("UPDATE clinician_profiles SET availability_status='unavailable',case_notifications_enabled=0,available_until=NULL,availability_latitude=NULL,availability_longitude=NULL,availability_location_at=NULL WHERE id=? AND availability_status='available' AND (available_until IS NULL OR datetime(available_until)<=CURRENT_TIMESTAMP)").bind(user.clinicianId).run();
  }
  return jsonOk({ availability: { status: active ? "available" : "unavailable", availableUntil: active ? row?.availableUntil ?? null : null, notificationsEnabled: active && Boolean(row?.notificationsEnabled), preferredEmergencyFeeRupees: active && row?.preferredEmergencyFeePaise ? Math.round(row.preferredEmergencyFeePaise / 100) : null, locationShared: active && Boolean(row?.locationShared) } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Clinician login required.", 401, "LOGIN_REQUIRED");
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access is required before publishing availability.", 403, "VERIFICATION_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Choose a valid expiry time.");
  const until = new Date(parsed.data.availableUntil); if (until.getTime() <= Date.now() || until.getTime() > Date.now() + 24 * 60 * 60_000) return jsonError("Availability must expire within the next 24 hours.");
  await env.DB.prepare("UPDATE clinician_profiles SET availability_status='available',case_notifications_enabled=1,available_until=?,availability_latitude=?,availability_longitude=?,availability_location_at=CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,preferred_emergency_fee_paise=? WHERE id=?").bind(until.toISOString(),parsed.data.latitude!=null?String(parsed.data.latitude):null,parsed.data.longitude!=null?String(parsed.data.longitude):null,parsed.data.latitude??null,parsed.data.preferredEmergencyFeeRupees?parsed.data.preferredEmergencyFeeRupees*100:null,user.clinicianId).run();
  return jsonOk({ availability: { status: "available", availableUntil: until.toISOString(), notificationsEnabled: true } });
}

export async function DELETE() {
  const user = await getSessionUser(); if (!user) return jsonError("Clinician login required.", 401, "LOGIN_REQUIRED");
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access is required before changing availability.", 403, "VERIFICATION_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  await env.DB.prepare("UPDATE clinician_profiles SET availability_status='unavailable',case_notifications_enabled=0,available_until=NULL,availability_latitude=NULL,availability_longitude=NULL,availability_location_at=NULL WHERE id=?").bind(user.clinicianId).run();
  return jsonOk({ availability: { status: "unavailable", availableUntil: null, notificationsEnabled: false } });
}
