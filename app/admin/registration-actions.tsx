"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type RegistrationHistory = {
  userId: string;
  createdAt: string;
  reregistered: number;
  blockingReason: string | null;
};

export function RegistrationActions({ item, onDecision }: { item: RegistrationHistory; onDecision: () => void }) {
  const [action, setAction] = useState<"reject" | "block" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${item.userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not update the application.");
      onDecision();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update the application.");
    } finally {
      setBusy(false);
    }
  }

  const registered = new Date(item.createdAt.replace(" ", "T") + (item.createdAt.includes("T") ? "" : "Z"));
  return <div className="mt-4 space-y-2 text-sm">
    <p>Registered {registered.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
    {Boolean(item.reregistered) && <div className="rounded-xl bg-amber-50 p-3">
      <p className="font-semibold">Re-registered after deletion</p>
      <p className="mt-1 break-words">Previous blocking reason · {item.blockingReason ?? "Unavailable"}</p>
    </div>}
    {action ? <div className="space-y-2">
      <label className="block">Reason to {action}
        <textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
      </label>
      <Button disabled={busy || reason.trim().length < 3} onClick={submit}>Confirm {action}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setAction(null); setError(""); }}>Cancel</Button>
    </div> : <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setAction("reject")}>Reject</Button>
      <Button variant="outline" onClick={() => setAction("block")}>Block</Button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
