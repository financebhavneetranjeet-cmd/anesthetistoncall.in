"use client";
import { useId, useState } from "react";
type Props = { name?: string; type?: string; required?: boolean; className?: string; value?: string; onChange?: (event: { target: { value: string } }) => void };
/** Uses the existing HH:mm/local datetime form contract while presenting a 12-hour clock. */
export function TimeField({ name, type = "time", required, className, value, onChange }: Props) {
  const id = useId();
  const [local, setLocal] = useState("");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const current = value ?? local;
  const dateTime = type === "datetime-local";
  const time = (dateTime ? draft.split("T")[1] : draft) || "";
  const hour = time ? Number(time.slice(0, 2)) % 12 || 12 : "";
  const minute = time.slice(3, 5) || "00";
  const period = Number(time.slice(0, 2)) >= 12 ? "PM" : "AM";
  const update = (h: string | number, m: string, p: string, date = draft.split("T")[0] || "") => {
    const next = String(Number(h) % 12 + (p === "PM" ? 12 : 0)).padStart(2, "0") + ":" + m;
    setDraft(dateTime ? date + "T" + next : next);
  };
  const shownTime = (dateTime ? current.split("T")[1] : current) || "";
  const display = shownTime ? (dateTime ? current.split("T")[0] + " · " : "") + (Number(shownTime.slice(0, 2)) % 12 || 12) + ":" + shownTime.slice(3, 5) + (Number(shownTime.slice(0, 2)) >= 12 ? " PM" : " AM") : "";
  return <span className="block min-w-0 w-full">
    <span className="flex min-w-0 items-center gap-1 rounded-xl border bg-white p-1 text-slate-900">
      <input aria-label={name || "Time"} required={required} readOnly value={display} placeholder="Choose time AM/PM" onClick={() => { setDraft(current); setOpen(true); }} onFocus={() => { if (!open) { setDraft(current); setOpen(true); } }} className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm" />
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { setDraft(current); setOpen(!open); }} className="min-h-11 shrink-0 rounded-lg bg-blue-700 px-3 font-semibold text-white">Set</button>
    </span>
    <input type="hidden" name={name} value={current} />
    <select aria-label="Confirmed time" required={required} value={current} onChange={() => {}} onInvalid={() => { setDraft(current); setOpen(true); }} className="sr-only"><option value="">Choose a time</option>{current && <option value={current}>{display}</option>}</select>
    {open && <span id={id} role="group" aria-label="Set time" className="mt-2 grid min-w-0 gap-2 rounded-xl border bg-white p-2 text-slate-900">
      {dateTime && <input aria-label="Date" type="date" value={draft.split("T")[0] || ""} onChange={e => update(hour || 12, minute, period, e.target.value)} className="h-11 min-w-0 w-full rounded-lg border px-2" />}
      <span className="grid grid-cols-3 gap-1">
        <select aria-label="Hour" value={hour} onChange={e => update(e.target.value, minute, period)} className="h-11 min-w-0 rounded-lg border"><option value="" disabled>Hour</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>
        <select aria-label="Minute" value={minute} onChange={e => update(hour || 12, e.target.value, period)} className="h-11 min-w-0 rounded-lg border">{Array.from({ length: 60 }, (_, i) => <option key={i}>{String(i).padStart(2, "0")}</option>)}</select>
        <select aria-label="AM or PM" value={period} onChange={e => update(hour || 12, minute, e.target.value)} className="h-11 min-w-0 rounded-lg border"><option>AM</option><option>PM</option></select>
      </span>
      <span className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border px-3">Cancel</button>
        <button type="button" disabled={!time || (dateTime && !/^\d{4}-\d{2}-\d{2}T/.test(draft))} onClick={() => { setLocal(draft); onChange?.({ target: { value: draft } }); setOpen(false); }} className="min-h-11 rounded-lg bg-blue-700 px-4 font-bold text-white disabled:opacity-50">Set</button>
      </span>
    </span>}
  </span>;
}
