import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const parsed = z.union([z.object({ share: z.literal(false) }), z.object({ share: z.literal(true), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Valid location required.");
  const data = parsed.data;
  // Store only an approximate position; sharing never changes availability periods.
  await env.DB.prepare("UPDATE clinician_profiles SET availability_latitude=?,availability_longitude=?,availability_location_at=? WHERE id=?").bind(data.share ? String(Math.round(data.latitude * 100) / 100) : null, data.share ? String(Math.round(data.longitude * 100) / 100) : null, data.share ? new Date().toISOString() : null, user!.clinicianId).run();
  return jsonOk({ locationShared: data.share });
}

export async function GET() {
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const row = await env.DB.prepare("SELECT availability_latitude IS NOT NULL AND availability_longitude IS NOT NULL AND datetime(availability_location_at)>datetime(CURRENT_TIMESTAMP,'-24 hours') AS shared FROM clinician_profiles WHERE id=?").bind(user!.clinicianId).first<{shared:number}>();
  const response = jsonOk({locationShared: Boolean(row?.shared)});
  response.headers.set("Cache-Control", "no-store");
  return response;
}
