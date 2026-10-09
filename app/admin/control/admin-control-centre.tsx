"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/native-link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  BriefcaseMedical,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
type Stats = {
  users: number;
  pendingHospitals: number;
  pendingClinicians: number;
  pendingCases: number;
  openCases: number;
  assignedCases: number;
  completedCases: number;
  suspendedUsers: number;
};
type RoleCounts = { hospitals: number; anesthetists: number; surgeons: number };
type UserRole = "hospital" | "anesthetist" | "surgeon";
type User = {
  id: string;
  fullName: string;
  mobile: string;
  email: string | null;
  role: string;
  status: string;
  accountStatus: "active" | "suspended" | "blocked";
  suspendedUntil: string | null;
  verificationStatus: string;
  hospitalName: string | null;
};
type Case = {
  id: string;
  procedureName: string;
  hospitalName: string;
  status: string;
  urgency: string;
  scheduledAt: string;
};
type Delivery = {
  id: string;
  title: string;
  channel: string;
  status: string;
  errorCode: string | null;
  retryCount: number;
  attemptedAt: string;
};
type Audit = {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  createdAt: string;
};
type AccessAudit = { id: string; userId: string; userName: string; action: string; reason: string; adminActor: string; previousStatus: string; newStatus: string; suspensionExpiresAt: string | null; createdAt: string };
export function AdminControlCentre() {
  const [data, setData] = useState<{
    stats: Stats;
    roleCounts: RoleCounts;
    users: User[];
    cases: Case[];
    deliveries: Delivery[];
    audit: Audit[];
    accessAudit: AccessAudit[];
  } | null>(null);
  const [q, setQ] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("hospital");
  const [verificationStatus, setVerificationStatus] = useState("all");
  const [accountStatus, setAccountStatus] = useState("all");
  const [caseStatus, setCaseStatus] = useState("all");
  const [tab, setTab] = useState("users");
  const [msg, setMsg] = useState("");
  const [accessAction, setAccessAction] = useState<{ user: User; action: "suspend" | "block" | "restore" } | null>(null);
  const [reason, setReason] = useState("");
  const [suspensionHours, setSuspensionHours] = useState("24");
  const load = useCallback(async () => {
    const p = new URLSearchParams({ q, role: tab === "suspended" ? "all" : userRole, verificationStatus: tab === "suspended" ? "all" : verificationStatus, accountStatus: tab === "suspended" ? "suspended" : accountStatus, caseStatus });
    const r = await fetch(`/api/admin/control?${p}`);
    const j = (await r.json()) as {
      stats: Stats;
      roleCounts: RoleCounts;
      users: User[];
      cases: Case[];
      deliveries: Delivery[];
      audit: Audit[];
      accessAudit: AccessAudit[];
      error?: { message?: string };
    };
    if (r.ok) setData(j);
    else setMsg(j.error?.message ?? "Unable to load dashboard.");
  }, [q, userRole, verificationStatus, accountStatus, caseStatus, tab]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  async function action(url: string, body?: object) {
    const r = await fetch(url, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = (await r.json()) as { error?: { message?: string } };
    setMsg(r.ok ? "Action completed." : (j.error?.message ?? "Action failed."));
    if (r.ok) void load();
  }
  async function confirmAccessAction() {
    if (!accessAction || reason.trim().length < 3) { setMsg("Enter a clear reason before confirming."); return; }
    const suspensionExpiresAt = accessAction.action === "suspend" ? new Date(Date.now() + Number(suspensionHours) * 60 * 60 * 1000).toISOString() : undefined;
    await action(`/api/admin/users/${accessAction.user.id}/status`, { action: accessAction.action, reason: reason.trim(), suspensionExpiresAt });
    setAccessAction(null); setReason("");
  }
  const visibleUsers = data ? data.users.filter((user) => tab === "suspended" ? user.accountStatus === "suspended" : user.role === userRole) : [];
  return (
    <main className="min-h-dvh bg-slate-100 px-3 py-5 text-slate-950 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-700">
              ADMIN CONTROL CENTRE
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Platform overview
            </h1>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link href="/admin/performance" className="grid min-h-11 place-items-center rounded-xl border bg-white px-3 py-2 text-center sm:px-4">Ranking controls</Link>
            <Link href="/admin/reviews" className="grid min-h-11 place-items-center rounded-xl border bg-white px-3 py-2 text-center sm:px-4">Review moderation</Link>
            <Link href="/admin/incidents" className="grid min-h-11 place-items-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center font-semibold text-red-800 sm:px-4">Cancellation & no-show review</Link>
            <Link href="/admin/safety" className="grid min-h-11 place-items-center rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-center font-semibold text-red-900 sm:px-4">Clinical safety governance</Link>
            <Link
              href="/admin"
              className="grid min-h-11 place-items-center rounded-xl border bg-white px-3 py-2 text-center sm:px-4"
            >
              Hospital approvals
            </Link>
            <Link
              href="/admin/clinicians"
              className="grid min-h-11 place-items-center rounded-xl border bg-white px-3 py-2 text-center sm:px-4"
            >
              Clinician approvals
            </Link>
            <Link
              href="/admin/cases"
              className="col-span-2 grid min-h-11 place-items-center rounded-xl bg-blue-700 px-4 py-2 text-white"
            >
              Case approvals
            </Link>
          </div>
        </header>
        {msg && (
          <p className="mt-4 rounded-xl bg-blue-50 p-3 text-blue-900">{msg}</p>
        )}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data && (
            <>
              <Metric
                icon={<Users />}
                label="All users"
                value={data.stats.users}
              />
              <Metric
                icon={<ShieldCheck />}
                label="Pending approvals"
                value={
                  data.stats.pendingHospitals +
                  data.stats.pendingClinicians +
                  data.stats.pendingCases
                }
              />
              <Metric
                icon={<BriefcaseMedical />}
                label="Open / assigned"
                value={data.stats.openCases + data.stats.assignedCases}
              />
              <Metric
                icon={<Activity />}
                label="Completed cases"
                value={data.stats.completedCases}
              />
            </>
          )}
        </section>
        <section className="mt-6 rounded-2xl border bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_170px_180px]">
            <label className="flex items-center gap-2 rounded-xl border px-3">
              <Search className="size-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tab === "users" ? `Search ${userRole}s by name, mobile or email` : tab === "suspended" ? "Search suspended accounts by name, mobile or email" : "Search hospital or case"}
                className="min-w-0 flex-1 py-3 outline-none"
              />
            </label>
            <select value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)} className="rounded-xl border p-3">
              <option value="all">All verification</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="rejected">Rejected</option>
            </select>
            <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} className="rounded-xl border p-3">
              <option value="all">All account statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="blocked">Blocked</option>
            </select>
            <select
              value={caseStatus}
              onChange={(e) => setCaseStatus(e.target.value)}
              className="rounded-xl border p-3"
            >
              <option value="all">All case statuses</option>
              <option value="pending_approval">Pending</option>
              <option value="open">Open</option>
              <option value="offered">Offered</option>
              <option value="assigned">Assigned</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </section>
        <nav className="scrollbar-none mt-6 flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-2">
          {[
            ["users", "Users"],
            ["suspended", `Suspended accounts${data ? ` (${data.stats.suspendedUsers})` : ""}`],
            ["cases", "Cases"],
            ["delivery", "Delivery log"],
            ["audit", "Audit log"],
            ["access", "Access log"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`min-h-11 shrink-0 snap-start whitespace-nowrap rounded-xl px-4 py-2 font-semibold ${tab === id ? "bg-slate-900 text-white" : "border bg-white"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "users" && data ? <Tabs value={userRole} onValueChange={(value) => setUserRole(value as UserRole)} className="mt-4">
          <TabsList aria-label="User role groups" className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-white p-1.5 sm:w-fit">
            <TabsTrigger value="hospital" className="min-h-10 px-3 sm:px-4">Hospitals ({Number(data.roleCounts.hospitals ?? 0)})</TabsTrigger>
            <TabsTrigger value="anesthetist" className="min-h-10 px-3 sm:px-4">Anaesthetists ({Number(data.roleCounts.anesthetists ?? 0)})</TabsTrigger>
            <TabsTrigger value="surgeon" className="min-h-10 px-3 sm:px-4">Surgeons ({Number(data.roleCounts.surgeons ?? 0)})</TabsTrigger>
          </TabsList>
        </Tabs> : null}
        <section className="overflow-hidden rounded-2xl border bg-white">
          {!data ? (
            <p className="p-6 sm:p-8">Loading…</p>
          ) : tab === "users" || tab === "suspended" ? (
            <div>
              {tab === "suspended" ? <div className="border-b bg-amber-50 p-4"><h2 className="font-bold text-amber-950">Suspended accounts</h2><p className="mt-1 text-sm text-amber-800">All suspended hospitals, anaesthetists and surgeons are shown together. Use Restore / Reactivate to reinstate an account.</p></div> : null}
              {visibleUsers.map((u) => (
                <article
                  key={u.id}
                  className="grid min-w-0 gap-3 border-b p-4 last:border-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <b className="break-words">{u.fullName}</b>
                    <p className="break-words text-sm text-slate-500">
                      {u.role} · {u.mobile} · {u.email ?? "No email"}
                    </p>
                    <p className="mt-1 text-sm"><StatusBadge value={u.accountStatus} /><span className="ml-2 text-slate-500">Verification: {u.verificationStatus}</span>{u.accountStatus === "suspended" && u.suspendedUntil ? <span className="ml-2 text-amber-700">Until {new Date(u.suspendedUntil).toLocaleString("en-IN")}</span> : null}</p>
                  </div>
                  {u.role !== "admin" && <div className="grid grid-cols-2 gap-2 sm:flex">
                    {u.accountStatus === "active" ? <><button onClick={() => setAccessAction({ user: u, action: "suspend" })} className="min-h-11 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800">Suspend</button><button onClick={() => setAccessAction({ user: u, action: "block" })} className="min-h-11 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white">Block</button></> : <button onClick={() => setAccessAction({ user: u, action: "restore" })} className="col-span-2 min-h-11 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Restore / Reactivate</button>}
                  </div>}
                </article>
              ))}
              {visibleUsers.length === 0 ? <p className="p-8 text-center text-slate-500">{tab === "suspended" ? "No suspended accounts match the current search and filters." : `No ${userRole === "hospital" ? "hospitals" : `${userRole}s`} match the current search and filters.`}</p> : null}
            </div>
          ) : tab === "cases" ? (
            <div>
              {data.cases.map((c) => (
                <article
                  key={c.id}
                  className="grid min-w-0 gap-3 border-b p-4 last:border-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <b className="break-words">{c.procedureName}</b>
                    <p className="break-words text-sm text-slate-500">
                      {c.hospitalName} · {c.urgency} ·{" "}
                      {c.status.replace("_", " ")}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    {c.status === "pending_approval" && (
                      <button
                        onClick={() =>
                          void action(`/api/admin/cases/${c.id}/approve`)
                        }
                        className="min-h-11 rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white"
                      >
                        Approve
                      </button>
                    )}
                    {!["completed", "cancelled"].includes(c.status) && (
                      <button
                        onClick={() =>
                          confirm("Cancel this case?") &&
                          void action(`/api/admin/cases/${c.id}/status`, {
                            status: "cancelled",
                          })
                        }
                        className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : tab === "delivery" ? (
            <div>
              {data.deliveries.map((d) => (
                <article
                  key={d.id}
                  className="grid min-w-0 gap-3 border-b p-4 last:border-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <b className="break-words">{d.title}</b>
                    <p className="break-words text-sm text-slate-500">
                      {d.channel} ·{" "}
                      {d.channel === "sms" && d.status === "sent"
                        ? "Accepted by provider"
                        : d.status}{" "}
                      {d.errorCode ? `· ${d.errorCode}` : ""} · retries{" "}
                      {d.retryCount}
                    </p>
                  </div>
                  {["failed", "skipped"].includes(d.status) && (
                    <button
                      onClick={() =>
                        void action(`/api/admin/deliveries/${d.id}/retry`)
                      }
                      className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
                    >
                      Retry
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : tab === "audit" ? (
            <div>
              {data.audit.map((a) => (
                <article
                  key={a.id}
                  className="min-w-0 border-b p-4 last:border-0"
                >
                  <b className="break-words">{a.action.replaceAll("_", " ")}</b>
                  <p className="break-words text-sm text-slate-500">
                    {a.actorEmail} · {a.targetType} ·{" "}
                    {new Date(a.createdAt).toLocaleString("en-IN")}
                  </p>
                </article>
              ))}
            </div>
          ) : <div>{data.accessAudit.map((a) => <article key={a.id} className="border-b p-4 last:border-0"><div className="flex flex-wrap items-center gap-2"><b>{a.userName}</b><StatusBadge value={a.newStatus} /></div><p className="mt-1 text-sm text-slate-600">{a.previousStatus} → {a.newStatus} · {a.action}</p><p className="mt-1 text-sm">Reason: {a.reason}</p>{a.suspensionExpiresAt ? <p className="mt-1 text-sm text-amber-700">Suspension expires: {new Date(a.suspensionExpiresAt).toLocaleString("en-IN")}</p> : null}<p className="mt-1 break-words text-xs text-slate-500">{a.adminActor} · {new Date(a.createdAt).toLocaleString("en-IN")}</p></article>)}</div>}
        </section>
      </div>
      {accessAction && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="access-action-title"><section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><h2 id="access-action-title" className="text-xl font-bold capitalize">{accessAction.action} {accessAction.user.fullName}?</h2><p className="mt-2 text-sm leading-6 text-slate-600">This immediately restricts protected platform access. Existing clinical, case, payment, rating and incident records will be retained.</p>{accessAction.action === "suspend" ? <label className="mt-5 block text-sm font-semibold">Suspension period<select value={suspensionHours} onChange={(e) => setSuspensionHours(e.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal"><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select></label> : null}<label className="mt-5 block text-sm font-semibold">Reason<textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={4} placeholder="Enter the reason for this action" className="mt-2 w-full rounded-xl border p-3 font-normal outline-none focus:border-blue-600" /></label><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => { setAccessAction(null); setReason(""); }} className="min-h-12 rounded-xl border font-semibold">Cancel</button><button onClick={() => void confirmAccessAction()} disabled={reason.trim().length < 3} className="min-h-12 rounded-xl bg-slate-900 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Confirm {accessAction.action}</button></div></section></div>}
    </main>
  );
}
function StatusBadge({ value }: { value: string }) { const tone = value === "active" ? "bg-emerald-100 text-emerald-800" : value === "blocked" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tone}`}>{value}</span>; }
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#0b3159] p-3 text-white sm:p-4">
      <span className="text-cyan-300">{icon}</span>
      <p className="mt-3 text-2xl font-bold sm:mt-4 sm:text-3xl">{value}</p>
      <p className="break-words text-sm leading-5 text-blue-100">{label}</p>
    </div>
  );
}
