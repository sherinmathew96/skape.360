import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewDrawing } from "@/components/drawing-upload";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { DISCIPLINE_LABEL, listDrawings, revLabel, STATUS_LABEL, STATUS_PILL } from "@/lib/drawings";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Drawings" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  const drawings = await listDrawings(project.id);
  const manage = can(user.role, "studio.manage");
  const withClient = drawings.filter((d) => d.latest?.status === "issued").length;
  const changes = drawings.filter((d) => d.latest?.status === "changes_requested").length;

  const subtitle = [
    `${drawings.length} ${drawings.length === 1 ? "drawing" : "drawings"}`,
    withClient ? `${withClient} waiting on the client` : null,
    changes ? `${changes} with changes requested` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} subtitle={subtitle} />

      <div className={`grid grid-cols-1 items-start gap-3 ${manage ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <section className="card" aria-labelledby="register-title">
          <h2 id="register-title" className="card-title px-5 pb-2 pt-4">Drawing register</h2>
          {drawings.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">
              No drawings yet.{manage ? " Add the first sheet; each new upload of it becomes the next revision." : ""}
            </p>
          ) : (
            <ul>
              {drawings.map((d) => (
                <li key={d.id} className="border-t border-rule first:border-t-0">
                  <Link
                    href={`/projects/${project.id}/drawings/${d.id}`}
                    className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-ground sm:grid-cols-[88px_minmax(0,1fr)_44px_150px]"
                  >
                    <span className="font-mono text-xs">{d.number}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="block truncate text-xs leading-4 text-muted">
                        {DISCIPLINE_LABEL[d.discipline]}
                        {d.latest ? ` · ${dateFmt.format(d.latest.createdAt)}` : ""}
                      </span>
                    </span>
                    <span className="num hidden text-right font-mono text-xs sm:block">{d.latest ? revLabel(d.latest.rev) : "–"}</span>
                    <span className="flex justify-end">
                      {d.latest ? (
                        <span className={`pill ${STATUS_PILL[d.latest.status]}`}>
                          <span className="mr-1 font-mono sm:hidden">{revLabel(d.latest.rev)}</span>
                          {STATUS_LABEL[d.latest.status]}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {manage ? (
          <section className="card p-5" aria-labelledby="new-drawing-title">
            <h2 id="new-drawing-title" className="card-title mb-4">Add a drawing</h2>
            <NewDrawing projectId={project.id} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
