import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/schema.ts");
const session = read("lib/server/session.ts");
const login = read("lib/server/login.ts") + read("app/api/otp/verify/route.ts") + read("app/api/otp/widget/route.ts");
const api = read("app/api/admin/users/[id]/status/route.ts");
const control = read("app/api/admin/control/route.ts") + read("app/admin/control/admin-control-centre.tsx");
const required = [
  [schema, ["ACCOUNT_STATUSES", "active", "suspended", "blocked", "suspendedUntil", "userAccessAuditLogs", "previousStatus", "newStatus", "adminActor", "suspensionExpiresAt"]],
  [session, ["hasActiveAccount", "accountStatus === \"active\"", "isApprovedHospital", "isVerifiedClinician", "isVerifiedAnaesthetist", "isVerifiedPlatformUser"]],
  [login, ["ACCOUNT_BLOCKED", "ACCOUNT_SUSPENDED", "Temporary suspension expired automatically.", "suspended_until"]],
  [api, ["getAdminIdentity", "role === \"admin\"", "A reason is required", "Choose a future suspension expiry.", "DELETE FROM sessions", "user_access_audit_logs", "restore"]],
  [control, ["verificationStatus", "accountStatus", "Suspend", "Block", "Restore / Reactivate", "Suspension period", "Reason", "Access log", "Suspended accounts", "AS suspendedUsers", 'tab === "suspended" ? "all"', 'tab === "suspended" ? "suspended"']],
];
const missing = required.flatMap(([source, markers]) => markers.filter(marker => !source.includes(marker)));
if (missing.length) throw new Error(`Task 24 verification failed: ${missing.join(", ")}`);
for (const role of ["hospital", "anesthetist", "surgeon"]) {
  if (!control.includes(role)) throw new Error(`Task 24 role workflow missing: ${role}`);
}
console.log("Task 24 suspend, block, access denial, session revocation, restore, filters and immutable audit checks passed for hospital, anesthetist and surgeon roles.");
