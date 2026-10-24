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
  stdin: { contents: `export * from './lib/server/session'; export {GET, POST} from './app/api/replacements/route'; export {POST as cancel} from './app/api/replacements/[id]/cancel/route'; export {GET as sms} from './app/api/replacements/[id]/sms/route';`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "isolated-platform", setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|next\/headers|next\/server)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onResolve({ filter: /lib\/server\/(web-push|case-posted-sms)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "cloudflare:workers" ? "export const env=globalThis.__emailTest.env; export const waitUntil=p=>globalThis.__emailTest.jobs.push(p);" : args.path === "next/headers" ? "export const cookies=async()=>globalThis.__emailTest.jar;" : args.path === "next/server" ? "export const NextResponse={json:(data,init)=>Response.json(data,init)};" : args.path.endsWith("web-push") ? "export const sendWebPushForCase=async()=>{};" : "export const sendCasePostedSmsForCase=async()=>{};" }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

globalThis.fetch = async () => { throw new Error("No external delivery allowed in tests"); };
function seed(id, role, mobile) {
  sqlite.prepare("INSERT INTO users(id,mobile,full_name,role,status,account_status) VALUES(?,?,?,?,'verified','active')").run(id,mobile,id,role);
  if(role==='anesthetist') sqlite.prepare("INSERT INTO clinician_profiles(id,user_id,state_council,registration_number,qualification,city,verification_status,case_notifications_enabled,availability_status,available_until) VALUES(?,?,'PMC',?,'MD','Amritsar','verified',1,'available',datetime('now','+1 hour'))").run('cp-'+id,id,id);
}
seed('hospital','hospital','9000000001');
seed('doctor','anesthetist','9000000002');
seed('available','anesthetist','9000000003');
seed('blocked','anesthetist','9000000004');
seed('offline','anesthetist','9000000005');
seed('other','anesthetist','9000000006');
sqlite.exec("UPDATE users SET account_status='blocked' WHERE id='blocked'; UPDATE clinician_profiles SET availability_status='unavailable',available_until=NULL WHERE user_id='offline'");
for (const id of ['doctor','available','blocked']) sqlite.prepare("INSERT INTO availability_slots(id,clinician_user_id,start_at,end_at,status) VALUES(?,?,datetime('now','-10 minutes'),datetime('now','+1 hour'),'available')").run('slot-'+id,id);
seed('duplicate','anesthetist','+91 9000000003');
seed('unverified','anesthetist','9000000007');
seed('wrongcity','anesthetist','9000000008');
for (const id of ['duplicate','unverified','wrongcity']) sqlite.prepare("INSERT INTO availability_slots(id,clinician_user_id,start_at,end_at,status) VALUES(?,?,datetime('now','-10 minutes'),datetime('now','+1 hour'),'available')").run('slot-'+id,id);
sqlite.exec("UPDATE clinician_profiles SET verification_status='pending' WHERE user_id='unverified'; UPDATE clinician_profiles SET city='Delhi' WHERE user_id='wrongcity'");
const hospitalId=crypto.randomUUID();
sqlite.prepare("INSERT INTO hospitals(id,owner_user_id,name,address,city,approval_status) VALUES(?,'hospital','Test Hospital','Test Address','Amritsar','approved')").run(hospitalId);
const payload={requestId:crypto.randomUUID(),hospitalId,procedureName:'Test surgery',scheduledAt:new Date(Date.now()+86400000).toISOString(),offeredFeeRupees:5000,durationMinutes:60};
const post=(body=payload)=>api.POST(new Request('https://example.invalid/api/replacements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
assert.equal((await post()).status,403);
await api.createSession('hospital'); assert.equal((await post()).status,403);
await api.createSession('doctor');
assert.equal((await post({...payload,scheduledAt:'2000-01-01T00:00:00Z'})).status,400);
assert.equal((await post({...payload,offeredFeeRupees:-1})).status,400);
assert.equal((await post({...payload,hospitalId:crypto.randomUUID()})).status,400);
assert.equal((await post()).status,201);
await Promise.all(jobs);
let row=sqlite.prepare("SELECT * FROM cases WHERE id=?").get(payload.requestId);
assert.equal(row.posted_by_user_id,'doctor'); assert.equal(row.hospital_id,hospitalId); assert.equal(row.offered_fee_paise,500000); assert.equal(row.status,'open');
assert.match(row.public_notes,/Replacement/);
assert.equal(row.urgency,'urgent');
assert.equal(row.anaesthesia_type,'Not specified');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM notification_deliveries WHERE channel='sms'").get().n,0,'phone SMS must not also send provider SMS');

const smsRequest=()=>api.sms(new Request('https://example.invalid'),{params:Promise.resolve({id:payload.requestId})});
let draftResponse=await smsRequest(); assert.equal(draftResponse.status,200);
let draft=await draftResponse.json();
assert.deepEqual(draft.recipients.map(r=>r.number),['+919000000003'],'only currently available, verified others; excludes self and blocked');
assert.match(draft.message,/Test surgery/); assert.match(draft.message,/5000/); assert.match(draft.message,/IST/);
sqlite.exec("UPDATE availability_slots SET end_at=datetime('now','-1 minute') WHERE clinician_user_id IN ('available','duplicate')");
assert.equal((await (await smsRequest()).json()).recipients.length,0,'expired availability excluded');
sqlite.prepare("UPDATE cases SET status='completed' WHERE id=?").run(payload.requestId);
assert.equal((await smsRequest()).status,404,'closed case has no contact export');
sqlite.prepare("UPDATE cases SET status='open' WHERE id=?").run(payload.requestId);
assert.deepEqual(sqlite.prepare("SELECT user_id FROM notifications WHERE kind='case_open' ORDER BY user_id").all().map(r=>r.user_id),['available']);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='hospital' AND kind='replacement_requested'").get().n,1);
const alerts=sqlite.prepare("SELECT COUNT(*) n FROM notifications").get().n;
assert.equal((await post()).status,200);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cases").get().n,1);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM notifications").get().n,alerts);
let list=await (await api.GET()).json(); assert.equal(list.requests.length,1); assert.equal(list.hospitals.length,1); assert.equal(list.hospitals[0].address,'Test Address');
assert.equal(list.requests[0].statusLabel,'Searching');
assert.equal(list.requests[0].canCancel,true);
const cancelRequest=()=>api.cancel(new Request('https://example.invalid',{method:'POST'}),{params:Promise.resolve({id:payload.requestId})});
sqlite.prepare("INSERT INTO case_responses(id,case_id,clinician_user_id,status) VALUES('response',?,'available','available')").run(payload.requestId);
assert.equal((await (await api.GET()).json()).requests[0].statusLabel,'Responses received');
for (const [status,label] of [['offered','Selected'],['assigned','Confirmed']]) {
  sqlite.prepare("UPDATE cases SET status=? WHERE id=?").run(status,payload.requestId);
  const state=(await (await api.GET()).json()).requests[0];
  assert.equal(state.statusLabel,label); assert.equal(state.canCancel,false); assert.equal(state.canSms,false);
  assert.equal((await cancelRequest()).status,409);
}
sqlite.prepare("UPDATE cases SET status='open' WHERE id=?").run(payload.requestId);
await api.createSession('other');
assert.equal((await cancelRequest()).status,409,'cannot cancel someone else request');
assert.equal((await smsRequest()).status,404,'another member cannot retrieve recipients');
assert.equal((await post()).status,409);
list=await (await api.GET()).json(); assert.equal(list.requests.length,0);
sqlite.exec("UPDATE users SET account_status='blocked' WHERE id='other'");
assert.equal((await post({...payload,requestId:crypto.randomUUID()})).status,403);
await api.createSession('doctor');
const notice=sqlite.prepare("SELECT id FROM notifications WHERE case_id=? AND kind='case_open'").get(payload.requestId);
sqlite.prepare("INSERT INTO notification_deliveries(id,notification_id,channel,status) VALUES('pending-push',?,'push','pending')").run(notice.id);
assert.equal((await cancelRequest()).status,200);
assert.equal(sqlite.prepare("SELECT status FROM notification_deliveries WHERE id='pending-push'").get().status,'skipped');
assert.equal((await smsRequest()).status,404,'cancelled request cannot expose SMS recipients');
const cancelled=(await (await api.GET()).json()).requests[0];
assert.equal(cancelled.statusLabel,'Cancelled'); assert.equal(cancelled.canCancel,false); assert.equal(cancelled.canSms,false);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE case_id=? AND read_at IS NULL AND kind IN ('case_open','replacement_requested')").get(payload.requestId).n,0);
assert.equal((await post()).status,200,'retry does not reopen cancelled request');
assert.equal(sqlite.prepare("SELECT status FROM cases WHERE id=?").get(payload.requestId).status,'cancelled');
console.log('PASS: real replacement handler, auth, validation, durable insert, eligibility, hospital notification, retry dedupe and request ownership.');
