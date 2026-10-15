"use client";

import { BellRing } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DECISION_KEY = "aoc-notification-permission-decision";
const CRITICAL_PATHS = ["/cases/new", "/anaesthesia/", "/emergency/"];

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function fromBase64Url(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isCriticalFlow() {
  return CRITICAL_PATHS.some((path) => window.location.pathname.startsWith(path)) ||
    Boolean(document.querySelector('form[data-critical-flow="true"], [aria-busy="true"]'));
}

export function NotificationPermission({ manual = false }: { manual?: boolean }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const publicKey = useRef<string | null>(null);

  useEffect(() => {
    if (manual) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") {
      localStorage.setItem(DECISION_KEY, "denied");
      return;
    }
    if (Notification.permission === "default" && localStorage.getItem(DECISION_KEY)) return;
    let cancelled = false;
    const changed = () => { if (isCriticalFlow()) setOpen(false); };
    const prepare = async () => {
      try {
        const response = await fetch("/api/push-subscriptions", { cache: "no-store" });
        const result = await response.json() as { authenticated?: boolean; subscribed?: boolean; publicKey?: string | null };
        if (cancelled || !response.ok || !result.authenticated || !result.publicKey || isCriticalFlow()) return;
        publicKey.current = result.publicKey;
        if (Notification.permission === "granted") {
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(result.publicKey) });
          const saved = await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
          if (saved.ok) localStorage.setItem(DECISION_KEY, "granted");
          return;
        }
        if (!manual) window.setTimeout(() => { if (!cancelled && !isCriticalFlow()) setOpen(true); }, 1200);
      } catch {
        // Permission can be offered on the next safe app open.
      }
    };
    document.addEventListener("submit", changed, true);
    document.addEventListener("input", changed, true);
    void prepare();
    return () => {
      cancelled = true;
      document.removeEventListener("submit", changed, true);
      document.removeEventListener("input", changed, true);
    };
  }, [manual]);

  async function openSettings() {
    setMessage("");
    setOpen(true);
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage(!isStandalone() ? "For notifications on iPhone or iPad, add this site to your Home Screen and open it there." : "This browser does not support push notifications.");
      return;
    }
    if (Notification.permission === "denied") {
      setMessage("Enable in Settings: allow notifications for this site in your browser settings, then try again.");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/push-subscriptions", { cache: "no-store" });
      const result = await response.json() as { authenticated?: boolean; publicKey?: string | null };
      if (!response.ok || !result.authenticated) throw new Error("Sign in with your owner or admin account to enable notifications.");
      if (!result.publicKey) throw new Error("Push notifications are not configured on the server yet.");
      publicKey.current = result.publicKey;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load notification settings. Please try again.");
    } finally { setWorking(false); }
  }

  if (!open) return manual ? <button type="button" onClick={() => void openSettings()} className="m-4 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Enable owner / admin notifications</button> : null;

  async function allowNotifications() {
    if (working || !publicKey.current || isCriticalFlow()) return;
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        localStorage.setItem(DECISION_KEY, permission === "denied" ? "denied" : "dismissed");
        setMessage("Enable in Settings");
        window.setTimeout(() => setOpen(false), 2500);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(publicKey.current),
      });
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Unable to save notification access.");
      localStorage.setItem(DECISION_KEY, "granted");
      setMessage("Notifications are on");
      window.setTimeout(() => setOpen(false), 1400);
    } catch {
      setMessage("Could not enable notifications. Try again from Settings.");
      localStorage.setItem(DECISION_KEY, "dismissed");
      window.setTimeout(() => setOpen(false), 3000);
    } finally {
      setWorking(false);
    }
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="notification-permission-title" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center text-slate-950 shadow-2xl">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700"><BellRing className="size-6" aria-hidden="true" /></span>
      <h2 id="notification-permission-title" className="mt-4 text-xl font-bold">Allow notifications for this site</h2>
      <p className="mt-2 text-sm text-slate-600">{manual ? "Receive alerts for new registrations and approval requests on this device." : "Receive app notifications on this device."}</p>
      {message ? <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{message}</p> : <button type="button" disabled={working} onClick={() => void allowNotifications()} className="mt-5 min-h-12 w-full rounded-xl bg-blue-700 px-5 font-bold text-white disabled:opacity-60">{working ? "Enabling…" : "Allow Notifications"}</button>}
      <button type="button" onClick={() => { localStorage.setItem(DECISION_KEY, "dismissed"); setOpen(false); }} className="mt-4 text-sm underline">Close</button>
    </section>
  </div>;
}
