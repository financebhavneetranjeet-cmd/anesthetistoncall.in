import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loginOtp = read("lib/server/msg91.ts");
const approvalSms = read("lib/server/hospital-approval-sms.ts");
const approvalRoute = read("app/api/admin/hospitals/[id]/approve/route.ts");
const notificationsRoute = read("app/api/notifications/route.ts");
const notificationBell = read("components/notifications/notification-bell.tsx");

for (const marker of ["/api/v5/otp", "MSG91_TEMPLATE_ID", "sendOtp"]) {
  if (!loginOtp.includes(marker)) throw new Error(`Login OTP integration marker missing: ${marker}`);
}

for (const marker of [
  "/api/v5/flow/",
  "MSG91_HOSPITAL_APPROVAL_TEMPLATE_ID",
  "hospital_approved",
  "SMS_PENDING",
  "status='sending'",
  "https://anesthetistoncall.in/login",
  "console.error",
  "maskedMobile",
]) {
  if (!approvalSms.includes(marker)) throw new Error(`Approval SMS integration marker missing: ${marker}`);
}

if (approvalSms.includes("sendOtp(")) throw new Error("Approval notifications must not call the login OTP sender.");
for (const marker of [
  "Your hospital account has been approved. You can now post cases.",
  "INSERT OR IGNORE INTO notifications",
  "hospital-approved:${hospitalId}",
]) {
  if (!approvalSms.includes(marker)) throw new Error(`Approval in-app notification marker missing: ${marker}`);
}
if (notificationsRoute.includes("z.string().uuid()")) throw new Error("Notification read API must accept stable non-UUID approval notification ids.");
if (!notificationBell.includes("{n.body}")) throw new Error("Bell dropdown must display approval notification body text.");
const savePosition = approvalRoute.indexOf("env.DB.batch");
const sendPosition = approvalRoute.indexOf("sendHospitalApprovalSms(");
if (savePosition < 0 || sendPosition < savePosition) {
  throw new Error("Approval SMS must run only after the approval database batch succeeds.");
}

console.log("Approval save ordering, separate MSG91 Flow sender, duplicate claim, masked logging and OTP isolation checks passed.");
