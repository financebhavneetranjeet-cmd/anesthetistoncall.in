import { env } from "cloudflare:workers";
import { otpSchema } from "@/lib/auth/otp";
import { jsonError, jsonOk } from "@/lib/server/http";
import { createSession } from "@/lib/server/session";
import { verifyOtp } from "@/lib/server/msg91";
import { findLoginUser, loginAllowed, loginDeniedMessage, postLoginDestination } from "@/lib/server/login";
import { googleConfigured, googleLinked } from "@/lib/server/google-auth";

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Registration database is unavailable.", 503, "DB_UNAVAILABLE");
  const body = await request.json().catch(() => null) as { challengeId?: string; otp?: string } | null;
  const otp = otpSchema.safeParse(body?.otp);
  if (!body?.challengeId || !otp.success) return jsonError(otp.success ? "OTP request is missing." : otp.error.issues[0]?.message ?? "Invalid OTP");
  const challenge = await env.DB.prepare("SELECT id, mobile, purpose, status, expires_at AS expiresAt, attempt_count AS attemptCount FROM otp_challenges WHERE id = ? LIMIT 1").bind(body.challengeId).first<{ id: string; mobile: string; purpose: string; status: string; expiresAt: string; attemptCount: number }>();
  if (!challenge || challenge.status !== "pending") return jsonError("This OTP request is no longer valid.", 409, "OTP_INVALID_STATE");
  if (new Date(challenge.expiresAt).getTime() < Date.now()) { await env.DB.prepare("UPDATE otp_challenges SET status = 'expired' WHERE id = ?").bind(challenge.id).run(); return jsonError("OTP has expired. Request a new OTP.", 410, "OTP_EXPIRED"); }
  if (challenge.attemptCount >= 5) return jsonError("Too many attempts. Request a new OTP.", 429, "OTP_ATTEMPTS_EXCEEDED");
  const attempt = await env.DB.prepare("UPDATE otp_challenges SET attempt_count = attempt_count + 1 WHERE id = ? AND status = 'pending' AND attempt_count < 5").bind(challenge.id).run();
  if (!attempt.meta.changes) return jsonError("Too many attempts. Request a new OTP.", 429, "OTP_ATTEMPTS_EXCEEDED");
  try {
    if (!await verifyOtp(challenge.mobile, otp.data)) return jsonError("Incorrect OTP. Please check and try again.", 401, "OTP_INCORRECT");
    if (challenge.purpose === "login") {
      const user = await findLoginUser(challenge.mobile);
      if (!user || !loginAllowed(user, challenge.mobile)) { const denied = loginDeniedMessage(user); return jsonError(denied.message, 403, denied.code); }
      const consumed = await env.DB.prepare("UPDATE otp_challenges SET status = 'verified', verified_at = CURRENT_TIMESTAMP, consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND consumed_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP").bind(challenge.id).run();
      if (!consumed.meta.changes) return jsonError("This OTP request is no longer valid.", 409, "OTP_INVALID_STATE");
      await createSession(user.id);
      if (googleConfigured() && !await googleLinked(challenge.mobile)) return jsonOk({ redirectTo: "/account/google" });
      return jsonOk({ redirectTo: postLoginDestination(user) });
    }
    await env.DB.prepare("UPDATE otp_challenges SET status = 'verified', verified_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(challenge.id).run();
    return jsonOk({ challengeId: challenge.id, mobile: challenge.mobile });
  } catch (error) { console.error("MSG91 verification failed", error); return jsonError("OTP verification is temporarily unavailable.", 502, "OTP_VERIFY_FAILED"); }
}
