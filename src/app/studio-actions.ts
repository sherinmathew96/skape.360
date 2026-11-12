"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, count, eq, gt, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { SHARE_ITEM_TYPES } from "@/db/schema";
import { requireProjectMember } from "@/lib/access";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";
import { FILE_KINDS, type FileKind } from "@/lib/file-kinds";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loadShare, shareCookieName, shareCookieValue } from "@/lib/share";
import { deleteStored, storedSize, uploadTarget } from "@/lib/storage";
import type { FormState } from "./actions";

const uuid = z.string().uuid();

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

/** The user may manage studio content on this project. Throws otherwise. */
async function requireStudioProject(projectId: string) {
  const user = await requirePermission("studio.manage");
  const project = await visibleProject(user, uuid.parse(projectId));
  if (!project) throw new Error("That project was not found.");
  return { user, project };
}

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

// ── Uploads ─────────────────────────────────────────────────────────────────

export type UploadTicket = { fileId: string; uploadUrl: string; contentType: string } | { error: string };

/** Step 1 of an upload: check the file, record it, and say where to send it. */
export async function startUpload(input: {
  /** Null only for receipts and bills that belong to the studio, not a project */
  projectId: string | null;
  kind: FileKind;
  name: string;
  size: number;
  type: string;
}): Promise<UploadTicket> {
  // Site photos come from the project's team; receipts and bill scans from anyone who records
  // money (project ones from the team or finance); studio files need studio rights.
  let user: SessionUser;
  let project: { id: string } | null;
  if (input.kind === "receipt") {
    user = await requirePermission("expense.add");
    if (input.projectId === null) {
      project = null;
    } else if (can(user.role, "finance.manage")) {
      project = await visibleProject(user, uuid.parse(input.projectId));
      if (!project) throw new Error("That project was not found.");
    } else {
      project = (await requireProjectMember(input.projectId)).project;
    }
  } else if (input.projectId === null) {
    throw new Error("Choose a project first.");
  } else {
    ({ user, project } = input.kind === "photo" ? await requireProjectMember(input.projectId) : await requireStudioProject(input.projectId));
  }
  const kind = FILE_KINDS[input.kind];
  if (!kind) return { error: "Unknown file kind." };

  const name = input.name.trim().slice(0, 200) || "file";
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (!(kind.extensions as readonly string[]).includes(ext) || !(kind.contentTypes as readonly string[]).includes(input.type)) {
    return { error: `${name} is not a ${kind.label}. ${kind.help}` };
  }
  if (!Number.isInteger(input.size) || input.size <= 0) return { error: `${name} is empty.` };
  if (input.size > kind.maxBytes) {
    return { error: `${name} is ${Math.ceil(input.size / 1024 / 1024)} MB; the limit is ${kind.maxBytes / 1024 / 1024} MB.` };
  }

  const contentType = kind.storedType ?? input.type;
  const fileId = randomUUID();
  const storageKey = project ? `projects/${project.id}/${input.kind}/${fileId}${ext}` : `studio/${input.kind}/${fileId}${ext}`;
  const db = await getDb();
  await db.insert(s.files).values({
    id: fileId,
    projectId: project?.id ?? null,
    storageKey,
    name,
    contentType,
    size: input.size,
    uploadedBy: user.id,
  });
  return { fileId, uploadUrl: await uploadTarget(fileId, storageKey, contentType), contentType };
}

/** Step 2 (after the bytes arrive): confirm the file is complete and mark it ready. */
async function claimUpload(user: SessionUser, projectId: string, fileId: string) {
  const db = await getDb();
  const [file] = await db
    .select()
    .from(s.files)
    .where(and(eq(s.files.id, uuid.parse(fileId)), eq(s.files.projectId, projectId), eq(s.files.uploadedBy, user.id)));
  if (!file) throw new Error("That upload was not found.");
  if (!file.ready) {
    const size = await storedSize(file.storageKey);
    if (size !== file.size) throw new Error("The upload did not finish. Try again.");
    await db.update(s.files).set({ ready: true }).where(eq(s.files.id, file.id));
  }
  return file;
}

// ── 3D models ───────────────────────────────────────────────────────────────

export async function createModel(input: { projectId: string; fileId: string; title: string }) {
  const { user, project } = await requireStudioProject(input.projectId);
  const file = await claimUpload(user, project.id, input.fileId);
  const title = input.title.trim() || file.name.replace(/\.glb$/i, "");
  const db = await getDb();
  const [model] = await db
    .insert(s.models3d)
    .values({ projectId: project.id, title, fileId: file.id, createdBy: user.id })
    .returning({ id: s.models3d.id });
  await audit(user, "create", "model", model.id);
  refresh(project.id);
  return { id: model.id };
}

