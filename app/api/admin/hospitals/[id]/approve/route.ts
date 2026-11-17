import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";
import { recordAdminAudit } from "@/lib/server/audit";
import { approvalNoticeId, approvalNoticeStatements, sendHospitalApprovalSms } from "@/lib/server/hospital-approval-sms";
import { sendWebPush } from "@/lib/server/web-push";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const { id } = await context.params;
  const hospital = await env.DB.prepare("SELECT h.owner_user_id AS ownerUserId, u.previous_account_id IS NOT NULL AS reregistered, EXISTS (SELECT 1 FROM verification_documents vd WHERE vd.user_id=u.id AND vd.document_type='facility_registration') AS hasDocument FROM hospitals h JOIN users u ON u.id=h.owner_user_id WHERE h.id = ? AND h.approval_status = 'pending' AND u.status='pending' AND u.account_status='active' AND NOT EXISTS (SELECT 1 FROM mobile_security_bans b WHERE b.mobile=u.mobile AND b.cleared_at IS NULL) AND u.role='hospital' LIMIT 1").bind(id).first<{ ownerUserId: string; reregistered: number; hasDocument: number }>();
  if (!hospital) return jsonError("Pending hospital not found.", 404, "NOT_FOUND");
  if (hospital.reregistered && !hospital.hasDocument) return jsonError("A new facility registration document is required.", 409, "FACILITY_DOCUMENT_REQUIRED");
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE hospitals SET approval_status = 'approved' WHERE id = ? AND approval_status = 'pending' AND EXISTS (SELECT 1 FROM users u WHERE u.id=hospitals.owner_user_id AND u.status='pending' AND u.account_status='active' AND NOT EXISTS (SELECT 1 FROM mobile_security_bans b WHERE b.mobile=u.mobile AND b.cleared_at IS NULL))").bind(id),
    env.DB.prepare("UPDATE users SET status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND changes()>0 AND EXISTS (SELECT 1 FROM hospitals WHERE id=? AND approval_status='approved')").bind(hospital.ownerUserId, id),
    ...approvalNoticeStatements(id, hospital.ownerUserId),
  ]);
  if (result[0].meta.changes) {
    await recordAdminAudit("hospital_approved", "hospital", id);
    const noticeId = approvalNoticeId(id);
    try {
      await sendWebPush(hospital.ownerUserId, {
        title: "Hospital account approved",
        body: "Your hospital account has been approved. You can now post cases.",
        url: "/cases", tag: noticeId,
      }, noticeId);
    } catch (error) {
      console.error("Hospital approval push failed", error instanceof Error ? error.name : "unknown_error");
    }
  }
  if (!result[0].meta.changes) return jsonError("Application status changed. Refresh and retry.", 409);
  const smsStatus = await sendHospitalApprovalSms(`sms:${approvalNoticeId(id)}`);
  return jsonOk({ hospital: { id, approvalStatus: "approved" }, smsStatus });
}
