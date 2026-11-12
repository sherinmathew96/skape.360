import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { orderTotals, toPaise } from "./money";

export const METHOD_LABEL: Record<s.PaymentMethod, string> = {
  bank: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
};

export const CATEGORY_LABEL: Record<s.ExpenseCategory, string> = {
  site_petty_cash: "Site petty cash",
  labour_wages: "Labour wages",
  transport: "Transport and loading",
  travel: "Travel",
  printing: "Printing",
  consultants: "Consultants",
  rent: "Rent",
  utilities: "Electricity, internet, phone",
  software: "Software",
  office: "Office supplies",
  other: "Other",
};

// ── Invoices ────────────────────────────────────────────────────────────────

const invoiceColumns = {
  id: s.invoices.id,
  number: s.invoices.number,
  status: s.invoices.status,
  projectId: s.invoices.projectId,
  projectName: s.projects.name,
  projectCode: s.projects.code,
  clientId: s.clients.id,
  clientName: s.clients.name,
  milestoneId: s.invoices.milestoneId,
  issueDate: s.invoices.issueDate,
  dueDate: s.invoices.dueDate,
  placeOfSupply: s.invoices.placeOfSupply,
  notes: s.invoices.notes,
  createdAt: s.invoices.createdAt,
};

async function invoiceParts(ids: string[]) {
  if (ids.length === 0) return { items: [], payments: [] };
  const db = await getDb();
  const [items, payments] = await Promise.all([
    db.select().from(s.invoiceItems).where(inArray(s.invoiceItems.invoiceId, ids)).orderBy(asc(s.invoiceItems.position)),
    db
      .select({
        id: s.paymentsReceived.id,
        invoiceId: s.paymentsReceived.invoiceId,
        receivedOn: s.paymentsReceived.receivedOn,
        amount: s.paymentsReceived.amount,
        tds: s.paymentsReceived.tds,
        method: s.paymentsReceived.method,
        reference: s.paymentsReceived.reference,
        recordedByName: s.users.name,
      })
      .from(s.paymentsReceived)
      .leftJoin(s.users, eq(s.users.id, s.paymentsReceived.recordedBy))
      .where(inArray(s.paymentsReceived.invoiceId, ids))
      .orderBy(desc(s.paymentsReceived.receivedOn)),
  ]);
  return { items, payments };
}

/** Totals in paise. Settled = money received plus tax the client deducted (TDS). */
function withMoney<T extends { id: string; status: s.InvoiceStatus }>(
  inv: T,
  items: (typeof s.invoiceItems.$inferSelect)[],
  payments: { invoiceId: string; amount: string; tds: string }[],
) {
  const own = items.filter((i) => i.invoiceId === inv.id);
  const totals = orderTotals(own);
  const mine = payments.filter((p) => p.invoiceId === inv.id);
  const received = mine.reduce((n, p) => n + toPaise(p.amount), 0);
  const tds = mine.reduce((n, p) => n + toPaise(p.tds), 0);
  const outstanding = inv.status === "issued" ? Math.max(0, totals.total - received - tds) : 0;
  return { ...inv, items: own, totals, received, tds, outstanding };
}

export async function listInvoices(where: { projectId?: string; status?: s.InvoiceStatus[] } = {}) {
  const db = await getDb();
  const rows = await db
    .select(invoiceColumns)
    .from(s.invoices)
    .innerJoin(s.projects, eq(s.projects.id, s.invoices.projectId))
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .where(
      and(
        isNull(s.projects.deletedAt),
        where.projectId ? eq(s.invoices.projectId, where.projectId) : undefined,
        where.status ? inArray(s.invoices.status, where.status) : undefined,
      ),
    )
    .orderBy(sql`${s.invoices.issueDate} desc nulls first`, desc(s.invoices.createdAt));
  const { items, payments } = await invoiceParts(rows.map((r) => r.id));
  return rows.map((r) => withMoney(r, items, payments));
}

export type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>[number];

