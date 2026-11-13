import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { ProgressRing, SectionBars, StatusSplit, WorkSequence, WorksGantt, WORK_STATUS } from "@/components/works-charts";
import { today as todayIso } from "@/lib/dates";
import { loadPortal, portalContent } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }> };

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const d = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · Timeline` : "Studio Skape" }, robots: { index: false, follow: false } };
}

/** The client's view of the works: how far along, what is on site now, and what comes next. No rates. */
export default async function PortalTimeline({ params }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal) notFound();
  const { progress } = await portalContent(portal);
  if (!progress) notFound();
  const today = todayIso();
  const dated = progress.sections.some((s) => s.plannedStart || s.startedOn);

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="mb-3">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Timeline</h1>
        <p className="mt-1 text-muted">The main works on site and their sub works, in the order they are done.</p>
      </div>

      <section className="card grid grid-cols-1 gap-8 p-6 md:grid-cols-[auto_minmax(0,1fr)]" aria-labelledby="progress-title">
        <h2 id="progress-title" className="sr-only">Progress</h2>
        <div className="flex justify-center">
          <ProgressRing pct={progress.pct} caption="complete" />
        </div>
        <div className="min-w-0 space-y-5">
          <StatusSplit summary={progress} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">On site now</p>
              {progress.current.length ? (
                <ul className="space-y-1.5 text-sm">
                  {progress.current.slice(0, 5).map((w) => (
                    <li key={w.id} className="flex gap-2">
                      <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: WORK_STATUS.started.color }} aria-hidden="true" />
                      <span className="line-clamp-2">{w.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing running right now.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Up next</p>
              {progress.next.length ? (
                <ul className="space-y-1.5 text-sm">
                  {progress.next.map((w) => (
                    <li key={w.id} className="flex gap-2">
                      <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#d4d7e5]" aria-hidden="true" />
                      <span className="line-clamp-2">{w.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Every work has started.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card p-6" aria-labelledby="order-title">
        <h2 id="order-title" className="card-title mb-4">Order of work</h2>
        <WorkSequence sections={progress.sections} />
      </section>

      <div className={`grid grid-cols-1 items-start gap-3 ${dated ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        {dated ? (
          <section className="card min-w-0 p-6" aria-labelledby="gantt-title">
            <h2 id="gantt-title" className="card-title mb-4">Schedule</h2>
            <WorksGantt sections={progress.sections} today={today} />
          </section>
        ) : null}
        <section className="card min-w-0 p-6" aria-labelledby="sections-title">
          <h2 id="sections-title" className="card-title mb-4">By main work</h2>
          <SectionBars sections={progress.sections} />
        </section>
      </div>

      <section aria-labelledby="works-title" className="mt-3">
        <h2 id="works-title" className="card-title mb-3">All works</h2>
        <div className="grid grid-cols-1 gap-3">
          {progress.sections.map((sec, si) => (
            <details key={sec.name} className="card group overflow-hidden" open={sec.status === "started"}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    <span className="num mr-2">{si + 1}.</span>
                    {sec.name}
                  </span>
                  <span className="num block text-xs text-muted">
                    {sec.done} of {sec.works.length} sub {sec.works.length === 1 ? "work" : "works"} completed · {Math.floor(sec.pct)}%
                  </span>
                </span>
                <span className={WORK_STATUS[sec.status].pill}>{WORK_STATUS[sec.status].label}</span>
              </summary>
              <ol>
                {sec.works.map((w, i) => (
                  <li key={w.id} className="flex items-start gap-3 border-t border-rule px-5 py-3">
                    <span className="num w-8 flex-none pt-px text-xs font-medium text-muted">{si + 1}.{i + 1}</span>
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${w.status === "done" ? "border-transparent text-white" : ""}`}
                      style={w.status === "done" ? { background: WORK_STATUS.done.color } : { borderColor: WORK_STATUS[w.status].color }}
                      aria-label={WORK_STATUS[w.status].label}
                    >
                      {w.status === "done" ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-5">{w.title}</span>
                      <span className="block text-xs text-muted">
                        {w.completedOn ? `Completed ${d(w.completedOn)}` : w.startedOn ? `Started ${d(w.startedOn)}` : w.plannedStart ? `Planned from ${d(w.plannedStart)}` : "Not started"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
