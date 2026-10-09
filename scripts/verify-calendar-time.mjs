import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`);
const time = await importSource(readFileSync('lib/availability-time.ts', 'utf8'));
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE availability_slots(id TEXT PRIMARY KEY, clinician_user_id TEXT, status TEXT, start_at TEXT, end_at TEXT, preferred_area TEXT, updated_at TEXT);`);
const user = { id: 'test-anaesthetist', role: 'anesthetist' };
globalThis.__calendarTest = { z, ...time, env: { DB: { prepare(sql) {
  if (sql.includes('notifications')) return { run: async () => ({}) };
  if (sql.includes('FROM cases')) return { bind: () => ({ all: async () => ({ results: [] }) }) };
  const stmt = db.prepare(sql);
  return { bind: (...args) => ({ run: async () => stmt.run(...args), all: async () => ({ results: stmt.all(...args) }) }) };
} } }, getSessionUser: async () => user, isVerifiedClinician: () => true, isApprovedHospital: () => false, jsonError: (message, status = 400) => Response.json({ ok: false, error: { message } }, { status }), jsonOk: (body, status = 200) => Response.json({ ok: true, ...body }, { status }) };
const routeSource = readFileSync('app/api/calendar/route.ts', 'utf8').replace(/import[\s\S]*?from\s+"[^"]+";/g, '');
const route = await importSource(`const {z,env,validateAvailabilityRange,getSessionUser,isVerifiedClinician,isApprovedHospital,jsonError,jsonOk}=globalThis.__calendarTest;\n${routeSource}`);
const { tomorrow } = time.availabilityDates();
for (const [input, period, expected] of [['00:15','AM','00:15'],['00:15','PM','12:15'],['12:30','AM','00:30'],['12:30','PM','12:30'],['09:45','PM','21:45'],['21:45','AM','09:45']]) assert.equal(time.withTimePeriod(input, period), expected);
for (const [startTime,endTime] of [['00:15','01:30'],['09:00','12:00'],['12:00','13:15'],['19:30','23:45']]) {
  const startAt = time.availabilityTimestamp(tomorrow,startTime), endAt = time.availabilityTimestamp(tomorrow,endTime);
  const response = await route.POST(new Request('https://test/api/calendar',{method:'POST',body:JSON.stringify({status:'available',startAt,endAt,preferredArea:'Amritsar'})}));
  assert.equal(response.status,201);
  const {slot} = await response.json();
  const loaded = await (await route.GET()).json();
  const saved = loaded.slots.find(s=>s.id === slot.id);
  assert.equal(saved.startAt,startAt); assert.equal(saved.endAt,endAt); assert.equal(saved.preferredArea,'Amritsar');
  assert.match(time.formatAvailabilityTime(saved.startAt), /\b(AM|PM)\b/);
  assert.equal(new Date(startAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour12:false,hour:'2-digit',minute:'2-digit'}),startTime);
}
const now = new Date('2026-10-08T04:00:00Z');
assert.ok(time.validateAvailabilityRange('2026-10-07T10:00:00+05:30','2026-10-07T11:00:00+05:30',now));
assert.ok(time.validateAvailabilityRange('2026-10-08T09:00:00+05:30','2026-10-08T10:00:00+05:30',now));
assert.ok(time.validateAvailabilityRange('2026-10-09T19:00:00+05:30','2026-10-09T18:00:00+05:30',now));
assert.equal(time.validateAvailabilityRange('2026-10-09T19:00:00+05:30','2026-10-09T20:00:00+05:30',now),null);
// Requested A–F exercise the actual POST → SQLite → GET path.
for (const [name,startTime,endTime,nextDay] of [['A','09:00','17:00',false],['B','23:00','03:00',true],['C','23:59','00:30',true],['D','00:00','06:00',false],['F','22:00','04:00',true]]) {
  const range = time.availabilityRange(tomorrow,startTime,endTime);
  assert.equal(range.nextDay,nextDay,name);
  assert.equal(range.endDate,nextDay ? time.indiaDate(new Date(new Date(`${tomorrow}T12:00:00+05:30`).getTime()+86400000)) : tomorrow,name);
  const response = await route.POST(new Request('https://test/api/calendar',{method:'POST',body:JSON.stringify({status:'available',startAt:range.startAt,endAt:range.endAt})}));
  assert.equal(response.status,201,name);
  const {slot} = await response.json();
  const saved = (await (await route.GET()).json()).slots.find(s=>s.id===slot.id);
  assert.equal(saved.startAt,range.startAt,name); assert.equal(saved.endAt,range.endAt,name);
  if(nextDay) {
    const midnight = time.availabilityTimestamp(range.endDate,'00:00');
    const active = db.prepare('SELECT id FROM availability_slots WHERE id=? AND datetime(start_at)<=datetime(?) AND datetime(end_at)>datetime(?)').get(slot.id,midnight,midnight);
    assert.equal(active.id,slot.id,'Continues after midnight');
    assert.equal(db.prepare('SELECT id FROM availability_slots WHERE id=? AND datetime(end_at)>datetime(?)').get(slot.id,range.endAt),undefined,'Expires exactly at end');
  }
}
assert.match(time.availabilityRange(tomorrow,'22:00','22:00').error,/different End Time/,'E');
const identical = time.availabilityTimestamp(tomorrow,'22:00');
assert.equal((await route.POST(new Request('https://test/api/calendar',{method:'POST',body:JSON.stringify({status:'available',startAt:identical,endAt:identical})}))).status,400);
const example = time.availabilityRange('2026-10-09','23:27','03:28');
assert.equal(example.startAt,'2026-10-09T17:57:00.000Z');
assert.equal(example.endAt,'2026-10-09T21:58:00.000Z');
assert.equal(example.endDate,'2026-10-10');
assert.equal(time.availabilityRange('2026-12-31','23:00','01:00').endDate,'2027-01-01');
console.log('A–F passed: overnight POST → SQLite → GET, IST example, year rollover, midnight continuation, exact expiry, equal-time API rejection.');
console.log('Calendar time checks passed: AM/PM, noon/midnight, IST, POST → SQLite → GET, past-date and invalid-range rejection.');
db.close(); delete globalThis.__calendarTest;
