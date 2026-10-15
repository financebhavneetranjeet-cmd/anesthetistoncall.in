import { env } from "cloudflare:workers";
import { getAdminIdentity } from "@/lib/server/admin";
import { isAdminMobile } from "@/lib/server/login";
import { jsonError, jsonOk } from "@/lib/server/http";
import { sendWebPush } from "@/lib/server/web-push";

// Optional short-lived service access can only send this fixed test to approved
// admins. It grants no access to other admin operations or arbitrary recipients.
async function hasTestAccess(request: Request) {
  if (!env.PUSH_TEST_ACCESS) return false;
  try {
    const access = JSON.parse(env.PUSH_TEST_ACCESS) as { sha256: string; expiresAt: string };
    if (!(Date.parse(access.expiresAt) > Date.now())) return false;
    const bearer = request.headers.get("authorization") ?? "";
    if (!/^Bearer [a-f0-9]{64}$/.test(bearer)) return false;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer.slice(7)));
    const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
    return hash === access.sha256;
  } catch { return false; }
}

export async function POST(request: Request) {
  const service = await hasTestAccess(request);
  const admin = service ? null : await getAdminIdentity();
  if (!service && !admin) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!service && request.headers.get("origin") !== new URL(request.url).origin)
    return jsonError("Open this action from the admin dashboard.", 403, "INVALID_ORIGIN");
  if (!env.DB || !env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY)
    return jsonError("Push notifications are not configured on the server.", 503, "PUSH_NOT_CONFIGURED");

  // One atomic claim per minute prevents concurrent clicks or retries flooding devices.
  const id = `admin-push-test:${Math.floor(Date.now() / 60_000)}`;
  const actor = admin?.actor ?? "push-test-service";
  const claimed = await env.DB.prepare("INSERT OR IGNORE INTO admin_audit_logs(id,actor_email,action,target_type,target_id,details) VALUES(?,?,'push_test','admin_notifications',?,'sending')")
    .bind(id, actor, id).run();
  if (!claimed.meta.changes) return jsonError("A test was already requested this minute. Please wait a minute.", 429, "TEST_RATE_LIMITED");

  try {
    const rows = await env.DB.prepare("SELECT id,mobile FROM users WHERE role='admin' AND status='verified' AND account_status='active'")
      .all<{ id: string; mobile: string }>();
    const admins = rows.results.filter(row => isAdminMobile(row.mobile));
    const result = { admins: admins.length, attempted: 0, accepted: 0, failed: 0, expired: 0, errors: [] as string[] };
    for (const recipient of admins) {
      const sent = await sendWebPush(recipient.id, {
        title: "Anesthetist on Call — test notification",
        body: "Owner/admin push test. This device can receive alerts for new registrations and approval requests.",
        url: "/admin", tag: id,
      }, undefined, false);
      result.attempted += sent.attempted;
      result.accepted += sent.accepted;
      result.failed += sent.failed;
      result.expired += sent.expired;
      result.errors.push(...sent.errors);
    }
    result.errors = [...new Set(result.errors)];
    await env.DB.prepare("UPDATE admin_audit_logs SET details=? WHERE id=?").bind(JSON.stringify(result), id).run();
    return jsonOk({ result, message: result.accepted
      ? `Push service accepted ${result.accepted} test notification(s). Check your device; display is not confirmed by the server.`
      : result.attempted ? "No test notifications were accepted. Re-enable notifications if subscriptions expired."
        : "No subscribed admin devices found. Sign in with your admin account and enable notifications on this device." });
  } catch {
    await env.DB.prepare("UPDATE admin_audit_logs SET details='PUSH_TEST_FAILED' WHERE id=?").bind(id).run();
    return jsonError("The push test failed. Please check server configuration and try again.", 502, "PUSH_TEST_FAILED");
  }
}
