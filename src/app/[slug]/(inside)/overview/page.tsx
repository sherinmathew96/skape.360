import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Box, Check, Orbit } from "lucide-react";
import { STATUS_ORDER, STATUS_STYLE, StatusChip } from "@/components/drawing-status";
import { loadPortal, portalContent } from "@/lib/portal";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

type Props = { params: Promise<{ slug: string }> };

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · Overview` : "Studio Skape" }, robots: { index: false, follow: false } };
}

export default async function PortalOverview({ params }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal) notFound();
  const { stages, models, tours, register, siteUpdates } = await portalContent(portal);
  const base = `/${portal.slug}`;
  const file = (id: string) => `${base}/f/${id}`;
  const on = portal.sections;

  const drawings = register.flatMap((g) => g.drawings);
  const waiting = drawings.filter((d) => d.revision?.status === "issued");
  const counts = STATUS_ORDER.map((st) => ({ st, n: drawings.filter((d) => d.status === st).length })).filter((c) => c.n > 0);
  const currentIdx = stages.findIndex((st) => st.status !== "approved");
  const latest = siteUpdates[0];
  const visuals = [
    ...(on.models ? models.map((m) => ({ key: m.id, href: `${base}/3d#m-${m.id}`, title: m.title, kind: "3D model", image: m.coverFileId ? file(m.coverFileId) : null, icon: Box })) : []),
    ...(on.tours
      ? tours.map((t) => ({ key: t.id, href: `${base}/360#t-${t.id}`, title: t.title, kind: `360° · ${t.scenes.length} ${t.scenes.length === 1 ? "room" : "rooms"}`, image: file(t.scenes[0].fileId), icon: Orbit }))
      : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="mb-3">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{portal.projectName}</h1>
        <p className="mt-1 text-muted">
          {PROJECT_TYPE_LABEL[portal.projectType]} for {portal.clientName}
          {portal.location ? `, ${portal.location}` : ""}
        </p>
      </div>

      {stages.length ? (
        <section className="card p-5" aria-labelledby="stages-title">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id="stages-title" className="card-title">Where we are</h2>
            <p className="text-muted">
              {currentIdx === -1 ? "Every stage is done." : `Now: ${stages[currentIdx].name}`}
            </p>
          </div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
            {stages.map((st, i) => {
              const done = st.status === "approved";
              const now = i === currentIdx;
              return (
                <li key={st.id} className="flex items-center gap-3 sm:block">
                  <span className={`block h-1.5 w-10 flex-none rounded-full sm:mb-2 sm:w-auto ${done ? "bg-mint-ink" : now ? "bg-primary" : "bg-raised"}`} aria-hidden="true" />
                  <span className={`flex items-start gap-1.5 text-sm ${done || now ? "text-text" : "text-muted"} ${now ? "font-medium" : ""}`}>
                    {done ? <Check size={14} strokeWidth={2} aria-label="Done" className="mt-[3px] flex-none" /> : null}
                    {st.name}
                    {now ? <span className="sr-only">(in progress)</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 gap-3">
          {on.drawings ? (
            <section className="card" aria-labelledby="waiting-title">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 pb-2 pt-4">
                <h2 id="waiting-title" className="card-title">Waiting for your approval</h2>
                <p className="num text-muted">{waiting.length ? `${waiting.length} ${waiting.length === 1 ? "drawing" : "drawings"}` : ""}</p>
              </div>
              {waiting.length === 0 ? (
                <p className="px-5 pb-5 text-muted">Nothing waits on you right now. New drawings appear here when the studio issues them.</p>
              ) : (
                <ul>
                  {waiting.map((d) => (
                    <li key={d.id} className="border-t border-rule">
                      <Link href={`${base}/drawings?d=${d.id}`} className="group flex min-h-14 items-center gap-3 px-5 py-2 transition-colors hover:bg-ground">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{d.title}</span>
                          <span className="num block truncate text-xs leading-4 text-muted">
                            {[d.number, d.revision ? `R${d.revision.rev}` : null, d.revision?.issuedAt ? `issued ${shortFmt.format(d.revision.issuedAt)}` : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="flex-none text-sm font-medium">Review</span>
                        <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" className="flex-none transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {on.drawings && drawings.length ? (
            <section className="card p-5" aria-labelledby="drawings-title">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 id="drawings-title" className="card-title">Drawings</h2>
                <Link href={`${base}/drawings`} className="text-sm font-medium hover:underline">
                  See all {drawings.length}
                </Link>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-raised" role="img" aria-label={counts.map((c) => `${c.n} ${STATUS_STYLE[c.st].label}`).join(", ")}>
                {counts.map((c) => (
                  <span key={c.st} style={{ width: `${(c.n / drawings.length) * 100}%`, background: STATUS_STYLE[c.st].dot }} />
                ))}
              </div>
              <ul className="mt-4 flex flex-wrap gap-2">
                {counts.map(({ st, n }) => (
                  <li key={st} className="flex items-center gap-2 rounded-md bg-ground py-1 pl-1 pr-3">
                    <StatusChip status={st} />
                    <span className="num font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visuals.length ? (
            <section aria-labelledby="visuals-title">
              <h2 id="visuals-title" className="sr-only">3D models and 360° tours</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visuals.map((v) => (
                  <li key={v.key}>
                    <Link href={v.href} className="card group block overflow-hidden">
                      <span className="relative block aspect-[16/10] overflow-hidden bg-raised">
                        {v.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.image} alt="" width={640} height={400} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
                        ) : (
                          <v.icon size={32} strokeWidth={1.25} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted" />
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{v.title}</span>
                          <span className="block text-xs text-muted">{v.kind}</span>
                        </span>
                        <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" className="flex-none transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3">
          {on.site && latest ? (
            <section className="card overflow-hidden" aria-labelledby="site-title">
              {latest.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file(latest.photos[0].fileId)} alt="Latest site photo" width={640} height={480} loading="lazy" className="aspect-[4/3] w-full bg-raised object-cover" />
              ) : null}
              <div className="p-5">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 id="site-title" className="card-title">Latest from site</h2>
                  <p className="num text-xs text-muted">{dayFmt.format(new Date(`${latest.date}T00:00:00Z`))}</p>
                </div>
                <p className="line-clamp-4 whitespace-pre-line text-muted">{latest.workDone}</p>
                <Link href={`${base}/site`} className="mt-3 inline-block text-sm font-medium hover:underline">
                  All {siteUpdates.length} {siteUpdates.length === 1 ? "update" : "updates"}
                </Link>
              </div>
            </section>
          ) : null}

          <section className="card p-5" aria-labelledby="facts-title">
            <h2 id="facts-title" className="card-title mb-3">Project</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
              {[
                ["Client", portal.clientName],
                ["Type", PROJECT_TYPE_LABEL[portal.projectType]],
                ["Location", portal.location],
                ["Area", portal.area],
                ["Code", portal.projectCode],
              ]
                .filter((f): f is [string, string] => Boolean(f[1]))
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="min-w-0 text-right">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
