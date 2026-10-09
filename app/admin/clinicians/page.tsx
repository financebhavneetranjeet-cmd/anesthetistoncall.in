import { env } from "cloudflare:workers";

import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/admin";
import { ClinicianApprovals, type PendingClinician } from "./clinician-approvals";

export const dynamic = "force-dynamic";
export default async function ClinicianAdminPage() {
  
  if (!(await isAdmin())) redirect("/login");
  const result = env.DB ? await env.DB.prepare(`SELECT cp.id, u.full_name AS fullName, u.role, u.mobile, u.email, cp.state_council AS stateCouncil, cp.registration_number AS registrationNumber, cp.qualification, cp.city, cp.created_at AS createdAt, cp.pmc_verification_status AS pmcVerificationStatus, (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id) AS documentCount, (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = u.id AND vd.document_type='pmc_certificate') AS pmcCertificateCount FROM clinician_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.verification_status = 'pending' ORDER BY cp.created_at ASC`).all<PendingClinician>() : { results: [] };
  return <ClinicianApprovals initialClinicians={result.results} />;
}
