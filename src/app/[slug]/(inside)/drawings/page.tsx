import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientRegister } from "@/components/client-register";
import { loadPortal, portalContent } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · Drawings` : "Studio Skape" }, robots: { index: false, follow: false } };
}

export default async function PortalDrawings({ params, searchParams }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal || !portal.sections.drawings) notFound();
  const { register } = await portalContent(portal);
  const drawings = register.flatMap((g) => g.drawings);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Drawings</h1>
        {drawings.length ? (
          <p className="mt-1 text-muted">
            {drawings.length} {drawings.length === 1 ? "drawing" : "drawings"} with their status. Open one to see its current revision.
          </p>
        ) : null}
      </div>
      {drawings.length === 0 ? (
        <p className="empty">No drawings listed yet. They appear here with their status as the studio works.</p>
      ) : (
        <ClientRegister register={register} fileBase={`/${portal.slug}/f/`} initialId={(await searchParams).d} />
      )}
    </>
  );
}
