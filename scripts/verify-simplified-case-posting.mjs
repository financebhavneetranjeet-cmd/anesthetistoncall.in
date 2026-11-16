import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { z } from 'zod';

// Run the actual handlers and SQL against an isolated migrated database.
// External delivery is stubbed so these checks never send SMS or push alerts.
const db = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
const hospitalId = '00000000-0000-4000-8000-000000000001';
db.exec("INSERT INTO users(id,mobile,full_name,role,status) VALUES('hospital','100','Test Hospital','hospital','verified'),('surgeon','200','Test Surgeon','surgeon','verified')");
db.prepare("INSERT INTO hospitals(id,owner_user_id,name,address,approval_status) VALUES(?,'hospital','Test Hospital','Test address','approved')").run(hospitalId);
let beforeRun = () => {};
const DB = {
  prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { beforeRun(sql); return { meta: db.prepare(sql).run(...args) }; } };
  },
  async batch(statements) { for (const statement of statements) await statement.run(); },
};
let user;
const modules = {
  'cloudflare:workers': { env: { DB }, waitUntil() {} },
  zod: { z },
  '@/lib/server/http': { jsonOk: (body, status = 200) => Response.json(body, { status }), jsonError: (message, status = 400) => Response.json({ message }, { status }) },
  '@/lib/server/case-audit': { auditCase: async () => {} },
  '@/lib/server/case-posted-sms': { sendCasePostedSmsForCase: async () => {} },
  '@/lib/server/web-push': { sendWebPushForCase: async () => {} },
  '@/lib/server/ratings': { reliabilityFor: async () => null },
  'next/headers': { cookies() { throw new Error('Unexpected cookie access'); } },
};
function load(path) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => { assert.ok(modules[name], `Unexpected import ${name}`); return modules[name]; }, exports);
  return exports;
}
modules['@/lib/server/session'] = { ...load('lib/server/session.ts'), getSessionUser: async () => user };
const cases = load('app/api/cases/route.ts');
const planned = load('app/api/planned/route.ts');
const payload = { hospitalId, procedureName: 'Test procedure', location: 'Test Hospital', scheduledAt: new Date(Date.now() + 86400000).toISOString(), offeredFeeRupees: 5000, urgency: 'routine', durationMinutes: 60 };
for (const role of ['hospital', 'surgeon']) {
  user = { id: role, role, status: 'verified', accountStatus: 'active', hospitalId: role === 'hospital' ? hospitalId : null, hospitalApprovalStatus: 'approved', clinicianId: 'profile', clinicianVerificationStatus: 'verified' };
  for (const route of role === 'hospital' ? [cases, planned] : [planned]) {
    for (const legacy of [false, true]) {
      const body = { ...payload, ...(legacy ? { specialty: 'Orthopaedics', anaesthesiaType: 'Spinal' } : {}) };
      const response = await route.POST(new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) }));
      assert.equal(response.status, 201, await response.clone().text());
      const { case: { id } } = await response.json();
      const saved = db.prepare('SELECT * FROM cases WHERE id=?').get(id);
      assert.equal(saved.specialty, legacy ? 'Orthopaedics' : null);
      assert.equal(saved.anaesthesia_type, legacy ? 'Spinal' : 'Not specified');
      const listing = await (await cases.GET()).json();
      assert.ok(listing.cases.some(item => item.id === id), `${role} can read the saved case`);
    }
    const invalid = await route.POST(new Request('https://example.test/api', { method: 'POST', body: JSON.stringify({ ...payload, offeredFeeRupees: 0 }) }));
    assert.equal(invalid.status, 400, 'Fee validation remains required');
  }
}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n, 6);
for (const path of ['app/cases/new/new-case-form.tsx', 'app/planned/planned-form.tsx']) {
  const form = readFileSync(path, 'utf8');
  assert.doesNotMatch(form, /specialty|anaesthesiaType|Anaesthesia type|Specialty/);
}

