import { purgeExpired } from "@/lib/trash";

/**
 * Daily: removes for good whatever has been in the recycle bin longer than
 * the studio's retention period. Vercel Cron calls it (see vercel.json).
 * With CRON_SECRET set, only a request carrying it runs; without one, only
 * Vercel's own scheduler does. It only ever removes expired items.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const fromVercel = (req.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
  const allowed = secret ? req.headers.get("authorization") === `Bearer ${secret}` : fromVercel;
  if (!allowed) return new Response("Not allowed", { status: 401 });
  const result = await purgeExpired();
  return Response.json(result);
}
