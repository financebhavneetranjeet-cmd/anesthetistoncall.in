import { env } from "cloudflare:workers";
import { getSessionUser, hasActiveAccount } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Sign in to view available anaesthetists and their phone numbers.", 401);
  if (!hasActiveAccount(user)) return jsonError("Active registered account required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const result = await env.DB.prepare(`SELECT u.id,u.full_name AS name,u.mobile,
      strftime('%Y-%m-%dT%H:%M:%SZ',COALESCE((SELECT MAX(a.end_at) FROM availability_slots a WHERE a.clinician_user_id=u.id
        AND a.status='available' AND datetime(a.start_at)<=CURRENT_TIMESTAMP AND datetime(a.end_at)>CURRENT_TIMESTAMP),cp.available_until)) AS availableUntil
    FROM users u JOIN clinician_profiles cp ON cp.user_id=u.id
    WHERE u.role='anesthetist' AND u.status='verified' AND COALESCE(u.account_status,'active')='active'
      AND cp.verification_status='verified'
      AND (EXISTS(SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id AND a.status='available'
        AND datetime(a.start_at)<=CURRENT_TIMESTAMP AND datetime(a.end_at)>CURRENT_TIMESTAMP)
        OR (cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP
          AND NOT EXISTS(SELECT 1 FROM availability_slots a WHERE a.clinician_user_id=u.id)))
    ORDER BY availableUntil ASC`).all<{id:string;name:string;mobile:string|null;availableUntil:string}>();
  const response = jsonOk({ anaesthetists: result.results });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
