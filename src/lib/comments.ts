import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { SessionUser } from "./auth";
import { visibleProjects } from "./data";

export type CommentKind = "drawing" | "model" | "render";
export type CommentItem = { kind: CommentKind; id: string };
export type CommentRow = { id: string; author: "client" | "studio"; authorName: string; body: string; createdAt: Date };

export const itemColumn = (kind: CommentKind) => (kind === "drawing" ? s.comments.drawingId : kind === "model" ? s.comments.modelId : s.comments.renderId);

export const itemValues = (item: CommentItem) => ({
  drawingId: item.kind === "drawing" ? item.id : null,
  modelId: item.kind === "model" ? item.id : null,
  renderId: item.kind === "render" ? item.id : null,
});

/** One thread, oldest first. */
export async function listComments(item: CommentItem): Promise<CommentRow[]> {
  const db = await getDb();
  return db
    .select({ id: s.comments.id, author: s.comments.author, authorName: s.comments.authorName, body: s.comments.body, createdAt: s.comments.createdAt })
    .from(s.comments)
    .where(eq(itemColumn(item.kind), item.id))
    .orderBy(asc(s.comments.createdAt))
    .limit(300);
}

/** Many threads at once, keyed "kind:id". */
export async function threadsFor(items: CommentItem[]): Promise<Map<string, CommentRow[]>> {
  const out = new Map<string, CommentRow[]>(items.map((i) => [`${i.kind}:${i.id}`, []]));
  if (!items.length) return out;
  const ids = (k: CommentKind) => items.filter((i) => i.kind === k).map((i) => i.id);
  const conds = (["drawing", "model", "render"] as const).filter((k) => ids(k).length).map((k) => inArray(itemColumn(k), ids(k)));
  const db = await getDb();
  const rows = await db.select().from(s.comments).where(or(...conds)).orderBy(asc(s.comments.createdAt));
  for (const r of rows) {
    const key = r.drawingId ? `drawing:${r.drawingId}` : r.modelId ? `model:${r.modelId}` : `render:${r.renderId}`;
    out.get(key)?.push({ id: r.id, author: r.author, authorName: r.authorName, body: r.body, createdAt: r.createdAt });
  }
  return out;
}

/**
 * For each drawing, how many of its threads (the drawing, its renders, the
 * models shown with it) end with the client: they are waiting for a reply.
 */
export async function awaitingReply(projectId: string): Promise<Map<string, number>> {
  const db = await getDb();
  const [rows, renders, links] = await Promise.all([
    db
      .select({ drawingId: s.comments.drawingId, modelId: s.comments.modelId, renderId: s.comments.renderId, author: s.comments.author })
      .from(s.comments)
      .where(eq(s.comments.projectId, projectId))
      .orderBy(asc(s.comments.createdAt)),
    db.select({ id: s.drawingRenders.id, drawingId: s.drawingRenders.drawingId }).from(s.drawingRenders).where(eq(s.drawingRenders.projectId, projectId)),
    db
      .select({ drawingId: s.drawingModels.drawingId, modelId: s.drawingModels.modelId })
      .from(s.drawingModels)
      .innerJoin(s.drawings, eq(s.drawings.id, s.drawingModels.drawingId))
      .where(eq(s.drawings.projectId, projectId)),
  ]);
  const last = new Map<string, string>();
  for (const r of rows) last.set(r.drawingId ? `d:${r.drawingId}` : r.modelId ? `m:${r.modelId}` : `r:${r.renderId}`, r.author);
  const out = new Map<string, number>();
  const bump = (drawingId: string) => out.set(drawingId, (out.get(drawingId) ?? 0) + 1);
  for (const [key, author] of last) {
    if (author !== "client") continue;
    const [k, id] = [key.slice(0, 1), key.slice(2)];
    if (k === "d") bump(id);
    if (k === "r") renders.filter((x) => x.id === id).forEach((x) => bump(x.drawingId));
    if (k === "m") links.filter((x) => x.modelId === id).forEach((x) => bump(x.drawingId));
  }
  return out;
}

export type InboxEntry = {
  key: string;
  kind: "comment" | "approval";
  projectId: string;
  projectName: string;
  /** What it is about, e.g. "Partition wall" or "Render 1 · Partition wall" */
  subject: string;
  name: string;
  body: string | null;
  decision: "approved" | "changes_requested" | null;
  href: string;
  createdAt: Date;
};

