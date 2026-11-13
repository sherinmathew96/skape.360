import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/db";

export const WEATHER_LABEL: Record<s.Weather, string> = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  rain: "Rain",
  heavy_rain: "Heavy rain",
};

/** Trades offered first on a new report; any trade can be typed in. */
export const COMMON_TRADES = ["Mason", "Helper", "Carpenter", "Bar bender", "Electrician", "Plumber", "Painter", "Tiler"];

export const labourTotal = (lines: s.LabourLine[]) => lines.reduce((n, l) => n + (Number(l.count) || 0), 0);

export async function listReports(projectId: string) {
  const db = await getDb();
  return db
    .select({
      id: s.siteReports.id,
      date: s.siteReports.date,
      weather: s.siteReports.weather,
      labour: s.siteReports.labour,
      workDone: s.siteReports.workDone,
      issues: s.siteReports.issues,
      clientVisible: s.siteReports.clientVisible,
      authorName: s.users.name,
      photos: sql<number>`(select count(*) from ${s.siteReportPhotos} p where p.report_id = "site_reports"."id")::int`,
    })
    .from(s.siteReports)
    .leftJoin(s.users, eq(s.users.id, s.siteReports.createdBy))
    .where(and(eq(s.siteReports.projectId, projectId), isNull(s.siteReports.deletedAt)))
    .orderBy(desc(s.siteReports.date));
}

export async function reportOnDate(projectId: string, date: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: s.siteReports.id })
    .from(s.siteReports)
    .where(and(eq(s.siteReports.projectId, projectId), eq(s.siteReports.date, date), isNull(s.siteReports.deletedAt)));
  return row?.id ?? null;
}

async function photosFor(reportIds: string[]) {
  if (reportIds.length === 0) return [];
  const db = await getDb();
  return db
    .select({ id: s.siteReportPhotos.id, reportId: s.siteReportPhotos.reportId, fileId: s.siteReportPhotos.fileId, caption: s.siteReportPhotos.caption })
    .from(s.siteReportPhotos)
    .innerJoin(s.files, and(eq(s.files.id, s.siteReportPhotos.fileId), eq(s.files.ready, true)))
    .where(inArray(s.siteReportPhotos.reportId, reportIds))
    .orderBy(asc(s.siteReportPhotos.createdAt));
}

export async function getReport(projectId: string, reportId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return null;
  const db = await getDb();
  const [report] = await db
    .select({
      id: s.siteReports.id,
      date: s.siteReports.date,
      weather: s.siteReports.weather,
      labour: s.siteReports.labour,
      workDone: s.siteReports.workDone,
      issues: s.siteReports.issues,
      clientVisible: s.siteReports.clientVisible,
      createdBy: s.siteReports.createdBy,
      authorName: s.users.name,
      updatedAt: s.siteReports.updatedAt,
    })
    .from(s.siteReports)
    .leftJoin(s.users, eq(s.users.id, s.siteReports.createdBy))
    .where(and(eq(s.siteReports.projectId, projectId), eq(s.siteReports.id, reportId), isNull(s.siteReports.deletedAt)));
  if (!report) return null;
  return { report, photos: await photosFor([report.id]) };
}

/** What a client link shows: reports marked for the client, without the internal issues. */
export async function clientSiteUpdates(projectId: string, limit = 30) {
  const db = await getDb();
  const reports = await db
    .select({ id: s.siteReports.id, date: s.siteReports.date, weather: s.siteReports.weather, workDone: s.siteReports.workDone })
    .from(s.siteReports)
    .where(and(eq(s.siteReports.projectId, projectId), eq(s.siteReports.clientVisible, true), isNull(s.siteReports.deletedAt)))
    .orderBy(desc(s.siteReports.date))
    .limit(limit);
  const photos = await photosFor(reports.map((r) => r.id));
  return reports.map((r) => ({ ...r, photos: photos.filter((p) => p.reportId === r.id) }));
}

export const snagCode = (n: number) => `S-${String(n).padStart(3, "0")}`;

export async function listSnags(projectId: string) {
  const db = await getDb();
  const creator = alias(s.users, "creator");
  return db
    .select({
      id: s.snags.id,
      number: s.snags.number,
      title: s.snags.title,
      location: s.snags.location,
      status: s.snags.status,
      dueDate: s.snags.dueDate,
      assigneeId: s.snags.assigneeId,
      assigneeName: s.users.name,
      createdBy: s.snags.createdBy,
      creatorName: creator.name,
      photoFileId: s.snags.photoFileId,
      fixPhotoFileId: s.snags.fixPhotoFileId,
      fixNote: s.snags.fixNote,
      createdAt: s.snags.createdAt,
      fixedAt: s.snags.fixedAt,
      closedAt: s.snags.closedAt,
    })
    .from(s.snags)
    .leftJoin(s.users, eq(s.users.id, s.snags.assigneeId))
    .leftJoin(creator, eq(creator.id, s.snags.createdBy))
    .where(eq(s.snags.projectId, projectId))
    .orderBy(sql`case ${s.snags.status} when 'open' then 0 when 'fixed' then 1 else 2 end`, sql`${s.snags.dueDate} asc nulls last`, desc(s.snags.number));
}

export type SnagRow = Awaited<ReturnType<typeof listSnags>>[number];
