import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { verifiedGoogleIdentity } from "./google-token";
import { getSessionUser, createSession } from "./session";
import { findLoginUser, loginAllowed, postLoginDestination } from "./login";
import { dashboardAccounts } from "./dashboard-access";

const FLOW_COOKIE = "__Host-aoc_google";
type Role = "hospital" | "anesthetist" | "surgeon";
type Flow = { id: string; purpose: string; role: Role; user_id: string | null; session_hash: string | null };
const callbackDefault = "https://anesthetistoncall.in/api/auth/google/callback";
export function googleConfigured() { return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET); }
const callbackUri = () => env.GOOGLE_OAUTH_REDIRECT_URI || callbackDefault;
const random = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
async function hash(value: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function pkce(value: string) { return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function sessionHash() { const token = (await cookies()).get("aoc_session")?.value; return token ? hash(token) : null; }
function redirect(request: Request, path: string) { return new Response(null, { status: 303, headers: { Location: new URL(path, request.url).href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
async function rateLimit(request: Request) {
  const bucket = Math.floor(Date.now() / 3600000);
  const id = await hash(`google:${request.headers.get("CF-Connecting-IP") ?? "local"}:${bucket}`);
  return Boolean(await env.DB!.prepare("INSERT INTO google_auth_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<30 RETURNING id")
    .bind(id, new Date((bucket + 2) * 3600000).toISOString()).first());
}
export async function googleLinked(mobile: string) {
  return env.DB!.prepare("SELECT email FROM google_identities WHERE mobile=?").bind(mobile).first<{ email: string }>();
}

export async function beginGoogle(request: Request) {
  if (!env.DB || !googleConfigured()) return redirect(request, "/login?google=unavailable");
  if (request.headers.get("Origin") !== new URL(request.url).origin || new URL(callbackUri()).origin !== new URL(request.url).origin) return redirect(request, "/login?google=failed");
  if (!await rateLimit(request)) return redirect(request, "/login?google=limited");
  const data = await request.formData();
  const purpose = data.get("purpose") === "link" ? "link" : "login";
  const selected = data.get("role");
  const role: Role = selected === "anesthetist" || selected === "surgeon" ? selected : "hospital";
  const user = purpose === "link" ? await getSessionUser() : null;
  if (purpose === "link" && (!user || !["pending", "verified"].includes(user.status))) return redirect(request, "/login?google=link-required");
  if (user && await googleLinked(user.mobile)) return redirect(request, "/account/google?google=linked");
  const state = random(), verifier = random();
  const jar = await cookies();
  const oldState = jar.get(FLOW_COOKIE)?.value.split(".")[0];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM google_auth_flows WHERE id IN (SELECT id FROM google_auth_flows WHERE datetime(expires_at)<CURRENT_TIMESTAMP LIMIT 100)"),
    env.DB.prepare("DELETE FROM google_auth_limits WHERE id IN (SELECT id FROM google_auth_limits WHERE datetime(expires_at)<CURRENT_TIMESTAMP LIMIT 100)"),
    env.DB.prepare("UPDATE google_auth_flows SET consumed_at=CURRENT_TIMESTAMP WHERE id=?").bind(await hash(oldState ?? "")),
    env.DB.prepare("INSERT INTO google_auth_flows(id,browser_hash,purpose,role,user_id,session_hash,expires_at) VALUES(?,?,?,?,?,?,?)")
      .bind(await hash(state), await hash(verifier), purpose, role, user?.id ?? null, user ? await sessionHash() : null, new Date(Date.now() + 600000).toISOString()),
  ]);
  jar.set(FLOW_COOKIE, `${state}.${verifier}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: callbackUri(), response_type: "code", scope: "openid email", state, nonce: await hash(`nonce:${verifier}`), code_challenge: await pkce(verifier), code_challenge_method: "S256", prompt: "select_account" }).toString();
  return redirect(request, url.href);
}

export async function finishGoogle(request: Request) {
  const fail = (code = "failed") => redirect(request, `/login?google=${code}`);
  if (!env.DB || !googleConfigured()) return fail("unavailable");
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const [state, verifier] = (jar.get(FLOW_COOKIE)?.value ?? "").split(".");
  jar.set(FLOW_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  if (!state || !verifier || state !== params.get("state") || !/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(verifier)) return fail();
  // Single atomic claim before exchange prevents concurrent callback replay.
  const flow = await env.DB.prepare("UPDATE google_auth_flows SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND browser_hash=? AND consumed_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP RETURNING *")
    .bind(await hash(state), await hash(verifier)).first<Flow>();
  if (!flow) return fail();
  if (params.has("error")) return fail("cancelled");
  const code = params.get("code");
  if (!code || code.length > 4096) return fail();
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: callbackUri() }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return fail();
    const tokens = await response.json() as { id_token?: string };
    if (!tokens.id_token) return fail();
    const identity = await verifiedGoogleIdentity(tokens.id_token, env.GOOGLE_OAUTH_CLIENT_ID!, await hash(`nonce:${verifier}`));
    if (flow.purpose === "link") {
      const user = await getSessionUser();
      if (!user || user.id !== flow.user_id || !["pending", "verified"].includes(user.status) || await sessionHash() !== flow.session_hash) return fail("link-required");
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO google_identities(subject,mobile,email,linked_by_user_id) SELECT ?,?,?,id FROM users WHERE id=? AND mobile=? AND account_status='active' AND status IN ('pending','verified')")
          .bind(identity.subject, user.mobile, identity.email, user.id, user.mobile),
        env.DB.prepare("UPDATE users SET email=?,updated_at=CURRENT_TIMESTAMP WHERE mobile=? AND EXISTS(SELECT 1 FROM google_identities WHERE subject=? AND mobile=users.mobile AND email=?)")
          .bind(identity.email, user.mobile, identity.subject, identity.email),
      ]);
      const linked = await env.DB.prepare("SELECT mobile FROM google_identities WHERE subject=? AND email=?").bind(identity.subject, identity.email).first<{ mobile: string }>();
      return linked?.mobile === user.mobile ? redirect(request, "/account/google?google=linked") : fail("link-failed");
    }
    const linked = await env.DB.prepare("SELECT mobile FROM google_identities WHERE subject=?").bind(identity.subject).first<{ mobile: string }>();
    if (!linked) return fail("link-required");
    const user = await findLoginUser(linked.mobile, flow.role, false);
    if (!user || !loginAllowed(user, linked.mobile) || !["pending", "verified"].includes(user.status)) return fail("restricted");
    const accounts = await dashboardAccounts({ mobile: linked.mobile, role: user.role });
    await createSession(user.id);
    return redirect(request, accounts.admin && accounts.anesthetist ? "/choose-dashboard" : postLoginDestination(user));
  } catch {
    // Do not log codes, ID/access tokens, email addresses, or provider responses.
    return fail();
  }
}
