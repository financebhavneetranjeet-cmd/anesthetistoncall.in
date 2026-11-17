import { env } from "cloudflare:workers";
import { z } from "zod";
import { emailSchema } from "@/lib/auth/email";
import { mobileSchema } from "@/lib/auth/otp";
import { isUserRole } from "@/lib/auth/roles";
import { jsonError, jsonOk } from "@/lib/server/http";
import { previousAccount, registrationConflict, registrationRestriction } from "@/lib/server/registration";
import { createSession } from "@/lib/server/session";
import { notifyAdminsOfRegistration } from "@/lib/server/web-push";

const schema = z.object({ challengeId: z.string().uuid(), fullName: z.string().trim().min(2).max(100), mobile: mobileSchema, email: emailSchema, role: z.enum(["anesthetist", "surgeon"]), stateCouncil: z.string().trim().min(3).max(100), registrationNumber: z.string().trim().min(3).max(50), qualification: z.string().trim().min(2).max(120), city: z.literal("Amritsar") });

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Registration database is unavailable.", 503, "DB_UNAVAILABLE");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUserRole(parsed.data.role)) return jsonError(parsed.success ? "Invalid role." : parsed.error.issues[0]?.message ?? "Check the registration details.");
  const data = parsed.data;
  const restriction = await registrationRestriction(data.mobile);
  if (restriction) return restriction;
  const userId = crypto.randomUUID(); const clinicianId = crypto.randomUUID();
  try { await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, mobile, email, full_name, role, status, medical_registration_number, registration_challenge_id, previous_account_id) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ${previousAccount})`).bind(userId, data.mobile, data.email || null, data.fullName, data.role, data.registrationNumber, data.challengeId, data.mobile),
    env.DB.prepare("INSERT INTO clinician_profiles (id, user_id, state_council, registration_number, qualification, city, verification_status, availability_status) VALUES (?, ?, ?, ?, ?, 'Amritsar', 'pending', 'unavailable')").bind(clinicianId, userId, data.stateCouncil, data.registrationNumber, data.qualification),
  ]); } catch (error) { return registrationConflict(error); }
  const application = await env.DB.prepare("SELECT previous_account_id IS NOT NULL AS fresh FROM users WHERE id = ?").bind(userId).first<{ fresh: number }>();
  console.info("Registration saved", { registrationId: clinicianId, role: data.role });
  try { await notifyAdminsOfRegistration({ id: clinicianId, role: data.role, name: data.fullName }); }
  catch (error) { console.error("Admin registration push failed", { registrationId: clinicianId, reason: error instanceof Error ? error.name : "UNKNOWN" }); }
  await createSession(userId);
  return jsonOk({ clinician: { id: clinicianId, verificationStatus: "pending", certificateRequired: Boolean(application?.fresh) } }, 201);
}
