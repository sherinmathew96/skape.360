import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TourViewer } from "@/components/tour-viewer";
import { loadPortal, portalContent } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · 360° tours` : "Studio Skape" }, robots: { index: false, follow: false } };
}

export default async function PortalTours({ params }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal || !portal.sections.tours) notFound();
  const { tours } = await portalContent(portal);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">360° tours</h1>
        <p className="mt-1 text-muted">Drag to look around; tap the arrows to move between rooms.</p>
      </div>
      {tours.length === 0 ? (
        <p className="empty">No 360° tours yet.</p>
      ) : (
        <div className="space-y-10">
          {tours.map((t) => (
            <section key={t.id} id={`t-${t.id}`} aria-labelledby={`t-${t.id}-title`} className="scroll-mt-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 id={`t-${t.id}-title`} className="text-lg font-medium leading-7">{t.title}</h2>
                <p className="text-xs text-muted">
                  {t.scenes.length} {t.scenes.length === 1 ? "room" : "rooms"}
                </p>
              </div>
              <div className="card overflow-hidden">
                <TourViewer tour={t} fileBase={`/${portal.slug}/f/`} className="aspect-[4/3] md:aspect-[16/9]" />
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
