import { env } from "cloudflare:workers";
import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  const viewer = await getSessionUser();
  if (!isVerifiedPlatformUser(viewer)) return jsonError("Verified member access required.", 403, "VERIFIED_MEMBER_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const result = await env.DB.prepare(`
    SELECT u.id, h.name AS fullName, u.role, COALESCE(h.facility_type, 'hospital') AS memberType, h.address AS qualification, h.city,
      'unavailable' AS availabilityStatus, NULL AS availableUntil
    FROM users u
    JOIN hospitals h ON h.owner_user_id = u.id
    WHERE u.role = 'hospital' AND u.status = 'verified' AND u.account_status = 'active' AND h.approval_status = 'approved'
    GROUP BY u.id
    UNION ALL
    SELECT u.id, u.full_name AS fullName, u.role, u.role AS memberType, cp.qualification, cp.city,
      CASE WHEN u.role = 'anesthetist' AND cp.availability_status = 'available' AND datetime(cp.available_until) > CURRENT_TIMESTAMP THEN 'available' ELSE 'unavailable' END AS availabilityStatus,
      CASE WHEN u.role = 'anesthetist' AND datetime(cp.available_until) > CURRENT_TIMESTAMP THEN cp.available_until ELSE NULL END AS availableUntil
    FROM users u
    JOIN clinician_profiles cp ON cp.user_id = u.id
    WHERE u.role IN ('surgeon', 'anesthetist') AND u.status = 'verified' AND u.account_status = 'active' AND cp.verification_status = 'verified'
    GROUP BY u.id
    ORDER BY role, fullName
  `).all();
  return jsonOk({ members: result.results });
}
