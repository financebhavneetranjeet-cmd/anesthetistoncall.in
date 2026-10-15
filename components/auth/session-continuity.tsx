"use client";

import { useEffect, useState } from "react";

export function SessionContinuity() {
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let knownSession = false;
    const check = async () => {
      if (inFlight || document.visibilityState !== "visible" || !navigator.onLine) return;
      inFlight = true;
      try {
        const response = await fetch("/api/account/session", { method: "POST", cache: "no-store", credentials: "same-origin" });
        if (!active) return;
        if (response.status === 401) {
          setSignedIn(false);
          const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
          if (knownSession || window.location.pathname === "/account/pending" || (window.location.pathname === "/" && standalone)) window.location.replace("/login");
          return;
        }
        if (!response.ok) return;
        const data = await response.json() as { redirectTo: string };
        if (!active) return;
        knownSession = true;
        setSignedIn(true);
        const path = window.location.pathname;
        // Handle existing installations whose cached start_url was the home page.
        const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
        if ((path === "/account/pending" && data.redirectTo !== path) || path === "/login" || (path === "/" && standalone)) {
          window.location.replace(data.redirectTo);
        }
      } catch {
        // Connectivity loss is not evidence that the user's session was revoked.
      } finally {
        inFlight = false;
      }
    };
    const onResume = () => { void check(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
      else onResume();
    };
    onResume();
    const timer = window.setInterval(onResume, 30_000);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/session", { method: "DELETE", cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Unable to log out. Please retry while online.");
      window.location.replace("/login");
    } catch {
      setError("Unable to log out. Please retry while online.");
      setBusy(false);
    }
  }

  if (!signedIn) return null;
  return <div className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 text-sm text-slate-600">
    <span>Signed in on this device</span>
    <button type="button" disabled={busy} onClick={() => void logout()} className="min-h-11 px-3 font-semibold text-blue-700 underline disabled:opacity-50">{busy ? "Logging out…" : "Log out"}</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
