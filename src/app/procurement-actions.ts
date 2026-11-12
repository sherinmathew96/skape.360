"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, like, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { requireProjectMember } from "@/lib/access";
import { requirePermission, requireUser, type SessionUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getPurchaseOrder } from "@/lib/procurement";
import { claimUploadedFile } from "@/lib/uploads";
import type { FormState } from "./actions";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const optionalDate = z.union([isoDate, z.literal("")]);
const text = (maxLen: number) => z.string().trim().max(maxLen);

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

const refreshAll = () => revalidatePath("/", "layout");

/** Reads repeated line fields (name="description" …) into rows, dropping empty ones. */
function readLines(formData: FormData, fields: string[]) {
  const columns = fields.map((f) => formData.getAll(f).map((v) => String(v).trim()));
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < (columns[0]?.length ?? 0); i++) {
    const row = Object.fromEntries(fields.map((f, j) => [f, columns[j][i] ?? ""]));
    if (Object.values(row).some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

const quantity = z.coerce.number({ message: "Enter a quantity." }).positive("Quantities must be more than zero.").max(1e9);

// ── Business settings ───────────────────────────────────────────────────────

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("staff.manage");
  const parsed = z
    .object({
      companyName: z.string().trim().min(2, "Enter the business name.").max(120),
      address: text(400),
      gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "A GSTIN has 15 letters and digits.")]),
      phone: text(40),
      email: z.union([z.literal(""), z.string().trim().email("Enter a valid email.")]),
      poTerms: text(2000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const values = {
    companyName: v.companyName,
    address: v.address || null,
    gstin: v.gstin || null,
    phone: v.phone || null,
    email: v.email || null,
    poTerms: v.poTerms || null,
    updatedAt: new Date(),
    updatedBy: user.id,
  };
  const db = await getDb();
  await db.insert(s.businessSettings).values({ id: "studio", ...values }).onConflictDoUpdate({ target: s.businessSettings.id, set: values });
  await audit(user, "update", "business_settings");
  refreshAll();
  return { ok: "Saved." };
}

// ── Suppliers ───────────────────────────────────────────────────────────────

export async function saveSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("procurement.manage");
  const parsed = z
    .object({
      id: z.union([uuid, z.literal("")]),
      name: z.string().trim().min(2, "Enter the supplier's name.").max(120),
      contactName: text(80),
      phone: text(40),
      email: z.union([z.literal(""), z.string().trim().email("Enter a valid email.")]),
      gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "A GSTIN has 15 letters and digits.")]),
      address: text(400),
      supplies: text(200),
      active: z.enum(["1", "0"]),
    })
    .safeParse({ id: "", active: "1", ...Object.fromEntries(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, active, ...v } = parsed.data;
  const values = {
    name: v.name,
    contactName: v.contactName || null,
    phone: v.phone || null,
    email: v.email || null,
    gstin: v.gstin || null,
    address: v.address || null,
    supplies: v.supplies || null,
    active: active === "1",
  };
  const db = await getDb();
  if (id) {
    await db.update(s.suppliers).set(values).where(eq(s.suppliers.id, id));
    await audit(user, "update", "supplier", id);
  } else {
    const [row] = await db.insert(s.suppliers).values(values).returning({ id: s.suppliers.id });
    await audit(user, "create", "supplier", row.id);
  }
  refreshAll();
  if (id) redirect("/suppliers");
  return { ok: `${v.name} added.` };
}

// ── Material requests ───────────────────────────────────────────────────────

export async function createRequest(_: FormState, formData: FormData): Promise<FormState> {
  const { user, project } = await requireProjectMember(String(formData.get("projectId")));
  if (!can(user.role, "site.report") && !can(user.role, "procurement.manage")) {
    return { error: "Only site engineers and project managers raise material requests." };
  }
  const lines = readLines(formData, ["description", "quantity", "unit"]);
  if (lines.length === 0) return { error: "Add at least one item." };
  const items: { description: string; quantity: string; unit: string }[] = [];
  for (const [i, line] of lines.entries()) {
    if (!line.description) return { error: `Item ${i + 1}: say what is needed.` };
    const q = quantity.safeParse(line.quantity);
    if (!q.success) return { error: `${line.description}: ${q.error.issues[0]?.message}` };
    if (!line.unit) return { error: `${line.description}: give a unit, e.g. bags.` };
    items.push({ description: line.description.slice(0, 200), quantity: String(q.data), unit: line.unit.slice(0, 20) });
  }
  const meta = z.object({ neededBy: optionalDate, note: text(1000) }).safeParse({ neededBy: formData.get("neededBy") ?? "", note: formData.get("note") ?? "" });
  if (!meta.success) return { error: meta.error.issues[0]?.message };

  const db = await getDb();
  let created: { id: string; number: number } | null = null;
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    try {
      created = await db.transaction(async (tx) => {
        const [{ last }] = await tx.select({ last: max(s.materialRequests.number) }).from(s.materialRequests).where(eq(s.materialRequests.projectId, project.id));
        const [req] = await tx
          .insert(s.materialRequests)
          .values({ projectId: project.id, number: (last ?? 0) + 1, neededBy: meta.data.neededBy || null, note: meta.data.note || null, requestedBy: user.id })
          .returning({ id: s.materialRequests.id, number: s.materialRequests.number });
        await tx.insert(s.materialRequestItems).values(items.map((it, position) => ({ requestId: req.id, ...it, position })));
        return req;
      });
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  await audit(user, "create", "material_request", created!.id);
  refreshAll();
  redirect(`/projects/${project.id}/materials/${created!.id}`);
}

export async function decideRequest(formData: FormData) {
  const user = await requirePermission("procurement.manage");
  const id = uuid.parse(formData.get("requestId"));
  const decision = z.enum(["approved", "rejected"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const db = await getDb();
  const [req] = await db.select().from(s.materialRequests).where(eq(s.materialRequests.id, id));
  if (!req || !(await visibleProject(user, req.projectId))) throw new Error("That request was not found.");
  if (req.status !== "requested") return;
  await db
    .update(s.materialRequests)
    .set({ status: decision, decidedBy: user.id, decidedAt: new Date(), decisionNote: note || null })
    .where(eq(s.materialRequests.id, id));
  await audit(user, decision === "approved" ? "approve" : "reject", "material_request", id);
  refreshAll();
}

// ── Purchase orders ─────────────────────────────────────────────────────────

export async function savePurchaseOrder(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("procurement.manage");
  const head = z
    .object({
      poId: z.union([uuid, z.literal("")]),
      projectId: uuid,
      requestId: z.union([uuid, z.literal("")]),
      supplierId: z.string().uuid("Choose a supplier."),
      expectedDate: optionalDate,
      deliveryAddress: text(400),
      notes: text(2000),
    })
    .safeParse({
      poId: formData.get("poId") ?? "",
      projectId: formData.get("projectId"),
      requestId: formData.get("requestId") ?? "",
      supplierId: formData.get("supplierId"),
      expectedDate: formData.get("expectedDate") ?? "",
      deliveryAddress: formData.get("deliveryAddress") ?? "",
      notes: formData.get("notes") ?? "",
    });
  if (!head.success) return { error: head.error.issues[0]?.message };
  const h = head.data;
  const project = await visibleProject(user, h.projectId);
  if (!project) return { error: "That project was not found." };

  const lines = readLines(formData, ["description", "quantity", "unit", "rate", "gstRate"]);
  if (lines.length === 0) return { error: "Add at least one item." };
  const items: { description: string; quantity: string; unit: string; rate: string; gstRate: string }[] = [];
  for (const [i, line] of lines.entries()) {
    const name = line.description || `Item ${i + 1}`;
    if (!line.description) return { error: `Item ${i + 1}: describe it.` };
    const q = quantity.safeParse(line.quantity);
    if (!q.success) return { error: `${name}: ${q.error.issues[0]?.message}` };
    if (!line.unit) return { error: `${name}: give a unit.` };
    const rate = z.coerce.number().min(0, "Rates can't be negative.").max(1e10).safeParse(line.rate || "x");
    if (!rate.success) return { error: `${name}: enter a rate.` };
    const gst = z.coerce.number().min(0).max(28).safeParse(line.gstRate === "" ? "18" : line.gstRate);
    if (!gst.success) return { error: `${name}: GST must be between 0 and 28%.` };
    items.push({ description: line.description.slice(0, 200), quantity: String(q.data), unit: line.unit.slice(0, 20), rate: rate.data.toFixed(2), gstRate: String(gst.data) });
  }

  const db = await getDb();
  const [supplier] = await db.select({ id: s.suppliers.id }).from(s.suppliers).where(eq(s.suppliers.id, h.supplierId));
  if (!supplier) return { error: "Choose a supplier." };
  const values = {
    supplierId: h.supplierId,
    expectedDate: h.expectedDate || null,
    deliveryAddress: h.deliveryAddress || null,
    notes: h.notes || null,
  };

  let poId = h.poId;
  if (poId) {
    const [existing] = await db.select().from(s.purchaseOrders).where(and(eq(s.purchaseOrders.id, poId), eq(s.purchaseOrders.projectId, project.id)));
    if (!existing) return { error: "That order was not found." };
    if (existing.status !== "draft") return { error: "Issued orders can't be changed. Cancel it and make a new one." };
    await db.transaction(async (tx) => {
      await tx.update(s.purchaseOrders).set(values).where(eq(s.purchaseOrders.id, poId));
      await tx.delete(s.poItems).where(eq(s.poItems.poId, poId));
      await tx.insert(s.poItems).values(items.map((it, position) => ({ poId, ...it, position })));
    });
    await audit(user, "update", "purchase_order", poId);
  } else {
    let requestId: string | null = null;
    if (h.requestId) {
      const [req] = await db.select().from(s.materialRequests).where(and(eq(s.materialRequests.id, h.requestId), eq(s.materialRequests.projectId, project.id)));
      if (!req || req.status !== "approved") return { error: "That request is not approved, or already has an order." };
      requestId = req.id;
    }
    const prefix = `PO-${today().slice(0, 4)}-`;
    for (let attempt = 0; attempt < 2 && !poId; attempt++) {
      try {
        poId = await db.transaction(async (tx) => {
          const [{ last }] = await tx
            .select({ last: sql<string | null>`max(${s.purchaseOrders.number})` })
            .from(s.purchaseOrders)
            .where(like(s.purchaseOrders.number, `${prefix}%`));
          const next = (last ? Number(last.slice(prefix.length)) : 0) + 1;
          const [po] = await tx
            .insert(s.purchaseOrders)
            .values({ number: `${prefix}${String(next).padStart(3, "0")}`, projectId: project.id, requestId, ...values, createdBy: user.id })
            .returning({ id: s.purchaseOrders.id });
          await tx.insert(s.poItems).values(items.map((it, position) => ({ poId: po.id, ...it, position })));
          return po.id;
        });
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
    await audit(user, "create", "purchase_order", poId);
  }
  refreshAll();
  redirect(`/purchasing/po/${poId}`);
}

async function requireOrder(poId: string) {
  const user = await requirePermission("procurement.manage");
  const found = await getPurchaseOrder(uuid.parse(poId));
  if (!found || !(await visibleProject(user, found.po.projectId))) throw new Error("That order was not found.");
  return { user, ...found };
}

export async function issuePurchaseOrder(formData: FormData) {
  const { user, po } = await requireOrder(String(formData.get("poId")));
  if (po.status !== "draft") return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(s.purchaseOrders).set({ status: "issued", issuedAt: new Date() }).where(eq(s.purchaseOrders.id, po.id));
    if (po.requestId) await tx.update(s.materialRequests).set({ status: "ordered" }).where(eq(s.materialRequests.id, po.requestId));
  });
  await audit(user, "issue", "purchase_order", po.id);
  refreshAll();
}

export async function cancelPurchaseOrder(formData: FormData) {
  const { user, po, receipts } = await requireOrder(String(formData.get("poId")));
  if (receipts.length > 0 || po.status === "cancelled" || po.status === "received") return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(s.purchaseOrders).set({ status: "cancelled" }).where(eq(s.purchaseOrders.id, po.id));
    if (po.requestId) await tx.update(s.materialRequests).set({ status: "approved" }).where(eq(s.materialRequests.id, po.requestId));
  });
  await audit(user, "cancel", "purchase_order", po.id);
  refreshAll();
}

// ── Deliveries ──────────────────────────────────────────────────────────────

/** Site records what arrived. Part deliveries are fine; more than was ordered is refused. */
export async function recordDelivery(input: {
  poId: string;
  receivedOn: string;
  note: string;
  photoFileId: string | null;
  lines: { poItemId: string; quantity: string }[];
}): Promise<{ error?: string; ok?: string }> {
  const user = await requireUser();
  const found = await getPurchaseOrder(uuid.parse(input.poId));
  if (!found || !(await visibleProject(user, found.po.projectId))) return { error: "That order was not found." };
  const { po, items } = found;
  const allowed =
    can(user.role, "procurement.manage") || (can(user.role, "site.report") && (await isProjectMember(user.id, po.projectId)));
  if (!allowed) return { error: "Only the project's site team or purchasing can record deliveries." };
  if (po.status !== "issued" && po.status !== "partly_received") return { error: "Deliveries can only be recorded on issued orders." };

  const date = isoDate.safeParse(input.receivedOn);
  if (!date.success) return { error: "Pick the delivery date." };
  if (date.data > today()) return { error: "The delivery date can't be in the future." };

  const lines: { poItemId: string; quantity: string }[] = [];
  for (const line of input.lines) {
    const item = items.find((i) => i.id === line.poItemId);
    if (!item || line.quantity.trim() === "" || Number(line.quantity) === 0) continue;
    const q = quantity.safeParse(line.quantity);
    if (!q.success) return { error: `${item.description}: ${q.error.issues[0]?.message}` };
    const remaining = Number(item.quantity) - Number(item.received);
    if (q.data > remaining + 1e-9) return { error: `${item.description}: only ${remaining} ${item.unit} still due on this order.` };
    lines.push({ poItemId: item.id, quantity: String(q.data) });
  }
  if (lines.length === 0) return { error: "Enter what arrived for at least one item." };

  const photo = input.photoFileId ? await claimUploadedFile(user, po.projectId, input.photoFileId) : null;
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(s.goodsReceipts)
      .values({ poId: po.id, receivedOn: date.data, note: input.note.trim().slice(0, 1000) || null, photoFileId: photo?.id ?? null, receivedBy: user.id })
      .returning({ id: s.goodsReceipts.id });
    await tx.insert(s.goodsReceiptItems).values(lines.map((l) => ({ receiptId: receipt.id, ...l })));

    // Recount from the database so two deliveries recorded at once still add up.
    const totals = await tx
      .select({ poItemId: s.goodsReceiptItems.poItemId, qty: sql<string>`sum(${s.goodsReceiptItems.quantity})` })
      .from(s.goodsReceiptItems)
      .where(inArray(s.goodsReceiptItems.poItemId, items.map((i) => i.id)))
      .groupBy(s.goodsReceiptItems.poItemId);
    const complete = items.every((i) => Number(totals.find((t) => t.poItemId === i.id)?.qty ?? 0) >= Number(i.quantity) - 1e-9);
    await tx.update(s.purchaseOrders).set({ status: complete ? "received" : "partly_received" }).where(eq(s.purchaseOrders.id, po.id));
    if (complete && po.requestId) await tx.update(s.materialRequests).set({ status: "closed" }).where(eq(s.materialRequests.id, po.requestId));
  });
  await audit(user, "record_delivery", "purchase_order", po.id);
  refreshAll();
  return { ok: "Delivery recorded." };
}

