import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/db";
import type { SessionUser } from "./auth";
import { can } from "./permissions";

export const requestCode = (n: number) => `MR-${String(n).padStart(3, "0")}`;

export const REQUEST_LABEL: Record<s.RequestStatus, string> = {
  requested: "Waiting for approval",
  approved: "Approved, not ordered",
  rejected: "Rejected",
  ordered: "Ordered",
  closed: "Delivered",
};
export const REQUEST_PILL: Record<s.RequestStatus, string> = {
  requested: "pill-warning",
  approved: "",
  rejected: "pill-negative",
  ordered: "",
  closed: "pill-positive",
};

export const PO_LABEL: Record<s.PoStatus, string> = {
  draft: "Draft",
  issued: "Issued, awaiting delivery",
  partly_received: "Part delivered",
  received: "Delivered",
  cancelled: "Cancelled",
};
export const PO_PILL: Record<s.PoStatus, string> = {
  draft: "",
  issued: "pill-warning",
  partly_received: "pill-warning",
  received: "pill-positive",
  cancelled: "",
};

const STUDIO = "studio";

export async function getBusinessSettings() {
  const db = await getDb();
  const [row] = await db.select().from(s.businessSettings).where(eq(s.businessSettings.id, STUDIO));
  return (
    row ?? { id: STUDIO, companyName: "Studio Skape", address: null, gstin: null, phone: null, email: null, poTerms: null, stateCode: "32", bankDetails: null, invoiceTerms: null, updatedAt: null, updatedBy: null }
  );
}

export async function listSuppliers(opts: { activeOnly?: boolean } = {}) {
  const db = await getDb();
  return db
    .select({
      id: s.suppliers.id,
      name: s.suppliers.name,
      contactName: s.suppliers.contactName,
      phone: s.suppliers.phone,
      email: s.suppliers.email,
      gstin: s.suppliers.gstin,
      address: s.suppliers.address,
      supplies: s.suppliers.supplies,
      active: s.suppliers.active,
      orders: sql<number>`(select count(*) from ${s.purchaseOrders} po where po.supplier_id = "suppliers"."id" and po.status <> 'cancelled')::int`,
    })
    .from(s.suppliers)
    .where(opts.activeOnly ? eq(s.suppliers.active, true) : undefined)
    .orderBy(sql`${s.suppliers.active} desc`, asc(s.suppliers.name));
}

// ── Material requests ───────────────────────────────────────────────────────

async function itemsFor(requestIds: string[]) {
  if (requestIds.length === 0) return [];
  const db = await getDb();
  return db
    .select()
    .from(s.materialRequestItems)
    .where(inArray(s.materialRequestItems.requestId, requestIds))
    .orderBy(asc(s.materialRequestItems.position));
}

const requestColumns = {
  id: s.materialRequests.id,
  projectId: s.materialRequests.projectId,
  projectName: s.projects.name,
  number: s.materialRequests.number,
  status: s.materialRequests.status,
  neededBy: s.materialRequests.neededBy,
  note: s.materialRequests.note,
  requestedByName: s.users.name,
  createdAt: s.materialRequests.createdAt,
  decisionNote: s.materialRequests.decisionNote,
  decidedAt: s.materialRequests.decidedAt,
};

export async function listRequests(where: { projectId?: string; status?: s.RequestStatus[] }) {
  const db = await getDb();
  const rows = await db
    .select(requestColumns)
    .from(s.materialRequests)
    .innerJoin(s.projects, eq(s.projects.id, s.materialRequests.projectId))
    .leftJoin(s.users, eq(s.users.id, s.materialRequests.requestedBy))
    .where(
      and(
        isNull(s.projects.deletedAt),
        where.projectId ? eq(s.materialRequests.projectId, where.projectId) : undefined,
        where.status ? inArray(s.materialRequests.status, where.status) : undefined,
      ),
    )
    .orderBy(sql`${s.materialRequests.neededBy} asc nulls last`, desc(s.materialRequests.createdAt));
  const items = await itemsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.requestId === r.id) }));
}

export type RequestRow = Awaited<ReturnType<typeof listRequests>>[number];

export async function getRequest(projectId: string, requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  const db = await getDb();
  const decider = alias(s.users, "decider");
  const [row] = await db
    .select({ ...requestColumns, decidedByName: decider.name })
    .from(s.materialRequests)
    .innerJoin(s.projects, eq(s.projects.id, s.materialRequests.projectId))
    .leftJoin(s.users, eq(s.users.id, s.materialRequests.requestedBy))
    .leftJoin(decider, eq(decider.id, s.materialRequests.decidedBy))
    .where(and(eq(s.materialRequests.projectId, projectId), eq(s.materialRequests.id, requestId)));
  if (!row) return null;
  return { ...row, items: await itemsFor([row.id]) };
}

