import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/db";

export const DISCIPLINE_LABEL: Record<s.Discipline, string> = {
  architectural: "Architectural",
  structural: "Structural",
  mep: "MEP",
  interior: "Interior",
  landscape: "Landscape",
};

export const STATUS_LABEL: Record<s.RevisionStatus, string> = {
  draft: "Draft",
  issued: "With client",
  approved: "Approved",
  changes_requested: "Changes requested",
};

export const STATUS_PILL: Record<s.RevisionStatus, string> = {
  draft: "",
  issued: "pill-warning",
  approved: "pill-positive",
  changes_requested: "pill-negative",
};

export const revLabel = (rev: number) => `R${rev}`;

export type RevisionRow = {
  id: string;
  rev: number;
  status: s.RevisionStatus;
  note: string | null;
  fileId: string;
  fileName: string;
  contentType: string;
  size: number;
  issuedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
};

const revisionColumns = {
  id: s.drawingRevisions.id,
  drawingId: s.drawingRevisions.drawingId,
  rev: s.drawingRevisions.rev,
  status: s.drawingRevisions.status,
  note: s.drawingRevisions.note,
  fileId: s.drawingRevisions.fileId,
  fileName: s.files.name,
  contentType: s.files.contentType,
  size: s.files.size,
  issuedAt: s.drawingRevisions.issuedAt,
  createdAt: s.drawingRevisions.createdAt,
  createdByName: s.users.name,
};

async function revisionsFor(drawingIds: string[]) {
  if (drawingIds.length === 0) return [];
  const db = await getDb();
  return db
    .select(revisionColumns)
    .from(s.drawingRevisions)
    .innerJoin(s.files, eq(s.files.id, s.drawingRevisions.fileId))
    .leftJoin(s.users, eq(s.users.id, s.drawingRevisions.createdBy))
    .where(inArray(s.drawingRevisions.drawingId, drawingIds))
    .orderBy(desc(s.drawingRevisions.rev));
}

export type DrawingRow = {
  id: string;
  number: string;
  title: string;
  discipline: s.Discipline;
  latest: RevisionRow | null;
  revisions: number;
};

export async function listDrawings(projectId: string): Promise<DrawingRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: s.drawings.id, number: s.drawings.number, title: s.drawings.title, discipline: s.drawings.discipline })
    .from(s.drawings)
    .where(eq(s.drawings.projectId, projectId))
    .orderBy(asc(s.drawings.number));
  const revs = await revisionsFor(rows.map((r) => r.id));
  return rows.map((d) => {
    const own = revs.filter((r) => r.drawingId === d.id);
    return { ...d, latest: own[0] ?? null, revisions: own.length };
  });
}

export type ApprovalRow = {
  id: string;
  revisionId: string;
  decision: s.Decision;
  name: string;
  comment: string | null;
  createdAt: Date;
  via: string;
};

async function approvalsFor(revisionIds: string[]): Promise<ApprovalRow[]> {
  if (revisionIds.length === 0) return [];
  const db = await getDb();
  const recorder = alias(s.users, "recorder");
  const rows = await db
    .select({
      id: s.approvals.id,
      revisionId: s.approvals.revisionId,
      decision: s.approvals.decision,
      name: s.approvals.name,
      comment: s.approvals.comment,
      createdAt: s.approvals.createdAt,
      linkTitle: s.shareLinks.title,
      recorderName: recorder.name,
    })
    .from(s.approvals)
    .leftJoin(s.shareLinks, eq(s.shareLinks.id, s.approvals.shareLinkId))
    .leftJoin(recorder, eq(recorder.id, s.approvals.recordedBy))
    .where(inArray(s.approvals.revisionId, revisionIds))
    .orderBy(desc(s.approvals.createdAt));
  return rows.map(({ linkTitle, recorderName, ...a }) => ({
    ...a,
    via: recorderName ? `recorded by ${recorderName}` : linkTitle ? "through the client link" : "",
  }));
}

export async function getDrawing(projectId: string, drawingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(drawingId)) return null;
  const db = await getDb();
  const [drawing] = await db
    .select()
    .from(s.drawings)
    .where(and(eq(s.drawings.projectId, projectId), eq(s.drawings.id, drawingId)));
  if (!drawing) return null;
  const revisions: RevisionRow[] = await revisionsFor([drawing.id]);
  const approvals = await approvalsFor(revisions.map((r) => r.id));
  return { drawing, revisions, approvals };
}

/** What a client sees for a drawing: its newest revision that is not a draft. */
export type ClientDrawing = {
  id: string;
  number: string;
  title: string;
  revision: RevisionRow & { decision: ApprovalRow | null };
};

export async function clientDrawings(drawingIds: string[]): Promise<ClientDrawing[]> {
  if (drawingIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: s.drawings.id, number: s.drawings.number, title: s.drawings.title })
    .from(s.drawings)
    .where(inArray(s.drawings.id, drawingIds));
  const revs = (await revisionsFor(drawingIds)).filter((r) => r.status !== "draft");
  const approvals = await approvalsFor(revs.map((r) => r.id));
  return rows.flatMap((d) => {
    const revision = revs.find((r) => r.drawingId === d.id);
    if (!revision) return [];
    return [{ ...d, revision: { ...revision, decision: approvals.find((a) => a.revisionId === revision.id) ?? null } }];
  });
}

/** Drawings that have something to show a client. */
export async function shareableDrawings(projectId: string) {
  const db = await getDb();
  return db
    .selectDistinct({ id: s.drawings.id, number: s.drawings.number, title: s.drawings.title })
    .from(s.drawings)
    .innerJoin(s.drawingRevisions, eq(s.drawingRevisions.drawingId, s.drawings.id))
    .where(and(eq(s.drawings.projectId, projectId), ne(s.drawingRevisions.status, "draft")))
    .orderBy(asc(s.drawings.number));
}
