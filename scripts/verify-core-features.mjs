import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const requiredFiles = [
  "app/cases/new/page.tsx",
  "app/cases/new/new-case-form.tsx",
  "app/cases/cases-dashboard.tsx",
  "app/api/cases/route.ts",
  "app/api/cases/[id]/bids/route.ts",
  "app/api/cases/[id]/assign/route.ts",
  "app/api/cases/[id]/accept/route.ts",
  "app/api/cases/[id]/decline/route.ts",
  "app/api/cases/[id]/close/route.ts",
  "app/api/cases/[id]/private/route.ts",
  "app/api/cases/[id]/journey/route.ts",
  "app/api/cases/[id]/payments/route.ts",
  "app/api/payments/route.ts",
  "app/payments/page.tsx",
  "app/cases/[id]/private/journey-panel.tsx",
  "app/availability/page.tsx",
  "app/api/availability/route.ts",
  "app/members/page.tsx",
  "app/api/members/route.ts",
  "app/admin/page.tsx",
  "app/admin/clinicians/page.tsx",
  "app/admin/cases/page.tsx",
  "app/admin/control/page.tsx",
];

const contentChecks = [
  ["app/cases/new/new-case-form.tsx", ["Procedure or surgery", "Hospital or location", "Post open case", "Allow optional fee bids"]],
  ["app/cases/cases-dashboard.tsx", ["I’m Available", "Submit additional bid", "/assign", "Accept assignment", "Cannot attend - reopen case", "Open coordination & OT progress", "Pending Acceptance"]],
  ["app/api/cases/[id]/bids/route.ts", ["proposedFeeRupees", "bidding_enabled", "status = 'available'"]],
  ["app/api/cases/[id]/assign/route.ts", ["status='offered'", "assigned_clinician_user_id", "final_agreed_fee_paise", "fee_locked_at"]],
  ["app/api/cases/[id]/accept/route.ts", ["status='assigned'", "isVerifiedAnaesthetist"]],
  ["app/api/cases/[id]/decline/route.ts", ["reopenAssignment", "isVerifiedAnaesthetist"]],
  ["lib/server/reopen-assignment.ts", ["status='open'", "assigned_clinician_user_id=NULL"]],
  ["app/api/cases/[id]/close/route.ts", ["status='completed'", "isApprovedHospital", "case_journeys"]],
  ["app/api/cases/[id]/private/route.ts", ["acceptedStatus", "clinicianMobile", "hospitalContactMobile"]],
  ["app/api/cases/[id]/journey/route.ts", ["journey_started", "eta_changed", "anaesthetist_arrived", "TOO_FAR"]],
  ["app/cases/[id]/private/journey-panel.tsx", ["Start Journey", "Arrived", "Cancel Journey", "Location permission denied"]],
  ["app/cases/[id]/private/case-progress-panel.tsx", ["Posted fee", "Final agreed fee", "Ready for OT", "Case Started", "Case Completed", "Submit rating"]],
  ["app/api/cases/[id]/progress/route.ts", ["actual_duration_minutes", "INVALID_TRANSITION", "case_completed"]],
  ["app/api/cases/[id]/rating/route.ts", ["ALREADY_RATED", "Rating is available only after case completion"]],
  ["app/api/cases/[id]/payments/route.ts", ["payment_marked", "payment_settled", "partially_paid", "payment_disputed", "idempotencyKey"]],
  ["app/payments/payments-dashboard.tsx", ["Total pending", "Mark Payment Made", "Payment Received", "Raise Dispute"]],
  ["app/availability/availability-panel.tsx", ["Available now", "Available until", "Publish availability"]],
  ["app/api/availability/route.ts", ["availableUntil", "VERIFICATION_REQUIRED", "isVerifiedAnaesthetist"]],
  ["app/members/members-directory.tsx", ["Registered members", "availableUntil"]],
  ["app/api/members/route.ts", ["isVerifiedPlatformUser", "verification_status = 'verified'"]],
  ["app/admin/pending-hospitals.tsx", ["Hospital approvals", "Pending verification"]],
  ["app/admin/clinicians/clinician-approvals.tsx", ["Clinician approvals", "PMC"]],
  ["app/admin/cases/admin-case-list.tsx", ["Case approvals", "/approve"]],
  ["lib/server/session.ts", ["isApprovedHospital", "isVerifiedClinician", "isVerifiedPlatformUser"]],
  ["db/schema.ts", ["bidding_enabled", "available_until", "case_responses", "case_journeys", "journey_locations", "case_audit_events", "case_ratings", "final_agreed_fee_paise", "case_payments", "payment_entries", "payment_audit_events"]],
];

const failures = [];

async function collectTsx(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTsx(path));
    else if (entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    failures.push(`Missing core feature file: ${file}`);
  }
}

for (const [file, markers] of contentChecks) {
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch {
    failures.push(`Unable to inspect core feature file: ${file}`);
    continue;
  }

  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`Missing core feature marker in ${file}: ${marker}`);
  }
}

for (const file of [...await collectTsx("app"), ...await collectTsx("components")]) {
  const source = await readFile(file, "utf8");
  if (/from\s*["']next\/link["']/.test(source)) {
    failures.push(`Unstable framework Link navigation remains in ${file}`);
  }
}

const homeSource = await readFile("components/home/home-page.tsx", "utf8");
for (const route of ["/login", "/register/hospital", "/register/clinician", "/cases", "/availability", "/members"]) {
  if (!homeSource.includes(`href=\"${route}\"`)) failures.push(`Missing home navigation route: ${route}`);
}

if (failures.length) {
  console.error("Core platform preservation check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Core platform preservation check passed.");
