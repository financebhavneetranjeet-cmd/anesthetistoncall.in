import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import { googleConfigured, googleLinked } from "@/lib/server/google-auth";
import { dashboardAccounts } from "@/lib/server/dashboard-access";
import { postLoginDestination } from "@/lib/server/login";
import { GoogleButton } from "@/components/auth/google-button";
export const dynamic = "force-dynamic";
export default async function GoogleAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const identity = await googleLinked(user.mobile);
  const accounts = await dashboardAccounts(user);
  const destination = accounts.admin && accounts.anesthetist ? "/choose-dashboard" : postLoginDestination(user);
  return <main className="grid min-h-dvh place-items-center bg-slate-50 p-4"><section className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-bold uppercase tracking-wider text-blue-700">Fast access</p><h1 className="text-2xl font-semibold">{identity ? "Google login is ready" : "Make your next login faster"}</h1>{identity ? <p className="break-words text-slate-600">Google is connected as {identity.email}. Google and Mobile OTP both open your existing account.</p> : <><p className="text-slate-600">Connect your Google account once. Your roles, approvals and account history stay the same.</p><GoogleButton purpose="link" role={user.role} enabled={googleConfigured()} /></>}<a href={destination} className="flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-4 font-semibold text-white">{identity ? "Continue to your account" : "Continue with Mobile OTP only"}</a></section></main>;
}
