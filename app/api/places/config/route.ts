import { env } from "cloudflare:workers";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey)
    return jsonError(
      "Hospital location search is temporarily unavailable.",
      503,
      "MAPS_NOT_CONFIGURED",
    );
  return new Response(JSON.stringify({ ok: true, apiKey }), { headers: { "content-type": "application/json", "cache-control": "private, max-age=300" } });
}
