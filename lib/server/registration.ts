import { env } from "cloudflare:workers";
import { jsonError } from "@/lib/server/http";
import { isAdminMobile } from "@/lib/server/login";

export async function registrationRestriction(mobile: string): Promise<Response | null> {
  if (!env.DB) return jsonError("Registration database is unavailable.", 503);
  const ban = await env.DB.prepare("SELECT 1 FROM mobile_security_bans WHERE mobile = ? AND cleared_at IS NULL").bind(mobile).first();
  if (ban) return jsonError("This number is restricted. Contact the administrator.", 403, "MOBILE_SECURITY_BAN");
  const existing = await env.DB.prepare("SELECT 1 FROM users WHERE mobile = ? AND (account_status != 'blocked' OR role = 'admin')").bind(mobile).first();
  if (existing || isAdminMobile(mobile)) return jsonError("An account already uses this number. Sign in or contact the administrator.", 409, "MOBILE_ACCOUNT_EXISTS");
  return null;
}

export const previousAccount = `COALESCE(
  (SELECT id FROM users WHERE mobile = ? AND account_status = 'blocked' AND role != 'admin'
    ORDER BY updated_at DESC, rowid DESC LIMIT 1),
  (SELECT user_id FROM archived_accounts WHERE mobile = ? ORDER BY deleted_at DESC, rowid DESC LIMIT 1)
)`;

export const blockedOtpCutoff = `SELECT strftime('%Y-%m-%dT%H:%M:%fZ', MAX(l.created_at))
  FROM user_access_audit_logs l JOIN users u ON u.id = l.user_id
  WHERE u.mobile = ? AND u.account_status = 'blocked' AND l.action IN ('block','reject')`;

export function registrationConflict(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("MOBILE_SECURITY_BAN")) return jsonError("This number is restricted. Contact the administrator.", 403, "MOBILE_SECURITY_BAN");
  if (message.includes("MOBILE_ACCOUNT_EXISTS")) return jsonError("An account already uses this number.", 409, "MOBILE_ACCOUNT_EXISTS");
  if (message.includes("MOBILE_NOT_VERIFIED")) return jsonError("Mobile verification has expired or was already used. Verify again.", 409, "MOBILE_NOT_VERIFIED");
  if (message.includes("clinician_profiles.state_council")) return jsonError("This medical registration number is already in use.", 409, "REGISTRATION_EXISTS");
  throw error;
}

export async function registrationCutoff(mobile: string): Promise<number> {
  const result = await env.DB?.prepare(`SELECT MAX(value) AS cutoff FROM (
    SELECT deleted_at AS value FROM archived_accounts WHERE mobile = ?
    UNION ALL SELECT cleared_at FROM mobile_security_bans WHERE mobile = ?
    UNION ALL ${blockedOtpCutoff}
  )`).bind(mobile, mobile, mobile).first<{ cutoff: string | null }>();
  return result?.cutoff ? Date.parse(result.cutoff) : 0;
}
