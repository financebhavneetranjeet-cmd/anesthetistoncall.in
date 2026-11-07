import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {z} from 'zod';
const db=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`drizzle/${file}`,'utf8'));
const roles=['hospital','anesthetist','surgeon','admin'];
for(const [i,role] of roles.entries()){
 db.prepare("INSERT INTO users(id,mobile,full_name,role,status) VALUES(?,?,?,?, 'verified')").run(role,String(i+100),role,role);
 db.prepare("INSERT INTO sessions(id,token_hash,user_id,expires_at) VALUES(?,?,?,'2030-01-01')").run(`s-${role}`,`token-${role}`,role);
}
db.exec("INSERT INTO hospitals(id,owner_user_id,name,address,approval_status) VALUES('h','hospital','Test hospital','Address','approved'); INSERT INTO cases(id,hospital_id,procedure_name,anaesthesia_type,scheduled_at,offered_fee_paise,status,assigned_clinician_user_id) VALUES('case','h','Test procedure','Spinal','2026-01-01',100,'completed','anesthetist')");
for(const role of ['anesthetist','surgeon'])db.prepare("INSERT INTO clinician_profiles(id,user_id,state_council,registration_number,qualification,verification_status,availability_status) VALUES(?,?,'PMC',?,'MD','verified','available')").run(role,role,role);
let admin=null;
const DB={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:r.changes}};}};},async batch(ss){db.exec('BEGIN');try{const results=[];for(const s of ss)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
const modules={'cloudflare:workers':{env:{DB}},zod:{z},'@/lib/server/admin':{getAdminIdentity:async()=>admin,isAdmin:async()=>!!admin},'@/lib/server/http':{jsonOk:(b,status=200)=>Response.json(b,{status}),jsonError:(message,status=400)=>Response.json({error:{message}},{status})}};
function load(file){const exports={};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(id=>{assert.ok(modules[id],id);return modules[id];},exports);return exports;}
modules['@/lib/server/admin-case-deletion']=load('lib/server/admin-case-deletion.ts');
const route=load('app/api/admin/users/[id]/status/route.ts');
const act=(id,action='delete',reason='Administrator requested deletion')=>route.POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({action,reason})}),{params:Promise.resolve({id})});
assert.equal((await act('hospital')).status,403);
admin={name:'Test admin',actor:'test@example.test'};
assert.equal((await act('admin')).status,403,'Admin accounts protected');
assert.equal((await act('missing')).status,404);
assert.equal((await act('hospital','delete','')).status,400,'Reason required');
const login=load('lib/server/login.ts');
for(const role of ['hospital','anesthetist','surgeon']){
 for(let i=0;i<2;i++)assert.equal((await act(role)).status,200);
 const user=db.prepare('SELECT role,status,account_status AS accountStatus FROM users WHERE id=?').get(role);
 assert.equal(user.accountStatus,'blocked');assert.equal(login.loginAllowed(user,String(100+roles.indexOf(role))),false,'Login denied');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(role).n,0,'Sessions revoked');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM user_access_audit_logs WHERE user_id=? AND action='delete'").get(role).n,1,'No duplicate deletion markers');
 assert.equal((await act(role,'restore')).status,409,'Restore cannot resurrect deleted account');
}
assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,4,'Accounts retained for historical links');
assert.equal(db.prepare('SELECT COUNT(*) n FROM cases').get().n,1,'Historical cases retained');
assert.equal(db.prepare("SELECT approval_status FROM hospitals WHERE id='h'").get().approval_status,'rejected','Deleted hospital removed from approved selections');
assert.equal(db.prepare("SELECT COUNT(*) n FROM clinician_profiles WHERE verification_status='rejected' AND availability_status='unavailable'").get().n,2);
assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id='admin'").get().n,1,'Other account sessions untouched');
const listing=await(await load('app/api/admin/control/route.ts').GET(new Request('https://test/api'))).json();
assert.deepEqual(listing.users.map(u=>u.id),['admin']);
assert.equal(listing.roleCounts.hospitals,0);assert.equal(listing.roleCounts.anesthetists,0);assert.equal(listing.roleCounts.surgeons,0);
assert.equal(listing.accessAudit.filter(a=>a.action==='delete').length,3,'Deletion audit remains visible');
db.close();console.log('Admin account deletion passed for Hospital, Anaesthetist and Surgeon: authorization, confirmation reason, session revocation, login denial, list/count exclusion, audit, idempotency, non-restoration and historical record retention (isolated SQLite).');
