import { finishGoogle } from "@/lib/server/google-auth";
export async function GET(request: Request) {
  try { return await finishGoogle(request); }
  catch { return new Response(null, { status: 303, headers: { Location: "/login?google=failed", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
}
