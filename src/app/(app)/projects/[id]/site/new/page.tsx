import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectHeader } from "@/components/project-header";
import { ReportForm } from "@/components/report-form";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { COMMON_TRADES, reportOnDate } from "@/lib/site";

export const metadata: Metadata = { title: "New site report" };

export default async function NewReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  if (!can(user.role, "site.report")) redirect(`/projects/${project.id}/site`);

  // One report per day: open today's if it is already written.
  const existing = await reportOnDate(project.id, today());
  if (existing) redirect(`/projects/${project.id}/site/${existing}`);

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} crumbs={[{ href: `/projects/${project.id}/site`, label: "Site" }]} subtitle="New daily report. Add photos after saving." />
      <div className="card max-w-[640px] p-5">
        <ReportForm
          projectId={project.id}
          commonTrades={COMMON_TRADES}
          initial={{ date: today(), labour: [], workDone: "", issues: "", clientVisible: false }}
        />
      </div>
    </div>
  );
}
