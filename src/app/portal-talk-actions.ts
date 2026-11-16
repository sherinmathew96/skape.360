"use server";

import { revalidatePath } from "@/lib/live";
import { cookies } from "next/headers";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { DECISIONS } from "@/db/schema";
import { portalSeenCookie } from "@/lib/client-updates";
import { itemValues, listComments, type CommentItem } from "@/lib/comments";
import { latestIssued, recordApproval } from "@/lib/decisions";
import { appOrigin } from "@/lib/origin";
import { loadPortal, type Portal } from "@/lib/portal";
import { ensureShareSlug } from "@/lib/share-slugs";

type Result<T = undefined> = { ok: true; data?: T } | { error: string };
export type ClientComment = { id: string; author: "client" | "studio"; authorName: string; body: string; createdAt: string };

const uuid = z.string().uuid();
const itemSchema = z.object({ kind: z.enum(["drawing", "model", "render"]), id: uuid });
const nameSchema = z.string().trim().min(2, "Add your name.").max(60, "Keep your name under 60 characters.");

/** The portal, only once its passcode has been given on this device. */
async function openPortal(slug: string): Promise<Portal> {
  const { state, portal } = await loadPortal(String(slug));
  if (!portal || state !== "ok") throw new Error("This page has expired. Reload it and try again.");
  return portal;
}

async function drawingVisible(portal: Portal, drawingId: string) {
  if (!portal.sections.drawings) return false;
  const db = await getDb();
  const [d] = await db
    .select({ id: s.drawings.id })
    .from(s.drawings)
    .where(and(eq(s.drawings.id, drawingId), eq(s.drawings.projectId, portal.projectId), eq(s.drawings.clientVisible, true), isNull(s.drawings.deletedAt)));
  return Boolean(d);
}

/** The client may only see and talk about what their portal shows. */
async function assertVisible(portal: Portal, item: CommentItem) {
  const db = await getDb();
  let ok = false;
  if (item.kind === "drawing") ok = await drawingVisible(portal, item.id);
  if (item.kind === "render") {
    const [r] = await db.select({ drawingId: s.drawingRenders.drawingId }).from(s.drawingRenders).where(and(eq(s.drawingRenders.id, item.id), eq(s.drawingRenders.projectId, portal.projectId)));
    ok = Boolean(r) && (await drawingVisible(portal, r.drawingId));
  }
  if (item.kind === "model") {
    const [m] = await db.select({ id: s.models3d.id }).from(s.models3d).where(and(eq(s.models3d.id, item.id), eq(s.models3d.projectId, portal.projectId), isNull(s.models3d.deletedAt)));
    if (m) {
      if (portal.sections.models) ok = true;
      else {
        const links = await db.select({ drawingId: s.drawingModels.drawingId }).from(s.drawingModels).where(eq(s.drawingModels.modelId, m.id));
        for (const l of links) if (await drawingVisible(portal, l.drawingId)) ok = true;
      }
    }
  }
  if (!ok) throw new Error("That was not found.");
}

const serialise = (rows: Awaited<ReturnType<typeof listComments>>): ClientComment[] => rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
const fail = (err: unknown) => ({ error: err instanceof Error ? err.message : "That didn't work. Try again." });

export async function portalComments(slug: string, input: CommentItem): Promise<Result<ClientComment[]>> {
  try {
    const portal = await openPortal(slug);
    const item = itemSchema.parse(input);
    await assertVisible(portal, item);
    return { ok: true, data: serialise(await listComments(item)) };
  } catch (err) {
    return fail(err);
  }
}

