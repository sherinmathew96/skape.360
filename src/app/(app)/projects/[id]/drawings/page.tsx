import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, FileText, MessageSquare } from "lucide-react";
import { NewDrawing, StatusSelect } from "@/components/drawing-upload";
import { STATUS_ORDER, StatusChip } from "@/components/drawing-status";
import { GroupControls, RowOrder } from "@/components/group-controls";
import { DrawingVisualsButton } from "@/components/drawing-visuals";
import { ProjectHeader } from "@/components/project-header";
import { DrawingRowActions, GroupCard } from "@/components/register-controls";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { DISCIPLINE_LABEL, groupRegister, listDrawings, listGroups, projectTeam, revLabel } from "@/lib/drawings";
import { can } from "@/lib/permissions";
import { listModels, listTours } from "@/lib/studio";
import { drawingVisuals, NO_VISUALS } from "@/lib/visuals";
import { awaitingReply } from "@/lib/comments";

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
  const edit = can(user, "studio.manage") || can(user, "projects.edit") || member;
  // Uploading and linking 3D, 360° and renders needs studio rights.
  const studio = can(user, "studio.manage");
  const [visuals, allModels, allTours, waiting] = await Promise.all([
    drawingVisuals(drawings.map((d) => d.id)),
    listModels(project.id),
    listTours(project.id),
    awaitingReply(project.id),
  ]);
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
              return (
                <GroupCard
                  key={section.id ?? "general"}
                  projectId={project.id}
                  groupKey={section.id ?? "general"}
                  name={section.name}
                  count={section.drawings.length}
                  startOpen={sections.length === 1}
                  controls={
                    edit && section.id ? (
                      <GroupControls projectId={project.id} groupId={section.id} name={section.name} count={section.drawings.length} first={gi === 0} last={gi === groupIds.length - 1} />
                    ) : null
                  }
                >
                  {section.drawings.length === 0 ? (
                    <p className="border-t border-rule px-5 py-3 text-muted">No drawings in this group yet.</p>
                  ) : (
                    <>
                      <div
                        aria-hidden="true"
                        className={`hidden gap-x-3 border-t border-rule px-5 py-2 text-xs text-muted md:grid ${
                          edit ? "grid-cols-[56px_minmax(0,1fr)_44px_190px_120px_64px] xl:grid-cols-[56px_minmax(0,1fr)_44px_190px_120px_56px_64px]" : "grid-cols-[minmax(0,1fr)_44px_190px_120px] xl:grid-cols-[minmax(0,1fr)_44px_190px_120px_56px]"
                        }`}
                      >
                        {edit ? <span /> : null}
                        <span>Drawing</span>
                        <span className="text-right">Rev</span>
                        <span>Status</span>
                        <span>3D · 360° · Renders</span>
                        <span className="hidden text-right xl:block">Updated</span>
                        {edit ? <span /> : null}
                      </div>
                      <ul>
                        {section.drawings.map((d, i) => {
                          const name = d.number ? `${d.number} ${d.title}` : d.title;
                          return (
                            <li
                              key={d.id}
                              className={`grid items-center gap-x-3 gap-y-2 border-t border-rule px-5 py-2.5 ${
                                edit
                                  ? "grid-cols-[56px_minmax(0,1fr)] md:grid-cols-[56px_minmax(0,1fr)_44px_190px_120px_64px] xl:grid-cols-[56px_minmax(0,1fr)_44px_190px_120px_56px_64px]"
                                  : "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_44px_190px_120px] xl:grid-cols-[minmax(0,1fr)_44px_190px_120px_56px]"
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
                                  {waiting.get(d.id) ? (
                                    <span className="num inline-flex flex-none items-center gap-1 rounded-full bg-[#fdebdc] px-1.5 py-0.5 text-[11px] font-medium text-[#7a3608]" title="Client comments waiting for a reply">
                                      <MessageSquare size={11} strokeWidth={2} aria-hidden="true" />
                                      {waiting.get(d.id)}
                                      <span className="sr-only"> client comments waiting for a reply</span>
                                    </span>
                                  ) : null}
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
                              <span className={`min-w-0 ${edit ? "col-start-2 md:col-start-auto" : ""}`}>
                                <DrawingVisualsButton
                                  projectId={project.id}
                                  drawing={{ id: d.id, title: name }}
                                  models={(visuals.get(d.id) ?? NO_VISUALS).models.map((m) => ({ id: m.id, title: m.title }))}
                                  tours={(visuals.get(d.id) ?? NO_VISUALS).tours.map((x) => ({ id: x.id, title: x.title, scenes: x.scenes.length }))}
                                  renders={(visuals.get(d.id) ?? NO_VISUALS).renders}
                                  allModels={allModels.map((m) => ({ id: m.id, title: m.title }))}
                                  allTours={allTours.filter((x) => x.scenes > 0).map((x) => ({ id: x.id, title: x.title }))}
                                  canEdit={studio}
                                />
                              </span>
                              <span className="num hidden text-right text-xs text-muted xl:block">{dateFmt.format(d.statusChangedAt)}</span>
                              {edit ? (
                                <span className="col-start-2 md:col-start-auto">
                                  <DrawingRowActions
                                    projectId={project.id}
                                    drawing={{ id: d.id, title: d.title, number: d.number, groupId: d.groupId, discipline: d.discipline, assigneeId: d.assigneeId, clientVisible: d.clientVisible }}
                                    groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                                    team={team}
                                    disciplineLabel={DISCIPLINE_LABEL}
                                  />
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </GroupCard>
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
