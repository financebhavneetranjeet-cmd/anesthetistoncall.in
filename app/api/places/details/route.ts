import { jsonError, jsonOk } from "@/lib/server/http";
import { getVerifiedHospitalPlace, GooglePlacesError } from "@/lib/server/google-places";

export async function GET(request: Request) {
  const placeId = new URL(request.url).searchParams.get("placeId")?.trim();
  if (!placeId) return jsonError("Place ID is required.");
  try { return jsonOk({ place: await getVerifiedHospitalPlace(placeId) }); }
  catch (error) {
    if (error instanceof GooglePlacesError) return jsonError(error.message, error.status, error.code);
    return jsonError("Unable to verify this hospital with Google Maps.", 502, "MAPS_ERROR");
  }
}
