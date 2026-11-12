"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/db/schema";
import { requireProjectMember } from "@/lib/access";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { getBill, getInvoice, orderValue } from "@/lib/finance";
import { financialYear, GST_STATES } from "@/lib/gst";
import { toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { claimUploadedFile } from "@/lib/uploads";
import type { FormState } from "./actions";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const optionalDate = z.union([isoDate, z.literal("")]);
const text = (n: number) => z.string().trim().max(n);
const rupees = (label: string) =>
  z.coerce.number({ message: `Enter ${label}.` }).min(0, `${label[0].toUpperCase()}${label.slice(1)} can't be negative.`).max(1e11);
const stateCode = z.string().refine((c) => GST_STATES.some(([code]) => code === c), "Choose the state.");
const gstin = z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^\d{2}[0-9A-Z]{13}$/, "A GSTIN has 15 letters and digits, starting with the state code.")]);

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

const refreshAll = () => revalidatePath("/", "layout");

function readLines(formData: FormData, fields: string[]) {
  const columns = fields.map((f) => formData.getAll(f).map((v) => String(v).trim()));
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < (columns[0]?.length ?? 0); i++) {
    const row = Object.fromEntries(fields.map((f, j) => [f, columns[j][i] ?? ""]));
    // A line left at its defaults (GST 18, quantity 1, unit nos, the usual SAC) counts as empty.
    if (Object.values(row).some((v) => !["", "18", "1", "nos", "998322"].includes(v))) rows.push(row);
  }
  return rows;
}

// ── Client GST details and the project fee ──────────────────────────────────