/** Client comments and portal approvals on the projects this person sees, newest first. */
export async function studioInbox(user: SessionUser, limit = 80): Promise<InboxEntry[]> {
  const db = await getDb();
  const [comments, approvals] = await Promise.all([
    db
      .select({
        id: s.comments.id,
        projectId: s.comments.projectId,
        projectName: s.projects.name,
        drawingId: s.comments.drawingId,
        modelId: s.comments.modelId,
        renderId: s.comments.renderId,
        drawingTitle: s.drawings.title,
        modelTitle: s.models3d.title,
        renderTitle: s.drawingRenders.title,
        renderDrawingId: s.drawingRenders.drawingId,
        name: s.comments.authorName,
        body: s.comments.body,
        createdAt: s.comments.createdAt,
      })
      .from(s.comments)
      .innerJoin(s.projects, eq(s.projects.id, s.comments.projectId))
      .leftJoin(s.drawingRenders, eq(s.drawingRenders.id, s.comments.renderId))
      .leftJoin(s.drawings, sql`${s.drawings.id} = coalesce(${s.comments.drawingId}, ${s.drawingRenders.drawingId})`)
      .leftJoin(s.models3d, eq(s.models3d.id, s.comments.modelId))
      .where(and(eq(s.comments.author, "client"), visibleProjects(user)))
      .orderBy(desc(s.comments.createdAt))
      .limit(limit),
    db
      .select({
        id: s.approvals.id,
        projectId: s.projects.id,
        projectName: s.projects.name,
        drawingId: s.drawings.id,
        drawingTitle: s.drawings.title,
        rev: s.drawingRevisions.rev,
        name: s.approvals.name,
        decision: s.approvals.decision,
        comment: s.approvals.comment,
        createdAt: s.approvals.createdAt,
      })
      .from(s.approvals)
      .innerJoin(s.drawingRevisions, eq(s.drawingRevisions.id, s.approvals.revisionId))
      .innerJoin(s.drawings, eq(s.drawings.id, s.drawingRevisions.drawingId))
      .innerJoin(s.projects, eq(s.projects.id, s.drawings.projectId))
      .where(and(isNotNull(s.approvals.portalId), visibleProjects(user)))
      .orderBy(desc(s.approvals.createdAt))
      .limit(limit),
  ]);
  const entries: InboxEntry[] = [
    ...comments.map((c) => {
      const drawingId = c.drawingId ?? c.renderDrawingId;
      return {
        key: `c-${c.id}`,
        kind: "comment" as const,
        projectId: c.projectId,
        projectName: c.projectName,
        subject: c.modelId ? `3D model · ${c.modelTitle ?? ""}` : c.renderId ? `Render · ${c.drawingTitle ?? ""}` : (c.drawingTitle ?? "Drawing"),
        name: c.name,
        body: c.body,
        decision: null,
        href: c.modelId ? `/projects/${c.projectId}/models/${c.modelId}#comments` : `/projects/${c.projectId}/drawings/${drawingId}#comments`,
        createdAt: c.createdAt,
      };
    }),
    ...approvals.map((a) => ({
      key: `a-${a.id}`,
      kind: "approval" as const,
      projectId: a.projectId,
      projectName: a.projectName,
      subject: `${a.drawingTitle} R${a.rev}`,
      name: a.name,
      body: a.comment,
      decision: a.decision,
      href: `/projects/${a.projectId}/drawings/${a.drawingId}`,
      createdAt: a.createdAt,
    })),
  ];
  return entries.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, limit);
}

/** How many client comments and portal approvals arrived since this person last opened the inbox. */
export async function studioUnread(user: SessionUser): Promise<number> {
  const db = await getDb();
  const [me] = await db.select({ seen: s.users.inboxSeenAt }).from(s.users).where(eq(s.users.id, user.id));
  const since = me?.seen ?? new Date(Date.now() - 14 * 86_400_000);
  const [[c], [a]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.comments)
      .innerJoin(s.projects, eq(s.projects.id, s.comments.projectId))
      .where(and(eq(s.comments.author, "client"), gt(s.comments.createdAt, since), visibleProjects(user))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.approvals)
      .innerJoin(s.drawingRevisions, eq(s.drawingRevisions.id, s.approvals.revisionId))
      .innerJoin(s.drawings, eq(s.drawings.id, s.drawingRevisions.drawingId))
      .innerJoin(s.projects, eq(s.projects.id, s.drawings.projectId))
      .where(and(isNotNull(s.approvals.portalId), gt(s.approvals.createdAt, since), visibleProjects(user))),
  ]);
  return (c?.n ?? 0) + (a?.n ?? 0);
}

/** When this person last opened the inbox (for marking what's new); never opened counts the last two weeks as new. */
export async function inboxSeenAt(userId: string): Promise<Date> {
  const db = await getDb();
  const [me] = await db.select({ seen: s.users.inboxSeenAt }).from(s.users).where(eq(s.users.id, userId));
  return me?.seen ?? new Date(Date.now() - 14 * 86_400_000);
}
