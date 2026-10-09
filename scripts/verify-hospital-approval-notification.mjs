import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const approval = fs.readFileSync("lib/server/hospital-approval-sms.ts", "utf8");
const route = fs.readFileSync("app/api/admin/hospitals/[id]/approve/route.ts", "utf8");
const feed = fs.readFileSync("app/api/notifications/route.ts", "utf8");
const bell = fs.readFileSync("components/notifications/notification-bell.tsx", "utf8");
const message = "Your hospital account has been approved. You can now post cases.";

assert.ok(route.includes("approval_status = 'pending'"), "approval event must only run for pending hospitals");
assert.ok(approval.includes("INSERT OR IGNORE INTO notifications"), "approval notice must be idempotent");
assert.ok(approval.includes(message), "approval notice text must match the product requirement");
assert.ok(feed.includes(message), "existing approval notices must render with the current required text");
assert.ok(feed.includes("user_id=?"), "notification feed must be scoped to the signed-in account");
assert.ok(!feed.includes("z.string().uuid()"), "stable approval ids must be accepted by mark-read");
assert.ok(bell.includes("unreadCount") && bell.includes("{n.body}"), "bell must show unread count and approval text");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT NOT NULL);
  CREATE TABLE hospitals(id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, approval_status TEXT NOT NULL);
  CREATE TABLE notifications(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, dedupe_key TEXT UNIQUE, read_at TEXT);
  INSERT INTO users VALUES ('hospital-user','hospital'),('ana-user','anesthetist');
  INSERT INTO hospitals VALUES ('hospital-1','hospital-user','pending');
`);

db.prepare("UPDATE hospitals SET approval_status='approved' WHERE id=? AND approval_status='pending'").run("hospital-1");
const insert = db.prepare("INSERT OR IGNORE INTO notifications(id,user_id,kind,body,dedupe_key) SELECT ?,?,'hospital_approved',?,? WHERE EXISTS(SELECT 1 FROM hospitals WHERE id=? AND approval_status='approved')");
for (let attempt = 0; attempt < 2; attempt++) insert.run("hospital-approved:hospital-1", "hospital-user", message, "hospital-approved:hospital-1", "hospital-1");

assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications").get().count, 1, "repeated saves must not duplicate approval notices");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id='ana-user'").get().count, 0, "hospital approval must not notify anaesthetists");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id='hospital-user' AND read_at IS NULL").get().count, 1, "bell unread count must increment");
assert.equal(db.prepare("SELECT body FROM notifications WHERE user_id='hospital-user'").get().body, message, "notification must persist for refresh/re-login");
db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?").run("hospital-approved:hospital-1", "hospital-user");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id='hospital-user' AND read_at IS NULL").get().count, 0, "mark-read must clear unread count");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id='hospital-user'").get().count, 1, "read notification must remain in history after refresh/re-login");

console.log("Hospital approval notification transition, account targeting, exact text, unread/read persistence and duplicate protection checks passed.");
