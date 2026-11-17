import { env } from "cloudflare:workers";
import { z } from "zod";
import { emailSchema } from "@/lib/auth/email";
import { mobileSchema } from "@/lib/auth/otp";
import { jsonError, jsonOk } from "@/lib/server/http";
import { previousAccount, registrationConflict, registrationRestriction } from "@/lib/server/registration";
import { createSession } from "@/lib/server/session";
import { getVerifiedHospitalPlace, GooglePlacesError } from "@/lib/server/google-places";
import { notifyAdminsOfRegistration } from "@/lib/server/web-push";

const registrationSchema = z.object({
  challengeId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(100),
  mobile: mobileSchema,
  email: emailSchema,
  facilityType: z.enum(["hospital", "diagnostic_center"]).default("hospital"),
  hospitalName: z.string().trim().min(2).max(140),
  address: z.string().trim().min(5).max(300),
  city: z.literal("Amritsar"),
  googlePlaceId: z.string().trim().min(3).max(200),
  googleMapsUri: z.string().url().max(1000),
  latitude: z.number().min(31.2).max(32.05),
  longitude: z.number().min(74.45).max(75.3),
});

export async function POST(request: Request) {
  if (!env.DB)
    return jsonError(
      "Registration database is unavailable.",
      503,
      "DB_UNAVAILABLE",
    );
  const parsed = registrationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return jsonError(
      parsed.error.issues[0]?.message ??
        "Please check the registration details.",
    );
  let data = parsed.data;
  if (!data.googlePlaceId.startsWith("pin-")) {
    try {
      const verified = await getVerifiedHospitalPlace(data.googlePlaceId);
      data = { ...data, hospitalName: verified.name, address: verified.address, city: verified.city, latitude: verified.latitude, longitude: verified.longitude, googleMapsUri: verified.googleMapsUri };
    } catch (error) {
      if (error instanceof GooglePlacesError) return jsonError(error.message, error.status, error.code);
      return jsonError("Unable to verify this hospital with Google Maps.", 502, "MAPS_ERROR");
    }
  }
  if (!/amritsar/i.test(data.address) || !/punjab|\bpb\b/i.test(data.address)) {
    return jsonError(
      "Please select a hospital or clinic in Amritsar, Punjab.",
      422,
      "OUTSIDE_AMRITSAR",
    );
  }
  const restriction = await registrationRestriction(data.mobile);
  if (restriction) return restriction;
  const userId = crypto.randomUUID();
  const hospitalId = crypto.randomUUID();
  try { await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, mobile, email, full_name, role, status, registration_challenge_id, previous_account_id) VALUES (?, ?, ?, ?, 'hospital', 'pending', ?, ${previousAccount})`,
    ).bind(userId, data.mobile, data.email || null, data.fullName, data.challengeId, data.mobile, data.mobile),
    env.DB.prepare(
      "INSERT INTO hospitals (id, owner_user_id, name, facility_type, address, city, google_place_id, latitude, longitude, google_maps_url, approval_status) VALUES (?, ?, ?, ?, ?, 'Amritsar', ?, ?, ?, ?, 'pending')",
    ).bind(
      hospitalId,
      userId,
      data.hospitalName,
      data.facilityType,
      data.address,
      data.googlePlaceId,
      String(data.latitude),
      String(data.longitude),
      data.googleMapsUri,
    ),
  ]); } catch (error) { return registrationConflict(error); }
  const application = await env.DB.prepare("SELECT previous_account_id IS NOT NULL AS fresh FROM users WHERE id = ?").bind(userId).first<{ fresh: number }>();
  console.info("Registration saved", { registrationId: hospitalId, role: data.facilityType });
  try { await notifyAdminsOfRegistration({ id: hospitalId, role: data.facilityType, name: data.hospitalName }); }
  catch (error) { console.error("Admin registration push failed", { registrationId: hospitalId, reason: error instanceof Error ? error.name : "UNKNOWN" }); }
  await createSession(userId);
  return jsonOk(
    {
      registration: {
        id: hospitalId,
        status: "pending",
        documentRequired: Boolean(application?.fresh),
        message: "Registration submitted for admin approval.",
      },
    },
    201,
  );
}
