"use client";

import Link from "@/components/native-link";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, FlaskConical, Stethoscope, UserRound } from "lucide-react";
import { readRegistrationHandoff, saveRegistrationHandoff, type RegistrationHandoff } from "@/lib/auth/registration-handoff";

const roles = [
  { role: "hospital" as const, facilityType: "hospital" as const, title: "Hospital", copy: "Register an Amritsar hospital for admin approval.", icon: Building2, href: "/register/hospital" },
  { role: "hospital" as const, facilityType: "diagnostic_center" as const, title: "Diagnostic Center", copy: "Register an Amritsar diagnostic center for admin approval.", icon: FlaskConical, href: "/register/hospital" },
  { role: "anesthetist" as const, title: "Anaesthetist", copy: "Submit medical registration and PMC certificate.", icon: Stethoscope, href: "/register/clinician" },
  { role: "surgeon" as const, title: "Surgeon", copy: "Submit professional details for admin verification.", icon: UserRound, href: "/register/clinician" },
];

export function RoleChoice() {
  const [handoff, setHandoff] = useState<RegistrationHandoff | null | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setHandoff(readRegistrationHandoff()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function choose(item: (typeof roles)[number]) {
    if (!handoff) return;
    saveRegistrationHandoff({ ...handoff, role: item.role, facilityType: "facilityType" in item ? item.facilityType : undefined });
    window.location.assign(item.href);
  }

  return <main className="min-h-dvh bg-[#f3f7fb] px-3 py-4 text-slate-950 sm:grid sm:place-items-center sm:px-4 sm:py-10"><section className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,.1)] sm:rounded-[2rem] sm:p-10">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="size-4" /> Back to home</Link>
    <p className="mt-5 text-sm font-bold uppercase tracking-[.12em] text-blue-700">Mobile verified</p>
    <h1 className="mt-2 font-serif text-3xl font-semibold">Choose your role</h1>
    <p className="mt-2 leading-6 text-slate-600">Complete the registration that matches your work on the platform.</p>
    {handoff === undefined ? <p className="mt-7 text-slate-600">Loading registration…</p> : handoff === null ? <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><p className="font-semibold">Mobile verification is missing or expired.</p><Link href="/login" className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-700">Verify mobile again</Link></div> : <div className="mt-7 grid gap-3">{roles.map((item) => { const Icon = item.icon; const key = "facilityType" in item ? item.facilityType : item.role; return <button key={key} type="button" onClick={() => choose(item)} className="flex min-h-20 w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><Icon /></span><span><strong className="block text-lg">{item.title}</strong><span className="mt-1 block text-sm leading-5 text-slate-600">{item.copy}</span></span></button>; })}</div>}
  </section></main>;
}
