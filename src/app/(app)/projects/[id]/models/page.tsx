import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Box } from "lucide-react";
import { ModelUpload } from "@/components/model-upload";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatBytes } from "@/lib/file-kinds";
import { can } from "@/lib/permissions";
import { listModels } from "@/lib/studio";

export const metadata: Metadata = { title: "3D models" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function ModelsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  const models = await listModels(project.id);
  const manage = can(user, "studio.manage");

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} subtitle={`${models.length} ${models.length === 1 ? "model" : "models"} · ${project.clientName}`} />

      <div className={`grid grid-cols-1 items-start gap-3 ${manage ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <section className="card" aria-labelledby="models-title">
          <h2 id="models-title" className="card-title px-5 pb-2 pt-4">Models</h2>
          {models.length > 0 ? (
            <ul>
              {models.map((m) => (
                <li key={m.id} className="border-t border-rule first:border-t-0">
                  <Link href={`/projects/${project.id}/models/${m.id}`} className="flex min-h-14 items-center gap-3 px-5 py-2.5 transition-colors hover:bg-ground">
                    <Box size={18} strokeWidth={1.5} className="flex-none text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.title}</p>
                      <p className="truncate text-xs leading-4 text-muted">
                        {[m.createdByName, dateFmt.format(m.createdAt)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="num flex-none text-xs text-muted">{formatBytes(m.size)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty mx-5 mb-5 mt-2">
              No 3D models yet.{manage ? " Upload a .glb export of the design to view it here and share it with the client." : ""}
            </p>
          )}
        </section>

        {manage ? (
          <section className="card p-5" aria-labelledby="upload-title">
            <h2 id="upload-title" className="card-title mb-4">Upload a model</h2>
            <ModelUpload projectId={project.id} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
