import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

const COOKIE_NAME = "aoc_session";
const SESSION_DAYS = 30;
// Renew on foreground use, with a hard limit requiring fresh verification.
const ABSOLUTE_SESSION_DAYS = 180;

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<void> {
  if (!env.DB) throw new Error("Database unavailable");
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await env.DB.prepare("INSERT INTO sessions (id, token_hash, user_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), tokenHash, userId, expires.toISOString()).run();
  const jar = await cookies();
  const previous = jar.get(COOKIE_NAME)?.value;
  if (previous) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(previous)).run();
  jar.set(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
}

export async function switchSessionUser(userId: string): Promise<boolean> {
  if (!env.DB) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const result = await env.DB.prepare(`UPDATE sessions SET user_id = ? WHERE token_hash = ?
    AND datetime(expires_at) > CURRENT_TIMESTAMP
    AND datetime(created_at, '+180 days') > CURRENT_TIMESTAMP
    AND EXISTS (SELECT 1 FROM users WHERE id = sessions.user_id AND account_status = 'active' AND status != 'suspended')`)
    .bind(userId, await sha256(token)).run();
  return Boolean(result.meta.changes);
}

export type SessionUser = { id: string; mobile: string; fullName: string; role: string; status: string; accountStatus: "active" | "suspended" | "blocked"; hospitalId: string | null; hospitalApprovalStatus: string | null; clinicianId: string | null; clinicianVerificationStatus: string | null };

export function hasActiveAccount(user: SessionUser | null): user is SessionUser & { accountStatus: "active" } {
  return Boolean(user && user.accountStatus === "active");
}

export function isApprovedHospital(user: SessionUser | null): user is SessionUser & { role: "hospital"; status: "verified"; hospitalId: string } {
  return Boolean(hasActiveAccount(user) && user.role === "hospital" && user.status === "verified" && user.hospitalId && user.hospitalApprovalStatus === "approved");
}

export function isVerifiedClinician(user: SessionUser | null): user is SessionUser & { role: "anesthetist" | "surgeon"; status: "verified"; clinicianId: string } {
  return Boolean(hasActiveAccount(user) && (user.role === "anesthetist" || user.role === "surgeon") && user.status === "verified" && user.clinicianId && user.clinicianVerificationStatus === "verified");
}

export function isVerifiedAnaesthetist(user: SessionUser | null): user is SessionUser & { role: "anesthetist"; status: "verified"; clinicianId: string } {
  return Boolean(hasActiveAccount(user) && user.role === "anesthetist" && user.status === "verified" && user.clinicianId && user.clinicianVerificationStatus === "verified");
}

export function isVerifiedPlatformUser(user: SessionUser | null): user is SessionUser & { status: "verified" } {
  return Boolean(hasActiveAccount(user) && (user.role === "admin" ? user.status === "verified" : isApprovedHospital(user) || isVerifiedClinician(user)));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!env.DB) return null;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`SELECT u.id, u.mobile, u.full_name AS fullName, u.role, u.status, CASE WHEN u.status = 'suspended' THEN 'suspended' ELSE u.account_status END AS accountStatus, h.id AS hospitalId, h.approval_status AS hospitalApprovalStatus, cp.id AS clinicianId, cp.verification_status AS clinicianVerificationStatus
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN hospitals h ON h.owner_user_id = u.id LEFT JOIN clinician_profiles cp ON cp.user_id = u.id
    WHERE s.token_hash = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP
      AND datetime(s.created_at, '+180 days') > CURRENT_TIMESTAMP
      AND u.account_status = 'active' AND u.status IN ('pending', 'verified')
    LIMIT 1`).bind(tokenHash).first<SessionUser>();
}

// Only call from a same-origin route handler, where setting cookies is supported.
// Never insert here: a revoked/expired session must not be resurrected by renewal.
export async function renewSession(): Promise<boolean> {
  if (!env.DB) return false;
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const tokenHash = await sha256(token);
  const session = await env.DB.prepare(`SELECT expires_at AS expiresAt,
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+${ABSOLUTE_SESSION_DAYS} days') AS absoluteExpiry
    FROM sessions WHERE token_hash = ? AND datetime(expires_at) > CURRENT_TIMESTAMP
    AND datetime(created_at, '+180 days') > CURRENT_TIMESTAMP
    AND EXISTS (SELECT 1 FROM users WHERE id = sessions.user_id AND account_status = 'active' AND status IN ('pending', 'verified'))`)
    .bind(tokenHash).first<{ expiresAt: string; absoluteExpiry: string }>();
  if (!session) return false;
  const expires = new Date(Math.min(Date.now() + SESSION_DAYS * 86_400_000, Date.parse(session.absoluteExpiry)));
  // Write at most daily, and preserve the cookie during parallel-tab requests.
  if (Math.abs(expires.getTime() - Date.parse(session.expiresAt)) < 86_400_000) return true;
  const result = await env.DB.prepare(`UPDATE sessions SET expires_at = ? WHERE token_hash = ?
    AND datetime(expires_at) > CURRENT_TIMESTAMP AND datetime(created_at, '+180 days') > CURRENT_TIMESTAMP
    AND EXISTS (SELECT 1 FROM users WHERE id = sessions.user_id AND account_status = 'active' AND status IN ('pending', 'verified'))`)
    .bind(expires.toISOString(), tokenHash).run();
  if (!result.meta.changes) return false;
  jar.set(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
  return true;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  jar.delete(COOKIE_NAME);
}

export async function getSessionBinding(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? sha256(token) : null;
}
