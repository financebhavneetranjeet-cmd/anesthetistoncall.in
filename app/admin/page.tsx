import { pendingHospitals } from "@/lib/server/pending-registrations";
import { env } from "cloudflare:workers";
import { NotificationPermission } from "@/components/pwa/notification-permission";
import { TestPushButton } from "./test-push-button";
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
  const result = env.DB ? await env.DB.prepare(pendingHospitals).all<PendingHospital>() : { results: [] };
  return <><div className="flex flex-wrap items-center"><NotificationPermission manual /><TestPushButton /></div><AdminHospitalList initialHospitals={result.results} adminName={admin.name} dualDashboard={Boolean(accounts.admin&&accounts.anesthetist)} /></>;
}
