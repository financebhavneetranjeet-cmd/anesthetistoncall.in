import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  if (!await isAdmin()) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const result = await env.DB.prepare(`SELECT cp.id, u.full_name AS fullName, u.role, u.mobile, u.email, cp.state_council AS stateCouncil, cp.registration_number AS registrationNumber, cp.qualification, cp.city, cp.created_at AS createdAt,
    cp.pmc_verification_status AS pmcVerificationStatus,
    (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id) AS documentCount,
    (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id AND vd.document_type='pmc_certificate') AS pmcCertificateCount
    FROM clinician_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.verification_status = 'pending' ORDER BY cp.created_at ASC`).all();
  return jsonOk({ clinicians: result.results });
}
