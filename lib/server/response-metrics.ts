import { env } from "cloudflare:workers";

// Both counts use the same distinct case cohort. Repeated alerts and responses
// to cases discovered without an alert must not inflate the response rate.
export const RESPONSE_METRICS_SQL = `WITH alerted AS (
  SELECT DISTINCT case_id FROM notifications
  WHERE user_id=? AND kind IN ('case_open','sos_alert','planned_case')
    AND case_id IS NOT NULL
)
SELECT COUNT(*) AS eligibleAlerts,
  COALESCE(SUM(CASE WHEN EXISTS (
    SELECT 1 FROM case_responses r
    WHERE r.case_id=alerted.case_id AND r.clinician_user_id=?
      AND r.status!='withdrawn'
  ) THEN 1 ELSE 0 END),0) AS respondedAlerts
FROM alerted`;

export async function responseMetrics(userId: string) {
  if (!env.DB) throw new Error("Database unavailable");
  const row = await env.DB.prepare(RESPONSE_METRICS_SQL).bind(userId, userId)
    .first<{ eligibleAlerts: number; respondedAlerts: number }>();
  const eligibleAlerts = Number(row?.eligibleAlerts ?? 0);
  const respondedAlerts = Number(row?.respondedAlerts ?? 0);
  return { eligibleAlerts, respondedAlerts, responseRate: eligibleAlerts
    ? Math.round(respondedAlerts / eligibleAlerts * 100) : null };
}
