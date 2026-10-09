import { env } from "cloudflare:workers";

export const approvalNoticeId = (hospitalId: string) => `hospital-approved:${hospitalId}`;

const maskedMobile = (mobile: string) => `******${mobile.slice(-4)}`;

function logApprovalSmsError(
  event: string,
  details: Record<string, string | number | boolean | null>,
) {
  // Keep provider credentials and the full mobile number out of Worker logs.
  console.error("Hospital approval SMS", { event, ...details });
}

export function approvalNoticeStatements(hospitalId: string, userId: string) {
  const db = env.DB!;
  const id = approvalNoticeId(hospitalId);
  return [
    db.prepare("INSERT OR IGNORE INTO notifications (id,user_id,kind,title,body,dedupe_key) SELECT ?,?,'hospital_approved','Hospital account approved','Your hospital account has been approved. You can now post cases.',? WHERE EXISTS (SELECT 1 FROM hospitals WHERE id=? AND approval_status='approved')").bind(id, userId, id, hospitalId),
    db.prepare("INSERT OR IGNORE INTO notification_deliveries (id,notification_id,channel,status,error_code) SELECT ?,id,'sms','skipped','SMS_PENDING' FROM notifications WHERE id=?").bind(`sms:${id}`, id),
    db.prepare("INSERT OR IGNORE INTO notification_deliveries (id,notification_id,channel,status) SELECT ?,id,'in_app','sent' FROM notifications WHERE id=?").bind(`in-app:${id}`, id),
  ];
}

export async function sendHospitalApprovalSms(deliveryId: string, retry = false): Promise<string> {
  if (!env.DB) {
    logApprovalSmsError("database_unavailable", { deliveryId, retry });
    return "failed";
  }
  const db = env.DB;
  const row = await db.prepare("SELECT d.status,d.error_code AS errorCode,u.mobile,u.full_name AS contactName,h.name AS hospitalName FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.user_id JOIN hospitals h ON h.owner_user_id=u.id AND n.id='hospital-approved:' || h.id WHERE d.id=? AND n.kind='hospital_approved' AND h.approval_status='approved' LIMIT 1")
    .bind(deliveryId).first<{ status: string; errorCode: string | null; mobile: string; contactName: string; hospitalName: string }>();
  if (!row) {
    logApprovalSmsError("delivery_not_found_or_account_not_approved", { deliveryId, retry });
    return "not_found";
  }
  if (!["failed", "skipped"].includes(row.status) || (!retry && row.errorCode !== "SMS_PENDING")) return row.status;
  let configError: string | null = !env.MSG91_AUTH_KEY || !env.MSG91_HOSPITAL_APPROVAL_TEMPLATE_ID ? "APPROVAL_SMS_NOT_CONFIGURED" : null;
  const values: Record<string, string> = { hospitalName: row.hospitalName, contactName: row.contactName, loginUrl: "https://anesthetistoncall.in/login" };
  const variables: Record<string, string> = {};
  try {
    const mapping: unknown = JSON.parse(env.MSG91_HOSPITAL_APPROVAL_VARIABLES ?? "{}");
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error();
    for (const [key, field] of Object.entries(mapping)) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || key === "mobiles" || typeof field !== "string" || !Object.hasOwn(values, field)) throw new Error();
      variables[key] = values[field];
    }
  } catch { configError = "APPROVAL_SMS_VARIABLES_INVALID"; }
  if (!/^[6-9]\d{9}$/.test(row.mobile)) configError = "INVALID_MOBILE";
  if (configError) {
    await db.prepare("UPDATE notification_deliveries SET status='skipped',error_code=?,attempted_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('failed','skipped')").bind(configError, deliveryId).run();
    logApprovalSmsError("not_sent", { deliveryId, retry, errorCode: configError, mobile: maskedMobile(row.mobile) });
    return "skipped";
  }
  // A single atomic claim prevents duplicate sends from concurrent approvals or retries.
  const claim = await db.prepare("UPDATE notification_deliveries SET status='sending',error_code=NULL,retry_count=retry_count+?,attempted_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('failed','skipped')").bind(retry ? 1 : 0, deliveryId).run();
  if (!claim.meta.changes) return "sending";
  let status = "failed"; let requestId: string | null = null; let errorCode: string | null = "NETWORK_ERROR";
  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST", headers: { authkey: env.MSG91_AUTH_KEY!, "content-type": "application/json" },
      body: JSON.stringify({ template_id: env.MSG91_HOSPITAL_APPROVAL_TEMPLATE_ID, short_url: "0", recipients: [{ ...variables, mobiles: `91${row.mobile}` }] }), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null) as { type?: string; request_id?: string; message?: string } | null;
    requestId = data?.request_id ?? (data?.type === "success" ? data.message ?? null : null);
    const accepted = response.ok && data?.type === "success" && typeof requestId === "string" && requestId.length > 0;
    status = accepted ? "sent" : "failed";
    errorCode = accepted ? null : response.ok ? "PROVIDER_REJECTED" : `HTTP_${response.status}`;
    if (!accepted) {
      logApprovalSmsError("provider_rejected", {
        deliveryId,
        retry,
        httpStatus: response.status,
        providerType: data?.type ?? null,
        mobile: maskedMobile(row.mobile),
      });
    }
  } catch (error) {
    // Preserve the approval; an administrator can retry the recorded failure.
    logApprovalSmsError("request_failed", {
      deliveryId,
      retry,
      errorName: error instanceof Error ? error.name : "unknown_error",
      mobile: maskedMobile(row.mobile),
    });
  }
  await db.prepare("UPDATE notification_deliveries SET status=?,provider_request_id=?,error_code=?,attempted_at=CURRENT_TIMESTAMP WHERE id=? AND status='sending'").bind(status, requestId, errorCode, deliveryId).run();
  return status;
}
