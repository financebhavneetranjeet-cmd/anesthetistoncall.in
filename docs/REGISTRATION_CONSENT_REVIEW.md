# Registration consent implementation — review draft

Status: **NOT DEPLOYED / NOT WIRED INTO REGISTRATION**. This branch was created from GitHub main, which may lag behind the current ChatGPT Sites production build. Do not merge or deploy without reconciling to the latest Sites export, legal review and testing. Issue #5.

## Existing entry points inspected (main branch snapshot)
- `app/register/clinician/registration-form.tsx` calls `/api/clinicians/register` for anaesthetist and surgeon.
- `app/register/hospital/registration-form.tsx` calls `/api/hospitals/register` for hospital and diagnostic centre.
- Both API handlers validate OTP and create pending users; hospital handler has a separate existing-user return path.
- Neither API stores versioned consent in inspected snapshot.

## Added review-only component
`components/registration/registration-consent-fields.tsx` supplies controlled role-specific consent UI. It is not currently imported by either form. It intentionally does not claim Aadhaar eSign exists.

## Required before activating
1. **Legal copy**: publish real, legally reviewed and versioned Terms, Privacy Notice and Doctor/Hospital Agreement at the links (current URLs are placeholders); have counsel assess enforceability, data handling, liability and state-specific stamp duty.
2. **Reconcile**: compare latest production Sites version to stale GitHub main, especially registration/signup routes, role names, schemas and admin approval flows.
3. **Server enforcement**: extend both registration request schemas with explicit consent booleans and accepted agreement version; validate true required flags **server-side** (a checkbox alone is insufficient). Protect against forged versions.
4. **Audit storage**: append-only consent log associated with saved user ID, role, exact policy versions/hashes, timestamps, limited request metadata and evidence; create safe forward-only migration after reviewing existing D1 schema. Ensure atomic registration + audit or robust rollback.
5. **Hospital authority**: capture representative's name/title and evidence of authority; review access to such documents. Consider whether existing hospital users signing updated agreements need a separate flow.
6. **Signing**: checkbox/OTP is not Aadhaar eSign. Do not offer Aadhaar eSign without an authorised provider, compliant consent and alternative signing. Only store signed document and verification evidence if actual signing occurred; do not store full Aadhaar number or OTP.
7. **Privacy/security**: rate-limit endpoints, protect certificates and signed agreements, plan retention, deletion, restricted access, notice and incident response.
8. **Tests**: unaccepted/altered consent rejected by API, role-specific versions and audit, approvals stay pending, duplicate account flows, OTP expiry, back button/mobile; no regression of users or data. Inspect and test staging before publication.

## Fee model
Platform initially free. Doctors are paid directly by hospitals; no case commission. Future small optional subscription via UPI only after advance notice and explicit agreement; no automatic charges.

## Release gate
No production deploy or DB modification from this branch until owner approves reconciled release and legal review is completed.
