"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, CalendarClock, RefreshCw, Building2, Stethoscope, Plus, Clock3, ClipboardList, UserRoundCheck, MessageSquare } from "lucide-react";
import { CaseSms } from "@/components/case-sms";
import Link from "@/components/native-link";
import { CaseResponderMap } from "./case-responder-map";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { DashboardRole } from "@/lib/dashboard-roles";
import { DashboardChoices } from "@/components/auth/dashboard-choices";
import { AvailableClinicians } from "@/app/availability/available-clinicians";

type CaseItem = {
  id: string;
  procedureName: string;
  specialty: string | null;
  location: string | null;
  anaesthesiaType: string;
  scheduledAt: string;
  expiresAt: string;
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
  mobile: string | null;
  qualification: string;
  verificationStatus: string;
  registrationNumber: string | null;
  stateCouncil: string | null;
  nmcRecordMatched: number;
  createdAt: string;
  distanceMetres: number | null;
  etaMinutes: number | null;
  latitude: string | null;
  longitude: string | null;
  match?: { score:number; reasons:string[]; dataState:string };
  reliability?: { score:number|null;rating:number;ratingCount:number;completedCases:number;arrivalPerformance:string };
};
type ResponseMap={hospital:{name:string;latitude:number;longitude:number}};
function contactNumber(mobile: string | null) {
  if (!mobile) return null;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

export function CasesDashboard({
  role,
  approved,
  viewerUserId,
  dualDashboard,
  displayName,
  dashboardRoles,
}: {
  dashboardRoles?: DashboardRole[];
  displayName?: string;
  role: string;
  approved: boolean;
  viewerUserId: string;
  dualDashboard: boolean;
}) {
  const isPoster = role === "hospital" || role === "surgeon";
  const [loaded, setLoaded] = useState(false);
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
    if (response.ok) { setItems(result.cases.filter(item => new Date(item.expiresAt).getTime() > Date.now())); setLoaded(true); }
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
  useEffect(() => {
    const next = Math.min(...items.map(item => new Date(item.expiresAt).getTime()).filter(time => Number.isFinite(time) && time > Date.now()));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => {
      setItems(previous => previous.filter(item => new Date(item.expiresAt).getTime() > Date.now()));
      void load();
    }, Math.max(0, next - Date.now() + 10));
    return () => window.clearTimeout(timer);
  }, [items, load]);

  async function act(url: string, options: RequestInit, success: string) {
    const response = await fetch(url, options);
    const result = (await response.json()) as { error?: { message?: string } };
    setMessage(
      response.ok ? success : (result.error?.message ?? "Action failed."),
    );
    if (response.ok) void load();
    return response.ok;
  }
  async function notifyResponder(caseId: string, response: ResponseItem) {
    try {
      await act(`/api/cases/${caseId}/notify-responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: response.id }),
      }, `App notification added for ${response.clinicianName}.`);
    } catch {
      setMessage("Unable to send the app notification. Please try again.");
    }
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
        {(dashboardRoles ? dashboardRoles.length > 1 : dualDashboard) && <div className="mb-5"><DashboardChoices roles={dashboardRoles ?? ["anesthetist", "admin"]} currentRole={role} /></div>}
        <header className={isPoster ? "flex flex-wrap items-start justify-between gap-5 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm sm:p-7" : "flex flex-wrap items-start justify-between gap-4"}>
          <div>
            <p className="text-sm font-semibold text-blue-700">
              ANESTHETIST ON CALL
            </p>
            {isPoster && <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800">{role === "hospital" ? <Building2 aria-hidden="true" className="size-4" /> : <Stethoscope aria-hidden="true" className="size-4" />}{role === "hospital" ? "Hospital dashboard" : "Surgeon dashboard"}</span>}
            <h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">{isPoster ? displayName || (role === "hospital" ? "Hospital dashboard" : "Surgeon dashboard") : "Your cases"}</h1>
            {isPoster && <p className="mt-2 max-w-lg text-sm leading-6">Your cases, responses and anaesthesia support in one place.</p>}
          </div>
          <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-3">
            <button type="button" onClick={()=>window.location.reload()} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"><RefreshCw aria-hidden="true" className="size-5 shrink-0 motion-safe:transition-transform motion-safe:group-hover:rotate-180" />Refresh page</button>
            {role !== "anesthetist" && <NotificationBell />}
            {role === "hospital" || role === "surgeon" ? (
              (role === "surgeon" || approved) && <Link href={role === "surgeon" ? "/planned" : "/cases/new"} className="order-first col-span-2 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 px-6 py-4 text-lg font-bold text-white shadow-md transition hover:from-blue-800 hover:to-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:order-none"><Plus aria-hidden="true" className="size-6" />Post a Case</Link>
            ) : <>
            <Link
              href="/calendar"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-700 bg-emerald-700 px-4 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              <CalendarClock aria-hidden="true" className="size-5 shrink-0" />
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
            {role === "anesthetist" && <Link href="/replacement" className="col-span-2 flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 px-5 py-4 text-center text-white shadow-md transition hover:from-blue-800 hover:to-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15"><ArrowRightLeft aria-hidden="true" className="size-5" /></span><span><span className="block font-bold">Find Another Anesthetist</span><span className="mt-1 block text-sm font-medium text-blue-100">Request a replacement</span></span></Link>}
            </>}
          </div>
        </header>
        <section id="available-anaesthetists" className="mt-5 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-6">
          <AvailableClinicians embedded />
        </section>
        {isPoster && <section aria-label="Case overview" aria-busy={!loaded} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <OverviewCard label="Active Cases" value={loaded ? items.length : null} icon={<ClipboardList aria-hidden="true" className="size-5" />} tone="blue" />
          <OverviewCard label="Awaiting Selection" value={loaded ? items.filter(item=>item.status === "open").length : null} icon={<Clock3 aria-hidden="true" className="size-5" />} tone="amber" />
          <OverviewCard label="Selected / Assigned" value={loaded ? items.filter(item=>["offered","assigned"].includes(item.status)).length : null} icon={<UserRoundCheck aria-hidden="true" className="size-5" />} tone="emerald" />
          <p className="col-span-2 text-xs leading-5 sm:col-span-3">Counts cover cases currently shown in the active dashboard’s 12-hour window. Selection may still await acceptance.</p>
        </section>}
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
              {loaded ? "No cases available right now." : "Loading your cases…"}
            </div>
          )}
          {items.map((item) => (
            <article
              id={`case-${item.id}`}
              key={item.id}
              className={isPoster ? "min-w-0 rounded-3xl border border-slate-200 border-l-4 border-l-blue-600 bg-white p-5 shadow-sm sm:p-6" : "min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"}
            >
              {isPoster ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${item.status === "assigned" ? "bg-emerald-100 text-emerald-900" : ["open","offered","pending"].includes(item.status) ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{statusLabel(item.status)}</span><span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"><MessageSquare aria-hidden="true" className="size-4" />{item.responseCount} {item.responseCount === 1 ? "response" : "responses"}</span></div> : <p className="mb-3 font-bold text-blue-800">{item.status === "open" ? "Open case" : "Your active case"}</p>}
              <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-bold">
                    {item.procedureName}
                  </h2>
                  <p className="mt-2 break-words font-semibold text-black">At {item.hospitalName}</p>
                  <p className={isPoster ? "mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-lg font-bold leading-7" : "mt-2 text-sm leading-6"}>
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
                  className="mt-5 min-h-12 w-full rounded-2xl bg-blue-700 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto"
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
                      {contactNumber(response.mobile) ? <span className="mt-1 block text-sm"><span className="font-semibold">Phone: {response.mobile}</span> · <a className="font-bold text-blue-700 underline" href={`tel:${contactNumber(response.mobile)}`}>Call</a> · <a className="font-bold text-blue-700 underline" href={`sms:${contactNumber(response.mobile)}`}>SMS</a></span> : <span className="mt-1 block text-sm text-amber-800">Phone number unavailable. Ask the anaesthetist to update their verified account.</span>}
                      {response.registrationNumber && <span className="mt-1 block text-sm">
                        <b>{response.stateCouncil === "Punjab Medical Council" ? "PMC No." : response.stateCouncil ?? "Medical registration"}</b> {response.registrationNumber}
                        {Boolean(response.nmcRecordMatched) && <span className="ml-2 font-semibold text-emerald-800">Verified against NMC records by Admin</span>}
                      </span>}
                      <span className="mt-1 block text-sm text-black">Verification: <b className="capitalize text-emerald-700">{response.verificationStatus}</b> · Distance: <b>{response.distanceMetres!=null?`${(response.distanceMetres/1000).toFixed(1)} km`:"Not shared"}</b>{response.etaMinutes?` · ETA ${response.etaMinutes} min`:""} · Responded {responseTime(response.createdAt)}</span>
                      <span className="mt-2 block text-sm text-slate-800">Hospital posted fee: ₹{(item.offeredFeePaise / 100).toLocaleString("en-IN")} · Additional bid: ₹{(response.additionalFeePaise / 100).toLocaleString("en-IN")}</span>
                      <span className="mt-1 block text-base font-bold text-emerald-900">Total demanded fee for anaesthesia: ₹{(response.totalFeePaise / 100).toLocaleString("en-IN")}</span>
                      {response.match && <span className="mt-1 block text-sm text-blue-700"><b>Recommended Match — {response.match.score}/100</b> · {response.match.reasons.join(" • ")}</span>}
                    </span>
                    <div className="grid gap-2 sm:flex sm:flex-wrap">{role === "hospital" && <button type="button" onClick={() => void notifyResponder(item.id, response)} className="min-h-11 rounded-lg border border-blue-300 px-3 py-2 font-semibold text-blue-800">Send App Notification</button>}<button disabled={!response.latitude||!response.longitude} onClick={()=>setSelectedMapResponder(value=>({...value,[item.id]:response.id}))} className="min-h-11 w-full rounded-lg border border-blue-300 px-3 py-2 font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">View on Map</button><button
                      disabled={selectingCaseId !== null}
                      onClick={() => void selectAnaesthetist(item.id,response)}
                      className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto"
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

function OverviewCard({label,value,icon,tone}:{label:string;value:number|null;icon:React.ReactNode;tone:"blue"|"amber"|"emerald"}) {
  const colors={blue:"bg-blue-50 text-blue-800",amber:"bg-amber-50 text-amber-900",emerald:"bg-emerald-50 text-emerald-800"};
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><span className={`inline-flex rounded-xl p-2 ${colors[tone]}`}>{icon}</span><span className="mt-3 block text-3xl font-bold tabular-nums">{value ?? "—"}</span><span className="mt-1 block text-sm font-semibold text-slate-700">{label}</span></div>;
}
function statusLabel(status: string) {
  const labels:Record<string,string>={open:"Awaiting Selection",offered:"Selected · Pending Acceptance",assigned:"Selected / Assigned",pending:"Awaiting Approval",completed:"Completed",cancelled:"Cancelled",replacement_required:"Replacement Required",replacement_searching:"Finding Replacement"};
  return labels[status] ?? status.replaceAll("_"," ");
}
function responseTime(createdAt:string){const seconds=Math.max(0,Math.round((Date.now()-new Date(createdAt).getTime())/1000));if(seconds<60)return `${seconds}s ago`;const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes} min ago`;const hours=Math.floor(minutes/60);return `${hours} hr ago`;}
