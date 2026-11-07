"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "@/components/native-link";
import { CheckCircle2, Clock3, IndianRupee } from "lucide-react";
type Data = {
  progress: {
    postedFeePaise: number;
    finalAgreedFeePaise: number | null;
    feeLockedAt: string | null;
    estimatedDurationMinutes: number;
    actualDurationMinutes: number | null;
    otStatus: string;
    completionRequestedAt: string | null;
    completionConfirmedAt: string | null;
  };
  bid: { proposedFeePaise: number | null } | null;
  rating: { rating: number; feedback: string | null } | null;
  audit: Array<{ eventType: string; createdAt: string }>;
  viewer: string;
};
export function CaseProgressPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/cases/${caseId}/progress`),
      j = (await r.json()) as Data & { error?: { message?: string } };
    if (r.ok) setData(j);
    else setMessage(j.error?.message ?? "Unable to load case progress.");
  }, [caseId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(action: string) {
    if (busy) return;
    setBusy(true);
    const r = await fetch(`/api/cases/${caseId}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }),
      j = (await r.json()) as { error?: { message?: string } };
    setMessage(
      r.ok
        ? "Case status updated."
        : (j.error?.message ?? "Unable to update status."),
    );
    if (r.ok) await load();
    setBusy(false);
  }
  if (!data) return null;
  const p = data.progress,
    complete = p.otStatus === "case_completed";
  return (
    <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.1em] text-blue-700">
        OT progress & fee record
      </p>
      <h2 className="mt-1 text-xl font-bold">Case timeline</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card
          icon={<IndianRupee />}
          label="Posted fee"
          value={money(p.postedFeePaise)}
        />
        <Card
          icon={<IndianRupee />}
          label="Anaesthetist bid"
          value={
            data.bid?.proposedFeePaise
              ? money(data.bid.proposedFeePaise)
              : "No separate bid"
          }
        />
        <Card
          icon={<CheckCircle2 />}
          label="Final agreed fee"
          value={
            p.finalAgreedFeePaise
              ? money(p.finalAgreedFeePaise)
              : "Locks on selection"
          }
        />
        <Card
          icon={<Clock3 />}
          label="Estimated duration"
          value={`${p.estimatedDurationMinutes} min`}
        />
        <Card
          icon={<Clock3 />}
          label="Actual duration"
          value={
            p.actualDurationMinutes
              ? `${p.actualDurationMinutes} min`
              : "Calculated at completion"
          }
        />
        <Card
          icon={<CheckCircle2 />}
          label="Current status"
          value={label(p.otStatus)}
        />
      </div>
      {p.feeLockedAt && (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          Final agreed fee is locked and cannot be silently changed.
        </p>
      )}
      <div className="mt-5">
        {p.otStatus === "awaiting_arrival" && (
          <Button
            disabled={busy}
            onClick={() => void action("ready")}
            className="h-12 w-full rounded-xl sm:w-auto"
          >
            Ready for OT
          </Button>
        )}
        {p.otStatus === "ready_for_ot" && (
          <Button
            disabled={busy}
            onClick={() => void action("start")}
            className="h-12 w-full rounded-xl bg-amber-600 sm:w-auto"
          >
            Case Started
          </Button>
        )}
          {p.otStatus === "case_started" && data.viewer !== "hospital" && (
            <Button
            disabled={busy}
            onClick={() => void action("complete")}
            className="h-12 w-full rounded-xl bg-emerald-700 sm:w-auto"
          >
              Case Completed
            </Button>
          )}
          {p.otStatus === "completion_pending" && data.viewer === "hospital" && (
            <Button disabled={busy} onClick={() => void action("confirm_complete")} className="h-12 w-full rounded-xl bg-emerald-700 sm:w-auto">
              Confirm Case Completion
            </Button>
          )}
          {p.otStatus === "completion_pending" && data.viewer !== "hospital" && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Waiting for hospital confirmation. Billing will open after confirmation.</p>
          )}
      </div>
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"
        >
          {message}
        </p>
      )}
      <div className="mt-6 border-t pt-5">
        <h3 className="font-bold">Secure audit history</h3>
        <div className="mt-3 space-y-2">
          {data.audit.length ? (
            data.audit.map((e, i) => (
              <div
                key={i}
                className="flex justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"
              >
                <span>{label(e.eventType)}</span>
                <time className="shrink-0 text-xs text-slate-500">
                  {new Date(e.createdAt).toLocaleString("en-IN", { hour12: true })}
                </time>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              Timeline events will appear as the case progresses.
            </p>
          )}
        </div>
      </div>
      {complete && !data.rating && (
        <div className="mt-6 border-t pt-5">
          <h3 className="font-bold">Rate this completed case</h3>
          <p className="mt-2 text-sm text-slate-600">Use the verified multi-category review form. Do not include patient-identifying information.</p>
          <Link href="/reviews" className="mt-3 grid min-h-12 w-full place-items-center rounded-xl bg-blue-700 px-5 font-bold text-white sm:inline-grid sm:w-auto">Submit rating</Link>
        </div>
      )}
      {data.rating && (
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Your rating: {data.rating.rating}/5
        </p>
      )}
    </section>
  );
}
function Card({
  icon,
  label: caption,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <span className="text-blue-700 [&>svg]:size-4">{icon}</span>
      <p className="mt-2 text-xs text-slate-500">{caption}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
function money(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
