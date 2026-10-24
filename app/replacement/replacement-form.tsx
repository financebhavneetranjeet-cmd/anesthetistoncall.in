"use client";
import { TimeField } from "@/components/time-field";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "@/components/native-link";
import { ReplacementSms } from "./replacement-sms";

type Hospital = { id: string; name: string; address: string; city: string };
type RequestRow = { id: string; procedureName: string; hospitalName: string; scheduledAt: string; offeredFeePaise: number; status: string; responseCount: number; statusLabel: string; canCancel: boolean; canSms: boolean };
const control = "min-h-12 min-w-0 w-full rounded-xl border border-slate-300 bg-white p-3";

export function ReplacementForm() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/replacements", { cache: "no-store" });
      const data = await response.json() as { hospitals: Hospital[]; requests: RequestRow[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to load hospitals.");
      setHospitals(data.hospitals);
      setRequests(data.requests);
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  async function cancel(id: string) {
    setCancelling(id); setError("");
    try {
      const response = await fetch(`/api/replacements/${id}/cancel`, {method:"POST"});
      const data = await response.json() as {error?: {message?: string}};
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to cancel request.");
      setSuccess("Replacement request cancelled. No new SMS drafts or alerts will be prepared. Discard any message already open in your phone.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry."); await load(); }
    finally { setCancelling(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    submitting.current = true;
    setBusy(true); setError(""); setSuccess("");
    try {
      // Reporting time is explicitly IST, independent of the device timezone.
      const date = new Date(`${values.get("date")}T${values.get("time")}:00+05:30`);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Choose a future reporting date and time (IST).");
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/replacements", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, hospitalId, procedureName: values.get("procedureName"), scheduledAt: date.toISOString(), offeredFeeRupees: Number(values.get("fee")), durationMinutes: Number(values.get("duration")) }),
      });
      const result = await response.json() as { case: { id: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to submit replacement request.");
      setSuccess("Replacement request posted. Eligible available anaesthetists will be notified. The hospital can review responses and select the replacement.");
      requestId.current = null;
      form.reset(); setHospitalId("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Network error. Retry to check or complete the same request."); }
    finally { submitting.current = false; setBusy(false); }
  }

  const hospital = hospitals.find(item => item.id === hospitalId);
  return <main className="min-h-dvh bg-slate-50 px-3 py-5 text-slate-950 sm:p-8"><div className="mx-auto max-w-3xl">
    <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-blue-700">← Home</Link>
    <form onSubmit={submit} data-critical-flow="true" className="mt-3 rounded-3xl border bg-white p-5 shadow-sm sm:p-8">
      <p className="text-sm font-bold text-blue-700">ANAESTHETIST REPLACEMENT</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Find another anesthetist for replacement</h1>
      <p className="mt-3 text-slate-600">Enter a new case and the fee offered to your replacement. The hospital reviews responses and confirms the anaesthetist.</p>
      {loadError && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">{loadError} <button type="button" onClick={() => void load()} className="underline">Retry loading</button></div>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-green-900">{success}</p>}
      <fieldset disabled={busy || loading || !!loadError} className="mt-6 grid gap-4 disabled:opacity-60 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Hospital<select required value={hospitalId} onChange={event => setHospitalId(event.target.value)} className={control}><option value="">{loading ? "Loading hospitals…" : "Select a registered hospital"}</option>{hospitals.map(item => <option key={item.id} value={item.id}>{item.name} — {item.address}, {item.city}</option>)}</select></label>
        {hospital && <p className="text-sm text-slate-600 sm:col-span-2">{hospital.address}, {hospital.city}</p>}
        {!loading && !loadError && !hospitals.length && <p className="text-sm text-amber-800 sm:col-span-2">No approved hospitals are available. A hospital must be registered and approved before a replacement request can be posted.</p>}
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Surgery / procedure<input required name="procedureName" minLength={3} maxLength={160} className={control} /></label>
        <label className="grid gap-1 text-sm font-medium">Date<input required name="date" type="date" className={control} /></label>
        <label className="grid gap-1 text-sm font-medium">Reporting time (IST)<TimeField required name="time" type="time" className={control} /></label>
        <label className="grid gap-1 text-sm font-medium">Replacement fee (₹)<input required name="fee" type="number" min={1} max={1000000} step={1} className={control} /></label>
        <label className="grid gap-1 text-sm font-medium">Estimated duration (minutes)<input required name="duration" type="number" min={15} max={1440} step={1} defaultValue={60} className={control} /></label>
        <p className="text-sm text-slate-500 sm:col-span-2">Do not include patient names, phone numbers or identifying information.</p>
        <button disabled={!hospitals.length} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? "Submitting…" : "Find replacement anaesthetist"}</button>
        <p className="text-sm text-slate-500 sm:col-span-2">Save your request first. Then use its SMS button below to prepare a message in your phone’s messaging app.</p>
      </fieldset>
    </form>
    <section className="mt-6 rounded-3xl border bg-white p-5 sm:p-8"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">My replacement requests</h2><button type="button" onClick={() => void load()} className="min-h-11 px-3 text-sm font-semibold text-blue-700">Refresh</button></div>{!loading && !requests.length && <p className="mt-3 text-slate-600">Your submitted requests will appear here.</p>}{requests.map(item => <article key={item.id} className="mt-4 rounded-xl border p-4"><h3 className="font-bold">{item.procedureName}</h3><p>{item.hospitalName}</p><p className="mt-1 text-sm text-slate-600">{new Date(item.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" , hour12: true })} IST · ₹{(item.offeredFeePaise / 100).toLocaleString("en-IN")}</p><p className="mt-2 text-sm font-semibold text-blue-800">{item.statusLabel} · {item.responseCount} available responses</p>{item.canCancel && <button type="button" disabled={cancelling !== null} onClick={() => void cancel(item.id)} className="mt-3 min-h-11 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700 disabled:opacity-50">{cancelling === item.id ? "Cancelling…" : "Cancel request"}</button>}{item.canSms && !loadError && cancelling !== item.id && <ReplacementSms caseId={item.id} />}</article>)}</section>
  </div></main>;
}
