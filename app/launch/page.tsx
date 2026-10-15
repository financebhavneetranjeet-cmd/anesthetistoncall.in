import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import { postLoginDestination } from "@/lib/server/login";

export const dynamic = "force-dynamic";
export default async function LaunchPage() {
  const user = await getSessionUser();
  redirect(user ? postLoginDestination(user) : "/login");
}
