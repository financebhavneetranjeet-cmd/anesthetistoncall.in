import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getSessionUser } from "./session";
import { isAdminMobile } from "./login";

export async function getAdminIdentity(): Promise<{ name: string; actor: string } | null> {
  const session = await getSessionUser();
  if (session?.role === "admin" && session.status === "verified" && session.accountStatus === "active" && isAdminMobile(session.mobile)) {
    return { name: session.fullName, actor: `mobile:${session.mobile}` };
  }
  const user = await getChatGPTUser();
  const allowed = (env.ADMIN_EMAILS ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  return user && allowed.includes(user.email.toLowerCase()) ? { name: user.displayName, actor: user.email } : null;
}

export async function isAdmin(): Promise<boolean> {
  return Boolean(await getAdminIdentity());
}
