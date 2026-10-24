import { AvailabilityPanel } from "./availability-panel";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedHospital, isVerifiedAnaesthetist } from "@/lib/server/session";
import { AvailableClinicians } from "./available-clinicians";
export const dynamic = "force-dynamic";
export default async function AvailabilityPage() { const user = await getSessionUser(); if (!user) redirect("/login"); if (isApprovedHospital(user)) return <AvailableClinicians />; if (!isVerifiedAnaesthetist(user)) redirect("/account/pending"); return <AvailabilityPanel />; }
