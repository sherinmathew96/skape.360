"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, gt, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { WORK_STATUSES } from "@/db/schema";
import { requireProjectMember } from "@/lib/access";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";

type Result = { error?: string; ok?: string };

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date.")
  .optional()
  .transform((v) => v || null);
const heading = z.string().trim().min(2, "Name the main work, e.g. Excavation.").max(120);
const subTitle = z.string().trim().min(2, "Describe the sub work.").max(2000);

/** The project's team with site or project rights, on a construction project. */
async function requireWorksWriter(projectId: string) {
  const ctx = await requireProjectMember(projectId);
  if (!can(ctx.user, "projects.edit") && !can(ctx.user, "site.report")) throw new Error("Only project managers and site engineers update the timeline.");
  if (ctx.project.type === "design") throw new Error("Design-only projects have no works timeline.");
  return ctx;
}

async function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  const db = await getDb();
  const [portal] = await db.select({ slug: s.clientPortals.slug }).from(s.clientPortals).where(eq(s.clientPortals.projectId, projectId));
  if (portal) revalidatePath(`/${portal.slug}`, "layout");
}


/** Writes the project's works in this order, numbering them 1, 2, 3… */
async function writeOrder(projectId: string, ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  const values = sql.join(
    ids.map((id, i) => sql`(${id}::uuid, ${i + 1}::int)`),
    sql`, `,
  );
  await db.execute(sql`update works set position = v.p from (values ${values}) as v(id, p) where works.id = v.id and works.project_id = ${projectId}`);
}

async function orderedIds(projectId: string) {
  const db = await getDb();
  return db
    .select({ id: s.works.id, section: s.works.section })
    .from(s.works)
    .where(eq(s.works.projectId, projectId))
    .orderBy(asc(s.works.position), asc(s.works.createdAt));
}

const fail = (err: unknown) => ({ error: err instanceof Error ? err.message : "Not allowed." });

/** A new main work (heading) at the end of the timeline, with its sub works, one per line. */
export async function addHeading(_: Result | undefined, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ section: heading, subs: z.string().max(20000) })
    .safeParse({ section: formData.get("section") ?? "", subs: formData.get("subs") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const titles = parsed.data.subs
    .split(/\r?\n/)
    .map((t) => t.replace(/^\s*(\d+(\.\d+)*[.)]?|[-•*])\s+/, "").trim())
    .filter((t) => t.length >= 2)
    .slice(0, 200);
  if (!titles.length) return { error: "Add at least one sub work, one per line." };
  let ctx;
  try {
    ctx = await requireWorksWriter(String(formData.get("projectId")));
  } catch (err) {
    return fail(err);
  }
  const db = await getDb();
  const projectId = ctx.project.id;
  const section = parsed.data.section;
  const [taken] = await db.select({ id: s.works.id }).from(s.works).where(and(eq(s.works.projectId, projectId), eq(s.works.section, section))).limit(1);
  if (taken) return { error: `“${section}” is already on the timeline. Add sub works under it instead.` };
  const [end] = await db.select({ p: max(s.works.position) }).from(s.works).where(eq(s.works.projectId, projectId));
  const start = end?.p ?? 0;
  await db.insert(s.works).values(titles.map((title, i) => ({ projectId, section, title, position: start + i + 1, updatedBy: ctx.user.id })));
  await db.insert(s.auditLog).values({ userId: ctx.user.id, action: "create", entity: "work_heading", entityId: projectId, meta: { section, count: titles.length } });
  await refresh(projectId);
  return { ok: `${section} added with ${titles.length} ${titles.length === 1 ? "sub work" : "sub works"}.` };
}

/** One sub work at the end of a main work. */
export async function addSubWork(_: Result | undefined, formData: FormData): Promise<Result> {
  const parsed = z
    .object({ section: heading, title: subTitle, plannedStart: isoDate, plannedEnd: isoDate })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.plannedStart && v.plannedEnd && v.plannedEnd < v.plannedStart) return { error: "The planned finish is before the start." };
  let ctx;
  try {
    ctx = await requireWorksWriter(String(formData.get("projectId")));
  } catch (err) {
    return fail(err);
  }
  const db = await getDb();
  const projectId = ctx.project.id;
  const [last] = await db
    .select({ p: max(s.works.position) })
    .from(s.works)
    .where(and(eq(s.works.projectId, projectId), eq(s.works.section, v.section)));
  let position: number;
  if (last?.p) {
    position = last.p + 1;
    await db
      .update(s.works)
      .set({ position: sql`${s.works.position} + 1` })
      .where(and(eq(s.works.projectId, projectId), gt(s.works.position, last.p)));
  } else {
    const [end] = await db.select({ p: max(s.works.position) }).from(s.works).where(eq(s.works.projectId, projectId));
    position = (end?.p ?? 0) + 1;
  }
  const [row] = await db
    .insert(s.works)
    .values({ projectId, section: v.section, title: v.title, position, plannedStart: v.plannedStart, plannedEnd: v.plannedEnd, updatedBy: ctx.user.id })
    .returning({ id: s.works.id });
  await db.insert(s.auditLog).values({ userId: ctx.user.id, action: "create", entity: "work", entityId: row.id, meta: { projectId, title: v.title.slice(0, 80) } });
  await refresh(projectId);
  return { ok: "Added." };
}

