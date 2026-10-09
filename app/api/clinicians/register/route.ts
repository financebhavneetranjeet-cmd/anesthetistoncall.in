import { env } from "cloudflare:workers";
import { z } from "zod";
import { emailSchema } from "@/lib/auth/email";
import { mobileSchema } from "@/lib/auth/otp";
import { isUserRole } from "@/lib/auth/roles";
import { jsonError, jsonOk } from "@/lib/server/http";
import { createSession } from "@/lib/server/session";
import { notifyAdminsOfRegistration } from "@/lib/server/web-push";

const schema = z.object({ challengeId: z.string().uuid(), fullName: z.string().trim().min(2).max(100), mobile: mobileSchema, email: emailSchema, role: z.enum(["anesthetist", "surgeon"]), stateCouncil: z.string().trim().min(3).max(100), registrationNumber: z.string().trim().min(3).max(50), qualification: z.string().trim().min(2).max(120), city: z.literal("Amritsar") });

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Registration database is unavailable.", 503, "DB_UNAVAILABLE");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUserRole(parsed.data.role)) return jsonError(parsed.success ? "Invalid role." : parsed.error.issues[0]?.message ?? "Check the registration details.");
  const data = parsed.data;
  const challenge = await env.DB.prepare("SELECT id FROM otp_challenges WHERE id = ? AND mobile = ? AND purpose = 'registration' AND status = 'verified' AND consumed_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP LIMIT 1").bind(data.challengeId, data.mobile).first<{ id: string }>();
  if (!challenge) return jsonError("Mobile verification is missing or expired.", 409, "MOBILE_NOT_VERIFIED");
  const duplicate = await env.DB.prepare("SELECT id FROM users WHERE mobile = ? AND role = ? LIMIT 1").bind(data.mobile, data.role).first();
  if (duplicate) return jsonError(`This mobile number is already registered as ${data.role === "anesthetist" ? "an Anaesthetist" : "a Surgeon"}.`, 409, "MOBILE_ROLE_EXISTS");
  const registration = await env.DB.prepare("SELECT id FROM clinician_profiles WHERE state_council = ? AND registration_number = ? LIMIT 1").bind(data.stateCouncil, data.registrationNumber).first();
  if (registration) return jsonError("This medical registration number is already in use.", 409, "REGISTRATION_EXISTS");
  const userId = crypto.randomUUID(); const clinicianId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, mobile, email, full_name, role, status, medical_registration_number) VALUES (?, ?, ?, ?, ?, 'pending', ?)").bind(userId, data.mobile, data.email || null, data.fullName, data.role, data.registrationNumber),
    env.DB.prepare("INSERT INTO clinician_profiles (id, user_id, state_council, registration_number, qualification, city, verification_status, availability_status) VALUES (?, ?, ?, ?, ?, 'Amritsar', 'pending', 'unavailable')").bind(clinicianId, userId, data.stateCouncil, data.registrationNumber, data.qualification),
    env.DB.prepare("UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(challenge.id),
  ]);
  console.info("Registration saved", { registrationId: clinicianId, role: data.role });
  try { await notifyAdminsOfRegistration({ id: clinicianId, role: data.role, name: data.fullName }); }
  catch (error) { console.error("Admin registration push failed", { registrationId: clinicianId, reason: error instanceof Error ? error.name : "UNKNOWN" }); }
  await createSession(userId);
  return jsonOk({ clinician: { id: clinicianId, verificationStatus: "pending" } }, 201);
}
