"use client";
import { TimeField } from "@/components/time-field";

import Link from "@/components/native-link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Availability = {
  status: "available" | "unavailable";
  availableUntil: string | null;
  preferredEmergencyFeeRupees: number | null;
  locationShared: boolean;
  notificationsEnabled: boolean;
};

export function AvailabilityPanel() {
  const [until, setUntil] = useState("");
  const [fee, setFee] = useState("");
  const [current, setCurrent] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCurrent = useCallback(async () => {
    try {
      const response = await fetch("/api/availability", { cache: "no-store" });
      const data = await response.json() as { availability?: Availability; error?: { message?: string } };
      if (!response.ok || !data.availability) throw new Error(data.error?.message ?? "Unable to load availability.");
      setCurrent(data.availability);
      if (data.availability.availableUntil) {
        const date = new Date(data.availability.availableUntil);
        const offset = date.getTimezoneOffset() * 60_000;
        setUntil(new Date(date.getTime() - offset).toISOString().slice(0, 16));
      }
      setFee(data.availability.preferredEmergencyFeeRupees ? String(data.availability.preferredEmergencyFeeRupees) : "");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCurrent(); }, [loadCurrent]);
  useEffect(() => {
    if (current?.status !== "available" || !current.availableUntil) return;
    const delay = Math.max(0, new Date(current.availableUntil).getTime() - Date.now() + 50);
    const timer = window.setTimeout(() => void loadCurrent(), delay);
    return () => window.clearTimeout(timer);
  }, [current, loadCurrent]);

  async function save(date: Date, coords?: { latitude: number; longitude: number }) {
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availableUntil: date.toISOString(), preferredEmergencyFeeRupees: fee ? Number(fee) : undefined, ...coords }),
      });
      const data = await response.json() as { availability?: { status: "available"; availableUntil: string }; error?: { message?: string } };
      if (!response.ok || !data.availability) throw new Error(data.error?.message ?? "Unable to update availability.");
      setCurrent({ status: "available", availableUntil: data.availability.availableUntil, notificationsEnabled: true, preferredEmergencyFeeRupees: fee ? Number(fee) : null, locationShared: Boolean(coords) });
      const permissionNote = "Notification" in window && Notification.permission === "granted" ? " Case notifications and browser alerts are on." : " Case notifications are on in the bell.";
      setMessage(`You are visible until ${date.toLocaleString()}.${permissionNote}${coords ? " Approximate location is used only for nearby SOS matching." : " Location was not shared; nearby matching may be less accurate."}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update() {
    const date = new Date(until);
    if (Number.isNaN(date.getTime())) return setError("Choose a valid expiry time.");
    setBusy(true);
    setError(null);
    setMessage(null);
    if (!navigator.geolocation) return save(date);
    navigator.geolocation.getCurrentPosition(
      (position) => void save(date, { latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => void save(date),
      { enableHighAccuracy: false, timeout: 7000 },
    );
  }

  async function clear() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/availability", { method: "DELETE" });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to clear availability.");
      setCurrent({ status: "unavailable", availableUntil: null, notificationsEnabled: false, preferredEmergencyFeeRupees: null, locationShared: false });
      setMessage("Availability, case notifications and temporary matching location switched off. Previous notifications remain in your history.");
      setUntil("");
      setFee("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-4 text-slate-950 sm:p-8">
      <section className="mx-auto max-w-xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="size-4" />Back home</Link>
        <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:mt-6 sm:p-9">
          <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Clock3 /></span>
          <h1 className="mt-5 font-serif text-2xl font-semibold sm:text-3xl">Available now</h1>
          <p className="mt-2 leading-6 text-slate-600">Publish a temporary window of up to 24 hours. Approximate location and fee preference improve emergency matching and are cleared when availability is switched off.</p>
          {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" />Loading current status…</p> : current?.status === "available" && current.availableUntil ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong className="block">Currently available · Notifications ON</strong><span>Until {new Date(current.availableUntil).toLocaleString()}{current.locationShared ? " · Approximate location shared" : ""}</span></div> : <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Currently unavailable · New case notifications OFF</p>}
          <div className="mt-7 grid gap-2">
            <Label>Available until</Label>
            <TimeField type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} />
            <Label className="mt-2">Preferred emergency fee (optional)</Label>
            <Input type="number" min="1" placeholder="₹" value={fee} onChange={(event) => setFee(event.target.value)} />
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button disabled={busy || loading} onClick={update} className="h-12 rounded-xl bg-blue-700">{busy && <Loader2 className="animate-spin" />}Publish availability</Button>
            <Button disabled={busy || loading || current?.status !== "available"} onClick={clear} variant="outline" className="h-12 rounded-xl">Switch off</Button>
          </div>
          {message && <p className="mt-5 flex gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="size-5 shrink-0" />{message}</p>}
          {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        </div>
      </section>
    </main>
  );
}
