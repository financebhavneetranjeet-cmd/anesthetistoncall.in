"use client";

import { mobileSchema, otpSchema } from "./otp";

type WidgetConfig = {
  widgetId: string;
  tokenAuth: string;
  exposeMethods: true;
  success: (data: unknown) => void;
  failure: (data: unknown) => void;
};

type ProviderCallback = (data: unknown) => void;

declare global {
  interface Window {
    initSendOTP?: (config: WidgetConfig) => void;
    sendOtp?: (identifier: string, success?: ProviderCallback, failure?: ProviderCallback) => void;
    retryOtp?: (channel: string, success?: ProviderCallback, failure?: ProviderCallback) => void;
    verifyOtp?: (otp: string, success?: ProviderCallback, failure?: ProviderCallback) => void;
  }
}

export type OtpPurpose = "login" | "registration";
export type LoginRole = "hospital" | "anesthetist" | "surgeon";
export type VerifiedMobileResult = {
  ok: true;
  challengeId?: string;
  mobile?: string;
  redirectTo?: "/admin" | "/cases" | "/account/pending" | "/register/choose-role";
  registrationRequired?: boolean;
};

let scriptReady: Promise<void> | undefined;
let widgetReady: Promise<void> | undefined;
let providerOperationActive = false;

function waitForProviderInitialiser(timeoutMs: number) {
  if (window.initSendOTP) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.initSendOTP) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error("OTP_SERVICE_UNAVAILABLE"));
      }
    }, 100);
  });
}

async function loadWidgetScript() {
  if (window.initSendOTP) return;
  if (!scriptReady) {
    scriptReady = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://verify.msg91.com/otp-provider.js"]');
      if (existing) {
        void waitForProviderInitialiser(15_000).then(resolve, reject);
        return;
      }

      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        script.remove();
        reject(new Error("OTP_SERVICE_TIMEOUT"));
      }, 20_000);
      script.src = "https://verify.msg91.com/otp-provider.js";
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timer);
        // MSG91's bootstrap loads a second provider script. Its own load event can
        // fire before that script exposes initSendOTP, so wait for the documented
        // global instead of treating the bootstrap load as provider readiness.
        void waitForProviderInitialiser(15_000).then(resolve, reject);
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        script.remove();
        reject(new Error("OTP_NETWORK_ERROR"));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      scriptReady = undefined;
      throw error;
    });
  }
  await scriptReady;
}

async function waitForExposedMethods() {
  if (window.sendOtp && window.retryOtp && window.verifyOtp) return;
  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.sendOtp && window.retryOtp && window.verifyOtp) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt > 10_000) {
        window.clearInterval(timer);
        reject(new Error("OTP_SERVICE_UNAVAILABLE"));
      }
    }, 100);
  });
}

export async function initialiseOtpWidget() {
  if (!widgetReady) {
    widgetReady = (async () => {
      const configResponse = await fetch("/api/otp/widget", {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const config = (await configResponse.json().catch(() => null)) as {
        widgetId?: string;
        tokenAuth?: string;
        error?: { message?: string };
      } | null;
      if (!configResponse.ok || !config?.widgetId || !config.tokenAuth) {
        throw new Error(config?.error?.message ?? "OTP_NOT_CONFIGURED");
      }

      await loadWidgetScript();
      window.initSendOTP!({
        widgetId: config.widgetId,
        tokenAuth: config.tokenAuth,
        exposeMethods: true,
        success: () => undefined,
        failure: () => undefined,
      });
      await waitForExposedMethods();
    })().catch((error) => {
      widgetReady = undefined;
      throw error;
    });
  }
  await widgetReady;
}

function providerCall(invoke: (success: ProviderCallback, failure: ProviderCallback) => void) {
  if (providerOperationActive) return Promise.reject(new Error("OTP_REQUEST_IN_PROGRESS"));
  providerOperationActive = true;
  return new Promise<unknown>((resolve, reject) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      providerOperationActive = false;
      reject(new Error("OTP_SERVICE_TIMEOUT"));
    }, 30_000);
    const finish = (data: unknown, failed: boolean) => {
      if (finished) return;
      finished = true;
      providerOperationActive = false;
      window.clearTimeout(timer);
      if (failed || providerReportedFailure(data)) reject(data);
      else resolve(data);
    };
    try {
      invoke((data) => finish(data, false), (data) => finish(data, true));
    } catch (error) {
      finish(error, true);
    }
  });
}

