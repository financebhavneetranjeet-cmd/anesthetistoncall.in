"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { mobileSchema, normalizeIndianMobileInput } from "@/lib/auth/otp";
import {
  exchangeVerifiedMobile,
  friendlyOtpError,
  initialiseOtpWidget,
  resendMobileOtp,
  sendMobileOtp,
  verifyMobileOtp,
  type OtpPurpose,
  type LoginRole,
  type VerifiedMobileResult,
} from "@/lib/auth/widget";

const OTP_EXPIRY_SECONDS = 15 * 60;
const RESEND_WAIT_SECONDS = 60;

type OtpVerificationProps = {
  mobile: string;
  onMobileChange: (mobile: string) => void;
  purpose: OtpPurpose;
  onVerified: (result: VerifiedMobileResult) => void | Promise<void>;
  beforeSend?: () => string | null;
  sendLabel?: string;
  loginRole?: LoginRole;
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function OtpVerification({
  mobile,
  onMobileChange,
  purpose,
  onVerified,
  beforeSend,
  sendLabel = "Send OTP",
  loginRole,
}: OtpVerificationProps) {
  const fieldId = `otp-${useId().replace(/:/g, "")}`;
  const inFlight = useRef(false);
  const [stage, setStage] = useState<"mobile" | "otp">("mobile");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void initialiseOtpWidget().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (stage !== "otp") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const expirySeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = stage === "otp" && expirySeconds === 0;

  async function run(action: "send" | "verify" | "resend", task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(friendlyOtpError(cause, action));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function startTimers(message: string) {
    const sentAt = Date.now();
    setNow(sentAt);
    setExpiresAt(sentAt + OTP_EXPIRY_SECONDS * 1000);
    setResendAt(sentAt + RESEND_WAIT_SECONDS * 1000);
    setOtp("");
    setNotice(message);
    setStage("otp");
  }

  function requestOtp() {
    const preflightError = beforeSend?.();
    if (preflightError) {
      setError(preflightError);
      return;
    }
    if (!mobileSchema.safeParse(mobile).success) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    void run("send", async () => {
      await initialiseOtpWidget();
      await sendMobileOtp(mobile);
      startTimers(`OTP sent to +91 ${mobile}.`);
    });
  }

  function verifyOtp() {
    if (expired) {
      setError("This OTP has expired. Tap Resend OTP for a new code.");
      return;
    }
    if (!/^\d{4}$/.test(otp)) {
      setError("Enter the complete 4-digit OTP.");
      return;
    }
    void run("verify", async () => {
      const accessToken = await verifyMobileOtp(otp);
      const result = await exchangeVerifiedMobile(mobile, purpose, accessToken, loginRole);
      setNotice("Mobile number verified successfully.");
      await onVerified(result);
    });
  }

  function resendOtp() {
    if (resendSeconds > 0) return;
    void run("resend", async () => {
      await resendMobileOtp();
      startTimers(`A new OTP was sent to +91 ${mobile}.`);
    });
  }

  function changeNumber() {
    if (inFlight.current) return;
    setStage("mobile");
    setOtp("");
    setError(null);
    setNotice(null);
    setExpiresAt(0);
    setResendAt(0);
  }

  return <div className="space-y-5">
    <div className="space-y-2">
      <Label htmlFor={`${fieldId}-mobile`}>Mobile number</Label>
      <div className="flex">
        <span className="grid h-12 place-items-center rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm font-semibold">+91</span>
        <Input
          id={`${fieldId}-mobile`}
          aria-invalid={Boolean(error && stage === "mobile")}
          autoComplete="tel-national"
          inputMode="numeric"
          maxLength={14}
          value={mobile}
          disabled={stage === "otp" || Boolean(busy)}
          onChange={(event) => onMobileChange(normalizeIndianMobileInput(event.target.value))}
          className="h-12 rounded-l-none text-base"
          placeholder="98765 43210"
        />
      </div>
    </div>

    {stage === "mobile" ? <Button
      type="button"
      aria-busy={busy === "send"}
      disabled={Boolean(busy)}
      onClick={requestOtp}
      className="h-12 w-full rounded-xl bg-blue-700 text-base hover:bg-blue-800"
    >
      {busy === "send" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
      {busy === "send" ? "Sending OTP…" : sendLabel}
    </Button> : <div className="space-y-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-950"><CheckCircle2 className="size-5 text-emerald-600" /> OTP sent</p>
          <p className="mt-1 text-sm text-slate-600">Enter the 4-digit code sent to +91 {mobile}.</p>
        </div>
        <button type="button" disabled={Boolean(busy)} onClick={changeNumber} className="min-h-11 shrink-0 text-sm font-semibold text-blue-700">Change</button>
      </div>

      <div>
        <Label htmlFor={`${fieldId}-otp`}>One-time password</Label>
        <InputOTP
          id={`${fieldId}-otp`}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]*"
          value={otp}
          disabled={Boolean(busy)}
          onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
          onComplete={() => undefined}
          aria-invalid={Boolean(error)}
          containerClassName="mt-2 w-full justify-center gap-0"
        >
          <InputOTPGroup className="gap-2">
            {[0, 1, 2, 3].map((index) => <InputOTPSlot key={index} index={index} className="h-12 w-12 rounded-xl border-2 border-slate-400 bg-white text-lg font-semibold shadow-sm data-[active=true]:border-blue-700 data-[active=true]:ring-blue-200" />)}
          </InputOTPGroup>
        </InputOTP>
        <p className={`mt-2 text-center text-sm font-medium ${expired ? "text-red-700" : "text-slate-600"}`}>
          {expired ? "OTP expired" : `OTP expires in ${formatTime(expirySeconds)}`}
        </p>
      </div>

      <Button
        type="button"
        aria-busy={busy === "verify"}
        disabled={Boolean(busy) || otp.length !== 4 || expired}
        onClick={verifyOtp}
        className="h-12 w-full rounded-xl bg-emerald-600 text-base hover:bg-emerald-700"
      >
        {busy === "verify" && <Loader2 className="animate-spin" />}
        {busy === "verify" ? "Verifying…" : "Verify OTP"}
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={Boolean(busy) || resendSeconds > 0}
        onClick={resendOtp}
        className="h-11 w-full rounded-xl bg-white"
      >
        {busy === "resend" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        {busy === "resend" ? "Sending again…" : resendSeconds > 0 ? `Resend OTP in ${resendSeconds}s` : "Resend OTP"}
      </Button>
    </div>}

    {notice && <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
  </div>;
}
