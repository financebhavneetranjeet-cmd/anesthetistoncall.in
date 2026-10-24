"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Draft = { recipients: { name: string; number: string }[]; message: string; requesterAvailable?: boolean };
export function ReplacementSms({ caseId, autoLoad = true }: { caseId: string; autoLoad?: boolean }) {
  const checkedUntil = useRef(0);
  const generation = useRef(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ios, setIos] = useState(false);
  const load = useCallback(async () => {
    const currentGeneration = ++generation.current;
    checkedUntil.current = 0;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/replacements/${encodeURIComponent(caseId)}/sms`, { cache: "no-store" });
      const data = await response.json() as Draft & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to prepare SMS.");
      if (currentGeneration !== generation.current) return;
      checkedUntil.current = Date.now() + 15000;
      setDraft(data);
    } catch (cause) { if (currentGeneration === generation.current) setError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { if (currentGeneration === generation.current) setBusy(false); }
  }, [caseId]);
  useEffect(() => {
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    if (autoLoad) void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
      else { generation.current++; checkedUntil.current = 0; setDraft(null); setBusy(false); }
    };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => { generation.current++; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [autoLoad, load]);
  const smsUrl = (numbers: string[]) => `sms:${numbers.join(",")}${ios ? "&" : "?"}body=${encodeURIComponent(draft?.message ?? "")}`;
  function openSms(event: React.MouseEvent<HTMLAnchorElement>) {
    // Keep native link navigation in the user's tap: awaiting fetch here can
    // lose Android's activation required for opening an external messaging app.
    if (busy || Date.now() >= checkedUntil.current) {
      event.preventDefault();
      void load();
      return;
    }
  }
  const button = "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-bold text-white";
  return <section className="mt-4 rounded-2xl border bg-white p-4">
    <button type="button" onClick={() => void load()} disabled={busy} className={`${button} disabled:opacity-50`}>{busy ? "Checking available numbers…" : draft ? "Refresh available numbers" : "Check available anesthetists"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {draft && <p role="status" className="mt-3 font-semibold">Other anaesthetists available for SMS: {draft.recipients.length}</p>}
    {draft?.requesterAvailable && <p className="mt-2 text-sm text-slate-600">Your availability is included in the homepage count. Your own number is excluded from replacement messages.</p>}
    {draft && (draft.recipients.length ? <>
      <p className="mt-3 font-semibold">{draft.recipients.length} other anaesthetists available now in the hospital’s city</p>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm">{draft.message}</p>
      <div className="mt-3 grid gap-2">{Array.from({ length: Math.ceil(draft.recipients.length / 10) }, (_, batch) => {
        const recipients = draft.recipients.slice(batch * 10, batch * 10 + 10);
        return <a key={batch} href={smsUrl(recipients.map(item => item.number))} onClick={openSms} className={button}>Send SMS to the available anesthetists — {recipients.length} recipients{draft.recipients.length > 10 ? ` (batch ${batch + 1})` : ""}</a>;
      })}</div>
      <div className="mt-3"><p className="text-sm font-semibold text-blue-700">Available phone numbers — send individually</p><ul className="mt-2 space-y-2">{draft.recipients.map(item => <li key={item.number}><a href={smsUrl([item.number])} onClick={openSms} className="inline-flex min-h-11 items-center break-all text-sm text-blue-700 underline">SMS {item.name} · {item.number}</a></li>)}</ul></div>
      <p className="mt-3 text-xs text-slate-600">Review and tap Send in your phone’s SMS app. Group-message behaviour and SMS charges depend on your phone and provider. Use individual links if your app does not support multiple recipients. Delivery is not confirmed by this website.</p>
    </> : <p role="status" className="mt-3 text-sm text-slate-600">No other anaesthetists with a valid mobile number are available now in this city. SMS will be available when another verified anaesthetist shares availability.</p>)}
  </section>;
}
