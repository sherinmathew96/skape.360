import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowDown, ArrowUp, CircleAlert, Plus } from "lucide-react";
import { deleteSection, deleteWork, moveSection, moveWork, setWorkStatus } from "@/app/works-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { ProjectHeader } from "@/components/project-header";
import { ProgressRing, SectionBars, StatusSplit, WorkSequence, WorksGantt, WorkStatusPill } from "@/components/works-charts";
import { AddHeadingForm, AddSubWorkForm, BoqImport, RenameSectionForm, WorkEditor } from "@/components/works-forms";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { today as todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { listWorks, summariseWorks, type WorkRow } from "@/lib/works";

export const metadata: Metadata = { title: "Timeline" };

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const d = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

function MoveButtons({ action, hidden, first, last, what }: { action: (f: FormData) => Promise<void>; hidden: Record<string, string>; first: boolean; last: boolean; what: string }) {
  return (
    <span className="flex flex-none gap-1">
      {(["up", "down"] as const).map((dir) => (
        <form key={dir} action={action}>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="dir" value={dir} />
          <button
            type="submit"
            disabled={dir === "up" ? first : last}
            className="btn btn-quiet h-9 w-9 p-0 text-muted disabled:opacity-30"
            aria-label={`Move ${what} ${dir}`}
          >
            {dir === "up" ? <ArrowUp size={16} strokeWidth={1.8} aria-hidden="true" /> : <ArrowDown size={16} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        </form>
      ))}
    </span>
  );
}

function StatusButton({ id, status, label, primary }: { id: string; status: string; label: string; primary?: boolean }) {
  return (
    <form action={setWorkStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`btn h-9 px-3 text-sm ${primary ? "btn-primary" : "btn-secondary"}`}>{label}</button>
    </form>
  );
}

const summaryCls = "inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden";

/**
 * A construction project's works: main works (1. Excavation) with their sub
 * works (1.1, 1.2…) in the order they are done. Each sub work is marked
 * started, then completed; progress counts the sub works completed.
 */
export default async function ProjectTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  if (project.type === "design") redirect(`/projects/${project.id}`);
  const member = await isProjectMember(user.id, project.id);
  const canWrite = can(user, "projects.edit") || (can(user, "site.report") && member);
  const today = todayIso();

  const works = await listWorks(project.id);
  const sum = summariseWorks(works);
  const late = sum.late(today);
  const sectionNames = sum.sections.map((s) => s.name);

  const row = (w: WorkRow, num: string, i: number, list: WorkRow[]) => {
    const isLate = w.status !== "done" && w.plannedEnd && w.plannedEnd < today;
    const meta = [
      w.plannedStart || w.plannedEnd ? `Planned ${w.plannedStart ? d(w.plannedStart) : "…"} – ${w.plannedEnd ? d(w.plannedEnd) : "…"}` : null,
      w.startedOn ? `Started ${d(w.startedOn)}` : null,
      w.completedOn ? `Done ${d(w.completedOn)}` : null,
    ].filter(Boolean);
    return (
      <li key={w.id} className="border-t border-rule py-4 pl-5 pr-5 md:pl-6 md:pr-6">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <span className="num w-10 flex-none pt-0.5 text-sm font-medium text-muted">{num}</span>
          <div className="min-w-0 flex-1 basis-[220px]">
            <p className="line-clamp-2 leading-6" title={w.title}>{w.title}</p>
            {meta.length || isLate ? (
              <p className="mt-1 text-xs text-muted">
                {meta.join(" · ")}
                {isLate ? (
                  <span className="ml-1 inline-flex items-center gap-1 font-medium text-negative">
                    <CircleAlert size={12} strokeWidth={2} aria-hidden="true" />
                    Past planned finish
                  </span>
                ) : null}
              </p>
            ) : null}
            {w.note ? <p className="mt-1 text-xs italic text-muted">{w.note}</p> : null}
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2">
            <WorkStatusPill status={w.status} />
            {canWrite && w.status === "pending" ? <StatusButton id={w.id} status="started" label="Mark started" /> : null}
            {canWrite && w.status === "started" ? <StatusButton id={w.id} status="done" label="Mark completed" primary /> : null}
          </div>
        </div>
        {canWrite ? (
          <details className="mt-2 pl-14">
            <summary className={summaryCls}>Edit</summary>
            <div className="mt-3 grid gap-4 rounded-md bg-ground p-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <WorkEditor work={w} sections={sectionNames} today={today} />
              <div className="flex flex-wrap content-start items-center gap-2 md:flex-col md:items-end">
                <MoveButtons action={moveWork} hidden={{ id: w.id }} first={i === 0} last={i === list.length - 1} what="sub work" />
                {w.status !== "pending" ? <StatusButton id={w.id} status={w.status === "done" ? "started" : "pending"} label={w.status === "done" ? "Reopen" : "Not started"} /> : null}
                <form action={deleteWork}>
                  <input type="hidden" name="id" value={w.id} />
                  <ConfirmButton message={`Remove “${w.title.slice(0, 60)}” from the timeline?`}>Remove</ConfirmButton>
                </form>
              </div>
            </div>
          </details>
        ) : null}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} subtitle="Timeline: main works and their sub works, in the order they are done" />

      {works.length === 0 ? (
        canWrite ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <section className="card p-6" aria-labelledby="add-title">
              <h2 id="add-title" className="card-title">Add the first main work</h2>
              <p className="mb-4 mt-1 text-sm text-muted">For example 1. Excavation, with 1.1 Excavation for footing and 1.2 Excavation for plinth beam.</p>
              <AddHeadingForm projectId={project.id} next={1} />
            </section>
            <section className="card p-6" aria-labelledby="start-title">
              <h2 id="start-title" className="card-title">Or start from the BOQ</h2>
              <p className="mb-4 mt-1 text-sm text-muted">Upload the BOQ as Excel or PDF. Each head becomes a main work and its items sub works; quantities and rates are left out.</p>
              <BoqImport projectId={project.id} hasWorks={false} canReplace={false} />
            </section>
          </div>
        ) : (
          <section className="card p-6">
            <p className="empty">No works on the timeline yet.</p>
          </section>
        )
      ) : (
        <>
          <section className="card mb-6 grid grid-cols-1 gap-8 p-6 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]" aria-labelledby="progress-title">
            <h2 id="progress-title" className="sr-only">Progress</h2>
            <div className="flex flex-col items-center gap-2">
              <ProgressRing pct={sum.pct} caption="complete" />
              <p className="max-w-[180px] text-center text-xs text-muted">Sub works completed</p>
            </div>
            <div className="min-w-0 space-y-5">
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs text-muted">Completed</dt>
                  <dd className="num text-xl font-semibold">
                    {sum.done}
                    <span className="text-sm font-normal text-muted">/{sum.total}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">In progress</dt>
                  <dd className="num text-xl font-semibold">{sum.started}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Running late</dt>
                  <dd className={`num text-xl font-semibold ${late.length ? "text-negative" : ""}`}>{late.length}</dd>
                </div>
              </dl>
              <StatusSplit summary={sum} />
              {sum.current.length ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">On site now</p>
                  <ul className="space-y-1 text-sm">
                    {sum.current.slice(0, 4).map((w) => (
                      <li key={w.id} className="truncate">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#f0a020]" aria-hidden="true" />
                        {w.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 md:col-span-2 lg:col-span-1">
              <p className="mb-3 text-sm font-semibold">By main work</p>
              <SectionBars sections={sum.sections} />
            </div>
          </section>

          <section className="card mb-6 p-6" aria-labelledby="order-title">
            <h2 id="order-title" className="card-title mb-4">Order of work</h2>
            <WorkSequence sections={sum.sections} />
          </section>

          <section className="card mb-6 p-6" aria-labelledby="gantt-title">
            <h2 id="gantt-title" className="card-title mb-4">Timeline</h2>
            {works.some((w) => w.plannedStart || w.startedOn || w.completedOn) ? (
              <WorksGantt sections={sum.sections} today={today} />
            ) : (
              <p className="empty">Add planned dates to the sub works (Edit on each), or mark them started, and they appear here on a timeline.</p>
            )}
          </section>

          <div className={`grid grid-cols-1 items-start gap-6 ${canWrite ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
            <div className="grid min-w-0 grid-cols-1 gap-6">
              {sum.sections.map((sec, si) => (
                <section key={sec.name} className="card overflow-hidden" aria-labelledby={`sec-${si}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-4 pt-5 md:px-6">
                    <div className="min-w-0">
                      <h2 id={`sec-${si}`} className="card-title">
                        <span className="num mr-2">{si + 1}.</span>
                        {sec.name}
                      </h2>
                      <p className="num text-xs text-muted">
                        {sec.done} of {sec.works.length} sub {sec.works.length === 1 ? "work" : "works"} completed · {Math.floor(sec.pct)}%
                        {sec.started ? ` · ${sec.started} in progress` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <WorkStatusPill status={sec.status} />
                      {canWrite ? (
                        <MoveButtons action={moveSection} hidden={{ projectId: project.id, section: sec.name }} first={si === 0} last={si === sum.sections.length - 1} what="main work" />
                      ) : null}
                    </div>
                  </div>
                  <div className="mx-5 mb-4 h-1.5 overflow-hidden rounded-full bg-raised md:mx-6" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${sec.pct}%`, background: sec.status === "done" ? "#00b087" : "var(--primary)" }} />
                  </div>
                  <ol>{sec.works.map((w, i, list) => row(w, `${si + 1}.${i + 1}`, i, list))}</ol>
                  {canWrite ? (
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-rule px-5 py-4 md:px-6">
                      <details className="min-w-0 flex-1 basis-full">
                        <summary className={summaryCls}>
                          <Plus size={16} strokeWidth={2} aria-hidden="true" />
                          Add sub work {si + 1}.{sec.works.length + 1}
                        </summary>
                        <div className="mt-3 rounded-md bg-ground p-4">
                          <AddSubWorkForm projectId={project.id} section={sec.name} next={`${si + 1}.${sec.works.length + 1}`} />
                        </div>
                      </details>
                      <details className="min-w-0 flex-1 basis-full">
                        <summary className={`${summaryCls} text-muted`}>Rename or remove {sec.name}</summary>
                        <div className="mt-3 space-y-4 rounded-md bg-ground p-4">
                          <RenameSectionForm projectId={project.id} section={sec.name} index={si} />
                          <form action={deleteSection}>
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="section" value={sec.name} />
                            <ConfirmButton message={`Remove “${sec.name}” and its ${sec.works.length} sub works from the timeline?`}>
                              Remove main work and its sub works
                            </ConfirmButton>
                          </form>
                        </div>
                      </details>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>

            {canWrite ? (
              <div className="grid min-w-0 grid-cols-1 gap-6">
                <section className="card p-6" aria-labelledby="add-title">
                  <h2 id="add-title" className="card-title mb-4">Add a main work</h2>
                  <AddHeadingForm projectId={project.id} next={sum.sections.length + 1} />
                </section>
                <section className="card p-6" aria-labelledby="import-title">
                  <h2 id="import-title" className="card-title mb-4">Add from a BOQ</h2>
                  <BoqImport projectId={project.id} hasWorks canReplace={can(user, "projects.edit")} />
                </section>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
