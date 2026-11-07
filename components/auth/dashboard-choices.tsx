"use client";

import Link from "@/components/native-link";
import { useState } from "react";
import { Building2, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { DASHBOARD_ROLES, DASHBOARD_LABELS, type DashboardRole } from "@/lib/dashboard-roles";
const icons = { admin: ShieldCheck, anesthetist: Stethoscope, surgeon: UserRound, hospital: Building2 };

export function DashboardChoices({ roles, currentRole }: { roles: DashboardRole[]; currentRole: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open(role: DashboardRole) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/switch-dashboard", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }), credentials: "same-origin",
      });
      const result = await response.json() as { redirectTo?: string; error?: { message?: string } };
      if (!response.ok || !result.redirectTo) throw new Error(result.error?.message ?? "Unable to open dashboard.");
      window.location.assign(result.redirectTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open dashboard.");
      setBusy(false);
    }
  }
  return <div className="space-y-3">
    <nav aria-label="Your dashboards" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{(roles.includes("admin") ? DASHBOARD_ROLES : roles).map(role => {
      const Icon = icons[role];
      const available = roles.includes(role);
      const active = currentRole === role;
      if (!available && roles.includes("admin") && (role === "hospital" || role === "surgeon")) return <Link key={role} href={`/dashboard-demo/${role}`} className="flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl border border-violet-300 bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-900 transition hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"><Icon aria-hidden="true" className="size-5 shrink-0" /><span>{DASHBOARD_LABELS[role]}<span className="block text-xs font-normal">Open Demo · Sample cases</span></span></Link>;
      return <button key={role} type="button" disabled={busy || !available}
        onClick={() => void open(role)} aria-current={active ? "page" : undefined}
        className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-blue-700 bg-blue-700 text-white shadow-sm" : "border-slate-300 bg-white text-slate-800 hover:border-blue-400 hover:bg-blue-50"}`}>
        <Icon aria-hidden="true" className="size-5 shrink-0" /><span>{DASHBOARD_LABELS[role]}{!available && <span className="block text-xs font-normal">Not linked / not approved</span>}</span>
      </button>;
    })}</nav>
    {roles.includes("admin") && DASHBOARD_ROLES.some(role=>!roles.includes(role)) && <p className="text-xs leading-5 text-slate-600">Only active, verified accounts on your signed-in mobile can be opened. Hospital and Surgeon demos use sample data only; opening a demo does not link or approve a real account.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
