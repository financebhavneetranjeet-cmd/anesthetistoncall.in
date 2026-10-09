import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  if (!await isAdmin()) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const result = await env.DB.prepare(`SELECT h.id, h.name, COALESCE(h.facility_type,'hospital') AS facilityType, h.address, h.city, h.google_place_id AS googlePlaceId, h.approval_status AS approvalStatus, h.created_at AS createdAt, u.full_name AS contactName, u.mobile, u.email
    FROM hospitals h JOIN users u ON u.id = h.owner_user_id WHERE h.approval_status = 'pending' ORDER BY h.created_at ASC`).all();
  return jsonOk({ hospitals: result.results });
}
