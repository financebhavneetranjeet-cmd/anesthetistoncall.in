import fs from "node:fs";
import assert from "node:assert/strict";

const approval = fs.readFileSync("app/api/admin/clinicians/[id]/approve/route.ts", "utf8");
const admin = fs.readFileSync("app/admin/clinicians/clinician-approvals.tsx", "utf8");
const documents = fs.readFileSync("app/api/admin/clinicians/[id]/documents/route.ts", "utf8");
const registration = fs.readFileSync("app/register/clinician/registration-form.tsx", "utf8");

// Guard regression coverage: verification review must not itself approve.
assert.match(approval, /mode !== "approve"/, "Separate verification from final approval");
assert.match(approval, /"EVIDENCE_REQUIRED"/, "Review evidence required");
assert.match(approval, /"VERIFICATION_REQUIRED"/, "Pending, mismatched or unavailable doctors cannot be approved");
assert.match(approval, /\["success", "manual"\]\.includes\(clinician\.pmcVerificationStatus\)/, "Final approval must require completed review");
assert.match(approval, /clinician\.pmcVerificationStatus === "manual" && clinician\.pmcCount < 1/, "Manual approval must retain a certificate");
assert.match(approval, /mode === "manual" && clinician\.pmcCount < 1/, "Manual review requires certificate");
assert.match(approval, /await isAdmin\(\)/, "Only Admin can review or approve");
assert.match(approval, /clinician_verification_reviewed/, "Audit review outcome");
assert.match(approval, /clinician_approved/, "Audit final approval");

assert.match(admin, /Verify with NMC \/ PMC/, "Official search link visible");
assert.match(admin, /Record NMC match/, "Manual record review action visible");
assert.match(admin, /Final Admin Approval/, "Separate approval action visible");
assert.match(admin, /documentCount} uploaded/, "Uploaded document count visible");
assert.match(admin, /View \/ Open Certificate/, "Certificate view available");
assert.match(documents, /private, no-store/, "Private document response");
assert.match(documents, /isAdmin/, "Admin-only certificate access");
assert.match(registration, /Verify with NMC \/ PMC/, "Registration search link visible");

// The public search link alone does not constitute automated verification.
assert.doesNotMatch(registration, /automatically verified by NMC/i, "Do not falsely advertise automatic lookup");
console.log("PMC review gate static regression checks passed; integration/E2E tests still required.");
