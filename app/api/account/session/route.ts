import { getSessionUser, renewSession, clearSession } from "@/lib/server/session";
import { postLoginDestination } from "@/lib/server/login";
import { jsonError, jsonOk } from "@/lib/server/http";
import { env } from "cloudflare:workers";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return jsonError("Invalid request origin.", 403);
  if (!env.DB) return jsonError("Session service temporarily unavailable.", 503);
  if (!(await renewSession())) return jsonError("Please sign in again.", 401, "SESSION_EXPIRED");
  const user = await getSessionUser();
  if (!user) return jsonError("Please sign in again.", 401, "SESSION_EXPIRED");
  return jsonOk({ redirectTo: postLoginDestination(user) });
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return jsonError("Invalid request origin.", 403);
  if (!env.DB) return jsonError("Session service temporarily unavailable.", 503);
  await clearSession();
  return jsonOk({ signedOut: true });
}
