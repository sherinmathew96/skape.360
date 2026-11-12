"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { DECISIONS, DISCIPLINES, DRAWING_STATUSES } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { clientDrawings } from "@/lib/drawings";
import { can } from "@/lib/permissions";
import { loadPortal } from "@/lib/portal";
import { loadShare, loadSharedItems } from "@/lib/share";
import { deleteStored, storedSize } from "@/lib/storage";
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
  const allowed = can(user.role, "studio.manage") || can(user.role, "projects.edit") || (await isProjectMember(user.id, project.id));
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
    .where(and(eq(s.drawings.id, uuid.parse(drawingId)), eq(s.drawings.projectId, ctx.project.id)));
  if (!drawing) throw new Error("That drawing was not found.");
  return { ...ctx, drawing };
}

async function requireGroup(projectId: string, groupId: string) {
  const db = await getDb();
  const [group] = await db
    .select()
    .from(s.drawingGroups)
    .where(and(eq(s.drawingGroups.id, uuid.parse(groupId)), eq(s.drawingGroups.projectId, projectId)));
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
export async function deleteGroup(input: { projectId: string; groupId: string }) {
  const { user, project } = await requireStudio(input.projectId);
  const group = await requireGroup(project.id, input.groupId);
  const db = await getDb();
  await db.delete(s.drawingGroups).where(eq(s.drawingGroups.id, group.id));
  await audit(user, "delete", "drawing_group", group.id, { name: group.name });
  refresh(project.id);
}

export async function moveGroup(input: { projectId: string; groupId: string; direction: "up" | "down" }) {
  const { project } = await requireStudio(input.projectId);
  const group = await requireGroup(project.id, input.groupId);
  const db = await getDb();
  const all = await db.select().from(s.drawingGroups).where(eq(s.drawingGroups.projectId, project.id)).orderBy(s.drawingGroups.position, s.drawingGroups.createdAt);
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
  const [{ last }] = await db
    .select({ last: max(s.drawings.position) })
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
        position: (last ?? -1) + 1,
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
    const [{ last }] = await db
      .select({ last: max(s.drawings.position) })
      .from(s.drawings)
      .where(and(eq(s.drawings.projectId, project.id), groupId ? eq(s.drawings.groupId, groupId) : isNull(s.drawings.groupId)));
    position = (last ?? -1) + 1;
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

/** A client's decision moves the drawing along: approved → Production, changes → Revision. */
async function statusFromDecision(drawingId: string, decision: "approved" | "changes_requested") {
  const db = await getDb();
  await db
    .update(s.drawings)
    .set({ status: decision === "approved" ? "production" : "revision", statusChangedAt: sql`now()` })
    .where(and(eq(s.drawings.id, drawingId), sql`${s.drawings.status} <> 'completed'`));
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
  await statusFromDecision(drawing.id, parsed.data.decision);
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
  await audit(user, "delete", "drawing", drawing.id, { title: drawing.title });
  refresh(project.id);
  redirect(`/projects/${project.id}/drawings`);
}

// ── Public: the client decides from their link ──────────────────────────────

export async function clientDecision(_: FormState, formData: FormData): Promise<FormState> {
  // From a share link (token) or from the project's client portal (slug).
  const token = String(formData.get("token") ?? "");
  const portalSlug = String(formData.get("portal") ?? "");
  let linkId: string | null = null;
  let portalId: string | null = null;
  let registerProject: string | undefined;
  let ids: string[] = [];
  let path: string;
  if (portalSlug) {
    const { state, portal } = await loadPortal(portalSlug);
    if (state !== "ok" || !portal || !portal.sections.drawings) return { error: "This page can no longer be used." };
    portalId = portal.id;
    registerProject = portal.projectId;
    path = `/${portal.slug}`;
  } else {
    const { state, link } = await loadShare(token);
    if (state !== "ok" || !link) return { error: "This link can no longer be used." };
    linkId = link.id;
    const { order } = await loadSharedItems(link.id);
    ids = order.filter((i) => i.itemType === "drawing").map((i) => i.itemId);
    registerProject = order.find((i) => i.itemType === "drawing_register")?.itemId;
    path = `/s/${token}`;
  }

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

  // The revision must be one this page shows right now, still awaiting a decision:
  // drawings shared one by one, plus the whole register if it is shared.
  if (registerProject) {
    const db = await getDb();
    const rows = await db
      .select({ id: s.drawings.id })
      .from(s.drawings)
      .where(and(eq(s.drawings.projectId, registerProject), eq(s.drawings.clientVisible, true)));
    ids = [...ids, ...rows.map((r) => r.id)];
  }
  const shared = await clientDrawings(ids);
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
      shareLinkId: linkId,
      portalId,
    });
    await tx.update(s.drawingRevisions).set({ status: parsed.data.decision }).where(eq(s.drawingRevisions.id, target.revision.id));
  });
  await statusFromDecision(target.id, parsed.data.decision);
  revalidatePath(path, "layout");
  return { ok: parsed.data.decision === "approved" ? "Thank you. Your approval has been sent to the studio." : "Thank you. Your comments have been sent to the studio." };
}
