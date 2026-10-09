import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL, toEmergencyAvailabilityDto } from "../lib/server/emergency-availability.mjs";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE availability_slots(id TEXT,clinician_user_id TEXT,status TEXT,start_at TEXT,end_at TEXT);CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT,status TEXT,account_status TEXT);CREATE TABLE clinician_profiles(user_id TEXT,verification_status TEXT,availability_status TEXT,available_until TEXT,availability_latitude TEXT,availability_longitude TEXT,availability_location_at TEXT);`);
const add = db.prepare("INSERT INTO users VALUES(?,?,?,?)");
const profile = db.prepare("INSERT INTO clinician_profiles VALUES(?,?,?,?,?,?,NULL)");
const future = new Date(Date.now() + 60 * 60_000).toISOString();
const expired = new Date(Date.now() - 60_000).toISOString();
const cases = [
  ["eligible", "verified", "active", "verified", "available", future],
  ["unverified", "pending", "active", "verified", "available", future],
  ["unapproved", "verified", "active", "pending", "available", future],
  ["suspended", "suspended", "active", "verified", "available", future],
  ["blocked", "verified", "blocked", "verified", "available", future],
  ["inactive", "verified", "suspended", "verified", "available", future],
  ["unavailable", "verified", "active", "verified", "unavailable", future],
  ["expired", "verified", "active", "verified", "available", expired],
];
for (const [id, status, account, verification, availability, until] of cases) { add.run(id, "anesthetist", status, account); profile.run(id, verification, availability, until, "31.634123", "74.872345"); db.prepare("INSERT INTO availability_slots VALUES(?,?,?,?,?)").run(id,id,availability,new Date(Date.now()-60000).toISOString(),until); }
const rows = () => db.prepare(EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL).all();
assert.deepEqual(rows().map((row) => row.clinicianId), ["eligible"]);
add.run("newly-available", "anesthetist", "verified", "active");
profile.run("newly-available", "verified", "available", future, null, null);
db.prepare("INSERT INTO availability_slots VALUES(?,?,?,?,?)").run("new", "newly-available", "available", expired, future);
assert.equal(rows().length, 2, "count increases after eligible availability is published");
db.prepare("UPDATE availability_slots SET end_at=? WHERE clinician_user_id='newly-available'").run(expired);
assert.equal(rows().length, 1, "count and population decrease after expiry");
const dto = toEmergencyAvailabilityDto(rows()[0], { score: 91, metrics: { rating: 4.7, ratingCount: 12 } });
assert.deepEqual(Object.keys(dto).sort(), ["approximateLocation", "availableUntil", "ranking", "rating", "ratingCount", "status"].sort());
assert.equal(dto.approximateLocation, null);
assert.equal(dto.ranking, 91);
assert.equal(dto.rating, 4.7);
const serialized = JSON.stringify(dto).toLowerCase();
for (const prohibited of ["name", "phone", "mobile", "email", "clinicianid", "userid", "registration", "qualification", "certificate", "address"]) assert.equal(serialized.includes(prohibited), false, `${prohibited} must not appear in DTO`);
const route = readFileSync(new URL("../app/api/emergency-availability/route.ts", import.meta.url), "utf8");
const home = readFileSync(new URL("../components/home/home-page.tsx", import.meta.url), "utf8");
assert.match(route, /isVerifiedPlatformUser/);
assert.match(home, /anaesthetists\.length/);
assert.match(home, /EmergencyAvailabilityMap/);
console.log("Emergency availability eligibility, expiry, privacy DTO, authorization, count/list/map population checks passed.");

db.prepare("INSERT INTO availability_slots VALUES(?,?,?,?,?)").run("overlap", "eligible", "available", expired, future);
assert.equal(rows().length, 1, "overlapping slots count once");
db.prepare("UPDATE availability_slots SET status='unavailable' WHERE clinician_user_id='eligible'").run();
assert.equal(rows().length, 0, "cancel returns count to zero");
db.prepare("UPDATE availability_slots SET status='available',start_at=?,end_at=? WHERE clinician_user_id='eligible'").run(future, new Date(Date.now()+7200000).toISOString());
assert.equal(rows().length, 0, "future availability excluded");

// Query a fixed instant during a Kolkata overnight period.
const fixedSql = EMERGENCY_AVAILABLE_ANAESTHETISTS_SQL.replaceAll('CURRENT_TIMESTAMP', "datetime('2026-10-09T19:00:00Z')");
db.prepare("UPDATE availability_slots SET start_at=?,end_at=? WHERE clinician_user_id='eligible'").run('2026-10-09T23:27:00+05:30','2026-10-10T03:28:00+05:30');
assert.equal(db.prepare(fixedSql).all().length, 1, "Kolkata overnight period included after midnight");

db.prepare("UPDATE clinician_profiles SET availability_location_at=CURRENT_TIMESTAMP WHERE user_id='eligible'").run();
const sharedDto = toEmergencyAvailabilityDto(db.prepare(fixedSql).all()[0], {score:0,metrics:{rating:0,ratingCount:0}});
assert.equal(sharedDto.approximateLocation.latitude,31.63);
assert.equal(sharedDto.approximateLocation.longitude,74.87);
