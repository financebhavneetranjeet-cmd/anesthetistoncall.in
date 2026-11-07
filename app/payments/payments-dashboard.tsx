"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/native-link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Loader2,
} from "lucide-react";
type Payment = {
  id: string;
  caseId: string;
  totalAmountPaise: number;
  confirmedAmountPaise: number;
  balanceAmountPaise: number;
  status: string;
  dueAt: string;
  procedureName: string;
  hospitalName: string;
  clinicianName: string;
  overdue: number;
};
type Entry = {
  id: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  paidAt: string;
  status: string;
  disputeReason: string | null;
};
type Detail = { payment: Payment; entries: Entry[]; viewer: string };
type Summary = {
  todayPaise: number;
  weekPaise: number;
  monthPaise: number;
  totalFeesPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  completedCases: number;
  disputedCases: number;
};
export function PaymentsDashboard() {
  const [items, setItems] = useState<Payment[]>([]),
    [total, setTotal] = useState(0),
    [viewer, setViewer] = useState(""),
    [details, setDetails] = useState<Record<string, Detail>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [summary, setSummary] = useState<Summary | null>(null),
    [hospital, setHospital] = useState("all"),
    [from, setFrom] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/payments"),
      j = (await r.json()) as {
        payments: Payment[];
        totalPendingPaise: number;
        viewer: string;
        summary: Summary;
        error?: { message?: string };
      };
    if (r.ok) {
      setItems(j.payments);
      setTotal(j.totalPendingPaise);
      setViewer(j.viewer);
      setSummary(j.summary);
    } else setMessage(j.error?.message ?? "Unable to load payments.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const hospitals = [...new Set(items.map((x) => x.hospitalName))].sort(),
    filtered = items.filter(
      (x) =>
        (hospital === "all" || x.hospitalName === hospital) &&
        (!from || new Date(x.dueAt) >= new Date(from)),
    );
  async function open(caseId: string) {
    const r = await fetch(`/api/cases/${caseId}/payments`),
      j = (await r.json()) as Detail & { error?: { message?: string } };
    if (r.ok) setDetails((v) => ({ ...v, [caseId]: j }));
    else setMessage(j.error?.message ?? "Unable to load payment.");
  }
  async function action(caseId: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/cases/${caseId}/payments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = (await r.json()) as { error?: { message?: string } };
      setMessage(
        r.ok
          ? "Payment record updated."
          : (j.error?.message ?? "Payment update failed."),
      );
      if (r.ok) {
        await load();
        await open(caseId);
      }
    } catch {
      setMessage(
        "Internet connection lost. Please retry; duplicate payments are protected.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-700">
              ANESTHETIST ON CALL
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Payments & settlements
            </h1>
          </div>
          <Link
            href="/cases"
            className="grid min-h-11 place-items-center rounded-xl border bg-white px-4"
          >
            Cases
          </Link>
        </header>
        {summary && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              label={viewer === "hospital" ? "Total fees" : "Today"}
              value={
                viewer === "hospital"
                  ? summary.totalFeesPaise
                  : summary.todayPaise
              }
            />
            <Metric
              label={viewer === "hospital" ? "Paid" : "This week"}
              value={
                viewer === "hospital" ? summary.paidPaise : summary.weekPaise
              }
            />
            <Metric
              label={viewer === "hospital" ? "Outstanding" : "This month"}
              value={
                viewer === "hospital"
                  ? summary.outstandingPaise
                  : summary.monthPaise
              }
            />
            <Metric
              label={
                viewer === "hospital" ? "Completed cases" : "Total earnings"
              }
              value={
                viewer === "hospital"
                  ? summary.completedCases
                  : summary.paidPaise
              }
              count={viewer === "hospital"}
            />
            <Metric label="Total pending" value={total} />
            <Metric label="Disputed" value={summary.disputedCases} count />
          </div>
        )}
        <div className="mt-4 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2">
          <select
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            className="h-12 rounded-xl border px-3"
          >
            <option value="all">All hospitals</option>
            {hospitals.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="h-12 rounded-xl border px-3"
          />
        </div>
        {message && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-blue-50 p-3 text-blue-900"
          >
            {message}
          </p>
        )}
        <div className="mt-6 space-y-4">
          {items.length === 0 && (
            <p className="rounded-2xl border bg-white p-6">
              No completed-case payments yet.
            </p>
          )}
          {filtered.map((p) => (
            <article
              key={p.id}
              className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-bold">{p.procedureName}</p>
                  <p className="text-sm text-slate-600">
                    {p.hospitalName} · {p.clinicianName}
                  </p>
                </div>
                <Status value={p.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <Amount label="Total" value={p.totalAmountPaise} />
                <Amount label="Confirmed" value={p.confirmedAmountPaise} />
                <Amount label="Balance" value={p.balanceAmountPaise} />
              </div>
              {Boolean(p.overdue) && (
                <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="size-5" />
                  Payment pending for 7 days or more.
                </p>
              )}
              <button
                onClick={() => void open(p.caseId)}
                className="mt-4 min-h-11 w-full rounded-xl border px-4 font-semibold sm:w-auto"
              >
                View payment details
              </button>
              {details[p.caseId] && (
                <PaymentDetail
                  data={details[p.caseId]}
                  viewer={viewer}
                  busy={busy}
                  act={(body) => action(p.caseId, body)}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
function PaymentDetail({
  data,
  viewer,
  busy,
  act,
}: {
  data: Detail;
  viewer: string;
  busy: boolean;
  act: (b: Record<string, unknown>) => void;
}) {
  const p = data.payment;
  return (
    <div className="mt-5 border-t pt-5">
      {viewer === "hospital" && p.status !== "settled" && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act({
              action: "mark",
              amountRupees: Number(f.get("amount")),
              method: f.get("method"),
              reference: f.get("reference") || undefined,
              note: f.get("note") || undefined,
              paidAt: new Date().toISOString(),
              idempotencyKey: crypto.randomUUID(),
            });
          }}
        >
          <input
            name="amount"
            required
            type="number"
            min="1"
            max={p.balanceAmountPaise / 100}
            placeholder="Amount paid ₹"
            className="h-12 rounded-xl border px-3"
          />
          <input
            name="note"
            placeholder="Payment note (optional)"
            className="h-12 rounded-xl border px-3 sm:col-span-2"
          />
          <select name="method" className="h-12 rounded-xl border px-3">
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
          <input
            name="reference"
            placeholder="Transaction/reference number"
            className="h-12 rounded-xl border px-3 sm:col-span-2"
          />
          <button
            disabled={busy}
            className="min-h-12 rounded-xl bg-blue-700 px-4 font-semibold text-white sm:col-span-2"
          >
            {busy ? (
              <Loader2 className="mx-auto animate-spin" />
            ) : (
              "Mark Payment Made"
            )}
          </button>
        </form>
      )}
      <div className="mt-4 space-y-3">
        {data.entries.map((e) => (
          <div key={e.id} className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold">
              {money(e.amountPaise)} · {e.method.replaceAll("_", " ")}
            </p>
            <p className="text-sm text-slate-600">
              {new Date(e.paidAt).toLocaleString("en-IN", { hour12: true })}
              {e.reference ? ` · Ref: ${e.reference}` : ""}
            </p>
            <Status value={e.status} />
            {viewer !== "hospital" && e.status === "marked" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  disabled={busy}
                  onClick={() => act({ action: "confirm", entryId: e.id })}
                  className="min-h-11 rounded-lg bg-emerald-700 px-3 text-white"
                >
                  Payment Received
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Why was payment not received?");
                    if (reason) act({ action: "dispute", entryId: e.id, reason });
                  }}
                  className="min-h-11 rounded-lg border border-red-300 px-3 text-red-700"
                >
                  Raise Dispute
                </button>
              </div>
            )}
            {e.disputeReason && (
              <p className="mt-2 text-sm text-red-700">
                Dispute: {e.disputeReason}
              </p>
            )}
          </div>
        ))}
      </div>
      {viewer !== "admin" && p.status !== "settled" && (
        <button
          disabled={busy}
          onClick={() => {
            const amount = prompt("Disputed amount in ₹");
            const reason = prompt("Describe the payment issue");
            if (amount && reason)
              act({ action: "issue", amountRupees: Number(amount), reason });
          }}
          className="mt-4 min-h-11 w-full rounded-xl border border-red-300 px-4 font-semibold text-red-700 sm:w-auto"
        >
          Raise Payment Issue
        </button>
      )}
      {p.confirmedAmountPaise > 0 && (
        <Link
          href={`/payments/${p.caseId}/receipt`}
          className="mt-4 grid min-h-11 place-items-center rounded-xl bg-emerald-700 px-4 font-semibold text-white sm:inline-grid"
        >
          View / Download Receipt
        </Link>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  count = false,
}: {
  label: string;
  value: number;
  count?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#0b3159] p-4 text-white">
      <p className="text-sm text-blue-100">{label}</p>
      <p className="mt-1 text-2xl font-bold">{count ? value : money(value)}</p>
    </div>
  );
}
function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-bold">{money(value)}</p>
    </div>
  );
}
function money(p: number) {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}
function Status({ value }: { value: string }) {
  const ok = ["received", "settled"].includes(value);
  return (
    <span
      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold uppercase ${ok ? "bg-emerald-100 text-emerald-800" : value === "disputed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
    >
      {ok ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}
      {value.replaceAll("_", " ")}
    </span>
  );
}
