"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/native-link";
import { CaseResponderMap } from "./case-responder-map";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { DashboardChoices } from "@/components/auth/dashboard-choices";

type CaseItem = {
  id: string;
  procedureName: string;
  specialty: string | null;
  location: string | null;
  anaesthesiaType: string;
  scheduledAt: string;
  offeredFeePaise: number;
  status: string;
  urgency: string;
  durationMinutes: number | null;
  publicNotes: string | null;
  hospitalName: string;
  biddingEnabled: number;
  responseCount: number;
  currentResponseStatus: string | null;
  currentProposedFeePaise: number | null;
  assignedClinicianUserId: string | null;
  assignedClinicianName: string | null;
  hospitalReliability?: {score:number;rating:number;ratingCount:number;paymentReliability:number;completedCases:number};
};
type ResponseItem = {
  id: string;
  proposedFeePaise: number | null;
  message: string | null;
  status: string;
  clinicianName: string;
  qualification: string;
  verificationStatus: string;
  createdAt: string;
  distanceMetres: number | null;
  etaMinutes: number | null;
  latitude: string | null;
  longitude: string | null;
  match?: { score:number; reasons:string[]; dataState:string };
  reliability?: { score:number;rating:number;ratingCount:number;completedCases:number;arrivalPerformance:string };
};
type ResponseMap={hospital:{name:string;latitude:number;longitude:number}};

