import { env } from "cloudflare:workers";
import Link from "@/components/native-link";
import { redirect } from "next/navigation";
import { getAdminIdentity } from "@/lib/server/admin";
import { AdminHospitalList, type PendingHospital } from "./pending-hospitals";
import { getSessionUser } from "@/lib/server/session";
import { dashboardAccounts } from "@/lib/server/dashboard-access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminIdentity();
  if (!admin) redirect("/login");
  const session = await getSessionUser();
  const accounts = session ? await dashboardAccounts(session) : {};
  const result = env.DB ? await env.DB.prepare(`SELECT h.id, h.name, COALESCE(h.facility_type,'hospital') AS facilityType, h.address, h.city, h.google_place_id AS googlePlaceId, h.approval_status AS approvalStatus, h.created_at AS createdAt, u.full_name AS contactName, u.mobile, u.email FROM hospitals h JOIN users u ON u.id = h.owner_user_id WHERE h.approval_status = 'pending' ORDER BY h.created_at ASC`).all<PendingHospital>() : { results: [] };
  return <AdminHospitalList initialHospitals={result.results} adminName={admin.name} dualDashboard={Boolean(accounts.admin&&accounts.anesthetist)} />;
}
