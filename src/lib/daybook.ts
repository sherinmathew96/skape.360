import "server-only";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { CATEGORY_LABEL, METHOD_LABEL } from "./finance";
import { toPaise } from "./money";

export const INCOME_LABEL: Record<s.IncomeCategory, string> = {
  client_payment: "Client payment",
  advance: "Advance",
  refund: "Refund",
  scrap_sale: "Scrap or material sold",
  fees: "Fees",
  interest: "Interest",
  other: "Other income",
};

export type DayEntry = {
  /** "income" and "expense" rows are entered in the day book; "payment" rows come from invoices */
  source: "income" | "expense" | "payment";
  id: string;
  direction: "in" | "out";
  date: string;
  paise: number;
  category: string;
  description: string;
  method: string;
  receiptFileId: string | null;
  recordedBy: string | null;
  recordedByName: string | null;
  createdAt: Date;
  /** For invoice payments: the invoice it settles */
  invoiceId?: string;
};

/** A month as YYYY-MM, its first and last day. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * Money in and out for one book: a project's (projectId) or the office's
 * (null), between two dates, newest first. Expenses and incomes are what
 * people enter here; a project's invoice payments join it read-only so the
 * book shows everything that came in.
 */
export async function dayBook(projectId: string | null, from: string, to: string): Promise<DayEntry[]> {
  const db = await getDb();
  const scopeExpense = projectId ? eq(s.expenses.projectId, projectId) : isNull(s.expenses.projectId);
  const scopeIncome = projectId ? eq(s.incomes.projectId, projectId) : isNull(s.incomes.projectId);

  const [expenses, incomes, payments] = await Promise.all([
    db
      .select({
        id: s.expenses.id,
        date: s.expenses.spentOn,
        amount: s.expenses.amount,
        category: s.expenses.category,
        description: s.expenses.description,
        method: s.expenses.method,
        receiptFileId: s.expenses.receiptFileId,
        recordedBy: s.expenses.recordedBy,
        recordedByName: s.users.name,
        createdAt: s.expenses.createdAt,
      })
      .from(s.expenses)
      .leftJoin(s.users, eq(s.users.id, s.expenses.recordedBy))
      .where(and(scopeExpense, gte(s.expenses.spentOn, from), lte(s.expenses.spentOn, to))),
    db
      .select({
        id: s.incomes.id,
        date: s.incomes.receivedOn,
        amount: s.incomes.amount,
        category: s.incomes.category,
        description: s.incomes.description,
        method: s.incomes.method,
        receiptFileId: s.incomes.receiptFileId,
        recordedBy: s.incomes.recordedBy,
        recordedByName: s.users.name,
        createdAt: s.incomes.createdAt,
      })
      .from(s.incomes)
      .leftJoin(s.users, eq(s.users.id, s.incomes.recordedBy))
      .where(and(scopeIncome, gte(s.incomes.receivedOn, from), lte(s.incomes.receivedOn, to))),
    projectId
      ? db
          .select({
            id: s.paymentsReceived.id,
            date: s.paymentsReceived.receivedOn,
            amount: s.paymentsReceived.amount,
            method: s.paymentsReceived.method,
            reference: s.paymentsReceived.reference,
            invoiceId: s.invoices.id,
            invoiceNumber: s.invoices.number,
            recordedBy: s.paymentsReceived.recordedBy,
            recordedByName: s.users.name,
            createdAt: s.paymentsReceived.createdAt,
          })
          .from(s.paymentsReceived)
          .innerJoin(s.invoices, eq(s.invoices.id, s.paymentsReceived.invoiceId))
          .leftJoin(s.users, eq(s.users.id, s.paymentsReceived.recordedBy))
          .where(and(eq(s.invoices.projectId, projectId), gte(s.paymentsReceived.receivedOn, from), lte(s.paymentsReceived.receivedOn, to)))
      : Promise.resolve([]),
  ]);

  const entries: DayEntry[] = [
    ...expenses.map((e) => ({
      source: "expense" as const,
      id: e.id,
      direction: "out" as const,
      date: e.date,
      paise: toPaise(e.amount),
      category: CATEGORY_LABEL[e.category] ?? e.category,
      description: e.description,
      method: METHOD_LABEL[e.method] ?? e.method,
      receiptFileId: e.receiptFileId,
      recordedBy: e.recordedBy,
      recordedByName: e.recordedByName,
      createdAt: e.createdAt,
    })),
    ...incomes.map((i) => ({
      source: "income" as const,
      id: i.id,
      direction: "in" as const,
      date: i.date,
      paise: toPaise(i.amount),
      category: INCOME_LABEL[i.category] ?? i.category,
      description: i.description,
      method: METHOD_LABEL[i.method] ?? i.method,
      receiptFileId: i.receiptFileId,
      recordedBy: i.recordedBy,
      recordedByName: i.recordedByName,
      createdAt: i.createdAt,
    })),
    ...payments.map((p) => ({
      source: "payment" as const,
      id: p.id,
      direction: "in" as const,
      date: p.date,
      paise: toPaise(p.amount),
      category: "Invoice payment",
      description: `Against ${p.invoiceNumber ?? "an invoice"}${p.reference ? ` · ${p.reference}` : ""}`,
      method: METHOD_LABEL[p.method] ?? p.method,
      receiptFileId: null,
      recordedBy: p.recordedBy,
      recordedByName: p.recordedByName,
      createdAt: p.createdAt,
      invoiceId: p.invoiceId,
    })),
  ];
  return entries.sort((a, b) => (a.date === b.date ? b.createdAt.getTime() - a.createdAt.getTime() : b.date.localeCompare(a.date)));
}

/** Totals, and money in and out by category, for the figures and breakdown. */
export function summarise(entries: DayEntry[]) {
  const sum = (dir: "in" | "out") => entries.filter((e) => e.direction === dir).reduce((n, e) => n + e.paise, 0);
  const byCategory = (dir: "in" | "out") => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.direction === dir) m.set(e.category, (m.get(e.category) ?? 0) + e.paise);
    return [...m.entries()].map(([label, paise]) => ({ label, paise })).sort((a, b) => b.paise - a.paise);
  };
  return { inPaise: sum("in"), outPaise: sum("out"), inByCategory: byCategory("in"), outByCategory: byCategory("out") };
}

/** Entries grouped by day, newest day first, with each day's totals. */
export function byDay(entries: DayEntry[]) {
  const days = new Map<string, DayEntry[]>();
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return [...days.entries()].map(([date, list]) => ({
    date,
    entries: list,
    inPaise: list.filter((e) => e.direction === "in").reduce((n, e) => n + e.paise, 0),
    outPaise: list.filter((e) => e.direction === "out").reduce((n, e) => n + e.paise, 0),
  }));
}

/** Construction projects whose day books the office overview lists, with the month's totals. */
export async function projectBooks(from: string, to: string, projects: { id: string; name: string; type: s.ProjectType }[]) {
  const built = projects.filter((p) => p.type !== "design");
  return Promise.all(
    built.map(async (p) => {
      const sums = summarise(await dayBook(p.id, from, to));
      return { id: p.id, name: p.name, inPaise: sums.inPaise, outPaise: sums.outPaise };
    }),
  );
}

