import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,seed){
 const module={exports:{}};let index=0;
 const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',output)(id=>{
   if(id==='react')return {...React,useEffect(){},useCallback:fn=>fn,useState:value=>[seed?seed[index++]:value,()=>{}]};
   if(id==='@/components/native-link')return{default:({children,...props})=>React.createElement('a',props,children)};
   if(id.startsWith('@/components/')||id==='./case-responder-map')return new Proxy({},{get:()=>()=>null});
   return require(id);
 },module,module.exports);
 return module.exports;
}
const Dashboard=load('app/cases/cases-dashboard.tsx').CasesDashboard;
const html=renderToStaticMarkup(React.createElement(Dashboard,{role:'anesthetist',approved:true,viewerUserId:'test',dualDashboard:false}));
for(const href of ['/performance','/reviews','/notifications'])assert.ok(!html.includes(`href="${href}"`));
for(const href of ['/calendar','/replacement'])assert.ok(html.includes(`href="${href}"`));
const metrics={ratingCount:0,completedCases:0,onTimeRate:null,responseRate:null,cancellations:0,repeatBookings:0,disputes:0,dataState:'New Member / Insufficient Data'};
const Performance=load('app/performance/performance-dashboard.tsx',[metrics]).PerformanceDashboard;
const performance=renderToStaticMarkup(React.createElement(Performance));
assert.ok(performance.includes('Not enough data'));assert.ok(!performance.includes('null%'));assert.ok(!performance.includes('90%'));
const Reviews=load('app/reviews/reviews-dashboard.tsx',[{summary:{score:null,ratingCount:0,completedCases:0,completionRate:null,punctuality:null,arrivalPerformance:'Not enough data'},eligible:[],received:[],given:[]},null,{},'']).ReviewsDashboard;
const reviews=renderToStaticMarkup(React.createElement(Reviews));
assert.ok(reviews.includes('No recorded arrivals'));assert.ok(!reviews.includes('null/100'));assert.ok(!reviews.includes('100%'));
console.log('Actual dashboard rendering: requested links removed, case controls preserved, missing history displayed without invented percentages.');
