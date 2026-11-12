"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { DECISIONS, DISCIPLINES } from "@/db/schema";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { clientDrawings } from "@/lib/drawings";
import { loadShare, loadSharedItems } from "@/lib/share";
import { deleteStored, storedSize } from "@/lib/storage";
import type { FormState } from "./actions";

const uuid = z.string().uuid();

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

async function requireStudio(projectId: string) {
  const user = await requirePermission("studio.manage");
  const project = await visibleProject(user, uuid.parse(projectId));
  if (!project) throw new Error("That project was not found.");
  return { user, project };
}

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

async function claimDrawingFile(user: SessionUser, projectId: string, fileId: string) {
  const db = await getDb();
  const [file] = await db
    .select()
    .from(s.files)
    .where(and(eq(s.files.id, uuid.parse(fileId)), eq(s.files.projectId, projectId), eq(s.files.uploadedBy, user.id)));
  if (!file) throw new Error("That upload was not found.");
  if (!file.ready) {
    if ((await storedSize(file.storageKey)) !== file.size) throw new Error("The upload did not finish. Try again.");
    await db.update(s.files).set({ ready: true }).where(eq(s.files.id, file.id));
  }
  return file;
}

async function requireDrawing(projectId: string, drawingId: string) {
  const ctx = await requireStudio(projectId);
  const db = await getDb();
  const [drawing] = await db
    .select()
    .from(s.drawings)
    .where(and(eq(s.drawings.id, uuid.parse(drawingId)), eq(s.drawings.projectId, ctx.project.id)));
  if (!drawing) throw new Error("That drawing was not found.");
  return { ...ctx, drawing };
}

const drawingInput = z.object({
  number: z.string().trim().min(1, "Give the sheet number, e.g. A-101.").max(30),
  title: z.string().trim().min(2, "Give the drawing a title.").max(120),
  discipline: z.enum(DISCIPLINES),
});

/** Checks the details before the file is uploaded, so a typo doesn't waste an upload. */
export async function checkDrawingDetails(input: { projectId: string; number: string; title: string; discipline: string }) {
  const { project } = await requireStudio(input.projectId);
  const parsed = drawingInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const db = await getDb();
  const [clash] = await db
    .select({ id: s.drawings.id })
    .from(s.drawings)
    .where(and(eq(s.drawings.projectId, project.id), eq(s.drawings.number, parsed.data.number)));
  if (clash) return { error: `${parsed.data.number} already exists. Upload a new revision on that drawing instead.` };
  return { ok: true as const };
}

export async function createDrawing(input: { projectId: string; number: string; title: string; discipline: string; fileId: string; note: string }) {
  const { user, project } = await requireStudio(input.projectId);
  const details = drawingInput.parse(input);
  const file = await claimDrawingFile(user, project.id, input.fileId);
  const db = await getDb();
  const id = await db.transaction(async (tx) => {
    const [drawing] = await tx
      .insert(s.drawings)
      .values({ projectId: project.id, ...details, createdBy: user.id })
      .returning({ id: s.drawings.id });
    await tx.insert(s.drawingRevisions).values({
      drawingId: drawing.id,
      rev: 0,
      fileId: file.id,
      note: input.note.trim() || null,
      createdBy: user.id,
    });
    return drawing.id;
  });
  await audit(user, "create", "drawing", id, { number: details.number });
  refresh(project.id);
  return { id };
}

export async function addRevision(input: { projectId: string; drawingId: string; fileId: string; note: string }) {
  const { user, project, drawing } = await requireDrawing(input.projectId, input.drawingId);
  const file = await claimDrawingFile(user, project.id, input.fileId);
  const db = await getDb();
  const [{ last }] = await db
    .select({ last: max(s.drawingRevisions.rev) })
    .from(s.drawingRevisions)
    .where(eq(s.drawingRevisions.drawingId, drawing.id));
  const rev = (last ?? -1) + 1;
  await db.insert(s.drawingRevisions).values({
    drawingId: drawing.id,
    rev,
    fileId: file.id,
    note: input.note.trim() || null,
    createdBy: user.id,
  });
  await audit(user, "add_revision", "drawing", drawing.id, { rev });
  refresh(project.id);
  return { rev };
}

/** Makes the newest draft visible on the client links that include this drawing. */
export async function issueRevision(formData: FormData) {
  const { user, project, drawing } = await requireDrawing(String(formData.get("projectId")), String(formData.get("drawingId")));
  const db = await getDb();
  const [latest] = await db
    .select()
    .from(s.drawingRevisions)
    .where(eq(s.drawingRevisions.drawingId, drawing.id))
    .orderBy(desc(s.drawingRevisions.rev))
    .limit(1);
  if (!latest || latest.status !== "draft") return;
  await db.update(s.drawingRevisions).set({ status: "issued", issuedAt: new Date() }).where(eq(s.drawingRevisions.id, latest.id));
  await audit(user, "issue", "drawing", drawing.id, { rev: latest.rev });
  refresh(project.id);
}

