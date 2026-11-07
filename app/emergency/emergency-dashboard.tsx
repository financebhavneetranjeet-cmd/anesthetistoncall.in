"use client";
import { TimeField } from "@/components/time-field";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/native-link";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Loader2,
  MapPin,
} from "lucide-react";
type Hospital = { id: string; name: string; address: string };
type SOS = {
  id: string;
  procedureName: string;
  urgency: string;
  requiredArrivalAt: string;
  offeredFeePaise: number;
  durationMinutes: number;
  status: string;
  sosStatus: string;
  offerVersion: number;
  searchRadiusKm?: number;
  createdAt: string;
  hospitalName: string;
  address?: string;
  currentResponseType?: string;
  currentBidPaise?: number;
  currentEtaMinutes?: number;
};
type Reply = {
  id: string;
  responseType: string;
  proposedFeePaise: number | null;
  status: string;
  distanceMetres: number | null;
  etaMinutes: number | null;
  clinicianName: string;
  qualification: string;
  match?: {score:number;reasons:string[];dataState:string;metrics:{onTimeRate:number|null;rating:number;completedCases:number}};
};
const money = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
export function EmergencyDashboard({ role }: { role: string }) {
  const clinician = role === "anesthetist",
    [hospitals, setHospitals] = useState<Hospital[]>([]),
    [cases, setCases] = useState<SOS[]>([]),
    [details, setDetails] = useState<Record<string, Reply[]>>({}),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/emergency");
    const d = await r.json() as {hospitals?:Hospital[];cases?:SOS[];responses:Reply[];error?:{message?:string}};
    if (r.ok) {
      setHospitals(d.hospitals ?? []);
      setCases(d.cases ?? []);
    } else setMessage(d.error?.message ?? "Unable to load SOS cases.");
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);
  async function send(url: string, body: object, success: string) {
    setBusy(url);
    try {
      const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json() as {hospitals?:Hospital[];cases?:SOS[];responses:Reply[];error?:{message?:string}};
      setMessage(r.ok ? success : (d.error?.message ?? "Action failed."));
      if (r.ok) await load();
    } catch {
      setMessage(
        "Network error. Please retry—your previous tap was not duplicated.",
      );
    } finally {
      setBusy("");
    }
  }
  async function respond(id: string, action: string, feeRupees?: number) {
    setBusy(id);
    navigator.geolocation?.getCurrentPosition(
      async (p) => {
        await send(
          `/api/emergency/${id}/respond`,
          {
            action,
            feeRupees,
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
          },
          "SOS response sent.",
        );
      },
      async () => {
        await send(
          `/api/emergency/${id}/respond`,
          { action, feeRupees },
          "Response sent without location; ETA is unavailable.",
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }
  async function compare(id: string) {
    const r = await fetch(`/api/emergency/${id}`),
      d = await r.json() as {hospitals?:Hospital[];cases?:SOS[];responses:Reply[];error?:{message?:string}};
    if (r.ok) setDetails((v) => ({ ...v, [id]: d.responses }));
  }
  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-5 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/cases"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-slate-600"
        >
          <ArrowLeft className="size-4" /> Cases
        </Link>
        <header className="mt-3 rounded-3xl bg-gradient-to-br from-red-700 to-rose-600 p-5 text-white shadow-lg sm:p-8">
          <p className="font-bold">🚨 EMERGENCY RESPONSE</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">
            SOS demand–supply matching
          </h1>
          <p className="mt-2 max-w-2xl text-red-50">
            Arrival time and availability come first; fee remains visible for a
            human decision.
          </p>
        </header>
        {message && (
          <p role="status" className="mt-4 rounded-xl border bg-white p-3">
            {message}
          </p>
        )}
        {!clinician && (
          <PostForm
            hospitals={hospitals}
            busy={!!busy}
            submit={(b) =>
              send(
                "/api/emergency",
                b,
                "SOS sent to verified available anaesthetists.",
              )
            }
          />
        )}
        <section className="mt-6 space-y-4">
          <h2 className="text-xl font-bold">
            {clinician ? "Active SOS alerts" : "Live emergency cases"}
          </h2>
          {cases.length === 0 && (
            <div className="rounded-2xl border bg-white p-6 text-slate-600">
              No emergency cases right now.
            </div>
          )}
          {cases.map((c) => (
            <article
              key={c.id}
              className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase text-red-800">
                    {c.urgency} · {c.sosStatus}
                  </span>
                  <h3 className="mt-3 text-xl font-bold">{c.procedureName}</h3>
                  <p className="text-slate-600">
                    <MapPin className="mr-1 inline size-4" />
                    {c.hospitalName}
                  </p>
                </div>
                <div className="text-right">
                  <b className="text-xl">{money(c.offeredFeePaise)}</b>
                  <p className="text-sm text-slate-500">
                    {c.durationMinutes} min estimated
                  </p>
                </div>
              </div>
              <p className="mt-3">
                <Clock3 className="mr-1 inline size-4" />
                Arrival required{" "}
                {new Date(c.requiredArrivalAt).toLocaleString("en-IN", { hour12: true })}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Elapsed{" "}
                {Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(c.createdAt).getTime()) / 60000,
                  ),
                )}{" "}
                min · Offer v{c.offerVersion}
              </p>
              {clinician && c.status === "open" && (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button
                    disabled={busy === c.id}
                    onClick={() => void respond(c.id, "accept_offer")}
                    className="min-h-12 rounded-xl bg-emerald-700 px-3 font-bold text-white"
                  >
                    Accept Offered Fee
                  </button>
                  <button
                    disabled={busy === c.id}
                    onClick={() => {
                      const fee = Number(prompt("Enter additional bid above the hospital offer in ₹"));
                      if (fee > 0) void respond(c.id, "bid", fee);
                    }}
                    className="min-h-12 rounded-xl border border-blue-700 px-3 font-bold text-blue-800"
                  >
                    Bid / Quote My Fee
                  </button>
                  <button
                    disabled={busy === c.id}
                    onClick={() => void respond(c.id, "decline")}
                    className="min-h-12 rounded-xl border px-3 font-bold"
                  >
                    Decline
                  </button>
                </div>
              )}
              {c.currentResponseType && (
                <p className="mt-3 rounded-xl bg-blue-50 p-3">
                  Your response: {c.currentResponseType.replaceAll("_", " ")}
                  {c.currentBidPaise ? ` · ${money(c.currentBidPaise)}` : ""}
                  {c.currentEtaMinutes
                    ? ` · ETA ${c.currentEtaMinutes} min`
                    : ""}
                </p>
              )}
              {!clinician && c.status === "open" && (
                <>
                  <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                    <button
                      onClick={() => void compare(c.id)}
                      className="min-h-11 rounded-xl bg-slate-900 px-4 text-white"
                    >
                      Compare responses
                    </button>
                    <button
                      onClick={() =>
                        void send(
                          `/api/emergency/${c.id}/manage`,
                          { action: "continue" },
                          "Search pool expanded.",
                        )
                      }
                      className="min-h-11 rounded-xl border px-4"
                    >
                      Continue Search
                    </button>
                    <button
                      onClick={() =>
                        void send(
                          `/api/emergency/${c.id}/manage`,
                          { action: "resend" },
                          "SOS resent.",
                        )
                      }
                      className="min-h-11 rounded-xl border px-4"
                    >
                      Resend SOS
                    </button>
                    <button
                      onClick={() => {
                        const f = Number(prompt("New offered fee in ₹"));
                        if (f > 0)
                          void send(
                            `/api/emergency/${c.id}/manage`,
                            { action: "modify_fee", offeredFeeRupees: f },
                            "Offer updated and SOS resent.",
                          );
                      }}
                      className="min-h-11 rounded-xl border px-4"
                    >
                      Modify Fee
                    </button>
                    <button
                      onClick={() =>
                        confirm("Cancel this SOS?") &&
                        void send(
                          `/api/emergency/${c.id}/manage`,
                          { action: "cancel" },
                          "SOS cancelled.",
                        )
                      }
                      className="min-h-11 rounded-xl border border-red-300 px-4 text-red-700"
                    >
                      Cancel SOS
                    </button>
                  </div>
                  <Comparison
                    rows={details[c.id] ?? []}
                    caseId={c.id}
                    offered={c.offeredFeePaise}
                    select={(bidId) =>
                      send(
                        `/api/cases/${c.id}/assign`,
                        { bidId },
                        "Anaesthetist selected; awaiting acceptance.",
                      )
                    }
                  />
                </>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
function PostForm({
  hospitals,
  busy,
  submit,
}: {
  hospitals: Hospital[];
  busy: boolean;
  submit: (b: any) => void;
}) {
  return (
    <form
      className="mt-6 grid gap-3 rounded-3xl border bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({
          hospitalId: f.get("hospitalId"),
          procedureName: f.get("procedureName"),
          specialty: f.get("specialty"),
          urgency: f.get("urgency"),
          requiredArrivalAt: new Date(
            String(f.get("requiredArrivalAt")),
          ).toISOString(),
          offeredFeeRupees: Number(f.get("fee")),
          durationMinutes: Number(f.get("duration")),
          publicNotes: f.get("notes") || undefined,
        });
      }}
    >
      <h2 className="text-xl font-bold sm:col-span-2">
        Post Emergency / SOS Case
      </h2>
      <select
        required
        name="hospitalId"
        className="h-12 rounded-xl border px-3"
      >
        <option value="">Verified hospital location</option>
        {hospitals.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name} — {h.address}
          </option>
        ))}
      </select>
      <input
        required
        name="procedureName"
        minLength={3}
        placeholder="Procedure / case type"
        className="h-12 rounded-xl border px-3"
      />
      <input
        name="specialty"
        placeholder="Specialty"
        className="h-12 rounded-xl border px-3"
      />
      <select name="urgency" className="h-12 rounded-xl border px-3">
        <option value="emergency">Emergency</option>
        <option value="urgent">Urgent</option>
      </select>
      <label className="grid gap-1 text-sm font-semibold">
        Required arrival time
        <TimeField
          required
          name="requiredArrivalAt"
          type="datetime-local"
          className="h-12 rounded-xl border px-3 font-normal"
        />
      </label>
      <input
        required
        name="fee"
        type="number"
        min="1"
        placeholder="Offered fee ₹"
        className="h-12 rounded-xl border px-3"
      />
      <input
        required
        name="duration"
        type="number"
        min="15"
        max="1440"
        placeholder="Estimated duration (minutes)"
        className="h-12 rounded-xl border px-3"
      />
      <textarea
        name="notes"
        maxLength={500}
        placeholder="Non-identifying notes only"
        className="min-h-24 rounded-xl border p-3 sm:col-span-2"
      />
      <button
        disabled={busy}
        className="min-h-12 rounded-xl bg-red-700 px-4 font-black text-white sm:col-span-2"
      >
        {busy ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : (
          "🚨 Send SOS Alert"
        )}
      </button>
    </form>
  );
}
function Comparison({
  rows,
  caseId,
  offered,
  select,
}: {
  rows: Reply[];
  caseId: string;
  offered: number;
  select: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[650px] text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="p-3">Anaesthetist</th>
            <th>ETA</th>
            <th>Distance</th>
            <th>Hospital offer</th>
            <th>Additional bid / total demanded fee</th>
            <th>Smart match</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-3">
                <b>{r.clinicianName}</b>
                <br />
                {r.qualification}
              </td>
              <td>{r.etaMinutes ? `${r.etaMinutes} min` : "Unavailable"}</td>
              <td>
                {r.distanceMetres
                  ? `${(r.distanceMetres / 1000).toFixed(1)} km`
                  : "Unavailable"}
              </td>
              <td>{money(offered)}</td>
              <td>
                {r.responseType === "decline"
                  ? "Declined"
                  : r.responseType === "accept_offer"
                    ? "Accepted offer"
                    : `Extra ${money((r.proposedFeePaise ?? offered)-offered)} · Total ${money(r.proposedFeePaise ?? offered)}`}
              </td>
              <td><b className="text-blue-700">{r.match?.score ?? "—"}/100</b><br/><span className="text-xs text-slate-500">{r.match?.reasons.join(" • ")}</span></td>
              <td className="p-2">
                {r.status === "available" && (
                  <button
                    onClick={() => select(r.id)}
                    className="min-h-10 rounded-lg bg-blue-700 px-3 text-white"
                  >
                    Select
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
