// Behavioral tests use mocked browser events; these do not claim Android WebAPK coverage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('components/pwa/pwa-install.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const bootstrap = readFileSync('public/pwa-bootstrap.js', 'utf8');
const android = 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0.0.0 Mobile Safari/537.36';
function harness({ ua = android, standalone = false, early = null, failWorker = false, related = [] } = {}) {
  const slots = [], effects = [], frames = [], listeners = new Map();
  let cursor = 0;
  const win = {
    location: { origin: 'https://anesthetistoncall.in', host: 'anesthetistoncall.in', pathname: '/', search: '', href: 'https://anesthetistoncall.in/' },
    matchMedia: query => ({ matches: query === '(display-mode: standalone)' ? standalone : false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: cb => { frames.push(cb); return 1; }, cancelAnimationFrame() {}, setTimeout() {},
    addEventListener: (name, cb) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(cb); },
    removeEventListener: (name, cb) => listeners.get(name)?.delete(cb),
    dispatchEvent: event => { for (const cb of [...listeners.get(event.type) || []]) cb(event); }
  };
  const nav = { getInstalledRelatedApps: async () => related, userAgent: ua, platform: '', maxTouchPoints: 0, clipboard: { writeText: async () => {} },
    serviceWorker: { register: async () => { if (failWorker) throw new Error('registration rejected'); return {}; } } };
  const jsx = (type, props) => ({ type, props: props || {} });
  const context = vm.createContext({window:win, navigator:nav, Event, URL, console:{error(){}}, exports:{}, require:name => {
    if (name === 'react') return {useRef: initial => {const i=cursor++; if (!(i in slots)) slots[i]={current:initial};return slots[i];}, useState: initial => {const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i], value => {slots[i]=value;}];}, useEffect: cb=>effects.push(cb)};
    if (name === 'react/jsx-runtime') return {jsx, jsxs:jsx, Fragment:'fragment'};
    if (name === 'lucide-react') return {};
    throw new Error(name);
  }});
  vm.runInContext(bootstrap, context);
  if (early) win.dispatchEvent(early);
  vm.runInContext(source, context);
  const render = () => { cursor=0; return context.exports.PwaInstall(); };
  render(); const cleanup=effects.shift()(); frames.splice(0).forEach(cb=>cb()); effects.length=0;
  return {render, win, cleanup, listeners};
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const result=find(child,predicate); if (result) return result; }
  return null;
}
const button = h => find(h.render(), n=>n.type==='button');
const dialog = h => find(h.render(), n=>n.props.role==='dialog');
async function click(h) { button(h).props.onClick(); for(let i=0;i<8;i++) await Promise.resolve(); }
function promptEvent(outcome='dismissed', reject=false) {
  const event=new Event('beforeinstallprompt', {cancelable:true}); let calls=0;
  event.prompt=async()=>{calls++;if(reject)throw new Error('prompt unavailable');};
  event.userChoice=Promise.resolve({outcome}); event.calls=()=>calls; return event;
}
const help=harness();assert.equal(button(help).props.disabled,false);await click(help);assert.equal(dialog(help),null);assert.ok(find(help.render(),n=>n.props.role==='status'));
assert.ok(!button(help).props.className.includes('sm:hidden'), 'wide Android screens must retain the button');
const early=promptEvent('accepted');const ready=harness({early});await click(ready);assert.equal(early.calls(),1);assert.equal(ready.win.__aocInstall.prompt,null);assert.notEqual(ready.render(),null);
ready.win.dispatchEvent(new Event('appinstalled'));assert.equal(ready.render(),null);
const dismissed=promptEvent();const later=harness();later.win.dispatchEvent(dismissed);await click(later);await click(later);assert.equal(dismissed.calls(),1);assert.equal(dialog(later),null);
const rejected=promptEvent('dismissed',true);const failed=harness({early:rejected});await click(failed);assert.equal(dialog(failed),null);assert.ok(find(failed.render(),n=>n.props.role==='status'));
const webview=harness({ua:android.replace('Android 15','Android 15; wv')});await click(webview);assert.equal(dialog(webview),null);assert.ok(JSON.stringify(webview.render()).includes('Open this link in Android Chrome'));
assert.equal(harness({standalone:true}).render(),null);
const ios=harness({ua:'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1'});await click(ios);assert.ok(find(dialog(ios), n=>'data-ios-safari-install-guide' in n.props));
const broken=harness({failWorker:true});await Promise.resolve();await click(broken);assert.ok(JSON.stringify(broken.render()).includes('App setup could not finish'));
const before=later.listeners.get('aoc-install-ready').size;later.cleanup();assert.equal(later.listeners.get('aoc-install-ready').size,before-1);assert.equal(later.listeners.get('beforeinstallprompt').size,1);
// A rapid second tap uses the same rendered callback, before React can re-render.
const rapidEvent=promptEvent();const rapid=harness({early:rapidEvent});assert.equal(rapidEvent.calls(),0);
const handler=button(rapid).props.onClick;handler();assert.equal(rapidEvent.calls(),1);handler();assert.equal(rapidEvent.calls(),1);
for(let i=0;i<8;i++)await Promise.resolve();handler();assert.equal(rapidEvent.calls(),1);
// An event emitted while an older choice resolves must survive that completion.
let resolveChoice;const pending=promptEvent();pending.userChoice=new Promise(resolve=>{resolveChoice=resolve;});
const freshHarness=harness({early:pending});button(freshHarness).props.onClick();
const fresh=promptEvent();freshHarness.win.dispatchEvent(fresh);resolveChoice({outcome:'dismissed'});
for(let i=0;i<8;i++)await Promise.resolve();await click(freshHarness);assert.equal(fresh.calls(),1);
const installedTab=harness({related:[{platform:'webapp',url:'/manifest.webmanifest'}]});
for(let i=0;i<8;i++)await Promise.resolve();assert.equal(installedTab.render(),null);
const unrelated=harness({related:[{platform:'webapp',url:'https://other.example/manifest.webmanifest'}]});
for(let i=0;i<8;i++)await Promise.resolve();assert.notEqual(unrelated.render(),null);
console.log('PWA install behavioral checks passed: immediate tap, rapid taps, stale/fresh events, accepted/dismissed/error, no Android modal, installed normal tab, standalone, iOS and listener cleanup.');
// Exercise the existing worker lifecycle and routing without touching production storage.
const swHandlers=new Map(), cached=[], deleted=[];let claims=0;
const swContext=vm.createContext({URL, self:{location:{origin:'https://anesthetistoncall.in'},
  addEventListener:(name,cb)=>swHandlers.set(name,cb),clients:{claim:async()=>{claims++;}}},
  caches:{open:async()=>({addAll:async assets=>cached.push(...assets)}), keys:async()=>['aoc-public-shell-old','unrelated-cache'],delete:async name=>deleted.push(name),match:async()=>({offline:true})},
  fetch:async()=>{throw new Error('offline');}});
vm.runInContext(readFileSync('public/sw.js','utf8'),swContext);
let lifecycle;swHandlers.get('install')({waitUntil:promise=>{lifecycle=promise;}});await lifecycle;
for(const asset of cached)assert.ok(readFileSync(`public${asset}`).length,`Missing precache asset ${asset}`);
swHandlers.get('activate')({waitUntil:promise=>{lifecycle=promise;}});await lifecycle;
assert.equal(claims,1);assert.deepEqual(deleted,['aoc-public-shell-old']);
let response;swHandlers.get('fetch')({request:{url:'https://anesthetistoncall.in/login',method:'GET',mode:'navigate'},respondWith:promise=>{response=promise;}});assert.deepEqual(await response,{offline:true});
let intercepted=false;swHandlers.get('fetch')({request:{url:'https://anesthetistoncall.in/api/account',method:'GET',mode:'cors'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
console.log('Worker checks passed: complete precache, activation/client claim, app-only cache cleanup, offline navigation and API exclusion.');
