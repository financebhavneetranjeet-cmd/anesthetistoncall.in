import { env } from "cloudflare:workers";
import { jsonError, jsonOk } from "@/lib/server/http";
import { fetchGooglePlaces, GooglePlacesError } from "@/lib/server/google-places";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return jsonOk({ suggestions: [] });
  if (!env.GOOGLE_PLACES_SERVER_API_KEY) return jsonError("Hospital search needs Google Places configuration before it can be used.", 503, "PLACES_NOT_CONFIGURED");
  try {
  const response = await fetchGooglePlaces("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_SERVER_API_KEY,
    },
    body: JSON.stringify({ input: query, includedPrimaryTypes: ["hospital", "medical_clinic", "medical_lab", "doctor"], includedRegionCodes: ["in"], languageCode: "en", regionCode: "in", locationRestriction: { circle: { center: { latitude: 31.634, longitude: 74.8723 }, radius: 40000 } } }),
  });
  const data = await response.json() as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> };
  const seen = new Set<string>();
  const suggestions = (data.suggestions ?? []).flatMap(({ placePrediction }) => {
    if (!placePrediction?.placeId || seen.has(placePrediction.placeId)) return [];
    seen.add(placePrediction.placeId);
    return [{ placeId: placePrediction.placeId, name: placePrediction.structuredFormat?.mainText?.text ?? placePrediction.text?.text ?? "Hospital", address: placePrediction.structuredFormat?.secondaryText?.text ?? "Amritsar" }];
  }).slice(0, 8);
  return new Response(JSON.stringify({ ok: true, suggestions }), { headers: { "content-type": "application/json", "cache-control": "private, max-age=60" } });
  } catch (error) {
    if (error instanceof GooglePlacesError) return jsonError(error.message, error.status, error.code);
    return jsonError("Hospital search is temporarily unavailable.", 502, "MAPS_ERROR");
  }
}