export async function getInvoice(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      ...invoiceColumns,
      clientAddress: s.clients.address,
      clientGstin: s.clients.gstin,
      clientStateCode: s.clients.stateCode,
      clientEmail: s.clients.email,
      clientPhone: s.clients.phone,
      projectLocation: s.projects.location,
      milestoneName: s.milestones.name,
    })
    .from(s.invoices)
    .innerJoin(s.projects, eq(s.projects.id, s.invoices.projectId))
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .leftJoin(s.milestones, eq(s.milestones.id, s.invoices.milestoneId))
    .where(eq(s.invoices.id, id));
  if (!row) return null;
  const { items, payments } = await invoiceParts([row.id]);
  return { ...withMoney(row, items, payments), payments };
}

// ── Supplier bills ──────────────────────────────────────────────────────────

export async function listBills(where: { projectId?: string; poId?: string; open?: boolean } = {}) {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.vendorBills.id,
      billNumber: s.vendorBills.billNumber,
      billDate: s.vendorBills.billDate,
      dueDate: s.vendorBills.dueDate,
      amount: s.vendorBills.amount,
      gst: s.vendorBills.gst,
      cancelled: s.vendorBills.cancelled,
      supplierId: s.vendorBills.supplierId,
      supplierName: s.suppliers.name,
      projectId: s.vendorBills.projectId,
      projectName: s.projects.name,
      poId: s.vendorBills.poId,
      poNumber: s.purchaseOrders.number,
      paid: sql<string>`coalesce((select sum(vp.amount) from ${s.vendorPayments} vp where vp.bill_id = "vendor_bills"."id"), 0)`,
    })
    .from(s.vendorBills)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.vendorBills.supplierId))
    .leftJoin(s.projects, eq(s.projects.id, s.vendorBills.projectId))
    .leftJoin(s.purchaseOrders, eq(s.purchaseOrders.id, s.vendorBills.poId))
    .where(
      and(
        where.projectId ? eq(s.vendorBills.projectId, where.projectId) : undefined,
        where.poId ? eq(s.vendorBills.poId, where.poId) : undefined,
        where.open ? eq(s.vendorBills.cancelled, false) : undefined,
      ),
    )
    .orderBy(sql`${s.vendorBills.dueDate} asc nulls last`, desc(s.vendorBills.billDate));
  return rows
    .map((b) => {
      const total = toPaise(b.amount) + toPaise(b.gst);
      const paid = toPaise(b.paid);
      return { ...b, total, paidPaise: paid, balance: b.cancelled ? 0 : Math.max(0, total - paid) };
    })
    .filter((b) => !where.open || b.balance > 0);
}

export type BillRow = Awaited<ReturnType<typeof listBills>>[number];

export async function getBill(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [bill] = (await listBills()).filter((b) => b.id === id);
  if (!bill) return null;
  const db = await getDb();
  const [extra] = await db.select({ fileId: s.vendorBills.fileId, note: s.vendorBills.note }).from(s.vendorBills).where(eq(s.vendorBills.id, id));
  const payments = await db
    .select({
      id: s.vendorPayments.id,
      paidOn: s.vendorPayments.paidOn,
      amount: s.vendorPayments.amount,
      method: s.vendorPayments.method,
      reference: s.vendorPayments.reference,
      recordedByName: s.users.name,
    })
    .from(s.vendorPayments)
    .leftJoin(s.users, eq(s.users.id, s.vendorPayments.recordedBy))
    .where(eq(s.vendorPayments.billId, id))
    .orderBy(desc(s.vendorPayments.paidOn));
  return { ...bill, ...extra, payments };
}

/**
 * What a purchase order is worth so far, to check a supplier's bill against:
 * the whole order, what has actually been delivered, and what is already billed.
 */
