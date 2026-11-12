import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Orbit } from "lucide-react";
import { createTour } from "@/app/studio-actions";
import { ActionForm } from "@/components/action-form";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";
import { listTours } from "@/lib/studio";

export const metadata: Metadata = { title: "360° tours" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function ToursPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  const tours = await listTours(project.id);
  const manage = can(user.role, "studio.manage");

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} subtitle={`${tours.length} ${tours.length === 1 ? "tour" : "tours"} · ${project.clientName}`} />

      <div className={`grid grid-cols-1 items-start gap-3 ${manage ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <section className="card" aria-labelledby="tours-title">
          <h2 id="tours-title" className="card-title px-5 pb-2 pt-4">Tours</h2>
          {tours.length > 0 ? (
            <ul>
              {tours.map((t) => (
                <li key={t.id} className="border-t border-rule first:border-t-0">
                  <Link href={`/projects/${project.id}/tours/${t.id}`} className="flex min-h-14 items-center gap-3 px-5 py-2.5 transition-colors hover:bg-ground">
                    <Orbit size={18} strokeWidth={1.5} className="flex-none text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="truncate text-xs leading-4 text-muted">Created {dateFmt.format(t.createdAt)}</p>
                    </div>
                    <span className="num flex-none text-xs text-muted">
                      {t.scenes} {t.scenes === 1 ? "room" : "rooms"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty mx-5 mb-5 mt-2">
              No 360° tours yet.{manage ? " Create one, upload a 360° photo per room, then link the rooms with doors." : ""}
            </p>
          )}
        </section>

        {manage ? (
          <section className="card p-5" aria-labelledby="new-tour-title">
            <h2 id="new-tour-title" className="card-title mb-4">New tour</h2>
            <ActionForm action={createTour} submitLabel="Create tour" pendingLabel="Creating…" className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label htmlFor="tour-title" className="field-label">Name</label>
                <input id="tour-title" name="title" required autoComplete="off" className="field" />
              </div>
            </ActionForm>
          </section>
        ) : null}
      </div>
    </div>
  );
}
