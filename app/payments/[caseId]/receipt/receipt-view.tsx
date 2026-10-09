"use client";
import { useEffect, useState } from "react";
import Link from "@/components/native-link";
type Data = {
  payment: {
    caseId: string;
    totalAmountPaise: number;
    confirmedAmountPaise: number;
    procedureName: string;
    hospitalName: string;
    payerName: string;
    payeeName: string;
    settledAt: string|null;caseStartedAt:string;caseCompletedAt:string;status:string;balanceAmountPaise:number;
  };
  entries: Array<{
    id: string;
    amountPaise: number;
    method: string;
    reference: string | null;
    paidAt: string;
    status: string;
  }>;
};
export function ReceiptView({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/cases/${caseId}/payments`)
      .then(async (r) => {
        const j = (await r.json()) as Data & { error?: { message?: string } };
        if (!r.ok) setError(j.error?.message ?? "Receipt unavailable.");
          else if (j.payment.confirmedAmountPaise<=0)setError("Receipt becomes available after a payment is confirmed.");else setData(j);
      })
      .catch(() => setError("Network error."));
  }, [caseId]);
  async function share() {
    if (!data) return;
    const text = `Payment receipt: ${data.payment.procedureName}, ₹${(data.payment.totalAmountPaise / 100).toLocaleString("en-IN")}, settled.`;
    if (navigator.share)
      await navigator.share({ title: "Anesthetist on Call Receipt", text });
    else await navigator.clipboard.writeText(text);
  }
  return (
    <main className="min-h-dvh bg-slate-100 p-3 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex gap-2 print:hidden">
          <Link
            href="/payments"
            className="grid min-h-11 place-items-center rounded-xl border bg-white px-4"
          >
            Back
          </Link>
          <button
            onClick={() => window.print()}
            className="min-h-11 rounded-xl bg-blue-700 px-4 text-white"
          >
            Download / Print
          </button>
          <button
            onClick={() => void share()}
            className="min-h-11 rounded-xl border bg-white px-4"
          >
            Share
          </button>
        </div>
        {error && (
          <p className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>
        )}
        {data && (
          <article className="rounded-2xl border bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-10">
            <p className="text-sm font-bold text-blue-700">
              ANESTHETIST ON CALL
            </p>
            <h1 className="mt-1 text-3xl font-bold">Payment Receipt</h1>
            <p className="mt-2 text-sm text-slate-500">
            Receipt #{`AOC-${data.payment.caseId.slice(-8).toUpperCase()}`} · Case ID {data.payment.caseId}
            </p>
            <dl className="mt-8 grid gap-5 sm:grid-cols-2">
              <Item l="Case" v={data.payment.procedureName} />
              <Item l="Hospital" v={data.payment.hospitalName} />
              <Item l="Paid by" v={data.payment.payerName} />
              <Item l="Received by" v={data.payment.payeeName} />
              <Item
                l="Total settled"
                v={`₹${(data.payment.confirmedAmountPaise / 100).toLocaleString("en-IN")}`}
              />
              <Item
                l="Final agreed fee"
                v={`₹${(data.payment.totalAmountPaise/100).toLocaleString("en-IN")}`}
              />
              <Item l="Balance" v={`₹${(data.payment.balanceAmountPaise/100).toLocaleString("en-IN")}`}/><Item l="Payment status" v={data.payment.status.replaceAll("_"," ")}/><Item l="Actual start" v={new Date(data.payment.caseStartedAt).toLocaleString("en-IN")}/><Item l="Case completed" v={new Date(data.payment.caseCompletedAt).toLocaleString("en-IN")}/>
            </dl>
            <h2 className="mt-8 border-t pt-6 text-lg font-bold">
              Payment entries
            </h2>
            {data.entries
              .filter((e) => e.status === "received")
              .map((e) => (
                <div key={e.id} className="mt-3 rounded-xl bg-slate-50 p-4">
                  <b>₹{(e.amountPaise / 100).toLocaleString("en-IN")}</b>
                  <p className="text-sm">
                    {e.method.replaceAll("_", " ")} ·{" "}
                    {new Date(e.paidAt).toLocaleString("en-IN")}
                  </p>
                  {e.reference && (
                    <p className="text-sm">Reference: {e.reference}</p>
                  )}
                </div>
              ))}
            <p className="mt-8 text-xs text-slate-500">
              Generated from the immutable case payment history. This tracks
              settlement and is not a tax invoice.
            </p>
          </article>
        )}
      </div>
    </main>
  );
}
function Item({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{l}</dt>
      <dd className="mt-1 font-semibold">{v}</dd>
    </div>
  );
}
