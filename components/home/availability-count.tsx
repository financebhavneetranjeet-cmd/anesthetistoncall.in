"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Stethoscope } from "lucide-react";

export function AvailabilityCount({ initialCount }: { initialCount: number | null }) {
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (document.visibilityState === "hidden" || inFlight) return;
      inFlight = true;
      setBusy(true);
      try {
        const response = await fetch("/api/emergency-availability", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json() as { count: number };
        if (!Number.isInteger(data.count) || data.count < 0) throw new Error("Invalid count");
        if (controller.signal.aborted) return;
        setCount(data.count);
      } catch {
        if (!controller.signal.aborted) setCount(null);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [retry]);
  return <section aria-label="Live anaesthetist availability" className="mx-auto mt-7 max-w-lg rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-900"><Stethoscope aria-hidden="true" className="size-5" />Number of Available Anaesthetists</div>
    <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-4xl font-bold tabular-nums text-emerald-800">{count === null ? <span className="text-base text-slate-600">{busy ? "Checking availability…" : "Count temporarily unavailable"}</span> : <><span className="sr-only">Available now: </span>{count}</>}</p>
    <p className="mt-2 text-sm text-slate-600">{count === 0 ? "No anaesthetists are marked available right now." : "Verified anaesthetists marked available right now."}</p>
    <p className="mt-1 text-xs text-slate-500">Updates every 30 seconds, or tap Refresh count.</p>
    <button type="button" onClick={()=>setRetry(value=>value+1)} disabled={busy} className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"><RefreshCw aria-hidden="true" className={`size-4 ${busy ? "motion-safe:animate-spin" : ""}`} />{busy ? "Updating…" : "Refresh count"}</button>
  </section>;
}
