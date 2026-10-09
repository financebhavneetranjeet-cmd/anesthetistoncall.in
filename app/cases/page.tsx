import Link from "@/components/native-link";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedHospital, isVerifiedClinician } from "@/lib/server/session";
import { CasesDashboard } from "./cases-dashboard";
import { dashboardAccounts } from "@/lib/server/dashboard-access";
export const dynamic="force-dynamic";
export default async function CasesPage(){const user=await getSessionUser();if(!user)return <main className="grid min-h-dvh place-items-center bg-slate-50 px-3 py-6"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow sm:p-8"><h1 className="text-2xl font-bold">Login required</h1><Link href="/login" className="mt-5 grid min-h-12 w-full place-items-center rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white sm:inline-grid sm:w-auto">Login with OTP</Link></div></main>;if(!isApprovedHospital(user)&&!isVerifiedClinician(user))redirect("/account/pending");const accounts=await dashboardAccounts(user);return <CasesDashboard role={user.role} approved={user.hospitalApprovalStatus==="approved"} viewerUserId={user.id} dualDashboard={Boolean(accounts.admin&&accounts.anesthetist)} />;}
