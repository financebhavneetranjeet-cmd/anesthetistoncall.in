import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/cases/route.ts");
const sender = read("lib/server/case-posted-sms.ts");
const form = read("app/cases/new/new-case-form.tsx");
const retry = read("app/api/admin/deliveries/[id]/retry/route.ts");

for (const marker of ["INSERT OR IGNORE INTO cases", "account_status", "availability_status", "case_notifications_enabled", "available_until", "SMS_PENDING", "waitUntil(sendCasePostedSmsForCase(caseId))"]) {
  if (!route.includes(marker)) throw new Error(`Case posting SMS safeguard missing: ${marker}`);
}
for (const marker of ["MSG91_CASE_POSTED_TEMPLATE_ID", "MSG91_CASE_POSTED_VARIABLES", "status='sending'", "provider_request_id", "maskedMobile", "`91${row.mobile}`"]) {
  if (!sender.includes(marker)) throw new Error(`Case SMS sender safeguard missing: ${marker}`);
}
if (sender.includes("sendOtp(")) throw new Error("Case notifications must not call the login OTP sender.");
if (!form.includes("crypto.randomUUID()") || !form.includes("requestId.current")) throw new Error("Case-post idempotency key is missing.");
if (!retry.includes("sendCasePostedSms(id, true)")) throw new Error("Case SMS retry path is missing.");
console.log("Case save ordering, eligibility, idempotency, MSG91 Flow delivery tracking and retry checks passed.");
