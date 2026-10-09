"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CURRENT_RELEASE } from "@/lib/release";

type Release = { version: string; name: string };

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 60 * 1000;
const LAST_ACTIVATED_KEY = "aoc-last-activated-release";

function isNewer(candidate: string, current: string) {
  const next = candidate.split(".").map(Number);
  const active = current.split(".").map(Number);
  for (let index = 0; index < Math.max(next.length, active.length); index += 1) {
    const difference = (next[index] ?? 0) - (active[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function waitForState(worker: ServiceWorker, state: ServiceWorkerState) {
  if (worker.state === state) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("The update is taking longer than expected.")), UPDATE_TIMEOUT_MS);
    const changed = () => {
      if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", changed);
        reject(new Error("The update could not be prepared."));
      } else if (worker.state === state) {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", changed);
        resolve();
      }
    };
    worker.addEventListener("statechange", changed);
  });
}

async function getRegistration() {
  return await navigator.serviceWorker.getRegistration("/")
    ?? await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

function waitForWaiting(registration: ServiceWorkerRegistration) {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  return new Promise<ServiceWorker>((resolve, reject) => {
    let watched: ServiceWorker | null = null;
    const timeout = window.setTimeout(() => finish(new Error("The update is still downloading. Please keep the app open and retry.")), UPDATE_TIMEOUT_MS);
    const finish = (error?: Error, worker?: ServiceWorker) => {
      window.clearTimeout(timeout);
      registration.removeEventListener("updatefound", inspect);
      watched?.removeEventListener("statechange", inspect);
      if (error) reject(error);
      else if (worker) resolve(worker);
    };
    const inspect = () => {
      if (registration.waiting) return finish(undefined, registration.waiting);
      const installing = registration.installing;
      if (installing && installing !== watched) {
        watched?.removeEventListener("statechange", inspect);
        watched = installing;
        watched.addEventListener("statechange", inspect);
      }
      if (watched?.state === "installed") {
        window.setTimeout(inspect, 0);
      } else if (watched?.state === "redundant") {
        finish(new Error("The downloaded update could not be installed."));
      }
    };
    registration.addEventListener("updatefound", inspect);
    inspect();
  });
}

export function PwaUpdate() {
  const [available, setAvailable] = useState<Release | null>(null);
  const [message, setMessage] = useState("");
  const [updating, setUpdating] = useState(false);
  const busy = useRef(false);
  const dirty = useRef(false);
  const pendingRelease = useRef<Release | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (sessionStorage.getItem("aoc-reloaded-release") === CURRENT_RELEASE.version) {
      sessionStorage.removeItem("aoc-reloaded-release");
      sessionStorage.removeItem("aoc-update-in-progress");
      localStorage.setItem(LAST_ACTIVATED_KEY, CURRENT_RELEASE.version);
    }

    const showWhenSafe = () => {
      if (!busy.current && !dirty.current && pendingRelease.current) {
        setAvailable(pendingRelease.current);
      }
    };
    const markDirty = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest("form")) dirty.current = true;
    };
    const startSubmit = (event: Event) => {
      if (!(event.target as HTMLElement | null)?.closest("form")) return;
      busy.current = true;
      window.setTimeout(() => {
        busy.current = false;
        dirty.current = false;
        showWhenSafe();
      }, 15_000);
    };
    const leaveForm = (event: Event) => {
      const link = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!link) return;
      dirty.current = false;
      window.setTimeout(showWhenSafe, 0);
    };
    const pageVisible = () => { if (document.visibilityState === "visible") void check(); };
    const check = async () => {
      try {
        const response = await fetch(`/api/app-version?at=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const release = await response.json() as Release;
        if (!release.version || !release.name || !isNewer(release.version, CURRENT_RELEASE.version)) return;
        if (localStorage.getItem(LAST_ACTIVATED_KEY) === release.version) return;
        const registration = await getRegistration();
        await registration.update();
        if (!registration.waiting && !registration.installing) return;
        pendingRelease.current = release;
        showWhenSafe();
      } catch {
        // A failed background check is retried on the next interval or app launch.
      }
    };

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", startSubmit, true);
    document.addEventListener("click", leaveForm, true);
    document.addEventListener("visibilitychange", pageVisible);
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", startSubmit, true);
      document.removeEventListener("click", leaveForm, true);
      document.removeEventListener("visibilitychange", pageVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (!available) return null;

  async function updateNow() {
    if (updating || !available) return;
    setUpdating(true);
    setMessage(navigator.onLine ? "Downloading and preparing the update…" : "You are offline. Reconnect to update, then tap Update Now again.");
    if (!navigator.onLine) { setUpdating(false); return; }
    try {
      const registration = await getRegistration();
      await registration.update();
      const waiting = registration.waiting ?? await waitForWaiting(registration);
      await waitForState(waiting, "installed");

      const inProgress = sessionStorage.getItem("aoc-update-in-progress");
      if (inProgress === available.version) return;
      sessionStorage.setItem("aoc-update-in-progress", available.version);
      const changed = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("The update is taking longer than expected.")), UPDATE_TIMEOUT_MS);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
      waiting.postMessage({ type: "SKIP_WAITING" });
      await changed;
      localStorage.setItem(LAST_ACTIVATED_KEY, available.version);
      sessionStorage.removeItem("aoc-update-in-progress");
      sessionStorage.setItem("aoc-reloaded-release", available.version);
      window.location.reload();
    } catch (cause) {
      sessionStorage.removeItem("aoc-update-in-progress");
      setMessage(`${(cause as Error).message} Check your connection and tap Update Now to retry.`);
      setUpdating(false);
    }
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/65 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="update-title" aria-describedby="update-description" className="w-full max-w-md rounded-2xl bg-white p-6 text-center text-slate-950 shadow-2xl">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700"><RefreshCw className={`size-6 ${updating ? "animate-spin" : ""}`} aria-hidden="true" /></span>
      <h2 id="update-title" className="mt-4 text-2xl font-bold">New Version Available</h2>
      <p id="update-description" className="mt-2 text-slate-600">Version {available.version} · {available.name}</p>
      {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
      <button type="button" disabled={updating} onClick={() => void updateNow()} className="mt-5 min-h-12 w-full rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">Update Now</button>
    </section>
  </div>;
}
