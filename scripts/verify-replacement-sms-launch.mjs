import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export {ReplacementSms} from './app/replacement/replacement-sms';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'hooks',setup(b){b.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:'jsx',namespace:'jsx'}));b.onLoad({filter:/.*/,namespace:'jsx'},()=>({contents:'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'}));b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const useState=()=>{const f=globalThis.smsFixture;return [f.states[f.si++],()=>{}]}; export const useRef=()=>{const f=globalThis.smsFixture;return f.refs[f.ri++]}; export const useCallback=f=>f; export const useEffect=()=>{};'}));}}]});
const {ReplacementSms}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function links(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(links);return [...(node.type==='a'?[node]:[]),...links(node.props?.children)];}
let requests=0;
globalThis.fetch=async()=>{requests++;return Response.json({recipients:[],message:''});};
for(const ios of [false,true]){
 globalThis.smsFixture={states:[{recipients:[{name:'Test',number:'+919000000003'}],message:'Fee ₹5000 & time 10:00'},false,'',ios],refs:[{current:Date.now()+15000},{current:0}],si:0,ri:0};
 const anchors=links(ReplacementSms({caseId:'fixture'}));assert.equal(anchors.length,2);
 for(const a of anchors){assert.equal(a.props.href,`sms:+919000000003${ios?'&':'?'}body=${encodeURIComponent('Fee ₹5000 & time 10:00')}`);let prevented=false;const before=requests;a.props.onClick({preventDefault(){prevented=true;}});assert.equal(prevented,false,'fresh native tap must not be intercepted');assert.equal(requests,before,'no async fetch between tap and composer');}
 globalThis.smsFixture.refs[0].current=0;let prevented=false;anchors[0].props.onClick({preventDefault(){prevented=true;}});assert.equal(prevented,true,'expired draft blocks native launch');await new Promise(resolve=>setImmediate(resolve));
}
console.log('PASS: Android/iOS recipient and body encoding, group and individual native tap, no network before launch, expired-draft blocking.');

globalThis.smsFixture={states:[{recipients:[],message:'',requesterAvailable:true},false,'',false],refs:[{current:Date.now()+15000},{current:0}],si:0,ri:0};
const empty=ReplacementSms({caseId:'fixture'});
assert.equal(links(empty).length,0,'no SMS links without another recipient');
const content=JSON.stringify(empty);
assert.match(content,/Other anaesthetists available for SMS:/);
assert.match(content,/Your own number is excluded/);
console.log('PASS: zero-recipient count and own-number explanation remain visible without a fake SMS link.');
