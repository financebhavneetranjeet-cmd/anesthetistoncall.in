import { env } from "cloudflare:workers";
import { getSessionUser, isVerifiedAnaesthetist } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedAnaesthetist(user)) return jsonError("Verified anaesthetist access required.", 403);
  const { id } = await params;
  const owner = await env.DB.prepare("SELECT h.owner_user_id AS id,u.mobile FROM cases c JOIN hospitals h ON h.id=c.hospital_id JOIN users u ON u.id=h.owner_user_id WHERE c.id=? AND c.status='offered' AND c.assigned_clinician_user_id=?").bind(id, user.id).first<{ id: string; mobile: string }>();
  if (!owner) return jsonError("Assignment offer not found.", 404);

  const reopened = await env.DB.prepare("UPDATE cases SET status='open',assigned_clinician_user_id=NULL,assigned_at=NULL,final_agreed_fee_paise=NULL,fee_locked_at=NULL WHERE id=? AND status='offered' AND assigned_clinician_user_id=?").bind(id, user.id).run();
  if (!reopened.meta.changes) return jsonError("Assignment offer is no longer pending.", 409);
  await env.DB.batch([
    env.DB.prepare("UPDATE case_responses SET status='declined',updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND clinician_user_id=? AND status='selected'").bind(id, user.id),
    env.DB.prepare("UPDATE case_responses SET status='available',updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND clinician_user_id<>? AND status='declined'").bind(id, user.id),
  ]);
  await notifyUser({ userId: owner.id, caseId: id, kind: "assignment_declined", title: "Assignment declined", body: `${user.fullName} declined the assignment. The case is open for another selection.`, dedupeKey: `assignment_declined:${id}:${user.id}`, mobile: owner.mobile });
  return jsonOk({ case: { id, status: "open" } });
}
