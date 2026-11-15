import "server-only";
import { cookies } from "next/headers";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { PortalSections } from "@/db/schema";

export type UpdateSection = "drawings" | "models" | "tours" | "site" | "timeline";

/**
 * Tells the client something new is up (it appears under the bell in their
 * portal). The same kind of update to the same place within half an hour
 * is folded into one, so ten renders uploaded together ring the bell once.
 */
export async function notifyClient(input: { projectId: string; kind: string; title: string; href: string; section: UpdateSection; drawingId?: string | null }) {
  const db = await getDb();
  const [recent] = await db
    .select({ id: s.clientUpdates.id })
    .from(s.clientUpdates)
    .where(
      and(
        eq(s.clientUpdates.projectId, input.projectId),
        eq(s.clientUpdates.kind, input.kind),
        eq(s.clientUpdates.href, input.href),
        gt(s.clientUpdates.createdAt, sql`now() - interval '30 minutes'`),
      ),
    )
    .limit(1);
  const title = input.title.slice(0, 200);
  if (recent) {
    await db.update(s.clientUpdates).set({ title, createdAt: new Date() }).where(eq(s.clientUpdates.id, recent.id));
    return;
  }
  await db.insert(s.clientUpdates).values({ ...input, title, drawingId: input.drawingId ?? null });
}

/** Whether the client sees this drawing at all. */
export async function drawingShownToClient(drawingId: string) {
  const db = await getDb();
  const [d] = await db
    .select({ id: s.drawings.id })
    .from(s.drawings)
    .where(and(eq(s.drawings.id, drawingId), eq(s.drawings.clientVisible, true), isNull(s.drawings.deletedAt)));
  return Boolean(d);
}

const on = (sections: PortalSections, section: string) =>
  section === "timeline" ? sections.timeline !== false : Boolean(sections[section as keyof PortalSections]);

/** The portal's updates the client may see: its parts switched on, drawings still shown to them. */
export async function portalUpdates(portal: { projectId: string; sections: PortalSections }, limit = 60) {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.clientUpdates.id,
      kind: s.clientUpdates.kind,
      title: s.clientUpdates.title,
      href: s.clientUpdates.href,
      section: s.clientUpdates.section,
      createdAt: s.clientUpdates.createdAt,
    })
    .from(s.clientUpdates)
    .leftJoin(s.drawings, eq(s.drawings.id, s.clientUpdates.drawingId))
    .where(
      and(
        eq(s.clientUpdates.projectId, portal.projectId),
        or(isNull(s.clientUpdates.drawingId), and(eq(s.drawings.clientVisible, true), isNull(s.drawings.deletedAt))),
      ),
    )
    .orderBy(desc(s.clientUpdates.createdAt))
    .limit(limit * 2);
  return rows.filter((r) => on(portal.sections, r.section)).slice(0, limit);
}

export const portalSeenCookie = (portalId: string) => `skape_seen_${portalId.replaceAll("-", "")}`;

/** When this device last opened the updates; a first visit counts the last two weeks as new. */
export async function portalSeenAt(portalId: string): Promise<Date> {
  const raw = (await cookies()).get(portalSeenCookie(portalId))?.value;
  const at = raw ? new Date(raw) : null;
  return at && !Number.isNaN(at.getTime()) ? at : new Date(Date.now() - 14 * 86_400_000);
}

export async function portalUnread(portal: { id: string; projectId: string; sections: PortalSections }) {
  const seen = await portalSeenAt(portal.id);
  return (await portalUpdates(portal, 30)).filter((u) => u.createdAt > seen).length;
}
