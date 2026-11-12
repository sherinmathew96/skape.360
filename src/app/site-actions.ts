"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { WEATHER } from "@/db/schema";
import { requireProjectMember } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deleteStored } from "@/lib/storage";
import { claimUploadedFile } from "@/lib/uploads";
import type { FormState } from "./actions";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

/** Site reports: the project's team, with the site-report permission. */
async function requireSiteWriter(projectId: string) {
  const ctx = await requireProjectMember(projectId);
  if (!can(ctx.user.role, "site.report")) throw new Error("Only site engineers and project managers write site reports.");
  return ctx;
}

// ── Daily site reports ──────────────────────────────────────────────────────

export async function saveReport(_: FormState, formData: FormData): Promise<FormState> {
  const { user, project } = await requireSiteWriter(String(formData.get("projectId")));
  const reportId = formData.get("reportId") ? uuid.parse(formData.get("reportId")) : null;

  const trades = formData.getAll("trade").map(String);
  const counts = formData.getAll("count").map(String);
  const labour = trades
    .map((trade, i) => ({ trade: trade.trim().slice(0, 40), count: Math.max(0, Math.min(999, Math.round(Number(counts[i]) || 0))) }))
    .filter((l) => l.trade && l.count > 0);

  const parsed = z
    .object({
      date: isoDate,
      weather: z.enum(WEATHER, { message: "Choose the weather." }),
      workDone: z.string().trim().min(3, "Describe the work done today.").max(4000),
      issues: z.string().trim().max(4000),
      clientVisible: z.boolean(),
    })
    .safeParse({
      date: formData.get("date"),
      weather: formData.get("weather"),
      workDone: formData.get("workDone"),
      issues: formData.get("issues") ?? "",
      clientVisible: formData.get("clientVisible") === "on",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const input = parsed.data;

  const db = await getDb();
  const [sameDay] = await db
    .select({ id: s.siteReports.id })
    .from(s.siteReports)
    .where(and(eq(s.siteReports.projectId, project.id), eq(s.siteReports.date, input.date)));
  if (sameDay && sameDay.id !== reportId) {
    return { error: "There is already a report for that date. Open it from the list to add to it." };
  }

  let id = reportId;
  const values = { date: input.date, weather: input.weather, labour, workDone: input.workDone, issues: input.issues || null, clientVisible: input.clientVisible };
  if (reportId) {
    const [updated] = await db
      .update(s.siteReports)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.siteReports.id, reportId), eq(s.siteReports.projectId, project.id)))
      .returning({ id: s.siteReports.id });
    if (!updated) return { error: "That report was not found." };
  } else {
    const [created] = await db
      .insert(s.siteReports)
      .values({ projectId: project.id, ...values, createdBy: user.id })
      .returning({ id: s.siteReports.id });
    id = created.id;
  }
  await audit(user, reportId ? "update" : "create", "site_report", id!, { date: input.date });
  refresh(project.id);
  redirect(`/projects/${project.id}/site/${id}`);
}

async function requireReport(projectId: string, reportId: string) {
  const ctx = await requireSiteWriter(projectId);
  const db = await getDb();
  const [report] = await db
    .select({ id: s.siteReports.id })
    .from(s.siteReports)
    .where(and(eq(s.siteReports.id, uuid.parse(reportId)), eq(s.siteReports.projectId, ctx.project.id)));
  if (!report) throw new Error("That report was not found.");
  return { ...ctx, report };
}

export async function addReportPhoto(input: { projectId: string; reportId: string; fileId: string }) {
  const { user, project, report } = await requireReport(input.projectId, input.reportId);
  const file = await claimUploadedFile(user, project.id, input.fileId);
  const db = await getDb();
  await db.insert(s.siteReportPhotos).values({ reportId: report.id, fileId: file.id });
  refresh(project.id);
}

export async function removeReportPhoto(formData: FormData) {
  const { user, project, report } = await requireReport(String(formData.get("projectId")), String(formData.get("reportId")));
  const photoId = uuid.parse(formData.get("photoId"));
  const db = await getDb();
  const [photo] = await db
    .select({ fileId: s.siteReportPhotos.fileId, key: s.files.storageKey })
    .from(s.siteReportPhotos)
    .innerJoin(s.files, eq(s.files.id, s.siteReportPhotos.fileId))
    .where(and(eq(s.siteReportPhotos.id, photoId), eq(s.siteReportPhotos.reportId, report.id)));
  if (!photo) return;
  await db.delete(s.files).where(eq(s.files.id, photo.fileId)); // cascades to the photo row
  await deleteStored(photo.key).catch(() => {});
  await audit(user, "remove_photo", "site_report", report.id);
  refresh(project.id);
}

