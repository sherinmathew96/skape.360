import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark } from "@/components/mark";
import { PortalTabs, type PortalTab } from "@/components/portal-tabs";
import { loadPortal, portalContent } from "@/lib/portal";

/** The client's dashboard: the project's name on top, then a tab for each part the studio shares. */
export default async function PortalInside({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { state, portal } = await loadPortal(slug);
  if (!portal) notFound();
  if (state !== "ok") redirect(`/${portal.slug}`);
  const { models, tours, register, siteUpdates } = await portalContent(portal);
  const base = `/${portal.slug}`;
  const on = portal.sections;
  const waiting = register.flatMap((g) => g.drawings).filter((d) => d.revision?.status === "issued").length;

  const tabs: PortalTab[] = [
    { href: `${base}/overview`, label: "Overview" },
    ...(on.drawings ? [{ href: `${base}/drawings`, label: "Drawings", count: waiting }] : []),
    ...(on.models && models.length ? [{ href: `${base}/3d`, label: "3D models" }] : []),
    ...(on.tours && tours.length ? [{ href: `${base}/360`, label: "360° tours" }] : []),
    ...(on.site && siteUpdates.length ? [{ href: `${base}/site`, label: "Site progress" }] : []),
  ];

  return (
    <div className="min-h-dvh bg-ground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1136px] px-5 md:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <Link href={base} className="flex min-w-0 items-center gap-2.5" aria-label={`${portal.projectName}, back to the cover`}>
              <Mark size={24} />
              <span className="truncate font-medium">{portal.projectName}</span>
            </Link>
            <span className="flex-none text-xs text-muted">Studio Skape</span>
          </div>
          <PortalTabs tabs={tabs} />
        </div>
      </header>
      <main className="mx-auto max-w-[1136px] px-5 pb-16 pt-6 md:px-8 md:pt-8">{children}</main>
      <footer className="mx-auto max-w-[1136px] px-5 pb-10 text-xs text-muted md:px-8">
        Shared privately with {portal.clientName} by Studio Skape. Please do not forward this address.
      </footer>
    </div>
  );
}