// ── Purchase orders ─────────────────────────────────────────────────────────

const poColumns = {
  id: s.purchaseOrders.id,
  number: s.purchaseOrders.number,
  status: s.purchaseOrders.status,
  projectId: s.purchaseOrders.projectId,
  projectName: s.projects.name,
  projectCode: s.projects.code,
  projectLocation: s.projects.location,
  supplierId: s.purchaseOrders.supplierId,
  supplierName: s.suppliers.name,
  requestId: s.purchaseOrders.requestId,
  expectedDate: s.purchaseOrders.expectedDate,
  deliveryAddress: s.purchaseOrders.deliveryAddress,
  notes: s.purchaseOrders.notes,
  createdAt: s.purchaseOrders.createdAt,
  issuedAt: s.purchaseOrders.issuedAt,
};

async function poItemsFor(poIds: string[]) {
  if (poIds.length === 0) return [];
  const db = await getDb();
  const items = await db.select().from(s.poItems).where(inArray(s.poItems.poId, poIds)).orderBy(asc(s.poItems.position));
  const received = items.length
    ? await db
        .select({ poItemId: s.goodsReceiptItems.poItemId, qty: sql<string>`sum(${s.goodsReceiptItems.quantity})` })
        .from(s.goodsReceiptItems)
        .where(inArray(s.goodsReceiptItems.poItemId, items.map((i) => i.id)))
        .groupBy(s.goodsReceiptItems.poItemId)
    : [];
  return items.map((i) => ({ ...i, received: received.find((r) => r.poItemId === i.id)?.qty ?? "0" }));
}

export type PoItem = Awaited<ReturnType<typeof poItemsFor>>[number];

export async function listPurchaseOrders(where: { projectId?: string; status?: s.PoStatus[] }) {
  const db = await getDb();
  const rows = await db
    .select(poColumns)
    .from(s.purchaseOrders)
    .innerJoin(s.projects, eq(s.projects.id, s.purchaseOrders.projectId))
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseOrders.supplierId))
    .where(
      and(
        isNull(s.projects.deletedAt),
        where.projectId ? eq(s.purchaseOrders.projectId, where.projectId) : undefined,
        where.status ? inArray(s.purchaseOrders.status, where.status) : undefined,
      ),
    )
    .orderBy(desc(s.purchaseOrders.createdAt));
  const items = await poItemsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.poId === r.id) }));
}

export async function getPurchaseOrder(poId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(poId)) return null;
  const db = await getDb();
  const [po] = await db
    .select({
      ...poColumns,
      supplierPhone: s.suppliers.phone,
      supplierEmail: s.suppliers.email,
      supplierGstin: s.suppliers.gstin,
      supplierAddress: s.suppliers.address,
      supplierContact: s.suppliers.contactName,
      createdByName: s.users.name,
    })
    .from(s.purchaseOrders)
    .innerJoin(s.projects, eq(s.projects.id, s.purchaseOrders.projectId))
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseOrders.supplierId))
    .leftJoin(s.users, eq(s.users.id, s.purchaseOrders.createdBy))
    .where(eq(s.purchaseOrders.id, poId));
  if (!po) return null;
  const receiver = alias(s.users, "receiver");
  const [items, receipts] = await Promise.all([
    poItemsFor([po.id]),
    db
      .select({
        id: s.goodsReceipts.id,
        receivedOn: s.goodsReceipts.receivedOn,
        note: s.goodsReceipts.note,
        photoFileId: s.goodsReceipts.photoFileId,
        receivedByName: receiver.name,
      })
      .from(s.goodsReceipts)
      .leftJoin(receiver, eq(receiver.id, s.goodsReceipts.receivedBy))
      .where(eq(s.goodsReceipts.poId, po.id))
      .orderBy(desc(s.goodsReceipts.receivedOn), desc(s.goodsReceipts.createdAt)),
  ]);
  const receiptLines = receipts.length
    ? await db.select().from(s.goodsReceiptItems).where(inArray(s.goodsReceiptItems.receiptId, receipts.map((r) => r.id)))
    : [];
  return {
    po,
    items,
    receipts: receipts.map((r) => ({ ...r, lines: receiptLines.filter((l) => l.receiptId === r.id) })),
  };
}

/** Who may open a purchase order: purchasing staff, or the project's site team. */
export function canSeeOrders(user: SessionUser) {
  return can(user.role, "procurement.manage") || can(user.role, "procurement.prices") || can(user.role, "site.report");
}
