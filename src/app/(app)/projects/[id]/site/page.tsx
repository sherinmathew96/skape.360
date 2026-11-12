import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Camera, ClipboardList, HardHat, Plus } from "lucide-react";
import { StatGrid } from "@/components/stat-grid";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseList } from "@/components/expense-list";
import { listExpenses } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
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
  // Site expenses: the team logs petty cash here; finance sees everyone's, others their own.
  const canSpend = can(user.role, "expense.add") && (can(user.role, "finance.manage") || (await isProjectMember(user.id, project.id)));
  const allExpenses = canSpend || can(user.role, "finance.view") ? await listExpenses({ projectId: project.id }) : [];
  const expenses = can(user.role, "finance.view") ? allExpenses : allExpenses.filter((e) => e.recordedBy === user.id);
  const monthStart = today().slice(0, 7) + "-01";
  const monthSpend = expenses.filter((e) => e.spentOn >= monthStart).reduce((n, e) => n + toPaise(e.amount), 0);

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

      <StatGrid
        className="mb-3"
        stats={[
          { label: "Reports in 7 days", value: `${thisWeek.length} of 7`, icon: ClipboardList },
          { label: "Worker-days in 7 days", value: manDays, icon: HardHat },
          { label: "Days with issues", value: withIssues, icon: AlertTriangle, bad: withIssues > 0 },
        ]}
      />

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

      {canSpend || expenses.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="card" aria-labelledby="site-exp-title">
            <div className="px-5 pb-2 pt-4">
              <h2 id="site-exp-title" className="card-title">Site expenses</h2>
              <p className="num text-muted">{formatINR(monthSpend)} this month{can(user.role, "finance.view") ? "" : ", entered by you"}</p>
            </div>
            {expenses.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">No expenses yet. Log petty cash, labour wages or transport with the receipt.</p>
            ) : (
              <ExpenseList expenses={expenses.slice(0, 12)} user={user} showProject={false} />
            )}
          </section>
          {canSpend ? (
            <section className="card p-5" aria-labelledby="site-exp-add">
              <h2 id="site-exp-add" className="card-title mb-4">Log an expense</h2>
              <ExpenseForm projectId={project.id} allowOverhead={false} today={t} />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
