import { env } from "cloudflare:workers";

export type LoginUser = {
  id: string;
  role: string;
  status: string;
  accountStatus: "active" | "suspended" | "blocked";
  hospitalApprovalStatus: string | null;
  clinicianVerificationStatus: string | null;
};

export function isAdminMobile(mobile: string): boolean {
  return (env.ADMIN_MOBILES ?? "").split(",").map(value => value.trim()).filter(value => /^[6-9]\d{9}$/.test(value)).includes(mobile);
}

// Call only after server-side OTP verification. Public registration cannot choose Admin.
export async function findLoginUser(mobile: string, role?: "hospital" | "anesthetist" | "surgeon" | "admin", provisionAdmin = true) {
  if (!env.DB) return null;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET account_status='active', suspended_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE mobile=? AND account_status='suspended' AND suspended_until IS NOT NULL AND datetime(suspended_until) <= CURRENT_TIMESTAMP").bind(mobile),
    env.DB.prepare("INSERT INTO user_access_audit_logs(id,user_id,action,reason,admin_actor,previous_status,new_status) SELECT ?,id,'restore','Temporary suspension expired automatically.','system','suspended','active' FROM users WHERE mobile=? AND account_status='active' AND suspended_until IS NULL AND EXISTS (SELECT 1 FROM user_access_audit_logs l WHERE l.user_id=users.id AND l.new_status='suspended' AND l.suspension_expires_at IS NOT NULL AND datetime(l.suspension_expires_at) <= CURRENT_TIMESTAMP AND NOT EXISTS (SELECT 1 FROM user_access_audit_logs r WHERE r.user_id=users.id AND r.action='restore' AND r.created_at >= l.created_at))").bind(crypto.randomUUID(), mobile),
  ]);
  if (isAdminMobile(mobile)) {
    if (provisionAdmin) await env.DB.prepare("INSERT INTO users (id, mobile, full_name, role, status, account_status) VALUES (?, ?, 'Administrator', 'admin', 'verified', 'active') ON CONFLICT(mobile, role) DO UPDATE SET status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE users.account_status = 'active'").bind(crypto.randomUUID(), mobile).run();
    role = "admin";
  }
  if (!role) {
    const matches = await env.DB.prepare(`SELECT u.id, u.role, u.status, CASE WHEN u.status = 'suspended' THEN 'suspended' ELSE u.account_status END AS accountStatus,
      h.approval_status AS hospitalApprovalStatus,
      cp.verification_status AS clinicianVerificationStatus
      FROM users u
      LEFT JOIN hospitals h ON h.owner_user_id = u.id
      LEFT JOIN clinician_profiles cp ON cp.user_id = u.id
      WHERE u.mobile = ? LIMIT 2`).bind(mobile).all<LoginUser>();
    return matches.results.length === 1 ? matches.results[0] : null;
  }
  return env.DB.prepare(`SELECT u.id, u.role, u.status, CASE WHEN u.status = 'suspended' THEN 'suspended' ELSE u.account_status END AS accountStatus,
    h.approval_status AS hospitalApprovalStatus,
    cp.verification_status AS clinicianVerificationStatus
    FROM users u
    LEFT JOIN hospitals h ON h.owner_user_id = u.id
    LEFT JOIN clinician_profiles cp ON cp.user_id = u.id
    WHERE u.mobile = ? AND u.role = ? LIMIT 1`).bind(mobile, role).first<LoginUser>();
}

export function loginAllowed(user: LoginUser | null, mobile: string): boolean {
  return Boolean(user && user.accountStatus === "active" && (user.role !== "admin" || (user.status === "verified" && isAdminMobile(mobile))));
}

export function loginDeniedMessage(user: LoginUser | null): { message: string; code: string } {
  if (user?.accountStatus === "blocked") return { message: "Your account has been blocked by the administrator. Please contact support.", code: "ACCOUNT_BLOCKED" };
  if (user?.accountStatus === "suspended") return { message: "Your account is temporarily suspended. Please try again after the suspension period or contact support.", code: "ACCOUNT_SUSPENDED" };
  return { message: "This account cannot sign in. Please contact the administrator.", code: "LOGIN_UNAVAILABLE" };
}

export function postLoginDestination(user: LoginUser): "/admin" | "/cases" | "/account/pending" {
  if (user.role === "admin") return "/admin";
  if (user.status !== "verified") return "/account/pending";
  if (user.role === "hospital" && user.hospitalApprovalStatus !== "approved") return "/account/pending";
  if ((user.role === "anesthetist" || user.role === "surgeon") && user.clinicianVerificationStatus !== "verified") return "/account/pending";
  return "/cases";
}
