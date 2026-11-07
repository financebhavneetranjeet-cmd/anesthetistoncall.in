import { env, waitUntil } from "cloudflare:workers";
import { CASE_DASHBOARD_WINDOW_SQL } from "@/lib/server/case-dashboard-window";
import { jsonError, jsonOk } from "@/lib/server/http";
import { getSessionUser, isApprovedHospital } from "@/lib/server/session";
import { sendWebPush } from "@/lib/server/web-push";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isApprovedHospital(user)) return jsonError("Approved hospital access required.", 403);
  const { id } = await params;
  const input = await request.json().catch(() => null) as { responseId?: unknown } | null;
  if (typeof input?.responseId !== "string" || !input.responseId || input.responseId.length > 100) {
    return jsonError("Choose an anaesthetist response.");
  }

  const title = "Hospital requested your attention";
  const body = "A hospital would like to contact you about a case you responded to. Open Anesthetist on Call for details.";
  const notificationId = crypto.randomUUID();
  const saved = await env.DB.prepare(`
    INSERT OR IGNORE INTO notifications (id, user_id, case_id, kind, title, body, dedupe_key)
    SELECT ?, u.id, c.id, 'responder_contact', ?, ?, 'responder-contact:' || c.id || ':' || u.id
    FROM cases c
    JOIN hospitals h ON h.id = c.hospital_id
    JOIN case_responses r ON r.case_id = c.id
    JOIN users u ON u.id = r.clinician_user_id
    JOIN clinician_profiles cp ON cp.user_id = u.id
    WHERE c.id = ? AND h.owner_user_id = ? AND r.id = ?
      AND c.status = 'open' AND ${CASE_DASHBOARD_WINDOW_SQL}
      AND r.status = 'available' AND u.role = 'anesthetist' AND u.status = 'verified'
      AND COALESCE(u.account_status, 'active') = 'active' AND cp.verification_status = 'verified'
    RETURNING user_id AS userId
  `).bind(notificationId, title, body, id, user.id, input.responseId).first<{ userId: string }>();

  if (!saved) return jsonError("A notification has already been sent, or this response is no longer available.", 409);
  waitUntil(sendWebPush(saved.userId, { title, body, url: "/notifications", tag: notificationId }, notificationId, false).catch(error => {
    console.error("Responder contact push failed", error instanceof Error ? error.name : "UNKNOWN");
  }));
  return jsonOk({ notificationId }, 201);
}
