import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id TEXT,role TEXT);
CREATE TABLE hospitals(id TEXT,owner_user_id TEXT);
CREATE TABLE cases(id TEXT,hospital_id TEXT,assigned_clinician_user_id TEXT,status TEXT,created_at TEXT,scheduled_at TEXT,required_arrival_at TEXT,arrived_at TEXT,cancelled_at TEXT);
CREATE TABLE notifications(user_id TEXT,case_id TEXT,kind TEXT);
CREATE TABLE case_responses(case_id TEXT,clinician_user_id TEXT,status TEXT,created_at TEXT);
CREATE TABLE case_incidents(subject_user_id TEXT,incident_type TEXT,status TEXT,reliability_impact TEXT,timing_class TEXT);
CREATE TABLE case_journeys(case_id TEXT,clinician_user_id TEXT,duration_seconds INTEGER,started_at TEXT);
CREATE TABLE case_ratings(rated_user_id TEXT,rating INTEGER,status TEXT,privacy_flagged INTEGER,excluded_from_score INTEGER);
CREATE TABLE case_payments(payer_user_id TEXT,payee_user_id TEXT,status TEXT);
INSERT INTO users VALUES('a','anesthetist'),('h','hospital');`);
const env={DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)}}}}}}};
const cache={};
function load(name){
 if(cache[name])return cache[name];
 const module={exports:{}};
 const output=ts.transpileModule(readFileSync(`lib/server/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',output)(id=>id==='cloudflare:workers'?{env}:load(id.replace('./','')),module,module.exports);
 return cache[name]=module.exports;
}
const {responseMetrics}=load('response-metrics');
const {performanceFor}=load('performance');
const {reliabilityFor}=load('ratings');
assert.deepEqual(await responseMetrics('a'),{eligibleAlerts:0,respondedAlerts:0,responseRate:null});
assert.equal((await performanceFor('a')).onTimeRate,null);
for(const who of ['a','h']){
 const result=await reliabilityFor(who);
 assert.equal(result.score,null);assert.equal(result.completionRate,null);
 assert.equal(result.punctuality,null);assert.equal(result.paymentReliability,null);
}
db.exec(`INSERT INTO notifications VALUES ('a','c1','case_open'),('a','c1','sos_alert'),('a','c2','planned_case'),('other','c3','case_open'),('a',NULL,'case_open');
INSERT INTO case_responses VALUES ('c1','a','available',NULL),('c1','a','accepted',NULL),('c2','a','withdrawn',NULL),('unnotified','a','available',NULL),('c2','other','available',NULL);`);
assert.deepEqual(await responseMetrics('a'),{eligibleAlerts:2,respondedAlerts:1,responseRate:50});
assert.equal((await performanceFor('a')).responseRate,50);
assert.equal((await reliabilityFor('a')).responseRate,50);
db.exec(`UPDATE case_responses SET status='available' WHERE case_id='c2' AND clinician_user_id='a';
INSERT INTO case_ratings VALUES('a',5,'published',0,0),('a',1,'hidden',0,0),('a',1,'published',1,0),('a',1,'published',0,1);`);
assert.equal((await responseMetrics('a')).responseRate,100);
assert.equal((await performanceFor('a')).rating,5);
assert.equal((await performanceFor('a')).ratingCount,1);
db.exec(`INSERT INTO cases VALUES('arrived',NULL,'a','completed','2026-01-01','2026-01-01 10:00:00',NULL,'2026-01-01 10:10:00',NULL);`);
assert.equal((await performanceFor('a')).onTimeRate,100);
assert.equal((await reliabilityFor('a')).punctuality,100);
assert.equal((await reliabilityFor('a')).score,null);
console.log('Actual metric handlers: empty history, duplicate alerts/responses, unrelated/withdrawn responses, moderated ratings and recorded arrivals passed.');
