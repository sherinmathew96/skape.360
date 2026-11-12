import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { Stage } from "@/db/schema";
import type { SessionUser } from "./auth";
import { can } from "./permissions";
import { today } from "./dates";

/** Projects the user may see: all of them, or only those they are on. */
function visibleProjects(user: SessionUser) {
  const notDeleted = isNull(s.projects.deletedAt);
  if (can(user.role, "projects.view_all")) return notDeleted;
  return and(
    notDeleted,
    sql`${s.projects.id} in (select ${s.projectMembers.projectId} from ${s.projectMembers} where ${s.projectMembers.userId} = ${user.id})`,
  );
}

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  type: s.ProjectType;
  status: s.ProjectStatus;
  location: string | null;
  dueDate: string | null;
  clientName: string;
  leadName: string | null;
  firmId: string | null;
  firmName: string | null;
  stages: Stage[];
  tasksOpen: number;
  tasksDone: number;
  tasksOverdue: number;
};

export async function listProjects(user: SessionUser): Promise<ProjectRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.projects.id,
      code: s.projects.code,
      name: s.projects.name,
      type: s.projects.type,
      status: s.projects.status,
      location: s.projects.location,
      dueDate: s.projects.dueDate,
      clientName: s.clients.name,
      leadName: s.users.name,
      firmId: s.projects.firmId,
      firmName: s.firms.name,
    })
    .from(s.projects)
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .leftJoin(s.users, eq(s.users.id, s.projects.leadId))
    .leftJoin(s.firms, eq(s.firms.id, s.projects.firmId))
    .where(visibleProjects(user))
    .orderBy(asc(s.projects.code));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const t = today();

  const [stages, counts] = await Promise.all([
    db
      .select()
      .from(s.projectStages)
      .where(inArray(s.projectStages.projectId, ids))
      .orderBy(asc(s.projectStages.position)),
    db
      .select({
        projectId: s.tasks.projectId,
        open: sql<number>`count(*) filter (where ${s.tasks.status} <> 'done')::int`,
        done: sql<number>`count(*) filter (where ${s.tasks.status} = 'done')::int`,
        overdue: sql<number>`count(*) filter (where ${s.tasks.status} <> 'done' and ${s.tasks.dueDate} < ${t}::date)::int`,
      })
      .from(s.tasks)
      .where(inArray(s.tasks.projectId, ids))
      .groupBy(s.tasks.projectId),
  ]);

  return rows.map((r) => {
    const c = counts.find((x) => x.projectId === r.id);
    return {
      ...r,
      stages: stages.filter((st) => st.projectId === r.id),
      tasksOpen: c?.open ?? 0,
      tasksDone: c?.done ?? 0,
      tasksOverdue: c?.overdue ?? 0,
    };
  });
}

export type TaskRow = {
  id: string;
  title: string;
  status: s.TaskStatus;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectCode: string;
  assigneeId: string | null;
  assigneeName: string | null;
};

const taskColumns = {
  id: s.tasks.id,
  title: s.tasks.title,
  status: s.tasks.status,
  dueDate: s.tasks.dueDate,
  projectId: s.tasks.projectId,
  projectName: s.projects.name,
  projectCode: s.projects.code,
  assigneeId: s.tasks.assigneeId,
  assigneeName: s.users.name,
};

/** Open tasks across the projects the user can see, soonest first. */
export async function listOpenTasks(
  user: SessionUser,
  opts: { mine?: boolean } = {},
): Promise<TaskRow[]> {
  const db = await getDb();
  return db
    .select(taskColumns)
    .from(s.tasks)
    .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .where(
      and(
        visibleProjects(user),
        ne(s.tasks.status, "done"),
        ne(s.projects.status, "cancelled"),
        opts.mine ? eq(s.tasks.assigneeId, user.id) : undefined,
      ),
    )
    .orderBy(sql`${s.tasks.dueDate} asc nulls last`, asc(s.tasks.createdAt));
}

