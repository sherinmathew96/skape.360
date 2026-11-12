"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, count, eq, gt, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { PROJECT_TYPES, ROLES, TASK_STATUSES } from "@/db/schema";
import {
  createSession,
  destroySession,
  requirePermission,
  requireUser,
  type SessionUser,
} from "@/lib/auth";
import { getProject, isProjectMember } from "@/lib/data";
import { today } from "@/lib/dates";
import { hashPassword, verifyPassword } from "@/lib/password";
import { can } from "@/lib/permissions";
import { STAGE_TEMPLATES } from "@/lib/stages";

export type FormState = { error?: string; ok?: string } | undefined;

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").nullable());

const uuid = z.string().uuid();

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

async function audit(user: SessionUser, action: string, entity: string, entityId?: string, meta?: unknown) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ userId: user.id, action, entity, entityId, meta });
}

// ── Sign in and out ─────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password } = parsed.data;

  const db = await getDb();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.email, email), gt(s.loginAttempts.createdAt, since)));
  if (n >= MAX_ATTEMPTS) {
    return { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` };
  }

  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  const valid = user?.active ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    await db.insert(s.loginAttempts).values({ email });
    return { error: "That email and password do not match an active account." };
  }

  await db.delete(s.loginAttempts).where(eq(s.loginAttempts.email, email));
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ── Projects ────────────────────────────────────────────────────────────────

const projectInput = z.object({
  name: z.string().trim().min(2, "Give the project a name."),
  clientId: z.string(),
  clientName: z.string().trim(),
  clientPhone: z.string().trim(),
  type: z.enum(PROJECT_TYPES),
  location: z.string().trim(),
  startDate: optionalDate,
  dueDate: optionalDate,
  leadId: uuid,
});

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("projects.create");
  const parsed = projectInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  if (input.clientId === "new" && input.clientName.length < 2) {
    return { error: "Enter the new client's name." };
  }
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    return { error: "The completion date is before the start date." };
  }

  const db = await getDb();
  const year = today().slice(0, 4);

  const id = await db.transaction(async (tx) => {
    let clientId = input.clientId;
    if (clientId === "new") {
      const [client] = await tx
        .insert(s.clients)
        .values({ name: input.clientName, phone: input.clientPhone || null })
        .returning({ id: s.clients.id });
      clientId = client.id;
    }

    // Next number in this year's sequence: SS-2026-005
    const prefix = `SS-${year}-`;
    const [{ last }] = await tx
      .select({ last: sql<string | null>`max(${s.projects.code})` })
      .from(s.projects)
      .where(like(s.projects.code, `${prefix}%`));
    const next = (last ? Number(last.slice(prefix.length)) : 0) + 1;

    const [project] = await tx
      .insert(s.projects)
      .values({
        code: `${prefix}${String(next).padStart(3, "0")}`,
        name: input.name,
        clientId,
        type: input.type,
        location: input.location || null,
        startDate: input.startDate,
        dueDate: input.dueDate,
        leadId: input.leadId,
        createdBy: user.id,
      })
      .returning({ id: s.projects.id });

    const memberIds = new Set([input.leadId, user.id]);
    await tx
      .insert(s.projectMembers)
      .values([...memberIds].map((userId) => ({ projectId: project.id, userId })));

    await tx.insert(s.projectStages).values(
      STAGE_TEMPLATES[input.type].map((name, position) => ({
        projectId: project.id,
        name,
        position,
        status: position === 0 ? ("in_progress" as const) : ("pending" as const),
      })),
    );
    return project.id;
  });

  await audit(user, "create", "project", id);
  revalidatePath("/", "layout");
  redirect(`/projects/${id}`);
}

/** Approves the stage in progress and opens the next one. */
export async function approveStage(formData: FormData) {
  const user = await requirePermission("projects.edit");
  const projectId = uuid.parse(formData.get("projectId"));
  const db = await getDb();

  const stages = await db
    .select()
    .from(s.projectStages)
    .where(eq(s.projectStages.projectId, projectId))
    .orderBy(asc(s.projectStages.position));
  const current = stages.find((st) => st.status === "in_progress");
  if (!current) return;
  const next = stages.find((st) => st.position === current.position + 1);

  await db.transaction(async (tx) => {
    await tx
      .update(s.projectStages)
      .set({ status: "approved", approvedAt: new Date(), approvedBy: user.id })
      .where(eq(s.projectStages.id, current.id));
    if (next) {
      await tx.update(s.projectStages).set({ status: "in_progress" }).where(eq(s.projectStages.id, next.id));
    } else {
      await tx.update(s.projects).set({ status: "completed" }).where(eq(s.projects.id, projectId));
    }
  });

  await audit(user, "approve_stage", "project", projectId, { stage: current.name });
  revalidatePath("/", "layout");
}

export async function addMilestone(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("projects.edit");
  const parsed = z
    .object({
      projectId: uuid,
      name: z.string().trim().min(2, "Name the milestone."),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for the milestone."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const db = await getDb();
  await db.insert(s.milestones).values(parsed.data);
  await audit(user, "create", "milestone", parsed.data.projectId, { name: parsed.data.name });
  revalidatePath("/", "layout");
  return { ok: "Milestone added." };
}

export async function setMilestoneDone(formData: FormData) {
  const user = await requirePermission("projects.edit");
  const id = uuid.parse(formData.get("id"));
  const done = formData.get("done") === "1";
  const db = await getDb();
  await db.update(s.milestones).set({ doneAt: done ? new Date() : null }).where(eq(s.milestones.id, id));
  await audit(user, done ? "complete" : "reopen", "milestone", id);
  revalidatePath("/", "layout");
}

export async function addMember(formData: FormData) {
  const user = await requirePermission("projects.edit");
  const projectId = uuid.parse(formData.get("projectId"));
  const userId = uuid.parse(formData.get("userId"));
  const db = await getDb();
  await db.insert(s.projectMembers).values({ projectId, userId }).onConflictDoNothing();
  await audit(user, "add_member", "project", projectId, { userId });
  revalidatePath("/", "layout");
}

export async function removeMember(formData: FormData) {
  const user = await requirePermission("projects.edit");
  const projectId = uuid.parse(formData.get("projectId"));
  const userId = uuid.parse(formData.get("userId"));
  const db = await getDb();
  await db
    .delete(s.projectMembers)
    .where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.userId, userId)));
  await audit(user, "remove_member", "project", projectId, { userId });
  revalidatePath("/", "layout");
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export async function createTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      projectId: uuid,
      title: z.string().trim().min(2, "Describe the task."),
      assigneeId: uuid,
      dueDate: optionalDate,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  // The project must be visible to the user, and the user must manage tasks or be on it.
  const found = await getProject(user, input.projectId);
  if (!found) return { error: "That project was not found." };
  const onProject = found.members.some((m) => m.id === user.id);
  if (!can(user.role, "tasks.manage") && !onProject) {
    return { error: "Only the project's team can add tasks to it." };
  }
  if (!found.members.some((m) => m.id === input.assigneeId)) {
    return { error: "Assign the task to someone on the project's team." };
  }

  const db = await getDb();
  const [task] = await db
    .insert(s.tasks)
    .values({ ...input, createdBy: user.id })
    .returning({ id: s.tasks.id });
  await audit(user, "create", "task", task.id);
  revalidatePath("/", "layout");
  return { ok: "Task added." };
}

export async function setTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const status = z.enum(TASK_STATUSES).parse(formData.get("status"));
  const db = await getDb();

  const [task] = await db.select().from(s.tasks).where(eq(s.tasks.id, id));
  if (!task) return;
  const allowed =
    task.assigneeId === user.id ||
    (can(user.role, "tasks.manage")) ||
    (await isProjectMember(user.id, task.projectId));
  if (!allowed) throw new Error("You do not have permission to update this task.");

  await db
    .update(s.tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(eq(s.tasks.id, id));
  await audit(user, "set_status", "task", id, { status });
  revalidatePath("/", "layout");
}

// ── Staff ───────────────────────────────────────────────────────────────────

export async function createStaff(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePermission("staff.manage");
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Enter the person's name."),
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
      role: z.enum(ROLES),
      title: z.string().trim(),
      password: z.string().min(10, "Use a starting password of at least 10 characters."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  const db = await getDb();
  const [existing] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, input.email));
  if (existing) return { error: "Someone already has that email address." };

  const [user] = await db
    .insert(s.users)
    .values({
      name: input.name,
      email: input.email,
      role: input.role,
      title: input.title || null,
      passwordHash: await hashPassword(input.password),
    })
    .returning({ id: s.users.id });
  await audit(admin, "create", "user", user.id, { role: input.role });
  revalidatePath("/team");
  return { ok: `${input.name} can now sign in.` };
}

export async function updateStaff(formData: FormData) {
  const admin = await requirePermission("staff.manage");
  const id = uuid.parse(formData.get("id"));
  const role = z.enum(ROLES).parse(formData.get("role"));
  const active = formData.get("active") === "1";

  // An admin cannot lock themselves out.
  if (id === admin.id && (!active || role !== "admin")) return;

  const db = await getDb();
  await db.update(s.users).set({ role, active }).where(eq(s.users.id, id));
  if (!active) await db.delete(s.sessions).where(eq(s.sessions.userId, id));
  await audit(admin, "update", "user", id, { role, active });
  revalidatePath("/team");
}
