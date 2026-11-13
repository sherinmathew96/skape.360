import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { clientDrawings, clientRegister, type ClientDrawing } from "./drawings";
import { clientSiteUpdates } from "./site";
import { getTours, type TourData } from "./studio";

export type ShareState = "ok" | "locked" | "revoked" | "expired" | "missing";

export const shareCookieName = (linkId: string) => `skape_share_${linkId.replaceAll("-", "")}`;

/** What the unlock cookie must hold: changes if the passcode or token changes. */
export const shareCookieValue = (token: string, passcodeHash: string) =>
  createHash("sha256").update(`${token}:${passcodeHash}`).digest("base64url");

export async function loadShare(token: string) {
  // 8-character codes now; older links have 24.
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) return { state: "missing" as const, link: null };
  const db = await getDb();
  const [link] = await db
    .select({
      id: s.shareLinks.id,
      token: s.shareLinks.token,
      title: s.shareLinks.title,
      message: s.shareLinks.message,
      passcodeHash: s.shareLinks.passcodeHash,
      expiresAt: s.shareLinks.expiresAt,
      revokedAt: s.shareLinks.revokedAt,
      projectName: s.projects.name,
      clientName: s.clients.name,
    })
    .from(s.shareLinks)
    .innerJoin(s.projects, eq(s.projects.id, s.shareLinks.projectId))
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .where(eq(s.shareLinks.token, token));

  if (!link) return { state: "missing" as const, link: null };
  if (link.revokedAt) return { state: "revoked" as const, link };
  if (link.expiresAt && link.expiresAt < new Date()) return { state: "expired" as const, link };
  if (link.passcodeHash) {
    const cookie = (await cookies()).get(shareCookieName(link.id))?.value;
    if (cookie !== shareCookieValue(link.token, link.passcodeHash)) return { state: "locked" as const, link };
  }
  return { state: "ok" as const, link };
}

export type SharedModel = { id: string; title: string; fileId: string; coverFileId: string | null; view: s.ModelView };

export async function loadSharedItems(linkId: string): Promise<{
  models: SharedModel[];
  tours: TourData[];
  drawings: ClientDrawing[];
  siteUpdates: Awaited<ReturnType<typeof clientSiteUpdates>>;
  register: Awaited<ReturnType<typeof clientRegister>>;
  order: { itemType: s.ShareItemType; itemId: string }[];
}> {
  const db = await getDb();
  const order = await db
    .select({ itemType: s.shareLinkItems.itemType, itemId: s.shareLinkItems.itemId })
    .from(s.shareLinkItems)
    .where(eq(s.shareLinkItems.shareLinkId, linkId))
    .orderBy(s.shareLinkItems.position);
  const modelIds = order.filter((i) => i.itemType === "model").map((i) => i.itemId);
  const tourIds = order.filter((i) => i.itemType === "tour").map((i) => i.itemId);
  const drawingIds = order.filter((i) => i.itemType === "drawing").map((i) => i.itemId);
  const siteProject = order.find((i) => i.itemType === "site_updates")?.itemId;
  const registerProject = order.find((i) => i.itemType === "drawing_register")?.itemId;
  const [models, tours, drawings, siteUpdates, register] = await Promise.all([
    modelIds.length
      ? db.select({ id: s.models3d.id, title: s.models3d.title, fileId: s.models3d.fileId, coverFileId: s.models3d.coverFileId, view: s.models3d.view }).from(s.models3d).where(and(inArray(s.models3d.id, modelIds), isNull(s.models3d.deletedAt)))
      : Promise.resolve([]),
    getTours(tourIds),
    clientDrawings(drawingIds),
    siteProject ? clientSiteUpdates(siteProject) : Promise.resolve([]),
    registerProject ? clientRegister(registerProject) : Promise.resolve([]),
  ]);
  return { models, tours, drawings, siteUpdates, register, order };
}

/** Is this file part of something the link shares? */
export async function isSharedFile(linkId: string, fileId: string) {
  const { models, tours, drawings, siteUpdates, register } = await loadSharedItems(linkId);
  return (
    models.some((m) => m.fileId === fileId || m.coverFileId === fileId) ||
    tours.some((t) => t.scenes.some((sc) => sc.fileId === fileId)) ||
    drawings.some((d) => d.revision.fileId === fileId) ||
    siteUpdates.some((r) => r.photos.some((p) => p.fileId === fileId)) ||
    register.some((g) => g.drawings.some((d) => d.revision?.fileId === fileId))
  );
}

export async function logShareView(linkId: string, via: "page" | "embed") {
  const db = await getDb();
  await db.insert(s.shareViews).values({ shareLinkId: linkId, via });
}

export async function getReadyFile(fileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const db = await getDb();
  const [file] = await db
    .select()
    .from(s.files)
    .where(and(eq(s.files.id, fileId), eq(s.files.ready, true)));
  return file ?? null;
}
