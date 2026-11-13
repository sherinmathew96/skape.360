import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
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
  number: string | null;
  title: string;
  discipline: s.Discipline;
  groupId: string | null;
  status: s.DrawingStatus;
  position: number;
  clientVisible: boolean;
  statusChangedAt: Date;
  assigneeId: string | null;
  assigneeName: string | null;
  latest: RevisionRow | null;
  revisions: number;
};

const drawingColumns = {
  id: s.drawings.id,
  number: s.drawings.number,
  title: s.drawings.title,
  discipline: s.drawings.discipline,
  groupId: s.drawings.groupId,
  status: s.drawings.status,
  position: s.drawings.position,
  clientVisible: s.drawings.clientVisible,
  statusChangedAt: s.drawings.statusChangedAt,
  assigneeId: s.drawings.assigneeId,
  assigneeName: s.users.name,
};

export async function listDrawings(projectId: string): Promise<DrawingRow[]> {
  const db = await getDb();
  const rows = await db
    .select(drawingColumns)
    .from(s.drawings)
    .leftJoin(s.users, eq(s.users.id, s.drawings.assigneeId))
    .where(and(eq(s.drawings.projectId, projectId), isNull(s.drawings.deletedAt)))
    .orderBy(asc(s.drawings.position), asc(s.drawings.createdAt));
  const revs = await revisionsFor(rows.map((r) => r.id));
  return rows.map((d) => {
    const own = revs.filter((r) => r.drawingId === d.id);
    return { ...d, latest: own[0] ?? null, revisions: own.length };
  });
}

export async function listGroups(projectId: string) {
  const db = await getDb();
  return db
    .select({ id: s.drawingGroups.id, name: s.drawingGroups.name, position: s.drawingGroups.position })
    .from(s.drawingGroups)
    .where(eq(s.drawingGroups.projectId, projectId))
    .orderBy(asc(s.drawingGroups.position), asc(s.drawingGroups.createdAt));
}

/** The register as sections: ungrouped drawings first under "General", then each group in order. */
export function groupRegister<T extends { groupId: string | null }>(groups: { id: string; name: string }[], drawings: T[]) {
  const general = drawings.filter((d) => !d.groupId || !groups.some((g) => g.id === d.groupId));
  return [
    ...(general.length ? [{ id: null as string | null, name: "General", drawings: general }] : []),
    ...groups.map((g) => ({ id: g.id as string | null, name: g.name, drawings: drawings.filter((d) => d.groupId === g.id) })),
  ];
}

/**
 * What a client sees in the shared register: every drawing marked for
 * clients, its status, and its newest revision that is not a draft.
 */
export async function clientRegister(projectId: string) {
  const [groups, all] = await Promise.all([listGroups(projectId), listDrawings(projectId)]);
  const visible = all.filter((d) => d.clientVisible);
  const shown = await clientDrawings(visible.map((d) => d.id));
  const rows = visible.map((d) => ({
    id: d.id,
    number: d.number,
    title: d.title,
    groupId: d.groupId,
    status: d.status,
    statusChangedAt: d.statusChangedAt,
    revision: shown.find((x) => x.id === d.id)?.revision ?? null,
  }));
  return groupRegister(groups, rows).filter((g) => g.drawings.length > 0);
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
      portalId: s.approvals.portalId,
    })
    .from(s.approvals)
    .leftJoin(s.shareLinks, eq(s.shareLinks.id, s.approvals.shareLinkId))
    .leftJoin(recorder, eq(recorder.id, s.approvals.recordedBy))
    .where(inArray(s.approvals.revisionId, revisionIds))
    .orderBy(desc(s.approvals.createdAt));
  return rows.map(({ linkTitle, recorderName, portalId, ...a }) => ({
    ...a,
    via: recorderName ? `recorded by ${recorderName}` : linkTitle ? "through the client link" : portalId ? "through the client portal" : "",
  }));
}

export async function getDrawing(projectId: string, drawingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(drawingId)) return null;
  const db = await getDb();
  const [drawing] = await db
    .select()
    .from(s.drawings)
    .where(and(eq(s.drawings.projectId, projectId), eq(s.drawings.id, drawingId), isNull(s.drawings.deletedAt)));
  if (!drawing) return null;
  const revisions: RevisionRow[] = await revisionsFor([drawing.id]);
  const approvals = await approvalsFor(revisions.map((r) => r.id));
  return { drawing, revisions, approvals };
}

/** What a client sees for a drawing: its newest revision that is not a draft. */
export type ClientDrawing = {
  id: string;
  number: string | null;
  title: string;
  revision: RevisionRow & { decision: ApprovalRow | null };
};

export async function clientDrawings(drawingIds: string[]): Promise<ClientDrawing[]> {
  if (drawingIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: s.drawings.id, number: s.drawings.number, title: s.drawings.title })
    .from(s.drawings)
    .where(and(inArray(s.drawings.id, drawingIds), isNull(s.drawings.deletedAt)));
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
    .where(and(eq(s.drawings.projectId, projectId), ne(s.drawingRevisions.status, "draft"), isNull(s.drawings.deletedAt)))
    .orderBy(asc(s.drawings.number));
}

/** People on the project's team, for "Drawn by". */
export async function projectTeam(projectId: string) {
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.projectMembers)
    .innerJoin(s.users, eq(s.users.id, s.projectMembers.userId))
    .where(eq(s.projectMembers.projectId, projectId))
    .orderBy(asc(s.users.name));
}
