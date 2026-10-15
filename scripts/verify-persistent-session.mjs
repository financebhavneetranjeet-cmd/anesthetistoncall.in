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
      async run() { return { meta: { changes: sqlite.prepare(sql).run(...values).changes } }; },
    };
    return query;
  },
  async batch(queries) { sqlite.exec("BEGIN"); try { const result = []; for (const query of queries) result.push(await query.run()); sqlite.exec("COMMIT"); return result; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } },
};
globalThis.__emailTest = { env, jobs, jar: { get: key => cookies.has(key) ? { value: cookies.get(key) } : undefined, set: (key, value, options) => { assert.equal(options.httpOnly, true); assert.equal(options.secure, true); cookies.set(key, value); }, delete: key => cookies.delete(key) } };
const bundle = await build({
  stdin: { contents: `export * from './lib/server/session'; export {POST as hospital} from './app/api/hospitals/register/route'; export {POST as clinician} from './app/api/clinicians/register/route'; export {POST as mobileLogin} from './app/api/otp/widget/route'; export {POST as refresh, DELETE as logout} from './app/api/account/session/route'; export * from './lib/server/login';`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "isolated-platform", setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|next\/headers|next\/server)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({ filter: /lib\/server\/(web-push|google-places)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "cloudflare:workers" ? "export const env=globalThis.__emailTest.env; export const waitUntil=p=>globalThis.__emailTest.jobs.push(p);" : args.path === "next/headers" ? "export const cookies=async()=>globalThis.__emailTest.jar;" : args.path === "next/server" ? "export const NextResponse={json:(data,init)=>Response.json(data,init)};" : args.path.endsWith("web-push") ? "export const notifyAdminsOfRegistration=async()=>{};" : "export class GooglePlacesError extends Error {} export const getVerifiedHospitalPlace=async()=>{throw new Error('Unexpected external Maps call')};" }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (url === "https://api.resend.com/emails") {
    if (failDelivery) return new Response("", { status: 503 });
    mail.push({ email: body.to[0], code: body.text.match(/code is (\d{6})/)[1] });
    return Response.json({ id: "mock-delivery" });
  }
  if (url === "https://control.msg91.com/api/v5/widget/verifyAccessToken") return Response.json({ type: "success", identifier: "919000000001" });
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
console.log(`${count} persistent-session integration groups passed (isolated SQLite; SMS provider and cookie store mocked).`);
sqlite.close();
