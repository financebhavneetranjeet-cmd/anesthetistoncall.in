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
  stdin: { contents: `export * from './lib/server/session'; export {GET, POST} from './app/api/replacements/route'; export {GET as feedbackGet,POST as feedbackPost} from './app/api/case-feedback/route'; export {POST as bid} from './app/api/cases/[id]/bids/route'; export {POST as accept} from './app/api/cases/[id]/accept/route'; export {POST as normalCase} from './app/api/cases/route'; export {POST as planned} from './app/api/planned/route'; export {POST as emergency} from './app/api/emergency/route'; export {POST as emergencyRespond} from './app/api/emergency/[id]/respond/route'; export {POST as caseSms} from './app/api/cases/[id]/sms/route'; export {POST as cancel} from './app/api/replacements/[id]/cancel/route'; export {GET as sms} from './app/api/replacements/[id]/sms/route';`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "isolated-platform", setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|next\/headers|next\/server)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({ filter: /lib\/server\/(web-push|case-posted-sms)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "cloudflare:workers" ? "export const env=globalThis.__emailTest.env; export const waitUntil=p=>globalThis.__emailTest.jobs.push(p);" : args.path === "next/headers" ? "export const cookies=async()=>globalThis.__emailTest.jar;" : args.path === "next/server" ? "export const NextResponse={json:(data,init)=>Response.json(data,init)};" : args.path.endsWith("web-push") ? "export const sendWebPushForCase=async()=>{}; export const publishAdminNotice=async()=>{}; export const sendWebPush=async()=>{};" : "export const sendCasePostedSmsForCase=async()=>{};" }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

globalThis.fetch = async () => { throw new Error("No external delivery allowed in tests"); };
function seed(id, role, mobile) {
  sqlite.prepare("INSERT INTO users(id,mobile,full_name,role,status,account_status) VALUES(?,?,?,?,'verified','active')").run(id,mobile,id,role);
  if(role==='anesthetist') sqlite.prepare("INSERT INTO clinician_profiles(id,user_id,state_council,registration_number,qualification,city,verification_status,case_notifications_enabled,availability_status,available_until) VALUES(?,?,'PMC',?,'MD','Amritsar','verified',1,'available',datetime('now','+1 hour'))").run('cp-'+id,id,id);
}

seed('hospital','hospital','9000000001');seed('doctor','anesthetist','9000000002');seed('other','anesthetist','9000000003');seed('surgeon','surgeon','9000000004');
sqlite.prepare("INSERT INTO clinician_profiles(id,user_id,state_council,registration_number,qualification,city,verification_status) VALUES('cp-surgeon','surgeon','PMC','SURG','MS','Amritsar','verified')").run();
const hospitalId=crypto.randomUUID();sqlite.prepare("INSERT INTO hospitals(id,owner_user_id,name,address,city,approval_status) VALUES(?,'hospital','Test Hospital','Address','Amritsar','approved')").run(hospitalId);
function completed(poster='hospital',date='2030-01-01 00:00:00'){const id=crypto.randomUUID();sqlite.prepare("INSERT INTO cases(id,hospital_id,posted_by_user_id,procedure_name,anaesthesia_type,scheduled_at,offered_fee_paise,urgency,duration_minutes,status,assigned_clinician_user_id,closed_at) VALUES(?,?,?,'Test surgery','General','2030-01-01T00:00:00Z',500000,'routine',60,'completed','doctor',?)").run(id,hospitalId,poster,date);return id;}

const old=completed('hospital','2020-01-01 00:00:00');
sqlite.prepare('UPDATE cases SET feedback_required=0 WHERE id=?').run(old); // Existing rows retain the migration default.
const req=body=>new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const ctx=id=>({params:Promise.resolve({id})});
const pending=async()=> (await (await api.feedbackGet()).json()).pending;
const answers={everythingReady:'yes',equipmentProper:'no',durationMinutes:90,feeReceivedRupees:0};
const provider={arrivedOnTime:'no',workQuality:'partly',notInHurry:'not_observed',patientCare:'yes',feeDemandedRupees:5000,feePaidRupees:4000};
assert.equal((await api.feedbackGet()).status,403);
await api.createSession('doctor');assert.equal((await pending()).length,0,'legacy completed cases do not retroactively block');
const id=completed();assert.equal((await pending())[0].side,'anesthetist');
for(const [fn,body] of [[api.POST,{}],[api.bid,{}],[api.accept,{}],[api.emergencyRespond,{action:'accept_offer'}],[api.caseSms,{action:'availability'}]]){const r=await fn(req(body),ctx(crypto.randomUUID()));assert.equal(r.status,409);assert.equal((await r.json()).error.code,'CASE_FEEDBACK_REQUIRED');}
assert.equal((await api.feedbackPost(req({caseId:id,answers:{...answers,feeReceivedRupees:-1}}))).status,400);
assert.equal((await api.feedbackPost(req({caseId:id,answers:{everythingReady:'yes'}}))).status,400);
assert.equal((await api.feedbackPost(req({caseId:id,answers:provider}))).status,400,'cannot submit opposite-side form');
await api.createSession('other');assert.equal((await pending()).length,0);assert.equal((await api.feedbackPost(req({caseId:id,answers}))).status,403);
await api.createSession('doctor');assert.equal((await api.feedbackPost(req({caseId:id,answers}))).status,200);assert.equal((await pending()).length,0);
assert.equal((await api.feedbackPost(req({caseId:id,answers}))).status,200,'retry is idempotent');
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM case_completion_feedback').get().n,1);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM case_payments').get().n,0,'reported fees do not create or settle payments');
const replacement={requestId:crypto.randomUUID(),hospitalId,procedureName:'Next surgery',scheduledAt:new Date(Date.now()+86400000).toISOString(),offeredFeeRupees:5000,durationMinutes:60};
assert.equal((await api.POST(req(replacement))).status,201,'own submission unlocks work without waiting for counterpart');
await api.createSession('hospital');assert.equal((await pending())[0].side,'hospital');
for(const fn of [api.normalCase,api.planned,api.emergency]){const r=await fn(req({}));assert.equal(r.status,409);assert.equal((await r.json()).error.code,'CASE_FEEDBACK_REQUIRED');}
assert.equal((await api.feedbackPost(req({caseId:id,answers:provider}))).status,200);assert.equal((await pending()).length,0);
const surgeonCase=completed('surgeon');assert.equal((await pending()).length,0,'surgeon-posted case requires surgeon, not uninvolved hospital owner');
await api.createSession('surgeon');assert.equal((await pending())[0].side,'surgeon');assert.equal((await api.planned(req({}))).status,409);assert.equal((await api.feedbackPost(req({caseId:surgeonCase,answers:provider}))).status,200);
await api.createSession('doctor');assert.equal((await pending()).length,1,'each new completion requires another submission');
sqlite.prepare("UPDATE cases SET status='assigned' WHERE id=?").run(surgeonCase);assert.equal((await pending()).length,0);assert.equal((await api.feedbackPost(req({caseId:surgeonCase,answers}))).status,403,'cannot submit before completion');
sqlite.prepare('UPDATE cases SET feedback_required=0 WHERE id=?').run(surgeonCase);
sqlite.prepare("UPDATE cases SET status='completed' WHERE id=?").run(surgeonCase);
assert.equal((await pending()).length,1,'completion update trigger creates the requirement');
console.log('PASS: actual API/SQLite feedback, role ownership, prospective rollout, all creation/response gates, full validation, idempotency, independent unlocking and no payment mutation.');
