import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unlockPortal } from "@/app/portal-actions";
import { ActionForm } from "@/components/action-form";
import { Mark } from "@/components/mark";
import { PortalIndex, type PortalIndexItem } from "@/components/portal-index";
import { loadPortal, logPortalView, portalContent, type Portal } from "@/lib/portal";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

type Props = { params: Promise<{ slug: string }> };

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const month = (d: string | null) => (d ? monthFmt.format(new Date(`${d}T00:00:00Z`)) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return {
    title: { absolute: portal ? `${portal.projectName} · Studio Skape` : "Studio Skape" },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** The studio's mark and name, top-left, over the cover. */
function TopBar({ light, right }: { light?: boolean; right?: React.ReactNode }) {
  return (
    <div className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-5 py-5 md:px-8 ${light ? "text-white" : ""}`}>
      <span className="flex items-center gap-2.5 text-[15px] font-medium">
        <Mark size={24} />
        Studio Skape
      </span>
      {right}
    </div>
  );
}

function Cover({ portal, src }: { portal: Portal; src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${portal.projectName}, cover`} width={2400} height={1500} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <div className="absolute inset-0 bg-[#2b2a28]" aria-hidden="true" />
  );
}

/** Before the passcode: the cover and the name only, nothing about the client. */
function Locked({ portal, src }: { portal: Portal; src: string | null }) {
  return (
    <main className="relative min-h-svh overflow-hidden bg-[#141414] text-white">
      <Cover portal={portal} src={src} />
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      <TopBar light />
      <div className="relative z-10 flex min-h-svh flex-col justify-end px-5 pb-8 pt-28 md:px-8 md:pb-10">
        <h1 className="max-w-[16ch] text-[clamp(44px,8vw,128px)] font-semibold leading-[0.95] tracking-[-0.035em] [text-wrap:balance]">{portal.projectName}</h1>
        <p className="mt-6 max-w-[40ch] text-lg leading-7 text-white/85">Enter the passcode Studio Skape gave you to open your project.</p>
        <div className="mt-6 w-full max-w-[400px] rounded-md bg-white p-5 text-text">
          <ActionForm action={unlockPortal} submitLabel="Open" pendingLabel="Checking…" className="space-y-4">
            <input type="hidden" name="slug" value={portal.slug} />
            <div>
              <label htmlFor="passcode" className="field-label">Passcode</label>
              <input id="passcode" name="passcode" required autoComplete="off" autoCapitalize="none" spellCheck={false} className="field" />
            </div>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}

export default async function PortalCover({ params }: Props) {
  const { slug } = await params;
  if (slug !== slug.toLowerCase()) redirect(`/${slug.toLowerCase()}`);
  const { state, portal } = await loadPortal(slug);
  if (!portal) notFound();

  const base = `/${portal.slug}`;
  const file = (id: string) => `${base}/f/${id}`;
  const coverSrc = portal.coverFileId ? file(portal.coverFileId) : null;
  if (state === "locked") return <Locked portal={portal} src={coverSrc} />;

  const [content] = await Promise.all([portalContent(portal), logPortalView(portal.id)]);
  const { stages, models, tours, register, siteUpdates } = content;
  const on = portal.sections;
  const enter = `${base}/overview`;

  const drawings = register.flatMap((g) => g.drawings);
  const waiting = drawings.filter((d) => d.revision?.status === "issued").length;
  const sitePhotos = siteUpdates.flatMap((r) => r.photos.map((p) => ({ ...p, date: r.date })));
  const rooms = tours.reduce((n, t) => n + t.scenes.length, 0);
  const current = stages.find((st) => st.status === "in_progress") ?? stages.find((st) => st.status === "pending");
  const done = stages.filter((st) => st.status === "approved").length;

  const typeLabel = PROJECT_TYPE_LABEL[portal.projectType];
  const line = `${typeLabel} for ${portal.clientName}${portal.location ? `, ${portal.location}` : ""}.`;

  const facts = [
    ["Client", portal.clientName],
    ["Project", typeLabel],
    ["Location", portal.location],
    ["Area", portal.area],
    ["Stage", current ? `${current.name}${stages.length ? `, ${done} of ${stages.length} stages done` : ""}` : stages.length ? "All stages done" : null],
    ["Started", month(portal.startDate)],
    ["Completion", month(portal.dueDate)],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  const index: PortalIndexItem[] = [
    on.drawings && drawings.length
      ? {
          key: "drawings",
          href: `${base}/drawings`,
          title: "Drawings",
          detail: `${drawings.length} ${drawings.length === 1 ? "drawing" : "drawings"} with their status${waiting ? `, ${waiting} waiting for your approval` : ""}`,
          image: coverSrc,
          alt: `${portal.projectName}, cover`,
        }
      : null,
    on.models && models.length
      ? {
          key: "models",
          href: `${base}/3d`,
          title: models.length === 1 ? "3D model" : "3D models",
          detail: `${models.map((m) => m.title).slice(0, 3).join(", ")}. Turn it, zoom in, see each side.`,
          image: models.find((m) => m.coverFileId)?.coverFileId ? file(models.find((m) => m.coverFileId)!.coverFileId!) : null,
          alt: models[0].title,
        }
      : null,
    on.tours && rooms
      ? {
          key: "tours",
          href: `${base}/360`,
          title: "360° tours",
          detail: `${rooms} ${rooms === 1 ? "room" : "rooms"} to stand in and look around`,
          image: file(tours[0].scenes[0].fileId),
          alt: `${tours[0].title}, ${tours[0].scenes[0].title}`,
        }
      : null,
    on.site && siteUpdates.length
      ? {
          key: "site",
          href: `${base}/site`,
          title: "Site progress",
          detail: `${siteUpdates.length} ${siteUpdates.length === 1 ? "update" : "updates"}, the latest on ${dayFmt.format(new Date(`${siteUpdates[0].date}T00:00:00Z`))}`,
          image: sitePhotos[0] ? file(sitePhotos[0].fileId) : null,
          alt: "Latest site photo",
        }
      : null,
  ].filter((i): i is PortalIndexItem => i !== null);

  // Pictures for the closing gallery: site photos first, then model stills.
  const gallery = [
    ...sitePhotos.slice(0, 6).map((p, i) => ({ id: p.fileId, src: file(p.fileId), caption: `On site, ${dayFmt.format(new Date(`${p.date}T00:00:00Z`))}`, alt: `Site photo ${i + 1}` })),
    ...models.filter((m) => m.coverFileId).map((m) => ({ id: m.coverFileId!, src: file(m.coverFileId!), caption: m.title, alt: m.title })),
  ].slice(0, 6);
  const aboutPicture = gallery.find((g) => g.src !== coverSrc) ?? null;

  return (
    <main className="bg-ground text-text">
      {/* Hero: the cover through a window that opens to the edges as you scroll. */}
      <section aria-labelledby="portal-name" className="relative h-[200svh]">
        <h1 id="portal-name" className="sr-only">
          {portal.projectName}: {line}
        </h1>
        <div className="sticky top-0 h-svh overflow-hidden">
          <div className="portal-window absolute inset-0 bg-[#141414]">
            <Cover portal={portal} src={coverSrc} />
            {/* The film title over the open picture, with a neutral scrim only where the words sit. */}
            <div className="portal-title absolute inset-0 text-white">
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/40 to-transparent" aria-hidden="true" /> {/* taste-skill-ignore: neutral scrim under text on the photo */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent pb-6 pt-40 md:pb-8"> {/* taste-skill-ignore: neutral scrim under text on the photo */}
                <div className="grid grid-cols-1 items-end gap-x-10 gap-y-5 px-5 md:grid-cols-[minmax(0,1fr)_auto] md:px-8">
                  <p aria-hidden="true" className="max-w-[14ch] text-[clamp(48px,8vw,136px)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
                    {portal.projectName}
                  </p>
                  <div className="pb-2">
                    <p className="max-w-[30ch] text-lg leading-7 text-white/90">{line}</p>
                    <Link href={enter} className="btn mt-4 h-12 rounded-none bg-white px-6 text-base text-[#141414] hover:bg-white/85">
                      Open the project
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Words on the paper, beside the window; they scroll away as it opens. */}
          <div className="portal-paper absolute inset-0 z-10">
            <div className="absolute left-5 right-5 top-[13svh] md:left-8 md:right-auto md:top-auto md:bottom-[max(6svh,calc((100svh-45vw)/2))] md:w-[28vw]">
              <p aria-hidden="true" className="text-[clamp(40px,10vw,64px)] font-semibold leading-[0.95] tracking-[-0.035em] [text-wrap:balance] md:text-[clamp(40px,4.4vw,72px)]">
                {portal.projectName}
              </p>
            </div>
            <div className="pointer-events-auto absolute bottom-6 left-5 right-5 md:bottom-[max(6svh,calc((100svh-45vw)/2))] md:left-auto md:right-8 md:w-[26vw]">
              <p className="max-w-[30ch] text-lg leading-7">{line}</p>
              <Link href={enter} className="btn btn-primary mt-5 h-12 w-full rounded-none px-6 text-base md:w-auto">
                Open the project
              </Link>
            </div>
          </div>

          {/* One bar over both: ink on the paper, white once the picture is open. */}
          <div className="portal-topbar absolute inset-x-0 top-0 z-20 text-white">
            <TopBar
              right={
                <Link href={enter} className="text-[15px] font-medium hover:underline">
                  Open the project
                </Link>
              }
            />
          </div>
        </div>
      </section>

      {/* About: the brief and the facts of the project. */}
      <section aria-labelledby="about-title" className="relative z-10 bg-ground px-5 pb-28 pt-24 md:px-8 md:pb-40 md:pt-36">
        <div className="mx-auto grid max-w-[1376px] grid-cols-1 gap-12 md:grid-cols-12 md:gap-6">
          <div className="portal-rise md:col-span-6">
            <h2 id="about-title" className="text-[clamp(36px,4.6vw,72px)] font-semibold leading-[0.98] tracking-[-0.035em]">About the project</h2>
            <p className="mt-8 max-w-[34ch] text-[clamp(18px,1.6vw,22px)] leading-[1.45]">{portal.brief ?? line}</p>
            <dl className="mt-12 grid max-w-[560px] grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="mt-1 text-lg leading-7">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {aboutPicture ? (
            <figure className="portal-rise md:col-span-5 md:col-start-8 md:mt-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aboutPicture.src} alt={aboutPicture.alt} width={900} height={1125} loading="lazy" className="aspect-[4/5] w-full bg-[#e9e8e5] object-cover" />
              <figcaption className="mt-2.5 text-[13px] text-muted">{aboutPicture.caption}</figcaption>
            </figure>
          ) : (
            <div className="portal-rise md:col-span-5 md:col-start-8 md:mt-24">
              <div className="bg-surface p-8">
                <p className="text-sm text-muted">Inside</p>
                <p className="mt-2 text-[clamp(28px,2.6vw,40px)] font-semibold leading-tight tracking-[-0.02em]">
                  {[on.drawings && drawings.length ? `${drawings.length} drawings` : null, on.models && models.length ? `${models.length} 3D` : null, on.tours && rooms ? `${rooms} rooms in 360°` : null]
                    .filter(Boolean)
                    .join(" · ") || "Your project"}
                </p>
                <Link href={enter} className="btn btn-primary mt-6 h-12 rounded-none px-6 text-base">Open the project</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Inside: each part of the project, with its picture. */}
      {index.length ? (
        <section aria-labelledby="inside-title" className="bg-surface px-5 py-24 md:px-8 md:py-36">
          <div className="mx-auto max-w-[1376px]">
            <h2 id="inside-title" className="mb-10 text-[clamp(32px,3.4vw,52px)] font-semibold leading-none tracking-[-0.03em] md:mb-14">What&rsquo;s inside</h2>
            <PortalIndex items={index} fallback={coverSrc} />
          </div>
        </section>
      ) : null}

      {/* Gallery: the house being made, at uneven sizes. */}
      {gallery.length >= 2 ? (
        <section aria-labelledby="gallery-title" className="px-5 py-24 md:px-8 md:py-36">
          <div className="mx-auto max-w-[1376px]">
            <h2 id="gallery-title" className="sr-only">Pictures</h2>
            <ul className="grid grid-cols-12 gap-x-6 gap-y-16 md:gap-y-0">
              {gallery.map((g, i) => {
                const layout = [
                  "col-span-9 md:col-span-4 md:col-start-1",
                  "col-span-11 col-start-2 md:col-span-6 md:col-start-7 md:mt-[30vh]",
                  "col-span-12 md:col-span-6 md:col-start-6 md:mt-[24vh]",
                  "col-span-7 md:col-span-3 md:col-start-2 md:mt-[22vh]",
                  "col-span-10 col-start-3 md:col-span-6 md:col-start-1 md:mt-[24vh]",
                  "col-span-8 md:col-span-4 md:col-start-9 md:mt-[22vh]",
                ][i];
                const ratio = ["aspect-[3/4]", "aspect-[5/4]", "aspect-[3/2]", "aspect-[4/5]", "aspect-[3/2]", "aspect-[3/4]"][i];
                return (
                  <li key={g.id} className={`portal-rise ${layout}`}>
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.src} alt={g.alt} width={1200} height={900} loading="lazy" className={`${ratio} w-full bg-[#e9e8e5] object-cover`} />
                      <figcaption className="mt-2.5 text-[13px] text-muted">{g.caption}</figcaption>
                    </figure>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* The close: the name again, and the way in. */}
      <footer className="bg-[#141414] px-5 pb-8 pt-24 text-white md:px-8 md:pt-36">
        <div className="mx-auto max-w-[1376px]">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <p className="max-w-[14ch] text-[clamp(44px,8vw,128px)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">{portal.projectName}</p>
            <Link href={enter} className="btn h-12 rounded-none bg-white px-6 text-base text-[#141414] hover:bg-white/85">
              Open the project
            </Link>
          </div>
          <p className="mt-16 flex flex-wrap justify-between gap-4 text-[13px] text-white/60">
            <span>Designed by Studio Skape, Kochi</span>
            <span>Shared privately with {portal.clientName}. Please do not forward this address.</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
