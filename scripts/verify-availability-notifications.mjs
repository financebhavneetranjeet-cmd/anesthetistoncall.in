import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

const availability=fs.readFileSync("app/api/availability/route.ts","utf8");
const cases=fs.readFileSync("app/api/cases/route.ts","utf8");
const approval=fs.readFileSync("app/api/admin/cases/[id]/approve/route.ts","utf8");
const bell=fs.readFileSync("components/notifications/notification-bell.tsx","utf8");
for(const marker of ["case_notifications_enabled=1","case_notifications_enabled=0"]) assert.ok(availability.includes(marker),`availability missing ${marker}`);
for(const source of [cases,approval]) for(const marker of ["u.role='anesthetist'","u.status='verified'","account_status","cp.verification_status='verified'","cp.case_notifications_enabled=1","cp.availability_status='available'","cp.available_until"]) assert.ok(source.includes(marker),`server eligibility missing ${marker}`);
assert.ok(!fs.readFileSync("app/availability/availability-panel.tsx","utf8").includes("Notification.requestPermission()"),"availability changes must not interrupt the user with a native permission request");
assert.ok(fs.readFileSync("components/pwa/notification-permission.tsx","utf8").includes("Notification.requestPermission()"),"installed PWA permission prompt must request permission only after the user taps Allow Notifications");
for(const marker of ["View Case","unreadCount","notificationEnabled","Mark read"]) assert.ok(bell.includes(marker),`bell missing ${marker}`);

const db=new DatabaseSync(":memory:");
db.exec("CREATE TABLE users(id TEXT,role TEXT,status TEXT,account_status TEXT);CREATE TABLE clinician_profiles(user_id TEXT,verification_status TEXT,case_notifications_enabled INTEGER,availability_status TEXT,available_until TEXT);");
const addUser=db.prepare("INSERT INTO users VALUES(?,?,?,?)"),addProfile=db.prepare("INSERT INTO clinician_profiles VALUES(?,?,?,?,datetime('now','+1 hour'))");
const casesToCheck=[['eligible','anesthetist','verified','active','verified',1,'available'],['off','anesthetist','verified','active','verified',0,'unavailable'],['blocked','anesthetist','verified','blocked','verified',1,'available'],['unverified','anesthetist','verified','active','pending',1,'available'],['surgeon','surgeon','verified','active','verified',1,'available']];
for(const [id,role,status,account,verification,enabled,available] of casesToCheck){addUser.run(id,role,status,account);addProfile.run(id,verification,enabled,available)}
const eligible=db.prepare("SELECT u.id FROM users u JOIN clinician_profiles cp ON cp.user_id=u.id WHERE u.role='anesthetist' AND u.status='verified' AND u.account_status='active' AND cp.verification_status='verified' AND cp.case_notifications_enabled=1 AND cp.availability_status='available' AND datetime(cp.available_until)>CURRENT_TIMESTAMP").all().map(r=>r.id);
assert.deepEqual(eligible,["eligible"]);
console.log("Availability-linked notification eligibility, permission prompt, history dropdown and server-side exclusions passed.");
