export const DASHBOARD_ROLES = ["anesthetist", "surgeon", "hospital", "admin"] as const;
export type DashboardRole = typeof DASHBOARD_ROLES[number];
export const DASHBOARD_LABELS: Record<DashboardRole, string> = {
  admin: "Admin Controls", anesthetist: "Anaesthetist Dashboard", surgeon: "Surgeon Dashboard", hospital: "Hospital Dashboard",
};