modules['@/lib/server/emergency'] = load('lib/server/emergency.ts');
modules['@/lib/server/web-push'].publishAdminNotice = async () => {};
modules['@/lib/server/web-push'].sendWebPush = async () => {};
modules['@/lib/server/notifications'] = load('lib/server/notifications.ts');
const sos = load('app/api/emergency/[id]/respond/route.ts');

db.exec("INSERT INTO users(id,mobile,full_name,role,status) VALUES('doctor','300','Test Anaesthetist','anesthetist','verified')");
db.prepare("UPDATE hospitals SET latitude='31.63', longitude='74.87' WHERE id=?").run(hospitalId);
const doctor = { id: 'doctor', fullName: 'Test Anaesthetist', role: 'anesthetist', status: 'verified', accountStatus: 'active', clinicianId: 'profile', clinicianVerificationStatus: 'verified' };
const sosId = 'sos-test';
const arrival = new Date(Date.now() + 3_600_000).toISOString();
db.prepare(`INSERT INTO cases(id,hospital_id,posted_by_user_id,procedure_name,anaesthesia_type,scheduled_at,required_arrival_at,offered_fee_paise,is_emergency,bidding_enabled,status,sos_status)
  VALUES(?,?,'hospital','Test SOS','Not specified',?,?,500000,1,1,'open','searching')`).run(sosId, hospitalId, arrival, arrival);

function respond(body) {
  const request = new Request('https://example.test/api/emergency/sos-test/respond', { method: 'POST', body: JSON.stringify(body) });
  return sos.POST(request, { params: Promise.resolve({ id: sosId }) });
}

for (const viewer of [null, { ...doctor, role: 'surgeon' }, { ...doctor, accountStatus: 'blocked' }, { ...doctor, clinicianVerificationStatus: 'pending' }]) {
  user = viewer;
  assert.equal((await respond({ action: 'accept_offer' })).status, 403);
}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM case_responses').get().n, 0);

user = doctor;
assert.equal((await respond({ action: 'bid' })).status, 400);
const notices = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE case_id=? AND user_id='hospital' AND kind='sos_response'");
const responseRow = db.prepare('SELECT * FROM case_responses WHERE case_id=? AND clinician_user_id=?');
for (const [index, action] of ['accept_offer', 'bid', 'decline'].entries()) {
  for (const located of [false, true]) {
    const body = { action, ...(action === 'bid' ? { feeRupees: 1200 } : {}), ...(located ? { latitude: 31.65, longitude: 74.89 } : {}) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await respond(body);
      assert.equal(response.status, 200, await response.clone().text());
      const saved = responseRow.get(sosId, doctor.id);
      assert.equal(saved.response_type, action);
      assert.equal(saved.status, action === 'decline' ? 'declined' : 'available');
      assert.equal(saved.proposed_fee_paise, { accept_offer: 500000, bid: 620000, decline: null }[action]);
      if (located) {
        assert.ok(saved.distance_metres > 0);
        assert.ok(saved.eta_minutes >= 3);
        assert.ok(saved.location_captured_at);
      } else {
        assert.equal(saved.distance_metres, null);
        assert.equal(saved.eta_minutes, null);
        assert.equal(saved.location_captured_at, null);
      }
      assert.equal(notices.get(sosId).n, index + 1);
    }
  }
}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM case_responses WHERE case_id=?').get(sosId).n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.case_id=? AND d.channel='in_app' AND d.status='sent'").get(sosId).n, 3);

db.prepare("UPDATE cases SET required_arrival_at=datetime('now','-1 minute') WHERE id=?").run(sosId);
assert.equal((await respond({ action: 'accept_offer' })).status, 409);
db.prepare("UPDATE cases SET required_arrival_at=?, status='closed' WHERE id=?").run(arrival, sosId);
assert.equal((await respond({ action: 'accept_offer' })).status, 409);

