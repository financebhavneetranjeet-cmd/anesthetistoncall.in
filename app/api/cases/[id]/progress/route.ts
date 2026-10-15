import { feeBreakdown } from "@/lib/fee-breakdown.mjs";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  getSessionUser,
  isApprovedHospital,
  isVerifiedClinician,
} from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { auditCase } from "@/lib/server/case-audit";
import { notifyUser } from "@/lib/server/notifications";

async function context(id: string) {
  return env
    .DB!.prepare(
      "SELECT c.id,c.status,c.hospital_id AS hospitalId,c.assigned_clinician_user_id AS clinicianId,c.offered_fee_paise AS postedFeePaise,c.final_agreed_fee_paise AS finalAgreedFeePaise,c.fee_locked_at AS feeLockedAt,c.duration_minutes AS estimatedDurationMinutes,c.actual_duration_minutes AS actualDurationMinutes,c.ot_status AS otStatus,c.arrived_at AS arrivedAt,c.ot_ready_at AS readyAt,c.case_started_at AS startedAt,c.case_completed_at AS completedAt,c.completion_requested_at AS completionRequestedAt,c.completion_confirmed_at AS completionConfirmedAt,h.owner_user_id AS hospitalOwnerId,hu.mobile AS hospitalMobile,cu.mobile AS clinicianMobile FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users hu ON hu.id=h.owner_user_id LEFT JOIN users cu ON cu.id=c.assigned_clinician_user_id WHERE c.id=?",
    )
    .bind(id)
    .first<Record<string, unknown>>();
}
function allowed(
  user: Awaited<ReturnType<typeof getSessionUser>>,
  row: Record<string, unknown>,
) {
  return (
    (isApprovedHospital(user) && user.hospitalId === row.hospitalId) ||
    (isVerifiedClinician(user) && user.id === row.clinicianId)
  );
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser(),
    { id } = await params,
    row = await context(id);
  if (!row) return jsonError("Case not found.", 404);
  if (!allowed(user, row))
    return jsonError("Assigned case access required.", 403);
  const [bid, rating, audit] = await Promise.all([
    env.DB.prepare(
      "SELECT proposed_fee_paise AS proposedFeePaise,response_type AS responseType FROM case_responses WHERE case_id=? AND clinician_user_id=? LIMIT 1",
    )
      .bind(id, row.clinicianId)
      .first(),
    env.DB.prepare(
      "SELECT rating,feedback FROM case_ratings WHERE case_id=? AND rater_user_id=? LIMIT 1",
    )
      .bind(id, user!.id)
      .first(),
    env.DB.prepare(
      "SELECT event_type AS eventType,details,created_at AS createdAt FROM case_audit_events WHERE case_id=? ORDER BY created_at ASC",
    )
      .bind(id)
      .all(),
  ]);
  return jsonOk({
    progress: row,
    bid: bid ? { ...bid, proposedFeePaise: row.finalAgreedFeePaise ?? feeBreakdown(row.postedFeePaise, bid.proposedFeePaise, bid.responseType).totalFeePaise } : null,
    rating: rating ?? null,
    audit: audit.results,
    viewer: user!.role,
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser(),
    { id } = await params,
    row = await context(id);
  if (!row) return jsonError("Case not found.", 404);
  if (!allowed(user, row))
    return jsonError("Assigned case access required.", 403);
  const parsed = z
    .object({
      action: z.enum(["ready", "start", "complete", "confirm_complete"]),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Valid progress action required.");
  const action = parsed.data.action;
  if (
    action === "complete" &&
    (!isVerifiedClinician(user) || user.id !== row.clinicianId)
  )
    return jsonError(
      "Only the assigned anaesthetist can request case completion.",
      403,
    );
  if (
    action === "confirm_complete" &&
    (!isApprovedHospital(user) || user.hospitalId !== row.hospitalId)
  )
    return jsonError("Only the case hospital can confirm completion.", 403);
  if (action === "ready") {
    const arrival = await env.DB.prepare(
      "SELECT arrived_at FROM case_journeys WHERE case_id=? AND status='arrived'",
    )
      .bind(id)
      .first();
    if (!arrival)
      return jsonError(
        "Verified arrival is required before Ready for OT.",
        409,
        "ARRIVAL_REQUIRED",
      );
  }
  const transitions = {
    ready: {
      from: "awaiting_arrival",
      to: "ready_for_ot",
      sql: "ot_status='ready_for_ot',arrived_at=COALESCE(arrived_at,(SELECT arrived_at FROM case_journeys WHERE case_id=cases.id)),ot_ready_at=CURRENT_TIMESTAMP",
      event: "ready_for_ot",
    },
    start: {
      from: "ready_for_ot",
      to: "case_started",
      sql: "ot_status='case_started',case_started_at=CURRENT_TIMESTAMP",
      event: "case_started",
    },
    complete: {
      from: "case_started",
      to: "completion_pending",
      sql: "ot_status='completion_pending',completion_requested_at=CURRENT_TIMESTAMP,completion_requested_by_user_id=?",
      event: "completion_requested",
    },
    confirm_complete: {
      from: "completion_pending",
      to: "case_completed",
      sql: "ot_status='case_completed',case_completed_at=completion_requested_at,actual_duration_minutes=MAX(1,CAST((julianday(completion_requested_at)-julianday(case_started_at))*1440 AS INTEGER)),completion_confirmed_at=CURRENT_TIMESTAMP,completion_confirmed_by_user_id=?,status='completed',closed_at=CURRENT_TIMESTAMP",
      event: "completion_confirmed",
    },
  } as const;
  const t = transitions[action],
    bindings =
      action === "complete" || action === "confirm_complete"
        ? [user!.id, id, t.from]
        : [id, t.from];
  const changed = await env.DB.prepare(
    `UPDATE cases SET ${t.sql} WHERE id=? AND ot_status=? AND assigned_clinician_user_id IS NOT NULL`,
  )
    .bind(...bindings)
    .run();
  if (!changed.meta.changes)
    return jsonError(
      `Case must be ${t.from.replaceAll("_", " ")} before this step.`,
      409,
      "INVALID_TRANSITION",
    );
  if (action === "confirm_complete")
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE case_journeys SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,latest_latitude=NULL,latest_longitude=NULL,route_polyline=NULL WHERE case_id=? AND status='active'",
      ).bind(id),
      env.DB.prepare(
        "DELETE FROM journey_locations WHERE journey_id=(SELECT id FROM case_journeys WHERE case_id=?)",
      ).bind(id),
    ]);
  await auditCase(id, user!.id, t.event);
  const target =
      user!.id === row.hospitalOwnerId ? row.clinicianId : row.hospitalOwnerId,
    mobile =
      user!.id === row.hospitalOwnerId
        ? row.clinicianMobile
        : row.hospitalMobile;
  if (target)
    await notifyUser({
      userId: String(target),
      caseId: id,
      kind: t.event,
      title:
        action === "confirm_complete"
          ? "Case completion confirmed"
          : action === "complete"
            ? "Please confirm case completion"
            : action === "start"
              ? "Case started"
              : "Ready for OT",
      body:
        action === "confirm_complete"
          ? "The hospital confirmed completion. The locked fee is now payable."
          : action === "complete"
            ? "The anaesthetist marked the case complete. Please confirm it to open billing."
            : action === "start"
              ? "The case has started in OT."
              : "The anaesthetist and OT are ready.",
      dedupeKey: `${t.event}:${id}`,
      mobile: mobile ? String(mobile) : null,
    });
  return jsonOk({ progress: { otStatus: t.to } });
}
