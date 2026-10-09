import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/admin";
import { getSessionUser } from "@/lib/server/session";
import { dashboardAccounts } from "@/lib/server/dashboard-access";
import { DashboardChoices } from "@/components/auth/dashboard-choices";
import { AdminControlCentre } from "./admin-control-centre";

export const dynamic = "force-dynamic";
export default async function AdminControlPage() {
  if (!(await isAdmin())) redirect("/login");
  const user = await getSessionUser();
  const accounts = user ? await dashboardAccounts(user) : {};
  return <>{accounts.admin && accounts.anesthetist && <div className="bg-slate-100 px-3 pt-5 sm:px-8"><div className="mx-auto max-w-7xl"><DashboardChoices roles={["anesthetist", "admin"]} currentRole="admin" /></div></div>}<AdminControlCentre /></>;
}
