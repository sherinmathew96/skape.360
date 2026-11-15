import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelGallery } from "@/components/model-gallery";
import { loadPortal, portalContent } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · 3D models` : "Studio Skape" }, robots: { index: false, follow: false } };
}

export default async function PortalModels({ params }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal || !portal.sections.models) notFound();
  const { models } = await portalContent(portal);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">3D models</h1>
        <p className="mt-1 text-muted">Open a model to turn it, zoom in and leave comments.</p>
      </div>
      {models.length === 0 ? (
        <p className="empty">No 3D models yet.</p>
      ) : (
        <ModelGallery models={models} slug={portal.slug} fileBase={`/${portal.slug}/f/`} />
      )}
    </>
  );
}