for (const update of ["status='closed'", "sos_offer_version=sos_offer_version+1"]) {
  db.prepare("UPDATE cases SET status='open' WHERE id=?").run(sosId);
  beforeRun = (sql) => {
    if (sql.startsWith('INSERT INTO case_responses')) {
      db.prepare(`UPDATE cases SET ${update} WHERE id=?`).run(sosId);
    }
  };
  assert.equal((await respond({ action: 'accept_offer' })).status, 409);
  assert.equal(responseRow.get(sosId, doctor.id).response_type, 'decline');
  assert.equal(notices.get(sosId).n, 3);
}
beforeRun = () => {};
console.log('SOS responses, ETA, notification deduplication, permissions, expiry and concurrent case changes passed on migrated SQLite.');


modules['@/lib/fee-breakdown.mjs'] = {};
modules['@/lib/server/emergency-availability-service'] = { getCurrentAnaesthetistAvailability: async () => ({ availableUntil: arrival }) };
modules['@/lib/server/performance'] = {};
modules['@/lib/server/google-routes'] = {};
const caseBids = load('app/api/cases/[id]/bids/route.ts');
function bidThroughCases() {
  const request = new Request('https://example.test/api/cases/sos-test/bids', { method: 'POST', body: JSON.stringify({ proposedFeeRupees: 1200 }) });
  return caseBids.POST(request, { params: Promise.resolve({ id: sosId }) });
}
db.prepare("UPDATE cases SET required_arrival_at=datetime('now','-1 minute') WHERE id=?").run(sosId);
assert.equal((await bidThroughCases()).status, 409);
db.prepare("UPDATE cases SET required_arrival_at=? WHERE id=?").run(arrival, sosId);

beforeRun = (sql) => {
  if (sql.startsWith('INSERT INTO case_responses')) {
    db.prepare("UPDATE cases SET status='closed' WHERE id=?").run(sosId);
  }
};
assert.equal((await bidThroughCases()).status, 409);
assert.equal(responseRow.get(sosId, doctor.id).response_type, 'decline');
beforeRun = () => {};
db.prepare("UPDATE cases SET status='open' WHERE id=?").run(sosId);
assert.equal((await bidThroughCases()).status, 201);
assert.equal(responseRow.get(sosId, doctor.id).status, 'available');
console.log('General case bid route rejects expired or concurrently closed SOS cases and accepts an active case.');


const existingCase = db.prepare("SELECT id FROM cases WHERE hospital_id=? AND posted_by_user_id='hospital' AND is_planned=0").get(hospitalId);
assert.ok(existingCase);
db.prepare("DELETE FROM case_private_details WHERE case_id=?").run(existingCase.id);
db.exec("INSERT INTO users(id,mobile,full_name,role,status) VALUES('other-hospital','400','Other Hospital','hospital','verified')");
db.exec("INSERT INTO hospitals(id,owner_user_id,name,address,approval_status) VALUES('other','other-hospital','Other Hospital','Other address','approved')");
const owner = { id: 'hospital', role: 'hospital', status: 'verified', accountStatus: 'active', hospitalId, hospitalApprovalStatus: 'approved' };
function retryCase() {
  return cases.POST(new Request('https://example.test/api/cases', {
    method: 'POST', body: JSON.stringify({ ...payload, requestId: existingCase.id, patientInitials: 'QA' }),
  }));
}
user = { ...owner, id: 'other-hospital', hospitalId: 'other' };
assert.equal((await retryCase()).status, 409);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM case_private_details WHERE case_id=?").get(existingCase.id).n, 0);

user = owner;
assert.equal((await retryCase()).status, 201);
assert.equal(db.prepare("SELECT patient_initials FROM case_private_details WHERE case_id=?").get(existingCase.id).patient_initials, 'QA');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n, 6);
console.log('Case request ID replay is restricted to the original hospital account.');

db.close();
console.log('Hospital standard/advance and Surgeon advance posting pass without removed fields; legacy details remain readable; fee validation preserved.');
