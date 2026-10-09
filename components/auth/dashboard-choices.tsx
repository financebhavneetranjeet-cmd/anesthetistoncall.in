"use client";

import { useState } from "react";

export function DashboardChoices({ roles, currentRole }: { roles: ("admin" | "anesthetist")[]; currentRole: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open(role: "admin" | "anesthetist") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/switch-dashboard", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }), credentials: "same-origin",
      });
      const result = await response.json() as { redirectTo?: string; error?: { message?: string } };
      if (!response.ok || !result.redirectTo) throw new Error(result.error?.message ?? "Unable to open dashboard.");
      window.location.assign(result.redirectTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open dashboard.");
      setBusy(false);
    }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{roles.map(role => <button key={role} type="button" disabled={busy}
      onClick={() => void open(role)} aria-current={currentRole === role ? "page" : undefined}
      className="min-h-11 rounded-xl border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-60">
      {role === "admin" ? "Admin Controls" : "Anaesthetist Dashboard"}
    </button>)}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
