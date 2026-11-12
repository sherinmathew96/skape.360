import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelViewer } from "@/components/model-viewer";
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
  const file = (id: string) => `/${portal.slug}/f/${id}`;
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">3D models</h1>
        <p className="mt-1 text-muted">Drag to turn, pinch or scroll to zoom, or pick a view under the model.</p>
      </div>
      {models.length === 0 ? (
        <p className="empty">No 3D models yet.</p>
      ) : (
        <div className="space-y-10">
          {models.map((m) => (
            <section key={m.id} id={`m-${m.id}`} aria-labelledby={`m-${m.id}-title`} className="scroll-mt-6">
              <h2 id={`m-${m.id}-title`} className="mb-3 text-lg font-medium leading-7">{m.title}</h2>
              <div className="card overflow-hidden">
                <ModelViewer
                  src={file(m.fileId)}
                  title={m.title}
                  poster={m.coverFileId ? file(m.coverFileId) : null}
                  view={m.view}
                  className="aspect-[4/5] w-full sm:aspect-[4/3] md:aspect-[16/9]"
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
