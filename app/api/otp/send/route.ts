import { env } from "cloudflare:workers";
import { mobileSchema } from "@/lib/auth/otp";
import { jsonError, jsonOk } from "@/lib/server/http";
import { isMsg91Configured, sendOtp } from "@/lib/server/msg91";

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Registration database is unavailable.", 503, "DB_UNAVAILABLE");
  const body = await request.json().catch(() => null) as { mobile?: string; purpose?: string } | null;
  const parsed = mobileSchema.safeParse(body?.mobile);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid mobile number");
  const purpose = body?.purpose ?? "registration";
  if (purpose !== "registration" && purpose !== "login") return jsonError("Invalid OTP purpose.");
  if (purpose === "login") {
    const user = await env.DB.prepare("SELECT id, status FROM users WHERE mobile = ? LIMIT 1").bind(parsed.data).first<{ id: string; status: string }>();
    if (!user || user.status === "suspended") return jsonError("This account cannot sign in. Check your mobile number or contact the administrator.", 403, "LOGIN_UNAVAILABLE");
  }
  const recent = await env.DB.prepare("SELECT id FROM otp_challenges WHERE mobile = ? AND datetime(created_at) > datetime('now', '-60 seconds') LIMIT 1").bind(parsed.data).first();
  if (recent) return jsonError("Wait a minute before requesting another OTP.", 429, "OTP_COOLDOWN");
  if (!isMsg91Configured()) return jsonError("OTP service needs MSG91 configuration.", 503, "MSG91_NOT_CONFIGURED");
  try {
    const provider = await sendOtp(parsed.data);
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await env.DB.prepare("INSERT INTO otp_challenges (id, mobile, provider_request_id, purpose, status, attempt_count, expires_at) VALUES (?, ?, ?, ?, 'pending', 0, ?)")
      .bind(challengeId, parsed.data, provider.requestId, purpose, expiresAt).run();
    return jsonOk({ challengeId, expiresAt });
  } catch (error) {
    console.error("MSG91 send failed", error);
    return jsonError("OTP could not be sent. Please try again.", 502, "OTP_SEND_FAILED");
  }
}
