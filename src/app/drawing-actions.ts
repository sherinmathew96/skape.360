"use server";

import { revalidatePath } from "@/lib/live";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, max, min } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { DECISIONS, DISCIPLINES, DRAWING_STATUSES } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";
import { STATUS_STYLE } from "@/components/drawing-status";
import { notifyClient } from "@/lib/client-updates";
import { recordApproval } from "@/lib/decisions";
import { appOrigin } from "@/lib/origin";
import { ensureShareSlug, portalSlugFor } from "@/lib/share-slugs";
import { storedSize } from "@/lib/storage";
import type { FormState } from "./actions";

const uuid = z.string().uuid();

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

/**
 * The drawing register can be edited by studio staff on the project and by
 * anyone assigned to the project's team. Throws otherwise.
 */
async function requireStudio(projectId: string) {
  const user = await requireUser();
  const project = await visibleProject(user, uuid.parse(projectId));
  if (!project) throw new Error("That project was not found.");
  const allowed = can(user, "studio.manage") || can(user, "projects.edit") || (await isProjectMember(user.id, project.id));
  if (!allowed) throw new Error("Only the project's team can change its drawings.");
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
    .where(and(eq(s.drawings.id, uuid.parse(drawingId)), eq(s.drawings.projectId, ctx.project.id), isNull(s.drawings.deletedAt)));
  if (!drawing) throw new Error("That drawing was not found.");
  return { ...ctx, drawing };
}

async function requireGroup(projectId: string, groupId: string) {
  const db = await getDb();
  const [group] = await db
    .select()
    .from(s.drawingGroups)
    .where(and(eq(s.drawingGroups.id, uuid.parse(groupId)), eq(s.drawingGroups.projectId, projectId), isNull(s.drawingGroups.deletedAt)));
  if (!group) throw new Error("That group was not found.");
  return group;
}

const drawingInput = z.object({
  number: z.string().trim().max(30),
  title: z.string().trim().min(2, "Give the drawing a title.").max(160),
  discipline: z.enum(DISCIPLINES),
});

// ── Groups: "General drawings", "Room 01", "Master bedroom" … ───────────────

export async function createGroup(input: { projectId: string; name: string }) {
  const { user, project } = await requireStudio(input.projectId);
  const name = z.string().trim().min(1, "Name the group.").max(80).parse(input.name);
  const db = await getDb();
  const [{ last }] = await db.select({ last: max(s.drawingGroups.position) }).from(s.drawingGroups).where(eq(s.drawingGroups.projectId, project.id));
  const [group] = await db
    .insert(s.drawingGroups)
    .values({ projectId: project.id, name, position: (last ?? -1) + 1 })
    .returning({ id: s.drawingGroups.id });
  await audit(user, "create", "drawing_group", group.id, { name });
  refresh(project.id);
  return { id: group.id };
}

export async function renameGroup(input: { projectId: string; groupId: string; name: string }) {
  const { project } = await requireStudio(input.projectId);
  const group = await requireGroup(project.id, input.groupId);
  const name = z.string().trim().min(1).max(80).parse(input.name);
  const db = await getDb();
  await db.update(s.drawingGroups).set({ name }).where(eq(s.drawingGroups.id, group.id));
  refresh(project.id);
}

/** Removes the heading only; its drawings move to General. */
/**
 * Removes a group. With its drawings: the group and its drawings go to the
 * recycle bin together (and come back together). Without: only the group
 * goes; its drawings move to General.
 */
export async function deleteGroup(input: { projectId: string; groupId: string; withDrawings?: boolean }) {
  const { user, project } = await requireStudio(input.projectId);
  const group = await requireGroup(project.id, input.groupId);
  const db = await getDb();
  if (input.withDrawings) {
    const at = new Date();
    await db.transaction(async (tx) => {
      await tx.update(s.drawingGroups).set({ deletedAt: at, deletedBy: user.id }).where(eq(s.drawingGroups.id, group.id));
      await tx
        .update(s.drawings)
        .set({ deletedAt: at, deletedBy: user.id })
        .where(and(eq(s.drawings.groupId, group.id), isNull(s.drawings.deletedAt)));
    });
    await audit(user, "delete", "drawing_group", group.id, { name: group.name, withDrawings: true });
  } else {
    await db.update(s.drawings).set({ groupId: null }).where(eq(s.drawings.groupId, group.id));
    await db.delete(s.drawingGroups).where(eq(s.drawingGroups.id, group.id));
    await audit(user, "delete", "drawing_group", group.id, { name: group.name });
  }
  refresh(project.id);
}