export async function deleteModel(formData: FormData) {
  const { user, project } = await requireStudioProject(String(formData.get("projectId")));
  const id = uuid.parse(formData.get("id"));
  const db = await getDb();
  const [model] = await db.select().from(s.models3d).where(and(eq(s.models3d.id, id), eq(s.models3d.projectId, project.id)));
  if (!model) return;
  const [file] = await db.select().from(s.files).where(eq(s.files.id, model.fileId));
  await db.delete(s.shareLinkItems).where(and(eq(s.shareLinkItems.itemType, "model"), eq(s.shareLinkItems.itemId, id)));
  await db.delete(s.files).where(eq(s.files.id, model.fileId)); // cascades to the model
  if (file) await deleteStored(file.storageKey).catch(() => {});
  await audit(user, "delete", "model", id, { title: model.title });
  refresh(project.id);
  redirect(`/projects/${project.id}/models`);
}

// ── 360° tours ──────────────────────────────────────────────────────────────

export async function createTour(_: FormState, formData: FormData): Promise<FormState> {
  const { user, project } = await requireStudioProject(String(formData.get("projectId")));
  const title = z.string().trim().min(2).safeParse(formData.get("title"));
  if (!title.success) return { error: "Name the tour." };
  const db = await getDb();
  const [tour] = await db
    .insert(s.tours)
    .values({ projectId: project.id, title: title.data, createdBy: user.id })
    .returning({ id: s.tours.id });
  await audit(user, "create", "tour", tour.id);
  refresh(project.id);
  redirect(`/projects/${project.id}/tours/${tour.id}`);
}

async function requireTour(projectId: string, tourId: string) {
  const ctx = await requireStudioProject(projectId);
  const db = await getDb();
  const [tour] = await db
    .select()
    .from(s.tours)
    .where(and(eq(s.tours.id, uuid.parse(tourId)), eq(s.tours.projectId, ctx.project.id)));
  if (!tour) throw new Error("That tour was not found.");
  return { ...ctx, tour };
}

async function requireScene(projectId: string, sceneId: string) {
  const ctx = await requireStudioProject(projectId);
  const db = await getDb();
  const [scene] = await db
    .select({ id: s.tourScenes.id, tourId: s.tourScenes.tourId, fileId: s.tourScenes.fileId, position: s.tourScenes.position })
    .from(s.tourScenes)
    .innerJoin(s.tours, eq(s.tours.id, s.tourScenes.tourId))
    .where(and(eq(s.tourScenes.id, uuid.parse(sceneId)), eq(s.tours.projectId, ctx.project.id)));
  if (!scene) throw new Error("That scene was not found.");
  return { ...ctx, scene };
}

export async function addScene(input: { projectId: string; tourId: string; fileId: string; title: string }) {
  const { user, project, tour } = await requireTour(input.projectId, input.tourId);
  const file = await claimUpload(user, project.id, input.fileId);
  const db = await getDb();
  const [{ last }] = await db.select({ last: max(s.tourScenes.position) }).from(s.tourScenes).where(eq(s.tourScenes.tourId, tour.id));
  const fromName = file.name.replace(/\.(jpe?g|png|webp)$/i, "").replace(/[-_]+/g, " ").trim();
  const title = input.title.trim() || fromName.charAt(0).toUpperCase() + fromName.slice(1);
  const [scene] = await db
    .insert(s.tourScenes)
    .values({ tourId: tour.id, title, fileId: file.id, position: (last ?? -1) + 1 })
    .returning({ id: s.tourScenes.id });
  refresh(project.id);
  return { id: scene.id };
}

export async function renameScene(input: { projectId: string; sceneId: string; title: string }) {
  const { project, scene } = await requireScene(input.projectId, input.sceneId);
  const title = input.title.trim().slice(0, 80);
  if (!title) return;
  const db = await getDb();
  await db.update(s.tourScenes).set({ title }).where(eq(s.tourScenes.id, scene.id));
  refresh(project.id);
}

