import { env } from "cloudflare:workers";
import { z } from "zod";
import { mobileSchema } from "@/lib/auth/otp";
import { jsonError, jsonOk } from "@/lib/server/http";
import { createSession } from "@/lib/server/session";
import { findLoginUser, loginAllowed, loginDeniedMessage, postLoginDestination } from "@/lib/server/login";
import { dashboardAccounts } from "@/lib/server/dashboard-access";
import { googleConfigured, googleLinked } from "@/lib/server/google-auth";

const schema = z.object({ mobile: mobileSchema, purpose: z.enum(["login", "registration"]), role: z.enum(["hospital", "anesthetist", "surgeon"]).optional(), accessToken: z.string().min(20).max(12000).refine(value => value.split(".").length === 3) }).refine(value => value.purpose !== "login" || Boolean(value.role), { message: "Choose the account role to sign in." });

function canonicalIndianIdentifier(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  return /^91[6-9]\d{9}$/.test(digits) ? digits : null;
}

function verifiedIdentifier(result: Record<string, unknown>): string | null {
  const nested = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : null;
  const candidates = [result.identifier, result.mobile, result.phone, result.sub, result.message, nested?.identifier, nested?.mobile, nested?.phone, nested?.message];
  for (const candidate of candidates) {
    const identifier = canonicalIndianIdentifier(candidate);
    if (identifier) return identifier;
  }
  return null;
}

function verifiedTokenIdentifier(accessToken: string): string | null {
  try {
    const encoded = accessToken.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return verifiedIdentifier(JSON.parse(atob(normalized)) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function GET() {
  if (!env.MSG91_AUTH_KEY || !env.MSG91_WIDGET_ID || !env.MSG91_WIDGET_TOKEN ||
      !/^[a-f0-9]{22,32}$/i.test(env.MSG91_WIDGET_ID) ||
      env.MSG91_WIDGET_ID === env.MSG91_AUTH_KEY || env.MSG91_WIDGET_TOKEN === env.MSG91_AUTH_KEY) {
    const response = jsonError("Mobile verification is being configured. Please try again later.", 503, "MSG91_NOT_CONFIGURED");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = jsonOk({ widgetId: env.MSG91_WIDGET_ID, tokenAuth: env.MSG91_WIDGET_TOKEN });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export async function POST(request: Request) {
  if (!env.DB || !env.MSG91_AUTH_KEY) return jsonError("Mobile verification is unavailable.", 503, "MSG91_NOT_CONFIGURED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid mobile verification request.");
  const { mobile, purpose, role, accessToken } = parsed.data;
  try {
    // The Auth Key stays server-side. Token claims are inspected only after MSG91 validates the token.
    const response = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authkey: env.MSG91_AUTH_KEY, "access-token": accessToken }), signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      if (response.status >= 500) return jsonError("MSG91 verification is temporarily unavailable. Please retry.", 502, "OTP_PROVIDER_UNAVAILABLE");
      if (response.status === 429) return jsonError("Too many verification attempts. Please wait and retry.", 429, "OTP_RATE_LIMITED");
      return jsonError("OTP verification was not accepted. Please verify again.", 401, "OTP_NOT_VERIFIED");
    }
    const identifier = result ? verifiedIdentifier(result) ?? verifiedTokenIdentifier(accessToken) : null;
    if (!result || result.type !== "success" || identifier !== `91${mobile}`) return jsonError("The verified mobile does not match. Please verify this number again.", 401, "OTP_NOT_VERIFIED");
    const user = purpose === "login" ? await findLoginUser(mobile, role) : null;
    if (purpose === "login" && user && !loginAllowed(user, mobile)) { const denied = loginDeniedMessage(user); return jsonError(denied.message, 403, denied.code); }
    const challengePurpose = purpose === "login" && !user ? "registration" : purpose;
    // A deterministic UUID prevents the same provider token being exchanged twice, including concurrent requests.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
    const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO otp_challenges (id, mobile, purpose, status, attempt_count, expires_at, verified_at, consumed_at) VALUES (?, ?, ?, 'verified', 0, ?, CURRENT_TIMESTAMP, ?)").bind(id, mobile, challengePurpose, expiresAt, user ? new Date().toISOString() : null).run();
    if (!inserted.meta.changes) return jsonError("This verification has already been used. Please verify again.", 409, "OTP_ALREADY_USED");
    if (user) {
      const accounts = await dashboardAccounts({ mobile, role: user.role });
      await createSession(user.id);
      if (googleConfigured() && !await googleLinked(mobile)) return jsonOk({ redirectTo: "/account/google" });
      return jsonOk({ redirectTo: accounts.admin && accounts.anesthetist ? "/choose-dashboard" : postLoginDestination(user) });
    }
    return jsonOk({ challengeId: id, mobile, registrationRequired: purpose === "login", redirectTo: purpose === "login" ? "/register/choose-role" : undefined });
  } catch (error) {
    console.error("MSG91 access-token verification failed", error instanceof Error ? error.name : "unknown_error");
    return jsonError("Mobile verification is temporarily unavailable. Please retry.", 502, "OTP_VERIFY_FAILED");
  }
}
