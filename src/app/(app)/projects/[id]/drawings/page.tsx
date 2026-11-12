import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, FileText } from "lucide-react";
import { NewDrawing, StatusSelect } from "@/components/drawing-upload";
import { STATUS_ORDER, StatusChip } from "@/components/drawing-status";
import { GroupControls, RowOrder } from "@/components/group-controls";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { DISCIPLINE_LABEL, groupRegister, listDrawings, listGroups, projectTeam, revLabel } from "@/lib/drawings";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Drawings" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  const [drawings, groups, team, member] = await Promise.all([
    listDrawings(project.id),
    listGroups(project.id),
    projectTeam(project.id),
    isProjectMember(user.id, project.id),
  ]);
  const edit = can(user.role, "studio.manage") || can(user.role, "projects.edit") || member;
  const sections = groupRegister(groups, drawings);
  // Real groups, in order, so the arrows know which is first and last.
  const groupIds = groups.map((g) => g.id);

  const counts = STATUS_ORDER.map((st) => ({ st, n: drawings.filter((d) => d.status === st).length })).filter((c) => c.n > 0);
  const subtitle = `${drawings.length} ${drawings.length === 1 ? "drawing" : "drawings"}${groups.length ? ` in ${groups.length + (sections[0]?.id === null ? 1 : 0)} groups` : ""}`;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} subtitle={subtitle} />

      {counts.length ? (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Drawings by status">
          {counts.map(({ st, n }) => (
            <li key={st} className="flex items-center gap-2 rounded-md border border-border bg-surface py-1 pl-1 pr-3">
              <StatusChip status={st} />
              <span className="num font-medium">{n}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={`grid grid-cols-1 items-start gap-3 ${edit ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <div className="grid min-w-0 grid-cols-1 gap-3">
          {sections.length === 0 ? (
            <section className="card p-5">
              <h2 className="card-title mb-2">Drawing register</h2>
              <p className="empty">
                No drawings yet.
                {edit ? " Add each sheet you plan to issue, with its status. Group them by area, such as General drawings or Room 01, and attach the PDF when it is ready." : ""}
              </p>
            </section>
          ) : (
            sections.map((section) => {
              const gi = section.id ? groupIds.indexOf(section.id) : -1;
              const headingId = `group-${section.id ?? "general"}`;
              return (
                <section key={section.id ?? "general"} className="card" aria-labelledby={headingId}>
                  <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
                    <h2 id={headingId} className="card-title min-w-0 truncate">
                      {section.name}
                      <span className="ml-2 text-sm font-normal text-muted">{section.drawings.length}</span>
                    </h2>
                    {edit && section.id ? (
                      <GroupControls projectId={project.id} groupId={section.id} name={section.name} first={gi === 0} last={gi === groupIds.length - 1} />
                    ) : null}
                  </div>
                  {section.drawings.length === 0 ? (
                    <p className="border-t border-rule px-5 py-3 text-muted">No drawings in this group yet.</p>
                  ) : (
                    <>
                      <div
                        aria-hidden="true"
                        className={`hidden gap-x-3 border-t border-rule px-5 py-2 text-xs text-muted md:grid ${
                          edit ? "grid-cols-[56px_minmax(0,1fr)_44px_190px_64px]" : "grid-cols-[minmax(0,1fr)_44px_190px_64px]"
                        }`}
                      >
                        {edit ? <span /> : null}
                        <span>Drawing</span>
                        <span className="text-right">Rev</span>
                        <span>Status</span>
                        <span className="text-right">Updated</span>
                      </div>
                      <ul>
                        {section.drawings.map((d, i) => {
                          const name = d.number ? `${d.number} ${d.title}` : d.title;
                          return (
                            <li
                              key={d.id}
                              className={`grid items-center gap-x-3 gap-y-2 border-t border-rule px-5 py-2.5 ${
                                edit
                                  ? "grid-cols-[56px_minmax(0,1fr)] md:grid-cols-[56px_minmax(0,1fr)_44px_190px_64px]"
                                  : "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_44px_190px_64px]"
                              }`}
                            >
                              {edit ? (
                                <RowOrder projectId={project.id} drawingId={d.id} title={d.title} first={i === 0} last={i === section.drawings.length - 1} />
                              ) : null}
                              <Link href={`/projects/${project.id}/drawings/${d.id}`} className="group min-w-0">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {d.number ? <span className="flex-none font-mono text-xs text-muted">{d.number}</span> : null}
                                  <span className="truncate font-medium group-hover:underline">{d.title}</span>
                                  {d.latest ? <FileText size={14} strokeWidth={1.5} className="flex-none text-muted" aria-label="Has a drawing file" /> : null}
                                  {!d.clientVisible ? <EyeOff size={14} strokeWidth={1.5} className="flex-none text-muted" aria-label="Hidden from clients" /> : null}
                                </span>
                                <span className="block truncate text-xs leading-4 text-muted">
                                  {DISCIPLINE_LABEL[d.discipline]}
                                  {d.assigneeName ? ` · ${d.assigneeName}` : ""}
                                  <span className="md:hidden">
                                    {" · "}
                                    {d.latest ? revLabel(d.latest.rev) : "No file"} · {dateFmt.format(d.statusChangedAt)}
                                  </span>
                                </span>
                              </Link>
                              <span className="num hidden text-right font-mono text-xs md:block">{d.latest ? revLabel(d.latest.rev) : "–"}</span>
                              <span className={`min-w-0 ${edit ? "col-start-2 md:col-start-auto" : ""}`}>
                                {edit ? <StatusSelect key={d.status} projectId={project.id} drawingId={d.id} status={d.status} label={name} /> : <StatusChip status={d.status} />}
                              </span>
                              <span className="num hidden text-right text-xs text-muted md:block">{dateFmt.format(d.statusChangedAt)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </section>
              );
            })
          )}
          {drawings.length ? (
            <p className="px-1 text-xs text-muted">
              Share the register from Sharing → “Drawing register” so the client sees each drawing&rsquo;s status and its current revision.
              {drawings.some((d) => !d.clientVisible) ? " Drawings marked with a crossed-out eye are hidden from clients." : ""}
            </p>
          ) : null}
        </div>

        {edit ? (
          <section className="card p-5 lg:sticky lg:top-4" aria-labelledby="new-drawing-title">
            <h2 id="new-drawing-title" className="card-title mb-4">Add a drawing</h2>
            <NewDrawing projectId={project.id} groups={groups} team={team} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
