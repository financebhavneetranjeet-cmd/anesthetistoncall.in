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
const DB = {
  prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return db.prepare(sql).run(...args); } };
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
db.close();
console.log('Hospital standard/advance and Surgeon advance posting pass without removed fields; legacy details remain readable; fee validation preserved.');
