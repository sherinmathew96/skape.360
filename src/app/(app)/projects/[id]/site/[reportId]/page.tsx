import { deleteReport } from "@/app/site-actions";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { removeReportPhoto } from "@/app/site-actions";
import { ProjectHeader } from "@/components/project-header";
import { ReportForm } from "@/components/report-form";
import { ReportPhotoUpload } from "@/components/report-photos";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { COMMON_TRADES, getReport, labourTotal, WEATHER_LABEL } from "@/lib/site";

export const metadata: Metadata = { title: "Site report" };

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

type Props = { params: Promise<{ id: string; reportId: string }>; searchParams: Promise<{ edit?: string }> };

export default async function ReportPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const { id, reportId } = await params;
  const project = await visibleProject(user, id);
  if (!project) notFound();
  const found = await getReport(project.id, reportId);
  if (!found) notFound();
  const { report, photos } = found;
  const canWrite = can(user, "site.report");
  const editing = canWrite && (await searchParams).edit === "1";
  const base = `/projects/${project.id}/site/${report.id}`;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        crumbs={[{ href: `/projects/${project.id}/site`, label: "Site" }]}
        subtitle={`Site report, ${longDate.format(new Date(`${report.date}T00:00:00Z`))}`}
        actions={
          canWrite && !editing ? (
            <Link href={`${base}?edit=1`} className="btn btn-secondary">
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Edit
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {editing ? (
          <section className="card p-5" aria-label="Edit report">
            <ReportForm
              projectId={project.id}
              commonTrades={COMMON_TRADES}
              initial={{
                reportId: report.id,
                date: report.date,
                weather: report.weather,
                labour: report.labour,
                workDone: report.workDone,
                issues: report.issues ?? "",
                clientVisible: report.clientVisible,
              }}
            />
            <Link href={base} className="mt-3 inline-block text-muted hover:text-text hover:underline">Cancel</Link>
            <form action={deleteReport} className="mt-6 border-t border-rule pt-5">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="reportId" value={report.id} />
              <p className="mb-3 text-sm text-muted">Delete this report: it goes to the recycle bin in Settings and can be restored from there.</p>
              <ConfirmButton message="Move this site report and its photos to the recycle bin?">Delete report</ConfirmButton>
            </form>
          </section>
        ) : (
          <section className="card" aria-labelledby="work-title">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 pb-2 pt-4">
              <h2 id="work-title" className="card-title">Work done</h2>
              <p className="text-xs text-muted">
                {WEATHER_LABEL[report.weather]}
                {report.authorName ? ` · by ${report.authorName}` : ""}
                {report.clientVisible ? " · client can see" : ""}
              </p>
            </div>
            <p className="whitespace-pre-line px-5 pb-4 text-base leading-6">{report.workDone}</p>
            {report.issues ? (
              <div className="mx-5 mb-4 rounded-md bg-[#fff5f4] px-4 py-3">
                <h3 className="font-medium text-negative">Issues and delays</h3>
                <p className="mt-1 whitespace-pre-line">{report.issues}</p>
              </div>
            ) : null}

            <h3 className="border-t border-rule px-5 pb-2 pt-4 font-medium">Photos</h3>
            {photos.length > 0 ? (
              <ul className="grid grid-cols-2 gap-1 px-5 pb-5 sm:grid-cols-3">
                {photos.map((p, i) => (
                  <li key={p.id} className="relative">
                    <a href={`/api/files/${p.fileId}`} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/files/${p.fileId}`}
                        alt={`Site photo ${i + 1}, ${formatDate(report.date)}`}
                        loading="lazy"
                        width={600}
                        height={450}
                        className="aspect-[4/3] w-full rounded-[4px] bg-raised object-cover"
                      />
                    </a>
                    {canWrite ? (
                      <form action={removeReportPhoto} className="absolute right-1 top-1">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="reportId" value={report.id} />
                        <input type="hidden" name="photoId" value={p.id} />
                        <button type="submit" aria-label={`Remove photo ${i + 1}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                          <X size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty mx-5 mb-5">No photos yet.</p>
            )}
            {canWrite ? (
              <div className="border-t border-border bg-ground/60 p-5">
                <ReportPhotoUpload projectId={project.id} reportId={report.id} />
              </div>
            ) : null}
          </section>
        )}

        <section className="card" aria-labelledby="labour-title">
          <h2 id="labour-title" className="card-title flex items-baseline justify-between px-5 pb-2 pt-4">
            Labour <span className="num text-sm font-normal text-muted">{labourTotal(report.labour)} on site</span>
          </h2>
          {report.labour.length > 0 ? (
            <ul className="pb-2">
              {report.labour.map((l) => (
                <li key={l.trade} className="flex justify-between border-t border-rule px-5 py-2.5 first:border-t-0">
                  <span>{l.trade}</span>
                  <span className="num">{l.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty mx-5 mb-5 mt-2">No labour recorded.</p>
          )}
        </section>
      </div>
    </div>
  );
}
