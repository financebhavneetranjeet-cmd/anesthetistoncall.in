"use client";

import Link from "@/components/native-link";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock3, Loader2, ShieldCheck, Stethoscope } from "lucide-react";

type MemberRole = "hospital" | "surgeon" | "anesthetist";
type MemberType = "hospital" | "diagnostic_center" | "surgeon" | "anesthetist";
type Member = { id: string; fullName: string; role: MemberRole; memberType: MemberType; qualification: string; city: string; availabilityStatus: string; availableUntil: string | null };
const groups: { memberType: MemberType; title: string }[] = [
  { memberType: "hospital", title: "Hospitals" },
  { memberType: "diagnostic_center", title: "Diagnostic Centers" },
  { memberType: "surgeon", title: "Surgeons" },
  { memberType: "anesthetist", title: "Anaesthetists" },
];

function MemberCard({ member }: { member: Member }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words text-lg font-semibold">{member.fullName}</h3>
        <p className="break-words text-sm capitalize text-slate-500">{member.memberType.replaceAll("_", " ")} • {member.qualification}</p>
        {member.city && <p className="mt-1 text-sm text-slate-500">{member.city}</p>}
      </div>
      <ShieldCheck aria-label="Verified" className="size-5 shrink-0 text-emerald-600" />
    </div>
    {member.memberType === "anesthetist" && <div className={`mt-5 rounded-xl p-3 text-sm ${member.availabilityStatus === "available" ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"}`}>
      <Clock3 className="mr-2 inline size-4" />
      {member.availabilityStatus === "available" && member.availableUntil ? `Available until ${new Date(member.availableUntil).toLocaleString()}` : "Not currently available"}
    </div>}
  </article>;
}

export function MembersDirectory() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/members", { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { members?: Member[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to load members.");
      const unique = new Map((data.members ?? []).map((member) => [member.id, member]));
      setMembers([...unique.values()]);
    }).catch((cause) => {
      if ((cause as Error).name !== "AbortError") setError((cause as Error).message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return <main className="min-h-dvh bg-slate-50 px-3 py-4 text-slate-950 sm:p-8"><div className="mx-auto max-w-7xl">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="size-4" /> Back home</Link>
    <header className="mt-4 sm:mt-6"><p className="text-sm font-semibold text-blue-700">Verified network</p><h1 className="font-serif text-2xl font-semibold sm:text-3xl">Registered members</h1><p className="mt-2 text-slate-600">Private directory for verified platform users.</p></header>
    {loading ? <div className="mt-10 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" /> Loading members…</div> : error ? <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><ShieldCheck className="mb-3 size-6" /><strong>Verified access required</strong><p className="mt-1 text-sm">{error}</p></div> : members.length === 0 ? <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-7 text-center sm:p-10"><Stethoscope className="mx-auto size-10 text-slate-400" /><p className="mt-4 font-semibold">No verified members yet</p></div> : <div className="mt-8 grid items-start gap-5 lg:grid-cols-4">
      {groups.map((group) => { const groupedMembers = members.filter((member) => member.memberType === group.memberType); return <section key={group.memberType} aria-labelledby={`${group.memberType}-heading`} className="min-w-0">
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3"><h2 id={`${group.memberType}-heading`} className="font-serif text-xl font-semibold">{group.title}</h2><span aria-label={`${groupedMembers.length} verified`} className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">{groupedMembers.length}</span></div>
        <div className="grid gap-3">{groupedMembers.map((member) => <MemberCard key={member.id} member={member} />)}{groupedMembers.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No verified {group.title.toLowerCase()} yet.</p>}</div>
      </section>; })}
    </div>}
  </div></main>;
}
