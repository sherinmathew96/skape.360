import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteTour } from "@/app/studio-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { EmbedCode } from "@/components/embed-code";
import { ProjectHeader } from "@/components/project-header";
import { SendToClient } from "@/components/send-to-client";
import { TourBuilder } from "@/components/tour-builder";
import { TourViewer } from "@/components/tour-viewer";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { appOrigin } from "@/lib/origin";
import { can } from "@/lib/permissions";
import { findEmbedLink, getTour } from "@/lib/studio";

export const metadata: Metadata = { title: "360° tour" };

export default async function TourPage({ params }: { params: Promise<{ id: string; tourId: string }> }) {
  const user = await requireUser();
  const { id, tourId } = await params;
  const project = await visibleProject(user, id);
  if (!project) notFound();
  const tour = await getTour(project.id, tourId);
  if (!tour) notFound();

  const manage = can(user, "studio.manage");
  const canShare = can(user, "share.manage");
  const [origin, embedToken] = await Promise.all([
    appOrigin(),
    canShare ? findEmbedLink(project.id, "tour", tour.id) : Promise.resolve(null),
  ]);
  const doors = tour.hotspots.length;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        crumbs={[{ href: `/projects/${project.id}/tours`, label: "360° tours" }]}
        subtitle={`${tour.title} · ${tour.scenes.length} ${tour.scenes.length === 1 ? "room" : "rooms"}, ${doors} ${doors === 1 ? "door" : "doors"}`}
      />

      {manage ? (
        <TourBuilder projectId={project.id} tour={tour} />
      ) : (
        <div className="card overflow-hidden">
          <TourViewer tour={tour} fileBase="/api/files/" className="aspect-[4/3] lg:aspect-auto lg:h-[560px]" />
        </div>
      )}

      {canShare || manage ? (
        <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {canShare && tour.scenes.length > 0 ? (
            <section className="card p-5" aria-labelledby="send-title">
              <h2 id="send-title" className="card-title mb-1">Send to client</h2>
              <p className="mb-4 text-muted">A short private link to this tour.</p>
              <SendToClient projectId={project.id} itemType="tour" itemId={tour.id} title={tour.title} origin={origin} />
            </section>
          ) : null}
          {canShare ? (
            <section className="card p-5" aria-labelledby="embed-title">
              <h2 id="embed-title" className="card-title mb-1">Embed on a website</h2>
              <p className="mb-4 text-muted">Paste the code into your site or a presentation page.</p>
              {tour.scenes.length > 0 ? (
                <EmbedCode projectId={project.id} itemType="tour" itemId={tour.id} title={tour.title} origin={origin} initialToken={embedToken} />
              ) : (
                <p className="empty">Upload at least one 360° photo first.</p>
              )}
            </section>
          ) : null}
          {manage ? (
            <section className="card p-5" aria-labelledby="delete-title">
              <h2 id="delete-title" className="card-title mb-1">Delete tour</h2>
              <p className="mb-4 text-muted">Links and embeds stop showing it. It goes to the recycle bin in Settings, and can be restored from there until it is removed for good.</p>
              <form action={deleteTour}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={tour.id} />
                <ConfirmButton message={`Move “${tour.title}” to the recycle bin?`}>Delete tour</ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
