import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";
export async function GET() {
  if (!(await isAdmin())) return jsonError("Admin access required.", 403);
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const [result, count] = await Promise.all([env.DB.prepare("SELECT c.id, c.procedure_name AS procedureName, c.anaesthesia_type AS anaesthesiaType, c.scheduled_at AS scheduledAt, c.offered_fee_paise AS offeredFeePaise, c.urgency, c.public_notes AS publicNotes, c.status, h.name AS hospitalName FROM cases c JOIN hospitals h ON h.id = c.hospital_id WHERE c.status = 'pending_approval' ORDER BY c.created_at ASC").all(), env.DB.prepare("SELECT COUNT(*) AS count FROM cases WHERE status='pending_approval'").first<{count:number}>()]);
  return jsonOk({ cases: result.results, pendingCount: count?.count ?? 0 });
}
