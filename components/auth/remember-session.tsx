"use client";

import { useEffect } from "react";

export function RememberSession() {
  useEffect(() => {
    let lastSuccess = 0;
    let pending = false;
    const renew = async () => {
      if (document.visibilityState === "hidden" || pending || Date.now() - lastSuccess < 86_400_000) return;
      pending = true;
      try {
        const response = await fetch("/api/session/refresh", { method: "POST", credentials: "same-origin", cache: "no-store" });
        if (response.ok) lastSuccess = Date.now();
      } catch { /* Retry on the next foreground event after connection recovery. */ }
      finally { pending = false; }
    };
    void renew();
    const foreground = () => { void renew(); };
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, []);
  return null;
}
