import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import { dashboardAccounts } from "@/lib/server/dashboard-access";
import { DashboardDemo } from "./dashboard-demo";
export const dynamic = "force-dynamic";
export default async function DashboardDemoPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "hospital" && role !== "surgeon") notFound();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const accounts = await dashboardAccounts(user);
  if (!accounts.admin) redirect("/cases");
  return <DashboardDemo role={role} currentRole={user.role} />;
}
