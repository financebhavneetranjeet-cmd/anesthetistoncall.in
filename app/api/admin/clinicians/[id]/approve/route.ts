import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";
import { recordAdminAudit } from "@/lib/server/audit";
import { z } from "zod";
import { sendWebPush } from "@/lib/server/web-push";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const { id } = await context.params;
  const parsed = z.object({ mode: z.enum(["verified", "manual", "failed", "unavailable"]).default("verified") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError("Invalid PMC verification result.", 400, "INVALID_VERIFICATION_RESULT");
  const mode = parsed.data.mode;
  const clinician = await env.DB.prepare(`SELECT cp.user_id AS userId, cp.pmc_verification_status AS pmcVerificationStatus, (SELECT COUNT(*) FROM verification_documents vd WHERE vd.user_id = cp.user_id AND vd.document_type = 'pmc_certificate') AS pmcCount FROM clinician_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.id = ? AND cp.verification_status = 'pending' AND u.status='pending' AND u.role IN ('anesthetist','surgeon') LIMIT 1`).bind(id).first<{ userId: string; pmcVerificationStatus: string; pmcCount: number }>();
  if (!clinician) return jsonError("Pending clinician not found.", 404, "NOT_FOUND");
  if (mode === "failed" || mode === "unavailable") {
    await env.DB.prepare("UPDATE clinician_profiles SET pmc_verification_status=?, pmc_verification_checked_at=CURRENT_TIMESTAMP, pmc_verification_note=? WHERE id=?").bind(mode, "PMC verification could not be completed; manual certificate review required.", id).run();
    return jsonOk({ clinician: { id, verificationStatus: "pending", pmcVerificationStatus: mode, certificateRequired: true } });
  }
  if (mode === "manual" && clinician.pmcCount < 1) return jsonError("PMC certificate must be uploaded before manual approval.", 409, "PMC_DOCUMENT_REQUIRED");
  const pmcStatus = mode === "manual" ? "manual" : "success";
  await env.DB.batch([
    env.DB.prepare("UPDATE clinician_profiles SET verification_status='verified', pmc_verification_status=?, pmc_verification_checked_at=CURRENT_TIMESTAMP, pmc_verification_note=? WHERE id=?").bind(pmcStatus, mode === "manual" ? "Certificate reviewed by administrator." : "PMC registration verified by administrator.", id),
    env.DB.prepare("UPDATE users SET status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status='pending'").bind(clinician.userId),
  ]);
  await recordAdminAudit("clinician_approved", "clinician", id);
  const noticeId = `clinician-approved:${id}`;
  const title = "Account approved";
  const body = "Your clinical account has been approved. You can now use your dashboard.";
  await env.DB.prepare("INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,dedupe_key) VALUES(?,?,'clinician_approved',?,?,?)")
    .bind(noticeId, clinician.userId, title, body, noticeId).run();
  try {
    await sendWebPush(clinician.userId, { title, body, url: "/cases", tag: noticeId }, noticeId);
  } catch (error) {
    console.error("Clinician approval push failed", error instanceof Error ? error.name : "unknown_error");
  }
  return jsonOk({ clinician: { id, verificationStatus: "verified", pmcVerificationStatus: pmcStatus } });
}
