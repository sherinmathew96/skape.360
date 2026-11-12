import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Flag, FolderKanban, Plus } from "lucide-react";
import { currentStage } from "@/components/stage-track";
import { ProjectTable, type ProjectTableRow } from "@/components/project-table";
import { StatGrid, type Stat } from "@/components/stat-grid";
import { TaskList } from "@/components/task-list";
import { requireUser } from "@/lib/auth";
import { listOpenMilestones, listOpenTasks, listProjects } from "@/lib/data";
import { addDays, daysBetween, formatDate, formatDue, today } from "@/lib/dates";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Overview" };

const STATUS: Record<string, { label: string; tone: string }> = {
  on_hold: { label: "On hold", tone: "pill-warning" },
  completed: { label: "Completed", tone: "" },
  cancelled: { label: "Cancelled", tone: "pill-negative" },
};

/* The screen's question: what is due this week, and what is slipping? */
export default async function OverviewPage() {
  const user = await requireUser();
  const [projects, tasks, milestones] = await Promise.all([listProjects(user), listOpenTasks(user), listOpenMilestones(user)]);

  const t = today();
  const weekEnd = addDays(t, 6);
  const active = projects.filter((p) => p.status === "active");
  const overdue = tasks.filter((task) => task.dueDate && task.dueDate < t);
  const dueThisWeek = tasks.filter((task) => task.dueDate && task.dueDate >= t && task.dueDate <= weekEnd);
  const milestonesSoon = milestones.filter((m) => m.dueDate <= addDays(t, 30));
  const attention = [...overdue, ...dueThisWeek];
  const ROWS = 6;
  const overdueProjects = new Set(overdue.map((task) => task.projectId)).size;
  const onSite = active.filter((p) => p.type !== "design").length;
  const nextMilestone = milestones[0];

  // The finding: the one fact that most needs attention today.
  let finding = "Nothing is overdue.";
  if (overdue.length > 0) {
    const oldest = daysBetween(overdue[0].dueDate!, t);
    finding = `${overdue.length} ${overdue.length === 1 ? "task is" : "tasks are"} overdue across ${overdueProjects} ${
      overdueProjects === 1 ? "project" : "projects"
    }; the oldest is ${oldest} ${oldest === 1 ? "day" : "days"} late.`;
  } else if (dueThisWeek.length > 0) {
    finding = `Nothing is overdue. ${dueThisWeek.length} ${dueThisWeek.length === 1 ? "task is" : "tasks are"} due in the next 7 days.`;
  }

  const stats: Stat[] = [
    {
      label: "Active projects",
      value: active.length,
      note: active.length ? `${onSite} with site work` : "None yet",
      icon: FolderKanban,
      bad: false,
    },
    {
      label: "Due this week",
      value: dueThisWeek.length,
      note: `of ${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"}`,
      icon: CalendarClock,
      bad: false,
    },
    {
      label: "Overdue",
      value: overdue.length,
      note: overdue.length ? `across ${overdueProjects} ${overdueProjects === 1 ? "project" : "projects"}` : "All on time",
      icon: AlertTriangle,
      bad: overdue.length > 0,
    },
    {
      label: "Milestones",
      value: milestonesSoon.length,
      note: nextMilestone ? `in 30 days, next ${formatDate(nextMilestone.dueDate)}` : "None in 30 days",
      icon: Flag,
      bad: false,
    },
  ];

  const rows: ProjectTableRow[] = projects.map((p) => {
    const stage = currentStage(p.stages);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientName: p.clientName,
      location: p.location,
      stage: stage.name,
      stageProgress: `${stage.approved} of ${stage.total} approved`,
      tasksOpen: p.tasksOpen,
      tasksOverdue: p.tasksOverdue,
      dueDate: p.dueDate,
      dueLabel: formatDate(p.dueDate),
      status:
        p.status === "active"
          ? p.tasksOverdue > 0
            ? { label: "Running late", tone: "pill-negative" }
            : { label: "On track", tone: "pill-positive" }
          : STATUS[p.status],
    };
  });
  const onTrack = rows.filter((r) => r.status.label === "On track").length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">Overview</h1>
          <p className="mt-1 text-muted">{finding}</p>
        </div>
        {can(user.role, "projects.create") ? (
          <Link href="/projects/new" className="btn btn-primary h-11 px-5">
            <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
            New project
          </Link>
        ) : null}
      </div>

      <StatGrid stats={stats} className="mb-6" />

      <div className="mb-6">
        <ProjectTable rows={rows} title="All projects" subtitle={`${onTrack} on track${rows.length - onTrack ? `, ${rows.length - onTrack} need a look` : ""}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card flex flex-col overflow-hidden" aria-labelledby="due-title">
          <div className="flex items-center justify-between px-6 pb-3 pt-6">
            <h2 id="due-title" className="card-title">Overdue and due this week</h2>
            <Link href="/tasks?view=all" className="text-sm font-medium text-primary hover:underline">
              View all {tasks.length}
            </Link>
          </div>
          {attention.length > 0 ? (
            <TaskList tasks={attention.slice(0, ROWS)} />
          ) : (
            <p className="empty mx-6 mb-6 mt-1">No tasks are overdue or due in the next 7 days.</p>
          )}
          {attention.length > ROWS ? (
            <p className="mt-auto border-t border-rule px-6 py-3 text-xs text-muted">
              {attention.length - ROWS} more in{" "}
              <Link href="/tasks?view=all" className="font-medium text-primary hover:underline">all tasks</Link>
            </p>
          ) : null}
        </section>

        <section className="card overflow-hidden" aria-labelledby="milestones-title">
          <h2 id="milestones-title" className="card-title px-6 pb-3 pt-6">Next milestones</h2>
          {milestones.length > 0 ? (
            <ul>
              {milestones.slice(0, ROWS).map((m) => {
                const late = m.dueDate < t;
                return (
                  <li key={m.id} className="flex min-h-16 items-center gap-3 border-t border-rule px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className="truncate text-xs leading-5 text-muted">
                        <Link href={`/projects/${m.projectId}`} className="hover:text-primary hover:underline">{m.projectName}</Link>
                      </p>
                    </div>
                    <span className={`pill ${late ? "pill-negative" : ""}`}>{late ? formatDue(m.dueDate) : formatDate(m.dueDate)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty mx-6 mb-6 mt-1">No open milestones.</p>
          )}
        </section>
      </div>
    </div>
  );
}
