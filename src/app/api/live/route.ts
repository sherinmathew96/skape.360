import { liveVersion } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * The live version: open pages poll this and refresh when it moves. A bare
 * counter, so no sign-in is needed. Vercel's CDN keeps each answer for 4 s,
 * so however many pages are open, the function runs about once per 4 s.
 */
export async function GET() {
  return Response.json(
    { v: await liveVersion() },
    { headers: { "Cache-Control": "no-store", "CDN-Cache-Control": "public, s-maxage=4", "Vercel-CDN-Cache-Control": "public, s-maxage=4" } },
  );
}
