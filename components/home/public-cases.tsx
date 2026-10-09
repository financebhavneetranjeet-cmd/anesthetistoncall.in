"use client";
import { useEffect, useState } from "react";
import type { PublicCaseSummary } from "@/lib/server/public-cases";

export function PublicCases({ initialCases, signedIn }: { initialCases: PublicCaseSummary[] | null; signedIn: boolean }) {
  const [cases, setCases] = useState(initialCases ?? []);
  const [error, setError] = useState(initialCases === null ? "Available cases could not be loaded. Please try again." : "");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/public/cases", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { cases: PublicCaseSummary[] };
        setCases(data.cases); setError("");
      } catch { if (!controller.signal.aborted) { setCases([]); setError("Available cases could not be refreshed. Please try again."); } }
    }
    const timer = window.setInterval(() => void refresh(), 60000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/public/cases", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { cases: PublicCaseSummary[] };
      setCases(data.cases); setError("");
    } catch { setCases([]); setError("Available cases could not be loaded. Please try again."); }
    finally { setBusy(false); }
  }
  const visible = expanded ? cases : cases.slice(0, 6);
  return <section id="available-cases" aria-labelledby="available-cases-heading" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-10 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wider text-blue-700">Browse without login</p><h2 id="available-cases-heading" className="mt-2 text-3xl font-bold tracking-tight">Available Cases</h2><p className="mt-2 text-base text-slate-600">Upcoming open cases. A verified account is required to respond.</p></div><button type="button" onClick={() => void refresh()} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">{busy ? "Refreshing…" : "Refresh cases"}</button></div>
    {error ? <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">{error}</p> : cases.length === 0 ? <p role="status" className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-600">No upcoming open cases right now. New cases will appear here when available.</p> : <><div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visible.map((item, index) => <article key={`${item.hospitalName}-${item.scheduledAt}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.urgency === "routine" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{item.urgency === "emergency" ? "Emergency" : item.urgency === "urgent" ? "Urgent" : "Open case"}</span><span className="text-lg font-bold text-blue-800">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(item.offeredFeePaise / 100)}</span></div><h3 className="mt-4 break-words text-lg font-bold">{item.specialty || "Anaesthesia support"}</h3><p className="mt-1 break-words text-base text-slate-700">{item.hospitalName} · {item.city}</p><dl className="mt-4 space-y-2 text-sm text-slate-600"><div><dt className="inline font-semibold">Scheduled: </dt><dd className="inline"><time dateTime={item.scheduledAt}>{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(item.scheduledAt))} IST</time></dd></div><div><dt className="inline font-semibold">Anaesthesia: </dt><dd className="inline">{item.anaesthesiaType}</dd></div>{item.durationMinutes && <div><dt className="inline font-semibold">Estimated duration: </dt><dd className="inline">{item.durationMinutes} minutes</dd></div>}</dl><a href={signedIn ? "/cases" : "/login"} className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white">{signedIn ? "Open case dashboard" : "Login to respond"}</a></article>)}</div>{cases.length > 6 && <button onClick={() => setExpanded(!expanded)} className="mt-5 min-h-11 rounded-xl border border-blue-200 px-4 font-semibold text-blue-700">{expanded ? "Show fewer cases" : `Show ${cases.length === 50 ? "next 50" : `all ${cases.length}`} available cases`}</button>}</>}
    <p className="mt-4 text-sm text-slate-500">Patient information and contact details remain private. Times shown in Indian Standard Time.</p>
  </section>;
}
