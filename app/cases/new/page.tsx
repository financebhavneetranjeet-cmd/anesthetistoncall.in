import { env } from "cloudflare:workers";
import { getSessionUser, isApprovedHospital } from "@/lib/server/session";
import { NewCaseForm } from "./new-case-form";
import Link from "@/components/native-link";

export const dynamic = "force-dynamic";
export default async function NewCasePage() {
  const user = await getSessionUser();
  if (!isApprovedHospital(user)) return <main className="grid min-h-dvh place-items-center bg-slate-50 px-3 py-6"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow sm:p-8"><h1 className="text-2xl font-bold">Approved hospital access required</h1><Link href={user ? "/account/pending" : "/login"} className="mt-5 grid min-h-12 w-full place-items-center rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white sm:inline-grid sm:w-auto">{user ? "View account status" : "Login with OTP"}</Link></div></main>;
  const hospital = await env.DB?.prepare("SELECT name,address FROM hospitals WHERE id=? AND owner_user_id=? AND approval_status='approved'").bind(user.hospitalId, user.id).first<{ name: string; address: string }>();
  if (!hospital) return <main className="grid min-h-dvh place-items-center p-6"><p role="alert">Approved hospital details are unavailable. Please contact the administrator.</p></main>;
  return <NewCaseForm hospital={hospital} />;
}
