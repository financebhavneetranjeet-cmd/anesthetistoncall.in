import { env } from 'cloudflare:workers';
import { CASE_DASHBOARD_WINDOW_SQL } from '@/lib/server/case-dashboard-window';
import { alertEligibleAnaesthetists } from './emergency';

export const smsEventId = (caseId: string, userId: string, action: string) => `case-sms:${caseId}:${userId}:${action}`;

export async function smsFollowup(caseId: string, userId: string) {
  const rows = await env.DB!.prepare("SELECT event_type,details FROM case_audit_events WHERE case_id=? AND actor_user_id=? AND id IN (?,?,?)")
    .bind(caseId, userId, ...['availability','unavailable','urgent'].map(action => smsEventId(caseId,userId,action))).all<{event_type:string;details:string}>();
  return { opened: rows.results.some(r=>r.event_type==='availability_sms_opened'), unavailable: rows.results.some(r=>r.event_type==='unavailable_sms_opened'), urgent: rows.results.some(r=>r.event_type==='urgent_search_requested') };
}

// D1 batches are transactional. The unique audit ID is also an idempotency key;
// the random claim token keeps concurrent/retried requests from applying changes twice.
export async function recordSmsAction(caseId: string, userId: string, action: 'availability'|'unavailable'|'urgent') {
  const db=env.DB!, eventId=smsEventId(caseId,userId,action), claim=crypto.randomUUID();
  const active=await db.prepare(`SELECT c.id FROM cases c WHERE c.id=? AND c.status='open' AND c.assigned_clinician_user_id IS NULL AND ${CASE_DASHBOARD_WINDOW_SQL}`).bind(caseId).first();
  if(!active)return false;
  const openedId=smsEventId(caseId,userId,'availability');
  const eventType={availability:'availability_sms_opened',unavailable:'unavailable_sms_opened',urgent:'urgent_search_requested'}[action];
  const statements=[db.prepare(`INSERT OR IGNORE INTO case_audit_events(id,case_id,actor_user_id,event_type,details)
    SELECT ?,c.id,?,?,json_object('claim',?,'offerVersion',COALESCE(c.sos_offer_version,1)+1)
    FROM cases c WHERE c.id=? AND c.status='open' AND c.assigned_clinician_user_id IS NULL AND ${CASE_DASHBOARD_WINDOW_SQL}
    AND EXISTS (SELECT 1 FROM case_responses r WHERE r.case_id=c.id AND r.clinician_user_id=? AND (r.status='available' OR (?<>'availability' AND r.status='withdrawn')))
    AND (?='availability' OR EXISTS(SELECT 1 FROM case_audit_events WHERE id=?))`)
    .bind(eventId,userId,eventType,claim,caseId,userId,action,action,openedId)];
  const owns="EXISTS(SELECT 1 FROM case_audit_events WHERE id=? AND json_extract(details,'$.claim')=?)";
  if(action!=='availability') statements.push(db.prepare(`UPDATE case_responses SET status='withdrawn',updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND clinician_user_id=? AND ${owns}`).bind(caseId,userId,eventId,claim));
  if(action==='urgent') statements.push(db.prepare(`UPDATE cases SET is_emergency=1,sos_status='searching',sos_offer_version=COALESCE(sos_offer_version,1)+1,sos_search_radius_km=MAX(COALESCE(sos_search_radius_km,15),15),sos_expires_at=datetime('now','+5 minutes'),sos_last_alerted_at=CURRENT_TIMESTAMP WHERE id=? AND ${owns}`).bind(caseId,eventId,claim));
  if(action!=='availability') statements.push(db.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,case_id,kind,title,body,dedupe_key)
    SELECT ?,h.owner_user_id,c.id,'bid_withdrawn',?,u.full_name||?,? FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users u ON u.id=? WHERE c.id=? AND ${owns}`)
    .bind(eventId,action==='urgent'?'Urgent anaesthetist search started':'Anaesthetist cannot attend',action==='urgent'?' cannot attend. An urgent search for another anaesthetist has started.':' cannot attend and has withdrawn their availability.',eventId,userId,caseId,eventId,claim));
  await db.batch(statements);
  const event=await db.prepare('SELECT details FROM case_audit_events WHERE id=?').bind(eventId).first<{details:string}>();
  if(!event) return false;
  if(action==='urgent') {
    // Safe to retry: notifications and push deliveries have their own unique claims.
    const c=await db.prepare("SELECT c.status,c.procedure_name AS procedure,h.name AS hospital FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id=?").bind(caseId).first<{status:string;procedure:string;hospital:string}>();
    if(c?.status==='open') await alertEligibleAnaesthetists(caseId,JSON.parse(event.details).offerVersion,`${c.hospital}: ${c.procedure}. Another anaesthetist is required urgently.`,userId);
  }
  return true;
}
