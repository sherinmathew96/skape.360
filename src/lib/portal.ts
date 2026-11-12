import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { clientRegister } from "./drawings";
import { clientSiteUpdates } from "./site";
import { getTours } from "./studio";

/** First-level paths the app already uses; a portal can't take them. */
export const RESERVED_SLUGS = new Set([
  "api", "e", "embed", "s", "f", "login", "logout", "print", "projects", "finance", "purchasing", "settings",
  "suppliers", "tasks", "team", "admin", "account", "help", "portal", "home", "studio", "skape", "skape360",
  "manifest.webmanifest", "icon.svg", "favicon.ico", "robots.txt", "sitemap.xml", "_next",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;

/** "Kadavil Residence, Aluva" → "kadavil-residence-aluva" */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function checkSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3–60 lowercase letters, numbers and hyphens, e.g. kadavil-residence.";
  if (RESERVED_SLUGS.has(slug)) return `“${slug}” is used by the app. Pick another address.`;
  return null;
}

export const portalCookieName = (portalId: string) => `skape_portal_${portalId.replaceAll("-", "")}`;
export const portalCookieValue = (portalId: string, slug: string, passcodeHash: string) =>
  createHash("sha256").update(`portal:${portalId}:${slug}:${passcodeHash}`).digest("base64url");

export type PortalState = "ok" | "locked" | "missing";

/** The portal at this address with its project, and whether this visitor may go in. Cached per request. */
export const loadPortal = cache(async (rawSlug: string) => {
  const slug = rawSlug.toLowerCase();
  if (!SLUG_RE.test(slug)) return { state: "missing" as const, portal: null };
  const db = await getDb();
  const [portal] = await db
    .select({
      id: s.clientPortals.id,
      slug: s.clientPortals.slug,
      enabled: s.clientPortals.enabled,
      passcodeHash: s.clientPortals.passcodeHash,
      coverFileId: s.clientPortals.coverFileId,
      brief: s.clientPortals.brief,
      area: s.clientPortals.area,
      sections: s.clientPortals.sections,
      projectId: s.projects.id,
      projectName: s.projects.name,
      projectCode: s.projects.code,
      projectType: s.projects.type,
      projectStatus: s.projects.status,
      location: s.projects.location,
      startDate: s.projects.startDate,
      dueDate: s.projects.dueDate,
      clientName: s.clients.name,
    })
    .from(s.clientPortals)
    .innerJoin(s.projects, eq(s.projects.id, s.clientPortals.projectId))
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .where(and(eq(s.clientPortals.slug, slug), isNull(s.projects.deletedAt)));
  if (!portal || !portal.enabled) return { state: "missing" as const, portal: null };
  if (portal.passcodeHash) {
    const cookie = (await cookies()).get(portalCookieName(portal.id))?.value;
    if (cookie !== portalCookieValue(portal.id, portal.slug, portal.passcodeHash)) return { state: "locked" as const, portal };
  }
  return { state: "ok" as const, portal };
});

export type Portal = NonNullable<Awaited<ReturnType<typeof loadPortal>>["portal"]>;

/**
 * Everything the client can see, built from what the studio already marks
 * for clients: drawings shown on the register, every 3D model, every tour
 * with rooms, and site reports marked for the client.
 */
export const portalContent = cache(async (portal: Pick<Portal, "projectId" | "sections">) => {
  const db = await getDb();
  const on = portal.sections;
  const [stages, models, tourRows, register, siteUpdates] = await Promise.all([
    db
      .select({ id: s.projectStages.id, name: s.projectStages.name, status: s.projectStages.status })
      .from(s.projectStages)
      .where(eq(s.projectStages.projectId, portal.projectId))
      .orderBy(asc(s.projectStages.position)),
    on.models
      ? db
          .select({ id: s.models3d.id, title: s.models3d.title, fileId: s.models3d.fileId, coverFileId: s.models3d.coverFileId, view: s.models3d.view, createdAt: s.models3d.createdAt })
          .from(s.models3d)
          .where(eq(s.models3d.projectId, portal.projectId))
          .orderBy(desc(s.models3d.createdAt))
      : Promise.resolve([]),
    on.tours
      ? db
          .select({ id: s.tours.id })
          .from(s.tours)
          .where(and(eq(s.tours.projectId, portal.projectId), sql`exists (select 1 from ${s.tourScenes} ts where ts.tour_id = ${s.tours.id})`))
          .orderBy(desc(s.tours.createdAt))
      : Promise.resolve([]),
    on.drawings ? clientRegister(portal.projectId) : Promise.resolve([]),
    on.site ? clientSiteUpdates(portal.projectId) : Promise.resolve([]),
  ]);
  const tours = await getTours(tourRows.map((t) => t.id));
  return { stages, models, tours, register, siteUpdates };
});

export type PortalContent = Awaited<ReturnType<typeof portalContent>>;

/** Is this file part of what the portal shows? */
export async function isPortalFile(portal: Portal, fileId: string) {
  if (portal.coverFileId === fileId) return true;
  const { models, tours, register, siteUpdates } = await portalContent(portal);
  return (
    models.some((m) => m.fileId === fileId || m.coverFileId === fileId) ||
    tours.some((t) => t.scenes.some((sc) => sc.fileId === fileId)) ||
    register.some((g) => g.drawings.some((d) => d.revision?.fileId === fileId)) ||
    siteUpdates.some((r) => r.photos.some((p) => p.fileId === fileId))
  );
}

export async function logPortalView(portalId: string) {
  const db = await getDb();
  await db
    .update(s.clientPortals)
    .set({ views: sql`${s.clientPortals.views} + 1`, lastViewedAt: new Date() })
    .where(eq(s.clientPortals.id, portalId));
}

/** The studio's view of a project's portal, for the sharing page. */
export async function getProjectPortal(projectId: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.clientPortals).where(eq(s.clientPortals.projectId, projectId));
  return row ?? null;
}
