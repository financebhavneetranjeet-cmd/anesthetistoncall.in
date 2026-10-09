import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

const COOKIE_NAME = "aoc_session";
const SESSION_DAYS = 14;

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
  jar.set(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
}

export async function switchSessionUser(userId: string): Promise<boolean> {
  if (!env.DB) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const result = await env.DB.prepare(`UPDATE sessions SET user_id = ? WHERE token_hash = ?
    AND datetime(expires_at) > CURRENT_TIMESTAMP
    AND EXISTS (SELECT 1 FROM users WHERE id = sessions.user_id AND account_status = 'active' AND status != 'suspended')`)
    .bind(userId, await sha256(token)).run();
  return Boolean(result.meta.changes);
}

export type SessionUser = { id: string; mobile: string; fullName: string; role: string; status: string; accountStatus: "active" | "suspended" | "blocked"; hospitalId: string | null; hospitalApprovalStatus: string | null; clinicianId: string | null; clinicianVerificationStatus: string | null };

export function hasActiveAccount(user: SessionUser | null): user is SessionUser {
  return Boolean(user && user.accountStatus === "active");
}

export function isApprovedHospital(user: SessionUser | null): user is SessionUser {
  return Boolean(hasActiveAccount(user) && user.role === "hospital" && user.status === "verified" && user.hospitalId && user.hospitalApprovalStatus === "approved");
}

export function isVerifiedClinician(user: SessionUser | null): user is SessionUser {
  return Boolean(hasActiveAccount(user) && (user.role === "anesthetist" || user.role === "surgeon") && user.status === "verified" && user.clinicianId && user.clinicianVerificationStatus === "verified");
}

export function isVerifiedAnaesthetist(user: SessionUser | null): user is SessionUser {
  return Boolean(hasActiveAccount(user) && user.role === "anesthetist" && user.status === "verified" && user.clinicianId && user.clinicianVerificationStatus === "verified");
}

export function isVerifiedPlatformUser(user: SessionUser | null): user is SessionUser {
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
      AND u.account_status = 'active' AND u.status != 'suspended'
    LIMIT 1`).bind(tokenHash).first<SessionUser>();
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
