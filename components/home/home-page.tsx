"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "@/components/native-link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Hospital,
  LockKeyhole,
  Loader2,
  MapPin,
  Star,
  Stethoscope,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShareLocation } from "@/components/home/share-location";
import { EmergencyAvailabilityMap } from "@/components/home/emergency-availability-map";
import { PublicCases } from "@/components/home/public-cases";
import type { PublicCaseSummary } from "@/lib/server/public-cases";
import { CURRENT_RELEASE } from "@/lib/release";

type Account = { fullName: string; role: string; verified: boolean };
type EmergencyAvailableAnaesthetist = { status: "Available Now"; availableUntil: string; approximateLocation: { latitude: number; longitude: number; precision: "approximate" } | null; ranking: number; rating: number | null; ratingCount: number };
type EmergencyAvailabilityResponse = { count: number; nextExpiry?: string | null; anaesthetists: EmergencyAvailableAnaesthetist[]; error?: { message?: string } };

export function HomePage({ account, chatgptName, initialAvailabilityCount, publicCases }: { account: Account | null; chatgptName: string | null; initialAvailabilityCount: number; publicCases: PublicCaseSummary[] | null }) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availability, setAvailability] = useState<EmergencyAvailabilityResponse>({ count: initialAvailabilityCount, anaesthetists: [] });
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const loadAvailability = useCallback(async () => {
    try {
      setAvailabilityBusy(true);
      const response = await fetch("/api/emergency-availability", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const payload = await response.json() as EmergencyAvailabilityResponse;
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load emergency availability.");
      setAvailability(payload);
      setAvailabilityError("");
    } catch (cause) {
      setAvailabilityError((cause as Error).message);
    } finally {
      setAvailabilityBusy(false);
    }
  }, [account?.verified]);

  useEffect(() => {
    void loadAvailability();
    const timer = window.setInterval(() => void loadAvailability(), 5000);
    return () => window.clearInterval(timer);
  }, [account?.verified, loadAvailability]);
  useEffect(() => {
    if (!availability.nextExpiry) return;
    const nextExpiry = new Date(availability.nextExpiry).getTime();
    const timer = window.setTimeout(() => void loadAvailability(), Math.max(0, nextExpiry - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [availability.nextExpiry, loadAvailability]);

  const mobileActionHref = account && !account.verified
    ? "/account/pending"
    : account?.role === "hospital"
      ? "/cases/new"
      : account
        ? "/cases"
        : "/login";
  return <main className="relative min-h-dvh bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-slate-950 sm:pb-10">
    <span className="absolute right-3 top-1 z-10 text-[.68rem] font-medium text-slate-400 sm:right-4" aria-label={`Version ${CURRENT_RELEASE.version}, ${CURRENT_RELEASE.name}`}>Version {CURRENT_RELEASE.version}</span>
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6"><Link className="flex min-w-0 items-center gap-3" href="/"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-2xl font-black text-white">+</span><span className="min-w-0"><strong className="block text-lg leading-tight">Anesthetist on Call</strong><small className="block text-slate-500">Amritsar’s Network of Qualified Anaesthetists</small></span></Link><nav className="hidden items-center gap-1 sm:flex">{account ? <Link href="/cases" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Case dashboard</Link> : <a href="#available-cases" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cases</a>}<Link href="/availability" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Availability</Link><Link href="/members" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Members</Link><Button asChild variant="outline" className="ml-2 rounded-xl"><Link href="/login">{account ? account.fullName : "Login"}</Link></Button></nav></div></header>

    <section className="border-b border-slate-100 bg-gradient-to-b from-blue-50/70 to-white"><div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:py-24"><button type="button" onClick={() => { setAvailabilityOpen(true); void loadAvailability(); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-blue-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-blue-800 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><Clock3 className="size-4" />Anaesthetists Available for Emergency Now ({availability.count})</button><h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Need an Anaesthetist for Your Case?</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">Find verified anaesthetists who are available when you need them. (Registered in Punjab Medical Council)</p><div className="mx-auto mt-9 grid max-w-lg gap-3 sm:grid-cols-2"><Button asChild size="lg" className="h-auto min-h-13 whitespace-normal rounded-xl bg-blue-700 py-3 text-base hover:bg-blue-800"><Link href={account?.role === "anesthetist" ? "/replacement" : "/cases/new"}><Building2 />{account?.role === "anesthetist" ? "Find another anesthetist for replacement" : "Post a Case"}</Link></Button><Button asChild size="lg" variant="outline" className="min-h-13 rounded-xl border-slate-300 bg-white text-base text-slate-800 hover:bg-slate-50"><a href="#available-cases"><Stethoscope />View Available Cases</a></Button></div><p className="mt-5 text-sm text-slate-500">{account ? `Signed in as ${account.fullName} · ${roleLabel(account.role)}` : chatgptName ? `ChatGPT account recognised as ${chatgptName}. Mobile verification is required for platform access.` : "Secure access through mobile OTP and professional verification."}</p></div></section>

    <PublicCases initialCases={publicCases} signedIn={Boolean(account?.verified)} />

    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18"><div className="text-center"><p className="text-sm font-bold uppercase tracking-wider text-blue-700">How It Works</p><h2 className="mt-2 text-3xl font-bold tracking-tight">A clear way to arrange anaesthesia support</h2></div><div className="mt-9 grid gap-4 md:grid-cols-3"><WorkflowStep number="1" icon={<Hospital />} title="Hospital posts a case" copy="Add the procedure, time and essential case details." /><WorkflowStep number="2" icon={<Clock3 />} title="Anaesthetists respond" copy="Available professionals respond “I’m Available.”" /><WorkflowStep number="3" icon={<UserRoundCheck />} title="Hospital selects" copy="The hospital chooses an anaesthetist for the case." /></div></section>

    <section className="border-y border-slate-200 bg-slate-50"><div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><h2 className="text-center text-xl font-bold">Built for simple, trusted coordination</h2><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><TrustPoint title="Verified professionals" /><TrustPoint title="Simple case posting" /><TrustPoint title="Availability-based response" /><TrustPoint title="Hospital chooses" /></div><div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" className="rounded-xl bg-white" onClick={() => setJoinOpen(true)}><Stethoscope />Join the network</Button><Button asChild variant="ghost" className="rounded-xl"><Link href="/members">View registered members<ArrowRight /></Link></Button></div></div></section>

    <footer className="mx-auto flex max-w-6xl items-center justify-end px-4 pt-5 sm:px-6">
      <Link href="/admin" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" aria-label="Open Admin Panel">
        <LockKeyhole className="size-3.5" aria-hidden="true" /> Admin
      </Link>
    </footer>
    <MobileNav primaryHref={mobileActionHref} signedIn={Boolean(account)} /><JoinDialog open={joinOpen} onOpenChange={setJoinOpen} /><EmergencyAvailabilityDialog open={availabilityOpen} onOpenChange={setAvailabilityOpen} canShare={Boolean(account?.verified && account.role === "anesthetist")} verified={Boolean(account?.verified)} availability={availability} busy={availabilityBusy} error={availabilityError} onRetry={() => void loadAvailability()} />
  </main>;
}

function roleLabel(role: string) { return role === "admin" ? "Administrator" : role === "hospital" ? "Hospital" : role === "surgeon" ? "Surgeon" : "Anaesthetist"; }
function WorkflowStep({ number, icon, title, copy }: { number: string; icon: ReactNode; title: string; copy: string }) { return <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700 [&>svg]:size-5">{icon}</span><span className="text-3xl font-bold text-slate-200">{number}</span></div><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 leading-7 text-slate-600">{copy}</p></article>; }
function TrustPoint({ title }: { title: string }) { return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700"><CheckCircle2 className="size-5 shrink-0 text-emerald-600" />{title}</div>; }
function MobileNav({ primaryHref, signedIn }: { primaryHref: string; signedIn: boolean }) { return <nav aria-label="Mobile navigation" className={`fixed inset-x-0 bottom-0 z-40 grid ${signedIn ? "grid-cols-4" : "grid-cols-5"} border-t border-slate-200 bg-white/95 px-1 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur sm:hidden`}><Link href="/" className="grid min-h-12 place-items-center gap-1 text-[.7rem] font-semibold text-blue-700"><Hospital className="size-5" />Home</Link><Link href="/members" className="grid min-h-12 place-items-center gap-1 text-[.7rem] font-medium text-slate-600"><CalendarClock className="size-5" />Members</Link><Link href={primaryHref} className="grid min-h-12 place-items-center gap-1 text-[.7rem] font-medium text-slate-600"><span className="grid size-7 place-items-center rounded-full bg-blue-700 text-white">+</span>Action</Link><Link href="/availability" className="grid min-h-12 place-items-center gap-1 text-[.7rem] font-medium text-slate-600"><Clock3 className="size-5" />Available</Link>{!signedIn && <Link href="/login" className="grid min-h-12 place-items-center gap-1 text-[.7rem] font-medium text-slate-600"><UserRoundCheck className="size-5" />Login</Link>}</nav>; }
function JoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Join the verified network</DialogTitle><DialogDescription>Choose the registration that matches your role. Mobile verification and admin approval are required.</DialogDescription></DialogHeader><div className="space-y-3"><Button asChild className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"><Link href="/register/hospital"><Building2 /> Register a hospital</Link></Button><Button asChild variant="outline" className="w-full rounded-xl"><Link href="/register/clinician"><Stethoscope /> Register as anaesthetist or surgeon</Link></Button></div></DialogContent></Dialog>; }
function EmergencyAvailabilityDialog({ open, onOpenChange, verified, availability, busy, error, onRetry, canShare }: { canShare: boolean; open: boolean; onOpenChange: (value: boolean) => void; verified: boolean; availability: EmergencyAvailabilityResponse; busy: boolean; error: string; onRetry: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-4xl"><DialogHeader><DialogTitle>Anaesthetists Available for Emergency Now ({availability.count})</DialogTitle><DialogDescription>Privacy-safe live availability. Identity and exact location are not shared here.</DialogDescription></DialogHeader>{!verified ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950"><p className="font-semibold">Verified member access is required to view availability details.</p><Button asChild className="mt-4 rounded-xl bg-blue-700"><Link href="/login">Login with mobile OTP</Link></Button></div> : <div className="space-y-5">{canShare && <ShareLocation onUpdated={onRetry} />}{busy && availability.anaesthetists.length === 0 ? <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" />Loading live availability…</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<Button onClick={onRetry} className="ml-3">Retry</Button></p> : availability.anaesthetists.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No eligible anaesthetists are available right now.</p> : <><EmergencyAvailabilityMap anaesthetists={availability.anaesthetists} /><div className="grid gap-3 sm:grid-cols-2">{availability.anaesthetists.map((item, index) => <article key={`${item.availableUntil}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{item.status}</span><span className="text-sm font-bold text-blue-800">Rank {index + 1} · Score {item.ranking}</span></div><p className="mt-4 text-sm text-slate-700"><Clock3 className="mr-2 inline size-4" />Available until {new Date(item.availableUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })}</p><p className="mt-2 text-sm text-slate-700"><MapPin className="mr-2 inline size-4" />{item.approximateLocation ? "Approximate location shared" : "Location not shared"}</p><p className="mt-2 text-sm text-slate-700"><Star className="mr-2 inline size-4" />{item.rating === null ? "No published rating yet" : `${item.rating.toFixed(1)} / 5 (${item.ratingCount} ratings)`}</p></article>)}</div></>}</div>}</DialogContent></Dialog>; }
