"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function NewCaseForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const fee = String(form.get("fee") ?? "").trim();
    const age = String(form.get("patientAge") ?? "").trim();
    const duration = String(form.get("duration") ?? "").trim();
    requestId.current ??= crypto.randomUUID();
    const body = {
      requestId: requestId.current,
      procedureName: form.get("procedureName"), location: form.get("location"),
      scheduledAt: new Date(`${String(form.get("caseDate"))}T${String(form.get("reportingTime"))}`).toISOString(),
      offeredFeeRupees: fee ? Number(fee) : undefined, urgency: form.get("urgency"),
      durationMinutes: duration ? Number(duration) : undefined, biddingEnabled: form.get("biddingEnabled") === "on",
      publicNotes: form.get("publicNotes") || undefined, patientAge: age ? Number(age) : undefined,
      patientSex: form.get("patientSex") || undefined,
    };
    const response = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: { message?: string } };
    if (!response.ok) { setSubmitting(false); return setMessage(result.error?.message ?? "Unable to post case."); }
    router.push("/cases?posted=1");
    router.refresh();
  }

  return <main className="min-h-dvh bg-slate-50 px-3 py-4 sm:p-8"><form data-critical-flow="true" onSubmit={submit} className="mx-auto max-w-3xl rounded-3xl border bg-white p-4 shadow-sm sm:p-7">
    <p className="text-sm font-semibold text-blue-700">HOSPITAL WORKFLOW</p><h1 className="text-2xl font-bold sm:text-3xl">Post a case</h1>
    <p className="mt-2 leading-6 text-slate-600">Approved hospitals can publish directly to verified anaesthetists. The new case will appear as Open.</p>
    {message && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">{message}</p>}
    <div className="mt-6 grid min-w-0 gap-4 text-black sm:grid-cols-2">
      <Field name="procedureName" label="Procedure or surgery" required />
      <Field name="location" label="Hospital or location" required />
      <Field name="caseDate" label="Date" type="date" required /><Field name="reportingTime" label="Reporting time" type="time" required />
      <Field name="duration" label="Estimated case duration (minutes)" type="number" min="15" required />
      <label className="grid min-w-0 gap-1 text-sm font-medium">Urgency<select name="urgency" className="h-12 min-w-0 w-full rounded-xl border p-3"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
      <Field name="patientAge" label="Patient age (optional)" type="number" min="0" />
      <label className="grid min-w-0 gap-1 text-sm font-medium">Patient sex (optional)<select name="patientSex" className="h-12 min-w-0 w-full rounded-xl border p-3"><option value="">Not provided</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
      <Field name="fee" label="Posted anaesthetist fee (₹)" type="number" min="1" required />
      <label className="flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium"><input name="biddingEnabled" type="checkbox" className="size-5 accent-blue-700" /> Allow optional fee bids</label>
      <label className="grid min-w-0 gap-1 text-sm font-medium sm:col-span-2">Additional notes<textarea name="publicNotes" maxLength={1000} className="min-h-28 min-w-0 w-full rounded-xl border p-3" /></label>
    </div>
    <p className="mt-4 text-sm text-slate-500">Do not include the patient’s name, phone number, or other identifying details in this case post.</p>
    <div className="mt-6 grid gap-2 sm:flex sm:gap-3"><button disabled={submitting} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto">{submitting ? "Posting…" : "Post open case"}</button><button type="button" onClick={() => router.back()} className="min-h-12 w-full rounded-xl border px-5 py-3 sm:w-auto">Cancel</button></div>
  </form></main>;
}

function Field({ name, label, type = "text", required = false, placeholder, min }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; min?: string }) {
  return <label className="grid min-w-0 gap-1 text-sm font-medium">{label}<input name={name} type={type} required={required} placeholder={placeholder} min={min} className="h-12 min-w-0 w-full rounded-xl border p-3" /></label>;
}
