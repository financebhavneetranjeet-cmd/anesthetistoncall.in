"use client";
import { useCallback, useEffect, useState } from "react";
import { ShareLocation } from "@/components/home/share-location";
import Link from "@/components/native-link";
import { availabilityDates, validateAvailabilityRange, formatAvailabilityTime, withTimePeriod, availabilityRange } from "@/lib/availability-time";
type Slot = { id: string; status: string; startAt: string; endAt: string; preferredArea?: string };
type Booking = { id: string; procedureName: string; hospitalName: string; startAt: string; endAt?: string; durationMinutes?: number; bookingStatus: string; status: string; finalFeePaise: number };
type CalendarResponse = { ok?: boolean; slots?: Slot[]; bookings?: Booking[]; error?: { message?: string } };
const formatTime = formatAvailabilityTime;
function AvailabilityTimePicker({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [face, setFace] = useState<"hour" | "minute">("hour");
  const hour = value ? Number(value.slice(0, 2)) % 12 || 12 : 12;
  const minute = value ? value.slice(3) : "00";
  const period = value && Number(value.slice(0, 2)) >= 12 ? "PM" : "AM";
  const update = (h: number, m: string, p: string) => onChange(withTimePeriod(`${String(h).padStart(2, "0")}:${m}`, p));
  return <div><label htmlFor={`${name}-hour`} className="text-base font-semibold text-black">{label}</label>
    <input type="hidden" name={name} value={value} />
    <div className="mt-1 flex gap-2">
      <div className="flex h-12 min-w-0 flex-1 items-center rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-2 text-[#1B5E20]">
        <select id={`${name}-hour`} aria-label={`${label} hour`} required value={value ? hour : ""} className="min-w-0 flex-1 aoc-light-green bg-[#E8F5E9] text-[#1B5E20]" onChange={e => update(Number(e.target.value), minute, period)}><option value="" disabled>Hour</option>{Array.from({length:12},(_,i)=><option key={i+1}>{i+1}</option>)}</select>
        <span>:</span><select aria-label={`${label} minute`} value={minute} className="min-w-0 flex-1 aoc-light-green bg-[#E8F5E9] text-[#1B5E20]" onChange={e => update(hour,e.target.value,period)}>{Array.from({length:60},(_,i)=><option key={i} value={String(i).padStart(2,"0")}>{String(i).padStart(2,"0")}</option>)}</select>
        <button type="button" aria-label={`Open ${label} clock`} aria-expanded={open} className="min-h-11 px-2" onClick={()=>{setOpen(!open);setFace("hour");}}>◷</button>
      </div>
      <select aria-label={`${label} AM or PM`} value={period} className="h-12 rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-3 text-base text-[#1B5E20]" onChange={e => update(hour,minute,e.target.value)}><option>AM</option><option>PM</option></select>
    </div>
    {open && <div role="group" aria-label={`${label} clock picker`} className="mt-2 rounded-xl border bg-white p-3">
      <div className="flex justify-between"><button type="button" onClick={()=>setFace("hour")} aria-pressed={face === "hour"}>Hours</button><button type="button" onClick={()=>setFace("minute")} aria-pressed={face === "minute"}>Minutes</button><button type="button" onClick={()=>setOpen(false)}>Set</button></div>
      <div className="relative mx-auto mt-3 aspect-square w-full max-w-64 rounded-full bg-slate-50" aria-label={face === "hour" ? "12-hour clock" : "Minute clock"}>
        {(face === "hour" ? Array.from({length:12},(_,i)=>i+1) : Array.from({length:12},(_,i)=>i*5)).map(n => { const angle = (face === "hour" ? n / 12 : n / 60) * Math.PI * 2; return <button key={n} type="button" className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-white text-base" style={{left:`${50 + 39*Math.sin(angle)}%`,top:`${50 - 39*Math.cos(angle)}%`}} onClick={()=>{if(face === "hour"){update(n,minute,period);setFace("minute");}else{update(hour,String(n).padStart(2,"0"),period);setOpen(false);}}}>{face === "hour" ? n : String(n).padStart(2,"0")}</button>; })}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-semibold">{hour}:{minute} {period}</span>
      </div>
    </div>}
  </div>;
}
export function CalendarDashboard({ role }: { role: string }) {
  const [slots, setSlots] = useState<Slot[]>([]), [bookings, setBookings] = useState<Booking[]>([]);
  const [msg, setMsg] = useState(""), [saving, setSaving] = useState(false);
  const [startTime, setStartTime] = useState(""), [endTime, setEndTime] = useState("");
  const [day, setDay] = useState("today"), [dates, setDates] = useState(() => availabilityDates());
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/calendar", { cache: "no-store" }), d = await r.json() as CalendarResponse;
      if (!r.ok || d.ok === false) throw new Error(d.error?.message || "Could not load availability.");
      setSlots(d.slots ?? []); setBookings(d.bookings ?? []);
    } catch (error) { setMsg(error instanceof Error ? error.message : "Could not load availability. Please try again."); }
  }, []);
  useEffect(() => { const initial = setTimeout(() => void load(), 0); const timer = setInterval(() => { setDates(availabilityDates()); void load(); }, 30_000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (saving) return;
    const form = e.currentTarget, f = new FormData(form), currentDates = availabilityDates();
    setDates(currentDates);
    const date = day === "tomorrow" ? currentDates.tomorrow : currentDates.today;
    const range = availabilityRange(date, startTime, endTime);
    if (range.error || !range.startAt || !range.endAt) { setMsg(range.error || "Choose valid times."); return; }
    const start = new Date(range.startAt), end = new Date(range.endAt);
    const error = validateAvailabilityRange(range.startAt, range.endAt);
    if (error) { setMsg(error); return; }
    setSaving(true); setMsg("");
    try {
      const r = await fetch("/api/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: f.get("status"), startAt: start.toISOString(), endAt: end.toISOString(), preferredArea: "Amritsar" }) });
      const d = await r.json() as CalendarResponse;
      if (!r.ok || d.ok === false) throw new Error(d.error?.message || "Could not save availability. Please try again.");
      await load(); setMsg("Availability saved.");
    } catch (error) { setMsg(error instanceof Error ? error.message : "Could not save availability. Check your connection and try again."); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    try {
      const r = await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" }), d = await r.json() as CalendarResponse;
      if (!r.ok || d.ok === false) throw new Error(d.error?.message || "Could not remove availability.");
      await load(); setMsg("Availability removed.");
    } catch (error) { setMsg(error instanceof Error ? error.message : "Could not remove availability."); }
  }
  const preview = availabilityRange(day === "tomorrow" ? dates.tomorrow : dates.today, startTime, endTime);
  const field = "mt-1 h-12 w-full min-w-0 rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-3 text-base text-[#1B5E20]";
  return <main className="aoc-availability min-h-dvh bg-slate-50 p-3 sm:p-8"><div className="mx-auto max-w-5xl">
    <Link href="/cases" className="font-semibold text-blue-700">← Cases</Link>
    <h1 className="mt-4 text-3xl font-bold text-black">Show Your Availability</h1>
    {role === "anesthetist" && <form onSubmit={save} className="mt-5 grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2">
      <label className="text-base font-semibold text-black">Status<select name="status" className={field}><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>
      <label className="text-base font-semibold text-black">Location<input value="Amritsar" readOnly className={field} /></label>
      <fieldset className="sm:col-span-2"><legend className="mb-2 text-base font-semibold text-black">Day</legend><div className="grid grid-cols-2 gap-3">{["today", "tomorrow"].map(value => <button key={value} type="button" aria-pressed={day === value} onClick={() => { setDay(value); setDates(availabilityDates()); setMsg(""); }} className={`min-h-12 rounded-xl border p-3 text-base font-semibold ${day === value ? "border-blue-700 bg-blue-700 text-white" : "bg-white text-black"}`}>{value === "today" ? "Today" : "Tomorrow"}</button>)}</div><p className="mt-2 text-sm text-black">{new Date(`${day === "tomorrow" ? dates.tomorrow : dates.today}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" })}</p></fieldset>
      <div><AvailabilityTimePicker name="start" label="Start Time" value={startTime} onChange={setStartTime} /><button type="button" className="mt-2 min-h-11 rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-4 font-semibold text-[#1B5E20]" onClick={() => { const now = new Date(); setDay("today"); setDates(availabilityDates(now)); setStartTime(now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })); setMsg(""); }}>Now</button></div>
      <div><AvailabilityTimePicker name="end" label="End Time" value={endTime} onChange={setEndTime} /><p aria-live="polite" className="mt-2 text-sm text-black">{preview.endDate ? `End Date: ${new Date(`${preview.endDate}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" })}${preview.nextDay ? " · Next Day" : ""}` : startTime && endTime ? preview.error : "End Date is calculated automatically."}</p></div>
      <button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-blue-700 p-3 text-base font-bold text-white disabled:opacity-60 sm:col-span-2">{saving ? "Saving…" : "Add Availability"}</button>
      <div className="sm:col-span-2"><ShareLocation onUpdated={() => void load()} /></div>
    </form>}
    {msg && <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-blue-50 p-3">{msg}</p>}
    {role === "anesthetist" && <><h2 className="mt-7 text-xl font-bold text-black">My availability</h2><div className="mt-3 space-y-2">{slots.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3"><span><b className="capitalize">{s.status}</b> · {formatTime(s.startAt)} – {formatTime(s.endAt)} {s.preferredArea ? `· ${s.preferredArea}` : ""}</span><button type="button" onClick={() => void remove(s.id)} className="min-h-11 px-3 text-red-700">Remove</button></div>)}{!slots.length && <p className="rounded-xl border bg-white p-4">No availability added yet.</p>}</div></>}
    <h2 className="mt-7 text-xl font-bold text-black">Confirmed & upcoming cases</h2><div className="mt-3 grid gap-3">{bookings.map(b => <article key={b.id} className="rounded-2xl border bg-white p-4"><b>{b.hospitalName} → {b.procedureName}</b><p>{formatTime(b.startAt)} · {b.durationMinutes ?? "Booked"} min</p><p className="text-sm capitalize text-blue-700">{b.bookingStatus ?? b.status}{b.finalFeePaise ? ` · ₹${(b.finalFeePaise / 100).toLocaleString("en-IN")}` : ""}</p></article>)}{!bookings.length && <p className="rounded-2xl border bg-white p-5">No upcoming bookings.</p>}</div>
  </div></main>;
}
