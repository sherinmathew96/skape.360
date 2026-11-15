import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PortalBell } from "@/components/portal-bell";
import { PortalTabs, type PortalTab } from "@/components/portal-tabs";
import { portalUnread } from "@/lib/client-updates";
import { loadPortal, portalContent } from "@/lib/portal";

/** The client's dashboard: the project's name on top, then a tab for each part the studio shares. */
export default async function PortalInside({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { state, portal } = await loadPortal(slug);
  if (!portal) notFound();
  if (state !== "ok") redirect(`/${portal.slug}`);
  const [{ models, tours, siteUpdates, progress }, unread] = await Promise.all([portalContent(portal), portalUnread(portal)]);
  const base = `/${portal.slug}`;
  const on = portal.sections;

  const tabs: PortalTab[] = [
    { href: `${base}/overview`, label: "Overview" },
    ...(progress ? [{ href: `${base}/timeline`, label: "Timeline" }] : []),
    ...(on.drawings ? [{ href: `${base}/drawings`, label: "Drawings" }] : []),
    ...(on.models && models.length ? [{ href: `${base}/3d`, label: "3D models" }] : []),
    ...(on.tours && tours.length ? [{ href: `${base}/360`, label: "360° tours" }] : []),
    ...(on.site && siteUpdates.length ? [{ href: `${base}/site`, label: "Site progress" }] : []),
  ];

  return (
    <div className="min-h-dvh bg-ground">
      {/* A light bar that stays on top: the studio's logo, the project, the bell; the sections below as pills. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto max-w-[1136px] px-5 md:px-8">
          <div className="flex h-16 items-center gap-3 md:gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/studio-skape-logo.png" alt="Studio Skape" width={61} height={24} className="h-6 w-auto flex-none" />
            <span className="h-6 w-px flex-none bg-border" aria-hidden="true" />
            <Link href={base} className="min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] hover:text-primary" title="Back to the cover">
              {portal.projectName}
            </Link>
            <PortalBell href={`${base}/updates`} unread={unread} />
          </div>
          <PortalTabs tabs={tabs} />
        </div>
      </header>
      <main className="mx-auto max-w-[1136px] px-5 pb-16 pt-6 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}
