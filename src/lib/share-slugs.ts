import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { checkSlug, slugify, slugTaken } from "./portal";

export type ShareKind = "group" | "drawing";

/** Is this address used by a shared group or drawing (other than this one)? */
export async function shareSlugTaken(slug: string, except?: { kind: ShareKind; id: string }) {
  const db = await getDb();
  const [g] = await db.select({ id: s.drawingGroups.id }).from(s.drawingGroups).where(eq(s.drawingGroups.shareSlug, slug));
  if (g && !(except?.kind === "group" && except.id === g.id)) return true;
  const [d] = await db.select({ id: s.drawings.id }).from(s.drawings).where(eq(s.drawings.shareSlug, slug));
  return Boolean(d && !(except?.kind === "drawing" && except.id === d.id));
}

/**
 * The group's or drawing's own address, made from its name the first time
 * it is shared: "conference-room-pearle-productions", "side-d-elevation".
 * When the name is taken (another portal, firm, group or drawing), the
 * portal's address is added, then a number.
 */
export async function ensureShareSlug(kind: ShareKind, id: string, name: string, portalSlug: string): Promise<string> {
  const db = await getDb();
  const table = kind === "group" ? s.drawingGroups : s.drawings;
  const [row] = await db.select({ slug: table.shareSlug }).from(table).where(eq(table.id, id));
  if (row?.slug) return row.slug;

  let base = slugify(name);
  if (base.length < 3) base = slugify(`${name} ${kind}`);
  const candidates = [base, slugify(`${base}-${portalSlug}`)];
  for (let n = 2; n < 50; n++) candidates.push(slugify(`${base}-${portalSlug}`).slice(0, 56) + `-${n}`);
  for (const slug of candidates) {
    if (checkSlug(slug)) continue;
    if ((await slugTaken(slug)) || (await shareSlugTaken(slug))) continue;
    try {
      await db.update(table).set({ shareSlug: slug }).where(eq(table.id, id));
      return slug;
    } catch {
      // Taken a moment ago by someone else: try the next one.
    }
  }
  throw new Error("Couldn't make an address for this. Rename it and try again.");
}

/** A shared group or drawing at this address, with its project. */
export async function findShared(slug: string) {
  const db = await getDb();
  const [g] = await db
    .select({ id: s.drawingGroups.id, projectId: s.drawingGroups.projectId, name: s.drawingGroups.name })
    .from(s.drawingGroups)
    .where(and(eq(s.drawingGroups.shareSlug, slug), isNull(s.drawingGroups.deletedAt)));
  if (g) return { kind: "group" as const, ...g };
  const [d] = await db
    .select({ id: s.drawings.id, projectId: s.drawings.projectId, name: s.drawings.title, groupId: s.drawings.groupId })
    .from(s.drawings)
    .where(and(eq(s.drawings.shareSlug, slug), isNull(s.drawings.deletedAt), eq(s.drawings.clientVisible, true)));
  if (d) return { kind: "drawing" as const, ...d };
  return null;
}

/** The project's client portal address, if it has an open one. */
export async function portalSlugFor(projectId: string) {
  const db = await getDb();
  const [p] = await db
    .select({ slug: s.clientPortals.slug })
    .from(s.clientPortals)
    .where(and(eq(s.clientPortals.projectId, projectId), eq(s.clientPortals.enabled, true)));
  return p?.slug ?? null;
}
