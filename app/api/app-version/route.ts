import { CURRENT_RELEASE } from "@/lib/release";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(CURRENT_RELEASE, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

