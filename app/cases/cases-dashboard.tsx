"use client";

import { useCallback, useEffect, useState } from "react";
import { CaseSms } from "@/components/case-sms";
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
  caseStartedAt: string | null;
  publicNotes: string | null;
  hospitalName: string;
  postedByName: string | null;
  postedByRole: string | null;
  biddingEnabled: number;
  responseCount: number;
  currentResponseStatus: string | null;
  currentProposedFeePaise: number | null;
  assignedClinicianUserId: string | null;
  assignedClinicianName: string | null;
  hospitalReliability?: {score:number|null;rating:number;ratingCount:number;paymentReliability:number|null;completedCases:number};
};
type ResponseItem = {
  id: string;
  clinicianId: string;
  proposedFeePaise: number | null;
  additionalFeePaise: number;
  totalFeePaise: number;
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
  reliability?: { score:number|null;rating:number;ratingCount:number;completedCases:number;arrivalPerformance:string };
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
  const [selectingCaseId, setSelectingCaseId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/cases", { cache: "no-store" });
    const result = (await response.json()) as {
      cases: CaseItem[];
      error?: { message?: string };
    };
    if (response.ok) setItems(result.cases);
    else setMessage(result.error?.message ?? "Unable to load cases.");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const refresh = () => { if(document.visibilityState === "visible") void load().catch(()=>setMessage("Unable to refresh cases. Please retry.")); };
    const poll=setInterval(refresh,15000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus",refresh);
      document.removeEventListener("visibilitychange",refresh);
      clearTimeout(timer);
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
    if (!response.ok) throw new Error("Unable to load responder locations.");
    if (response.ok){setResponses((value) => ({ ...value, [id]: result.bids }));setResponseMaps(value=>({...value,[id]:result.map}))}
  }
  async function respondToCase(id:string,proposedFeeRupees?:number){
    if (respondingId) return;
    setRespondingId(id);
    try {
    const location=await new Promise<{latitude?:number;longitude?:number}>(resolve=>{if(!navigator.geolocation)return resolve({});navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude}),()=>resolve({}),{enableHighAccuracy:false,timeout:7000,maximumAge:60_000})});
    await act(`/api/cases/${id}/bids`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({proposedFeeRupees,...location})},proposedFeeRupees?"Availability, location and fee bid submitted.":"Hospital notified that you’re available.");
    } catch { setMessage("Unable to send your response. Please try again."); }
    finally { setRespondingId(null); }
  }
  async function selectAnaesthetist(caseId:string,response:ResponseItem){
    if(selectingCaseId)return;
    if(!confirm(`Select ${response.clinicianName} at a total anaesthesia fee of ₹${(response.totalFeePaise/100).toLocaleString("en-IN")} for this case? The other responses will be closed.`))return;
    setSelectingCaseId(caseId);
    try {
      const selected=await act(`/api/cases/${caseId}/assign`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bidId:response.id})},`Selection message sent to ${response.clinicianName}. Awaiting acceptance.`);
      if(selected){
        setItems(value=>value.map(item=>item.id===caseId?{...item,status:"offered",assignedClinicianName:response.clinicianName,assignedClinicianUserId:response.clinicianId}:item));
        setResponses(value=>{const next={...value};delete next[caseId];return next});
        setResponseMaps(value=>{const next={...value};delete next[caseId];return next});
      }
    } catch {setMessage("Unable to confirm selection. Refresh the page to check the case status before trying again.");}
    finally {setSelectingCaseId(null);}
  }

  return (
    <main className="aoc-dashboard min-h-dvh bg-slate-50 px-3 py-5 sm:px-4 sm:py-8">
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
            <button type="button" onClick={()=>window.location.reload()} className="grid min-h-11 place-items-center rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 font-semibold text-blue-800">Refresh page</button>
            {role !== "anesthetist" && <NotificationBell />}
            {role === "hospital" || role === "surgeon" ? (
              (role === "surgeon" || approved) && <Link href={role === "surgeon" ? "/planned" : "/cases/new"} className="grid min-h-12 place-items-center rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white">Post a Case</Link>
            ) : <>
            <Link
              href="/calendar"
              className="grid min-h-11 place-items-center rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-4 py-2 font-semibold text-[#1B5E20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B5E20]"
            >
              Show Your Availability
            </Link>
            {role !== "anesthetist" && (
            <Link
              href="/payments"
              className="grid min-h-11 place-items-center rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-4 py-2 font-semibold text-[#1B5E20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B5E20]"
            >
              Payments
            </Link>
            )}
            {role !== "anesthetist" && (
            <Link
              href="/notifications"
              className="grid min-h-11 place-items-center rounded-xl border border-[#4CAF50] aoc-light-green bg-[#E8F5E9] px-4 py-2 font-semibold text-[#1B5E20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B5E20]"
            >
              Notifications
            </Link>
            )}
            {role === "anesthetist" && <Link href="/replacement" className="col-span-2 grid min-h-12 place-items-center rounded-xl bg-blue-700 px-4 py-3 text-center font-bold text-white">Find another anesthetist for replacement</Link>}
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
            <div className="rounded-2xl border bg-white p-6 text-black sm:p-8">
              No cases available right now.
            </div>
          )}
          {items.map((item) => (
            <article
              id={`case-${item.id}`}
              key={item.id}
              className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
            >
              <p className="mb-3 font-bold text-blue-800">{item.status === "open" ? "Open case" : "Your active case"}</p>
              <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-bold">
                    {item.procedureName}
                  </h2>
                  <p className="mt-1 break-words text-black">At {item.hospitalName}</p>
                  <p className="mt-2 text-sm leading-6">
                    Reporting time: {new Date(item.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/g, value => value.toUpperCase())}
                  </p>
                  <p className="mt-2 break-words text-sm text-black">
                    Sent by: {item.postedByName || "Name unavailable"} · {item.postedByRole === "anesthetist" ? "Anaesthetist" : item.postedByRole === "hospital" ? "Hospital personnel" : item.postedByRole === "surgeon" ? "Surgeon" : "Role unavailable"}
                  </p>
                </div>
              </div>
              {role === "anesthetist" && item.status === "open" && (
                <div className="mt-5 border-t pt-4">
                  {item.currentResponseStatus === "available" ? (
                    <p className="rounded-xl bg-emerald-50 p-3 font-medium text-emerald-900">
                      You’re marked available
                      {item.currentProposedFeePaise
                        ? ` with an extra bid of ₹${(item.currentProposedFeePaise / 100).toLocaleString("en-IN")} · Total demanded fee ₹${((item.offeredFeePaise + item.currentProposedFeePaise) / 100).toLocaleString("en-IN")}`
                        : ""}
                      .
                    </p>
                  ) : (
                    <button
                      disabled={respondingId !== null}
                      onClick={() => void respondToCase(item.id)}
                      className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white sm:w-auto"
                    >
                      {respondingId === item.id ? "Sending response…" : "I’m Available"}
                    </button>
                  )}
                  {["available", "withdrawn"].includes(item.currentResponseStatus ?? "") && <CaseSms caseId={item.id} action="availability" refreshKey={item.status} onResponseWithdrawn={()=>setItems(previous=>previous.map(c=>c.id===item.id?{...c,currentResponseStatus:'withdrawn'}:c))}/>}
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
                        aria-label="Additional bid above the hospital fee in rupees"
                        placeholder="Additional bid above hospital fee ₹"
                        className="h-12 min-w-0 w-full rounded-xl border px-3 py-2 sm:flex-1"
                      />
                      <button className="min-h-12 w-full rounded-xl border border-emerald-700 px-4 py-2 font-semibold text-emerald-800 sm:w-auto">
                        Submit additional bid
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
              {role === "hospital"&&responses[item.id]&&<section className="mt-5 border-t pt-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Available Anaesthetists</p><h3 className="mt-1 text-xl font-bold">Choose a responder</h3></div>{responseMaps[item.id]&&responses[item.id].some(response=>response.status==="available"&&response.latitude&&response.longitude)?<CaseResponderMap hospital={responseMaps[item.id]!.hospital} responders={responses[item.id].filter(response=>response.status==="available"&&response.latitude&&response.longitude).map(response=>({id:response.id,name:response.clinicianName,latitude:Number(response.latitude),longitude:Number(response.longitude)}))} selectedId={selectedMapResponder[item.id]??null} onRefresh={()=>showResponses(item.id)}/>:<p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-black">Responder locations will appear here when anaesthetists share location with their response.</p>}</section>}
              {item.status === "open" && responses[item.id]
                ?.filter((response) => response.status === "available")
                .map((response) => (
                  <div
                    key={response.id}
                    className="mt-3 grid min-w-0 gap-3 rounded-xl bg-slate-50 p-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 break-words">
                      <b>{response.clinicianName}</b> · {response.qualification}
                      <span className="mt-1 block text-sm text-black">Verification: <b className="capitalize text-emerald-700">{response.verificationStatus}</b> · Distance: <b>{response.distanceMetres!=null?`${(response.distanceMetres/1000).toFixed(1)} km`:"Not shared"}</b>{response.etaMinutes?` · ETA ${response.etaMinutes} min`:""} · Responded {responseTime(response.createdAt)}</span>
                      <span className="mt-2 block text-sm text-slate-800">Hospital posted fee: ₹{(item.offeredFeePaise / 100).toLocaleString("en-IN")} · Additional bid: ₹{(response.additionalFeePaise / 100).toLocaleString("en-IN")}</span>
                      <span className="mt-1 block text-base font-bold text-emerald-900">Total demanded fee for anaesthesia: ₹{(response.totalFeePaise / 100).toLocaleString("en-IN")}</span>
                      {response.match && <span className="mt-1 block text-sm text-blue-700"><b>Recommended Match — {response.match.score}/100</b> · {response.match.reasons.join(" • ")}</span>}
                    </span>
                    <div className="grid gap-2 sm:flex"><button disabled={!response.latitude||!response.longitude} onClick={()=>setSelectedMapResponder(value=>({...value,[item.id]:response.id}))} className="min-h-11 w-full rounded-lg border border-blue-300 px-3 py-2 font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">View on Map</button><button
                      disabled={selectingCaseId !== null}
                      onClick={() => void selectAnaesthetist(item.id,response)}
                      className="min-h-11 w-full rounded-lg bg-blue-700 px-3 py-2 text-white sm:w-auto"
                    >
                      {selectingCaseId === item.id ? "Sending selection…" : "Select Anaesthetist"}
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
                      Cannot attend - reopen case
                    </button>
                  </div>
                )}
              {role === "anesthetist" && item.status === "assigned" && !item.caseStartedAt && item.assignedClinicianUserId === viewerUserId && <button className="mt-4 min-h-12 rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700" onClick={()=>confirm("Cannot attend? This case will reopen for fresh responses.")&&void act(`/api/cases/${item.id}/decline`,{method:"POST"},"Case reopened for fresh responses.")}>Cannot attend - reopen case</button>}
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
                  <strong className="block">Selected: {item.assignedClinicianName || "Anaesthetist"}</strong>
                  <span className="mt-1 block">Selection message sent to {item.assignedClinicianName || "the selected anaesthetist"}. Awaiting acceptance.</span>
                </p>
              )}
              {role === "anesthetist" && item.assignedClinicianUserId===viewerUserId && item.status==="assigned" && <CaseSms caseId={item.id} action="acceptance" refreshKey={item.status}/>}
              {role === "hospital" && ["offered","assigned"].includes(item.status) && <CaseSms caseId={item.id} action="selection" refreshKey={item.status}/>}
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
