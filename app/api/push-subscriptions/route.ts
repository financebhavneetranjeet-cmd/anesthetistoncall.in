import { env } from "cloudflare:workers";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/server/http";
import { getSessionUser, hasActiveAccount } from "@/lib/server/session";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
});

async function currentUser() {
  const user = await getSessionUser();
  // A pending member must be able to subscribe before their approval event.
  return hasActiveAccount(user) ? user : null;
}

export async function GET() {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await currentUser();
  if (!user) return jsonOk({ authenticated: false });
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?")
    .bind(user.id).first<{ count: number }>();
  return jsonOk({
    authenticated: true,
    subscribed: (count?.count ?? 0) > 0,
    publicKey: env.WEB_PUSH_PUBLIC_KEY ?? null,
  });
}

export async function POST(request: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401, "AUTH_REQUIRED");
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid push subscription.", 400, "INVALID_SUBSCRIPTION");
  const { endpoint, keys } = parsed.data;
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== "https:") return jsonError("Push subscription must use HTTPS.", 400, "INVALID_SUBSCRIPTION");
  await env.DB.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent, updated_at=CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(), user.id, endpoint, keys.p256dh, keys.auth, request.headers.get("user-agent")?.slice(0, 500) ?? null).run();
  return jsonOk({ subscribed: true });
}

export async function DELETE(request: Request) {
  if (!env.DB) return jsonError("Database unavailable.", 503);
  const user = await currentUser();
  if (!user) return jsonError("Sign in first.", 401, "AUTH_REQUIRED");
  const parsed = z.object({ endpoint: z.string().url().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid push subscription.");
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(user.id, parsed.data.endpoint).run();
  return jsonOk({ subscribed: false });
}
