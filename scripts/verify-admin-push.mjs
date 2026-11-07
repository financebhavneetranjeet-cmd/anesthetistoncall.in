import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { transpileModule, ModuleKind } from 'typescript';
import { webcrypto } from 'node:crypto';
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id TEXT, mobile TEXT,role TEXT,status TEXT,account_status TEXT);
CREATE TABLE clinician_profiles(user_id TEXT,verification_status TEXT,case_notifications_enabled INTEGER,availability_status TEXT,available_until TEXT);
CREATE TABLE availability_slots(clinician_user_id TEXT,status TEXT,start_at TEXT,end_at TEXT);
CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT,case_id TEXT,kind TEXT,title TEXT,body TEXT,dedupe_key TEXT UNIQUE);
CREATE TABLE notification_deliveries(id TEXT PRIMARY KEY,notification_id TEXT,channel TEXT,status TEXT,error_code TEXT);
CREATE TABLE push_subscriptions(id TEXT,user_id TEXT,endpoint TEXT,p256dh TEXT,auth TEXT);`);
const user = db.prepare('INSERT INTO users VALUES(?,?,?,?,?)');
user.run('admin','allowed','admin','verified','active');
user.run('blocked-admin','allowed','admin','verified','blocked');
user.run('fake-admin','not-allowed','admin','verified','active');
for (const id of ['now','future','expired','off']) {
 user.run(id,'mobile','anesthetist','verified','active');
 db.prepare("INSERT INTO clinician_profiles VALUES(?,'verified',0,'unavailable',NULL)").run(id);
}
db.exec(`INSERT INTO availability_slots VALUES('now','available',datetime('now','-1 hour'),datetime('now','+1 hour'));
INSERT INTO availability_slots VALUES('future','available',datetime('now','+1 hour'),datetime('now','+2 hours'));
INSERT INTO availability_slots VALUES('expired','available',datetime('now','-2 hours'),datetime('now','-1 hour'));
INSERT INTO availability_slots VALUES('off','unavailable',datetime('now','-1 hour'),datetime('now','+1 hour'));`);
const caseSource=fs.readFileSync('app/api/cases/route.ts','utf8');
const predicate=caseSource.match(/WHERE u.role='anesthetist'([\s\S]*?)AND lower\(cp.city\)/)[1];
assert.deepEqual(db.prepare("SELECT u.id FROM users u JOIN clinician_profiles cp ON cp.user_id=u.id WHERE u.role='anesthetist'"+predicate).all().map(r=>r.id),['now']);
const calls=[];
const adapter={ prepare(sql) { return { bind(...args) { const stmt=db.prepare(sql);return { async run() { const r=stmt.run(...args);return {meta:{changes:r.changes}}; },async all() { return {results:stmt.all(...args)}; },async first() { return stmt.get(...args); } }; },async all() {return {results:db.prepare(sql).all()};} }; } };
const exports={};
vm.runInNewContext(transpileModule(fs.readFileSync('lib/server/web-push.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText,{ exports,crypto:webcrypto,console,
 require(name) { if(name==='cloudflare:workers') return {env:{DB:adapter,WEB_PUSH_PUBLIC_KEY:'test',WEB_PUSH_PRIVATE_KEY:'test'}};
 if(name==='web-push')return {default:{setVapidDetails(){},async sendNotification(...args){calls.push(args);}}};
 if(name==='./login')return {isAdminMobile:mobile=>mobile==='allowed'};if(name==='./replacement-recipients')return {replacementRecipients:async()=>[]};throw Error(name); }
});
db.exec("INSERT INTO push_subscriptions VALUES('device','admin','https://example.test','key','auth')");
const payload={title:'New case',body:'Test case',url:'/admin',tag:'event'};
await exports.publishAdminNotice(payload,'case-event');
await exports.publishAdminNotice(payload,'case-event');
assert.equal(calls.length,1);
assert.deepEqual(db.prepare('SELECT user_id FROM notifications').all().map(r=>r.user_id),['admin']);
assert.equal(JSON.parse(calls[0][1]).url,'/admin');
console.log('Push tests passed: active saved slots only; authorized admin receives push without availability; blocked/unauthorized admins excluded; duplicate event sent once.');
