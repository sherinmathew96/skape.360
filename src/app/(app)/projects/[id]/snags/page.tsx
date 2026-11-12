import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { reviewSnag } from "@/app/site-actions";
import { ProjectHeader } from "@/components/project-header";
import { FixSnag, RaiseSnag } from "@/components/snag-forms";
import type { SnagStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { formatDate, formatDue, today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { listSnags, snagCode } from "@/lib/site";

export const metadata: Metadata = { title: "Snags" };

const STATUS_LABEL: Record<SnagStatus, string> = { open: "Open", fixed: "Fixed, to check", closed: "Closed" };
const STATUS_PILL: Record<SnagStatus, string> = { open: "pill-negative", fixed: "pill-warning", closed: "pill-positive" };
const FILTERS = [
  ["open", "Open"],
  ["fixed", "To check"],
  ["closed", "Closed"],
  ["all", "All"],
] as const;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> };

export default async function SnagsPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const found = await getProject(user, (await params).id);
  if (!found) notFound();
  const { project, members } = found;
  const snags = await listSnags(project.id);

  const wanted = (await searchParams).status;
  const filter = FILTERS.some(([v]) => v === wanted) ? (wanted as (typeof FILTERS)[number][0]) : "open";
  const shown = filter === "all" ? snags : snags.filter((sn) => sn.status === filter);
  const count = (st: SnagStatus) => snags.filter((sn) => sn.status === st).length;
  const t = today();
  const late = snags.filter((sn) => sn.status === "open" && sn.dueDate && sn.dueDate < t).length;

  const onTeam = members.some((m) => m.id === user.id);
  const canRaise = onTeam || can(user.role, "projects.edit");
  const base = `/projects/${project.id}/snags`;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        subtitle={`${count("open")} open${late ? `, ${late} past their fix date` : ""}, ${count("fixed")} waiting to be checked, ${count("closed")} closed`}
      />

      <div className={`grid grid-cols-1 items-start gap-3 ${canRaise ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <section className="card" aria-labelledby="snags-title">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 id="snags-title" className="card-title">Snag list</h2>
            <nav aria-label="Filter snags" className="flex rounded-md bg-raised p-1">
              {FILTERS.map(([value, label]) => (
                <Link
                  key={value}
                  href={value === "open" ? base : `${base}?status=${value}`}
                  aria-current={filter === value ? "page" : undefined}
                  className={`flex h-9 items-center rounded-[5px] px-3 md:h-7 ${filter === value ? "bg-surface font-medium" : "text-muted hover:text-text"}`}
                >
                  {label}
                  {value !== "all" ? <span className="num ml-1.5 text-xs text-muted">{count(value)}</span> : null}
                </Link>
              ))}
            </nav>
          </div>

          {shown.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">
              {filter === "open" ? "No open snags." : filter === "fixed" ? "Nothing waiting to be checked." : filter === "closed" ? "No closed snags yet." : "No snags raised yet."}
            </p>
          ) : (
            <ul>
              {shown.map((sn) => {
                const code = snagCode(sn.number);
                const isLate = sn.status === "open" && sn.dueDate !== null && sn.dueDate < t;
                const canFix = sn.status === "open" && (sn.assigneeId === user.id || can(user.role, "site.report") || can(user.role, "projects.edit"));
                const canReview = sn.status === "fixed" && (sn.createdBy === user.id || can(user.role, "projects.edit"));
                return (
                  <li key={sn.id} className="border-t border-rule px-5 py-4 first:border-t-0">
                    <div className="flex gap-3">
                      {sn.photoFileId ? (
                        <a href={`/api/files/${sn.photoFileId}`} target="_blank" rel="noreferrer" className="flex-none">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/${sn.photoFileId}`} alt={`${code} photo`} loading="lazy" width={80} height={60} className="h-[60px] w-20 rounded-[4px] bg-raised object-cover" />
                        </a>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <p className="min-w-0 font-medium">
                            <span className="mr-2 font-mono text-xs text-muted">{code}</span>
                            {sn.title}
                          </p>
                          <span className={`pill ${STATUS_PILL[sn.status]}`}>{STATUS_LABEL[sn.status]}</span>
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-muted">
                          {[sn.location, sn.assigneeName ? `for ${sn.assigneeName}` : "not assigned", `raised ${formatDate(sn.createdAt.toISOString().slice(0, 10))}${sn.creatorName ? ` by ${sn.creatorName}` : ""}`]
                            .filter(Boolean)
                            .join(" · ")}
                          {sn.status === "open" && sn.dueDate ? (
                            <span className={isLate ? "font-medium text-negative" : ""}> · fix by {formatDue(sn.dueDate).toLowerCase()}</span>
                          ) : null}
                        </p>
                        {sn.status !== "open" && (sn.fixNote || sn.fixPhotoFileId) ? (
                          <div className="mt-2 flex items-center gap-3 border-l-2 border-control pl-3 text-xs">
                            {sn.fixPhotoFileId ? (
                              <a href={`/api/files/${sn.fixPhotoFileId}`} target="_blank" rel="noreferrer" className="flex-none">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/files/${sn.fixPhotoFileId}`} alt={`${code} after the fix`} loading="lazy" width={64} height={48} className="h-12 w-16 rounded-[4px] bg-raised object-cover" />
                              </a>
                            ) : null}
                            <span>{sn.fixNote ?? "Fixed"}</span>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {canFix ? <FixSnag projectId={project.id} snagId={sn.id} code={code} /> : null}
                          {canReview ? (
                            <form action={reviewSnag} className="flex flex-wrap gap-2">
                              <input type="hidden" name="projectId" value={project.id} />
                              <input type="hidden" name="snagId" value={sn.id} />
                              <button type="submit" name="decision" value="close" className="btn btn-primary">Close {code}</button>
                              <button type="submit" name="decision" value="reopen" className="btn btn-secondary">Not fixed, reopen</button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {canRaise ? (
          <section className="card p-5" aria-labelledby="raise-title">
            <h2 id="raise-title" className="card-title mb-4">Raise a snag</h2>
            <RaiseSnag projectId={project.id} team={members.map((m) => ({ id: m.id, name: m.name }))} defaultAssignee="" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
