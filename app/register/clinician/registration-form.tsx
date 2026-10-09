"use client";
import { emailSchema } from "@/lib/auth/email";

import Link from "@/components/native-link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FileCheck2, Loader2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpVerification } from "@/components/auth/otp-verification";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clearRegistrationHandoff, readRegistrationHandoff } from "@/lib/auth/registration-handoff";

type Step = "mobile" | "details" | "document" | "pending";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? "Something went wrong.");
  return data;
}

export function ClinicianRegistrationForm() {
  const [step, setStep] = useState<Step>("mobile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [role, setRole] = useState<"anesthetist" | "surgeon">("anesthetist");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [stateCouncil, setStateCouncil] = useState("Punjab Medical Council");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [qualification, setQualification] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const handoff = readRegistrationHandoff();
      if (!handoff || (handoff.role !== "anesthetist" && handoff.role !== "surgeon")) return;
      setChallengeId(handoff.challengeId);
      setMobile(handoff.mobile);
      setRole(handoff.role);
      setStep("details");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submitRegistration() {
    if (!challengeId) return setError("Verify your mobile number first.");
    if (!emailSchema.safeParse(email).success) return setError("Enter a valid email address.");
    if (fullName.trim().length < 2 || registrationNumber.trim().length < 3 || qualification.trim().length < 2) return setError("Complete your contact and medical-registration details.");
    setBusy(true); setError(null);
    try {
      await api("/api/clinicians/register", { method: "POST", body: JSON.stringify({ challengeId, fullName, mobile, email, role, stateCouncil, registrationNumber, qualification, city: "Amritsar" }) });
      clearRegistrationHandoff();
      setStep("document");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!file) return setError("Select your PMC certificate.");
    setBusy(true); setError(null);
    const form = new FormData(); form.set("file", file); form.set("documentType", "pmc_certificate");
    try {
      await api("/api/clinicians/documents", { method: "POST", body: form });
      setStep("pending");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function skipDocument() { setError(null); setStep("pending"); }

  return <main className="min-h-dvh bg-[#f3f7fb] px-3 py-4 text-slate-950 sm:px-4 sm:py-10"><div className="mx-auto max-w-3xl"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="size-4" /> Back to home</Link><div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,.1)] sm:mt-6 sm:rounded-[2rem]"><header className="bg-[#0b3159] p-5 text-white sm:p-9"><div className="flex items-start gap-3 sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-300 text-[#0b3159] sm:size-11 sm:rounded-2xl"><Stethoscope /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.1em] text-cyan-200 sm:text-sm sm:tracking-[.12em]">Doctor onboarding</p><h1 className="font-serif text-2xl font-semibold sm:text-3xl">Join the verified network</h1></div></div><p className="mt-4 text-sm leading-6 text-blue-100 sm:mt-5">For anesthetists and surgeons currently serving Amritsar.</p></header><section className="p-5 sm:p-9">
    {step === "mobile" && <div className="space-y-6"><div><h2 className="text-2xl font-semibold">Verify your mobile number</h2><p className="mt-2 text-sm text-slate-500">We will send an OTP before collecting your professional registration details.</p></div><OtpVerification mobile={mobile} onMobileChange={setMobile} purpose="registration" onVerified={(result) => { if (!result.challengeId) throw new Error("Mobile verification did not complete."); setChallengeId(result.challengeId); setError(null); setStep("details"); }} /></div>}
    {step === "details" && <div className="space-y-5"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mr-2 inline size-5" /><strong>+91 {mobile}</strong> verified</div><div><h2 className="text-xl font-semibold">Choose your role</h2><p className="mt-1 text-sm text-slate-500">Professional accounts remain pending until admin verification.</p></div><div className="grid gap-2 sm:grid-cols-2"><RoleButton active={role === "anesthetist"} onClick={() => setRole("anesthetist")} label="Anesthetist" /><RoleButton active={role === "surgeon"} onClick={() => setRole("surgeon")} label="Surgeon" /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="As on PMC certificate" /></Field><Field label="Email Address (required)"><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" placeholder="doctor@example.com" /></Field></div><div className="border-t border-slate-200 pt-5"><h2 className="text-lg font-semibold">Medical registration</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="State medical council"><Select value={stateCouncil} onValueChange={(value) => setStateCouncil(value ?? "Punjab Medical Council")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Punjab Medical Council">Punjab Medical Council</SelectItem><SelectItem value="Other State Medical Council">Other State Medical Council</SelectItem></SelectContent></Select></Field><Field label="Registration number"><Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="PMC registration no." /></Field></div><div className="mt-4"><Field label="Qualification"><Input value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="e.g. MD Anaesthesia" /></Field></div></div><Button aria-busy={busy} disabled={busy} onClick={submitRegistration} className="h-12 w-full rounded-xl bg-blue-700">{busy && <Loader2 className="animate-spin" />} Complete registration</Button></div>}
    {step === "document" && <div className="min-w-0 space-y-6"><div><FileCheck2 className="size-10 text-blue-700" /><h2 className="mt-4 text-2xl font-semibold">PMC Certificate (Optional)</h2><p className="mt-2 text-sm text-slate-500">PDF, JPG or PNG up to 5 MB. It is private and visible only to Admin. If PMC verification cannot be completed, the certificate will become required for manual verification.</p></div><Input className="h-auto min-h-12 w-full py-2 file:mr-2 file:max-w-full" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Button aria-busy={busy} disabled={busy || !file} onClick={uploadDocument} className="h-12 w-full rounded-xl bg-emerald-600">{busy && <Loader2 className="animate-spin" />} Upload and submit for verification</Button><Button disabled={busy} variant="outline" onClick={skipDocument} className="h-12 w-full rounded-xl">Continue without certificate</Button></div>}
    {step === "pending" && <p className="mb-4 rounded-xl bg-blue-50 p-4 text-center text-sm text-blue-900"><a href="/account/google" className="inline-flex min-h-11 items-center font-semibold underline">Connect Google for faster login next time</a></p>}
    {step === "pending" && <div className="py-8 text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-amber-100 text-amber-700"><Clock3 className="size-8" /></span><h2 className="mt-5 text-2xl font-semibold">PMC verification pending</h2><p className="mx-auto mt-3 max-w-md text-slate-600">Admin will verify your PMC registration. A certificate is required only if PMC verification cannot be completed.</p><Button asChild className="mt-7 rounded-xl bg-blue-700"><Link href="/account/pending">View verification status</Link></Button></div>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
  </section></div></div></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>; }
function RoleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button type="button" onClick={onClick} className={`rounded-xl border p-4 font-semibold ${active ? "border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-100" : "border-slate-200"}`}>{active && <CheckCircle2 className="mr-2 inline size-4" />}{label}</button>; }
