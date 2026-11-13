import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { hashPassword } from "./password";
import { hasFirmAccess, RESERVED_SLUGS, SLUG_RE, slugify, slugTaken } from "./portal";

/** The firm at this address and whether this visitor may see its projects. Cached per request. */
export const loadFirm = cache(async (rawSlug: string) => {
  const slug = rawSlug.toLowerCase();
  if (!SLUG_RE.test(slug)) return { state: "missing" as const, firm: null };
  const db = await getDb();
  const [firm] = await db.select().from(s.firms).where(and(eq(s.firms.slug, slug), isNull(s.firms.deletedAt)));
  if (!firm || !firm.enabled) return { state: "missing" as const, firm: null };
  return { state: (await hasFirmAccess(firm)) ? ("ok" as const) : ("locked" as const), firm };
});

export type FirmProjectCard = {
  id: string;
  name: string;
  clientName: string;
  type: s.ProjectType;
  location: string | null;
  status: s.ProjectStatus;
  dueDate: string | null;
  stage: string;
  stagesDone: number;
  stagesTotal: number;
  portalSlug: string | null;
  image: string | null;
};

/** The projects the studio did for a firm, newest first, each with a picture for its card. */
export async function firmProjects(firmId: string): Promise<FirmProjectCard[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.projects.id,
      name: s.projects.name,
      clientName: s.clients.name,
      type: s.projects.type,
      location: s.projects.location,
      status: s.projects.status,
      dueDate: s.projects.dueDate,
      portalSlug: s.clientPortals.slug,
      portalEnabled: s.clientPortals.enabled,
      coverFileId: s.clientPortals.coverFileId,
    })
    .from(s.projects)
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .leftJoin(s.clientPortals, eq(s.clientPortals.projectId, s.projects.id))
    .where(and(eq(s.projects.firmId, firmId), isNull(s.projects.deletedAt)))
    .orderBy(desc(s.projects.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [stages, models] = await Promise.all([
    db
      .select({ projectId: s.projectStages.projectId, name: s.projectStages.name, status: s.projectStages.status })
      .from(s.projectStages)
      .where(inArray(s.projectStages.projectId, ids))
      .orderBy(asc(s.projectStages.position)),
    // A model's still stands in when the portal has no cover image.
    db
      .select({ projectId: s.models3d.projectId, coverFileId: s.models3d.coverFileId })
      .from(s.models3d)
      .where(and(inArray(s.models3d.projectId, ids), isNull(s.models3d.deletedAt), sql`${s.models3d.coverFileId} is not null`))
      .orderBy(desc(s.models3d.createdAt)),
  ]);
  return rows.map((r) => {
    const own = stages.filter((st) => st.projectId === r.id);
    const current = own.find((st) => st.status === "in_progress");
    const done = own.filter((st) => st.status === "approved").length;
    const slug = r.portalSlug && r.portalEnabled ? r.portalSlug : null;
    const still = r.coverFileId ?? models.find((m) => m.projectId === r.id)?.coverFileId ?? null;
    return {
      id: r.id,
      name: r.name,
      clientName: r.clientName,
      type: r.type,
      location: r.location,
      status: r.status,
      dueDate: r.dueDate,
      stage: current?.name ?? (own.length && done === own.length ? "Completed" : "Not started"),
      stagesDone: done,
      stagesTotal: own.length,
      portalSlug: slug,
      image: slug && still ? `/${slug}/f/${still}` : null,
    };
  });
}

/** Firms for the studio's list, with how many projects each has. */
export async function listFirms() {
  const db = await getDb();
  return db
    .select({
      id: s.firms.id,
      name: s.firms.name,
      slug: s.firms.slug,
      contactName: s.firms.contactName,
      phone: s.firms.phone,
      email: s.firms.email,
      enabled: s.firms.enabled,
      hasPasscode: sql<boolean>`${s.firms.passcodeHash} is not null`,
      views: s.firms.views,
      lastViewedAt: s.firms.lastViewedAt,
      projects: sql<number>`(select count(*) from ${s.projects} p where p.firm_id = "firms"."id" and p.deleted_at is null)::int`,
    })
    .from(s.firms)
    .where(isNull(s.firms.deletedAt))
    .orderBy(asc(s.firms.name));
}

export async function getFirm(firmId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(firmId)) return null;
  const db = await getDb();
  const [firm] = await db.select().from(s.firms).where(and(eq(s.firms.id, firmId), isNull(s.firms.deletedAt)));
  return firm ?? null;
}

export async function logFirmView(firmId: string) {
  const db = await getDb();
  await db
    .update(s.firms)
    .set({ views: sql`${s.firms.views} + 1`, lastViewedAt: new Date() })
    .where(eq(s.firms.id, firmId));
}

/** A free address made from a name: "noble", then "noble-2", "noble-3"… */
export async function freeSlug(name: string, except: { portalId?: string; firmId?: string } = {}) {
  const base = slugify(name).slice(0, 52) || "project";
  for (let n = 1; n < 200; n++) {
    const slug = n === 1 ? (base.length >= 3 ? base : `${base}-project`) : `${base}-${n}`;
    if (!RESERVED_SLUGS.has(slug) && SLUG_RE.test(slug) && !(await slugTaken(slug, except))) return slug;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/**
 * Every project done for a firm needs a portal page for the firm's cards to
 * open. One is made with a passcode nobody knows, so only the firm's own
 * page (or a client passcode the studio sets later) opens it.
 */
export async function ensurePortal(projectId: string, userId: string) {
  const db = await getDb();
  const [existing] = await db.select({ id: s.clientPortals.id }).from(s.clientPortals).where(eq(s.clientPortals.projectId, projectId));
  if (existing) return;
  const [project] = await db.select({ name: s.projects.name }).from(s.projects).where(eq(s.projects.id, projectId));
  if (!project) return;
  await db.insert(s.clientPortals).values({
    projectId,
    slug: await freeSlug(project.name),
    passcodeHash: await hashPassword(randomBytes(24).toString("base64url")),
    createdBy: userId,
  });
}
