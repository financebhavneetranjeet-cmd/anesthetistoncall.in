"use client";

import { useState } from "react";
import Link from "@/components/native-link";
import { ArrowLeft, Building2, ShieldCheck, Smartphone, Stethoscope, UserRound } from "lucide-react";
import { OtpVerification } from "@/components/auth/otp-verification";
import { GoogleButton } from "@/components/auth/google-button";
import { saveRegistrationHandoff } from "@/lib/auth/registration-handoff";

export function LoginForm({ signedInName, googleEnabled, googleMessage }: { signedInName: string | null; googleEnabled: boolean; googleMessage: string | null }) {
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<"hospital" | "anesthetist" | "surgeon">("hospital");
  const roles = [
    { value: "hospital" as const, label: "Hospital", icon: Building2 },
    { value: "anesthetist" as const, label: "Anaesthetist", icon: Stethoscope },
    { value: "surgeon" as const, label: "Surgeon", icon: UserRound },
  ];

  return <main className="min-h-dvh bg-slate-50 px-3 py-4 text-slate-950 sm:grid sm:place-items-center sm:px-4 sm:py-8"><section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,.12)] sm:rounded-[2rem] lg:grid-cols-[.9fr_1.1fr]">
    <div className="hidden bg-[#0b3159] p-10 text-white lg:flex lg:flex-col lg:justify-between"><div><div className="mb-10 inline-grid size-12 place-items-center rounded-2xl bg-cyan-400 text-2xl font-black text-[#0b3159]">+</div><p className="text-sm font-semibold uppercase tracking-[.16em] text-cyan-200">Anesthetist on Call</p><h1 className="mt-4 text-4xl font-semibold leading-tight">One secure login for the verified clinical network.</h1></div><div className="space-y-4 text-sm text-blue-100"><p className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-cyan-300" /> Role-based access protects hospital and doctor workflows.</p><p className="flex gap-3"><Smartphone className="size-5 shrink-0 text-cyan-300" /> Sign in with a code sent to your registered mobile.</p></div></div>
    <div className="p-5 sm:p-10 lg:p-12"><Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950 sm:mb-8"><ArrowLeft className="size-4" /> Back to cases</Link><p className="text-sm font-bold uppercase tracking-[.12em] text-blue-700 sm:tracking-[.14em]">Secure access</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome Back</h2><p className="mt-2 leading-6 text-slate-600">{signedInName ? `Signed in with ChatGPT as ${signedInName}.` : "Verify your mobile once. Stay signed in on this device."}</p>
      <div className="mt-8 space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">Login as</legend>
          <div className="grid grid-cols-3 gap-2">{roles.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={`min-h-16 rounded-xl border px-2 py-2 text-xs font-semibold sm:text-sm ${role === value ? "border-blue-700 bg-blue-50 text-blue-800 ring-1 ring-blue-700" : "border-slate-200 bg-white text-slate-600"}`}><Icon className="mx-auto mb-1 size-5" />{label}</button>)}</div>
        </fieldset>
        <h3 className="text-lg font-semibold">Login with Mobile OTP</h3>
        <OtpVerification
          mobile={mobile}
          onMobileChange={setMobile}
          purpose="login"
          loginRole={role}
          sendLabel="Send OTP"
          onVerified={(result) => {
            if (result.registrationRequired && result.challengeId && result.mobile) {
              saveRegistrationHandoff({ challengeId: result.challengeId, mobile: result.mobile });
              window.location.assign("/register/choose-role");
              return;
            }
            if (!result.redirectTo) throw new Error("Unable to sign in. Please retry.");
            window.location.assign(result.redirectTo);
          }}
        />
        <section className="space-y-3 rounded-2xl border-2 border-blue-600 bg-blue-50/60 p-4"><h3 className="text-xl font-semibold">Optional Google login</h3><p className="text-sm text-slate-600">Use your connected Google account for a quick and secure login.</p><GoogleButton role={role} enabled={googleEnabled} />{googleMessage && <p role="status" className="rounded-lg bg-white p-3 text-sm text-slate-700">{googleMessage}</p>}</section>
        <p className="text-center text-sm leading-5 text-slate-500">Hospital · Anaesthetist · Surgeon · Admin. Your role is assigned securely to your registered number.</p><p className="text-center text-sm"><a href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top" className="font-semibold text-blue-700">Administrator recovery with ChatGPT</a></p></div>
    </div></section></main>;
}
