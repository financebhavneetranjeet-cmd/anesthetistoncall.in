"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/native-link";

type Clinician = { id: string; name: string; mobile: string | null; availableUntil: string };
function numberForLink(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : digits.length >= 11 && digits.length <= 15 ? `+${digits}` : null;
}
export function AvailableClinicians({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<Clinician[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      const response = await fetch("/api/available-clinicians", { cache: "no-store", signal: request.signal });
      const data = await response.json() as { anaesthetists?: Clinician[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Availability could not be loaded.");
      if (request.signal.aborted) return;
      setItems((data.anaesthetists ?? []).filter(item => new Date(item.availableUntil).getTime() > Date.now()));
      setError("");
    } catch (cause) {
      if (!request.signal.aborted) { setItems([]); setError((cause as Error).message); }
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); controller.current?.abort(); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);
  useEffect(() => {
    const next = Math.min(...items.map(item => new Date(item.availableUntil).getTime()).filter(time => Number.isFinite(time)));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => {
      setItems(previous => previous.filter(item => new Date(item.availableUntil).getTime() > Date.now()));
      void load();
    }, Math.max(0, next - Date.now() + 10));
    return () => window.clearTimeout(timer);
  }, [items, load]);
  const Heading = embedded ? "h2" : "h1";
  const Wrapper = embedded ? "div" : "main";
  return <Wrapper className={embedded ? "text-slate-950" : "min-h-dvh bg-slate-50 px-3 py-6 text-slate-950 sm:p-8"}>
    <section className={embedded ? "" : "mx-auto max-w-3xl"} aria-label="Available anaesthetists">
      {!embedded && <Link href="/" className="font-semibold text-blue-700">← Home</Link>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading className="text-2xl font-bold sm:text-3xl">Available anaesthetists</Heading>
        <button type="button" disabled={busy} onClick={() => void load()} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold hover:bg-slate-50 disabled:opacity-50">{busy ? "Updating…" : "Refresh"}</button>
      </div>
      <p className="mt-2 text-slate-600">Available now, with registered phone numbers. Open to approved hospitals and all other registered users.</p>
      <p className="mt-1 text-xs text-slate-500">Updates every 15 seconds. Times shown in IST.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error} Use Refresh to try again.</p>}
      {!error && items.length === 0 && <p role="status" className="mt-5 rounded-xl border bg-slate-50 p-5">{busy ? "Checking current availability…" : "No anaesthetists are currently available."}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => {
        const number = numberForLink(item.mobile);
        return <article key={item.id} className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><span className="size-2 rounded-full bg-emerald-600" />Available now</span>
          <h3 className="mt-3 text-lg font-bold">{item.name}</h3>
          <p className="mt-1 text-sm text-slate-600">Until {new Date(item.availableUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} IST</p>
          {item.mobile && <p className="mt-3 break-all font-semibold">{item.mobile}</p>}
          {number ? <div className="mt-3 flex gap-3"><a href={`tel:${number}`} aria-label={`Call ${item.name}`} className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 font-bold text-white">Call</a><a href={`sms:${number}`} aria-label={`SMS ${item.name}`} className="inline-flex min-h-11 items-center rounded-lg border border-blue-700 px-4 font-bold text-blue-700">SMS</a></div> : <p className="mt-3 text-sm text-amber-800">{item.mobile ? "This number cannot be dialled directly." : "Phone number unavailable."}</p>}
        </article>;
      })}</div>
    </section>
  </Wrapper>;
}
