import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
const db=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`drizzle/${f}`,'utf8'));
const jar=new Map();
const env={ADMIN_MOBILES:'9876543210',DB:{prepare(sql){let values=[];const q={bind(...v){values=v;return q},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){return{meta:{changes:db.prepare(sql).run(...values).changes}}}};return q}}};
globalThis.__dashboardTest={env,jar:{get:k=>jar.has(k)?{value:jar.get(k)}:undefined,set:(k,v)=>jar.set(k,v),delete:k=>jar.delete(k)}};
const bundle=await build({stdin:{contents:"export * from './lib/server/session'; export * from './lib/server/dashboard-access'; export {POST as change} from './app/api/account/switch-dashboard/route';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'platform',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/server)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='cloudflare:workers'?'export const env=globalThis.__dashboardTest.env;':a.path==='next/headers'?'export const cookies=async()=>globalThis.__dashboardTest.jar;':'export const NextResponse={json:(d,i)=>Response.json(d,i)};'}))}}]});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function user(id,role,mobile='9876543210'){
 db.prepare("INSERT INTO users(id,mobile,full_name,role,status,account_status) VALUES(?,?,?,?,'verified','active')").run(id,mobile,id,role);
 if(role==='hospital')db.prepare("INSERT INTO hospitals(id,owner_user_id,name,address,city,approval_status) VALUES(?,?,'Amritsar Pain Spine & Arthritis Centre','GT Road','Amritsar','approved')").run('h-'+id,id);
 if(['anesthetist','surgeon'].includes(role))db.prepare("INSERT INTO clinician_profiles(id,user_id,state_council,registration_number,qualification,city,verification_status) VALUES(?,?,'PMC',?,'MD','Amritsar','verified')").run('cp-'+id,id,id);
}
for(const role of ['admin','anesthetist','hospital','surgeon'])user(role,role);
user('other-hospital','hospital','9000000001');user('fake-admin','admin','9000000002');
const request=(role,origin='https://example.invalid')=>api.change(new Request('https://example.invalid/api/account/switch-dashboard',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({role})}));
assert.equal((await request('hospital')).status,401);
await api.createSession('admin');
const snapshot=db.prepare('SELECT COUNT(*) n FROM users').get().n;
for(const role of ['anesthetist','hospital','surgeon','admin']){
 assert.deepEqual(Object.keys(await api.dashboardAccounts(await api.getSessionUser())).sort(),['admin','anesthetist','hospital','surgeon']);
 const r=await request(role);assert.equal(r.status,200);assert.equal((await r.json()).redirectTo,role==='admin'?'/admin':'/cases');assert.equal((await api.getSessionUser()).id,role);
}
assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,snapshot,'switching cannot create accounts');
assert.equal((await request('hospital','https://attacker.invalid')).status,403);
assert.equal((await request('owner')).status,400);
for(const state of ['suspended','blocked','deleted']){
 db.prepare('UPDATE users SET account_status=? WHERE id=?').run(state,'hospital');assert.equal((await request('hospital')).status,403);assert.equal((await api.getSessionUser()).id,'admin');
}
db.prepare("UPDATE users SET account_status='active' WHERE id='hospital'").run();
for(const state of ['pending','rejected']){db.prepare('UPDATE hospitals SET approval_status=? WHERE owner_user_id=?').run(state,'hospital');assert.equal((await request('hospital')).status,403)}
db.prepare("UPDATE hospitals SET approval_status='approved' WHERE owner_user_id='hospital'").run();
db.prepare("UPDATE clinician_profiles SET verification_status='pending' WHERE user_id='surgeon'").run();assert.equal((await request('surgeon')).status,403);
await api.createSession('other-hospital');assert.equal((await request('hospital')).status,200);assert.equal((await request('admin')).status,403);assert.equal((await request('surgeon')).status,403);assert.equal((await api.getSessionUser()).id,'other-hospital');
await api.createSession('fake-admin');assert.equal((await request('admin')).status,403,'admin requires mobile allowlist');
await api.createSession('admin');db.prepare("UPDATE sessions SET expires_at=datetime('now','-1 minute')").run();assert.equal((await request('hospital')).status,401);
console.log('PASS: four real dashboard switches, return to Admin, same-mobile isolation, origin validation, no provisioning, revoked/expired sessions, blocked/deleted/suspended accounts and hospital/clinician approval gates.');
