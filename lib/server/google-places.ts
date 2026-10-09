import { env } from "cloudflare:workers";

export type VerifiedHospitalPlace = {
  placeId: string;
  name: string;
  address: string;
  city: "Amritsar";
  latitude: number;
  longitude: number;
  googleMapsUri: string;
};

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: AddressComponent[];
  googleMapsUri?: string;
  primaryType?: string;
  types?: string[];
};

export class GooglePlacesError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

const GOOGLE_TIMEOUT_MS = 6500;

function googleError(status: number) {
  if (status === 429) return new GooglePlacesError("Hospital search is busy right now. Please wait a moment and try again.", 503, "MAPS_QUOTA");
  if (status === 401 || status === 403) return new GooglePlacesError("Google Maps is not authorised for hospital search. Please contact support.", 503, "MAPS_AUTH");
  return new GooglePlacesError("Unable to verify this hospital with Google Maps.", 502, "MAPS_ERROR");
}

export async function fetchGooglePlaces(input: string | URL, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(input, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") throw new GooglePlacesError("Google Maps took too long to respond. Please try again.", 504, "MAPS_TIMEOUT");
    throw new GooglePlacesError("Google Maps is temporarily unreachable. Please try again.", 502, "MAPS_NETWORK");
  }
  if (!response.ok) throw googleError(response.status);
  return response;
}

const allowedMedicalTypes = new Set(["hospital", "medical_clinic", "medical_lab", "doctor"]);

function component(place: GooglePlace, ...types: string[]) {
  return place.addressComponents?.find((part) => types.some((type) => part.types?.includes(type)));
}

export function verifyAmritsarHospital(place: GooglePlace): VerifiedHospitalPlace {
  const city = component(place, "locality", "postal_town", "administrative_area_level_3")?.longText ?? "";
  const district = component(place, "administrative_area_level_2")?.longText ?? "";
  const state = component(place, "administrative_area_level_1")?.longText ?? "";
  const country = component(place, "country")?.shortText ?? "";
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const isMedical = allowedMedicalTypes.has(place.primaryType ?? "") || place.types?.some((type) => allowedMedicalTypes.has(type));
  const isAmritsar = /\bamritsar\b/i.test(city) || /\bamritsar\b/i.test(district);
  if (!isMedical) throw new GooglePlacesError("Please select a hospital, diagnostic center, or clinic from Google Maps.", 422, "NOT_A_MEDICAL_FACILITY");
  if (!isAmritsar || !/^punjab$/i.test(state) || country.toUpperCase() !== "IN") {
    throw new GooglePlacesError("For the current launch, only hospitals, diagnostic centers, and clinics in Amritsar, Punjab can register.", 422, "OUTSIDE_AMRITSAR");
  }
  if (!place.id || !place.displayName?.text || !place.formattedAddress || typeof latitude !== "number" || typeof longitude !== "number" || !place.googleMapsUri) {
    throw new GooglePlacesError("Google Maps did not return complete details for this location. Please select another listing.", 422, "INCOMPLETE_PLACE");
  }
  return { placeId: place.id, name: place.displayName.text, address: place.formattedAddress, city: "Amritsar", latitude, longitude, googleMapsUri: place.googleMapsUri };
}

export async function getVerifiedHospitalPlace(placeId: string): Promise<VerifiedHospitalPlace> {
  if (!env.GOOGLE_PLACES_SERVER_API_KEY) throw new GooglePlacesError("Hospital search needs Google Places configuration before it can be used.", 503, "PLACES_NOT_CONFIGURED");
  const response = await fetchGooglePlaces(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_PLACES_SERVER_API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents,googleMapsUri,primaryType,types",
    },
  });
  return verifyAmritsarHospital(await response.json() as GooglePlace);
}
