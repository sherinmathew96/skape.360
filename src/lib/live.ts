import "server-only";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

/**
 * Live updates. Every change made through the app ends in revalidatePath, so
 * actions import it from here: it refreshes the cache as before and moves the
 * live version on. Open pages poll /api/live and refresh when it moves.
 * Page views and logins never call this, so they never refresh other tabs.
 */
export async function bumpLive() {
  try {
    const db = await getDb();
    await db
      .insert(s.liveVersion)
      .values({ id: 1, v: 1 })
      .onConflictDoUpdate({ target: s.liveVersion.id, set: { v: sql`${s.liveVersion.v} + 1`, at: sql`now()` } });
  } catch {
    // No table yet (before the migration): live updates just stay off.
  }
}

export async function liveVersion(): Promise<number | null> {
  try {
    const db = await getDb();
    const [row] = await db.select({ v: s.liveVersion.v }).from(s.liveVersion).limit(1);
    return row?.v ?? 0;
  } catch {
    return null;
  }
}

export function revalidatePath(path: string, type?: "layout" | "page") {
  nextRevalidatePath(path, type);
  // After the response, so the action is not slowed down.
  after(bumpLive);
}
