import { pendingClinicians } from "@/lib/server/pending-registrations";
import { env } from "cloudflare:workers";

import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/admin";
import { ClinicianApprovals, type PendingClinician } from "./clinician-approvals";

export const dynamic = "force-dynamic";
export default async function ClinicianAdminPage() {
  
  if (!(await isAdmin())) redirect("/login");
  const result = env.DB ? await env.DB.prepare(pendingClinicians).all<PendingClinician>() : { results: [] };
  return <ClinicianApprovals initialClinicians={result.results} />;
}
