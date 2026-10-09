import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import { isApprovedHospital, isVerifiedClinician } from "@/lib/server/session";
import { dashboardAccounts } from "@/lib/server/dashboard-access";
import { DashboardChoices } from "@/components/auth/dashboard-choices";

export const dynamic = "force-dynamic";
export default async function ChooseDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const accounts = await dashboardAccounts(user);
  const roles = (["anesthetist", "admin"] as const).filter(role => Boolean(accounts[role]));
  if (!roles.length) redirect(isApprovedHospital(user) || isVerifiedClinician(user) ? "/cases" : "/account/pending");
  return <main className="grid min-h-dvh place-items-center bg-slate-50 px-4"><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-sm">
    <h1 className="mb-2 text-2xl font-semibold">Choose your dashboard</h1>
    <p className="mb-6 text-slate-600">Open an account linked to your verified mobile number.</p>
    <DashboardChoices roles={roles} currentRole={user.role} />
  </section></main>;
}