const decisionInput = z
  .object({
    decision: z.enum(DECISIONS),
    name: z.string().trim().min(2, "Enter the client's name.").max(80),
    comment: z.string().trim().max(2000),
  })
  .refine((d) => d.decision === "approved" || d.comment.length > 0, {
    message: "Say what needs to change.",
    path: ["comment"],
  });

/** Staff record a decision the client gave by phone, email or in a meeting. */
export async function recordDecision(_: FormState, formData: FormData): Promise<FormState> {
  const { user, project, drawing } = await requireDrawing(String(formData.get("projectId")), String(formData.get("drawingId")));
  const parsed = decisionInput.safeParse({
    decision: formData.get("decision"),
    name: formData.get("name"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const db = await getDb();
  const [latest] = await db
    .select()
    .from(s.drawingRevisions)
    .where(eq(s.drawingRevisions.drawingId, drawing.id))
    .orderBy(desc(s.drawingRevisions.rev))
    .limit(1);
  if (!latest || latest.status === "draft") return { error: "Issue the revision to the client first." };
  await db.transaction(async (tx) => {
    await tx.insert(s.approvals).values({
      revisionId: latest.id,
      decision: parsed.data.decision,
      name: parsed.data.name,
      comment: parsed.data.comment || null,
      recordedBy: user.id,
    });
    await tx.update(s.drawingRevisions).set({ status: parsed.data.decision }).where(eq(s.drawingRevisions.id, latest.id));
  });
  await audit(user, "record_decision", "drawing", drawing.id, { rev: latest.rev, decision: parsed.data.decision });
  refresh(project.id);
  return { ok: parsed.data.decision === "approved" ? "Approval recorded." : "Change request recorded." };
}

export async function deleteDrawing(formData: FormData) {
  const { user, project, drawing } = await requireDrawing(String(formData.get("projectId")), String(formData.get("id")));
  const db = await getDb();
  const revs = await db
    .select({ fileId: s.drawingRevisions.fileId, key: s.files.storageKey })
    .from(s.drawingRevisions)
    .innerJoin(s.files, eq(s.files.id, s.drawingRevisions.fileId))
    .where(eq(s.drawingRevisions.drawingId, drawing.id));
  await db.delete(s.shareLinkItems).where(and(eq(s.shareLinkItems.itemType, "drawing"), eq(s.shareLinkItems.itemId, drawing.id)));
  await db.delete(s.drawings).where(eq(s.drawings.id, drawing.id));
  for (const r of revs) {
    await db.delete(s.files).where(eq(s.files.id, r.fileId));
    await deleteStored(r.key).catch(() => {});
  }
  await audit(user, "delete", "drawing", drawing.id, { number: drawing.number });
  refresh(project.id);
  redirect(`/projects/${project.id}/drawings`);
}

// ── Public: the client decides from their link ──────────────────────────────

export async function clientDecision(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const { state, link } = await loadShare(token);
  if (state !== "ok" || !link) return { error: "This link can no longer be used." };

  const parsed = decisionInput.safeParse({
    decision: formData.get("decision"),
    name: formData.get("name"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Check the form.";
    return { error: msg === "Enter the client's name." ? "Enter your name." : msg };
  }

  const revisionId = uuid.safeParse(formData.get("revisionId"));
  if (!revisionId.success) return { error: "That drawing was not found." };

  // The revision must be the one this link shows right now, still awaiting a decision.
  const { order } = await loadSharedItems(link.id);
  const shared = await clientDrawings(order.filter((i) => i.itemType === "drawing").map((i) => i.itemId));
  const target = shared.find((d) => d.revision.id === revisionId.data);
  if (!target) return { error: "A newer revision has been shared. Reload the page." };
  if (target.revision.status !== "issued") return { error: "A decision has already been recorded for this revision." };

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(s.approvals).values({
      revisionId: target.revision.id,
      decision: parsed.data.decision,
      name: parsed.data.name,
      comment: parsed.data.comment || null,
      shareLinkId: link.id,
    });
    await tx.update(s.drawingRevisions).set({ status: parsed.data.decision }).where(eq(s.drawingRevisions.id, target.revision.id));
  });
  revalidatePath(`/s/${token}`);
  return { ok: parsed.data.decision === "approved" ? "Thank you. Your approval has been sent to the studio." : "Thank you. Your comments have been sent to the studio." };
}
