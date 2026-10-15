import { renewSession } from "@/lib/server/session";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return jsonError("Invalid request origin.", 403);
  const response = jsonOk({ renewed: await renewSession() });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