// ── Snags ───────────────────────────────────────────────────────────────────

export async function createSnag(input: {
  projectId: string;
  title: string;
  location: string;
  assigneeId: string;
  dueDate: string;
  photoFileId: string | null;
}): Promise<{ error?: string; ok?: string }> {
  const { user, project } = await requireProjectMember(input.projectId);
  const parsed = z
    .object({
      title: z.string().trim().min(3, "Describe the snag.").max(200),
      location: z.string().trim().max(100),
      assigneeId: z.union([uuid, z.literal("")]),
      dueDate: z.union([isoDate, z.literal("")]),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { title, location, assigneeId, dueDate } = parsed.data;

  const db = await getDb();
  if (assigneeId) {
    const [member] = await db
      .select({ userId: s.projectMembers.userId })
      .from(s.projectMembers)
      .where(and(eq(s.projectMembers.projectId, project.id), eq(s.projectMembers.userId, assigneeId)));
    if (!member) return { error: "Assign the snag to someone on the project's team." };
  }
  const photo = input.photoFileId ? await claimUploadedFile(user, project.id, input.photoFileId) : null;

  // Numbering: the next number in this project. The unique index catches a rare clash; try again once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ last }] = await db.select({ last: max(s.snags.number) }).from(s.snags).where(eq(s.snags.projectId, project.id));
    try {
      const [snag] = await db
        .insert(s.snags)
        .values({
          projectId: project.id,
          number: (last ?? 0) + 1,
          title,
          location: location || null,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
          photoFileId: photo?.id ?? null,
          createdBy: user.id,
        })
        .returning({ id: s.snags.id, number: s.snags.number });
      await audit(user, "create", "snag", snag.id);
      refresh(project.id);
      return { ok: `S-${String(snag.number).padStart(3, "0")} raised.` };
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  return { error: "Could not save the snag. Try again." };
}

async function requireSnag(projectId: string, snagId: string) {
  const ctx = await requireProjectMember(projectId);
  const db = await getDb();
  const [snag] = await db
    .select()
    .from(s.snags)
    .where(and(eq(s.snags.id, uuid.parse(snagId)), eq(s.snags.projectId, ctx.project.id)));
  if (!snag) throw new Error("That snag was not found.");
  return { ...ctx, snag };
}

/** The person it's assigned to, site staff or a manager marks it fixed, with an optional "after" photo. */
export async function markSnagFixed(input: { projectId: string; snagId: string; note: string; photoFileId: string | null }) {
  const { user, project, snag } = await requireSnag(input.projectId, input.snagId);
  if (snag.status !== "open") return { error: "This snag is not open." };
  if (snag.assigneeId !== user.id && !can(user.role, "site.report") && !can(user.role, "projects.edit")) {
    return { error: "Only the person it's assigned to, site staff or a manager can mark it fixed." };
  }
  const photo = input.photoFileId ? await claimUploadedFile(user, project.id, input.photoFileId) : null;
  const db = await getDb();
  await db
    .update(s.snags)
    .set({ status: "fixed", fixedAt: new Date(), fixNote: input.note.trim().slice(0, 1000) || null, fixPhotoFileId: photo?.id ?? null })
    .where(eq(s.snags.id, snag.id));
  await audit(user, "fix", "snag", snag.id);
  refresh(project.id);
  return { ok: "Marked fixed." };
}

/** Whoever raised it, or a manager, checks the fix: close it, or send it back as open. */
export async function reviewSnag(formData: FormData) {
  const { user, project, snag } = await requireSnag(String(formData.get("projectId")), String(formData.get("snagId")));
  const decision = z.enum(["close", "reopen"]).parse(formData.get("decision"));
  if (snag.createdBy !== user.id && !can(user.role, "projects.edit")) {
    throw new Error("Only the person who raised it or a project manager can do that.");
  }
  const db = await getDb();
  if (decision === "close") {
    await db.update(s.snags).set({ status: "closed", closedAt: new Date() }).where(eq(s.snags.id, snag.id));
  } else {
    await db.update(s.snags).set({ status: "open", fixedAt: null, closedAt: null }).where(eq(s.snags.id, snag.id));
  }
  await audit(user, decision, "snag", snag.id);
  refresh(project.id);
}
