import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { containsPatientIdentifier, reliabilityFor, REVIEW_EDIT_HOURS } from "@/lib/server/ratings";

const stars=z.number().int().min(1).max(5);
const submission=z.object({caseId:z.string().uuid(),overall:stars,feedback:z.string().trim().max(800).optional(),punctuality:stars.optional(),professionalism:stars,communication:stars,clinicalCoordination:stars.optional(),responsiveness:stars.optional(),caseInformationAccuracy:stars.optional(),otTeamCoordination:stars.optional(),paymentReliability:stars.optional()});

export async function GET(request:Request){
  const viewer=await getSessionUser();if(!isVerifiedPlatformUser(viewer))return jsonError("Verified member access required.",403);if(!env.DB)return jsonError("Database unavailable.",503);
  const requested=new URL(request.url).searchParams.get("userId"),target=requested??viewer.id;
  const [received,given,summary,eligible]=await Promise.all([
    env.DB.prepare(`SELECT r.id,r.case_id AS caseId,r.rating,r.feedback,r.direction,r.created_at AS createdAt,r.updated_at AS updatedAt,r.status,r.privacy_flagged AS privacyFlagged,u.full_name AS reviewerName,c.procedure_name AS procedureName FROM case_ratings r JOIN users u ON u.id=r.rater_user_id JOIN cases c ON c.id=r.case_id WHERE r.rated_user_id=? AND r.status='published' AND r.privacy_flagged=0 ORDER BY r.created_at DESC LIMIT 100`).bind(target).all(),
    target===viewer.id?env.DB.prepare(`SELECT r.id,r.case_id AS caseId,r.rating,r.feedback,r.direction,r.created_at AS createdAt,r.edit_expires_at AS editExpiresAt,r.status,u.full_name AS reviewedName FROM case_ratings r JOIN users u ON u.id=r.rated_user_id WHERE r.rater_user_id=? ORDER BY r.created_at DESC LIMIT 100`).bind(viewer.id).all():Promise.resolve({results:[]}),
    reliabilityFor(target),
    target===viewer.id?env.DB.prepare(`SELECT c.id AS caseId,c.procedure_name AS procedureName,c.case_completed_at AS completedAt,CASE WHEN ?=h.owner_user_id THEN au.full_name ELSE h.name END AS counterpart,CASE WHEN ?=h.owner_user_id THEN 'hospital_to_anaesthetist' ELSE 'anaesthetist_to_hospital' END AS direction FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users au ON au.id=c.assigned_clinician_user_id LEFT JOIN case_ratings r ON r.case_id=c.id AND r.rater_user_id=? WHERE c.status='completed' AND c.completion_confirmed_at IS NOT NULL AND (?=h.owner_user_id OR ?=c.assigned_clinician_user_id) AND r.id IS NULL ORDER BY c.case_completed_at DESC LIMIT 30`).bind(viewer.id,viewer.id,viewer.id,viewer.id,viewer.id).all():Promise.resolve({results:[]}),
  ]);
  return jsonOk({received:received.results,given:given.results,eligible:eligible.results,summary,viewerId:viewer.id});
}

