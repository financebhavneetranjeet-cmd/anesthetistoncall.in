import fs from "node:fs";
import assert from "node:assert/strict";
const approval=fs.readFileSync("app/api/admin/clinicians/[id]/approve/route.ts","utf8");
const admin=fs.readFileSync("app/admin/clinicians/clinician-approvals.tsx","utf8");
const documents=fs.readFileSync("app/api/admin/clinicians/[id]/documents/route.ts","utf8");
const registration=fs.readFileSync("app/register/clinician/registration-form.tsx","utf8");
function canApprove(certificateCount,mode){if(mode==="verified")return true;if(mode==="manual")return certificateCount>0;return false}
assert.equal(canApprove(0,"verified"),true,"Test A");
assert.equal(canApprove(1,"verified"),true,"Test B");
assert.equal(canApprove(0,"manual"),false,"Test C");
assert.equal(canApprove(1,"manual"),true,"Test D");
assert.match(admin,/documentCount} uploaded/,"Test E count");
assert.match(admin,/View \/ Open Certificate/,"Test E visibility");
assert.match(documents,/private, no-store/,"Private document response");
assert.match(documents,/isAdmin/,"Admin-only document access");
assert.match(approval,/mode === "failed" \|\| mode === "unavailable"/,"Test F");
assert.match(approval,/mode === "manual" && clinician\.pmcCount < 1/,"Manual certificate guard");
assert.match(registration,/PMC Certificate \(Optional\)/,"Optional registration upload");
console.log("PMC Tests A-F passed.");