/** Moves the scene to the front, so the tour opens on it. */
export async function setStartScene(input: { projectId: string; sceneId: string }) {
  const { project, scene } = await requireScene(input.projectId, input.sceneId);
  const db = await getDb();
  const all = await db.select({ id: s.tourScenes.id }).from(s.tourScenes).where(eq(s.tourScenes.tourId, scene.tourId)).orderBy(asc(s.tourScenes.position));
  const ordered = [scene.id, ...all.map((r) => r.id).filter((id) => id !== scene.id)];
  await db.transaction(async (tx) => {
    for (const [position, id] of ordered.entries()) {
      await tx.update(s.tourScenes).set({ position }).where(eq(s.tourScenes.id, id));
    }
  });
  refresh(project.id);
}

export async function deleteScene(input: { projectId: string; sceneId: string }) {
  const { user, project, scene } = await requireScene(input.projectId, input.sceneId);
  const db = await getDb();
  const [file] = await db.select().from(s.files).where(eq(s.files.id, scene.fileId));
  await db.delete(s.files).where(eq(s.files.id, scene.fileId)); // cascades to the scene and its doors
  if (file) await deleteStored(file.storageKey).catch(() => {});
  await audit(user, "delete", "tour_scene", scene.id);
  refresh(project.id);
}

export async function addHotspot(input: { projectId: string; sceneId: string; targetSceneId: string; yaw: number; pitch: number }) {
  const { project, scene } = await requireScene(input.projectId, input.sceneId);
  const { scene: target } = await requireScene(input.projectId, input.targetSceneId);
  if (target.tourId !== scene.tourId || target.id === scene.id) throw new Error("Pick another scene in this tour.");
  const yaw = z.number().finite().parse(input.yaw);
  const pitch = z.number().min(-Math.PI / 2).max(Math.PI / 2).parse(input.pitch);
  const db = await getDb();
  const [row] = await db
    .insert(s.tourHotspots)
    .values({ sceneId: scene.id, targetSceneId: target.id, yaw, pitch })
    .returning({ id: s.tourHotspots.id });
  refresh(project.id);
  return { id: row.id };
}

export async function deleteHotspot(input: { projectId: string; hotspotId: string }) {
  const { project } = await requireStudioProject(input.projectId);
  const db = await getDb();
  const [row] = await db
    .select({ id: s.tourHotspots.id })
    .from(s.tourHotspots)
    .innerJoin(s.tourScenes, eq(s.tourScenes.id, s.tourHotspots.sceneId))
    .innerJoin(s.tours, eq(s.tours.id, s.tourScenes.tourId))
    .where(and(eq(s.tourHotspots.id, uuid.parse(input.hotspotId)), eq(s.tours.projectId, project.id)));
  if (!row) return;
  await db.delete(s.tourHotspots).where(eq(s.tourHotspots.id, row.id));
  refresh(project.id);
}

export async function deleteTour(formData: FormData) {
  const { user, project, tour } = await requireTour(String(formData.get("projectId")), String(formData.get("id")));
  const db = await getDb();
  const scenes = await db
    .select({ fileId: s.tourScenes.fileId, key: s.files.storageKey })
    .from(s.tourScenes)
    .innerJoin(s.files, eq(s.files.id, s.tourScenes.fileId))
    .where(eq(s.tourScenes.tourId, tour.id));
  await db.delete(s.shareLinkItems).where(and(eq(s.shareLinkItems.itemType, "tour"), eq(s.shareLinkItems.itemId, tour.id)));
  await db.delete(s.tours).where(eq(s.tours.id, tour.id));
  for (const sc of scenes) {
    await db.delete(s.files).where(eq(s.files.id, sc.fileId));
    await deleteStored(sc.key).catch(() => {});
  }
  await audit(user, "delete", "tour", tour.id, { title: tour.title });
  refresh(project.id);
  redirect(`/projects/${project.id}/tours`);
}

// ── Share links and embeds ──────────────────────────────────────────────────

async function requireShareProject(projectId: string) {
  const user = await requirePermission("share.manage");
  const project = await visibleProject(user, uuid.parse(projectId));
  if (!project) throw new Error("That project was not found.");
  return { user, project };
}

/** Checks each "type:id" item belongs to the project. */
async function parseItems(projectId: string, raw: string[]) {
  const db = await getDb();
  const items: { itemType: s.ShareItemType; itemId: string }[] = [];
  for (const value of raw) {
    const [type, id] = value.split(":");
    const itemType = z.enum(SHARE_ITEM_TYPES).parse(type);
    const itemId = uuid.parse(id);
    if (itemType === "site_updates") {
      // Site progress is the project itself.
      if (itemId === projectId) items.push({ itemType, itemId });
      continue;
    }
    const table = itemType === "model" ? s.models3d : itemType === "tour" ? s.tours : s.drawings;
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, itemId), eq(table.projectId, projectId)));
    if (row) items.push({ itemType, itemId });
  }
  return items;
}