export async function saveBillingDetails(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("finance.manage");
  const parsed = z
    .object({
      projectId: uuid,
      fee: z.union([z.literal(""), rupees("the fee")]),
      address: text(400),
      email: z.union([z.literal(""), z.string().trim().email("Enter a valid email.")]),
      stateCode,
      gstin,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.gstin && v.gstin.slice(0, 2) !== v.stateCode) return { error: "The GSTIN's first two digits don't match the state." };
  const project = await visibleProject(user, v.projectId);
  if (!project) return { error: "That project was not found." };
  const db = await getDb();
  const [row] = await db.select({ clientId: s.projects.clientId }).from(s.projects).where(eq(s.projects.id, project.id));
  await db.transaction(async (tx) => {
    await tx.update(s.projects).set({ fee: v.fee === "" ? null : Number(v.fee).toFixed(2) }).where(eq(s.projects.id, project.id));
    await tx
      .update(s.clients)
      .set({ address: v.address || null, email: v.email || null, stateCode: v.stateCode, gstin: v.gstin || null })
      .where(eq(s.clients.id, row.clientId));
  });
  await audit(user, "update_billing", "project", project.id);
  refreshAll();
  return { ok: "Saved." };
}

// ── Invoices ────────────────────────────────────────────────────────────────

export async function saveInvoice(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("finance.manage");
  const head = z
    .object({
      invoiceId: z.union([uuid, z.literal("")]),
      projectId: uuid,
      milestoneId: z.union([uuid, z.literal("")]),
      placeOfSupply: stateCode,
      dueDate: optionalDate,
      notes: text(2000),
    })
    .safeParse({
      invoiceId: formData.get("invoiceId") ?? "",
      projectId: formData.get("projectId"),
      milestoneId: formData.get("milestoneId") ?? "",
      placeOfSupply: formData.get("placeOfSupply"),
      dueDate: formData.get("dueDate") ?? "",
      notes: formData.get("notes") ?? "",
    });
  if (!head.success) return { error: head.error.issues[0]?.message };
  const h = head.data;
  const project = await visibleProject(user, h.projectId);
  if (!project) return { error: "That project was not found." };

  const lines = readLines(formData, ["description", "sac", "quantity", "unit", "rate", "gstRate"]);
  if (lines.length === 0) return { error: "Add at least one line." };
  const items: { description: string; sac: string | null; quantity: string; unit: string; rate: string; gstRate: string }[] = [];
  for (const [i, line] of lines.entries()) {
    if (!line.description) return { error: `Line ${i + 1}: describe what you're billing for.` };
    const q = z.coerce.number().positive().max(1e9).safeParse(line.quantity || "1");
    if (!q.success) return { error: `${line.description}: quantity must be more than zero.` };
    const rate = rupees("an amount").safeParse(line.rate === "" ? "x" : line.rate);
    if (!rate.success) return { error: `${line.description}: enter the amount.` };
    const gst = z.coerce.number().min(0).max(28).safeParse(line.gstRate === "" ? "18" : line.gstRate);
    if (!gst.success) return { error: `${line.description}: GST must be between 0 and 28%.` };
    items.push({
      description: line.description.slice(0, 300),
      sac: line.sac.replace(/\D/g, "").slice(0, 8) || null,
      quantity: String(q.data),
      unit: (line.unit || "nos").slice(0, 20),
      rate: rate.data.toFixed(2),
      gstRate: String(gst.data),
    });
  }

  const db = await getDb();
  if (h.milestoneId) {
    const [m] = await db.select({ id: s.milestones.id }).from(s.milestones).where(and(eq(s.milestones.id, h.milestoneId), eq(s.milestones.projectId, project.id)));
    if (!m) return { error: "That milestone isn't on this project." };
  }
  const values = { milestoneId: h.milestoneId || null, placeOfSupply: h.placeOfSupply, dueDate: h.dueDate || null, notes: h.notes || null };

  let id = h.invoiceId;
  if (id) {
    const [existing] = await db.select().from(s.invoices).where(and(eq(s.invoices.id, id), eq(s.invoices.projectId, project.id)));
    if (!existing) return { error: "That invoice was not found." };
    if (existing.status !== "draft") return { error: "Issued invoices can't be changed." };
    await db.transaction(async (tx) => {
      await tx.update(s.invoices).set(values).where(eq(s.invoices.id, id));
      await tx.delete(s.invoiceItems).where(eq(s.invoiceItems.invoiceId, id));
      await tx.insert(s.invoiceItems).values(items.map((it, position) => ({ invoiceId: id, ...it, position })));
    });
  } else {
    id = await db.transaction(async (tx) => {
      const [inv] = await tx.insert(s.invoices).values({ projectId: project.id, ...values, createdBy: user.id }).returning({ id: s.invoices.id });
      await tx.insert(s.invoiceItems).values(items.map((it, position) => ({ invoiceId: inv.id, ...it, position })));
      return inv.id;
    });
  }
  await audit(user, h.invoiceId ? "update" : "create", "invoice", id);
  refreshAll();
  redirect(`/finance/invoices/${id}`);
}

/** Gives the invoice the next number in this financial year and marks it issued. */
export async function issueInvoice(formData: FormData) {
  const user = await requirePermission("finance.manage");
  const inv = await getInvoice(uuid.parse(formData.get("invoiceId")));
  if (!inv || !(await visibleProject(user, inv.projectId)) || inv.status !== "draft") return;
  const issueDate = today();
  const prefix = `INV/${financialYear(issueDate)}/`;
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.transaction(async (tx) => {
        const [{ last }] = await tx
          .select({ last: sql<string | null>`max(${s.invoices.number})` })
          .from(s.invoices)
          .where(like(s.invoices.number, `${prefix}%`));
        const next = (last ? Number(last.slice(prefix.length)) : 0) + 1;
        await tx
          .update(s.invoices)
          .set({ status: "issued", number: `${prefix}${String(next).padStart(3, "0")}`, issueDate, dueDate: inv.dueDate ?? addDays(issueDate, 15) })
          .where(and(eq(s.invoices.id, inv.id), eq(s.invoices.status, "draft")));
      });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  await audit(user, "issue", "invoice", inv.id);
  refreshAll();
}

/** Drafts are deleted. An issued invoice with no payments keeps its number, marked cancelled. */
export async function cancelInvoice(formData: FormData) {
  const user = await requirePermission("finance.manage");
  const inv = await getInvoice(uuid.parse(formData.get("invoiceId")));
  if (!inv || !(await visibleProject(user, inv.projectId))) return;
  const db = await getDb();
  if (inv.status === "draft") {
    await db.delete(s.invoices).where(eq(s.invoices.id, inv.id));
    await audit(user, "delete", "invoice", inv.id);
    refreshAll();
    redirect(`/projects/${inv.projectId}/finance`);
  }
  if (inv.status !== "issued" || inv.payments.length > 0) return;
  await db.update(s.invoices).set({ status: "cancelled" }).where(eq(s.invoices.id, inv.id));
  await audit(user, "cancel", "invoice", inv.id);
  refreshAll();
}

export async function recordPayment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("finance.manage");
  const parsed = z
    .object({
      invoiceId: uuid,
      receivedOn: isoDate,
      amount: rupees("the amount received"),
      tds: z.union([z.literal(""), rupees("the TDS")]),
      method: z.enum(PAYMENT_METHODS, { message: "Choose how it was paid." }),
      reference: text(80),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.receivedOn > today()) return { error: "The date can't be in the future." };
  const inv = await getInvoice(v.invoiceId);
  if (!inv || !(await visibleProject(user, inv.projectId))) return { error: "That invoice was not found." };
  if (inv.status !== "issued") return { error: "Payments can only be recorded on issued invoices." };
  const amount = toPaise(v.amount);
  const tds = v.tds === "" ? 0 : toPaise(v.tds);
  if (amount + tds <= 0) return { error: "Enter the amount received." };
  if (amount + tds > inv.outstanding) return { error: `Only ${(inv.outstanding / 100).toFixed(2)} is still due on this invoice.` };
  const db = await getDb();
  await db.insert(s.paymentsReceived).values({
    invoiceId: inv.id,
    receivedOn: v.receivedOn,
    amount: (amount / 100).toFixed(2),
    tds: (tds / 100).toFixed(2),
    method: v.method,
    reference: v.reference || null,
    recordedBy: user.id,
  });
  await audit(user, "record_payment", "invoice", inv.id, { amount: amount / 100 });
  refreshAll();
  return { ok: "Payment recorded." };
}

// ── Supplier bills ──────────────────────────────────────────────────────────

export async function saveBill(input: {
  supplierId: string;
  projectId: string;
  poId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  amount: string;
  gst: string;
  note: string;
  fileId: string | null;
}): Promise<{ error?: string; warning?: string }> {
  const user = await requirePermission("finance.manage");
  const parsed = z
    .object({
      supplierId: z.string().uuid("Choose the supplier."),
      projectId: z.union([uuid, z.literal("")]),
      poId: z.union([uuid, z.literal("")]),
      billNumber: z.string().trim().min(1, "Enter the supplier's bill number.").max(60),
      billDate: isoDate,
      dueDate: optionalDate,
      amount: rupees("the amount before GST"),
      gst: z.union([z.literal(""), rupees("the GST")]),
      note: text(1000),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const db = await getDb();

  let projectId = v.projectId || null;
  if (v.poId) {
    const [po] = await db.select().from(s.purchaseOrders).where(eq(s.purchaseOrders.id, v.poId));
    if (!po || po.supplierId !== v.supplierId) return { error: "That order is from a different supplier." };
    if (po.status === "draft" || po.status === "cancelled") return { error: "That order was never issued." };
    projectId = po.projectId;
  }
  if (projectId && !(await visibleProject(user, projectId))) return { error: "That project was not found." };

  const [dupe] = await db
    .select({ id: s.vendorBills.id })
    .from(s.vendorBills)
    .where(and(eq(s.vendorBills.supplierId, v.supplierId), eq(s.vendorBills.billNumber, v.billNumber), eq(s.vendorBills.cancelled, false)));
  if (dupe) return { error: `Bill ${v.billNumber} from this supplier is already entered.` };

  const file = input.fileId ? await claimUploadedFile(user, projectId, input.fileId) : null;
  const [bill] = await db
    .insert(s.vendorBills)
    .values({
      supplierId: v.supplierId,
      projectId,
      poId: v.poId || null,
      billNumber: v.billNumber,
      billDate: v.billDate,
      dueDate: v.dueDate || null,
      amount: Number(v.amount).toFixed(2),
      gst: v.gst === "" ? "0" : Number(v.gst).toFixed(2),
      note: v.note || null,
      fileId: file?.id ?? null,
      createdBy: user.id,
    })
    .returning({ id: s.vendorBills.id });
  await audit(user, "create", "vendor_bill", bill.id);
  refreshAll();
  redirect(`/finance/bills/${bill.id}`);
}

/** For the bill form: what the order is worth and what's been delivered, to check the bill against. */
export async function checkOrderForBill(poId: string) {
  await requirePermission("finance.manage");
  return orderValue(uuid.parse(poId));
}

export async function recordVendorPayment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("finance.manage");
  const parsed = z
    .object({
      billId: uuid,
      paidOn: isoDate,
      amount: rupees("the amount paid"),
      method: z.enum(PAYMENT_METHODS, { message: "Choose how it was paid." }),
      reference: text(80),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.paidOn > today()) return { error: "The date can't be in the future." };
  const bill = await getBill(v.billId);
  if (!bill || bill.cancelled) return { error: "That bill was not found." };
  const amount = toPaise(v.amount);
  if (amount <= 0) return { error: "Enter the amount paid." };
  if (amount > bill.balance) return { error: `Only ${(bill.balance / 100).toFixed(2)} is still due on this bill.` };
  const db = await getDb();
  await db.insert(s.vendorPayments).values({
    billId: bill.id,
    paidOn: v.paidOn,
    amount: (amount / 100).toFixed(2),
    method: v.method,
    reference: v.reference || null,
    recordedBy: user.id,
  });
  await audit(user, "record_payment", "vendor_bill", bill.id, { amount: amount / 100 });
  refreshAll();
  return { ok: "Payment recorded." };
}

export async function cancelBill(formData: FormData) {
  const user = await requirePermission("finance.manage");
  const bill = await getBill(uuid.parse(formData.get("billId")));
  if (!bill || bill.cancelled || bill.payments.length > 0) return;
  const db = await getDb();
  await db.update(s.vendorBills).set({ cancelled: true }).where(eq(s.vendorBills.id, bill.id));
  await audit(user, "cancel", "vendor_bill", bill.id);
  refreshAll();
}

// ── Expenses ────────────────────────────────────────────────────────────────

export async function addExpense(input: {
  projectId: string;
  category: string;
  spentOn: string;
  amount: string;
  description: string;
  method: string;
  receiptFileId: string | null;
}): Promise<{ error?: string; ok?: string }> {
  const user = await requirePermission("expense.add");
  const parsed = z
    .object({
      projectId: z.union([uuid, z.literal("")]),
      category: z.enum(EXPENSE_CATEGORIES, { message: "Choose a category." }),
      spentOn: isoDate,
      amount: z.coerce.number({ message: "Enter the amount." }).positive("Enter the amount.").max(1e10),
      description: z.string().trim().min(3, "Say what it was for.").max(300),
      method: z.enum(PAYMENT_METHODS),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.spentOn > today()) return { error: "The date can't be in the future." };

  // Studio overheads are for finance staff; project expenses for the project's team or finance.
  let projectId: string | null = null;
  if (v.projectId) {
    if (can(user.role, "finance.manage")) {
      if (!(await visibleProject(user, v.projectId))) return { error: "That project was not found." };
    } else {
      await requireProjectMember(v.projectId);
    }
    projectId = v.projectId;
  } else if (!can(user.role, "finance.manage")) {
    return { error: "Choose the project this was spent on." };
  }

  const receipt = input.receiptFileId ? await claimUploadedFile(user, projectId, input.receiptFileId) : null;
  const db = await getDb();
  const [row] = await db
    .insert(s.expenses)
    .values({
      projectId,
      category: v.category,
      spentOn: v.spentOn,
      amount: v.amount.toFixed(2),
      description: v.description,
      method: v.method,
      receiptFileId: receipt?.id ?? null,
      recordedBy: user.id,
    })
    .returning({ id: s.expenses.id });
  await audit(user, "create", "expense", row.id, { amount: v.amount });
  refreshAll();
  return { ok: "Expense saved." };
}

/** Finance can remove any expense; others only their own, on the day they entered it. */
export async function deleteExpense(formData: FormData) {
  const user = await requirePermission("expense.add");
  const id = uuid.parse(formData.get("expenseId"));
  const db = await getDb();
  const [row] = await db.select().from(s.expenses).where(eq(s.expenses.id, id));
  if (!row) return;
  const own = row.recordedBy === user.id && row.createdAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  if (!can(user.role, "finance.manage") && !own) throw new Error("Ask the accounts team to remove this expense.");
  await db.delete(s.expenses).where(eq(s.expenses.id, id));
  await audit(user, "delete", "expense", id, { amount: row.amount });
  refreshAll();
}

export async function saveInvoiceSettings(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("staff.manage");
  const parsed = z
    .object({ stateCode, bankDetails: text(600), invoiceTerms: text(2000) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const db = await getDb();
  const values = { stateCode: v.stateCode, bankDetails: v.bankDetails || null, invoiceTerms: v.invoiceTerms || null, updatedAt: new Date(), updatedBy: user.id };
  await db.insert(s.businessSettings).values({ id: "studio", ...values }).onConflictDoUpdate({ target: s.businessSettings.id, set: values });
  await audit(user, "update", "invoice_settings");
  refreshAll();
  return { ok: "Saved." };
}
