import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('components/home/share-location.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(fetcher){
 const states=[],timers=new Map();let effect,cleanup;
 const module={exports:{}};
 const react={useState(value){const i=states.length;states.push(value);return[value,next=>states[i]=next]},useEffect(fn){effect=fn}};
 new Function('require','module','exports','fetch','setTimeout','clearTimeout',source)(id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:id.includes('button')?{Button:()=>null}:{MapPin:()=>null},module,module.exports,fetcher,(fn,ms)=>{timers.set(1,{fn,ms});return 1},id=>timers.delete(id));
 module.exports.ShareLocation({});cleanup=effect();
 return{states,timers,cleanup};
}
let signal;
const hung=await scenario((_url,options)=>{signal=options.signal;return new Promise(()=>{})});
assert.equal(hung.states[1],true);
assert.equal(hung.timers.get(1).ms,10000);
hung.timers.get(1).fn();
assert.equal(signal.aborted,true);assert.equal(hung.states[1],false);assert.match(hung.states[2],/retry/);
hung.cleanup();
const failed=await scenario(async()=>({ok:false,json:async()=>({error:{message:'denied'}})}));
await new Promise(resolve=>setImmediate(resolve));
assert.equal(failed.states[1],false);assert.match(failed.states[2],/could not be checked/);failed.cleanup();
const success=await scenario(async()=>({ok:true,json:async()=>({locationShared:true})}));
await new Promise(resolve=>setImmediate(resolve));
assert.equal(success.states[0],true);assert.equal(success.states[1],false);assert.equal(success.timers.size,0);success.cleanup();
const unmounted=await scenario(()=>new Promise(()=>{}));const timer=unmounted.timers.get(1);unmounted.cleanup();timer.fn();assert.equal(unmounted.states[1],true);
console.log('Location component: hung fetch, HTTP failure, successful status and unmount cleanup passed.');