export async function postPortalComment(slug: string, input: CommentItem, name: string, body: string): Promise<Result<ClientComment[]>> {
  try {
    const portal = await openPortal(slug);
    const item = itemSchema.parse(input);
    const who = nameSchema.parse(name);
    const text = z.string().trim().min(1, "Write a comment.").max(2000, "Keep it under 2,000 characters.").parse(body);
    await assertVisible(portal, item);
    const db = await getDb();
    // A guard for open portals: a burst of comments is refused.
    const [{ n }] = await db
      .select({ n: count() })
      .from(s.comments)
      .where(and(eq(s.comments.portalId, portal.id), gt(s.comments.createdAt, sql`now() - interval '1 minute'`)));
    if (n >= 10) throw new Error("Too many comments at once. Wait a minute and try again.");
    await db.insert(s.comments).values({ projectId: portal.projectId, ...itemValues(item), author: "client", authorName: who, portalId: portal.id, body: text });
    revalidatePath(`/projects/${portal.projectId}`, "layout");
    return { ok: true, data: serialise(await listComments(item)) };
  } catch (err) {
    return fail(err instanceof z.ZodError ? new Error(err.issues[0]?.message) : err);
  }
}

/** The client approves the drawing's current revision, or asks for changes (which needs a comment). */
const CLIENT_APPROVAL_OFF = true;

export async function decidePortalDrawing(slug: string, input: { drawingId: string; decision: string; name: string; comment: string }): Promise<Result> {
  // Client approval is switched off; the studio sets drawing status itself.
  if (CLIENT_APPROVAL_OFF) return { error: "Approval is not available here." };
  try {
    const portal = await openPortal(slug);
    const drawingId = uuid.parse(input.drawingId);
    const decision = z.enum(DECISIONS).parse(input.decision);
    const who = nameSchema.parse(input.name);
    const comment = z.string().trim().max(2000).parse(input.comment ?? "");
    if (decision === "changes_requested" && !comment) throw new Error("Say what needs to change.");
    if (!(await drawingVisible(portal, drawingId))) throw new Error("That drawing was not found.");
    const latest = await latestIssued(drawingId);
    if (!latest) throw new Error("There is no issued revision to approve yet.");
    if (latest.status === "approved" || latest.status === "changes_requested") throw new Error(`R${latest.rev} already has a decision.`);
    await recordApproval({ revisionId: latest.id, drawingId, decision, name: who, comment: comment || null, portalId: portal.id });
    revalidatePath(`/projects/${portal.projectId}`, "layout");
    revalidatePath(`/${portal.slug}`, "layout");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof z.ZodError ? new Error(err.issues[0]?.message) : err);
  }
}

/** Marks the portal's updates as seen on this device. */
export async function markPortalSeen(slug: string): Promise<void> {
  const portal = await openPortal(slug).catch(() => null);
  if (!portal) return;
  (await cookies()).set(portalSeenCookie(portal.id), new Date().toISOString(), {
    path: `/${portal.slug}`,
    maxAge: 365 * 86_400,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/** A link to one group or drawing, for the client to pass on (it asks for the same passcode). */
export async function portalShareLink(slug: string, kind: string, id: string): Promise<{ url: string } | { error: string }> {
  try {
    const portal = await openPortal(slug);
    const k = z.enum(["group", "drawing"]).parse(kind);
    const itemId = uuid.parse(id);
    const db = await getDb();
    let name: string | null = null;
    if (k === "drawing") {
      if (!(await drawingVisible(portal, itemId))) throw new Error("That drawing was not found.");
      const [d] = await db.select({ title: s.drawings.title }).from(s.drawings).where(eq(s.drawings.id, itemId));
      name = d?.title ?? null;
    } else if (portal.sections.drawings) {
      const [g] = await db
        .select({ name: s.drawingGroups.name })
        .from(s.drawingGroups)
        .where(and(eq(s.drawingGroups.id, itemId), eq(s.drawingGroups.projectId, portal.projectId), isNull(s.drawingGroups.deletedAt)));
      name = g?.name ?? null;
    }
    if (!name) throw new Error("That was not found.");
    const share = await ensureShareSlug(k, itemId, name, portal.slug);
    return { url: `${await appOrigin()}/${share}` };
  } catch (err) {
    return fail(err);
  }
}
