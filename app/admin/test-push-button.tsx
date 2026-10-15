"use client";

import { useState } from "react";

export function TestPushButton() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  async function sendTest() {
    if (sending) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/notifications/test", { method: "POST" });
      const data = await response.json() as { message?: string; error?: { message?: string }; result?: { accepted: number; failed: number; expired: number } };
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to send a test notification.");
      const counts = data.result;
      setMessage(`${data.message ?? "Test completed."}${counts ? ` Accepted: ${counts.accepted}. Failed: ${counts.failed}. Expired: ${counts.expired}.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send a test notification. Try again.");
    } finally { setSending(false); }
  }
  return <div className="m-4 max-w-xl">
    <button type="button" disabled={sending} onClick={() => void sendTest()} className="rounded-xl border border-blue-700 px-5 py-3 font-semibold text-blue-700 disabled:opacity-60">{sending ? "Sending…" : "Send test to owner / admins"}</button>
    {message && <p role="status" className="mt-2 text-sm text-slate-700">{message}</p>}
  </div>;
}
