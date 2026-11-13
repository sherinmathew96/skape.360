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
  .transform((v) => v || null);
const optNumber = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 1e10) {
      ctx.addIssue({ code: "custom", message: "Enter a valid number." });
      return z.NEVER;
    }
    return n;
  });

const workFields = z.object({
  section: z.string().trim().max(120).transform((v) => v || "Works"),
  code: z.string().trim().max(20).transform((v) => v || null),
  title: z.string().trim().min(2, "Describe the work.").max(2000),
  unit: z.string().trim().max(20).transform((v) => v || null),
  qty: optNumber,
  rate: optNumber,
  amount: optNumber,
  plannedStart: isoDate,
  plannedEnd: isoDate,
});

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

const money = (n: number | null) => (n === null ? null : n.toFixed(2));
const amountOf = (v: { qty: number | null; rate: number | null; amount: number | null }) =>
  v.rate !== null ? (v.qty !== null ? Math.round(v.qty * v.rate * 100) / 100 : v.rate) : v.amount;

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
  const rows = await db
    .select({ id: s.works.id, section: s.works.section })
    .from(s.works)
    .where(eq(s.works.projectId, projectId))
    .orderBy(asc(s.works.position), asc(s.works.createdAt));
  return rows;
}

/** One work or milestone, placed after the last work of its section (or at the end). */
export async function addWork(_: Result | undefined, formData: FormData): Promise<Result> {
  const parsed = workFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.plannedStart && v.plannedEnd && v.plannedEnd < v.plannedStart) return { error: "The planned finish is before the start." };
  let ctx;
  try {
    ctx = await requireWorksWriter(String(formData.get("projectId")));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
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
    .values({
      projectId,
      section: v.section,
      code: v.code,
      title: v.title,
      unit: v.unit,
      qty: v.qty === null ? null : String(v.qty),
      rate: money(v.rate),
      amount: money(amountOf(v)),
      position,
      plannedStart: v.plannedStart,
      plannedEnd: v.plannedEnd,
      updatedBy: ctx.user.id,
    })
    .returning({ id: s.works.id });
  await db.insert(s.auditLog).values({ userId: ctx.user.id, action: "create", entity: "work", entityId: row.id, meta: { projectId, title: v.title.slice(0, 80) } });
  await refresh(projectId);
  return { ok: "Added." };
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
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }
  const db = await getDb();
  const projectId = ctx.project.id;
  if (input.replace) {
    if (!can(ctx.user, "projects.edit")) return { error: "Only project managers can replace the whole timeline." };
    await db.delete(s.works).where(eq(s.works.projectId, projectId));
  }
  const [end] = await db.select({ p: max(s.works.position) }).from(s.works).where(eq(s.works.projectId, projectId));
  const start = end?.p ?? 0;
  await db.insert(s.works).values(
    rows.data.map((r, i) => ({
      projectId,
      section: r.section,
      code: r.code || null,
      title: r.title,
      unit: r.unit || null,
      qty: r.qty === null ? null : String(r.qty),
      rate: money(r.rate),
      amount: money(r.amount),
      position: start + i + 1,
      updatedBy: ctx.user.id,
    })),
  );
  await db.insert(s.auditLog).values({ userId: ctx.user.id, action: input.replace ? "replace" : "import", entity: "works", entityId: projectId, meta: { count: rows.data.length } });
  await refresh(projectId);
  return { ok: `${rows.data.length} ${rows.data.length === 1 ? "work" : "works"} added.` };
}

async function loadWork(id: string) {
  const db = await getDb();
  const [work] = await db.select().from(s.works).where(eq(s.works.id, uuid.parse(id)));
  if (!work) throw new Error("That work was not found.");
  const ctx = await requireWorksWriter(work.projectId);
  return { ...ctx, work };
}

/** Marks a work started, completed, or back to not started. */
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

/** Edits a work: its words, quantities, planned dates and the actual dates. */
export async function updateWork(_: Result | undefined, formData: FormData): Promise<Result> {
  const parsed = workFields
    .extend({ startedOn: isoDate, completedOn: isoDate, note: z.string().trim().max(1000).transform((v) => v || null) })
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
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }
  const status = v.completedOn ? "done" : v.startedOn ? "started" : "pending";
  const db = await getDb();
  await db
    .update(s.works)
    .set({
      section: v.section,
      code: v.code,
      title: v.title,
      unit: v.unit,
      qty: v.qty === null ? null : String(v.qty),
      rate: money(v.rate),
      amount: money(amountOf(v)),
      plannedStart: v.plannedStart,
      plannedEnd: v.plannedEnd,
      startedOn: v.startedOn ?? (v.completedOn ? v.completedOn : null),
      completedOn: v.completedOn,
      status,
      note: v.note,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(s.works.id, ctx.work.id));
  await refresh(ctx.work.projectId);
  return { ok: "Saved." };
}

/** Moves a work one place up or down within its section. */
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

/** Moves a whole section before the one above it, or after the one below. */
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
