import { z } from "zod";

export const mobileSchema = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
export const otpSchema = z.string().regex(/^\d{4}$/, "Enter the 4-digit OTP");

export function normalizeIndianMobileInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(2, 12);
  return digits.slice(0, 10);
}
export type OtpPurpose = "login" | "registration" | "mobile_verification";
export interface OtpProvider {
  send(mobile: string, purpose: OtpPurpose): Promise<{ requestId: string }>;
  verify(requestId: string, otp: string): Promise<{ verified: boolean }>;
}
// MSG91 is connected in Sprint 1, Task 2. This boundary keeps vendor code isolated.
