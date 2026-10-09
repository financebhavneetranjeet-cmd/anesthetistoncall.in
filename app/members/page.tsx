import { MembersDirectory } from "./members-directory";
import { redirect } from "next/navigation";
import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
export const dynamic = "force-dynamic";
export default async function MembersPage() { const user = await getSessionUser(); if (!user) redirect("/login"); if (!isVerifiedPlatformUser(user)) redirect("/account/pending"); return <MembersDirectory />; }
