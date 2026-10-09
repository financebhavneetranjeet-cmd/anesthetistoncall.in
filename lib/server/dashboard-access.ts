import { env } from "cloudflare:workers";
import { isAdminMobile } from "./login";
import type { SessionUser } from "./session";

export type DashboardRole = "admin" | "anesthetist";

export async function dashboardAccounts(user: Pick<SessionUser, "mobile" | "role">): Promise<Partial<Record<DashboardRole, string>>> {
  if (!env.DB || !["admin", "anesthetist"].includes(user.role)) return {};
  const rows = await env.DB.prepare(`SELECT u.id, u.role, u.status, u.account_status AS accountStatus,
      cp.id AS clinicianId, cp.verification_status AS verificationStatus
    FROM users u LEFT JOIN clinician_profiles cp ON cp.user_id = u.id
    WHERE u.mobile = ? AND u.role IN ('admin', 'anesthetist')`).bind(user.mobile).all<{
      id: string; role: DashboardRole; status: string; accountStatus: string;
      clinicianId: string | null; verificationStatus: string | null;
    }>();
  const accounts: Partial<Record<DashboardRole, string>> = {};
  for (const row of rows.results) {
    if (row.accountStatus !== "active" || row.status !== "verified") continue;
    if (row.role === "admin" && isAdminMobile(user.mobile)) accounts.admin = row.id;
    if (row.role === "anesthetist" && row.clinicianId && row.verificationStatus === "verified") accounts.anesthetist = row.id;
  }
  return accounts;
}
