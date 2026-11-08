"use client";

import Link from "@/components/native-link";
import { Label } from "@/components/ui/label";

/**
 * Review-only component: caller must validate required choices on the server,
 * record versioned consent against the authenticated registration, and provide
 * legally reviewed policy URLs before enabling in production.
 * Checkbox/OTP acceptance is NOT Aadhaar eSign.
 */
export type RegistrationConsent = {
  termsAccepted: boolean;
  verificationAuthorized: boolean;
  authorityConfirmed: boolean;
};

export const CONSENT_DRAFT_VERSION = "draft-2026-11-09";

export function RegistrationConsentFields({
  role,
  value,
  onChange,
}: {
  role: "anesthetist" | "surgeon" | "hospital";
  value: RegistrationConsent;
  onChange: (next: RegistrationConsent) => void;
}) {
  const isDoctor = role !== "hospital";
  const checkbox = (key: keyof RegistrationConsent, label: string, explanation: string) => (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4" key={key}>
      <input
        id={key}
        type="checkbox"
        checked={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
        className="mt-1 size-5 shrink-0"
      />
      <div>
        <Label htmlFor={key} className="font-semibold">{label}</Label>
        <p className="mt-1 text-sm leading-6 text-slate-600">{explanation}</p>
      </div>
    </div>
  );
  return (
    <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4 sm:p-5">
      <legend className="px-2 text-lg font-semibold">Digital consent &amp; agreement</legend>
      <p className="text-sm text-slate-600">Please review the full agreement and privacy notice before confirming. These are consent acknowledgements, not electronic signatures.</p>
      <p className="text-sm">
        <Link href="/terms" className="underline">Terms &amp; Conditions</Link>
        {" · "}
        <Link href="/privacy" className="underline">Privacy Notice</Link>
        {" · "}
        <Link href={isDoctor ? "/agreements/doctor" : "/agreements/hospital"} className="underline">Registration Agreement</Link>
      </p>
      {checkbox("termsAccepted", "I agree to the Terms & Conditions (required)",
        "I confirm my details are accurate. I understand that this platform coordinates independent medical professionals and facilities. Professional fees are agreed and paid directly between hospitals and doctors. Registration is currently free. Any future platform subscription requires separate advance notice and acceptance.")}
      {isDoctor
        ? checkbox("verificationAuthorized", "I authorise medical registration verification (required)",
            "I authorise checks of my registration and qualifications against available official NMC or State Medical Council records and processing of relevant certificates under the Privacy Notice. This is not proof of verification or NMC endorsement.")
        : checkbox("authorityConfirmed", "I am authorised to represent this facility (required)",
            "I confirm that I have authority to accept the Hospital Agreement for this facility and acknowledge its clinical, operational, patient-safety and direct-payment obligations as defined in that agreement.")}
      <p className="text-xs text-slate-500">Aadhaar-based eSign is not currently enabled. Where signatures are required, use a separate supported signing process. Never submit Aadhaar numbers or OTPs to this site.</p>
    </fieldset>
  );
}
