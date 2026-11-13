import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import {
  addMember,
  addMilestone,
  approveStage,
  createTask,
  removeMember,
  setMilestoneDone,
} from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ProjectHeader } from "@/components/project-header";
import { Avatar } from "@/components/avatar";
import { currentStage } from "@/components/stage-track";
import { StatusPill } from "@/components/status-pill";
import { TaskList } from "@/components/task-list";
import { requireUser } from "@/lib/auth";
import { setProjectFirm } from "@/app/firm-actions";
import { deleteProject } from "@/app/trash-actions";
import { getProject, listStaff } from "@/lib/data";
import { listFirms } from "@/lib/firms";
import { formatDate, formatDue, today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireUser();
  const found = await getProject(user, (await params).id);
  return { title: found?.project.name ?? "Project" };
}

export default async function ProjectPage({ params }: Props) {
  const user = await requireUser();
  const found = await getProject(user, (await params).id);
  if (!found) notFound();

  const { project, stages, milestones, tasks, members } = found;
  const t = today();
  const canEdit = can(user, "projects.edit");
  const onTeam = members.some((m) => m.id === user.id);
  const canAddTask = can(user, "tasks.manage") || onTeam;
  const stage = currentStage(stages);
  const inProgress = stages.find((s) => s.status === "in_progress");
  const open = tasks.filter((task) => task.status !== "done");
  const done = tasks.filter((task) => task.status === "done");
  const late = open.filter((task) => task.dueDate && task.dueDate < t).length;
  const staff = canEdit ? (await listStaff()).filter((p) => p.active && !members.some((m) => m.id === p.id)) : [];
  const firms = canEdit ? await listFirms() : [];

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        subtitle={[PROJECT_TYPE_LABEL[project.type], project.clientName, project.location, project.firmName ? `for ${project.firmName}` : null]
          .filter(Boolean)
          .join(" · ")}
        badge={project.status !== "active" ? <StatusPill status={project.status} /> : null}
        actions={
          canEdit && inProgress ? (
            <form action={approveStage}>
              <input type="hidden" name="projectId" value={project.id} />
              <button type="submit" className="btn btn-primary">
                <Check size={16} strokeWidth={1.5} aria-hidden="true" />
                Approve {inProgress.name.toLowerCase()}
              </button>
            </form>
          ) : null
        }
      />

      {/* The stage ladder: this screen's answer to "where does the project stand?" */}
      <section className="card mb-3 p-5" aria-labelledby="stages-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="stages-title" className="card-title">
            {stage.name}
            <span className="num ml-2 text-sm font-normal text-muted">
              {stage.approved} of {stage.total} stages approved
            </span>
          </h2>
          <p className="num text-muted">
            {formatDate(project.startDate)} to {formatDate(project.dueDate)}
          </p>
        </div>
        <ol className="grid gap-x-0.5 gap-y-3" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
          {stages.map((s) => (
            <li key={s.id} className="min-w-0">
              <span
                className={`block h-2 rounded-[1px] ${
                  s.status === "approved" ? "bg-mint-ink" : s.status === "in_progress" ? "bg-stage" : "bg-stage-pending"
                }`}
              />
              <span
                className={`mt-2 hidden truncate pr-2 text-xs leading-4 md:block ${
                  s.status === "in_progress" ? "font-medium text-text" : "text-muted"
                }`}
              >
                {s.name}
              </span>
              <span className="sr-only md:hidden">{s.name}</span>
              <span className="sr-only">
                {s.status === "approved" ? " (approved)" : s.status === "in_progress" ? " (in progress)" : " (not started)"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card" aria-labelledby="tasks-title">
          <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
            <h2 id="tasks-title" className="card-title">Tasks</h2>
            <p className="num text-muted">
              {open.length} open
              {late > 0 ? <span className="text-negative">, {late} late</span> : null}
              , {done.length} done
            </p>
          </div>

          {tasks.length > 0 ? (
            <TaskList tasks={[...open, ...done.slice(0, 5)]} showProject={false} />
          ) : (
            <p className="empty mx-5 mb-4 mt-2">No tasks yet. Add the first one below.</p>
          )}

          {canAddTask ? (
            <div className="border-t border-border bg-ground/60 p-5">
              <ActionForm
                action={createTask}
                submitLabel="Add task"
                pendingLabel="Adding…"
                primary={false}
                className="space-y-3"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_150px]">
                  <div>
                    <label htmlFor="task-title" className="field-label">New task</label>
                    <input id="task-title" name="title" required autoComplete="off" className="field" />
                  </div>
                  <div>
                    <label htmlFor="task-assignee" className="field-label">Assign to</label>
                    <select id="task-assignee" name="assigneeId" defaultValue={onTeam ? user.id : members[0]?.id} className="field">
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="task-due" className="field-label">Due</label>
                    <input id="task-due" name="dueDate" type="date" className="field" />
                  </div>
                </div>
              </ActionForm>
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-3">
          <section className="card" aria-labelledby="ms-title">
            <h2 id="ms-title" className="card-title px-5 pb-2 pt-4">Milestones</h2>
            {milestones.length > 0 ? (
              <ul>
                {milestones.map((m) => {
                  const isDone = m.doneAt !== null;
                  const isLate = !isDone && m.dueDate < t;
                  return (
                    <li key={m.id} className="flex min-h-12 items-center gap-3 border-t border-rule px-5 py-2 first:border-t-0">
                      {canEdit ? (
                        <form action={setMilestoneDone} className="flex-none">
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="done" value={isDone ? "0" : "1"} />
                          <button
                            type="submit"
                            aria-label={isDone ? `Reopen milestone: ${m.name}` : `Mark milestone reached: ${m.name}`}
                            title={isDone ? "Reopen" : "Mark reached"}
                            className="-m-3 flex h-11 w-11 items-center justify-center"
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors ${
                                isDone ? "border-primary bg-primary text-white" : "border-control bg-surface text-muted hover:border-primary [&>svg]:opacity-0 hover:[&>svg]:opacity-100"
                              }`}
                            >
                              <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                            </span>
                          </button>
                        </form>
                      ) : null}
                      <p className={`min-w-0 flex-1 truncate ${isDone ? "text-muted" : ""}`}>{m.name}</p>
                      <span className={`num flex-none text-xs ${isLate ? "font-medium text-negative" : "text-muted"}`}>
                        {isDone ? "Reached" : isLate ? formatDue(m.dueDate) : formatDate(m.dueDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty mx-5 mb-4 mt-2">No milestones yet.</p>
            )}
            {canEdit ? (
              <div className="border-t border-border bg-ground/60 p-5">
                <ActionForm action={addMilestone} submitLabel="Add milestone" pendingLabel="Adding…" primary={false} className="space-y-3">
                  <input type="hidden" name="projectId" value={project.id} />
                  <div>
                    <label htmlFor="ms-name" className="field-label">New milestone</label>
                    <input id="ms-name" name="name" required autoComplete="off" className="field" />
                  </div>
                  <div>
                    <label htmlFor="ms-due" className="field-label">Date</label>
                    <input id="ms-due" name="dueDate" type="date" required className="field" />
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </section>

          {canEdit ? (
            <section className="card p-5" aria-labelledby="firm-title">
              <h2 id="firm-title" className="card-title mb-1">Firm</h2>
              <p className="mb-4 text-muted">
                {project.firmName ? `Done for ${project.firmName}; it shows on their page.` : "A direct client. Pick the contractor or PMC if you did it for one."}
              </p>
              <ActionForm key={project.firmId ?? "none"} action={setProjectFirm} submitLabel="Save" pendingLabel="Saving…" primary={false} className="space-y-3">
                <input type="hidden" name="projectId" value={project.id} />
                <div>
                  <label htmlFor="project-firm" className="sr-only">Firm</label>
                  <select id="project-firm" name="firmId" defaultValue={project.firmId ?? ""} className="field">
                    <option value="">No firm, a direct client</option>
                    {firms.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            </section>
          ) : null}

          <section className="card" aria-labelledby="team-title">
            <h2 id="team-title" className="card-title px-5 pb-2 pt-4">Team</h2>
            <ul>
              {members.map((m) => (
                <li key={m.id} className="flex min-h-12 items-center gap-3 border-t border-rule px-5 py-2 first:border-t-0">
                  <Avatar name={m.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.name}</p>
                    <p className="truncate text-xs leading-4 text-muted">
                      {m.id === project.leadId ? "Project lead" : (m.title ?? m.roleName)}
                    </p>
                  </div>
                  {canEdit && m.id !== project.leadId ? (
                    <form action={removeMember}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="userId" value={m.id} />
                      <button type="submit" aria-label={`Remove ${m.name} from the team`} title="Remove from team" className="btn btn-quiet -mr-2.5 h-9 w-9 p-0 text-muted">
                        <X size={16} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit && staff.length > 0 ? (
              <form action={addMember} className="flex items-end gap-3 border-t border-border bg-ground/60 p-5">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="min-w-0 flex-1">
                  <label htmlFor="member" className="field-label">Add to team</label>
                  <select id="member" name="userId" className="field">
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.roleName})</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary h-10 md:h-9">Add</button>
              </form>
            ) : null}
          </section>

          {canEdit ? (
            <section className="card p-5" aria-labelledby="delete-project-title">
              <h2 id="delete-project-title" className="card-title mb-1">Delete project</h2>
              <p className="mb-4 text-muted">
                The project and everything in it go to the recycle bin in Settings, and can be restored from there. Projects with invoices or purchase orders can&rsquo;t be deleted.
              </p>
              <ActionForm action={deleteProject} submitLabel="Move to recycle bin" pendingLabel="Moving…" primary={false} className="space-y-3">
                <input type="hidden" name="projectId" value={project.id} />
                <div>
                  <label htmlFor="confirm-name" className="field-label">Type <span className="font-semibold">{project.name}</span> to confirm</label>
                  <input id="confirm-name" name="confirm" required autoComplete="off" spellCheck={false} className="field" />
                </div>
              </ActionForm>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
