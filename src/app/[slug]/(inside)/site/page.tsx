import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPortal, portalContent } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }> };

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · Site progress` : "Studio Skape" }, robots: { index: false, follow: false } };
}

export default async function PortalSite({ params }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal || !portal.sections.site) notFound();
  const { siteUpdates } = await portalContent(portal);
  const file = (id: string) => `/${portal.slug}/f/${id}`;
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Site progress</h1>
        {siteUpdates.length ? <p className="mt-1 text-muted">Updates from site, newest first.</p> : null}
      </div>
      {siteUpdates.length === 0 ? (
        <p className="empty">No site updates yet. They appear here as work progresses.</p>
      ) : (
        <ol className="space-y-3">
          {siteUpdates.map((r) => {
            const day = dayFmt.format(new Date(`${r.date}T00:00:00Z`));
            return (
              <li key={r.id} className="card p-5">
                <h2 className="num mb-1 font-medium">{day}</h2>
                <p className="whitespace-pre-line">{r.workDone}</p>
                {r.photos.length > 0 ? (
                  <ul className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {r.photos.map((p, i) => (
                      <li key={p.id}>
                        <a href={file(p.fileId)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={file(p.fileId)}
                            alt={`Site photo ${i + 1}, ${day}`}
                            loading="lazy"
                            width={400}
                            height={300}
                            className="aspect-[4/3] w-full rounded-[4px] bg-raised object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
