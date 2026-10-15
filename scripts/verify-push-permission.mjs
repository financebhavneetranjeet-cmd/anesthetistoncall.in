import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const component = readFileSync("components/pwa/notification-permission.tsx", "utf8");
const route = readFileSync("app/api/push-subscriptions/route.ts", "utf8");
const worker = readFileSync("public/sw.js", "utf8");

for (const marker of ["isStandalone()", 'Notification.permission === "denied"', 'Notification.permission === "default"', 'Notification.permission === "granted"', "Enable in Settings", "pushManager.getSubscription()", "isCriticalFlow()"])
  assert.ok(component.includes(marker), `permission flow missing ${marker}`);
for (const marker of ["getSessionUser", "hasActiveAccount", "ON CONFLICT(endpoint)", "user_id = ? AND endpoint = ?", "https:"])
  assert.ok(route.includes(marker), `subscription API missing ${marker}`);
for (const marker of ['self.addEventListener("push"', 'self.addEventListener("notificationclick"', "showNotification"])
  assert.ok(worker.includes(marker), `service worker missing ${marker}`);

// A subscription on another device must never prevent this device enrolling.
assert.ok(!component.includes("|| result.subscribed"));
assert.ok(!component.includes("if (!isStandalone()"));
assert.ok(component.includes("async function openSettings()"));
assert.ok(readFileSync("app/admin/page.tsx", "utf8").includes("<NotificationPermission manual />"));
const documentRoute = readFileSync("app/api/clinicians/documents/route.ts", "utf8");
assert.ok(documentRoute.indexOf("approvalRequestId: id") > documentRoute.indexOf("INSERT INTO verification_documents"));
assert.ok(documentRoute.includes("waitUntil(notifyAdminsOfRegistration"));

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('u1'),('u2');" + readFileSync("drizzle/0027_push_subscriptions.sql", "utf8").replaceAll("--> statement-breakpoint", ""));
db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth) VALUES(?,?,?,?,?)").run("s1", "u1", "https://push.example/1", "p256dh-key-value", "auth-key-value");
db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=CURRENT_TIMESTAMP").run("s2", "u2", "https://push.example/1", "new-p256dh-key", "new-auth-key");
const stored = db.prepare("SELECT user_id,p256dh FROM push_subscriptions WHERE endpoint=?").get("https://push.example/1");
assert.equal(stored.user_id, "u2");
assert.equal(stored.p256dh, "new-p256dh-key");

console.log("PWA notification granted, denied, default, critical-flow and secure subscription persistence checks passed.");
