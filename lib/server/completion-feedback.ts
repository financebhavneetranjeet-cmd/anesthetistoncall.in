import { env } from "cloudflare:workers";
import { jsonError } from "./http";

export type FeedbackCase = {caseId:string; procedureName:string; hospitalName:string; completedAt:string; side:'anesthetist'|'hospital'|'surgeon'};

// The assigned clinician and the posting surgeon (otherwise the hospital owner)
// answer independently. An anaesthetist posting a replacement is not its provider.
export async function pendingCompletionFeedback(userId: string) {
  if (!env.DB) throw new Error("Database unavailable");
  const result = await env.DB.prepare(`SELECT c.id AS caseId,c.procedure_name AS procedureName,h.name AS hospitalName,
    COALESCE(c.completion_confirmed_at,c.closed_at,c.case_completed_at) AS completedAt,
    CASE WHEN c.assigned_clinician_user_id=? THEN 'anesthetist' WHEN poster.role='surgeon' THEN 'surgeon' ELSE 'hospital' END AS side
    FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users poster ON poster.id=c.posted_by_user_id
    WHERE c.status='completed' AND c.assigned_clinician_user_id IS NOT NULL
    AND c.feedback_required=1
    AND (?=c.assigned_clinician_user_id OR ?=CASE WHEN poster.role='surgeon' THEN c.posted_by_user_id ELSE h.owner_user_id END)
    AND NOT EXISTS(SELECT 1 FROM case_completion_feedback f WHERE f.case_id=c.id AND f.respondent_user_id=?)
    ORDER BY completedAt,c.id LIMIT 50`).bind(userId,userId,userId,userId).all<FeedbackCase>();
  return result.results;
}

export async function requireCompletionFeedback(userId: string) {
  const pending = await pendingCompletionFeedback(userId);
  return pending.length ? jsonError("Complete your post-case questions at /case-feedback before adding or responding to another case.",409,"CASE_FEEDBACK_REQUIRED") : null;
}
