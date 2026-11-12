import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── Core ────────────────────────────────────────────────────────────────────

export const ROLES = [
  "admin",
  "project_manager",
  "architect",
  "site_engineer",
  "accountant",
] as const;
export type Role = (typeof ROLES)[number];

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
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
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("projects_status_idx").on(t.status)],
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
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
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
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
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

export const drawings = pgTable(
  "drawings",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The studio's sheet number, e.g. A-101 */
    number: text("number").notNull(),
    title: text("title").notNull(),
    discipline: text("discipline").$type<Discipline>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("drawings_project_idx").on(t.projectId, t.number)],
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
    createdAt: createdAt(),
  },
  (t) => [index("approvals_revision_idx").on(t.revisionId)],
);

export const SHARE_ITEM_TYPES = ["model", "tour", "drawing"] as const;
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
