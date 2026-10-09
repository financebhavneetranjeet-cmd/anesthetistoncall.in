import { env } from "cloudflare:workers";
import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser();
  if (!isVerifiedPlatformUser(user))
    return jsonError("Verified account required.", 403);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO case_payments(id,case_id,payer_user_id,payee_user_id,total_amount_paise,status,due_at) SELECT lower(hex(randomblob(16))),c.id,h.owner_user_id,c.assigned_clinician_user_id,c.final_agreed_fee_paise,'due',COALESCE(c.case_completed_at,CURRENT_TIMESTAMP) FROM cases c JOIN hospitals h ON h.id=c.hospital_id WHERE c.status='completed' AND c.final_agreed_fee_paise IS NOT NULL AND c.assigned_clinician_user_id IS NOT NULL",
  ).run();
  const where =
      user.role === "admin"
        ? "1=1"
        : user.role === "hospital"
          ? "p.payer_user_id=?"
          : "p.payee_user_id=?",
    result = await env.DB.prepare(
      `SELECT p.id,p.case_id AS caseId,p.total_amount_paise AS totalAmountPaise,p.confirmed_amount_paise AS confirmedAmountPaise,(p.total_amount_paise-p.confirmed_amount_paise) AS balanceAmountPaise,p.status,p.due_at AS dueAt,p.settled_at AS settledAt,c.procedure_name AS procedureName,c.case_completed_at AS completedAt,h.name AS hospitalName,cu.full_name AS clinicianName,CASE WHEN p.status<>'settled' AND julianday('now')-julianday(p.due_at)>=7 THEN 1 ELSE 0 END AS overdue FROM case_payments p JOIN cases c ON c.id=p.case_id JOIN hospitals h ON h.id=c.hospital_id JOIN users cu ON cu.id=p.payee_user_id WHERE ${where} ORDER BY CASE WHEN p.status='settled' THEN 1 ELSE 0 END,p.due_at DESC`,
    )
      .bind(...(user.role === "admin" ? [] : [user.id]))
      .all();
  const pending = (
    result.results as Array<{ balanceAmountPaise: number; status: string }>
  )
    .filter((x) => x.status !== "settled")
    .reduce((n, x) => n + x.balanceAmountPaise, 0);
  const rows = result.results as Array<{
    totalAmountPaise: number;
    confirmedAmountPaise: number;
    balanceAmountPaise: number;
    status: string;
    completedAt: string;
    hospitalName: string;
    clinicianName: string;
  }>;
  const now = new Date(),
    today = now.toISOString().slice(0, 10),
    weekAgo = new Date(now.getTime() - 7 * 86400000),
    monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const earned = (from?: Date) =>
    rows
      .filter(
        (x) =>
          x.status === "settled" && (!from || new Date(x.completedAt) >= from),
      )
      .reduce((n, x) => n + x.confirmedAmountPaise, 0);
  return jsonOk({
    payments: result.results,
    totalPendingPaise: pending,
    summary: {
      todayPaise: rows
        .filter(
          (x) =>
            x.status === "settled" && x.completedAt?.slice(0, 10) === today,
        )
        .reduce((n, x) => n + x.confirmedAmountPaise, 0),
      weekPaise: earned(weekAgo),
      monthPaise: earned(monthStart),
      totalFeesPaise: rows.reduce((n, x) => n + x.totalAmountPaise, 0),
      paidPaise: rows.reduce((n, x) => n + x.confirmedAmountPaise, 0),
      outstandingPaise: pending,
      completedCases: rows.length,
      disputedCases: rows.filter((x) => x.status === "disputed").length,
    },
    viewer: user.role,
  });
}
