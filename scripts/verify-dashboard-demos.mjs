import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
globalThis.__demoTest={user:null,accounts:{}};
const bundle=await build({stdin:{contents:"export {default as page} from './app/dashboard-demo/[role]/page'; export {DashboardDemo} from './app/dashboard-demo/[role]/dashboard-demo';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',write:false,plugins:[{name:'server',setup(b){b.onResolve({filter:/^(next\/navigation|@\/lib\/server\/(session|dashboard-access))$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/navigation'?"export const redirect=p=>{throw new Error('redirect:'+p)};export const notFound=()=>{throw new Error('not-found')};":a.path.endsWith('session')?"export const getSessionUser=async()=>globalThis.__demoTest.user;":"export const dashboardAccounts=async()=>globalThis.__demoTest.accounts;"}))}}]});
// Local generated module path keeps package resolution identical to the application.
const {writeFileSync,unlinkSync}=await import('node:fs');
const target=new URL('../.demo-check.mjs',import.meta.url);writeFileSync(target,bundle.outputFiles[0].text);
try {
 const api=await import(target.href);
 const page=role=>api.page({params:Promise.resolve({role})});
 await assert.rejects(()=>page('hospital'),/redirect:\/login/);
 globalThis.__demoTest.user={role:'hospital'};
 await assert.rejects(()=>page('hospital'),/redirect:\/cases/);
 await assert.rejects(()=>page('admin'),/not-found/);
 globalThis.__demoTest.user={role:'anesthetist'};globalThis.__demoTest.accounts={admin:'admin-id'};
 globalThis.fetch=()=>{throw new Error('Demo must never fetch live data')};
 for(const role of ['hospital','surgeon']){
  const element=await page(role);const html=renderToStaticMarkup(element);
  for(const text of ['DEMO','Sample data only','Awaiting Selection','Pending Acceptance','Selected / Assigned','Back to my dashboard','Post a Case'])assert.ok(html.includes(text));
  assert.ok(html.includes(role==='hospital'?'ABCD Hospital':'Mr Surgeon'));
  assert.equal((html.match(/<article/g)??[]).length,3);
 }
 const source=readFileSync('app/dashboard-demo/[role]/dashboard-demo.tsx','utf8');
 assert.ok(!/fetch\(|\/api\/|localStorage|sessionStorage/.test(source),'demo has no live or persistent data path');
 console.log('PASS: Hospital/Surgeon demo rendering, sample cases, linked-admin access, unauthorized access denial and no live network/data writes.');
} finally {unlinkSync(target)}
