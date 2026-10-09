import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  getSessionUser,
  isApprovedHospital,
  isVerifiedClinician,
} from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { ensureCasePayment, paymentAudit } from "@/lib/server/payments";
async function payment(id: string) {
  await ensureCasePayment(id);
  return env
    .DB!.prepare(
      "SELECT p.id,p.case_id AS caseId,p.payer_user_id AS payerId,p.payee_user_id AS payeeId,p.total_amount_paise AS totalAmountPaise,p.confirmed_amount_paise AS confirmedAmountPaise,p.status,p.due_at AS dueAt,p.settled_at AS settledAt,c.procedure_name AS procedureName,c.case_started_at AS caseStartedAt,c.case_completed_at AS caseCompletedAt,h.name AS hospitalName,pu.full_name AS payerName,pe.full_name AS payeeName,pu.mobile AS payerMobile,pe.mobile AS payeeMobile FROM case_payments p JOIN cases c ON c.id=p.case_id JOIN hospitals h ON h.id=c.hospital_id JOIN users pu ON pu.id=p.payer_user_id JOIN users pe ON pe.id=p.payee_user_id WHERE p.case_id=?",
    )
    .bind(id)
    .first<Record<string, unknown>>();
}
function allowed(
  user: Awaited<ReturnType<typeof getSessionUser>>,
  p: Record<string, unknown>,
) {
  return (
    user?.role === "admin" || user?.id === p.payerId || user?.id === p.payeeId
  );
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser(),
    { id } = await params,
    p = await payment(id);
  if (!p)
    return jsonError("Payment record is created after case completion.", 404);
  if (!allowed(user, p)) return jsonError("Payment access denied.", 403);
  const [entries, audit, issues] = await Promise.all([
    env.DB.prepare(
      "SELECT id,amount_paise AS amountPaise,method,reference,note,paid_at AS paidAt,status,confirmed_at AS confirmedAt,dispute_reason AS disputeReason,created_at AS createdAt FROM payment_entries WHERE payment_id=? ORDER BY created_at ASC",
    )
      .bind(p.id)
      .all(),
    env.DB.prepare(
      "SELECT actor_role AS actorRole,event_type AS eventType,previous_value AS previousValue,new_value AS newValue,details,created_at AS createdAt FROM payment_audit_events WHERE payment_id=? ORDER BY created_at ASC",
    )
      .bind(p.id)
      .all(),
    env.DB.prepare(
      "SELECT i.id,i.reason,i.amount_paise AS amountPaise,i.supporting_note AS supportingNote,i.status,i.admin_remarks AS adminRemarks,i.created_at AS createdAt,u.full_name AS raisedBy,u.role AS raisedByRole FROM payment_issues i JOIN users u ON u.id=i.raised_by_user_id WHERE i.payment_id=? ORDER BY i.created_at DESC",
    )
      .bind(p.id)
      .all(),
  ]);
  return jsonOk({
    payment: {
      ...p,
      balanceAmountPaise:
        Number(p.totalAmountPaise) - Number(p.confirmedAmountPaise),
    },
    entries: entries.results,
    audit: audit.results,
    issues: issues.results,
    viewer: user?.role,
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await getSessionUser(),
    { id } = await params,
    p = await payment(id);
  if (!p) return jsonError("Completed-case payment not found.", 404);
  if (!allowed(user, p)) return jsonError("Payment access denied.", 403);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (body?.action === "mark") {
    if (!isApprovedHospital(user) || user.id !== p.payerId)
      return jsonError("Only the case hospital can mark payment made.", 403);
    const parsed = z
      .object({
        amountRupees: z.number().positive().max(1000000),
        method: z.enum(["upi", "bank_transfer", "cash", "other"]),
        reference: z.string().trim().max(120).optional(),
        note: z.string().trim().max(300).optional(),
        paidAt: z.string().datetime(),
        idempotencyKey: z.string().uuid(),
      })
      .safeParse(body);
    if (!parsed.success)
      return jsonError(
        parsed.error.issues[0]?.message ?? "Valid payment details required.",
      );
    if (
      ["upi", "bank_transfer"].includes(parsed.data.method) &&
      !parsed.data.reference
    )
      return jsonError(
        "Transaction reference is required for UPI or bank transfer.",
      );
    const amount = Math.round(parsed.data.amountRupees * 100),
      remaining = Number(p.totalAmountPaise) - Number(p.confirmedAmountPaise);
    if (amount > remaining)
      return jsonError(
        `Amount exceeds the outstanding balance of ₹${(remaining / 100).toLocaleString("en-IN")}.`,
        422,
      );
    const entryId = crypto.randomUUID(),
      result = await env.DB.prepare(
        "INSERT OR IGNORE INTO payment_entries(id,payment_id,idempotency_key,amount_paise,method,reference,note,paid_at,status,marked_by_user_id) VALUES(?,?,?,?,?,?,?,?,'marked',?)",
      )
        .bind(
          entryId,
          p.id,
          parsed.data.idempotencyKey,
          amount,
          parsed.data.method,
          parsed.data.reference ?? null,
          parsed.data.note ?? null,
          parsed.data.paidAt,
          user.id,
        )
        .run();
    if (!result.meta.changes) return jsonOk({ entry: { duplicate: true } });
    await env.DB.prepare(
      "UPDATE case_payments SET status='payment_marked' WHERE id=? AND status<>'settled'",
    )
      .bind(p.id)
      .run();
    await paymentAudit(
      String(p.id),
      user.id,
      "payment_marked",
      {
        entryId,
        amountPaise: amount,
        method: parsed.data.method,
        reference: parsed.data.reference ?? null,
      },
      user.role,
      { status: p.status, confirmedAmountPaise: p.confirmedAmountPaise },
      { status: "payment_marked", markedAmountPaise: amount },
    );
    await notifyUser({
      userId: String(p.payeeId),
      caseId: id,
      kind: "payment_marked",
      title: "Hospital marked payment made",
      body: `Hospital marked ₹${(amount / 100).toLocaleString("en-IN")} paid. Please confirm receipt or raise a dispute.`,
      dedupeKey: `payment_marked:${entryId}`,
      mobile: String(p.payeeMobile),
    });
    return jsonOk({ entry: { id: entryId, status: "marked" } }, 201);
  }
  if (body?.action === "confirm") {
    if (!isVerifiedClinician(user) || user.id !== p.payeeId)
      return jsonError("Only the assigned clinician can confirm receipt.", 403);
    const parsed = z.object({ entryId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return jsonError("Valid payment entry required.");
    const entry = await env.DB.prepare(
      "SELECT amount_paise AS amount FROM payment_entries WHERE id=? AND payment_id=? AND status='marked'",
    )
      .bind(parsed.data.entryId, p.id)
      .first<{ amount: number }>();
    if (!entry)
      return jsonError("Payment entry already handled or not found.", 409);
    await env.DB.prepare(
      "UPDATE payment_entries SET status='received',confirmed_by_user_id=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND status='marked'",
    )
      .bind(user.id, parsed.data.entryId)
      .run();
    const total = await env.DB.prepare(
        "SELECT COALESCE(SUM(amount_paise),0) AS amount FROM payment_entries WHERE payment_id=? AND status='received'",
      )
        .bind(p.id)
        .first<{ amount: number }>(),
      settled = (total?.amount ?? 0) >= Number(p.totalAmountPaise);
    await env.DB.prepare(
      "UPDATE case_payments SET confirmed_amount_paise=?,status=?,settled_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?",
    )
      .bind(
        total?.amount ?? 0,
        settled ? "settled" : "partially_paid",
        settled ? 1 : 0,
        p.id,
      )
      .run();
    await paymentAudit(
      String(p.id),
      user.id,
      settled ? "payment_settled" : "partial_payment_received",
      { entryId: parsed.data.entryId, amountPaise: entry.amount },
      user.role,
      { status: p.status, confirmedAmountPaise: p.confirmedAmountPaise },
      {
        status: settled ? "settled" : "partially_paid",
        confirmedAmountPaise: total?.amount ?? 0,
      },
    );
    await notifyUser({
      userId: String(p.payerId),
      caseId: id,
      kind: settled ? "payment_settled" : "payment_received",
      title: settled ? "Payment settled" : "Partial payment received",
      body: settled
        ? "The anaesthetist confirmed full payment. A digital receipt is available."
        : `The anaesthetist confirmed ₹${(entry.amount / 100).toLocaleString("en-IN")} received.`,
      dedupeKey: `payment_confirmed:${parsed.data.entryId}`,
      mobile: String(p.payerMobile),
    });
    return jsonOk({
      payment: { status: settled ? "settled" : "partially_paid" },
    });
  }
  if (body?.action === "dispute") {
    if (!isVerifiedClinician(user) || user.id !== p.payeeId)
      return jsonError(
        "Only the assigned clinician can dispute a marked payment.",
        403,
      );
    const parsed = z
      .object({
        entryId: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .safeParse(body);
    if (!parsed.success)
      return jsonError("Please provide the disputed payment and reason.");
    const changed = await env.DB.prepare(
      "UPDATE payment_entries SET status='disputed',dispute_reason=? WHERE id=? AND payment_id=? AND status='marked'",
    )
      .bind(parsed.data.reason, parsed.data.entryId, p.id)
      .run();
    if (!changed.meta.changes)
      return jsonError("Payment entry already handled or not found.", 409);
    const issueId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO payment_issues(id,payment_id,case_id,raised_by_user_id,reason,amount_paise,status) SELECT ?,?,?,?,?,amount_paise,'open' FROM payment_entries WHERE id=?",
      ).bind(
        issueId,
        p.id,
        id,
        user.id,
        parsed.data.reason,
        parsed.data.entryId,
      ),
      env.DB.prepare(
        "UPDATE case_payments SET status='disputed' WHERE id=?",
      ).bind(p.id),
    ]);
    await paymentAudit(
      String(p.id),
      user.id,
      "payment_disputed",
      { entryId: parsed.data.entryId, issueId, reason: parsed.data.reason },
      user.role,
      { status: p.status },
      { status: "disputed" },
    );
    return jsonOk({
      payment: { status: "disputed", adminReviewRequired: true },
    });
  }
  if (body?.action === "issue") {
    const parsed = z
      .object({
        reason: z.string().trim().min(5).max(500),
        amountRupees: z.number().positive().max(1000000),
        supportingNote: z.string().trim().max(500).optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      return jsonError("Please provide the disputed amount and reason.");
    const amount = Math.round(parsed.data.amountRupees * 100);
    if (amount > Number(p.totalAmountPaise))
      return jsonError("Issue amount cannot exceed the final fee.", 422);
    const issueId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO payment_issues(id,payment_id,case_id,raised_by_user_id,reason,amount_paise,supporting_note,status) VALUES(?,?,?,?,?,?,?,'open')",
      ).bind(
        issueId,
        p.id,
        id,
        user!.id,
        parsed.data.reason,
        amount,
        parsed.data.supportingNote ?? null,
      ),
      env.DB.prepare(
        "UPDATE case_payments SET status='disputed' WHERE id=? AND status<>'settled'",
      ).bind(p.id),
    ]);
    await paymentAudit(
      String(p.id),
      user!.id,
      "payment_issue_raised",
      { issueId, reason: parsed.data.reason, amountPaise: amount },
      user!.role,
      { status: p.status },
      { status: "disputed" },
    );
    return jsonOk(
      {
        issue: { id: issueId, status: "open" },
        payment: { status: "disputed", adminReviewRequired: true },
      },
      201,
    );
  }
  return jsonError("Valid payment action required.");
}
