import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DayBookView } from "@/components/day-book-view";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Day book" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> };

/** A construction project's day book: money in and out on site, day by day. */
export default async function ProjectDayBookPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  // Design-only projects have no site money to track.
  if (project.type === "design") redirect(`/projects/${project.id}`);
  const member = await isProjectMember(user.id, project.id);
  if (!member && !can(user, "finance.view")) redirect(`/projects/${project.id}`);
  const canWrite = can(user, "finance.manage") || (can(user, "expense.add") && member);

  const t = today();
  const asked = (await searchParams).month ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) && asked <= t.slice(0, 7) ? asked : t.slice(0, 7);

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} subtitle="Day book: money in and out on this project, day by day" />
      <DayBookView user={user} projectId={project.id} month={month} basePath={`/projects/${project.id}/daybook`} canWrite={canWrite} today={t} />
    </div>
  );
}
