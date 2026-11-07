import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { jsonError,jsonOk } from "@/lib/server/http";
import { pendingCompletionFeedback } from "@/lib/server/completion-feedback";

const answer = z.enum(['yes','partly','no','not_observed']);
const fee = z.number().finite().min(0).max(1_000_000).refine(n => Math.abs(n*100-Math.round(n*100))<0.00001,'Use at most two decimal places.');
const anaesthetist = z.object({everythingReady:answer,equipmentProper:answer,durationMinutes:z.number().int().min(1).max(10080),feeReceivedRupees:fee}).strict();
const provider = z.object({arrivedOnTime:answer,workQuality:answer,notInHurry:answer,patientCare:answer,feeDemandedRupees:fee,feePaidRupees:fee}).strict();

export async function GET() {
  if (!env.DB) return jsonError('Database unavailable.',503);
  const user=await getSessionUser();
  if (!isVerifiedPlatformUser(user)) return jsonError('Verified member access required.',403);
  return jsonOk({pending:await pendingCompletionFeedback(user.id)});
}

export async function POST(request:Request) {
  if (!env.DB) return jsonError('Database unavailable.',503);
  const user=await getSessionUser();
  if (!isVerifiedPlatformUser(user)) return jsonError('Verified member access required.',403);
  const parsed=z.object({caseId:z.string().uuid(),answers:z.unknown()}).strict().safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return jsonError('Valid case and answers required.');
  const existing=await env.DB.prepare('SELECT id FROM case_completion_feedback WHERE case_id=? AND respondent_user_id=?').bind(parsed.data.caseId,user.id).first();
  if(existing) return jsonOk({saved:true,alreadySubmitted:true});
  const item=(await pendingCompletionFeedback(user.id)).find(c=>c.caseId===parsed.data.caseId);
  if(!item) return jsonError('A completed case requiring your feedback was not found.',403);
  const answers=(item.side==='anesthetist'?anaesthetist:provider).safeParse(parsed.data.answers);
  if(!answers.success) return jsonError('Answer every question and enter valid duration and fee amounts. Zero is allowed when no fee has been paid.');
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO case_completion_feedback(id,case_id,respondent_user_id,respondent_side,answers_json) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),item.caseId,user.id,item.side,JSON.stringify(answers.data)),
    env.DB.prepare("INSERT OR IGNORE INTO case_audit_events(id,case_id,actor_user_id,event_type,details) VALUES(?,?,?,'completion_feedback_submitted',?)").bind('completion-feedback:'+item.caseId+':'+user.id,item.caseId,user.id,JSON.stringify({side:item.side})),
  ]);
  return jsonOk({saved:true});
}
