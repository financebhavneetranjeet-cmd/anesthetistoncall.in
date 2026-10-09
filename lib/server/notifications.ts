import { env } from "cloudflare:workers";
import { sendWebPush } from "@/lib/server/web-push";

type NoticeInput = { userId: string; caseId: string; kind: string; title: string; body: string; dedupeKey: string; mobile?: string | null };

export async function notifyUser(input: NoticeInput): Promise<{ created: boolean; notificationId: string | null }> {
  if (!env.DB) return { created: false, notificationId: null };
  const id = crypto.randomUUID();
  const result = await env.DB.prepare("INSERT OR IGNORE INTO notifications (id, user_id, case_id, kind, title, body, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, input.userId, input.caseId, input.kind, input.title, input.body, input.dedupeKey).run();
  if (!result.meta.changes) return { created: false, notificationId: null };
  const deliveries = [env.DB.prepare("INSERT INTO notification_deliveries (id, notification_id, channel, status) VALUES (?, ?, 'in_app', 'sent')").bind(crypto.randomUUID(), id), env.DB.prepare("INSERT INTO notification_deliveries (id, notification_id, channel, status, error_code) VALUES (?, ?, 'whatsapp', 'skipped', ?)").bind(crypto.randomUUID(), id, env.MSG91_WHATSAPP_TEMPLATE_ID ? "WHATSAPP_DELIVERY_NOT_ENABLED" : "MSG91_WHATSAPP_NOT_CONFIGURED")];
  if (!input.mobile || !env.MSG91_AUTH_KEY || !env.MSG91_FLOW_ID) {
    deliveries.push(env.DB.prepare("INSERT INTO notification_deliveries (id, notification_id, channel, status, error_code) VALUES (?, ?, 'sms', 'skipped', 'MSG91_NOT_CONFIGURED')").bind(crypto.randomUUID(), id));
    await env.DB.batch(deliveries);
    await sendWebPush(input.userId, { title: input.title, body: input.body, url: `/cases#case-${input.caseId}`, tag: id }, id);
    return { created: true, notificationId: id };
  }
  await env.DB.batch(deliveries);
  await sendWebPush(input.userId, { title: input.title, body: input.body, url: `/cases#case-${input.caseId}`, tag: id }, id);
  try {
    const response = await fetch("https://api.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json" }, body: JSON.stringify({ template_id: env.MSG91_FLOW_ID, short_url: "0", recipients: [{ mobiles: `91${input.mobile}`, message: input.body }] }) });
    const data = await response.json().catch(() => ({})) as { request_id?: string; type?: string };
    await env.DB.prepare("INSERT INTO notification_deliveries (id, notification_id, channel, status, provider_request_id, error_code) VALUES (?, ?, 'sms', ?, ?, ?)").bind(crypto.randomUUID(), id, response.ok && data.type !== "error" ? "sent" : "failed", data.request_id ?? null, response.ok ? null : `HTTP_${response.status}`).run();
  } catch { await env.DB.prepare("INSERT INTO notification_deliveries (id, notification_id, channel, status, error_code) VALUES (?, ?, 'sms', 'failed', 'NETWORK_ERROR')").bind(crypto.randomUUID(), id).run(); }
  return { created: true, notificationId: id };
}
