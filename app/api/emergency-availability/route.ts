import { getSessionUser, isVerifiedPlatformUser } from "@/lib/server/session";
import { getEmergencyAvailableAnaesthetists } from "@/lib/server/emergency-availability-service";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET() {
  try {
    const viewer = await getSessionUser();
    const verified = isVerifiedPlatformUser(viewer);
    const records = await getEmergencyAvailableAnaesthetists({ includeRanking: false });
    const response = jsonOk({ count: records.length, anaesthetists: verified ? records : [], nextExpiry: records[0]?.availableUntil ?? null });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return jsonError("Unable to load live availability. Please retry.", 503);
  }
}
