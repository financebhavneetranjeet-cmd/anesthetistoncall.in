import { AvailabilityPanel } from "./availability-panel";
import { redirect } from "next/navigation";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
export const dynamic = "force-dynamic";
export default async function AvailabilityPage() { const user = await getSessionUser(); if (!user) redirect("/login"); if (!isVerifiedAnaesthetist(user)) redirect("/account/pending"); return <AvailabilityPanel />; }
