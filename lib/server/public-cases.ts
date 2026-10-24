import { CASE_DASHBOARD_WINDOW_SQL } from "@/lib/server/case-dashboard-window";
import { env } from "cloudflare:workers";

export type PublicCaseSummary = {
  specialty: string | null;
  anaesthesiaType: string;
  hospitalName: string;
  city: string;
  scheduledAt: string;
  offeredFeePaise: number;
  urgency: string;
  durationMinutes: number | null;
};

// Explicit public projection: no patient details, notes, phone numbers, exact
// locations, member identities, bids, or account IDs may cross this boundary.
export async function getPublicCases(): Promise<PublicCaseSummary[]> {
  if (!env.DB) throw new Error("Public cases unavailable");
  const result = await env.DB.prepare(`SELECT c.specialty, c.anaesthesia_type AS anaesthesiaType,
      h.name AS hospitalName, h.city, c.scheduled_at AS scheduledAt,
      c.offered_fee_paise AS offeredFeePaise, c.urgency, c.duration_minutes AS durationMinutes
    FROM cases c JOIN hospitals h ON h.id = c.hospital_id
    JOIN users owner ON owner.id = h.owner_user_id
    LEFT JOIN users poster ON poster.id = c.posted_by_user_id
    WHERE ${CASE_DASHBOARD_WINDOW_SQL} AND c.status = 'open' AND c.assigned_clinician_user_id IS NULL
      AND datetime(c.scheduled_at) > CURRENT_TIMESTAMP
      AND h.approval_status = 'approved' AND owner.status = 'verified' AND owner.account_status = 'active'
      AND (c.posted_by_user_id IS NULL OR (poster.status = 'verified' AND poster.account_status = 'active'))
      AND (c.is_emergency = 0 OR (c.sos_status = 'searching' AND datetime(c.sos_expires_at) > CURRENT_TIMESTAMP))
    ORDER BY c.scheduled_at ASC LIMIT 50`).all<PublicCaseSummary>();
  return result.results;
}