export async function POST(request:Request){
  const viewer=await getSessionUser();if(!isVerifiedPlatformUser(viewer)||viewer.role==='surgeon'||viewer.role==='admin')return jsonError("Only the case hospital or assigned anaesthetist may rate.",403);if(!env.DB)return jsonError("Database unavailable.",503);
  const body=await request.json().catch(()=>null);
  if(body?.action==='report'){
    const parsed=z.object({action:z.literal('report'),ratingId:z.string().uuid(),reason:z.string().trim().min(5).max(500)}).safeParse(body);if(!parsed.success)return jsonError("Please provide a valid report reason.");
    const review=await env.DB.prepare("SELECT case_id AS caseId,rater_user_id AS raterId,rated_user_id AS ratedId FROM case_ratings WHERE id=?").bind(parsed.data.ratingId).first<any>();if(!review||![review.raterId,review.ratedId].includes(viewer.id))return jsonError("Only a party to this verified case may report the review.",403);
    await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO review_reports(id,rating_id,reported_by_user_id,reason) VALUES(?,?,?,?)").bind(crypto.randomUUID(),parsed.data.ratingId,viewer.id,parsed.data.reason),env.DB.prepare("UPDATE case_ratings SET disputed_at=CURRENT_TIMESTAMP,dispute_reason=? WHERE id=?").bind(parsed.data.reason,parsed.data.ratingId),env.DB.prepare("INSERT INTO review_audit_events(id,rating_id,case_id,actor_user_id,actor_role,action,details) VALUES(?,?,?,?,?,'reported',?)").bind(crypto.randomUUID(),parsed.data.ratingId,review.caseId,viewer.id,viewer.role,JSON.stringify({reason:parsed.data.reason}))]);return jsonOk({reported:true});
  }
  const parsed=submission.safeParse(body);if(!parsed.success)return jsonError(parsed.error.issues[0]?.message??"Valid ratings required.");
  const c=await env.DB.prepare(`SELECT c.id,c.assigned_clinician_user_id AS anaesthetistId,h.owner_user_id AS hospitalUserId FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.id=? AND c.status='completed' AND c.completion_confirmed_at IS NOT NULL`).bind(parsed.data.caseId).first<any>();
  if(!c)return jsonError("Ratings are available only after a confirmed completed case.",409);
  const direction=viewer.id===c.hospitalUserId?'hospital_to_anaesthetist':viewer.id===c.anaesthetistId?'anaesthetist_to_hospital':null;if(!direction)return jsonError("You did not participate in this case.",403);
  const ratedId=direction==='hospital_to_anaesthetist'?c.anaesthetistId:c.hospitalUserId;if(ratedId===viewer.id)return jsonError("Self-ratings are not allowed.",403);
  if(direction==='hospital_to_anaesthetist'&&(!parsed.data.punctuality||!parsed.data.clinicalCoordination||!parsed.data.responsiveness))return jsonError("Complete all anaesthetist rating categories.");
  if(direction==='anaesthetist_to_hospital'&&(!parsed.data.caseInformationAccuracy||!parsed.data.otTeamCoordination||!parsed.data.paymentReliability))return jsonError("Complete all hospital rating categories.");
  const existing=await env.DB.prepare("SELECT id,edit_expires_at AS editExpiresAt FROM case_ratings WHERE case_id=? AND rater_user_id=?").bind(c.id,viewer.id).first<any>();if(existing&&new Date(existing.editExpiresAt).getTime()<Date.now())return jsonError("This verified rating is locked after the 48-hour edit period.",409);
  const feedback=parsed.data.feedback??'',privacy=containsPatientIdentifier(feedback),status=privacy?'hidden':'published',id=existing?.id??crypto.randomUUID(),expires=new Date(Date.now()+REVIEW_EDIT_HOURS*3600000).toISOString();
  const values=[parsed.data.overall,feedback||null,parsed.data.punctuality??null,parsed.data.communication,parsed.data.clinicalCoordination??parsed.data.otTeamCoordination??null,parsed.data.responsiveness??null,parsed.data.caseInformationAccuracy??null,parsed.data.paymentReliability??null,parsed.data.professionalism,direction,status,privacy?1:0];
  if(existing)await env.DB.prepare(`UPDATE case_ratings SET rating=?,feedback=?,punctuality_rating=?,communication_rating=?,clinical_coordination_rating=?,responsiveness_rating=?,case_information_accuracy_rating=?,payment_reliability_rating=?,professional_conduct_rating=?,direction=?,status=?,privacy_flagged=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values,id).run();
  else await env.DB.prepare(`INSERT INTO case_ratings(id,case_id,rater_user_id,rated_user_id,rating,feedback,punctuality_rating,communication_rating,clinical_coordination_rating,responsiveness_rating,case_information_accuracy_rating,payment_reliability_rating,professional_conduct_rating,direction,status,privacy_flagged,edit_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,c.id,viewer.id,ratedId,...values,expires).run();
  await env.DB.prepare("INSERT INTO review_audit_events(id,rating_id,case_id,actor_user_id,actor_role,action,details) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,c.id,viewer.id,viewer.role,existing?'edited':'created',JSON.stringify({privacyFlagged:privacy,direction})).run();
  if(privacy)await env.DB.prepare("INSERT INTO performance_flags(id,user_id,case_id,flag_type,details) VALUES(?,?,?,'review_privacy_flag',?)").bind(crypto.randomUUID(),viewer.id,c.id,"Review withheld because it may contain patient-identifying information.").run();
  const pairActivity=await env.DB.prepare("SELECT COUNT(*) AS count FROM case_ratings WHERE ((rater_user_id=? AND rated_user_id=?) OR (rater_user_id=? AND rated_user_id=?)) AND datetime(created_at)>=datetime('now','-24 hours')").bind(viewer.id,ratedId,ratedId,viewer.id).first<{count:number}>();
  if(Number(pairActivity?.count??0)>=5)await env.DB.prepare("INSERT INTO performance_flags(id,user_id,case_id,flag_type,details) VALUES(?,?,?,'suspicious_rating_activity',?)").bind(crypto.randomUUID(),viewer.id,c.id,"Unusually frequent reciprocal verified-case rating activity detected for Admin review.").run();
  return jsonOk({rating:{id,status,verifiedCase:true,privacyFlagged:privacy},message:privacy?"Saved for moderation. The written review is not public because it may contain patient-identifying information.":"Verified Case review saved."},existing?200:201);
}
