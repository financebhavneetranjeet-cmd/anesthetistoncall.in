import { getSessionUser, switchSessionUser } from "@/lib/server/session";
import { dashboardAccounts, type DashboardRole } from "@/lib/server/dashboard-access";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Please sign in again.", 401, "LOGIN_REQUIRED");
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return jsonError("Invalid request origin.", 403, "INVALID_ORIGIN");
  const body = await request.json().catch(() => null) as { role?: DashboardRole } | null;
  if (body?.role !== "admin" && body?.role !== "anesthetist") return jsonError("Invalid dashboard.");
  const accounts = await dashboardAccounts(user);
  const targetId = accounts[body.role];
  if (!targetId) return jsonError("You do not have access to this dashboard.", 403, "DASHBOARD_FORBIDDEN");
  if (targetId !== user.id && !(await switchSessionUser(targetId))) return jsonError("Please sign in again.", 401, "SESSION_EXPIRED");
  return jsonOk({ redirectTo: body.role === "admin" ? "/admin" : "/cases" });
}
