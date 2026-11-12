import Link from "next/link";
import { Check } from "lucide-react";
import { setTaskStatus } from "@/app/actions";
import type { TaskRow } from "@/lib/data";
import { formatDue, today } from "@/lib/dates";

/**
 * Two-line task rows. The round button on the left closes (or reopens) the
 * task; the due date turns red only when the task is late.
 */
export function TaskList({
  tasks,
  showProject = true,
  showAssignee = true,
}: {
  tasks: TaskRow[];
  showProject?: boolean;
  showAssignee?: boolean;
}) {
  const t = today();
  return (
    <ul>
      {tasks.map((task) => {
        const done = task.status === "done";
        const late = !done && task.dueDate !== null && task.dueDate < t;
        const meta = [
          showProject ? task.projectName : null,
          showAssignee ? (task.assigneeName ?? "Unassigned") : null,
          task.status === "in_progress" ? "In progress" : null,
        ].filter(Boolean);

        return (
          <li key={task.id} className="flex min-h-14 items-center gap-3 border-t border-rule px-5 py-2 first:border-t-0">
            <form action={setTaskStatus} className="flex-none">
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="status" value={done ? "todo" : "done"} />
              <button
                type="submit"
                aria-label={done ? `Reopen: ${task.title}` : `Mark done: ${task.title}`}
                title={done ? "Reopen" : "Mark done"}
                className="-m-3 flex h-11 w-11 items-center justify-center rounded-full"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    done ? "border-primary bg-primary text-white" : "border-control bg-surface text-muted hover:border-primary [&>svg]:opacity-0 hover:[&>svg]:opacity-100"
                  }`}
                >
                  <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
            </form>

            <div className="min-w-0 flex-1">
              <p className={`truncate ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
              {meta.length > 0 ? (
                <p className="truncate text-xs leading-4 text-muted">
                  {showProject ? (
                    <>
                      <Link href={`/projects/${task.projectId}`} className="hover:text-text hover:underline">
                        {task.projectName}
                      </Link>
                      {meta.length > 1 ? ` · ${meta.slice(1).join(" · ")}` : ""}
                    </>
                  ) : (
                    meta.join(" · ")
                  )}
                </p>
              ) : null}
            </div>

            <span className={`num flex-none text-right text-xs ${late ? "font-medium text-negative" : "text-muted"}`}>
              {done ? "Done" : formatDue(task.dueDate)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
