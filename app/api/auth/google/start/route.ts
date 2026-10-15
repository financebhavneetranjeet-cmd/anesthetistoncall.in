import { beginGoogle } from "@/lib/server/google-auth";
export async function POST(request: Request) {
  try { return await beginGoogle(request); }
  catch { return new Response(null, { status: 303, headers: { Location: "/login?google=failed", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
}

// Canonical-host continuation creates fresh state and host-bound cookies.
export async function GET(request: Request) { return POST(request); }
