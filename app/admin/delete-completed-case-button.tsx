"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCompletedCaseButton({ caseId, procedure, onDeleted }: { caseId: string; procedure: string; onDeleted?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function remove() {
    if (pending.current || !window.confirm(`Delete case “${procedure}” from the case list? Clinical, payment and audit records will be retained.`)) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}/delete`, { method: "DELETE" });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) { setMessage(result.error?.message ?? "Unable to delete case."); return; }
      onDeleted?.();
      router.refresh();
    } catch { setMessage("Unable to connect. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div><button type="button" disabled={busy} onClick={() => void remove()} aria-label={`Delete case: ${procedure}`} className="min-h-11 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">{busy ? "Deleting…" : "Delete"}</button>{message && <p role="alert" className="mt-2 text-sm text-red-700">{message}</p>}</div>;
}
