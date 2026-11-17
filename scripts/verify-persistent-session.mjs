// Executes the real authentication/registration handlers against an isolated SQLite
// database with the actual migrations. Only cookies and external delivery are mocked.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";

const sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
const cookies = new Map();
const jobs = [];
const mail = [];
let failDelivery = false;
const env = { EMAIL_AUTH_SECRET: "isolated-test-secret-only-32-characters", EMAIL_FROM: "test@example.invalid", RESEND_API_KEY: "test-only", MSG91_AUTH_KEY: "test-only", ADMIN_MOBILES: "9876543210" };
env.DB = {
  prepare(sql) {
    let values = [];
    const query = {
      bind(...args) { values = args; return query; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      run() { return { meta: { changes: sqlite.prepare(sql).run(...values).changes } }; },
    };
    return query;
  },
  async batch(queries) { sqlite.exec("BEGIN"); try { const result = []; for (const query of queries) result.push(query.run()); sqlite.exec("COMMIT"); return result; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } },
};
globalThis.__emailTest = { env, jobs, jar: { get: key => cookies.has(key) ? { value: cookies.get(key) } : undefined, set: (key, value, options) => { assert.equal(options.httpOnly, true); assert.equal(options.secure, true); cookies.set(key, value); }, delete: key => cookies.delete(key) } };
const bundle = await build({
  stdin: { contents: `export * from './lib/server/session'; export {POST as hospital} from './app/api/hospitals/register/route'; export {POST as clinician} from './app/api/clinicians/register/route'; export {POST as mobileLogin} from './app/api/otp/widget/route'; export {POST as refresh, DELETE as logout} from './app/api/account/session/route'; export * from './lib/server/login';
    export {POST as adminStatus} from './app/api/admin/users/[id]/status/route';
    export {POST as approveClinician} from './app/api/admin/clinicians/[id]/approve/route';
    export {POST as approveHospital} from './app/api/admin/hospitals/[id]/approve/route';
    export {GET as pendingClinicians} from './app/api/admin/clinicians/route';
    export {GET as pendingHospitals} from './app/api/admin/hospitals/route';
    export {POST as uploadDocument} from './app/api/clinicians/documents/route';
    export {GET as hospitalDocuments} from './app/api/admin/hospitals/[id]/documents/route';
    export {GET as cases} from './app/api/cases/route';
    `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "isolated-platform", setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|next\/headers|next\/server)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({ filter: /app\/chatgpt-auth$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({ filter: /lib\/server\/(web-push|google-places)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "cloudflare:workers" ? "export const env=globalThis.__emailTest.env; export const waitUntil=p=>globalThis.__emailTest.jobs.push(p);" : args.path === "next/headers" ? "export const cookies=async()=>globalThis.__emailTest.jar;" : args.path === "next/server" ? "export const NextResponse={json:(data,init)=>Response.json(data,init)};" : args.path.endsWith("chatgpt-auth") ? "export const getChatGPTUser=async()=>null;" : args.path.endsWith("web-push") ? "export const notifyAdminsOfRegistration=async()=>{}; export const sendWebPush=async()=>{}; export const sendWebPushForCase=async()=>{};" : "export class GooglePlacesError extends Error {} export const getVerifiedHospitalPlace=async()=>{throw new Error('Unexpected external Maps call')};" }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
let verifiedMobile = "9000000001";
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (url === "https://api.resend.com/emails") {
    if (failDelivery) return new Response("", { status: 503 });
    mail.push({ email: body.to[0], code: body.text.match(/code is (\d{6})/)[1] });
    return Response.json({ id: "mock-delivery" });
  }
  if (url === "https://control.msg91.com/api/v5/widget/verifyAccessToken") return Response.json({ type: "success", identifier: `91${verifiedMobile}` });
  throw new Error("Unexpected external call");
};
let count = 0;
async function test(name, fn) { await fn(); console.log(`PASS ${++count}: ${name}`); }
const request = (method = "POST", origin = "https://anesthetistoncall.in") => new Request("https://anesthetistoncall.in/api/account/session", { method, headers: { origin } });
const token = () => cookies.get("aoc_session");
function seed(id, role, mobile, status = "verified") {
  sqlite.prepare("INSERT INTO users(id,mobile,full_name,role,status,account_status) VALUES(?,?,?,?,?,'active')").run(id, mobile, id, role, status);
  if (role === "hospital") sqlite.prepare("INSERT INTO hospitals(id,owner_user_id,name,address,city,approval_status) VALUES(?,?,?,'Amritsar','Amritsar','approved')").run(`h-${id}`, id, id);
  if (["anesthetist", "surgeon"].includes(role)) sqlite.prepare("INSERT INTO clinician_profiles(id,user_id,state_council,registration_number,qualification,city,verification_status) VALUES(?,?,'PMC',?,'MD','Amritsar','verified')").run(`cp-${id}`, id, id);
}
seed("hospital", "hospital", "9000000001", "pending");
seed("doctor", "anesthetist", "9000000002");
seed("surgeon", "surgeon", "9000000003");
seed("admin", "admin", "9876543210");

await test("verified Mobile OTP creates session; replay and mismatched mobile are rejected", async () => {
  const login = mobile => new Request("https://anesthetistoncall.in/api/otp/widget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mobile, purpose: "login", role: "hospital", accessToken: "header.payload.signature-long-enough" }) });
  assert.equal((await api.mobileLogin(login("9000000009"))).status, 401);
  const response = await api.mobileLogin(login("9000000001"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirectTo, "/account/pending");
  assert.equal((await api.mobileLogin(login("9000000001"))).status, 409);
  assert.ok(token());
  const row = sqlite.prepare("SELECT token_hash, expires_at FROM sessions").get();
  assert.match(row.token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(row.token_hash, token());
  assert.ok(Date.parse(row.expires_at) > Date.now() + 29 * 86400000);
});
await test("approval takes effect on the same session, including hospital approval gate", async () => {
  const before = token();
  sqlite.exec("UPDATE hospitals SET approval_status='pending'; UPDATE users SET status='verified' WHERE id='hospital'");
  assert.equal((await (await api.refresh(request())).json()).redirectTo, "/account/pending");
  sqlite.exec("UPDATE hospitals SET approval_status='approved'");
  assert.equal((await (await api.refresh(request())).json()).redirectTo, "/cases");
  assert.equal(token(), before);
});
await test("browser reopen uses persisted cookie; separate browser without cookie cannot authenticate", async () => {
  const saved = token(); cookies.clear();
  assert.equal(await api.getSessionUser(), null);
  assert.equal((await api.refresh(request())).status, 401);
  cookies.set("aoc_session", saved);
  assert.equal((await api.getSessionUser()).id, "hospital");
});
await test("rolling renewal upgrades existing 14-day session, bounded by absolute expiry", async () => {
  sqlite.exec("UPDATE sessions SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+14 days')");
  const response = await api.refresh(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.ok(Date.parse(sqlite.prepare("SELECT expires_at FROM sessions").get().expires_at) > Date.now() + 29 * 86400000);
  sqlite.exec("UPDATE sessions SET created_at=datetime('now','-175 days'), expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day')");
  assert.equal((await api.refresh(request())).status, 200);
  assert.ok(Date.parse(sqlite.prepare("SELECT expires_at FROM sessions").get().expires_at) <= Date.now() + 5 * 86400000);
});
await test("legacy 365-day sessions are capped to the new idle policy", async () => {
  sqlite.exec("UPDATE sessions SET created_at=CURRENT_TIMESTAMP, expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+365 days')");
  assert.equal((await api.refresh(request())).status, 200);
  assert.ok(Date.parse(sqlite.prepare("SELECT expires_at FROM sessions").get().expires_at) <= Date.now() + 30 * 86400000);
});
await test("expired sessions and absolute lifetime cannot renew", async () => {
  sqlite.exec("UPDATE sessions SET created_at=datetime('now','-181 days'), expires_at=datetime('now','+1 day')");
  assert.equal(await api.getSessionUser(), null);
  assert.equal((await api.refresh(request())).status, 401);
  await api.createSession("hospital");
  sqlite.exec("UPDATE sessions SET expires_at=datetime('now','-1 second')");
  assert.equal(await api.getSessionUser(), null);
  assert.equal((await api.refresh(request())).status, 401);
});
await test("blocked and suspended users immediately lose access and renewal", async () => {
  for (const status of ["blocked", "suspended"]) {
    sqlite.exec("UPDATE users SET account_status='active' WHERE id='hospital'");
    await api.createSession("hospital");
    sqlite.prepare("UPDATE users SET account_status=? WHERE id='hospital'").run(status);
    assert.equal(await api.getSessionUser(), null);
    assert.equal((await api.refresh(request())).status, 401);
  }
  sqlite.exec("UPDATE users SET account_status='active' WHERE id='hospital'");
});
await test("CSRF rejection, logout revocation, and stale-cookie replay", async () => {
  await api.createSession("hospital");
  const saved = token();
  assert.equal((await api.refresh(request("POST", "https://other.invalid"))).status, 403);
  assert.equal((await api.logout(request("DELETE", "https://other.invalid"))).status, 403);
  assert.equal(token(), saved);
  assert.equal((await api.logout(request("DELETE"))).status, 200);
  assert.equal(token(), undefined);
  cookies.set("aoc_session", saved);
  assert.equal(await api.getSessionUser(), null);
  assert.equal((await api.refresh(request())).status, 401);
});
await test("roles route to their dashboards and clinician verification remains mandatory", async () => {
  for (const id of ["hospital", "doctor", "surgeon", "admin"]) {
    await api.createSession(id);
    assert.equal((await (await api.refresh(request())).json()).redirectTo, id === "admin" ? "/admin" : "/cases");
    if (id === "doctor" || id === "surgeon") {
      sqlite.prepare("UPDATE clinician_profiles SET verification_status='pending' WHERE user_id=?").run(id);
      assert.equal((await (await api.refresh(request())).json()).redirectTo, "/account/pending");
    }
  }
});
await test("new login replaces this browser's old session and database revocation cannot be undone", async () => {
  const old = token();
  await api.createSession("hospital");
  const current = token();
  cookies.set("aoc_session", old);
  assert.equal(await api.getSessionUser(), null);
  cookies.set("aoc_session", current);
  sqlite.exec("DELETE FROM sessions WHERE user_id='hospital'");
  assert.equal((await api.refresh(request())).status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id='hospital'").get().n, 0);
});
const files = new Map();
env.BUCKET = {
  async put(key, stream) { files.set(key, await new Response(stream).arrayBuffer()); },
  async delete(key) { files.delete(key); },
  async get(key) { return files.has(key) ? { body: files.get(key) } : null; },
};
const post = (body, path = "/") => new Request(`https://anesthetistoncall.in${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const context = id => ({ params: Promise.resolve({ id }) });
const asAdmin = async () => api.createSession("admin");
const decision = (id, action, reason = "Documented account review") => api.adminStatus(post({ action, reason }), context(id));
function otpExchange(mobile, iat, purpose = "registration", role) {
  const claims = Buffer.from(JSON.stringify({ iat, sub: `91${mobile}`, jti: crypto.randomUUID() })).toString("base64url");
  return api.mobileLogin(post({ mobile, purpose, role, accessToken: `mock.${claims}.provider-signature` }));
}
function submit(role, mobile, challengeId, medicalNumber) {
  const details = { challengeId, fullName: "Fresh Applicant", mobile, email: "fresh@example.invalid", city: "Amritsar" };
  return role === "hospital"
    ? api.hospital(post({ ...details, hospitalName: "Fresh Hospital", address: "Amritsar, Punjab",
      googlePlaceId: "pin-isolated", googleMapsUri: "https://maps.example.invalid/facility", latitude: 31.63, longitude: 74.87 }))
    : api.clinician(post({ ...details, role, stateCouncil: "PMC", registrationNumber: medicalNumber, qualification: "MD" }));
}

for (const [index, role] of ["hospital", "anesthetist", "surgeon", "hospital", "anesthetist", "surgeon"].entries()) {
  const adminDeleted = index < 3;
  await test(`${role}: ${adminDeleted ? "deleted" : "blocked"} account, fresh documents, Admin approval and role access`, async () => {
    const oldId = `former-${role}-${index}`;
    const mobile = `900000001${index}`;
    verifiedMobile = mobile;
    seed(oldId, role, mobile);
    if (role !== "hospital") {
      sqlite.prepare("UPDATE clinician_profiles SET availability_status='available',available_until=datetime('now','+1 hour') WHERE user_id=?").run(oldId);
    }
    const hospitalId = role === "hospital" ? `h-${oldId}` : "h-hospital";
    sqlite.prepare("INSERT INTO cases(id,hospital_id,procedure_name,anaesthesia_type,scheduled_at,offered_fee_paise,status,posted_by_user_id) VALUES(?,?,'Historical case','General',CURRENT_TIMESTAMP,100,'completed',?)").run(oldId, hospitalId, oldId);
    sqlite.prepare("INSERT INTO case_payments(id,case_id,payer_user_id,payee_user_id,total_amount_paise) VALUES(?,?,?,?,100)").run(oldId, oldId, role === "hospital" ? oldId : "hospital", role === "hospital" ? "doctor" : oldId);
    sqlite.prepare("INSERT INTO verification_documents(id,user_id,object_key,file_name,content_type,size_bytes,document_type) VALUES(?,?,?,'old.pdf','application/pdf',10,?)").run(oldId, oldId, oldId, role === "hospital" ? "facility_registration" : "pmc_certificate");
    sqlite.prepare("INSERT INTO google_identities(subject,mobile,email,linked_by_user_id) VALUES(?,?,?,?)").run(oldId, mobile, `${oldId}@example.invalid`, oldId);
    sqlite.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth) VALUES(?,?,?,?,?)").run(oldId,oldId,`https://push.invalid/${oldId}`,"key","auth");
    await api.createSession(oldId);
    const oldCookie = token();
    assert.equal((await decision(oldId, "block")).status, 403);
    await asAdmin();
    assert.equal((await decision(oldId, "block", "Previous blocking reason")).status, 200);
    if (adminDeleted) {
      assert.equal((await decision(oldId, "delete")).status, 200);
      assert.equal((await decision(oldId, "restore")).status, 409);
    }
    assert.equal(sqlite.prepare("SELECT posted_by_user_id FROM cases WHERE id=?").get(oldId).posted_by_user_id, oldId);
    assert.equal(sqlite.prepare("SELECT case_id FROM case_payments WHERE id=?").get(oldId).case_id, oldId);
    assert.equal(sqlite.prepare("SELECT user_id FROM verification_documents WHERE id=?").get(oldId).user_id, oldId);
    assert.equal(sqlite.prepare("SELECT 1 FROM push_subscriptions WHERE user_id=?").get(oldId), undefined);
    cookies.set("aoc_session", oldCookie);
    assert.equal(await api.getSessionUser(), null);
    assert.equal((await otpExchange(mobile, Date.now() / 1000 - 20)).status, 409);
    const proved = await otpExchange(mobile, Date.now() / 1000 + 1, "login", role);
    assert.equal(proved.status, 200);
    assert.equal(await api.getSessionUser(), null);
    const { challengeId: challenge, redirectTo } = await proved.json();
    assert.equal(redirectTo, "/register/choose-role");
    if (!adminDeleted) assert.equal(sqlite.prepare("SELECT mobile FROM users WHERE id=?").get(oldId).mobile, mobile);
    const [attempt1, attempt2] = await Promise.all([submit(role, mobile, challenge, oldId), submit(role, mobile, challenge, oldId)]);
    assert.deepEqual([attempt1.status, attempt2.status].sort(), [201, 409]);
    const result = await (attempt1.status === 201 ? attempt1 : attempt2).json();
    const profileId = (result.registration ?? result.clinician).id;
    assert.equal(sqlite.prepare("SELECT 1 FROM google_identities WHERE mobile=?").get(mobile), undefined);
    const pending = await api.getSessionUser();
    assert.notEqual(pending.id, oldId);
    assert.equal(pending.role, role);
    assert.equal(api.isVerifiedPlatformUser(pending), false);
    if (role !== "hospital") assert.equal(sqlite.prepare("SELECT availability_status FROM clinician_profiles WHERE id=?").get(profileId).availability_status, "unavailable");
    assert.equal((await (await api.refresh(request())).json()).redirectTo, "/account/pending");
    assert.equal((await api.cases()).status, 403);
    assert.equal((await api.hospitalDocuments(new Request("https://anesthetistoncall.in/"), context(profileId))).status, 403);
    const approve = () => (role === "hospital" ? api.approveHospital : api.approveClinician)(post({ mode: "verified" }), context(profileId));
    await asAdmin();
    const queue = await (await (role === "hospital" ? api.pendingHospitals : api.pendingClinicians)()).json();
    const item = (queue.hospitals ?? queue.clinicians).find(x => x.id === profileId);
    assert.equal(item.userId, pending.id);
    assert.equal(item.blockingReason, "Previous blocking reason");
    assert.equal(item.reregistered, 1);
    assert.equal(item.previouslyBlocked, adminDeleted ? 0 : 1);
    assert.equal((await approve()).status, 409);
    await api.createSession(pending.id);
    const form = new FormData();
    form.set("documentType", role === "hospital" ? "facility_registration" : "pmc_certificate");
    form.set("file", new File(["%PDF-1.7 fixture"], "new.pdf", { type: "application/pdf" }));
    const upload = await api.uploadDocument(new Request("https://anesthetistoncall.in/", { method: "POST", body: form }));
    assert.equal(upload.status, 201);
    const { document } = await upload.json();
    await asAdmin();
    if (role === "hospital") {
      const review = await api.hospitalDocuments(new Request(`https://anesthetistoncall.in/?documentId=${document.id}`), context(profileId));
      assert.equal(review.status, 200);
      assert.equal(review.headers.get("Cache-Control"), "private, no-store");
    }
    assert.equal((await approve()).status, 200);
    await api.createSession(pending.id);
    const approved = await api.getSessionUser();
    assert.equal(api.isVerifiedPlatformUser(approved), true);
    assert.equal(api.isApprovedHospital(approved), role === "hospital");
    assert.equal(api.isVerifiedAnaesthetist(approved), role === "anesthetist");
    const caseList = await api.cases();
    assert.equal(caseList.status, 200);
    assert.equal((await caseList.json()).cases.some(item => item.id === oldId), false);
    assert.equal((await (await api.refresh(request())).json()).redirectTo, "/cases");
    const prohibited = await otpExchange(mobile, Date.now() / 1000 + 1, "login", role === "hospital" ? "surgeon" : "hospital");
    assert.equal(prohibited.status, 409);
  });
}
await test("a number ban survives deletion, rejects OTP and requires Admin clearance", async () => {
  const mobile = "9000000020";
  verifiedMobile = mobile;
  seed("banned", "hospital", mobile);
  await asAdmin();
  assert.equal((await decision("banned", "block")).status, 200);
  assert.equal((await decision("banned", "ban")).status, 200);
  assert.equal((await otpExchange(mobile, Date.now() / 1000 + 1, "login", "hospital")).status, 403);
  assert.equal((await decision("banned", "delete")).status, 200);
  assert.equal((await otpExchange(mobile, Date.now() / 1000 + 1)).status, 403);
  assert.equal(await api.findLoginUser(mobile, "hospital"), null);
  assert.equal((await decision("banned", "clear-ban")).status, 200);
  assert.equal((await decision("banned", "restore")).status, 409);
  assert.equal((await otpExchange(mobile, Date.now() / 1000 - 20)).status, 409);
  const otp = await otpExchange(mobile, Date.now() / 1000 + 1);
  assert.equal(otp.status, 200);
  assert.equal((await submit("hospital", mobile, (await otp.json()).challengeId)).status, 201);
  const fresh = await api.getSessionUser();
  await asAdmin();
  assert.equal((await decision(fresh.id, "reject")).status, 200);
  assert.equal((await decision(fresh.id, "restore")).status, 409);
  assert.equal((await (await api.pendingHospitals()).json()).hospitals.some(item => item.userId === fresh.id), false);
});
console.log(`${count} persistent-session integration groups passed (isolated SQLite; SMS provider and cookie store mocked).`);
sqlite.close();
