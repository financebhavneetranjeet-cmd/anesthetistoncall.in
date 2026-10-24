import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,full_name TEXT,mobile TEXT,role TEXT,status TEXT DEFAULT 'verified',account_status TEXT DEFAULT 'active');
CREATE TABLE hospitals(id TEXT PRIMARY KEY,owner_user_id TEXT,name TEXT,latitude REAL,longitude REAL);
CREATE TABLE cases(id TEXT PRIMARY KEY,hospital_id TEXT,posted_by_user_id TEXT,status TEXT,approved_at TEXT,created_at TEXT,offered_fee_paise INTEGER,bidding_enabled INTEGER,is_emergency INTEGER);
CREATE TABLE clinician_profiles(user_id TEXT,qualification TEXT,verification_status TEXT,availability_status TEXT,available_until TEXT);
CREATE TABLE availability_slots(clinician_user_id TEXT,status TEXT,start_at TEXT,end_at TEXT);
CREATE TABLE case_responses(id TEXT PRIMARY KEY,case_id TEXT,clinician_user_id TEXT,proposed_fee_paise INTEGER,response_type TEXT,message TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,distance_metres REAL,eta_minutes INTEGER,response_latitude TEXT,response_longitude TEXT,location_captured_at TEXT,UNIQUE(case_id,clinician_user_id));
INSERT INTO users(id,full_name,mobile,role) VALUES('owner','Hospital','9000000000','hospital'),('doctor','Dr Test','9000000001','anesthetist'),('other','Other','9000000002','hospital');
INSERT INTO hospitals VALUES('hospital','owner','Test Hospital',30,75);
INSERT INTO cases VALUES('case','hospital','owner','open',datetime('now','-1 hour'),datetime('now','-1 hour'),500000,1,0);
INSERT INTO clinician_profiles VALUES('doctor','MD Anaesthesia','verified','available',datetime('now','+1 hour'));
INSERT INTO case_responses(id,case_id,clinician_user_id,status) VALUES('response','case','doctor','available');`);
const DB={prepare(sql){let args=[];return{bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}}}};
let user={id:'owner',role:'hospital',hospitalId:'hospital'};
const modules={
  'cloudflare:workers':{env:{DB}},zod:{z},
  '@/lib/server/session':{getSessionUser:async()=>user,isApprovedHospital:u=>u?.role==='hospital'&&u?.hospitalId,isVerifiedClinician:u=>u?.role==='surgeon',isVerifiedAnaesthetist:u=>u?.role==='anesthetist'},
  '@/lib/server/http':{jsonOk:(body,status=200)=>Response.json(body,{status}),jsonError:(message,status=400)=>Response.json({error:{message}},{status})},
  '@/lib/server/completion-feedback':{requireCompletionFeedback:async()=>null},
  '@/lib/server/emergency-availability-service':{getCurrentAnaesthetistAvailability:async()=>({})},
  '@/lib/fee-breakdown.mjs':{feeBreakdown:(posted,bid)=>({additionalFeePaise:bid??0,totalFeePaise:posted+(bid??0)})},
  '@/lib/server/notifications':{notifyUser:async()=>{}},'@/lib/server/case-audit':{auditCase:async()=>{}},
  '@/lib/server/performance':{scoreMatch:async()=>({score:0,reasons:[]})},
  '@/lib/server/ratings':{reliabilityFor:async()=>null},
  '@/lib/server/google-routes':{distanceBetween:()=>0,getTrafficRoute:async()=>null},
};
function load(path){const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',source)(name=>{if(name==='@/lib/server/case-dashboard-window')return load('lib/server/case-dashboard-window.ts');assert.ok(modules[name],`Unexpected import: ${name}`);return modules[name]},exports);return exports}
const bids=load('app/api/cases/[id]/bids/route.ts');const context={params:Promise.resolve({id:'case'})};
const directory=load('app/api/available-clinicians/route.ts');
assert.equal((await (await directory.GET()).json()).anaesthetists[0].mobile,'9000000001','approved hospital sees current number');
const first=await bids.GET(new Request('https://test.local'),context);
assert.equal(first.status,200);assert.equal((await first.json()).bids[0].mobile,'9000000001');
user={id:'other',role:'hospital',hospitalId:'elsewhere'};
assert.equal((await bids.GET(new Request('https://test.local'),context)).status,404,'other hospital cannot read phone');
user={id:'doctor',role:'anesthetist'};
assert.equal((await directory.GET()).status,403,'directory denies non-hospital callers');
user={id:'owner',role:'hospital',hospitalId:'hospital'};
sqlite.exec("UPDATE clinician_profiles SET available_until=datetime('now','-1 minute') WHERE user_id='doctor'");
assert.equal((await (await directory.GET()).json()).anaesthetists.length,0,'expired availability is hidden');
sqlite.exec("UPDATE case_responses SET status='withdrawn' WHERE id='response'");
assert.equal((await (await bids.GET(new Request('https://test.local'),context)).json()).bids[0].mobile,null,'withdrawn phone is hidden');
user={id:'doctor',role:'anesthetist',fullName:'Dr Test'};
const post=()=>bids.POST(new Request('https://test.local',{method:'POST',body:'{}'}),context);
sqlite.exec("UPDATE cases SET approved_at=datetime('now','-12 hours') WHERE id='case'");
assert.equal((await post()).status,409,'expired case rejects new response');
sqlite.exec("UPDATE cases SET approved_at=datetime('now','-1 hour') WHERE id='case'");
assert.equal((await post()).status,201,'recent case accepts response');
assert.equal(sqlite.prepare("SELECT status FROM case_responses WHERE id='response'").get().status,'available');
sqlite.close();
console.log('Responder contact authorization, withdrawn privacy and 12-hour write cutoff passed.');
