import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── Core ────────────────────────────────────────────────────────────────────

/** The roles every studio starts with. More can be added on Team → Roles. */
export const BUILT_IN_ROLES = [
  "admin",
  "project_manager",
  "architect",
  "site_engineer",
  "accountant",
] as const;
/** A role's key, e.g. "architect" or one the studio made, e.g. "interior-designer". */
export type Role = string;

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Key of a row in roles */
  role: text("role").$type<Role>().notNull(),
  title: text("title"),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);

// ── CRM ─────────────────────────────────────────────────────────────────────

export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  /** GST state code, e.g. "32" for Kerala; decides CGST+SGST or IGST */
  stateCode: text("state_code"),
  gstin: text("gstin"),
  createdAt: createdAt(),
});

// ── Projects ────────────────────────────────────────────────────────────────

export const PROJECT_TYPES = ["design", "construction", "design_build"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = [
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable(
  "projects",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    type: text("type").$type<ProjectType>().notNull(),
    status: text("status").$type<ProjectStatus>().notNull().default("active"),
    location: text("location"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    leadId: uuid("lead_id").references(() => users.id, { onDelete: "set null" }),
    /** The contractor or PMC the studio did this project for, if any */
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "set null" }),
    notes: text("notes"),
    /** The agreed professional fee, before GST */
    fee: numeric("fee", { precision: 14, scale: 2 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("projects_status_idx").on(t.status), index("projects_firm_idx").on(t.firmId)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const STAGE_STATUSES = ["pending", "in_progress", "approved"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const projectStages = pgTable(
  "project_stages",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: text("status").$type<StageStatus>().notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("stages_project_idx").on(t.projectId, t.position)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueDate: date("due_date").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId, t.dueDate)],
);

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    dueDate: date("due_date"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_assignee_idx").on(t.assigneeId, t.status),
  ],
);

// ── Files ───────────────────────────────────────────────────────────────────

/** Every uploaded file: drawings, panoramas, models, photos. Bytes live in storage. */
export const files = pgTable(
  "files",
  {
    id: id(),
    /** Null for studio-wide files, e.g. a receipt for office rent */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    /** pending until the upload finishes */
    ready: boolean("ready").notNull().default(false),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("files_project_idx").on(t.projectId)],
);

// ── Studio: 3D models and 360° tours ────────────────────────────────────────

export const LIGHTING = ["studio", "daylight", "overcast", "evening"] as const;
export type Lighting = (typeof LIGHTING)[number];

export type ModelView = {
  /** Degrees to turn so the model's front faces the "Front" view */
  frontYaw?: number;
  lighting?: Lighting;
  exposure?: number;
  /** The camera clients first see: orbit ("30deg 70deg 40m") and target ("1m 2m 3m") */
  opening?: { orbit: string; target: string };
};

export const models3d = pgTable(
  "models_3d",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    /** True once compressed for fast loading (on upload, or later) */
    optimized: boolean("optimized").notNull().default(false),
    /** A still of the model, shown while it loads and in lists */
    coverFileId: uuid("cover_file_id").references(() => files.id, { onDelete: "set null" }),
    /** How it opens: which side is the front, lighting and exposure */
    view: jsonb("view").$type<ModelView>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** In the recycle bin since; null when not deleted */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("models_project_idx").on(t.projectId)],
);

export const tours = pgTable(
  "tours",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** In the recycle bin since; null when not deleted */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("tours_project_idx").on(t.projectId)],
);