function providerReportedFailure(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const result = data as Record<string, unknown>;
  return result.type === "error" || result.type === "failure" ||
    result.status === "error" || result.status === "failed" || result.success === false;
}

export async function sendMobileOtp(mobile: string) {
  const parsed = mobileSchema.safeParse(mobile);
  if (!parsed.success) throw new Error("INVALID_MOBILE");
  if (!window.sendOtp) throw new Error("OTP_SERVICE_UNAVAILABLE");
  await providerCall((success, failure) => window.sendOtp!(`91${parsed.data}`, success, failure));
}

export async function resendMobileOtp() {
  if (!window.retryOtp) throw new Error("OTP_SERVICE_UNAVAILABLE");
  // MSG91's custom widget requires the SMS channel code on every retry.
  await providerCall((success, failure) => window.retryOtp!("11", success, failure));
}

function accessToken(data: unknown): string {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const value = typeof data === "string"
    ? data
    : record?.["access-token"] ?? record?.accessToken ?? record?.token ?? record?.message;
  if (typeof value !== "string" || value.length > 12_000 || value.split(".").length !== 3) {
    throw new Error("OTP_VERIFICATION_INCOMPLETE");
  }
  return value;
}

export async function verifyMobileOtp(otp: string) {
  const parsed = otpSchema.safeParse(otp);
  if (!parsed.success) throw new Error("INVALID_OTP_FORMAT");
  if (!window.verifyOtp) throw new Error("OTP_SERVICE_UNAVAILABLE");
  return accessToken(await providerCall((success, failure) => window.verifyOtp!(parsed.data, success, failure)));
}

export async function exchangeVerifiedMobile(mobile: string, purpose: OtpPurpose, accessToken: string, role?: LoginRole) {
  const response = await fetch("/api/otp/widget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile, purpose, accessToken, role }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json().catch(() => null)) as (VerifiedMobileResult & {
    error?: { message?: string; code?: string };
  }) | null;
  if (!response.ok || !result?.ok) {
    const error = new Error(result?.error?.message ?? "Mobile verification failed. Please retry.");
    error.name = result?.error?.code ?? "OTP_VERIFY_FAILED";
    throw error;
  }
  return result;
}

function providerText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [record.type, record.code, record.message, record.error, record.description]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
  }
  return "";
}

export function friendlyOtpError(error: unknown, phase: "send" | "verify" | "resend") {
  const detail = providerText(error);
  if (detail.includes("invalid_mobile") || detail.includes("invalid mobile")) return "Enter a valid 10-digit Indian mobile number.";
  if (detail.includes("invalid_otp_format")) return "Enter the complete 4-digit OTP.";
  if (detail.includes("expired")) return "This OTP has expired. Tap Resend OTP for a new code.";
  if (detail.includes("incorrect") || detail.includes("invalid otp") || detail.includes("not match") || detail.includes("mismatch")) return "Incorrect OTP. Check the code and try again.";
  if (detail.includes("captcha")) return "Complete the security check, then try again.";
  if (detail.includes("rate") || detail.includes("limit") || detail.includes("too many")) return "Too many attempts. Please wait before trying again.";
  if (detail.includes("already") && detail.includes("used")) return "This verification has already been used. Request a new OTP.";
  if (detail.includes("not configured") || detail.includes("being configured")) return "Mobile verification is being configured. Please try again later.";
  if (detail.includes("timeout") || detail.includes("network") || detail.includes("failed to fetch")) return "The OTP service could not be reached. Check your connection and retry.";
  if (error instanceof Error && error.message && !error.message.startsWith("OTP_")) return error.message;
  if (phase === "verify") return "OTP verification failed. Check the code or request a new OTP.";
  if (phase === "resend") return "A new OTP could not be sent. Please retry.";
  return "OTP could not be sent. Please retry.";
}
