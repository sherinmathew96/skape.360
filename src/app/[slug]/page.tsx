import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { unlockPortal } from "@/app/portal-actions";
import { ActionForm } from "@/components/action-form";
import { Mark } from "@/components/mark";
import { loadPortal, logPortalView, portalContent, type Portal } from "@/lib/portal";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

type Props = { params: Promise<{ slug: string }> };

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const month = (d: string | null) => (d ? monthFmt.format(new Date(`${d}T00:00:00Z`)) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return {
    title: { absolute: portal ? `${portal.projectName} · Studio Skape` : "Studio Skape" },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/**
 * One screen: the cover image fills the left pane, the project's details and
 * the way in sit on the right. On a phone the image runs across the top.
 */
function Split({ portal, src, children }: { portal: Portal; src: string | null; children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh grid-cols-1 bg-surface text-text md:h-svh md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="relative h-[42svh] bg-[#2b2a28] md:h-full">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${portal.projectName}, cover`} width={2000} height={1500} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col px-5 pb-8 pt-6 md:overflow-y-auto md:px-12 md:pb-10 md:pt-10 xl:px-16">
        <p className="flex items-center gap-2.5 text-[15px] font-medium">
          <Mark size={24} />
          Studio Skape
        </p>
        <div className="flex flex-1 flex-col justify-center py-10 md:py-12">{children}</div>
        <p className="text-[13px] text-muted">Shared privately by Studio Skape, Kochi. Please do not forward this address.</p>
      </div>
    </main>
  );
}

const nameClass = "text-[clamp(40px,4.4vw,68px)] font-semibold leading-[0.98] tracking-[-0.035em] [text-wrap:balance]";

export default async function PortalCover({ params }: Props) {
  const { slug } = await params;
  if (slug !== slug.toLowerCase()) redirect(`/${slug.toLowerCase()}`);
  const { state, portal } = await loadPortal(slug);
  if (!portal) notFound();

  const base = `/${portal.slug}`;
  const coverSrc = portal.coverFileId ? `${base}/f/${portal.coverFileId}` : null;

  // Before the passcode: the cover and the name only, nothing about the client.
  if (state === "locked") {
    return (
      <Split portal={portal} src={coverSrc}>
        <h1 className={nameClass}>{portal.projectName}</h1>
        <p className="mt-5 max-w-[36ch] text-lg leading-7 text-muted">Enter the passcode Studio Skape gave you to open your project.</p>
        <ActionForm action={unlockPortal} submitLabel="Open" pendingLabel="Checking…" className="mt-8 max-w-[360px] space-y-4">
          <input type="hidden" name="slug" value={portal.slug} />
          <div>
            <label htmlFor="passcode" className="field-label">Passcode</label>
            <input id="passcode" name="passcode" required autoComplete="off" autoCapitalize="none" spellCheck={false} className="field h-11 text-base" />
          </div>
        </ActionForm>
      </Split>
    );
  }

  const [{ stages, models, tours, register, siteUpdates }] = await Promise.all([portalContent(portal), logPortalView(portal.id)]);
  const on = portal.sections;
  const typeLabel = PROJECT_TYPE_LABEL[portal.projectType];

  const drawings = register.flatMap((g) => g.drawings);
  const waiting = drawings.filter((d) => d.revision?.status === "issued").length;
  const rooms = tours.reduce((n, t) => n + t.scenes.length, 0);
  const current = stages.find((st) => st.status === "in_progress") ?? stages.find((st) => st.status === "pending");
  const done = stages.filter((st) => st.status === "approved").length;

  const facts = [
    ["Client", portal.clientName],
    ["Project", typeLabel],
    ["Location", portal.location],
    ["Area", portal.area],
    ["Stage", current ? current.name : stages.length ? "Completed" : null],
    ["Progress", stages.length ? `${done} of ${stages.length} stages done` : null],
    ["Started", month(portal.startDate)],
    ["Completion", month(portal.dueDate)],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  // What waits inside, in the client's words; each links straight to its tab.
  const inside = [
    on.drawings && drawings.length
      ? { href: `${base}/drawings`, label: `${drawings.length} ${drawings.length === 1 ? "drawing" : "drawings"}`, note: waiting ? `${waiting} for your approval` : null }
      : null,
    on.models && models.length ? { href: `${base}/3d`, label: `${models.length} 3D ${models.length === 1 ? "model" : "models"}`, note: null } : null,
    on.tours && rooms ? { href: `${base}/360`, label: `${rooms} ${rooms === 1 ? "room" : "rooms"} in 360°`, note: null } : null,
    on.site && siteUpdates.length
      ? { href: `${base}/site`, label: `${siteUpdates.length} site ${siteUpdates.length === 1 ? "update" : "updates"}`, note: null }
      : null,
  ].filter((i): i is { href: string; label: string; note: string | null } => i !== null);

  return (
    <Split portal={portal} src={coverSrc}>
      <h1 className={nameClass}>{portal.projectName}</h1>
      {portal.brief ? <p className="mt-5 max-w-[44ch] text-lg leading-7">{portal.brief}</p> : null}

      <dl className="mt-8 grid max-w-[520px] grid-cols-2 gap-x-6 gap-y-4">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className="mt-0.5 text-base leading-6">{v}</dd>
          </div>
        ))}
      </dl>

      {inside.length ? (
        <ul className="mt-8 flex max-w-[520px] flex-wrap gap-2" aria-label="Inside">
          {inside.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="flex min-h-10 items-center gap-2 rounded-md bg-ground px-3 transition-colors hover:bg-raised">
                <span className="num font-medium">{i.label}</span>
                {i.note ? <span className="num rounded-full bg-[#fdebdc] px-2 text-xs font-medium leading-5 text-[#7a3608]">{i.note}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Link href={`${base}/overview`} className="btn btn-primary group mt-10 h-12 w-full rounded-none px-6 text-base sm:w-fit">
        Open the project
        <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </Link>
    </Split>
  );
}
