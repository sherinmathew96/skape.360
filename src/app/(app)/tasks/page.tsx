import type { Metadata } from "next";
import Link from "next/link";
import { TaskList } from "@/components/task-list";
import { requireUser } from "@/lib/auth";
import { listOpenTasks, type TaskRow } from "@/lib/data";
import { addDays, today } from "@/lib/dates";

export const metadata: Metadata = { title: "Tasks" };

type Props = { searchParams: Promise<{ view?: string }> };

export default async function TasksPage({ searchParams }: Props) {
  const user = await requireUser();
  const all = (await searchParams).view === "all";
  const tasks = await listOpenTasks(user, { mine: !all });

  const t = today();
  const weekEnd = addDays(t, 6);
  const groups: { title: string; tasks: TaskRow[] }[] = [
    { title: "Overdue", tasks: tasks.filter((x) => x.dueDate && x.dueDate < t) },
    { title: "Due in the next 7 days", tasks: tasks.filter((x) => x.dueDate && x.dueDate >= t && x.dueDate <= weekEnd) },
    { title: "Later", tasks: tasks.filter((x) => x.dueDate && x.dueDate > weekEnd) },
    { title: "No due date", tasks: tasks.filter((x) => !x.dueDate) },
  ].filter((g) => g.tasks.length > 0);

  const overdue = groups.find((g) => g.title === "Overdue")?.tasks.length ?? 0;
  const tab = (active: boolean) =>
    `flex h-9 items-center rounded-[5px] px-3 md:h-7 ${active ? "bg-surface font-medium text-text" : "text-muted hover:text-text"}`;

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{all ? "All tasks" : "My tasks"}</h1>
          <p className="num mt-1 text-muted">
            {tasks.length} open
            {overdue > 0 ? <span className="text-negative">, {overdue} overdue</span> : ", none overdue"}
          </p>
        </div>
        <nav aria-label="Whose tasks" className="flex rounded-md bg-raised p-1">
          <Link href="/tasks" aria-current={!all ? "page" : undefined} className={tab(!all)}>Mine</Link>
          <Link href="/tasks?view=all" aria-current={all ? "page" : undefined} className={tab(all)}>Everyone&rsquo;s</Link>
        </nav>
      </div>

      {groups.length === 0 ? (
        <div className="card p-5">
          <p className="empty">
            {all ? "No open tasks on your projects." : "You have no open tasks. New tasks are added from a project's page."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {groups.map((group) => (
            <section key={group.title} className="card" aria-label={group.title}>
              <h2 className="card-title flex items-baseline justify-between px-5 pb-2 pt-4">
                {group.title}
                <span className="num text-sm font-normal text-muted">{group.tasks.length}</span>
              </h2>
              <TaskList tasks={group.tasks} showAssignee={all} />
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">Tasks are added from a project&rsquo;s page.</p>
    </div>
  );
}
