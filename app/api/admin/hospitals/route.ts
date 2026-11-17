import { pendingHospitals } from "@/lib/server/pending-registrations";
import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/server/admin";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  if (!await isAdmin()) return jsonError("Admin access required.", 403, "ADMIN_REQUIRED");
  if (!env.DB) return jsonError("Database unavailable.", 503, "DB_UNAVAILABLE");
  const result = await env.DB.prepare(pendingHospitals).all();
  return jsonOk({ hospitals: result.results });
}