/** Renames a main work; its sub works move with it. */
export async function renameSection(_: Result | undefined, formData: FormData): Promise<Result> {
  const parsed = z.object({ from: z.string().min(1), to: heading }).safeParse({ from: formData.get("from"), to: formData.get("to") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  let ctx;
  try {
    ctx = await requireWorksWriter(String(formData.get("projectId")));
  } catch (err) {
    return fail(err);
  }
  const { from, to } = parsed.data;
  if (from === to) return { ok: "Saved." };
  const db = await getDb();
  const [taken] = await db.select({ id: s.works.id }).from(s.works).where(and(eq(s.works.projectId, ctx.project.id), eq(s.works.section, to))).limit(1);
  if (taken) return { error: `There is already a main work called “${to}”.` };
  await db.update(s.works).set({ section: to, updatedAt: new Date() }).where(and(eq(s.works.projectId, ctx.project.id), eq(s.works.section, from)));
  await refresh(ctx.project.id);
  return { ok: "Saved." };
}

/** Removes a main work and all its sub works. */
export async function deleteSection(formData: FormData) {
  const { user, project } = await requireWorksWriter(String(formData.get("projectId")));
  const section = String(formData.get("section"));
  const db = await getDb();
  await db.delete(s.works).where(and(eq(s.works.projectId, project.id), eq(s.works.section, section)));
  await db.insert(s.auditLog).values({ userId: user.id, action: "delete", entity: "work_heading", entityId: project.id, meta: { section } });
  await writeOrder(project.id, (await orderedIds(project.id)).map((r) => r.id));
  await refresh(project.id);
}

/** Works read from a pasted BOQ or list, added after the existing ones (or in their place). */
export async function importWorks(input: {
  projectId: string;
  replace: boolean;
  rows: { section: string; code: string | null; title: string; unit: string | null; qty: number | null; rate: number | null; amount: number | null }[];
}): Promise<Result> {
  const rows = z
    .array(
      z.object({
        section: z.string().trim().max(120).transform((v) => v || "Works"),
        code: z.string().trim().max(20).nullable(),
        title: z.string().trim().min(2).max(2000),
        unit: z.string().trim().max(20).nullable(),
        qty: z.number().min(0).max(1e10).nullable(),
        rate: z.number().min(0).max(1e10).nullable(),
        amount: z.number().min(0).max(1e12).nullable(),
      }),
    )
    .min(1, "Nothing to add: paste the BOQ rows first.")
    .max(500, "Up to 500 works at a time.")
    .safeParse(input.rows);
  if (!rows.success) return { error: rows.error.issues[0]?.message ?? "Some rows could not be read." };
  let ctx;
  try {
    ctx = await requireWorksWriter(input.projectId);
  } catch (err) {
    return fail(err);
  }
  const db = await getDb();
  const projectId = ctx.project.id;
  // When the BOQ is uploaded again, works still in it keep their progress and dates.
  const key = (section: string, title: string) => `${section}\u0000${title}`.toLowerCase().replace(/\s+/g, " ").trim();
  const kept = new Map<string, typeof s.works.$inferSelect>();
  if (input.replace) {
    if (!can(ctx.user, "projects.edit")) return { error: "Only project managers can replace the whole timeline." };
    for (const w of await db.select().from(s.works).where(eq(s.works.projectId, projectId))) kept.set(key(w.section, w.title), w);
    await db.delete(s.works).where(eq(s.works.projectId, projectId));
  }
  const [end] = await db.select({ p: max(s.works.position) }).from(s.works).where(eq(s.works.projectId, projectId));
  const start = end?.p ?? 0;
  let carried = 0;
  await db.insert(s.works).values(
    rows.data.map((r, i) => {
      const old = kept.get(key(r.section, r.title));
      if (old && old.status !== "pending") carried++;
      return {
        projectId,
        section: r.section,
        code: r.code || null,
        title: r.title,
        position: start + i + 1,
        status: old?.status ?? "pending",
        plannedStart: old?.plannedStart ?? null,
        plannedEnd: old?.plannedEnd ?? null,
        startedOn: old?.startedOn ?? null,
        completedOn: old?.completedOn ?? null,
        note: old?.note ?? null,
        updatedBy: ctx.user.id,
      };
    }),
  );
  await db.insert(s.auditLog).values({ userId: ctx.user.id, action: input.replace ? "replace" : "import", entity: "works", entityId: projectId, meta: { count: rows.data.length, carried } });
  await refresh(projectId);
  const n = `${rows.data.length} ${rows.data.length === 1 ? "sub work" : "sub works"}`;
  return { ok: input.replace ? `Timeline replaced: ${n}${carried ? `, ${carried} kept their progress` : ""}.` : `${n} added.` };
}

async function loadWork(id: string) {
  const db = await getDb();
  const [work] = await db.select().from(s.works).where(eq(s.works.id, uuid.parse(id)));
  if (!work) throw new Error("That work was not found.");
  const ctx = await requireWorksWriter(work.projectId);
  return { ...ctx, work };
}

/** Marks a sub work started, completed, or back to not started. */
export async function setWorkStatus(formData: FormData) {
  const { user, work } = await loadWork(String(formData.get("id")));
  const status = z.enum(WORK_STATUSES).parse(formData.get("status"));
  const t = today();
  const db = await getDb();
  await db
    .update(s.works)
    .set({
      status,
      startedOn: status === "pending" ? null : (work.startedOn ?? t),
      completedOn: status === "done" ? (work.completedOn ?? t) : null,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(s.works.id, work.id));
  await db.insert(s.auditLog).values({ userId: user.id, action: status === "done" ? "complete" : status === "started" ? "start" : "reset", entity: "work", entityId: work.id });
  await refresh(work.projectId);
}

/** Edits a sub work: its words, main work, planned dates and the actual dates. */
export async function updateWork(_: Result | undefined, formData: FormData): Promise<Result> {
  const parsed = z
    .object({
      section: heading,
      title: subTitle,
      plannedStart: isoDate,
      plannedEnd: isoDate,
      startedOn: isoDate,
      completedOn: isoDate,
      note: z.string().trim().max(1000).optional().transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.plannedStart && v.plannedEnd && v.plannedEnd < v.plannedStart) return { error: "The planned finish is before the start." };
  if (v.startedOn && v.completedOn && v.completedOn < v.startedOn) return { error: "It can't be completed before it started." };
  const t = today();
  if ((v.startedOn && v.startedOn > t) || (v.completedOn && v.completedOn > t)) return { error: "Started and completed dates can't be in the future." };
  let ctx;
  try {
    ctx = await loadWork(String(formData.get("id")));
  } catch (err) {
    return fail(err);
  }
  const status = v.completedOn ? "done" : v.startedOn ? "started" : "pending";
  const db = await getDb();
  const moved = v.section !== ctx.work.section;
  await db
    .update(s.works)
    .set({
      section: v.section,
      title: v.title,
      plannedStart: v.plannedStart,
      plannedEnd: v.plannedEnd,
      startedOn: v.startedOn ?? v.completedOn,
      completedOn: v.completedOn,
      status,
      note: v.note,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(s.works.id, ctx.work.id));
  if (moved) {
    // Put it at the end of the main work it moved to.
    const rows = (await orderedIds(ctx.work.projectId)).filter((r) => r.id !== ctx.work.id);
    const lastOfTarget = rows.map((r) => r.section).lastIndexOf(v.section);
    const ids = rows.map((r) => r.id);
    ids.splice(lastOfTarget + 1, 0, ctx.work.id);
    await writeOrder(ctx.work.projectId, ids);
  }
  await refresh(ctx.work.projectId);
  return { ok: "Saved." };
}

/** Moves a sub work one place up or down within its main work. */
export async function moveWork(formData: FormData) {
  const { work } = await loadWork(String(formData.get("id")));
  const up = formData.get("dir") === "up";
  const rows = await orderedIds(work.projectId);
  const same = rows.filter((r) => r.section === work.section).map((r) => r.id);
  const i = same.indexOf(work.id);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= same.length) return;
  const ids = rows.map((r) => r.id);
  const a = ids.indexOf(same[i]);
  const b = ids.indexOf(same[j]);
  [ids[a], ids[b]] = [ids[b], ids[a]];
  await writeOrder(work.projectId, ids);
  await refresh(work.projectId);
}

/** Moves a whole main work before the one above it, or after the one below. */
export async function moveSection(formData: FormData) {
  const { project } = await requireWorksWriter(String(formData.get("projectId")));
  const name = String(formData.get("section"));
  const up = formData.get("dir") === "up";
  const rows = await orderedIds(project.id);
  const names: string[] = [];
  for (const r of rows) if (!names.includes(r.section)) names.push(r.section);
  const i = names.indexOf(name);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= names.length) return;
  [names[i], names[j]] = [names[j], names[i]];
  const ids = names.flatMap((n) => rows.filter((r) => r.section === n).map((r) => r.id));
  await writeOrder(project.id, ids);
  await refresh(project.id);
}

export async function deleteWork(formData: FormData) {
  const { user, work } = await loadWork(String(formData.get("id")));
  const db = await getDb();
  await db.delete(s.works).where(eq(s.works.id, work.id));
  await db.insert(s.auditLog).values({ userId: user.id, action: "delete", entity: "work", entityId: work.id, meta: { title: work.title.slice(0, 80) } });
  await refresh(work.projectId);
}
