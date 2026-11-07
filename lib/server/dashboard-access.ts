import { env } from "cloudflare:workers";
import { isAdminMobile } from "./login";
import type { SessionUser } from "./session";
import { DASHBOARD_ROLES, type DashboardRole } from "@/lib/dashboard-roles";
export type { DashboardRole } from "@/lib/dashboard-roles";

export async function dashboardAccounts(user: Pick<SessionUser, "mobile" | "role">): Promise<Partial<Record<DashboardRole, string>>> {
  if (!env.DB || !DASHBOARD_ROLES.some(role => role === user.role)) return {};
  const rows = await env.DB.prepare(`SELECT u.id, u.role, u.status, u.account_status AS accountStatus,
      cp.id AS clinicianId, cp.verification_status AS verificationStatus,
      h.id AS hospitalId, h.approval_status AS hospitalApprovalStatus
    FROM users u LEFT JOIN clinician_profiles cp ON cp.user_id = u.id
    LEFT JOIN hospitals h ON h.owner_user_id = u.id
    WHERE u.mobile = ? AND u.role IN ('admin', 'anesthetist', 'surgeon', 'hospital')`).bind(user.mobile).all<{
      id: string; role: DashboardRole; status: string; accountStatus: string;
      clinicianId: string | null; verificationStatus: string | null;
      hospitalId: string | null; hospitalApprovalStatus: string | null;
    }>();
  const accounts: Partial<Record<DashboardRole, string>> = {};
  for (const row of rows.results) {
    if (row.accountStatus !== "active" || row.status !== "verified") continue;
    if (row.role === "admin" && isAdminMobile(user.mobile)) accounts.admin = row.id;
    if ((row.role === "anesthetist" || row.role === "surgeon") && row.clinicianId && row.verificationStatus === "verified") accounts[row.role] = row.id;
    if (row.role === "hospital" && row.hospitalId && row.hospitalApprovalStatus === "approved") accounts.hospital = row.id;
  }
  return accounts;
}
