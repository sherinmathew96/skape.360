import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

export type ModelRow = {
  id: string;
  title: string;
  fileId: string;
  size: number;
  createdAt: Date;
  createdByName: string | null;
};

export async function listModels(projectId: string): Promise<ModelRow[]> {
  const db = await getDb();
  return db
    .select({
      id: s.models3d.id,
      title: s.models3d.title,
      fileId: s.models3d.fileId,
      size: s.files.size,
      createdAt: s.models3d.createdAt,
      createdByName: s.users.name,
    })
    .from(s.models3d)
    .innerJoin(s.files, eq(s.files.id, s.models3d.fileId))
    .leftJoin(s.users, eq(s.users.id, s.models3d.createdBy))
    .where(eq(s.models3d.projectId, projectId))
    .orderBy(desc(s.models3d.createdAt));
}

export async function getModel(projectId: string, modelId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(modelId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: s.models3d.id, title: s.models3d.title, fileId: s.models3d.fileId, size: s.files.size, name: s.files.name })
    .from(s.models3d)
    .innerJoin(s.files, eq(s.files.id, s.models3d.fileId))
    .where(and(eq(s.models3d.projectId, projectId), eq(s.models3d.id, modelId)));
  return row ?? null;
}

export type TourData = {
  id: string;
  title: string;
  scenes: { id: string; title: string; fileId: string; position: number }[];
  hotspots: { id: string; sceneId: string; targetSceneId: string; yaw: number; pitch: number }[];
};

export async function listTours(projectId: string) {
  const db = await getDb();
  return db
    .select({
      id: s.tours.id,
      title: s.tours.title,
      createdAt: s.tours.createdAt,
      scenes: sql<number>`(select count(*) from ${s.tourScenes} ts where ts.tour_id = "tours"."id")::int`,
      firstFileId: sql<string | null>`(select ts.file_id from ${s.tourScenes} ts where ts.tour_id = "tours"."id" order by ts.position limit 1)`,
    })
    .from(s.tours)
    .where(eq(s.tours.projectId, projectId))
    .orderBy(desc(s.tours.createdAt));
}

export async function getTours(tourIds: string[]): Promise<TourData[]> {
  if (tourIds.length === 0) return [];
  const db = await getDb();
  const [tours, scenes] = await Promise.all([
    db.select({ id: s.tours.id, title: s.tours.title }).from(s.tours).where(inArray(s.tours.id, tourIds)),
    db
      .select({ id: s.tourScenes.id, tourId: s.tourScenes.tourId, title: s.tourScenes.title, fileId: s.tourScenes.fileId, position: s.tourScenes.position })
      .from(s.tourScenes)
      .where(inArray(s.tourScenes.tourId, tourIds))
      .orderBy(asc(s.tourScenes.position), asc(s.tourScenes.createdAt)),
  ]);
  const sceneIds = scenes.map((sc) => sc.id);
  const hotspots = sceneIds.length
    ? await db.select().from(s.tourHotspots).where(inArray(s.tourHotspots.sceneId, sceneIds))
    : [];
  return tourIds
    .map((id) => tours.find((t) => t.id === id))
    .filter((t): t is { id: string; title: string } => Boolean(t))
    .map((t) => {
      const own = scenes.filter((sc) => sc.tourId === t.id).map((sc) => ({ id: sc.id, title: sc.title, fileId: sc.fileId, position: sc.position }));
      const ids = new Set(own.map((sc) => sc.id));
      return { ...t, scenes: own, hotspots: hotspots.filter((h) => ids.has(h.sceneId)) };
    });
}

export async function getTour(projectId: string, tourId: string): Promise<TourData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(tourId)) return null;
  const db = await getDb();
  const [own] = await db
    .select({ id: s.tours.id })
    .from(s.tours)
    .where(and(eq(s.tours.projectId, projectId), eq(s.tours.id, tourId)));
  if (!own) return null;
  const [tour] = await getTours([tourId]);
  return tour ?? null;
}

export type ShareRow = {
  id: string;
  token: string;
  title: string;
  hasPasscode: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
  views: number;
  lastViewedAt: Date | null;
  items: { itemType: s.ShareItemType; itemId: string }[];
};

export async function listShareLinks(projectId: string): Promise<ShareRow[]> {
  const db = await getDb();
  const links = await db
    .select({
      id: s.shareLinks.id,
      token: s.shareLinks.token,
      title: s.shareLinks.title,
      passcodeHash: s.shareLinks.passcodeHash,
      expiresAt: s.shareLinks.expiresAt,
      revokedAt: s.shareLinks.revokedAt,
      createdAt: s.shareLinks.createdAt,
      createdByName: s.users.name,
      views: sql<number>`(select count(*) from ${s.shareViews} v where v.share_link_id = "share_links"."id")::int`,
      lastViewedAt: sql<Date | null>`(select max(v.created_at) from ${s.shareViews} v where v.share_link_id = "share_links"."id")`,
    })
    .from(s.shareLinks)
    .leftJoin(s.users, eq(s.users.id, s.shareLinks.createdBy))
    .where(eq(s.shareLinks.projectId, projectId))
    .orderBy(sql`${s.shareLinks.revokedAt} is not null`, desc(s.shareLinks.createdAt));
  if (links.length === 0) return [];
  const items = await db
    .select()
    .from(s.shareLinkItems)
    .where(inArray(s.shareLinkItems.shareLinkId, links.map((l) => l.id)))
    .orderBy(asc(s.shareLinkItems.position));
  return links.map(({ passcodeHash, ...l }) => ({
    ...l,
    lastViewedAt: l.lastViewedAt ? new Date(l.lastViewedAt) : null,
    hasPasscode: passcodeHash !== null,
    items: items.filter((i) => i.shareLinkId === l.id).map(({ itemType, itemId }) => ({ itemType, itemId })),
  }));
}

/** The open (not revoked) embed link for one item, if one was made. */
export async function findEmbedLink(projectId: string, itemType: s.ShareItemType, itemId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ token: s.shareLinks.token })
    .from(s.shareLinks)
    .innerJoin(s.shareLinkItems, eq(s.shareLinkItems.shareLinkId, s.shareLinks.id))
    .where(
      and(
        eq(s.shareLinks.projectId, projectId),
        isNull(s.shareLinks.revokedAt),
        isNull(s.shareLinks.passcodeHash),
        isNull(s.shareLinks.expiresAt),
        sql`${s.shareLinks.title} like 'Embed:%'`,
        eq(s.shareLinkItems.itemType, itemType),
        eq(s.shareLinkItems.itemId, itemId),
      ),
    )
    .limit(1);
  return row?.token ?? null;
}