export type MilestoneRow = {
  id: string;
  name: string;
  dueDate: string;
  done: boolean;
  projectId: string;
  projectName: string;
};

export async function listOpenMilestones(user: SessionUser): Promise<MilestoneRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.milestones.id,
      name: s.milestones.name,
      dueDate: s.milestones.dueDate,
      doneAt: s.milestones.doneAt,
      projectId: s.milestones.projectId,
      projectName: s.projects.name,
    })
    .from(s.milestones)
    .innerJoin(s.projects, eq(s.projects.id, s.milestones.projectId))
    .where(and(visibleProjects(user), isNull(s.milestones.doneAt), eq(s.projects.status, "active")))
    .orderBy(asc(s.milestones.dueDate));
  return rows.map(({ doneAt, ...r }) => ({ ...r, done: doneAt !== null }));
}

export async function getProject(user: SessionUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();

  const [project] = await db
    .select({
      id: s.projects.id,
      code: s.projects.code,
      name: s.projects.name,
      type: s.projects.type,
      status: s.projects.status,
      location: s.projects.location,
      startDate: s.projects.startDate,
      dueDate: s.projects.dueDate,
      notes: s.projects.notes,
      leadId: s.projects.leadId,
      clientName: s.clients.name,
      clientPhone: s.clients.phone,
      firmId: s.projects.firmId,
      firmName: s.firms.name,
    })
    .from(s.projects)
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .leftJoin(s.firms, eq(s.firms.id, s.projects.firmId))
    .where(and(visibleProjects(user), eq(s.projects.id, id)));
  if (!project) return null;

  const [stages, milestones, tasks, members] = await Promise.all([
    db.select().from(s.projectStages).where(eq(s.projectStages.projectId, id)).orderBy(asc(s.projectStages.position)),
    db.select().from(s.milestones).where(eq(s.milestones.projectId, id)).orderBy(asc(s.milestones.dueDate)),
    db
      .select(taskColumns)
      .from(s.tasks)
      .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
      .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
      .where(eq(s.tasks.projectId, id))
      .orderBy(sql`(${s.tasks.status} = 'done') asc`, sql`${s.tasks.dueDate} asc nulls last`),
    db
      .select({ id: s.users.id, name: s.users.name, role: s.users.role, title: s.users.title })
      .from(s.projectMembers)
      .innerJoin(s.users, eq(s.users.id, s.projectMembers.userId))
      .where(eq(s.projectMembers.projectId, id))
      .orderBy(asc(s.users.name)),
  ]);

  return { project, stages, milestones, tasks, members };
}

export async function isProjectMember(userId: string, projectId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ userId: s.projectMembers.userId })
    .from(s.projectMembers)
    .where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.userId, userId)));
  return Boolean(row);
}

export async function listStaff() {
  const db = await getDb();
  return db
    .select({
      id: s.users.id,
      name: s.users.name,
      email: s.users.email,
      role: s.users.role,
      title: s.users.title,
      phone: s.users.phone,
      active: s.users.active,
      projects: sql<number>`(select count(*) from ${s.projectMembers} pm inner join ${s.projects} p on p.id = pm.project_id where pm.user_id = "users"."id" and p.status = 'active' and p.deleted_at is null)::int`,
      openTasks: sql<number>`(select count(*) from ${s.tasks} t where t.assignee_id = "users"."id" and t.status <> 'done')::int`,
    })
    .from(s.users)
    .orderBy(sql`${s.users.active} desc`, asc(s.users.name));
}

/** The project's name and code when the user may see it, otherwise null. */
export async function visibleProject(user: SessionUser, projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: s.projects.id, name: s.projects.name, code: s.projects.code, clientName: s.clients.name, type: s.projects.type })
    .from(s.projects)
    .innerJoin(s.clients, eq(s.clients.id, s.projects.clientId))
    .where(and(visibleProjects(user), eq(s.projects.id, projectId)));
  return row ?? null;
}

export async function listClients() {
  const db = await getDb();
  return db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).orderBy(asc(s.clients.name));
}