/** One 360° photo in a tour. Position 0 is where the tour opens. */
export const tourScenes = pgTable(
  "tour_scenes",
  {
    id: id(),
    tourId: uuid("tour_id")
      .notNull()
      .references(() => tours.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scenes_tour_idx").on(t.tourId, t.position)],
);

/** A door in one scene that leads to another. Angles in radians. */
export const tourHotspots = pgTable(
  "tour_hotspots",
  {
    id: id(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => tourScenes.id, { onDelete: "cascade" }),
    targetSceneId: uuid("target_scene_id")
      .notNull()
      .references(() => tourScenes.id, { onDelete: "cascade" }),
    yaw: doublePrecision("yaw").notNull(),
    pitch: doublePrecision("pitch").notNull(),
  },
  (t) => [index("hotspots_scene_idx").on(t.sceneId)],
);

// ── Client sharing ──────────────────────────────────────────────────────────

// ── Studio: drawings, revisions and approvals ───────────────────────────────

export const DISCIPLINES = ["architectural", "structural", "mep", "interior", "landscape"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** Where a drawing stands in the studio's workflow: the status column clients follow. */
export const DRAWING_STATUSES = ["design_discussion", "pending", "revision", "production", "on_hold", "completed"] as const;
export type DrawingStatus = (typeof DRAWING_STATUSES)[number];

/** A heading in a project's drawing register: "General drawings", "Room 01", "Master bedroom" … */
export const drawingGroups = pgTable(
  "drawing_groups",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("drawing_groups_project_idx").on(t.projectId, t.position)],
);

export const drawings = pgTable(
  "drawings",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Null means the register's ungrouped "General" list */
    groupId: uuid("group_id").references(() => drawingGroups.id, { onDelete: "set null" }),
    /** The studio's sheet number, e.g. A-101; optional */
    number: text("number"),
    title: text("title").notNull(),
    discipline: text("discipline").$type<Discipline>().notNull(),
    status: text("status").$type<DrawingStatus>().notNull().default("pending"),
    /** Order within its group */
    position: integer("position").notNull().default(0),
    /** Who is drawing it; they can update it even without studio rights */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Shown on client links that include the drawing register */
    clientVisible: boolean("client_visible").notNull().default(true),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** In the recycle bin since; null when not deleted */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("drawings_project_idx").on(t.projectId, t.number), index("drawings_group_idx").on(t.groupId, t.position)],
);

/**
 * draft → issued (the client can see it) → approved | changes_requested.
 * A newer revision supersedes every earlier one.
 */
export const REVISION_STATUSES = ["draft", "issued", "approved", "changes_requested"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const drawingRevisions = pgTable(
  "drawing_revisions",
  {
    id: id(),
    drawingId: uuid("drawing_id")
      .notNull()
      .references(() => drawings.id, { onDelete: "cascade" }),
    /** 0 for R0, 1 for R1 … */
    rev: integer("rev").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    note: text("note"),
    status: text("status").$type<RevisionStatus>().notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("revisions_drawing_idx").on(t.drawingId, t.rev)],
);

export const DECISIONS = ["approved", "changes_requested"] as const;
export type Decision = (typeof DECISIONS)[number];

/** A client's decision on one drawing revision, from a share link or recorded by staff. */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => drawingRevisions.id, { onDelete: "cascade" }),
    decision: text("decision").$type<Decision>().notNull(),
    /** The client's name as they typed it, or who staff spoke to */
    name: text("name").notNull(),
    comment: text("comment"),
    /** Set when it came through a client link */
    shareLinkId: uuid("share_link_id").references(() => shareLinks.id, { onDelete: "set null" }),
    /** Set when staff recorded it on the client's behalf */
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    /** Set when it came through the project's client portal */
    portalId: uuid("portal_id").references(() => clientPortals.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_revision_idx").on(t.revisionId)],
);

// ── Construction: daily site reports and snags ──────────────────────────────

export const WEATHER = ["sunny", "cloudy", "rain", "heavy_rain"] as const;
export type Weather = (typeof WEATHER)[number];

export type LabourLine = { trade: string; count: number };

/** One report per project per day, written on site. */
export const siteReports = pgTable(
  "site_reports",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weather: text("weather").$type<Weather>().notNull(),
    labour: jsonb("labour").$type<LabourLine[]>().notNull().default([]),
    workDone: text("work_done").notNull(),
    /** Internal only: never shown on client links */
    issues: text("issues"),
    /** Shown on client links that include site progress */
    clientVisible: boolean("client_visible").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** In the recycle bin since; null when not deleted */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One live report per day; deleted ones in the recycle bin do not count.
  (t) => [uniqueIndex("site_reports_project_date_idx").on(t.projectId, t.date).where(sql`deleted_at is null`)],
);

export const siteReportPhotos = pgTable(
  "site_report_photos",
  {
    id: id(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => siteReports.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    caption: text("caption"),
    createdAt: createdAt(),
  },
  (t) => [index("report_photos_report_idx").on(t.reportId)],
);

/** open → fixed (by whoever fixes it) → closed (checked), or back to open. */
export const SNAG_STATUSES = ["open", "fixed", "closed"] as const;
export type SnagStatus = (typeof SNAG_STATUSES)[number];

export const snags = pgTable(
  "snags",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 1, 2, 3… within the project, shown as S-001 */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    status: text("status").$type<SnagStatus>().notNull().default("open"),
    photoFileId: uuid("photo_file_id").references(() => files.id, { onDelete: "set null" }),
    fixPhotoFileId: uuid("fix_photo_file_id").references(() => files.id, { onDelete: "set null" }),
    fixNote: text("fix_note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    fixedAt: timestamp("fixed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("snags_project_number_idx").on(t.projectId, t.number),
    index("snags_status_idx").on(t.projectId, t.status),
  ],
);

// ── Admin: business settings ────────────────────────────────────────────────

/** One row (id "studio"): what prints on purchase orders and, later, invoices. */
export const businessSettings = pgTable("business_settings", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull().default("Studio Skape"),
  address: text("address"),
  gstin: text("gstin"),
  phone: text("phone"),
  email: text("email"),
  poTerms: text("po_terms"),
  /** The studio's own GST state code, "32" for Kerala */
  stateCode: text("state_code").notNull().default("32"),
  bankDetails: text("bank_details"),
  invoiceTerms: text("invoice_terms"),
  /** Days a deleted item stays in the recycle bin before it is removed for good */
  trashDays: integer("trash_days").notNull().default(90),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// ── Procurement: suppliers, material requests, purchase orders ──────────────

/** Money and quantities are exact decimals; Drizzle returns them as strings. */
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    gstin: text("gstin"),
    address: text("address"),
    /** What they supply, e.g. "Cement, steel" */
    supplies: text("supplies"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

/** requested → approved | rejected; approved → ordered (a PO exists) → closed (all delivered). */
export const REQUEST_STATUSES = ["requested", "approved", "rejected", "ordered", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const materialRequests = pgTable(
  "material_requests",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 1, 2, 3… within the project, shown as MR-001 */
    number: integer("number").notNull(),
    status: text("status").$type<RequestStatus>().notNull().default("requested"),
    neededBy: date("needed_by"),
    note: text("note"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
  },
  (t) => [uniqueIndex("requests_project_number_idx").on(t.projectId, t.number), index("requests_status_idx").on(t.status)],
);

export const materialRequestItems = pgTable(
  "material_request_items",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => materialRequests.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unit: text("unit").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("request_items_request_idx").on(t.requestId, t.position)],
);

/** draft → issued → partly_received → received; or cancelled. */
export const PO_STATUSES = ["draft", "issued", "partly_received", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    /** PO-2026-001, numbered across the studio per year */
    number: text("number").notNull().unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    requestId: uuid("request_id").references(() => materialRequests.id, { onDelete: "set null" }),
    status: text("status").$type<PoStatus>().notNull().default("draft"),
    expectedDate: date("expected_date"),
    deliveryAddress: text("delivery_address"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
  },
  (t) => [index("pos_project_idx").on(t.projectId), index("pos_status_idx").on(t.status)],
);

export const poItems = pgTable(
  "po_items",
  {
    id: id(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unit: text("unit").notNull(),
    rate: money("rate").notNull(),
    /** Percent, e.g. 18 */
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
    position: integer("position").notNull(),
  },
  (t) => [index("po_items_po_idx").on(t.poId, t.position)],
);

/** One delivery against a PO, recorded on site. */
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: id(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    receivedOn: date("received_on").notNull(),
    note: text("note"),
    photoFileId: uuid("photo_file_id").references(() => files.id, { onDelete: "set null" }),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("receipts_po_idx").on(t.poId)],
);

export const goodsReceiptItems = pgTable(
  "goods_receipt_items",
  {
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    poItemId: uuid("po_item_id")
      .notNull()
      .references(() => poItems.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.receiptId, t.poItemId] })],
);

// ── Finance ─────────────────────────────────────────────────────────────────

/** draft (no number yet) → issued (numbered, sent) → cancelled. Paid is worked out from payments. */
export const INVOICE_STATUSES = ["draft", "issued", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    /** INV/2026-27/001, given when issued so issued numbers have no gaps */
    number: text("number").unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    /** GST state code of the place of supply */
    placeOfSupply: text("place_of_supply").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_project_idx").on(t.projectId), index("invoices_status_idx").on(t.status)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    /** Service code, e.g. 998322 for architectural services */
    sac: text("sac"),
    quantity: qty("quantity").notNull().default("1"),
    unit: text("unit").notNull().default("nos"),
    rate: money("rate").notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
    position: integer("position").notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId, t.position)],
);

