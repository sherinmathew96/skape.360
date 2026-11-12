import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Plus } from "lucide-react";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { addDays, formatDate, today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { labourTotal, listReports, WEATHER_LABEL } from "@/lib/site";

export const metadata: Metadata = { title: "Site" };

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  const reports = await listReports(project.id);
  const canWrite = can(user.role, "site.report");

  const t = today();
  const todays = reports.find((r) => r.date === t);
  const weekStart = addDays(t, -6);
  const thisWeek = reports.filter((r) => r.date >= weekStart);
  const manDays = thisWeek.reduce((n, r) => n + labourTotal(r.labour), 0);
  const withIssues = thisWeek.filter((r) => r.issues).length;

  const action = canWrite ? (
    todays ? (
      <Link href={`/projects/${project.id}/site/${todays.id}`} className="btn btn-secondary">Open today&rsquo;s report</Link>
    ) : (
      <Link href={`/projects/${project.id}/site/new`} className="btn btn-primary">
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Today&rsquo;s report
      </Link>
    )
  ) : null;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        subtitle={todays ? "Today's report is in." : reports.length ? `No report yet today. Last one ${formatDate(reports[0].date)}.` : "No site reports yet."}
        actions={action}
      />

      <dl className="card mb-3 grid grid-cols-3">
        {[
          ["Reports in 7 days", `${thisWeek.length} of 7`],
          ["Worker-days in 7 days", String(manDays)],
          ["Days with issues", String(withIssues)],
        ].map(([label, value], i) => (
          <div key={label} className={`px-4 py-3 md:px-5 md:py-4 ${i > 0 ? "border-l border-rule" : ""}`}>
            <dt className="text-xs text-muted md:text-sm">{label}</dt>
            <dd className={`num mt-1 text-xl md:text-[30px] md:leading-9 ${label === "Days with issues" && withIssues > 0 ? "text-negative" : ""}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="card" aria-labelledby="reports-title">
        <h2 id="reports-title" className="card-title px-5 pb-2 pt-4">Daily reports</h2>
        {reports.length === 0 ? (
          <p className="empty mx-5 mb-5 mt-2">
            {canWrite ? "No reports yet. Write today's from the site with Today's report." : "No reports yet. Site engineers write them each day."}
          </p>
        ) : (
          <ul>
            {reports.map((r) => (
              <li key={r.id} className="border-t border-rule first:border-t-0">
                <Link
                  href={`/projects/${project.id}/site/${r.id}`}
                  className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-x-4 px-5 py-3 transition-colors hover:bg-ground"
                >
                  <span className="num leading-5">
                    <span className="block font-medium">{formatDate(r.date)}</span>
                    <span className="block text-xs text-muted">{weekday.format(new Date(`${r.date}T00:00:00Z`))}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2">{r.workDone}</span>
                    <span className="mt-0.5 block truncate text-xs leading-4 text-muted">
                      {[WEATHER_LABEL[r.weather], r.authorName, r.clientVisible ? "Client can see" : null].filter(Boolean).join(" · ")}
                      {r.issues ? <span className="text-negative"> · Issue noted</span> : null}
                    </span>
                  </span>
                  <span className="num text-right text-xs leading-5 text-muted">
                    <span className="block text-sm text-text">{labourTotal(r.labour)} on site</span>
                    {r.photos > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Camera size={12} strokeWidth={1.5} aria-hidden="true" /> {r.photos}
                      </span>
                    ) : (
                      "No photos"
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
