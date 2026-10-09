import { env } from "cloudflare:workers";
import { getAdminIdentity } from "./admin";
export async function recordAdminAudit(action: string, targetType: string, targetId: string, details?: string) {
  const actor = await getAdminIdentity();
  if (!env.DB || !actor) return;
  await env.DB.prepare("INSERT INTO admin_audit_logs (id,actor_email,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), actor.actor, action, targetType, targetId, details ?? null).run();
}
