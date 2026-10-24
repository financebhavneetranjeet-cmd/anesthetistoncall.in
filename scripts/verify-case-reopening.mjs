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
  stdin: { contents: `export {default as HistoryPage} from './app/admin/case-history/page'; export * from './lib/server/session'; export {GET as cases} from './app/api/cases/route'; export {POST as assign} from './app/api/cases/[id]/assign/route'; export {POST as decline} from './app/api/cases/[id]/decline/route'; export {POST as accept} from './app/api/cases/[id]/accept/route'; export {GET as incidentsGet,POST as incident} from './app/api/cases/[id]/incidents/route'; export {POST as plannedManage} from './app/api/planned/[id]/manage/route';`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "isolated-platform", setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|next\/headers|next\/server|next\/navigation)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({ filter: /lib\/server\/(web-push|case-posted-sms|notifications)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({filter:/app\/chatgpt-auth$/},args=>({path:args.path,namespace:"mock"}));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "next/navigation" ? "export const redirect=()=>{throw new Error('REDIRECT_LOGIN')};" : args.path.endsWith("chatgpt-auth") ? "export const getChatGPTUser=async()=>null;" : args.path === "cloudflare:workers" ? "export const env=globalThis.__emailTest.env; export const waitUntil=p=>globalThis.__emailTest.jobs.push(p);" : args.path === "next/headers" ? "export const cookies=async()=>globalThis.__emailTest.jar;" : args.path === "next/server" ? "export const NextResponse={json:(data,init)=>Response.json(data,init)};" : args.path.endsWith("notifications") ? "export const notifyUser=async()=>{};" : args.path.endsWith("web-push") ? "export const sendWebPushForCase=async()=>{}; export const publishAdminNotice=async()=>{}; export const sendWebPush=async()=>{};" : "export const sendCasePostedSmsForCase=async()=>{};" }));
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

const req=(body={})=>new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const ctx=id=>({params:Promise.resolve({id})});
function fixture(){
 const id=crypto.randomUUID(),bid=crypto.randomUUID();
 sqlite.prepare("INSERT INTO cases(id,hospital_id,posted_by_user_id,procedure_name,location,anaesthesia_type,scheduled_at,offered_fee_paise,duration_minutes,status) VALUES(?,?,'hospital','Demo surgery','Amritsar','Unspecified',datetime('now','+1 day'),500000,60,'open')").run(id,hospitalId);
 sqlite.prepare("INSERT INTO case_responses(id,case_id,clinician_user_id,status) VALUES(?,?,'doctor','available')").run(bid,id);
 sqlite.prepare("INSERT INTO case_responses(id,case_id,clinician_user_id,status) VALUES(?,?,'other','available')").run(crypto.randomUUID(),id);
 return {id,bid};
}
async function visible(user,id){await api.createSession(user);const r=await api.cases();assert.equal(r.status,200);return (await r.json()).cases.some(c=>c.id===id);}
const {id,bid}=fixture();
assert.equal(await visible('other',id),true);
await api.createSession('hospital');assert.equal((await api.assign(req({bidId:bid}),ctx(id))).status,200);
assert.equal(await visible('other',id),false,'selection removes public listing');
assert.equal(await visible('doctor',id),true,'selected clinician retains active case');
assert.equal(await visible('hospital',id),true,'hospital retains active case');
await api.createSession('other');assert.equal((await api.decline(req(),ctx(id))).status,409,'unselected cannot reopen');
await api.createSession('doctor');assert.equal((await api.decline(req(),ctx(id))).status,200);
assert.equal((await api.decline(req(),ctx(id))).status,409,'repeat does not create audit or duplicate');
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cases WHERE id=?').get(id).n,1);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM case_audit_events WHERE case_id=? AND event_type='assignment_declined_reopened'").get(id).n,1);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM case_responses WHERE case_id=? AND status='available'").get(id).n,0,'old bids must be reconfirmed');
assert.equal(await visible('other',id),true,'same case returns');
let row=sqlite.prepare('SELECT * FROM cases WHERE id=?').get(id);assert.equal(row.assigned_clinician_user_id,null);assert.equal(row.fee_locked_at,null);
// Fresh availability and selection, then decline after acceptance.
sqlite.prepare("UPDATE case_responses SET status='available' WHERE id=?").run(bid);
await api.createSession('hospital');assert.equal((await api.assign(req({bidId:bid}),ctx(id))).status,200);
await api.createSession('doctor');assert.equal((await api.accept(req(),ctx(id))).status,200);
sqlite.prepare("INSERT INTO case_journeys(id,case_id,clinician_user_id,status,consented_at,started_at) VALUES(? ,?,'doctor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(crypto.randomUUID(),id);
assert.equal((await api.decline(req(),ctx(id))).status,200);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM case_journeys WHERE case_id=?').get(id).n,0,'new assignee can start a fresh journey');
// Both alternate cancellation entry points reopen safely.
for(const mode of ['incident','plannedManage']){
 sqlite.prepare("UPDATE cases SET status='assigned',assigned_clinician_user_id='doctor',assigned_at=CURRENT_TIMESTAMP,is_planned=1,booking_status='confirmed' WHERE id=?").run(id);
 const response=await api[mode](req({action:'cancel',reason:mode==='incident'?'transport_traffic':'cannot_attend'}),ctx(id));assert.equal(response.status,200);
 row=sqlite.prepare('SELECT * FROM cases WHERE id=?').get(id);assert.equal(row.status,'open');assert.equal(row.booking_status,'requested');
}
sqlite.prepare("UPDATE cases SET status='assigned',assigned_clinician_user_id='doctor',case_started_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
assert.equal((await api.decline(req(),ctx(id))).status,409,'in-progress cannot reopen');
sqlite.prepare("UPDATE cases SET status='completed' WHERE id=?").run(id);
assert.equal(await visible('hospital',id),false,'completed removed from everyday list');
assert.equal(await visible('doctor',id),false);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM case_assignment_history WHERE case_id=?').get(id).n,4,'history retained');
await api.createSession('hospital');const detail=await api.incidentsGet(req(),ctx(id));assert.equal(detail.status,200);assert.deepEqual((await detail.json()).assignmentHistory,[],'history is not sent to hospital');
console.log('PASS: selection visibility, offered/accepted refusal, alternate cancellations, one retained case, audit history, repeat/ownership guards, fresh responses, in-progress protection, completed list removal and private history.');

await api.createSession('hospital');await assert.rejects(()=>api.HistoryPage({searchParams:Promise.resolve({})}),/REDIRECT_LOGIN/);
seed('admin','admin','9876543210');await api.createSession('admin');assert.ok(await api.HistoryPage({searchParams:Promise.resolve({})}));
console.log('PASS: history page denies hospital and permits configured admin.');
