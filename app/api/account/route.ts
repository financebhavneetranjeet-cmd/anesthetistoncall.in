import { jsonOk } from "@/lib/server/http";
import { getSessionUser } from "@/lib/server/session";

export async function GET() { return jsonOk({ user: await getSessionUser() }); }
