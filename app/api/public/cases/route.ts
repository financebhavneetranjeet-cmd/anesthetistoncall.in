import { getPublicCases } from "@/lib/server/public-cases";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ cases: await getPublicCases() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Available cases could not be loaded. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
