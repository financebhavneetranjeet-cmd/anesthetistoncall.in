import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const source = readFileSync('lib/server/web-push.ts','utf8');
const sql = source.match(/`(SELECT n.id,n.user_id[\s\S]*?)`/)[1];
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id TEXT,role TEXT,status TEXT,account_status TEXT);
CREATE TABLE clinician_profiles(user_id TEXT,verification_status TEXT,case_notifications_enabled INTEGER,availability_status TEXT,available_until TEXT);
CREATE TABLE cases(id TEXT,status TEXT);
CREATE TABLE notifications(id TEXT,user_id TEXT,case_id TEXT,kind TEXT,title TEXT,body TEXT,dedupe_key TEXT);
CREATE TABLE push_subscriptions(user_id TEXT);
CREATE TABLE notification_deliveries(id TEXT PRIMARY KEY,notification_id TEXT,channel TEXT,status TEXT);
INSERT INTO cases VALUES('case','open');`);
for(const [id,account,availability,until,sub] of [['eligible','active','available','+1 hour',true],['blocked','blocked','available','+1 hour',true],['unavailable','active','unavailable','+1 hour',true],['expired','active','available','-1 hour',true],['unsubscribed','active','available','+1 hour',false]]) {
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,'anesthetist','verified',account);
 db.prepare("INSERT INTO clinician_profiles VALUES(?,'verified',1,?,datetime('now',?))").run(id,availability,until);
 if(sub) db.prepare('INSERT INTO push_subscriptions VALUES(?)').run(id);
 for(const version of [1,2]) db.prepare("INSERT INTO notifications VALUES(?,?,'case','sos_alert','SOS','New case',?)").run(`${id}-${version}`,id,`sos:case:${version}:${id}`);
}
const query=db.prepare(sql);
assert.deepEqual(query.all('case','sos_alert','sos:case:2:','sos:case:2:','sos:case:2:').map(r=>r.id),['eligible-2']);
db.prepare("INSERT INTO notification_deliveries VALUES('case-push:eligible-2','eligible-2','push','sending')").run();
assert.equal(query.all('case','sos_alert','sos:case:2:','sos:case:2:','sos:case:2:').length,0);
db.exec("UPDATE cases SET status='cancelled'");
assert.equal(query.all('case','sos_alert',null,null,null).length,0);
assert.ok(readFileSync('lib/server/emergency.ts','utf8').includes('waitUntil(sendWebPushForCase(caseId, "sos_alert", `sos:${caseId}:${offerVersion}:`))'));
console.log('Case push: eligible recipients, expiry, blocked accounts, subscriptions, SOS versions, duplicate claims and cancelled cases passed.');
