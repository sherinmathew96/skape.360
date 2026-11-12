import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteModel } from "@/app/studio-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { EmbedCode } from "@/components/embed-code";
import { ModelWorkspace } from "@/components/model-workspace";
import { ProjectHeader } from "@/components/project-header";
import { SendToClient } from "@/components/send-to-client";
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
        subtitle={`${model.title} · ${formatBytes(model.size)}${model.optimized ? ", optimised" : ""}`}
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ModelWorkspace
          projectId={project.id}
          modelId={model.id}
          title={model.title}
          src={`/api/files/${model.fileId}`}
          poster={model.coverFileId ? `/api/files/${model.coverFileId}` : null}
          view={model.view}
          optimized={model.optimized}
          size={model.size}
          canManage={canManage}
        />

        <div className="grid grid-cols-1 gap-3">
          {canShare ? (
            <section className="card p-5" aria-labelledby="send-title">
              <h2 id="send-title" className="card-title mb-1">Send to client</h2>
              <p className="mb-4 text-muted">A short private link to this model.</p>
              <SendToClient projectId={project.id} itemType="model" itemId={model.id} title={model.title} origin={origin} />
            </section>
          ) : null}
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
