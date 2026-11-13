import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { WorkStatus } from "@/db/schema";
import { toPaise } from "./money";

export type WorkRow = {
  id: string;
  section: string;
  code: string | null;
  title: string;
  unit: string | null;
  qty: number | null;
  ratePaise: number | null;
  amountPaise: number | null;
  position: number;
  status: WorkStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedOn: string | null;
  completedOn: string | null;
  note: string | null;
};

/** A project's works in the order they are done on site. */
export async function listWorks(projectId: string): Promise<WorkRow[]> {
  const db = await getDb();
  const rows = await db.select().from(s.works).where(eq(s.works.projectId, projectId)).orderBy(asc(s.works.position), asc(s.works.createdAt));
  return rows.map((w) => ({
    id: w.id,
    section: w.section,
    code: w.code,
    title: w.title,
    unit: w.unit,
    qty: w.qty === null ? null : Number(w.qty),
    ratePaise: w.rate === null ? null : toPaise(w.rate),
    amountPaise: w.amount === null ? null : toPaise(w.amount),
    position: w.position,
    status: w.status,
    plannedStart: w.plannedStart,
    plannedEnd: w.plannedEnd,
    startedOn: w.startedOn,
    completedOn: w.completedOn,
    note: w.note,
  }));
}

export type SectionSummary = {
  name: string;
  works: WorkRow[];
  done: number;
  started: number;
  pct: number;
  status: WorkStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedOn: string | null;
  completedOn: string | null;
};

export type WorksSummary = ReturnType<typeof summariseWorks>;

const minOf = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
const maxOf = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

/**
 * Progress over the works. When every work has a BOQ value, progress is
 * weighted by value (a ₹5.5 lakh piling item counts more than a ₹5,000
 * one); otherwise each work counts the same. Only completed works count.
 */
export function summariseWorks(works: WorkRow[]) {
  const byValue = works.length > 0 && works.every((w) => (w.amountPaise ?? 0) > 0);
  const weight = (w: WorkRow) => (byValue ? w.amountPaise! : 1);
  const pctOf = (ws: WorkRow[]) => {
    const total = ws.reduce((a, w) => a + weight(w), 0);
    return total ? (ws.filter((w) => w.status === "done").reduce((a, w) => a + weight(w), 0) / total) * 100 : 0;
  };

  const order: string[] = [];
  const groups = new Map<string, WorkRow[]>();
  for (const w of works) {
    if (!groups.has(w.section)) {
      groups.set(w.section, []);
      order.push(w.section);
    }
    groups.get(w.section)!.push(w);
  }
  const sections: SectionSummary[] = order.map((name) => {
    const ws = groups.get(name)!;
    const done = ws.filter((w) => w.status === "done").length;
    const started = ws.filter((w) => w.status === "started").length;
    const status: WorkStatus = done === ws.length ? "done" : done || started ? "started" : "pending";
    return {
      name,
      works: ws,
      done,
      started,
      pct: pctOf(ws),
      status,
      plannedStart: minOf(ws.map((w) => w.plannedStart)),
      plannedEnd: maxOf(ws.map((w) => w.plannedEnd)),
      startedOn: minOf(ws.map((w) => w.startedOn ?? w.completedOn)),
      completedOn: status === "done" ? maxOf(ws.map((w) => w.completedOn)) : null,
    };
  });

  const valuePaise = works.reduce((a, w) => a + (w.amountPaise ?? 0), 0);
  const doneValuePaise = works.filter((w) => w.status === "done").reduce((a, w) => a + (w.amountPaise ?? 0), 0);
  const late = (today: string) => works.filter((w) => w.status !== "done" && w.plannedEnd && w.plannedEnd < today);

  return {
    total: works.length,
    done: works.filter((w) => w.status === "done").length,
    started: works.filter((w) => w.status === "started").length,
    pending: works.filter((w) => w.status === "pending").length,
    pct: pctOf(works),
    byValue,
    valuePaise,
    doneValuePaise,
    sections,
    current: works.filter((w) => w.status === "started"),
    next: works.filter((w) => w.status === "pending").slice(0, 3),
    late,
  };
}