export const PAYMENT_METHODS = ["bank", "upi", "cheque", "cash", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentsReceived = pgTable(
  "payments_received",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    receivedOn: date("received_on").notNull(),
    amount: money("amount").notNull(),
    /** Tax deducted at source by the client, counted towards the invoice */
    tds: money("tds").notNull().default("0"),
    method: text("method").$type<PaymentMethod>().notNull(),
    reference: text("reference"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("payments_received_invoice_idx").on(t.invoiceId)],
);

/** A supplier's bill, ideally against a purchase order. Paid is worked out from payments. */
export const vendorBills = pgTable(
  "vendor_bills",
  {
    id: id(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    /** The supplier's own bill number */
    billNumber: text("bill_number").notNull(),
    billDate: date("bill_date").notNull(),
    dueDate: date("due_date"),
    amount: money("amount").notNull(),
    gst: money("gst").notNull().default("0"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    note: text("note"),
    cancelled: boolean("cancelled").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("bills_supplier_idx").on(t.supplierId), index("bills_project_idx").on(t.projectId), index("bills_po_idx").on(t.poId)],
);

export const vendorPayments = pgTable(
  "vendor_payments",
  {
    id: id(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => vendorBills.id, { onDelete: "cascade" }),
    paidOn: date("paid_on").notNull(),
    amount: money("amount").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    reference: text("reference"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("vendor_payments_bill_idx").on(t.billId)],
);

export const EXPENSE_CATEGORIES = [
  "site_petty_cash",
  "labour_wages",
  "transport",
  "travel",
  "printing",
  "consultants",
  "rent",
  "utilities",
  "software",
  "office",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Kinds of money coming in, for the day books. */
export const INCOME_CATEGORIES = ["client_payment", "advance", "refund", "scrap_sale", "fees", "interest", "other"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/** Money spent outside purchase orders. No project means a studio overhead. */
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    category: text("category").$type<ExpenseCategory>().notNull(),
    spentOn: date("spent_on").notNull(),
    /** Total paid, including any GST */
    amount: money("amount").notNull(),
    description: text("description").notNull(),
    method: text("method").$type<PaymentMethod>().notNull().default("cash"),
    receiptFileId: uuid("receipt_file_id").references(() => files.id, { onDelete: "set null" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_project_idx").on(t.projectId), index("expenses_date_idx").on(t.spentOn)],
);

/** "site_updates" and "drawing_register" share a whole project section; their item id is the project id. */
export const SHARE_ITEM_TYPES = ["model", "tour", "drawing", "site_updates", "drawing_register"] as const;
export type ShareItemType = (typeof SHARE_ITEM_TYPES)[number];

/**
 * A private link a client opens without an account. The token is the
 * capability, like a shared-drive link; a passcode can be added on top.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    title: text("title").notNull(),
    message: text("message"),
    passcodeHash: text("passcode_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("share_links_project_idx").on(t.projectId)],
);

export const shareLinkItems = pgTable(
  "share_link_items",
  {
    shareLinkId: uuid("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    itemType: text("item_type").$type<ShareItemType>().notNull(),
    itemId: uuid("item_id").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.shareLinkId, t.itemType, t.itemId] })],
);

export const shareViews = pgTable(
  "share_views",
  {
    id: id(),
    shareLinkId: uuid("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    /** "page" for the share page, "embed" for an embedded viewer */
    via: text("via").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("share_views_link_idx").on(t.shareLinkId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Stage = typeof projectStages.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;

// ── Client portal: the project's own page at 360.studioskape.in/<slug> ─────

export type PortalSections = { drawings: boolean; models: boolean; tours: boolean; site: boolean; timeline?: boolean };

export const clientPortals = pgTable("client_portals", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** The address: lowercase letters, numbers and hyphens, e.g. "kadavil-residence" */
  slug: text("slug").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  /** Without one, anyone who has or guesses the address can open it */
  passcodeHash: text("passcode_hash"),
  coverFileId: uuid("cover_file_id").references(() => files.id, { onDelete: "set null" }),
  /** A short description of the project for the cover */
  brief: text("brief"),
  /** Built-up area or plot, as the studio writes it, e.g. "3,200 sq ft" */
  area: text("area"),
  sections: jsonb("sections")
    .$type<PortalSections>()
    .notNull()
    .default({ drawings: true, models: true, tours: true, site: true }),
  views: integer("views").notNull().default(0),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Firms: contractors and PMCs the studio designs for ─────────────────────
// Each firm has its own page at 360.studioskape.in/<slug> listing the
// projects done for it; its passcode also opens those projects' portals.

export const firms = pgTable("firms", {
  id: id(),
  name: text("name").notNull(),
  /** The address: lowercase letters, numbers and hyphens, e.g. "curves-and-lines" */
  slug: text("slug").notNull().unique(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  enabled: boolean("enabled").notNull().default(true),
  passcodeHash: text("passcode_hash"),
  views: integer("views").notNull().default(0),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  /** In the recycle bin since; null when not deleted */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
});

// ── Roles: what each kind of staff member can see and do ───────────────────

export const roles = pgTable("roles", {
  /** "admin", "architect", or made from the name, e.g. "interior-designer" */
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  /** Permission keys from src/lib/permissions.ts */
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  /** Built in: can't be deleted; Admin can't be changed */
  system: boolean("system").notNull().default(false),
  createdAt: createdAt(),
});

/**
 * Money received outside invoice payments, for the day books: a client's
 * cash advance on site, a refund, scrap sold, office income. No project
 * means the office's own book.
 */
export const incomes = pgTable(
  "incomes",
  {
    id: id(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    category: text("category").$type<IncomeCategory>().notNull(),
    receivedOn: date("received_on").notNull(),
    amount: money("amount").notNull(),
    /** Who paid, and what for */
    description: text("description").notNull(),
    method: text("method").$type<PaymentMethod>().notNull().default("cash"),
    receiptFileId: uuid("receipt_file_id").references(() => files.id, { onDelete: "set null" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("incomes_project_idx").on(t.projectId), index("incomes_date_idx").on(t.receivedOn)],
);

// ── Works timeline: a construction project's BOQ items or milestones ──────
// In the order they are done on site; each is marked started, then completed.

export const WORK_STATUSES = ["pending", "started", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const works = pgTable(
  "works",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The BOQ head it sits under, e.g. "Excavation", or "Milestones" */
    section: text("section").notNull().default("Works"),
    /** The BOQ item number, e.g. "2.1" */
    code: text("code"),
    title: text("title").notNull(),
    unit: text("unit"),
    qty: qty("qty"),
    rate: money("rate"),
    /** Value of the item; weights progress when every work has one */
    amount: money("amount"),
    position: integer("position").notNull(),
    status: text("status").$type<WorkStatus>().notNull().default("pending"),
    plannedStart: date("planned_start"),
    plannedEnd: date("planned_end"),
    startedOn: date("started_on"),
    completedOn: date("completed_on"),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("works_project_idx").on(t.projectId, t.position)],
);