/** A drawing to the recycle bin from the register (stays on the list page). */
export async function trashDrawing(input: { projectId: string; drawingId: string }) {
  const { user, project, drawing } = await requireDrawing(input.projectId, input.drawingId);
  const db = await getDb();
  await db.update(s.drawings).set({ deletedAt: new Date(), deletedBy: user.id }).where(eq(s.drawings.id, drawing.id));
  await audit(user, "delete", "drawing", drawing.id, { title: drawing.title });
  refresh(project.id);
}

export async function moveGroup(input: { projectId: string; groupId: string; direction: "up" | "down" }) {
  const { project } = await requireStudio(input.projectId);
  const group = await requireGroup(project.id, input.groupId);
  const db = await getDb();
  const all = await db
    .select()
    .from(s.drawingGroups)
    .where(and(eq(s.drawingGroups.projectId, project.id), isNull(s.drawingGroups.deletedAt)))
    .orderBy(s.drawingGroups.position, s.drawingGroups.createdAt);
  const i = all.findIndex((g) => g.id === group.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.transaction(async (tx) => {
    for (const [position, g] of all.entries()) await tx.update(s.drawingGroups).set({ position }).where(eq(s.drawingGroups.id, g.id));
  });
  refresh(project.id);
}

// ── Drawings ────────────────────────────────────────────────────────────────

/** Checks the details before any file is uploaded, so a typo doesn't waste an upload. */
export async function checkDrawingDetails(input: { projectId: string; number: string; title: string; discipline: string }) {
  const { project } = await requireStudio(input.projectId);
  const parsed = drawingInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  if (parsed.data.number) {
    const db = await getDb();
    const [clash] = await db
      .select({ id: s.drawings.id })
      .from(s.drawings)
      .where(and(eq(s.drawings.projectId, project.id), eq(s.drawings.number, parsed.data.number)));
    if (clash) return { error: `${parsed.data.number} already exists. Upload a new revision on that drawing instead.` };
  }
  return { ok: true as const };
}

/**
 * Adds a drawing to the register. The file is optional: a drawing can be
 * listed as Pending or Design discussion before anything is drawn.
 */
export async function createDrawing(input: {
  projectId: string;
  groupId: string;
  number: string;
  title: string;
  discipline: string;
  status: string;
  assigneeId: string;
  fileId: string | null;
  rev: number | null;
  note: string;
}) {
  const { user, project } = await requireStudio(input.projectId);
  const details = drawingInput.parse(input);
  const status = z.enum(DRAWING_STATUSES).parse(input.status);
  const groupId = input.groupId ? (await requireGroup(project.id, input.groupId)).id : null;
  const assigneeId = input.assigneeId ? uuid.parse(input.assigneeId) : null;
  if (assigneeId && !(await isProjectMember(assigneeId, project.id))) throw new Error("Assign it to someone on the project's team.");
  const rev = input.rev === null ? 0 : z.number().int().min(0).max(99).parse(input.rev);
  const file = input.fileId ? await claimDrawingFile(user, project.id, input.fileId) : null;
  const db = await getDb();
  // The newest drawing goes on top of its group.
  const [{ first }] = await db
    .select({ first: min(s.drawings.position) })
    .from(s.drawings)
    .where(and(eq(s.drawings.projectId, project.id), groupId ? eq(s.drawings.groupId, groupId) : isNull(s.drawings.groupId)));
  const id = await db.transaction(async (tx) => {
    const [drawing] = await tx
      .insert(s.drawings)
      .values({
        projectId: project.id,
        groupId,
        number: details.number || null,
        title: details.title,
        discipline: details.discipline,
        status,
        assigneeId,
        position: (first ?? 1) - 1,
        createdBy: user.id,
      })
      .returning({ id: s.drawings.id });
    if (file) {
      await tx.insert(s.drawingRevisions).values({ drawingId: drawing.id, rev, fileId: file.id, note: input.note.trim() || null, createdBy: user.id });
    }
    return drawing.id;
  });
  await audit(user, "create", "drawing", id, { title: details.title });
  refresh(project.id);
  return { id };
}

/** The next revision. The number can be set, e.g. to continue from R9 on an older drawing. */
export async function addRevision(input: { projectId: string; drawingId: string; fileId: string; note: string; rev?: number | null }) {
  const { user, project, drawing } = await requireDrawing(input.projectId, input.drawingId);
  const db = await getDb();
  const [{ last }] = await db
    .select({ last: max(s.drawingRevisions.rev) })
    .from(s.drawingRevisions)
    .where(eq(s.drawingRevisions.drawingId, drawing.id));
  const next = (last ?? -1) + 1;
  const rev = input.rev === null || input.rev === undefined ? next : z.number().int().min(next, `Use R${next} or higher.`).max(99).parse(input.rev);
  const file = await claimDrawingFile(user, project.id, input.fileId);
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

export async function setDrawingStatus(input: { projectId: string; drawingId: string; status: string }) {
  const { user, project, drawing } = await requireDrawing(input.projectId, input.drawingId);
  const status = z.enum(DRAWING_STATUSES).parse(input.status);
  if (status === drawing.status) return;
  const db = await getDb();
  await db.update(s.drawings).set({ status, statusChangedAt: new Date() }).where(eq(s.drawings.id, drawing.id));
  await audit(user, "set_status", "drawing", drawing.id, { from: drawing.status, to: status });
  if (drawing.clientVisible) {
    await notifyClient({
      projectId: project.id,
      kind: "status",
      title: `${drawing.title} is now ${STATUS_STYLE[status].label.toLowerCase()}`,
      href: `drawings?d=${drawing.id}`,
      section: "drawings",
      drawingId: drawing.id,
    });
  }
  refresh(project.id);
}

export async function updateDrawing(_: FormState, formData: FormData): Promise<FormState> {
  const { user, project, drawing } = await requireDrawing(String(formData.get("projectId")), String(formData.get("drawingId")));
  const parsed = drawingInput
    .extend({ groupId: z.union([uuid, z.literal("")]), assigneeId: z.union([uuid, z.literal("")]), clientVisible: z.boolean() })
    .safeParse({
      number: formData.get("number") ?? "",
      title: formData.get("title"),
      discipline: formData.get("discipline"),
      groupId: formData.get("groupId") ?? "",
      assigneeId: formData.get("assigneeId") ?? "",
      clientVisible: formData.get("clientVisible") === "on",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const db = await getDb();
  if (v.number && v.number !== drawing.number) {
    const [clash] = await db.select({ id: s.drawings.id }).from(s.drawings).where(and(eq(s.drawings.projectId, project.id), eq(s.drawings.number, v.number)));
    if (clash) return { error: `${v.number} is already used by another drawing.` };
  }
  const groupId = v.groupId ? (await requireGroup(project.id, v.groupId)).id : null;
  if (v.assigneeId && !(await isProjectMember(v.assigneeId, project.id))) return { error: "Assign it to someone on the project's team." };
  let position = drawing.position;
  if (groupId !== drawing.groupId) {
    const [{ first }] = await db
      .select({ first: min(s.drawings.position) })
      .from(s.drawings)
      .where(and(eq(s.drawings.projectId, project.id), groupId ? eq(s.drawings.groupId, groupId) : isNull(s.drawings.groupId)));
    position = (first ?? 1) - 1;
  }
  await db
    .update(s.drawings)
    .set({ number: v.number || null, title: v.title, discipline: v.discipline, groupId, position, assigneeId: v.assigneeId || null, clientVisible: v.clientVisible })
    .where(eq(s.drawings.id, drawing.id));
  await audit(user, "update", "drawing", drawing.id);
  refresh(project.id);
  return { ok: "Saved." };
}

/** Moves a drawing up or down within its group. */
export async function moveDrawing(input: { projectId: string; drawingId: string; direction: "up" | "down" }) {
  const { project, drawing } = await requireDrawing(input.projectId, input.drawingId);
  const db = await getDb();
  const siblings = await db
    .select({ id: s.drawings.id })
    .from(s.drawings)
    .where(and(eq(s.drawings.projectId, project.id), drawing.groupId ? eq(s.drawings.groupId, drawing.groupId) : isNull(s.drawings.groupId)))
    .orderBy(s.drawings.position, s.drawings.createdAt);
  const i = siblings.findIndex((d) => d.id === drawing.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  await db.transaction(async (tx) => {
    for (const [position, d] of siblings.entries()) await tx.update(s.drawings).set({ position }).where(eq(s.drawings.id, d.id));
  });
  refresh(project.id);
}

/** Saves a group's drawings in the order they were dragged into. */
export async function reorderDrawings(input: { projectId: string; ids: string[] }) {
  if (input.ids.length === 0) return;
  const { project } = await requireDrawing(input.projectId, input.ids[0]);
  const db = await getDb();
  // Only this project's drawings: ids from anywhere else are ignored.
  const rows = await db
    .select({ id: s.drawings.id })
    .from(s.drawings)
    .where(and(eq(s.drawings.projectId, project.id), inArray(s.drawings.id, input.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500))));
  const ok = new Set(rows.map((r) => r.id));
  const ids = input.ids.filter((id) => ok.has(id));
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.update(s.drawings).set({ position }).where(eq(s.drawings.id, id));
  });
  refresh(project.id);
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
  if (drawing.clientVisible) {
    await notifyClient({
      projectId: project.id,
      kind: "revision",
      title: `${drawing.title}: R${latest.rev} issued`,
      href: `drawings?d=${drawing.id}`,
      section: "drawings",
      drawingId: drawing.id,
    });
  }
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
  await recordApproval({
    revisionId: latest.id,
    drawingId: drawing.id,
    decision: parsed.data.decision,
    name: parsed.data.name,
    comment: parsed.data.comment || null,
    recordedBy: user.id,
  });
  await audit(user, "record_decision", "drawing", drawing.id, { rev: latest.rev, decision: parsed.data.decision });
  refresh(project.id);
  return { ok: parsed.data.decision === "approved" ? "Approval recorded." : "Change request recorded." };
}

export async function deleteDrawing(formData: FormData) {
  const { user, project, drawing } = await requireDrawing(String(formData.get("projectId")), String(formData.get("id")));
  const db = await getDb();
  // To the recycle bin: it can be restored until the retention period ends.
  await db.update(s.drawings).set({ deletedAt: new Date(), deletedBy: user.id }).where(eq(s.drawings.id, drawing.id));
  await audit(user, "delete", "drawing", drawing.id, { title: drawing.title });
  refresh(project.id);
  redirect(`/projects/${project.id}/drawings`);
}

/**
 * The link to share one group or one drawing with the client:
 * 360.studioskape.in/<its name>. It opens behind the project's client
 * portal passcode, so the project needs a portal.
 */
export async function shareLink(input: { projectId: string; kind: string; id: string }): Promise<{ url: string } | { error: string }> {
  try {
    const { project } = await requireStudio(input.projectId);
    const kind = z.enum(["group", "drawing"]).parse(input.kind);
    const portalSlug = await portalSlugFor(project.id);
    if (!portalSlug) return { error: "Set up the client portal first (the project's Client sharing tab)." };
    let name: string;
    if (kind === "group") name = (await requireGroup(project.id, input.id)).name;
    else {
      const { drawing } = await requireDrawing(project.id, input.id);
      if (!drawing.clientVisible) return { error: "This drawing is hidden from the client. Show it on the client's register first." };
      name = drawing.title;
    }
    const slug = await ensureShareSlug(kind, uuid.parse(input.id), name, portalSlug);
    return { url: `${await appOrigin()}/${slug}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't make the link." };
  }
}
