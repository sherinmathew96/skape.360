import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { StageTrack, currentStage } from "@/components/stage-track";
import { TaskList } from "@/components/task-list";
import { requireUser } from "@/lib/auth";
import { listOpenMilestones, listOpenTasks, listProjects } from "@/lib/data";
import { addDays, daysBetween, formatDate, formatDue, today } from "@/lib/dates";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Overview" };

/* The screen's question: what is due this week, and what is slipping? */
export default async function OverviewPage() {
  const user = await requireUser();
  const [projects, tasks, milestones] = await Promise.all([
    listProjects(user),
    listOpenTasks(user),
    listOpenMilestones(user),
  ]);

  const t = today();
  const weekEnd = addDays(t, 6);
  const active = projects.filter((p) => p.status === "active");
  const overdue = tasks.filter((task) => task.dueDate && task.dueDate < t);
  const dueThisWeek = tasks.filter((task) => task.dueDate && task.dueDate >= t && task.dueDate <= weekEnd);
  const milestonesSoon = milestones.filter((m) => m.dueDate <= addDays(t, 30));
  const attention = [...overdue, ...dueThisWeek];
  const ROWS = 6;

  // The finding: the one fact that most needs attention today.
  let finding = "Nothing is overdue.";
  if (overdue.length > 0) {
    const overdueProjects = new Set(overdue.map((task) => task.projectId)).size;
    const oldest = daysBetween(overdue[0].dueDate!, t);
    finding = `${overdue.length} ${overdue.length === 1 ? "task is" : "tasks are"} overdue across ${overdueProjects} ${
      overdueProjects === 1 ? "project" : "projects"
    }; the oldest is ${oldest} ${oldest === 1 ? "day" : "days"} late.`;
  } else if (dueThisWeek.length > 0) {
    finding = `Nothing is overdue. ${dueThisWeek.length} ${dueThisWeek.length === 1 ? "task is" : "tasks are"} due in the next 7 days.`;
  }

  const kpis = [
    { label: "Active projects", value: active.length, tone: "" },
    { label: "Tasks due, 7 days", value: dueThisWeek.length, tone: "" },
    { label: "Tasks overdue", value: overdue.length, tone: overdue.length > 0 ? "text-negative" : "text-muted" },
    { label: "Milestones, 30 days", value: milestonesSoon.length, tone: "" },
  ];

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Overview</h1>
          <p className="mt-1 text-muted">{finding}</p>
        </div>
        {can(user.role, "projects.create") ? (
          <Link href="/projects/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            New project
          </Link>
        ) : null}
      </div>

      {/* One container, four figures. */}
      <dl className="card mb-3 grid grid-cols-2 md:grid-cols-4">
        {kpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className={`px-5 py-4 ${i % 2 === 1 ? "border-l border-rule" : ""} ${i >= 2 ? "border-t border-rule md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}
          >
            <dt className="text-muted">{kpi.label}</dt>
            <dd className={`num mt-1 text-[30px] leading-9 ${kpi.tone}`}>{kpi.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card flex flex-col" aria-labelledby="due-title">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 id="due-title" className="card-title">Overdue and due this week</h2>
            <Link href="/tasks?view=all" className="text-muted hover:text-text hover:underline">
              View all {tasks.length}
            </Link>
          </div>
          {attention.length > 0 ? (
            <TaskList tasks={attention.slice(0, ROWS)} />
          ) : (
            <p className="empty mx-5 mb-5 mt-2">No tasks are overdue or due in the next 7 days.</p>
          )}
          {attention.length > ROWS ? (
            <p className="mt-auto border-t border-rule px-5 py-3 text-xs text-muted">
              {attention.length - ROWS} more in <Link href="/tasks?view=all" className="text-text underline">all tasks</Link>
            </p>
          ) : null}
        </section>

        <section className="card" aria-labelledby="milestones-title">
          <h2 id="milestones-title" className="card-title px-5 pb-2 pt-4">Next milestones</h2>
          {milestones.length > 0 ? (
            <ul>
              {milestones.slice(0, ROWS).map((m) => {
                const late = m.dueDate < t;
                return (
                  <li key={m.id} className="flex min-h-14 items-center gap-3 border-t border-rule px-5 py-2 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{m.name}</p>
                      <p className="truncate text-xs leading-4 text-muted">
                        <Link href={`/projects/${m.projectId}`} className="hover:text-text hover:underline">{m.projectName}</Link>
                      </p>
                    </div>
                    <span className={`num flex-none text-xs ${late ? "font-medium text-negative" : "text-muted"}`}>
                      {late ? formatDue(m.dueDate) : formatDate(m.dueDate)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty mx-5 mb-5 mt-2">No open milestones.</p>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="projects-title">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 id="projects-title" className="card-title">Active projects</h2>
          <Link href="/projects" className="text-muted hover:text-text hover:underline">All projects</Link>
        </div>
        {active.length > 0 ? (
          <ul>
            {active.map((p) => {
              const stage = currentStage(p.stages);
              return (
                <li key={p.id} className="border-t border-rule first:border-t-0">
                  <Link
                    href={`/projects/${p.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-3 transition-colors hover:bg-ground md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_88px_88px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs leading-4 text-muted">{p.clientName}</p>
                    </div>
                    <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                      <StageTrack stages={p.stages} />
                      <p className="mt-1.5 truncate text-xs leading-4 text-muted">
                        <span className="text-text">{stage.name}</span> · {stage.approved} of {stage.total} approved
                      </p>
                    </div>
                    <div className="num hidden text-right md:block">
                      <p>{p.tasksOpen} open</p>
                      <p className={`text-xs leading-4 ${p.tasksOverdue > 0 ? "text-negative" : "text-muted"}`}>
                        {p.tasksOverdue > 0 ? `${p.tasksOverdue} late` : "None late"}
                      </p>
                    </div>
                    <div className="num text-right">
                      <p>{formatDate(p.dueDate)}</p>
                      <p className="text-xs leading-4 text-muted">Completion</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty mx-5 mb-5 mt-2">
            {can(user.role, "projects.create")
              ? "No active projects yet. Create the first one with New project."
              : "You are not on any active project yet."}
          </p>
        )}
      </section>
    </div>
  );
}
