import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { unlockPortal } from "@/app/portal-actions";
import { ActionForm } from "@/components/action-form";
import { FirmLocked, FirmProjects } from "@/components/firm-view";
import { firmProjects, loadFirm, logFirmView } from "@/lib/firms";
import { loadPortal, logPortalView } from "@/lib/portal";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";
import { SharedDrawings } from "@/components/shared-drawings";
import { findShared } from "@/lib/share-slugs";

type Props = { params: Promise<{ slug: string }> };

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const month = (d: string | null) => (d ? monthFmt.format(new Date(`${d}T00:00:00Z`)) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { portal } = await loadPortal(slug);
  const firm = portal ? null : (await loadFirm(slug)).firm;
  const shared = portal || firm ? null : await findShared(slug);
  return {
    title: { absolute: portal ? `${portal.projectName} · Studio Skape` : firm ? `${firm.name} · Studio Skape` : shared ? `${shared.name} · Studio Skape` : "Studio Skape" },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/**
 * The cover: a clean white page. The studio's logo and tagline at the top,
 * the project's name, its details and consultants in the middle, and the way in.
 */
function Cover({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-surface px-6 py-8 text-text md:px-14 md:py-12">
      <div className="mx-auto w-full max-w-[1040px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/studio-skape-logo.png" alt="Studio Skape" width={122} height={48} className="h-12 w-auto" />
        <p className="mt-3 text-[13px] font-medium uppercase tracking-[0.22em] text-muted">Form &ndash; Space &ndash; Meaning</p>
      </div>
      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col justify-center py-14 md:py-16">{children}</div>
    </main>
  );
}

const nameClass = "text-[clamp(40px,6vw,84px)] font-semibold leading-[0.96] tracking-[-0.04em] [text-wrap:balance]";

export default async function PortalCover({ params }: Props) {
  const { slug } = await params;
  if (slug !== slug.toLowerCase()) redirect(`/${slug.toLowerCase()}`);
  const { state, portal } = await loadPortal(slug);
  if (!portal) {
    // Not a project: perhaps a firm's page listing its projects.
    const found = await loadFirm(slug);
    if (!found.firm) {
      // Or one group or drawing shared on its own address.
      const shared = await findShared(slug);
      if (!shared) notFound();
      return <SharedDrawings shared={shared} slug={slug} />;
    }
    if (found.state === "locked") return <FirmLocked name={found.firm.name} slug={found.firm.slug} />;
    const [projects] = await Promise.all([firmProjects(found.firm.id), logFirmView(found.firm.id)]);
    return <FirmProjects name={found.firm.name} projects={projects} />;
  }

  const base = `/${portal.slug}`;

  // Before the passcode: the cover and the name only, nothing about the client.
  if (state === "locked") {
    return (
      <Cover>
        <h1 className={nameClass}>{portal.projectName}</h1>
        <p className="mt-5 max-w-[36ch] text-lg leading-7 text-muted">Enter the passcode Studio Skape gave you to open your project.</p>
        <ActionForm action={unlockPortal} submitLabel="Open" pendingLabel="Checking…" className="mt-8 max-w-[360px] space-y-4">
          <input type="hidden" name="slug" value={portal.slug} />
          <div>
            <label htmlFor="passcode" className="field-label">Passcode</label>
            <input id="passcode" name="passcode" required autoComplete="off" autoCapitalize="none" spellCheck={false} className="field h-11 text-base" />
          </div>
        </ActionForm>
      </Cover>
    );
  }

  await logPortalView(portal.id);
  const typeLabel = portal.projectType === "design" ? "Interior design" : PROJECT_TYPE_LABEL[portal.projectType];
  const facts = [
    ["Client", portal.clientName],
    ["Project", typeLabel],
    ["Location", portal.location],
    ["Area", portal.area],
    ["Completion", month(portal.dueDate)],
  ].filter((f): f is [string, string] => Boolean(f[1]));
  const consultants = (portal.consultants ?? []).filter((c) => c.name);

  return (
    <Cover>
      <h1 className={nameClass}>{portal.projectName}</h1>
      {portal.brief ? <p className="mt-6 max-w-[52ch] text-lg leading-7 text-muted">{portal.brief}</p> : null}

      <dl className="mt-12 grid max-w-[880px] grid-cols-2 gap-x-8 gap-y-6 border-t border-rule pt-8 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{k}</dt>
            <dd className="mt-1.5 text-base leading-6">{v}</dd>
          </div>
        ))}
      </dl>

      {consultants.length ? (
        <section className="mt-8 max-w-[880px] border-t border-rule pt-8" aria-labelledby="consultants-title">
          <h2 id="consultants-title" className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Consultants</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
            {consultants.map((c, i) => (
              <div key={`${c.role}-${i}`} className="min-w-0">
                <dt className="text-sm text-muted">{c.role}</dt>
                <dd className="mt-0.5 text-base font-medium leading-6">{c.name}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <Link href={`${base}/overview`} className="btn btn-primary group mt-12 h-12 w-full rounded-none px-7 text-base sm:w-fit">
        Open Project
        <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </Link>
    </Cover>
  );
}
