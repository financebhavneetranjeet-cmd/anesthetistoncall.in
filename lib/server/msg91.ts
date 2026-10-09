import { env } from "cloudflare:workers";

export function isMsg91Configured(): boolean { return Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID); }

export async function sendOtp(mobile: string): Promise<{ requestId: string }> {
  if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) throw new Error("MSG91_NOT_CONFIGURED");
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", env.MSG91_TEMPLATE_ID);
  url.searchParams.set("mobile", `91${mobile}`);
  const response = await fetch(url, { method: "POST", headers: { authkey: env.MSG91_AUTH_KEY, "Content-Type": "application/json" } });
  const data = await response.json() as { request_id?: string; type?: string; message?: string };
  if (!response.ok || data.type === "error" || !data.request_id) throw new Error(data.message ?? "Unable to send OTP");
  return { requestId: data.request_id };
}

export async function verifyOtp(mobile: string, otp: string): Promise<boolean> {
  if (!env.MSG91_AUTH_KEY) throw new Error("MSG91_NOT_CONFIGURED");
  const url = new URL("https://control.msg91.com/api/v5/otp/verify");
  url.searchParams.set("mobile", `91${mobile}`);
  url.searchParams.set("otp", otp);
  const response = await fetch(url, { method: "GET", headers: { authkey: env.MSG91_AUTH_KEY } });
  const data = await response.json() as { type?: string };
  return response.ok && data.type === "success";
}
