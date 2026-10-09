import { env } from "cloudflare:workers";

const maskedMobile = (mobile: string) => `******${mobile.slice(-4)}`;

function logCaseSmsError(event: string, details: Record<string, string | number | boolean | null>) {
  console.error("Case notification SMS", { event, ...details });
}

type CaseSmsRow = {
  deliveryId: string;
  status: string;
  errorCode: string | null;
  mobile: string;
  procedureName: string;
  specialty: string | null;
  hospitalName: string;
  location: string | null;
  scheduledAt: string;
  urgency: string;
  offeredFeePaise: number;
};

function templateVariables(row: CaseSmsRow) {
  const values: Record<string, string> = {
    procedureName: row.procedureName,
    specialty: row.specialty ?? "Not specified",
    hospitalName: row.hospitalName,
    location: row.location ?? row.hospitalName,
    scheduledAt: new Date(row.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    urgency: row.urgency,
    offeredFee: String(Math.round(row.offeredFeePaise / 100)),
    caseUrl: "https://anesthetistoncall.in/cases",
  };
  const variables: Record<string, string> = {};
  const mapping: unknown = JSON.parse(env.MSG91_CASE_POSTED_VARIABLES ?? "{}");
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error("CASE_SMS_VARIABLES_INVALID");
  for (const [providerVariable, logicalField] of Object.entries(mapping)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(providerVariable) || providerVariable === "mobiles" || typeof logicalField !== "string" || !Object.hasOwn(values, logicalField)) {
      throw new Error("CASE_SMS_VARIABLES_INVALID");
    }
    variables[providerVariable] = values[logicalField];
  }
  return variables;
}

export async function sendCasePostedSms(deliveryId: string, retry = false): Promise<string> {
  if (!env.DB) return "failed";
  const db = env.DB;
  const row = await db.prepare(`SELECT d.id AS deliveryId,d.status,d.error_code AS errorCode,u.mobile,c.procedure_name AS procedureName,
    c.specialty,h.name AS hospitalName,c.location,c.scheduled_at AS scheduledAt,c.urgency,c.offered_fee_paise AS offeredFeePaise
    FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.user_id
    JOIN cases c ON c.id=n.case_id JOIN hospitals h ON h.id=c.hospital_id
    WHERE d.id=? AND d.channel='sms' AND n.kind='case_open' LIMIT 1`)
    .bind(deliveryId).first<CaseSmsRow>();
  if (!row) return "not_found";
  if (!['failed', 'skipped'].includes(row.status) || (!retry && row.errorCode !== "SMS_PENDING")) return row.status;

  let configError: string | null = !env.MSG91_AUTH_KEY || !env.MSG91_CASE_POSTED_TEMPLATE_ID ? "CASE_SMS_NOT_CONFIGURED" : null;
  let variables: Record<string, string> = {};
  try { variables = templateVariables(row); }
  catch { configError = "CASE_SMS_VARIABLES_INVALID"; }
  if (!/^[6-9]\d{9}$/.test(row.mobile)) configError = "INVALID_MOBILE";
  if (configError) {
    await db.prepare("UPDATE notification_deliveries SET status='skipped',error_code=?,attempted_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('failed','skipped')").bind(configError, deliveryId).run();
    logCaseSmsError("not_sent", { deliveryId, retry, errorCode: configError, mobile: maskedMobile(row.mobile) });
    return "skipped";
  }

  const claim = await db.prepare("UPDATE notification_deliveries SET status='sending',error_code=NULL,retry_count=retry_count+?,attempted_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('failed','skipped')").bind(retry ? 1 : 0, deliveryId).run();
  if (!claim.meta.changes) return "sending";
  let status = "failed"; let requestId: string | null = null; let errorCode: string | null = "NETWORK_ERROR";
  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: env.MSG91_AUTH_KEY!, "content-type": "application/json" },
      body: JSON.stringify({ template_id: env.MSG91_CASE_POSTED_TEMPLATE_ID, short_url: "0", recipients: [{ ...variables, mobiles: `91${row.mobile}` }] }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => null) as { type?: string; request_id?: string; message?: string } | null;
    requestId = data?.request_id ?? (data?.type === "success" ? data.message ?? null : null);
    const accepted = response.ok && data?.type === "success" && Boolean(requestId);
    status = accepted ? "sent" : "failed";
    errorCode = accepted ? null : response.ok ? "PROVIDER_REJECTED" : `HTTP_${response.status}`;
    if (!accepted) logCaseSmsError("provider_rejected", { deliveryId, retry, httpStatus: response.status, providerType: data?.type ?? null, mobile: maskedMobile(row.mobile) });
  } catch (error) {
    logCaseSmsError("request_failed", { deliveryId, retry, errorName: error instanceof Error ? error.name : "unknown_error", mobile: maskedMobile(row.mobile) });
  }
  await db.prepare("UPDATE notification_deliveries SET status=?,provider_request_id=?,error_code=?,attempted_at=CURRENT_TIMESTAMP WHERE id=? AND status='sending'").bind(status, requestId, errorCode, deliveryId).run();
  return status;
}

export async function sendCasePostedSmsForCase(caseId: string) {
  if (!env.DB) return;
  const deliveries = await env.DB.prepare("SELECT d.id FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.case_id=? AND n.kind='case_open' AND d.channel='sms' AND d.status='skipped' AND d.error_code='SMS_PENDING'").bind(caseId).all<{ id: string }>();
  await Promise.allSettled(deliveries.results.map(({ id }) => sendCasePostedSms(id)));
}
