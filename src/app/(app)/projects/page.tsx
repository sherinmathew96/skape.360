import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { StageTrack, currentStage } from "@/components/stage-track";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim();
  const all = await listProjects(user);
  // The search in the top bar: name, client, code or place.
  const needle = q.toLowerCase();
  const projects = needle
    ? all.filter((p) => [p.name, p.clientName, p.code, p.location ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : all;
  const active = projects.filter((p) => p.status === "active").length;
  // One section per firm the studio designs for, then the studio's own clients.
  const firmGroups = new Map<string, { key: string; title: string; firmId: string | null; list: typeof projects }>();
  for (const p of projects) {
    const key = p.firmId ?? "direct";
    if (!firmGroups.has(key)) firmGroups.set(key, { key, title: p.firmName ?? "Direct clients", firmId: p.firmId, list: [] });
    firmGroups.get(key)!.list.push(p);
  }
  const groups = [...firmGroups.values()].sort((a, b) => (a.firmId === null ? 1 : b.firmId === null ? -1 : a.title.localeCompare(b.title)));
  const late = projects.reduce((n, p) => n + p.tasksOverdue, 0);
  const canCreate = can(user.role, "projects.create");

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Projects</h1>
          {q ? (
            <p className="mt-1 text-muted">
              {projects.length} {projects.length === 1 ? "match" : "matches"} for “{q}” ·{" "}
              <Link href="/projects" className="font-medium text-primary hover:underline">Show all</Link>
            </p>
          ) : (
            <p className="num mt-1 text-muted">
              {projects.length} {projects.length === 1 ? "project" : "projects"}, {active} active
              {late > 0 ? `, ${late} late ${late === 1 ? "task" : "tasks"}` : ""}
            </p>
          )}
        </div>
        {canCreate ? (
          <Link href="/projects/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            New project
          </Link>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="card p-5">
          <p className="empty">
            {q
              ? `No project matches “${q}”. Try the client's name or the project code.`
              : canCreate
              ? "No projects yet. Create the first one with New project."
              : "You are not on any project yet. A project manager adds you to a project's team."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              {groups.length > 1 ? (
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 px-1">
                  <h2 id={`group-${group.key}`} className="text-lg font-semibold tracking-[-0.01em]">
                    {group.title} <span className="num ml-1 text-sm font-normal text-muted">{group.list.length}</span>
                  </h2>
                  {group.firmId && canCreate ? (
                    <Link href={`/firms/${group.firmId}`} className="text-sm font-medium text-primary hover:underline">Firm page</Link>
                  ) : null}
                </div>
              ) : (
                <h2 id={`group-${group.key}`} className="sr-only">{group.title}</h2>
              )}
              {/* Phone and small tablet: two-line rows */}
              <ul className="card overflow-hidden lg:hidden">
                {group.list.map((p) => {
                  const stage = currentStage(p.stages);
                  return (
                    <li key={p.id} className="border-t border-rule first:border-t-0">
                      <Link href={`/projects/${p.id}`} className="block px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="num flex-none text-xs text-muted">{formatDate(p.dueDate)}</p>
                        </div>
                        <p className="mb-2 truncate text-xs leading-4 text-muted">
                          {p.clientName} · {PROJECT_TYPE_LABEL[p.type]}
                        </p>
                        <StageTrack stages={p.stages} />
                        <p className="mt-1.5 flex justify-between gap-3 text-xs leading-4 text-muted">
                          <span className="truncate text-text">{stage.name}</span>
                          <span className={`num flex-none ${p.tasksOverdue > 0 ? "text-negative" : ""}`}>
                            {p.tasksOpen} open{p.tasksOverdue > 0 ? `, ${p.tasksOverdue} late` : ""}
                          </span>
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: table */}
              <div className="card hidden overflow-hidden lg:block">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Client</th>
                      <th scope="col" className="w-[240px]">Stage</th>
                      <th scope="col">Lead</th>
                      <th scope="col" className="num">Open tasks</th>
                      <th scope="col" className="num">Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.list.map((p) => {
                      const stage = currentStage(p.stages);
                      return (
                        <tr key={p.id} className="transition-colors hover:bg-ground">
                          <td>
                            <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                            <p className="text-xs leading-4 text-muted">
                              <span className="font-mono">{p.code}</span> · {PROJECT_TYPE_LABEL[p.type]}
                            </p>
                          </td>
                          <td className="text-muted">{p.clientName}</td>
                          <td>
                            {p.status === "active" ? (
                              <>
                                <StageTrack stages={p.stages} />
                                <p className="mt-1.5 text-xs leading-4 text-muted">
                                  <span className="text-text">{stage.name}</span> · {stage.approved} of {stage.total}
                                </p>
                              </>
                            ) : (
                              <StatusPill status={p.status} />
                            )}
                          </td>
                          <td className="text-muted">{p.leadName ?? "–"}</td>
                          <td className="num">
                            {p.tasksOpen}
                            <p className={`text-xs leading-4 ${p.tasksOverdue > 0 ? "text-negative" : "text-muted"}`}>
                              {p.tasksOverdue > 0 ? `${p.tasksOverdue} late` : `${p.tasksDone} done`}
                            </p>
                          </td>
                          <td className="num text-muted">{formatDate(p.dueDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