export function CasesDashboard({
  role,
  approved,
  viewerUserId,
  dualDashboard,
}: {
  role: string;
  approved: boolean;
  viewerUserId: string;
  dualDashboard: boolean;
}) {
  const [items, setItems] = useState<CaseItem[]>([]);
  const [responses, setResponses] = useState<Record<string, ResponseItem[]>>(
    {},
  );
  const [responseMaps,setResponseMaps]=useState<Record<string,ResponseMap|null>>({});
  const [selectedMapResponder,setSelectedMapResponder]=useState<Record<string,string|null>>({});
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/cases");
    const result = (await response.json()) as {
      cases: CaseItem[];
      error?: { message?: string };
    };
    if (response.ok) setItems(result.cases);
    else setMessage(result.error?.message ?? "Unable to load cases.");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const refresh = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
    };
  }, [load]);

  async function act(url: string, options: RequestInit, success: string) {
    const response = await fetch(url, options);
    const result = (await response.json()) as { error?: { message?: string } };
    setMessage(
      response.ok ? success : (result.error?.message ?? "Action failed."),
    );
    if (response.ok) void load();
    return response.ok;
  }
  async function showResponses(id: string) {
    const response = await fetch(`/api/cases/${id}/bids`);
    const result = (await response.json()) as { bids: ResponseItem[];map:ResponseMap|null };
    if (response.ok){setResponses((value) => ({ ...value, [id]: result.bids }));setResponseMaps(value=>({...value,[id]:result.map}))}
  }
  async function respondToCase(id:string,proposedFeeRupees?:number){
    const location=await new Promise<{latitude?:number;longitude?:number}>(resolve=>{if(!navigator.geolocation)return resolve({});navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude}),()=>resolve({}),{enableHighAccuracy:false,timeout:7000,maximumAge:60_000})});
    await act(`/api/cases/${id}/bids`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({proposedFeeRupees,...location})},proposedFeeRupees?"Availability, location and fee bid submitted.":"Hospital notified that you’re available.");
  }
  async function selectAnaesthetist(caseId:string,response:ResponseItem){
    if(!confirm(`Select ${response.clinicianName} for this case? The other responses will be closed.`))return;
    const selected=await act(`/api/cases/${caseId}/assign`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bidId:response.id})},"Offer sent. Waiting for anaesthetist acceptance.");
    if(selected){setResponses(value=>{const next={...value};delete next[caseId];return next});setResponseMaps(value=>{const next={...value};delete next[caseId];return next})}
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-5 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-5xl">
        {dualDashboard && <div className="mb-5"><DashboardChoices roles={["anesthetist", "admin"]} currentRole={role} /></div>}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">
              ANESTHETIST ON CALL
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">Your cases</h1>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3">
            <NotificationBell />
            {role === "hospital" || role === "surgeon" ? <>
              <button type="button" onClick={() => window.location.reload()} className="min-h-12 rounded-xl border bg-white px-4 py-2 font-semibold text-black">Refresh Page</button>
              {(role === "surgeon" || approved) && <Link href={role === "surgeon" ? "/planned" : "/cases/new"} className="grid min-h-12 place-items-center rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white">Post a Case</Link>}
            </> : <>
            <Link
              href="/calendar"
              className="grid min-h-11 place-items-center rounded-xl border bg-white px-4 py-2"
            >
              Show Your Availability
            </Link>
            {role === "hospital" && approved && <Link href="/hospital/ot-dashboard" className="grid min-h-11 place-items-center rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white">OT Live Board</Link>}
            {role === "anesthetist" && <Link href="/performance" className="grid min-h-11 place-items-center rounded-xl border bg-white px-4 py-2">My performance</Link>}
            {(role === "hospital" || role === "surgeon") && (
              <Link
                href="/planned"
                className="grid min-h-11 place-items-center rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white"
              >
                Advance case
              </Link>
            )}
            <Link
              href="/payments"
              className="grid min-h-11 place-items-center rounded-xl border bg-white px-4 py-2"
            >
              Payments
            </Link>
            {(role === "hospital" || role === "anesthetist") && <Link href="/reviews" className="grid min-h-11 place-items-center rounded-xl border bg-white px-4 py-2">Ratings</Link>}
            <Link
              href="/notifications"
              className="grid min-h-11 place-items-center rounded-xl border bg-white px-4 py-2"
            >
              Notifications
            </Link>
            {((role === "hospital" && approved) ||
              role === "surgeon" ||
              role === "anesthetist") && (
              <Link
                href="/emergency"
                className="col-span-2 grid min-h-11 place-items-center rounded-xl bg-red-700 px-4 py-2 font-bold text-white"
              >
                🚨 Emergency / SOS
              </Link>
            )}
            {role === "hospital" && approved && (
              <Link
                href="/cases/new"
                className="col-span-2 grid min-h-11 place-items-center rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white"
              >
                Post a case
              </Link>
            )}
            </>}
          </div>
        </header>
        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-blue-50 p-3 text-blue-900"
          >
            {message}
          </p>
        )}
        <div className="mt-6 grid gap-4 sm:mt-7 sm:gap-5">
          {items.length === 0 && (
            <div className="rounded-2xl border bg-white p-6 text-slate-600 sm:p-8">
              No cases available right now.
            </div>
          )}
          {items.map((item) => (
            <article
              id={`case-${item.id}`}
              key={item.id}
              className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-800">
                      {item.urgency}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-800">
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <h2 className="mt-3 break-words text-xl font-bold">
                    {item.procedureName}
                  </h2>
                  <p className="break-words text-slate-600">
                    {item.specialty || "Specialty not specified"} ·{" "}
                    {item.hospitalName}
                  </p>
                  <p className="break-words text-slate-600">
                    {item.location || item.hospitalName} ·{" "}
                    {item.anaesthesiaType}
                  </p>
                  {role === "anesthetist" && item.hospitalReliability && <p className="mt-2 text-sm text-slate-600">⭐ {item.hospitalReliability.ratingCount?item.hospitalReliability.rating:'New'} · Hospital reliability <b>{item.hospitalReliability.score}/100</b> · Payment {item.hospitalReliability.paymentReliability}% · {item.hospitalReliability.completedCases} completed</p>}
                </div>
                <div className="sm:text-right">
                  <p className="text-lg font-bold">
                    {item.offeredFeePaise > 0
                      ? `₹${(item.offeredFeePaise / 100).toLocaleString("en-IN")}`
                      : "Fee not specified"}
                  </p>
                  {Boolean(item.biddingEnabled) && item.status === "open" && (
                    <p className="text-sm text-slate-500">
                      Optional bidding enabled
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-4 text-sm leading-6">
                Report: {new Date(item.scheduledAt).toLocaleString("en-IN")}{" "}
                {item.durationMinutes
                  ? `· ${item.durationMinutes} min expected`
                  : ""}
              </p>
              {item.publicNotes && (
                <p className="mt-2 break-words text-slate-600">
                  {item.publicNotes}
                </p>
              )}
              {role === "anesthetist" && item.status === "open" && (
                <div className="mt-5 border-t pt-4">
                  {item.currentResponseStatus === "available" ? (
                    <p className="rounded-xl bg-emerald-50 p-3 font-medium text-emerald-900">
                      You’re marked available
                      {item.currentProposedFeePaise
                        ? ` at ₹${(item.currentProposedFeePaise / 100).toLocaleString("en-IN")}`
                        : ""}
                      .
                    </p>
                  ) : (
                    <button
                      onClick={() => void respondToCase(item.id)}
                      className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white sm:w-auto"
                    >
                      I’m Available
                    </button>
                  )}
                  {Boolean(item.biddingEnabled) && (
                    <form
                      className="mt-3 grid gap-2 sm:flex sm:flex-wrap"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const fee = Number(
                          new FormData(event.currentTarget).get("fee"),
                        );
                        void respondToCase(item.id,fee);
                      }}
                    >
                      <input
                        name="fee"
                        type="number"
                        required
                        min="1"
                        defaultValue={
                          item.currentProposedFeePaise
                            ? item.currentProposedFeePaise / 100
                            : undefined
                        }
                        placeholder="Optional fee bid ₹"
                        className="h-12 min-w-0 w-full rounded-xl border px-3 py-2 sm:flex-1"
                      />
                      <button className="min-h-12 w-full rounded-xl border border-emerald-700 px-4 py-2 font-semibold text-emerald-800 sm:w-auto">
                        Submit fee bid
                      </button>
                    </form>
                  )}
                  {item.currentResponseStatus === "available" && (
                    <button
                      onClick={() =>
                        void act(
                          `/api/cases/${item.id}/bids`,
                          { method: "DELETE" },
                          "Response withdrawn.",
                        )
                      }
                      className="mt-2 min-h-11 text-sm font-semibold text-red-700"
                    >
                      Withdraw response
                    </button>
                  )}
                </div>
              )}
              {role === "hospital" && item.status === "open" && (
                <button
                  onClick={() => void showResponses(item.id)}
                  className="mt-5 min-h-11 w-full rounded-xl border px-4 py-2 font-semibold sm:w-auto"
                >
                  View {item.responseCount} response
                  {item.responseCount === 1 ? "" : "s"}
                </button>
              )}
              {role === "hospital"&&responses[item.id]&&<section className="mt-5 border-t pt-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Available Anaesthetists</p><h3 className="mt-1 text-xl font-bold">Choose a responder</h3></div>{responseMaps[item.id]&&responses[item.id].some(response=>response.status==="available"&&response.latitude&&response.longitude)?<CaseResponderMap hospital={responseMaps[item.id]!.hospital} responders={responses[item.id].filter(response=>response.status==="available"&&response.latitude&&response.longitude).map(response=>({id:response.id,name:response.clinicianName,latitude:Number(response.latitude),longitude:Number(response.longitude)}))} selectedId={selectedMapResponder[item.id]??null}/>:<p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Responder locations will appear here when anaesthetists share location with their response.</p>}</section>}
              {responses[item.id]
                ?.filter((response) => response.status === "available")
                .map((response) => (
                  <div
                    key={response.id}
                    className="mt-3 grid min-w-0 gap-3 rounded-xl bg-slate-50 p-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 break-words">
                      <b>{response.clinicianName}</b> · {response.qualification}
                      <span className="mt-1 block text-sm text-slate-600">Verification: <b className="capitalize text-emerald-700">{response.verificationStatus}</b> · Distance: <b>{response.distanceMetres!=null?`${(response.distanceMetres/1000).toFixed(1)} km`:"Not shared"}</b>{response.etaMinutes?` · ETA ${response.etaMinutes} min`:""} · Responded {responseTime(response.createdAt)}</span>
                      {Boolean(item.biddingEnabled)&&response.proposedFeePaise
                        ? ` · ₹${(response.proposedFeePaise / 100).toLocaleString("en-IN")}`
                        : ""}
                      {response.match && <span className="mt-1 block text-sm text-blue-700"><b>Recommended Match — {response.match.score}/100</b> · {response.match.reasons.join(" • ")}</span>}
                      {response.reliability && <span className="mt-1 block text-sm text-slate-600">⭐ {response.reliability.ratingCount?response.reliability.rating:'New'} · Reliability <b>{response.reliability.score}/100</b> · {response.reliability.completedCases} completed · Arrival {response.reliability.arrivalPerformance}</span>}
                    </span>
                    <div className="grid gap-2 sm:flex"><button disabled={!response.latitude||!response.longitude} onClick={()=>setSelectedMapResponder(value=>({...value,[item.id]:response.id}))} className="min-h-11 w-full rounded-lg border border-blue-300 px-3 py-2 font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">View on Map</button><button
                      onClick={() => void selectAnaesthetist(item.id,response)}
                      className="min-h-11 w-full rounded-lg bg-blue-700 px-3 py-2 text-white sm:w-auto"
                    >
                      Select Anaesthetist
                    </button></div>
                  </div>
                ))}
              {role === "anesthetist" &&
                item.status === "offered" &&
                item.assignedClinicianUserId === viewerUserId && (
                  <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
                    <button
                      onClick={() =>
                        void act(
                          `/api/cases/${item.id}/accept`,
                          { method: "POST" },
                          "Assignment accepted. Contact details unlocked.",
                        )
                      }
                      className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white sm:w-auto"
                    >
                      Accept assignment
                    </button>
                    <button
                      onClick={() =>
                        confirm(
                          "Decline this assignment and return the case to Open?",
                        ) &&
                        void act(
                          `/api/cases/${item.id}/decline`,
                          { method: "POST" },
                          "Assignment declined. The case is open for another selection.",
                        )
                      }
                      className="min-h-12 w-full rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 sm:w-auto"
                    >
                      Decline assignment
                    </button>
                  </div>
                )}
              {role === "anesthetist" &&
                ["assigned", "completed"].includes(item.status) &&
                item.assignedClinicianUserId === viewerUserId && (
                  <Link
                    href={`/cases/${item.id}/private`}
                    className="mt-5 grid min-h-11 w-full place-items-center rounded-xl border px-4 py-2 sm:inline-grid sm:w-auto"
                  >
                    Contact & private details
                  </Link>
                )}
              {role === "hospital" && item.status === "offered" && (
                <p className="mt-5 rounded-xl bg-amber-50 p-3 text-amber-900">
                  Waiting for{" "}
                  {item.assignedClinicianName || "the selected anaesthetist"} to
                  accept. Contact details remain hidden until acceptance.
                </p>
              )}
              {role === "hospital" && item.status === "assigned" && (
                <Link
                  href={`/cases/${item.id}/private`}
                  className="mt-5 grid min-h-11 w-full place-items-center rounded-xl bg-slate-900 px-4 py-2 text-white sm:inline-grid sm:w-auto"
                >
                  Open coordination & OT progress
                </Link>
              )}
              {role === "hospital" && item.status === "completed" && (
                <Link
                  href={`/cases/${item.id}/private`}
                  className="mt-5 grid min-h-11 w-full place-items-center rounded-xl border px-4 py-2 sm:inline-grid sm:w-auto"
                >
                  View completed case details
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function statusLabel(status: string) {
  return status === "offered"
    ? "Pending Acceptance"
    : status === "assigned"
      ? "Assigned"
      : status === "completed"
        ? "Completed"
        : "Open";
}
function responseTime(createdAt:string){const seconds=Math.max(0,Math.round((Date.now()-new Date(createdAt).getTime())/1000));if(seconds<60)return `${seconds}s ago`;const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes} min ago`;const hours=Math.floor(minutes/60);return `${hours} hr ago`;}
