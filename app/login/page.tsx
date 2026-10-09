import { getChatGPTUser } from "../chatgpt-auth";
import { LoginForm } from "./login-form";
import { googleConfigured } from "@/lib/server/google-auth";

export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const user = await getChatGPTUser();
  const { google } = await searchParams;
  const messages: Record<string, string> = {
    unavailable: "Google sign-in is being configured. Please use Mobile OTP.",
    failed: "Google sign-in could not be completed. Please retry or use Mobile OTP.",
    cancelled: "Google sign-in was cancelled. You can retry or use Mobile OTP.",
    limited: "Too many sign-in attempts. Please try later or use Mobile OTP.",
    "link-required": "For your first Google login, sign in with Mobile OTP and connect Google to your existing account.",
    "link-failed": "This Google account could not be connected. Please use Mobile OTP or contact support.",
    restricted: "This account cannot access the selected role. Please contact the administrator.",
  };
  return <LoginForm signedInName={user?.displayName ?? null} googleEnabled={googleConfigured()} googleMessage={google ? messages[google] ?? messages.failed : null} />;
}
