"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";
import { purgeItem, TRASH_TYPES, type TrashType } from "@/lib/trash";
import type { FormState } from "./actions";

const uuid = z.string().uuid();

async function audit(userId: string, action: string, entity: string, entityId: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId, action, entity, entityId, meta });
}

/** Who may open the recycle bin, restore and remove for good. */
async function requireBin() {
  const user = await requireUser();
  if (!can(user, "staff.manage") && !can(user, "projects.edit")) throw new Error("Only admins and project managers can use the recycle bin.");
  return user;
}

/**
 * Moves a project to the recycle bin. A project with invoices or purchase
 * orders stays: those are accounting records and their numbering must not
 * have gaps. Mark it completed or cancelled instead.
 */
export async function deleteProject(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("projects.edit");
  const project = await visibleProject(user, uuid.parse(formData.get("projectId")));
  if (!project) return { error: "That project was not found." };
  const db = await getDb();
  const [{ inv }] = await db.select({ inv: count() }).from(s.invoices).where(eq(s.invoices.projectId, project.id));
  const [{ po }] = await db.select({ po: count() }).from(s.purchaseOrders).where(eq(s.purchaseOrders.projectId, project.id));
  if (inv > 0 || po > 0) {
    return {
      error: `This project has ${inv ? `${inv} ${inv === 1 ? "invoice" : "invoices"}` : ""}${inv && po ? " and " : ""}${po ? `${po} purchase ${po === 1 ? "order" : "orders"}` : ""}, which are accounting records. Mark it completed or cancelled instead.`,
    };
  }
  if (formData.get("confirm") !== project.name) return { error: `Type the project's name, ${project.name}, to confirm.` };
  await db.update(s.projects).set({ deletedAt: new Date(), deletedBy: user.id }).where(eq(s.projects.id, project.id));
  await audit(user.id, "delete", "project", project.id, { name: project.name });
  revalidatePath("/", "layout");
  redirect("/projects");
}

/** Moves a firm to the recycle bin; its projects stay, and come back linked if it's restored. */
export async function deleteFirm(formData: FormData) {
  const user = await requirePermission("projects.create");
  const id = uuid.parse(formData.get("firmId"));
  const db = await getDb();
  await db.update(s.firms).set({ deletedAt: new Date(), deletedBy: user.id }).where(and(eq(s.firms.id, id), isNull(s.firms.deletedAt)));
  await audit(user.id, "delete", "firm", id);
  revalidatePath("/", "layout");
  redirect("/firms");
}

const itemInput = z.object({ type: z.enum(TRASH_TYPES), id: uuid });

const TABLE = {
  project: s.projects,
  drawing: s.drawings,
  model: s.models3d,
  tour: s.tours,
  report: s.siteReports,
  firm: s.firms,
} as const;

export async function restoreItem(formData: FormData) {
  const user = await requireBin();
  const { type, id } = itemInput.parse({ type: formData.get("type"), id: formData.get("id") });
  const db = await getDb();
  if (type === "report") {
    // Only one report per day: if a new one was written for the same date, it wins.
    const [r] = await db.select().from(s.siteReports).where(eq(s.siteReports.id, id));
    if (!r) return;
    const [{ n }] = await db
      .select({ n: count() })
      .from(s.siteReports)
      .where(and(eq(s.siteReports.projectId, r.projectId), eq(s.siteReports.date, r.date), isNull(s.siteReports.deletedAt)));
    if (n > 0) throw new Error("There is already a report for that day. Delete it first, then restore this one.");
  }
  const table = TABLE[type as TrashType];
  await db.update(table).set({ deletedAt: null, deletedBy: null }).where(and(eq(table.id, id), isNotNull(table.deletedAt)));
  await audit(user.id, "restore", type, id);
  revalidatePath("/", "layout");
}

export async function purgeNow(formData: FormData) {
  const user = await requireBin();
  const { type, id } = itemInput.parse({ type: formData.get("type"), id: formData.get("id") });
  if (await purgeItem(type, id)) await audit(user.id, "purge", type, id);
  revalidatePath("/settings/recycle-bin");
}

/** How long deleted things wait in the bin. */
export async function saveTrashDays(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("staff.manage");
  const parsed = z.coerce.number().int().min(7, "Keep items at least 7 days.").max(3650, "Ten years at most.").safeParse(formData.get("trashDays"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const db = await getDb();
  await db
    .insert(s.businessSettings)
    .values({ id: "studio", trashDays: parsed.data, updatedBy: user.id })
    .onConflictDoUpdate({ target: s.businessSettings.id, set: { trashDays: parsed.data, updatedBy: user.id, updatedAt: new Date() } });
  revalidatePath("/settings", "layout");
  return { ok: `Saved. Deleted items are removed for good after ${parsed.data} days.` };
}
