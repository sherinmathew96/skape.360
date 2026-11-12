import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { getUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { listBills, listExpenses, listInvoices, CATEGORY_LABEL, METHOD_LABEL } from "@/lib/finance";
import { splitGst, stateName } from "@/lib/gst";
import { toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";

const rupees = (paise: number) => (paise / 100).toFixed(2);

/** A value safe for a spreadsheet: quoted, and never read as a formula. */
function cell(v: string | number | null | undefined) {
  let text = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(text) && !/^-?\d/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const csv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** CSV files of the financial year's money, for the accountant. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user || !can(user.role, "finance.view")) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const fy = url.searchParams.get("fy") ?? "";
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!m) return new Response("Give the financial year, e.g. 2026-27", { status: 400 });
  const from = `${m[1]}-04-01`;
  const to = `${Number(m[1]) + 1}-03-31`;
  const visible = new Set((await listProjects(user)).map((p) => p.id));
  const studio = await getBusinessSettings();
  const db = await getDb();

  let rows: (string | number | null | undefined)[][] = [];
  if (type === "invoices") {
    const invoices = (await listInvoices({ status: ["issued", "cancelled"] })).filter(
      (i) => visible.has(i.projectId) && i.issueDate && i.issueDate >= from && i.issueDate <= to,
    );
    const clients = await db.select({ id: s.clients.id, gstin: s.clients.gstin }).from(s.clients);
    rows = [["Invoice no", "Date", "Status", "Client", "Client GSTIN", "Project", "Place of supply", "Taxable value", "CGST", "SGST", "IGST", "Total", "Received", "TDS", "Outstanding"]];
    for (const i of invoices.sort((a, b) => (a.number ?? "").localeCompare(b.number ?? ""))) {
      const g = splitGst(i.totals.gst, studio.stateCode, i.placeOfSupply);
      const cancelled = i.status === "cancelled";
      rows.push([
        i.number, i.issueDate, cancelled ? "Cancelled" : "Issued", i.clientName, clients.find((c) => c.id === i.clientId)?.gstin, i.projectName,
        `${i.placeOfSupply} ${stateName(i.placeOfSupply)}`,
        rupees(cancelled ? 0 : i.totals.amount), rupees(cancelled ? 0 : g.cgst), rupees(cancelled ? 0 : g.sgst), rupees(cancelled ? 0 : g.igst),
        rupees(cancelled ? 0 : i.totals.total), rupees(i.received), rupees(i.tds), rupees(i.outstanding),
      ]);
    }
  } else if (type === "receipts") {
    const payments = await db
      .select({
        receivedOn: s.paymentsReceived.receivedOn, amount: s.paymentsReceived.amount, tds: s.paymentsReceived.tds,
        method: s.paymentsReceived.method, reference: s.paymentsReceived.reference,
        number: s.invoices.number, projectId: s.invoices.projectId, projectName: s.projects.name, clientName: s.clients.name,
      })
      .from(s.paymentsReceived)
      .innerJoin(s.invoices, eq(s.invoices.id, s.paymentsReceived.invoiceId))
      .innerJoin(s.projects, eq(s.projects.id, s.invoices.projectId))
      .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
      .where(and(gte(s.paymentsReceived.receivedOn, from), lte(s.paymentsReceived.receivedOn, to)))
      .orderBy(asc(s.paymentsReceived.receivedOn));
    rows = [["Date", "Client", "Project", "Invoice no", "Amount received", "TDS", "Method", "Reference"]];
    for (const p of payments.filter((x) => visible.has(x.projectId))) {
      rows.push([p.receivedOn, p.clientName, p.projectName, p.number, rupees(toPaise(p.amount)), rupees(toPaise(p.tds)), METHOD_LABEL[p.method], p.reference]);
    }
  } else if (type === "bills") {
    const bills = (await listBills()).filter((b) => (!b.projectId || visible.has(b.projectId)) && b.billDate >= from && b.billDate <= to);
    const suppliers = await db.select({ id: s.suppliers.id, gstin: s.suppliers.gstin }).from(s.suppliers);
    rows = [["Bill date", "Supplier", "Supplier GSTIN", "Bill no", "Project", "PO no", "Amount before GST", "GST", "Total", "Paid", "Balance", "Status"]];
    for (const b of bills.sort((a, c) => a.billDate.localeCompare(c.billDate))) {
      rows.push([
        b.billDate, b.supplierName, suppliers.find((x) => x.id === b.supplierId)?.gstin, b.billNumber, b.projectName ?? "Studio overhead", b.poNumber,
        rupees(toPaise(b.amount)), rupees(toPaise(b.gst)), rupees(b.total), rupees(b.paidPaise), rupees(b.balance), b.cancelled ? "Cancelled" : b.balance === 0 ? "Paid" : "Unpaid",
      ]);
    }
  } else if (type === "payments") {
    const payments = await db
      .select({
        paidOn: s.vendorPayments.paidOn, amount: s.vendorPayments.amount, method: s.vendorPayments.method, reference: s.vendorPayments.reference,
        billNumber: s.vendorBills.billNumber, projectId: s.vendorBills.projectId, supplierName: s.suppliers.name,
      })
      .from(s.vendorPayments)
      .innerJoin(s.vendorBills, eq(s.vendorBills.id, s.vendorPayments.billId))
      .innerJoin(s.suppliers, eq(s.suppliers.id, s.vendorBills.supplierId))
      .where(and(gte(s.vendorPayments.paidOn, from), lte(s.vendorPayments.paidOn, to)))
      .orderBy(asc(s.vendorPayments.paidOn));
    rows = [["Date", "Supplier", "Bill no", "Amount", "Method", "Reference"]];
    for (const p of payments.filter((x) => !x.projectId || visible.has(x.projectId))) {
      rows.push([p.paidOn, p.supplierName, p.billNumber, rupees(toPaise(p.amount)), METHOD_LABEL[p.method], p.reference]);
    }
  } else if (type === "expenses") {
    const expenses = (await listExpenses({ from, to })).filter((e) => !e.projectId || visible.has(e.projectId));
    rows = [["Date", "Category", "Description", "Project", "Amount", "Paid by", "Receipt", "Entered by"]];
    for (const e of [...expenses].reverse()) {
      rows.push([e.spentOn, CATEGORY_LABEL[e.category], e.description, e.projectName ?? "Studio overhead", rupees(toPaise(e.amount)), METHOD_LABEL[e.method], e.receiptFileId ? "Yes" : "No", e.recordedByName]);
    }
  } else {
    return new Response("Unknown export", { status: 400 });
  }

  // A byte-order mark so Excel opens ₹ and Malayalam names correctly.
  return new Response("﻿" + csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="skape360-${type}-${fy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
