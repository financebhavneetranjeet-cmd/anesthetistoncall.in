import { getChatGPTUser } from "./chatgpt-auth";
import { HomePage } from "@/components/home/home-page";
import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { getEmergencyAvailableAnaesthetists } from "@/lib/server/emergency-availability-service";
import { getPublicCases } from "@/lib/server/public-cases";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [chatgptUser, account, emergencyAvailability, publicCases] = await Promise.all([
    getChatGPTUser(),
    getSessionUser(),
    getEmergencyAvailableAnaesthetists({ includeRanking: false }).catch(() => []),
    getPublicCases().catch(() => null),
  ]);

  return (
    <HomePage
      account={account ? { fullName: account.fullName, role: account.role, verified: isVerifiedPlatformUser(account) } : null}
      chatgptName={chatgptUser?.displayName ?? null}
      initialAvailabilityCount={emergencyAvailability.length}
      publicCases={publicCases}
    />
  );
}
