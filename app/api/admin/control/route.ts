import { env } from "cloudflare:workers";
import { z } from "zod";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

const querySchema = z.object({ q: z.string().trim().max(80).default(""), role: z.enum(["all", "hospital", "anesthetist", "surgeon", "admin"]).default("all"), verificationStatus: z.enum(["all", "pending", "verified", "rejected"]).default("all"), accountStatus: z.enum(["all", "active", "suspended", "blocked"]).default("all"), caseStatus: z.enum(["all", "pending_approval", "open", "offered", "assigned", "cancelled", "completed"]).default("all") });

export async function GET(request: Request) {
  if (!(await isAdmin())) return jsonError("Admin access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(["q", "role", "verificationStatus", "accountStatus", "caseStatus"].map(k => [k, url.searchParams.get(k) ?? (k === "q" ? "" : "all")])));
  if (!parsed.success) return jsonError("Invalid filters.");
  const { q, role, verificationStatus, accountStatus, caseStatus } = parsed.data;
  const like = `%${q}%`;
  const verificationSql = "CASE WHEN u.role = 'hospital' THEN COALESCE(h.approval_status, 'pending') WHEN u.role IN ('anesthetist','surgeon') THEN COALESCE(cp.verification_status, 'pending') ELSE u.status END";
  const [users, cases, stats, roleCounts, deliveries, audit, accessAudit] = await Promise.all([
    env.DB.prepare(`SELECT u.id,u.full_name AS fullName,u.mobile,u.email,u.role,u.status,CASE WHEN u.status='suspended' THEN 'suspended' ELSE u.account_status END AS accountStatus,u.suspended_until AS suspendedUntil,u.created_at AS createdAt,h.name AS hospitalName,${verificationSql} AS verificationStatus FROM users u LEFT JOIN hospitals h ON h.owner_user_id=u.id LEFT JOIN clinician_profiles cp ON cp.user_id=u.id WHERE (?='all' OR u.role=?) AND (?='all' OR CASE WHEN u.status='suspended' THEN 'suspended' ELSE u.account_status END=?) AND (?='all' OR ${verificationSql}=?) AND (?='' OR u.full_name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ? OR h.name LIKE ?) ORDER BY u.created_at DESC LIMIT 100`).bind(role, role, accountStatus, accountStatus, verificationStatus, verificationStatus, q, like, like, like, like).all(),
    env.DB.prepare("SELECT c.id,c.procedure_name AS procedureName,c.status,c.urgency,c.scheduled_at AS scheduledAt,h.name AS hospitalName FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE (?='all' OR c.status=?) AND (?='' OR c.procedure_name LIKE ? OR h.name LIKE ?) ORDER BY c.created_at DESC LIMIT 100").bind(caseStatus, caseStatus, q, like, like).all(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM users WHERE status='suspended' OR account_status='suspended') AS suspendedUsers,(SELECT COUNT(*) FROM hospitals WHERE approval_status='pending') AS pendingHospitals,(SELECT COUNT(*) FROM clinician_profiles WHERE verification_status='pending') AS pendingClinicians,(SELECT COUNT(*) FROM cases WHERE status='pending_approval') AS pendingCases,(SELECT COUNT(*) FROM cases WHERE status='open') AS openCases,(SELECT COUNT(*) FROM cases WHERE status='assigned') AS assignedCases,(SELECT COUNT(*) FROM cases WHERE status='completed') AS completedCases").first(),
    env.DB.prepare("SELECT SUM(CASE WHEN role='hospital' THEN 1 ELSE 0 END) AS hospitals,SUM(CASE WHEN role='anesthetist' THEN 1 ELSE 0 END) AS anesthetists,SUM(CASE WHEN role='surgeon' THEN 1 ELSE 0 END) AS surgeons FROM users").first(),
    env.DB.prepare("SELECT d.id,d.channel,d.status,d.error_code AS errorCode,d.retry_count AS retryCount,d.attempted_at AS attemptedAt,n.title,n.case_id AS caseId FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id ORDER BY d.attempted_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT id,actor_email AS actorEmail,action,target_type AS targetType,target_id AS targetId,details,created_at AS createdAt FROM admin_audit_logs ORDER BY created_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT a.id,a.user_id AS userId,u.full_name AS userName,a.action,a.reason,a.admin_actor AS adminActor,a.previous_status AS previousStatus,a.new_status AS newStatus,a.suspension_expires_at AS suspensionExpiresAt,a.created_at AS createdAt FROM user_access_audit_logs a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100").all(),
  ]);
  return jsonOk({ stats, roleCounts, users: users.results, cases: cases.results, deliveries: deliveries.results, audit: audit.results, accessAudit: accessAudit.results });
}
