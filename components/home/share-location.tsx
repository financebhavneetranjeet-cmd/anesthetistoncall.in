"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

export function ShareLocation({ onUpdated }: { onUpdated?: () => void }) {
  const [shared, setShared] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) {
        setChecking(false);
        setMessage("Location status could not be checked. You can retry with Mark My Location or stop sharing below.");
      }
    }, 10000);
    fetch("/api/availability/location", {cache:"no-store", signal: controller.signal}).then(async response => {
      const result = await response.json() as { locationShared?: boolean };
      if (!response.ok) throw new Error("Location status unavailable.");
      if (active) setShared(Boolean(result.locationShared));
    }).catch(() => {
      if (active) setMessage("Location status could not be checked. Please retry with Mark My Location or Stop Sharing Location.");
    }).finally(() => {
      clearTimeout(timeout);
      if (active) setChecking(false);
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);
  const [busy, setBusy] = useState(false);
  async function save(body: object) {
    const response = await fetch("/api/availability/location", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const result = await response.json() as { locationShared?: boolean; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? "Unable to save location. Please retry.");
    setShared(Boolean(result.locationShared));
    onUpdated?.();
  }
  async function share() {
    setBusy(true); setMessage("");
    try {
      if (!navigator.geolocation) throw new Error("Location is unavailable on this device.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }));
      await save({ share: true, latitude: position.coords.latitude, longitude: position.coords.longitude });
      setMessage(shared ? "Location updated to your current position. Only an approximate location is shown." : "Approximate location shared for 24 hours while you are available.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Location permission was denied or unavailable. Enable location access and retry.");
    } finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try { await save({ share: false }); setMessage("Location sharing stopped."); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="mb-3 text-sm text-slate-700">Share your approximate location with verified members while available. Your exact position is not shown.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || checking} onClick={() => void share()}><MapPin />{busy ? "Please wait…" : checking ? "Checking location…" : shared ? "Update Location" : "Mark My Location"}</Button><Button type="button" variant="outline" disabled={busy || checking} onClick={() => void stop()}>Stop Sharing Location</Button></div>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</div>;
}
