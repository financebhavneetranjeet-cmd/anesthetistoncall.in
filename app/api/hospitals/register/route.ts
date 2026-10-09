import { env } from "cloudflare:workers";
import { z } from "zod";
import { emailSchema } from "@/lib/auth/email";
import { mobileSchema } from "@/lib/auth/otp";
import { jsonError, jsonOk } from "@/lib/server/http";
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
  const challenge = await env.DB.prepare(
    "SELECT id FROM otp_challenges WHERE id = ? AND mobile = ? AND purpose = 'registration' AND status = 'verified' AND consumed_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP LIMIT 1",
  )
    .bind(data.challengeId, data.mobile)
    .first<{ id: string }>();
  if (!challenge)
    return jsonError(
      "Mobile verification is missing or expired.",
      409,
      "MOBILE_NOT_VERIFIED",
    );
  const existing = await env.DB.prepare(
    "SELECT id, role, status FROM users WHERE mobile = ? AND role = 'hospital' LIMIT 1",
  )
    .bind(data.mobile)
    .first<{ id: string; role: string; status: string }>();
  if (existing) {
    const hospital = await env.DB.prepare(
      "SELECT id, approval_status AS approvalStatus FROM hospitals WHERE owner_user_id = ? LIMIT 1",
    )
      .bind(existing.id)
      .first<{ id: string; approvalStatus: string }>();
    if (!hospital)
      return jsonError(
        "This hospital account is incomplete. Please contact support.",
        409,
        "HOSPITAL_INCOMPLETE",
      );
    await env.DB.prepare(
      "UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
      .bind(challenge.id)
      .run();
    await createSession(existing.id);
    return jsonOk({
      registration: {
        id: hospital.id,
        status: hospital.approvalStatus,
        message:
          hospital.approvalStatus === "approved"
            ? "Hospital account is already approved."
            : "Registration is already submitted for admin approval.",
      },
      existing: true,
    });
  }
  const userId = crypto.randomUUID();
  const hospitalId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, mobile, email, full_name, role, status) VALUES (?, ?, ?, ?, 'hospital', 'pending')",
    ).bind(userId, data.mobile, data.email || null, data.fullName),
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
    env.DB.prepare(
      "UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(challenge.id),
  ]);
  console.info("Registration saved", { registrationId: hospitalId, role: data.facilityType });
  try { await notifyAdminsOfRegistration({ id: hospitalId, role: data.facilityType, name: data.hospitalName }); }
  catch (error) { console.error("Admin registration push failed", { registrationId: hospitalId, reason: error instanceof Error ? error.name : "UNKNOWN" }); }
  await createSession(userId);
  return jsonOk(
    {
      registration: {
        id: hospitalId,
        status: "pending",
        message: "Registration submitted for admin approval.",
      },
    },
    201,
  );
}
