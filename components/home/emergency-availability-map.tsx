"use client";

import { useEffect, useRef, useState } from "react";

type Point = { approximateLocation: { latitude: number; longitude: number; precision: "approximate" } | null };
type Maps = { Map: new(element: HTMLElement, options: object) => unknown; Marker: new(options: object) => unknown; LatLngBounds: new() => { extend(point: { lat: number; lng: number }): void } };

export function EmergencyAvailabilityMap({ anaesthetists }: { anaesthetists: Point[] }) {
  const element = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const points = anaesthetists.flatMap((item) => item.approximateLocation ? [item.approximateLocation] : []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!points.length || !element.current) return;
        const response = await fetch("/api/places/config");
        const payload = await response.json() as { apiKey?: string; error?: { message?: string } };
        if (!response.ok || !payload.apiKey) throw new Error(payload.error?.message ?? "Map is unavailable.");
        const browserWindow = window as Window & { google?: { maps?: Maps } };
        if (!browserWindow.google?.maps) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.getElementById("emergency-availability-map-script") as HTMLScriptElement | null;
            if (existing) {
              existing.addEventListener("load", () => resolve(), { once: true });
              existing.addEventListener("error", () => reject(new Error("Map could not load.")), { once: true });
              return;
            }
            const script = document.createElement("script");
            script.id = "emergency-availability-map-script";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(payload.apiKey)}&loading=async`;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Map could not load."));
            document.head.appendChild(script);
          });
        }
        if (!active || !element.current || !browserWindow.google?.maps) return;
        const maps = browserWindow.google.maps;
        const bounds = new maps.LatLngBounds();
        const map = new maps.Map(element.current, { center: { lat: points[0].latitude, lng: points[0].longitude }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
        points.forEach((point) => {
          const position = { lat: point.latitude, lng: point.longitude };
          new maps.Marker({ map, position, title: "Available anaesthetist — approximate location", label: "A" });
          bounds.extend(position);
        });
        if (points.length > 1 && "fitBounds" in (map as object)) (map as { fitBounds(bounds: unknown): void }).fitBounds(bounds);
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    })();
    return () => { active = false; };
  }, [points.map((point) => `${point.latitude},${point.longitude}`).join("|")]);

  if (!points.length) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No approximate locations are currently shared.</p>;
  return <div className="overflow-hidden rounded-2xl border bg-slate-100"><div ref={element} className="h-56 w-full sm:h-72" aria-label="Approximate locations of currently available anaesthetists" />{error && <p role="alert" className="border-t bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="border-t bg-white px-4 py-3 text-xs text-slate-500">A = available anaesthetist. Markers are deliberately approximate and contain no identity details.</p></div>;
}
