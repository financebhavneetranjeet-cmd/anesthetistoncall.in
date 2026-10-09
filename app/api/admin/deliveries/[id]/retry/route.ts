import { env } from "cloudflare:workers";
import { sendCasePostedSms } from "@/lib/server/case-posted-sms";
import { sendHospitalApprovalSms } from "@/lib/server/hospital-approval-sms";
import { isAdmin } from "@/lib/server/admin";
import { recordAdminAudit } from "@/lib/server/audit";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return jsonError("Admin access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const { id } = await params;
  const row = await env.DB.prepare("SELECT d.channel,n.kind,n.body,u.mobile FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.user_id WHERE d.id=? AND d.status IN ('failed','skipped')")
    .bind(id).first<{ channel: string; kind: string; body: string; mobile: string }>();
  if (!row) return jsonError("Retryable delivery not found.", 404);
  if (row.channel !== "sms") return jsonError("WhatsApp retry will be enabled after its approved MSG91 template is connected.", 409, "CHANNEL_NOT_CONFIGURED");

  if (row.kind === "hospital_approved") {
    const status = await sendHospitalApprovalSms(id, true);
    await recordAdminAudit("delivery_retry", "notification_delivery", id, status);
    return status === "sent" || status === "sending" ? jsonOk({ delivery: { id, status } }) : jsonError(status === "skipped" ? "Configure the hospital approval SMS template before retrying." : "SMS was not accepted. Check the delivery log.", 503, "APPROVAL_SMS_UNAVAILABLE");
  }
  if (row.kind === "case_open") {
    const status = await sendCasePostedSms(id, true);
    await recordAdminAudit("delivery_retry", "notification_delivery", id, status);
    return status === "sent" || status === "sending" ? jsonOk({ delivery: { id, status } }) : jsonError(status === "skipped" ? "Configure the case-posted SMS template before retrying." : "Case SMS was not accepted. Check the delivery log.", 503, "CASE_SMS_UNAVAILABLE");
  }

  if (!env.MSG91_AUTH_KEY || !env.MSG91_FLOW_ID) return jsonError("MSG91 SMS configuration is required before retrying.", 503, "MSG91_NOT_CONFIGURED");
  try {
    const response = await fetch("https://api.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json" }, body: JSON.stringify({ template_id: env.MSG91_FLOW_ID, short_url: "0", recipients: [{ mobiles: `91${row.mobile}`, message: row.body }] }) });
    const data = await response.json().catch(() => ({})) as { request_id?: string; type?: string };
    const sent = response.ok && data.type !== "error";
    await env.DB.prepare("UPDATE notification_deliveries SET status=?,provider_request_id=?,error_code=?,retry_count=retry_count+1,attempted_at=CURRENT_TIMESTAMP WHERE id=?").bind(sent ? "sent" : "failed", data.request_id ?? null, sent ? null : `HTTP_${response.status}`, id).run();
    await recordAdminAudit("delivery_retry", "notification_delivery", id, sent ? "sent" : "failed");
    return sent ? jsonOk({ delivery: { id, status: "sent" } }) : jsonError("MSG91 rejected the retry.", 502, "DELIVERY_FAILED");
  } catch {
    await env.DB.prepare("UPDATE notification_deliveries SET status='failed',error_code='NETWORK_ERROR',retry_count=retry_count+1,attempted_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    return jsonError("Delivery retry failed.", 502, "NETWORK_ERROR");
  }
}
