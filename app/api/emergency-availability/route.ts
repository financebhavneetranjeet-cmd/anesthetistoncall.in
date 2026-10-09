import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { getEmergencyAvailableAnaesthetists } from "@/lib/server/emergency-availability-service";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  const viewer = await getSessionUser();
  if (!isVerifiedPlatformUser(viewer)) return jsonError("Verified member access required.", 403, "VERIFIED_MEMBER_REQUIRED");
  const anaesthetists = await getEmergencyAvailableAnaesthetists();
  return jsonOk({ count: anaesthetists.length, anaesthetists });
}
