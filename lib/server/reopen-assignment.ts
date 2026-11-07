import { env } from 'cloudflare:workers';

// The guarded audit insert claims this transition inside a single D1 transaction.
export async function reopenAssignment(caseId: string, userId: string, reason = 'cannot_attend') {
  const db = env.DB!;
  const eventId = crypto.randomUUID();
  const claimed = `EXISTS (SELECT 1 FROM case_audit_events WHERE id=?)`;
  const result = await db.batch([
    db.prepare(`INSERT INTO case_audit_events(id,case_id,actor_user_id,event_type,details)
      SELECT ?,id,?,'assignment_declined_reopened',? FROM cases
      WHERE id=? AND assigned_clinician_user_id=? AND status IN ('offered','assigned')
      AND case_started_at IS NULL AND case_completed_at IS NULL`)
      .bind(eventId,userId,JSON.stringify({reason,clinicianUserId:userId}),caseId,userId),
    db.prepare(`INSERT INTO case_assignment_history(id,case_id,clinician_user_id,assignment_type,status,final_fee_paise,assigned_at,ended_at,end_reason)
      SELECT ?,id,assigned_clinician_user_id,'original','cancelled',final_agreed_fee_paise,COALESCE(assigned_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP,? FROM cases WHERE id=? AND ${claimed}`)
      .bind(eventId,reason,caseId,eventId),
    db.prepare(`UPDATE case_responses SET status='withdrawn',updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND ${claimed}`).bind(caseId,eventId),
    db.prepare(`UPDATE case_journeys SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,latest_latitude=NULL,latest_longitude=NULL,route_polyline=NULL WHERE case_id=? AND status='active' AND ${claimed}`).bind(caseId,eventId),
    db.prepare(`DELETE FROM journey_locations WHERE journey_id IN (SELECT id FROM case_journeys WHERE case_id=?) AND ${claimed}`).bind(caseId,eventId),
    db.prepare(`DELETE FROM case_journeys WHERE case_id=? AND ${claimed}`).bind(caseId,eventId),
    db.prepare(`INSERT INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key)
      SELECT ?||':'||u.id,u.id,c.id,'assignment_declined','Case reopened','The selected anaesthetist cannot attend. This same case is open again for fresh responses.',?||':'||u.id
      FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users u ON (u.id=h.owner_user_id OR u.id=c.posted_by_user_id)
      WHERE c.id=? AND ${claimed}`).bind(eventId,eventId,caseId,eventId),
    db.prepare(`UPDATE cases SET status='open',assigned_clinician_user_id=NULL,assigned_at=NULL,final_agreed_fee_paise=NULL,fee_locked_at=NULL,
      booking_status=CASE WHEN is_planned=1 THEN 'requested' ELSE booking_status END,
      sos_status=CASE WHEN is_emergency=1 THEN 'searching' ELSE sos_status END,
      ot_status='awaiting_arrival',arrived_at=NULL,ot_ready_at=NULL,cancelled_at=NULL,cancelled_by_user_id=NULL,cancellation_reason=NULL
      WHERE id=? AND ${claimed}`).bind(caseId,eventId),
  ]);
  return Boolean(result[0].meta.changes);
}