export async function createShareLink(_: FormState, formData: FormData): Promise<FormState> {
  const { user, project } = await requireShareProject(String(formData.get("projectId")));
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Give the link a name your client will see."),
      message: z.string().trim().max(1000),
      passcode: z.string().trim().max(64),
      expires: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid expiry date."),
    })
    .safeParse({
      title: formData.get("title"),
      message: formData.get("message") ?? "",
      passcode: formData.get("passcode") ?? "",
      expires: formData.get("expires") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { title, message, passcode, expires } = parsed.data;
  if (passcode && passcode.length < 4) return { error: "Use a passcode of at least 4 characters, or leave it empty." };

  const items = await parseItems(project.id, formData.getAll("item").map(String));
  if (items.length === 0) return { error: "Choose at least one drawing, model or tour to share." };

  const expiresAt = expires ? new Date(`${expires}T23:59:59`) : null;
  if (expiresAt && expiresAt < new Date()) return { error: "The expiry date has already passed." };

  const db = await getDb();
  const token = randomBytes(18).toString("base64url");
  await db.transaction(async (tx) => {
    const [link] = await tx
      .insert(s.shareLinks)
      .values({
        projectId: project.id,
        token,
        title,
        message: message || null,
        passcodeHash: passcode ? await hashPassword(passcode) : null,
        expiresAt,
        createdBy: user.id,
      })
      .returning({ id: s.shareLinks.id });
    await tx.insert(s.shareLinkItems).values(items.map((it, position) => ({ shareLinkId: link.id, ...it, position })));
  });
  await audit(user, "create", "share_link", token.slice(0, 6), { title, items: items.length });
  refresh(project.id);
  return { ok: "Link created. Copy it from the list." };
}

export async function revokeShareLink(formData: FormData) {
  const { user, project } = await requireShareProject(String(formData.get("projectId")));
  const id = uuid.parse(formData.get("id"));
  const db = await getDb();
  await db
    .update(s.shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.shareLinks.id, id), eq(s.shareLinks.projectId, project.id)));
  await audit(user, "revoke", "share_link", id);
  refresh(project.id);
}

/** The embed link for one model or tour, made on first request. */
export async function getEmbedToken(input: { projectId: string; itemType: s.ShareItemType; itemId: string }) {
  const { user, project } = await requireShareProject(input.projectId);
  const [item] = await parseItems(project.id, [`${input.itemType}:${input.itemId}`]);
  if (!item) throw new Error("That item was not found.");

  const { findEmbedLink } = await import("@/lib/studio");
  const existing = await findEmbedLink(project.id, item.itemType, item.itemId);
  if (existing) return existing;

  const db = await getDb();
  if (item.itemType === "drawing" || item.itemType === "site_updates") throw new Error("Only models and tours can be embedded.");
  const table = item.itemType === "model" ? s.models3d : s.tours;
  const [{ title }] = await db.select({ title: table.title }).from(table).where(eq(table.id, item.itemId));
  const token = randomBytes(18).toString("base64url");
  await db.transaction(async (tx) => {
    const [link] = await tx
      .insert(s.shareLinks)
      .values({ projectId: project.id, token, title: `Embed: ${title}`, createdBy: user.id })
      .returning({ id: s.shareLinks.id });
    await tx.insert(s.shareLinkItems).values({ shareLinkId: link.id, ...item });
  });
  await audit(user, "create", "embed", item.itemId);
  refresh(project.id);
  return token;
}

// ── Public: unlocking a link with its passcode ──────────────────────────────

export async function unlockShare(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const passcode = String(formData.get("passcode") ?? "");
  const { state, link } = await loadShare(token);
  if (!link || state !== "locked" || !link.passcodeHash) return { error: "This link cannot be opened." };

  const db = await getDb();
  const key = `share:${link.id}`;
  const since = new Date(Date.now() - 15 * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.email, key), gt(s.loginAttempts.createdAt, since)));
  if (n >= 8) return { error: "Too many tries. Wait 15 minutes, or ask the studio for the passcode." };

  if (!(await verifyPassword(passcode.trim(), link.passcodeHash))) {
    await db.insert(s.loginAttempts).values({ email: key });
    return { error: "That passcode is not right." };
  }

  (await cookies()).set(shareCookieName(link.id), shareCookieValue(link.token, link.passcodeHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/s/${link.token}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(`/s/${link.token}`);
}
