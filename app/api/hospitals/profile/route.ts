import { env } from "cloudflare:workers";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/server/http";
import { getSessionUser } from "@/lib/server/session";
import { getVerifiedHospitalPlace, GooglePlacesError } from "@/lib/server/google-places";

const schema=z.object({googlePlaceId:z.string().trim().min(3).max(200),facilityType:z.enum(["hospital","diagnostic_center"])});
export async function PATCH(request:Request){
 if(!env.DB)return jsonError("Database unavailable.",503,"DB_UNAVAILABLE");
 const user=await getSessionUser();
 if(!user||user.role!=="hospital"||!user.hospitalId)return jsonError("Hospital login required.",403,"HOSPITAL_REQUIRED");
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return jsonError("Select a valid Google Maps hospital.",422,"INVALID_LOCATION");
 try{const place=await getVerifiedHospitalPlace(parsed.data.googlePlaceId);await env.DB.prepare("UPDATE hospitals SET name=?,facility_type=?,address=?,city='Amritsar',google_place_id=?,latitude=?,longitude=?,google_maps_url=? WHERE id=?").bind(place.name,parsed.data.facilityType,place.address,place.placeId,String(place.latitude),String(place.longitude),place.googleMapsUri,user.hospitalId).run();return jsonOk({hospital:{...place,facilityType:parsed.data.facilityType}});}
 catch(error){if(error instanceof GooglePlacesError)return jsonError(error.message,error.status,error.code);return jsonError("Unable to save the hospital location.",502,"MAPS_ERROR");}
}
