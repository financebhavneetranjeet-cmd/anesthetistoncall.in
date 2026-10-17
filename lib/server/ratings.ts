import { env } from "cloudflare:workers";
import { responseMetrics } from "./response-metrics";

export const REVIEW_EDIT_HOURS = 48;
export const ratingCategories = {
  hospital_to_anaesthetist: ["punctuality", "professionalism", "communication", "clinicalCoordination", "responsiveness", "overall"],
  anaesthetist_to_hospital: ["communication", "caseInformationAccuracy", "otTeamCoordination", "professionalism", "paymentReliability", "overall"],
} as const;

const piiPatterns = [
  /\b(?:patient|pt)\s*(?:name|phone|mobile|address|mrn|uhid|ipd|opd)\s*[:#-]/i,
  /\b(?:mrn|uhid|ipd|opd)\s*[:#-]?\s*[a-z0-9-]{3,}\b/i,
  /(?:\+?91[\s-]?)?[6-9]\d{9}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{1,5}\s+[\w .-]+(?:street|road|lane|colony|nagar|avenue|house)\b/i,
];

export function containsPatientIdentifier(text: string) {
  return piiPatterns.some((pattern) => pattern.test(text));
}

const pct = (n: number, d: number, fallback = 100) => d ? Math.round((n / d) * 100) : fallback;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function reliabilityFor(userId: string) {
  if (!env.DB) throw new Error("Database unavailable");
  const user = await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(userId).first<{role:string}>();
  if (!user) throw new Error("User not found");
  const isHospital = user.role === "hospital";
  const ownerFilter = isHospital ? "c.hospital_id IN (SELECT id FROM hospitals WHERE owner_user_id=?)" : "c.assigned_clinician_user_id=?";
  const responseStats = await responseMetrics(userId);
  const row = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.status='completed') completed,
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.status IN('completed','cancelled')) accepted,
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.status='cancelled') cancelled,
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.status='cancelled' AND (julianday(c.scheduled_at)-julianday(c.cancelled_at))*24<=2) lateCancelled,
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.status='assigned' AND datetime(c.scheduled_at,'+2 hours')<CURRENT_TIMESTAMP AND c.arrived_at IS NULL) noShows,
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.arrived_at IS NOT NULL) arrivals,
    (SELECT COUNT(*) FROM cases c WHERE ${ownerFilter} AND c.arrived_at IS NOT NULL AND datetime(c.arrived_at)<=datetime(COALESCE(c.required_arrival_at,c.scheduled_at),'+15 minutes')) onTime,
    (SELECT COUNT(*) FROM case_responses r WHERE r.clinician_user_id=? AND r.status!='withdrawn') responses,
    (SELECT COUNT(*) FROM notifications n WHERE n.user_id=? AND n.kind IN('case_open','sos_alert','planned_case')) alerts,
    (SELECT COUNT(*) FROM case_payments p WHERE ${isHospital ? "p.payer_user_id" : "p.payee_user_id"}=? ) payments,
    (SELECT COUNT(*) FROM case_payments p WHERE ${isHospital ? "p.payer_user_id" : "p.payee_user_id"}=? AND p.status='settled') settled,
    (SELECT COUNT(*) FROM case_payments p WHERE ${isHospital ? "p.payer_user_id" : "p.payee_user_id"}=? AND p.status='disputed') disputes,
    (SELECT AVG(r.rating) FROM case_ratings r WHERE r.rated_user_id=? AND r.status='published' AND r.privacy_flagged=0 AND r.excluded_from_score=0) avgRating,
    (SELECT COUNT(*) FROM case_ratings r WHERE r.rated_user_id=? AND r.status='published' AND r.privacy_flagged=0 AND r.excluded_from_score=0) ratingCount`).bind(
      userId,userId,userId,userId,userId,userId,userId,
      userId,userId,userId,userId,userId,userId,userId,
    ).first<any>();
  const completed=Number(row?.completed??0),accepted=Number(row?.accepted??0),cancelled=Number(row?.cancelled??0),arrivals=Number(row?.arrivals??0),ratings=Number(row?.ratingCount??0),payments=Number(row?.payments??0);
  const completionRate=accepted?pct(completed,accepted):null,punctuality=arrivals?pct(Number(row?.onTime??0),arrivals):null,responseRate=isHospital?null:responseStats.responseRate,paymentReliability=isHospital&&payments?pct(Number(row?.settled??0),payments):null;
  const rawAverage=Number(row?.avgRating??0);
  const adjustedRating=(ratings*rawAverage+5*4.5)/(ratings+5); // Bayesian prior prevents one review dominating.
  const ratingScore=adjustedRating/5*100;
  const measured: [number|null,number][] = [[completionRate,.30],[punctuality,.20],[responseRate,.10],[paymentReliability,.20],[ratings?ratingScore:null,.20]];
  const available=measured.filter((item): item is [number,number] => item[0]!=null);
  const weight=available.reduce((sum,item)=>sum+item[1],0);
  let score=weight?available.reduce((sum,item)=>sum+item[0]*item[1],0)/weight:0;
  score-=Math.min(15,Number(row?.lateCancelled??0)*3)+Math.min(25,Number(row?.noShows??0)*10)+Math.min(15,Number(row?.disputes??0)*4);
  score=clamp(score);
  return {score:completed>=5&&weight?score:null,rating:ratings?Number(rawAverage.toFixed(1)):0,ratingCount:ratings,completedCases:completed,completionRate,punctuality,paymentReliability,responseRate,cancellations:cancelled,lateCancellations:Number(row?.lateCancelled??0),noShows:Number(row?.noShows??0),paymentDisputes:Number(row?.disputes??0),dataState:completed<5?"Building history":"Established history",arrivalPerformance:arrivals<3?"Not enough data":(punctuality??0)>=95?"Excellent":(punctuality??0)>=85?"Good":"Needs improvement"};
}
