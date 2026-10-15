import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const db = new DatabaseSync(':memory:');
process.env.TZ = 'Asia/Kolkata';
const now = Date.parse('2026-10-13T17:51:00Z');
for (const [stored, age] of [['2026-10-13 17:51:00',0],['2026-10-13 17:50:30',30000],['2026-10-13 17:41:00',600000],['2026-10-13 12:51:00',18000000],['2026-10-13T23:21:00+05:30',0]]) {
  const row = db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%SZ',?) AS createdAt").get(stored);
  assert.equal(now - new Date(row.createdAt).getTime(),age);
}
const route=readFileSync('app/api/cases/[id]/bids/route.ts','utf8');
assert.ok(route.includes("strftime('%Y-%m-%dT%H:%M:%SZ',r.created_at) AS createdAt"));
console.log('Response timestamps preserve UTC: fresh, seconds, minutes, genuine five-hour age and IST inputs passed in Asia/Kolkata.');
