import Link from "@/components/native-link";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { ReplacementForm } from "./replacement-form";

export const dynamic = "force-dynamic";

export default async function ReplacementPage() {
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Verified anaesthetist access required</h1><Link className="mt-4 inline-block rounded-xl bg-blue-700 px-5 py-3 text-white" href={user ? "/account/pending" : "/login"}>{user ? "View account status" : "Login with OTP"}</Link></main>;
  return <ReplacementForm />;
}
