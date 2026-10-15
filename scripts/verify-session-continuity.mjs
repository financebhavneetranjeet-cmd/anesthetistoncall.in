import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync("components/auth/session-continuity.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
async function harness(path, standalone = false) {
  const effects = [], listeners = new Map(), states = [], redirects = [], calls = [];
  let cursor = 0, timer, reloads = 0, result = { status: 200, destination: "/cases" };
  const win = {
    location: { pathname: path, replace: value => redirects.push(value), reload: () => reloads++ },
    matchMedia: () => ({ matches: standalone }),
    setInterval: fn => { timer = fn; return 1; }, clearInterval: () => { timer = undefined; },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  };
  const doc = { visibilityState: "visible", addEventListener: win.addEventListener, removeEventListener: win.removeEventListener };
  const nav = { onLine: true };
  const jsx = (type, props) => ({ type, props });
  const context = vm.createContext({ window: win, document: doc, navigator: nav, exports: {},
    fetch: async (url, options) => { calls.push({ url, ...options }); if (result.fail) throw Error("offline"); return { status: result.status, ok: result.status === 200, json: async () => ({ redirectTo: result.destination }) }; },
    require: name => {
      if (name === "react") return { useEffect: fn => effects.push(fn), useState: value => { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      throw Error(name);
    },
  });
  vm.runInContext(source, context);
  const render = () => { cursor = 0; return context.exports.SessionContinuity(); };
  render(); const cleanup = effects.shift()(); await flush();
  return { win, doc, nav, redirects, calls, listeners, render, cleanup, reloads: () => reloads,
    async tick(next) { result = next; timer?.(); await flush(); } };
}
const pending = await harness("/account/pending");
assert.deepEqual(pending.redirects, ["/cases"], "approval should leave pending without another login");
const app = await harness("/", true);
assert.deepEqual(app.redirects, ["/cases"], "old installed launch URL should resume dashboard");
const browser = await harness("/");
assert.deepEqual(browser.redirects, [], "ordinary home page remains accessible");
await browser.tick({ fail: true }); assert.deepEqual(browser.redirects, [], "network failure must not log out");
browser.doc.visibilityState = "hidden"; const calls = browser.calls.length;
await browser.tick({ status: 200, destination: "/cases" }); assert.equal(browser.calls.length, calls);
browser.doc.visibilityState = "visible";
await browser.tick({ status: 401 }); assert.equal(browser.redirects.at(-1), "/login", "revocation redirects to login");
browser.listeners.get("pageshow")({ persisted: true }); assert.equal(browser.reloads(), 1);
const logout = await harness("/cases");
const button = logout.render().props.children.find(child => child?.type === "button");
button.props.onClick(); await flush();
assert.equal(logout.calls.at(-1).method, "DELETE"); assert.equal(logout.redirects.at(-1), "/login");
for (const h of [pending, app, browser, logout]) { h.cleanup(); assert.equal(h.listeners.size, 0); }
console.log("Session UI behavior passed: approval redirect, old PWA launch, public home, offline/hidden behavior, revocation, back-forward cache, logout and cleanup (browser events mocked).");
