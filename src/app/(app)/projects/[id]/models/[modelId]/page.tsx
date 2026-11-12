import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteModel } from "@/app/studio-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { EmbedCode } from "@/components/embed-code";
import { ModelViewer } from "@/components/model-viewer";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatBytes } from "@/lib/file-kinds";
import { appOrigin } from "@/lib/origin";
import { can } from "@/lib/permissions";
import { findEmbedLink, getModel } from "@/lib/studio";

type Props = { params: Promise<{ id: string; modelId: string }> };

export const metadata: Metadata = { title: "3D model" };

export default async function ModelPage({ params }: Props) {
  const user = await requireUser();
  const { id, modelId } = await params;
  const project = await visibleProject(user, id);
  if (!project) notFound();
  const model = await getModel(project.id, modelId);
  if (!model) notFound();

  const canShare = can(user.role, "share.manage");
  const canManage = can(user.role, "studio.manage");
  const [origin, embedToken] = await Promise.all([
    appOrigin(),
    canShare ? findEmbedLink(project.id, "model", model.id) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        crumbs={[{ href: `/projects/${project.id}/models`, label: "3D models" }]}
        subtitle={`${model.title} · ${model.name} · ${formatBytes(model.size)}`}
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label={`${model.title}, 3D view`} className="card overflow-hidden">
          <ModelViewer src={`/api/files/${model.fileId}`} title={model.title} className="aspect-[4/3] w-full lg:aspect-auto lg:h-[560px]" />
          <p className="border-t border-rule px-5 py-3 text-xs text-muted">
            Drag to turn · scroll or pinch to zoom · two fingers or right-drag to pan
          </p>
        </section>

        <div className="grid grid-cols-1 gap-3">
          {canShare ? (
            <section className="card p-5" aria-labelledby="embed-title">
              <h2 id="embed-title" className="card-title mb-1">Embed on a website</h2>
              <p className="mb-4 text-muted">Paste the code into your site or a presentation page.</p>
              <EmbedCode projectId={project.id} itemType="model" itemId={model.id} title={model.title} origin={origin} initialToken={embedToken} />
            </section>
          ) : null}

          {canManage ? (
            <section className="card p-5" aria-labelledby="delete-title">
              <h2 id="delete-title" className="card-title mb-1">Delete model</h2>
              <p className="mb-4 text-muted">Removes the file and stops every link and embed that shows it.</p>
              <form action={deleteModel}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={model.id} />
                <ConfirmButton message={`Delete “${model.title}”? Links and embeds showing it will stop working.`}>
                  Delete model
                </ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