export async function orderValue(poId: string) {
  const db = await getDb();
  const items = await db.select().from(s.poItems).where(eq(s.poItems.poId, poId));
  const received = items.length
    ? await db
        .select({ poItemId: s.goodsReceiptItems.poItemId, qty: sql<string>`sum(${s.goodsReceiptItems.quantity})` })
        .from(s.goodsReceiptItems)
        .where(inArray(s.goodsReceiptItems.poItemId, items.map((i) => i.id)))
        .groupBy(s.goodsReceiptItems.poItemId)
    : [];
  const ordered = orderTotals(items);
  const delivered = orderTotals(items.map((i) => ({ ...i, quantity: received.find((r) => r.poItemId === i.id)?.qty ?? "0" })));
  const billed = (await listBills({ poId })).filter((b) => !b.cancelled).reduce((n, b) => n + b.total, 0);
  return { ordered: ordered.total, delivered: delivered.total, billed };
}

// ── Expenses ────────────────────────────────────────────────────────────────

export async function listExpenses(where: { projectId?: string | null; from?: string; to?: string } = {}) {
  const db = await getDb();
  return db
    .select({
      id: s.expenses.id,
      projectId: s.expenses.projectId,
      projectName: s.projects.name,
      category: s.expenses.category,
      spentOn: s.expenses.spentOn,
      amount: s.expenses.amount,
      description: s.expenses.description,
      method: s.expenses.method,
      receiptFileId: s.expenses.receiptFileId,
      recordedBy: s.expenses.recordedBy,
      recordedByName: s.users.name,
      createdAt: s.expenses.createdAt,
    })
    .from(s.expenses)
    .leftJoin(s.projects, eq(s.projects.id, s.expenses.projectId))
    .leftJoin(s.users, eq(s.users.id, s.expenses.recordedBy))
    .where(
      and(
        where.projectId === null ? isNull(s.expenses.projectId) : where.projectId ? eq(s.expenses.projectId, where.projectId) : undefined,
        where.from ? gte(s.expenses.spentOn, where.from) : undefined,
        where.to ? lte(s.expenses.spentOn, where.to) : undefined,
      ),
    )
    .orderBy(desc(s.expenses.spentOn), desc(s.expenses.createdAt));
}

// ── A project's money ───────────────────────────────────────────────────────

export async function projectMoney(projectId: string) {
  const db = await getDb();
  const [[project], invoices, bills, expenses, orders] = await Promise.all([
    db.select({ fee: s.projects.fee }).from(s.projects).where(eq(s.projects.id, projectId)),
    listInvoices({ projectId }),
    listBills({ projectId }),
    listExpenses({ projectId }),
    db
      .select({ id: s.purchaseOrders.id })
      .from(s.purchaseOrders)
      .where(and(eq(s.purchaseOrders.projectId, projectId), inArray(s.purchaseOrders.status, ["issued", "partly_received", "received"]))),
  ]);
  const issued = invoices.filter((i) => i.status === "issued");
  const invoicedFee = issued.reduce((n, i) => n + i.totals.amount, 0);
  const invoiced = issued.reduce((n, i) => n + i.totals.total, 0);
  const received = issued.reduce((n, i) => n + i.received + i.tds, 0);
  const outstanding = issued.reduce((n, i) => n + i.outstanding, 0);
  const liveBills = bills.filter((b) => !b.cancelled);
  const billsTotal = liveBills.reduce((n, b) => n + b.total, 0);
  const billsUnpaid = liveBills.reduce((n, b) => n + b.balance, 0);
  const expensesTotal = expenses.reduce((n, e) => n + toPaise(e.amount), 0);

  // Ordered from suppliers but not billed yet: money already committed.
  let unbilledOrders = 0;
  for (const o of orders) {
    const v = await orderValue(o.id);
    unbilledOrders += Math.max(0, v.ordered - v.billed);
  }
  const fee = project?.fee ? toPaise(project.fee) : null;
  return {
    fee,
    invoicedFee,
    invoiced,
    received,
    outstanding,
    billsTotal,
    billsUnpaid,
    expensesTotal,
    unbilledOrders,
    costs: billsTotal + expensesTotal,
    invoices,
    bills,
    expenses,
  };
}
