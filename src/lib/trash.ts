import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/db";
import { deleteStoredWithCopies } from "./storage";

/**
 * The recycle bin. Deleting a project, drawing, 3D model, 360° tour, site
 * report or firm only marks it (deleted_at). It can be restored until the
 * studio's retention period ends; then it and its files are removed for good.
 */
export const TRASH_TYPES = ["project", "drawing", "model", "tour", "report", "firm"] as const;
export type TrashType = (typeof TRASH_TYPES)[number];

export const TRASH_LABEL: Record<TrashType, string> = {
  project: "Project",
  drawing: "Drawing",
  model: "3D model",
  tour: "360° tour",
  report: "Site report",
  firm: "Firm",
};

export type TrashItem = {
  type: TrashType;
  id: string;
  title: string;
  projectName: string | null;
  deletedAt: Date;
  deletedByName: string | null;
};

/** Days a deleted item stays in the bin, from the studio's settings. */
export async function trashDays() {
  const db = await getDb();
  const [row] = await db.select({ days: s.businessSettings.trashDays }).from(s.businessSettings).where(eq(s.businessSettings.id, "studio"));
  return row?.days ?? 90;
}

/** Everything in the bin, newest first. */
export async function listTrash(): Promise<TrashItem[]> {
  const db = await getDb();
  const by = alias(s.users, "deleter");
  const p = alias(s.projects, "parent");
  const pick = <T extends { deletedAt: Date | null }>(rows: T[]) => rows.filter((r): r is T & { deletedAt: Date } => r.deletedAt !== null);

  const [projects, drawings, models, tours, reports, firms] = await Promise.all([
    db
      .select({ id: s.projects.id, title: s.projects.name, projectName: sql<string | null>`null`, deletedAt: s.projects.deletedAt, deletedByName: by.name })
      .from(s.projects)
      .leftJoin(by, eq(by.id, s.projects.deletedBy))
      .where(isNotNull(s.projects.deletedAt)),
    db
      .select({ id: s.drawings.id, title: s.drawings.title, projectName: p.name, deletedAt: s.drawings.deletedAt, deletedByName: by.name })
      .from(s.drawings)
      .innerJoin(p, eq(p.id, s.drawings.projectId))
      .leftJoin(by, eq(by.id, s.drawings.deletedBy))
      .where(isNotNull(s.drawings.deletedAt)),
    db
      .select({ id: s.models3d.id, title: s.models3d.title, projectName: p.name, deletedAt: s.models3d.deletedAt, deletedByName: by.name })
      .from(s.models3d)
      .innerJoin(p, eq(p.id, s.models3d.projectId))
      .leftJoin(by, eq(by.id, s.models3d.deletedBy))
      .where(isNotNull(s.models3d.deletedAt)),
    db
      .select({ id: s.tours.id, title: s.tours.title, projectName: p.name, deletedAt: s.tours.deletedAt, deletedByName: by.name })
      .from(s.tours)
      .innerJoin(p, eq(p.id, s.tours.projectId))
      .leftJoin(by, eq(by.id, s.tours.deletedBy))
      .where(isNotNull(s.tours.deletedAt)),
    db
      .select({ id: s.siteReports.id, title: sql<string>`'Report of ' || to_char(${s.siteReports.date}, 'DD Mon YYYY')`, projectName: p.name, deletedAt: s.siteReports.deletedAt, deletedByName: by.name })
      .from(s.siteReports)
      .innerJoin(p, eq(p.id, s.siteReports.projectId))
      .leftJoin(by, eq(by.id, s.siteReports.deletedBy))
      .where(isNotNull(s.siteReports.deletedAt)),
    db
      .select({ id: s.firms.id, title: s.firms.name, projectName: sql<string | null>`null`, deletedAt: s.firms.deletedAt, deletedByName: by.name })
      .from(s.firms)
      .leftJoin(by, eq(by.id, s.firms.deletedBy))
      .where(isNotNull(s.firms.deletedAt)),
  ]);

  const all: TrashItem[] = [
    ...pick(projects).map((r) => ({ ...r, type: "project" as const })),
    ...pick(drawings).map((r) => ({ ...r, type: "drawing" as const })),
    ...pick(models).map((r) => ({ ...r, type: "model" as const })),
    ...pick(tours).map((r) => ({ ...r, type: "tour" as const })),
    ...pick(reports).map((r) => ({ ...r, type: "report" as const })),
    ...pick(firms).map((r) => ({ ...r, type: "firm" as const })),
  ];
  return all.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

// ── Removing for good ───────────────────────────────────────────────────────

async function dropFiles(ids: string[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  const rows = await db.select({ id: s.files.id, key: s.files.storageKey }).from(s.files).where(inArray(s.files.id, ids));
  await db.delete(s.files).where(inArray(s.files.id, ids));
  for (const r of rows) await deleteStoredWithCopies(r.key);
}

async function dropShareItems(type: "drawing" | "model" | "tour", id: string) {
  const db = await getDb();
  await db.delete(s.shareLinkItems).where(and(eq(s.shareLinkItems.itemType, type), eq(s.shareLinkItems.itemId, id)));
}

/** Removes one item and its files for good. Returns false when it was not in the bin. */
export async function purgeItem(type: TrashType, id: string): Promise<boolean> {
  const db = await getDb();
  if (type === "drawing") {
    const [d] = await db.select({ id: s.drawings.id }).from(s.drawings).where(and(eq(s.drawings.id, id), isNotNull(s.drawings.deletedAt)));
    if (!d) return false;
    const files = await db.select({ id: s.drawingRevisions.fileId }).from(s.drawingRevisions).where(eq(s.drawingRevisions.drawingId, id));
    await dropShareItems("drawing", id);
    await db.delete(s.drawings).where(eq(s.drawings.id, id));
    await dropFiles(files.map((f) => f.id));
    return true;
  }
  if (type === "model") {
    const [m] = await db.select().from(s.models3d).where(and(eq(s.models3d.id, id), isNotNull(s.models3d.deletedAt)));
    if (!m) return false;
    await dropShareItems("model", id);
    // Deleting the model's file removes the model row with it.
    await dropFiles([m.fileId, ...(m.coverFileId ? [m.coverFileId] : [])]);
    return true;
  }
  if (type === "tour") {
    const [t] = await db.select({ id: s.tours.id }).from(s.tours).where(and(eq(s.tours.id, id), isNotNull(s.tours.deletedAt)));
    if (!t) return false;
    const scenes = await db.select({ id: s.tourScenes.fileId }).from(s.tourScenes).where(eq(s.tourScenes.tourId, id));
    await dropShareItems("tour", id);
    await db.delete(s.tours).where(eq(s.tours.id, id));
    await dropFiles(scenes.map((f) => f.id));
    return true;
  }
  if (type === "report") {
    const [r] = await db.select({ id: s.siteReports.id }).from(s.siteReports).where(and(eq(s.siteReports.id, id), isNotNull(s.siteReports.deletedAt)));
    if (!r) return false;
    const photos = await db.select({ id: s.siteReportPhotos.fileId }).from(s.siteReportPhotos).where(eq(s.siteReportPhotos.reportId, id));
    await db.delete(s.siteReports).where(eq(s.siteReports.id, id));
    await dropFiles(photos.map((f) => f.id));
    return true;
  }
  if (type === "firm") {
    const [f] = await db.select({ id: s.firms.id }).from(s.firms).where(and(eq(s.firms.id, id), isNotNull(s.firms.deletedAt)));
    if (!f) return false;
    await db.delete(s.firms).where(eq(s.firms.id, id)); // its projects stay, without a firm
    return true;
  }
  // A project: everything in it goes, files included.
  const [proj] = await db.select({ id: s.projects.id }).from(s.projects).where(and(eq(s.projects.id, id), isNotNull(s.projects.deletedAt)));
  if (!proj) return false;
  const files = await db.select({ key: s.files.storageKey }).from(s.files).where(eq(s.files.projectId, id));
  await db.delete(s.projects).where(eq(s.projects.id, id)); // cascades to its records and file rows
  for (const f of files) await deleteStoredWithCopies(f.key);
  return true;
}

/** Removes everything that has been in the bin longer than the retention period. */
export async function purgeExpired() {
  const days = await trashDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const db = await getDb();
  const expired = (
    await Promise.all([
      db.select({ id: s.drawings.id }).from(s.drawings).where(lt(s.drawings.deletedAt, cutoff)).then((r) => r.map((x) => ({ type: "drawing" as const, id: x.id }))),
      db.select({ id: s.models3d.id }).from(s.models3d).where(lt(s.models3d.deletedAt, cutoff)).then((r) => r.map((x) => ({ type: "model" as const, id: x.id }))),
      db.select({ id: s.tours.id }).from(s.tours).where(lt(s.tours.deletedAt, cutoff)).then((r) => r.map((x) => ({ type: "tour" as const, id: x.id }))),
      db.select({ id: s.siteReports.id }).from(s.siteReports).where(lt(s.siteReports.deletedAt, cutoff)).then((r) => r.map((x) => ({ type: "report" as const, id: x.id }))),
      db.select({ id: s.firms.id }).from(s.firms).where(lt(s.firms.deletedAt, cutoff)).then((r) => r.map((x) => ({ type: "firm" as const, id: x.id }))),
      db.select({ id: s.projects.id }).from(s.projects).where(lt(s.projects.deletedAt, cutoff)).then((r) => r.map((x) => ({ type: "project" as const, id: x.id }))),
    ])
  ).flat();
  let removed = 0;
  for (const item of expired) {
    try {
      if (await purgeItem(item.type, item.id)) removed++;
    } catch (err) {
      console.warn(`[skape360] could not purge ${item.type} ${item.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { removed, days };
}

/** Recent deletions for the audit trail shown on the bin page. */
export async function recentPurges(limit = 5) {
  const db = await getDb();
  return db
    .select({ at: s.auditLog.createdAt, meta: s.auditLog.meta })
    .from(s.auditLog)
    .where(eq(s.auditLog.action, "purge"))
    .orderBy(desc(s.auditLog.createdAt))
    .limit(limit);
}

/** Whole days until an item in the bin is removed for good (0 = tonight). */
export function daysLeft(deletedAt: Date, days: number) {
  return Math.max(0, Math.ceil((deletedAt.getTime() + days * 86_400_000 - Date.now()) / 86_400_000));
}
