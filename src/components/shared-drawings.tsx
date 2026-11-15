import { notFound } from "next/navigation";
import { unlockPortal } from "@/app/portal-actions";
import { ActionForm } from "@/components/action-form";
import { ClientRegister } from "@/components/client-register";
import { loadPortal, portalContent } from "@/lib/portal";
import { portalSlugFor, type findShared } from "@/lib/share-slugs";

type Shared = NonNullable<Awaited<ReturnType<typeof findShared>>>;

/**
 * One shared group or drawing at its own address (360.studioskape.in/<name>).
 * It sits behind the project portal's passcode; once given, the visitor sees
 * just that group (or that one drawing), with comments.
 */
export async function SharedDrawings({ shared, slug }: { shared: Shared; slug: string }) {
  const portalSlug = await portalSlugFor(shared.projectId);
  if (!portalSlug) notFound();
  const { state, portal } = await loadPortal(portalSlug);
  if (!portal) notFound();

  const header = (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1136px] items-center gap-3 px-5 md:gap-4 md:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/studio-skape-logo.png" alt="Studio Skape" width={61} height={24} className="h-6 w-auto flex-none" />
        <span className="h-6 w-px flex-none bg-border" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold tracking-[-0.01em]">{portal.projectName}</span>
      </div>
    </header>
  );

  if (state !== "ok") {
    return (
      <div className="min-h-dvh bg-ground">
        {header}
        <main className="mx-auto max-w-[480px] px-5 py-16">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{shared.name}</h1>
          <p className="mt-2 text-muted">Enter the passcode Studio Skape gave you for {portal.projectName}.</p>
          <ActionForm action={unlockPortal} submitLabel="Open" pendingLabel="Checking…" className="mt-6 space-y-4">
            <input type="hidden" name="slug" value={portal.slug} />
            <input type="hidden" name="next" value={`/${slug}`} />
            <div>
              <label htmlFor="passcode" className="field-label">Passcode</label>
              <input id="passcode" name="passcode" required autoComplete="off" autoCapitalize="none" spellCheck={false} className="field h-11 text-base" />
            </div>
          </ActionForm>
        </main>
      </div>
    );
  }

  const { register } = await portalContent(portal);
  const groups =
    shared.kind === "group"
      ? register.filter((g) => g.id === shared.id)
      : register.flatMap((g) => {
          const d = g.drawings.find((x) => x.id === shared.id);
          return d ? [{ ...g, drawings: [d] }] : [];
        });
  if (!groups.length || !groups[0].drawings.length) notFound();

  return (
    <div className="min-h-dvh bg-ground">
      {header}
      <main className="mx-auto max-w-[1136px] px-5 pb-16 pt-6 md:px-8 md:pt-8">
        <div className="mb-6">
          <p className="text-sm text-muted">{shared.kind === "group" ? "Drawings" : groups[0].name}</p>
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{shared.name}</h1>
        </div>
        <ClientRegister openAll register={groups} fileBase={`/${portal.slug}/f/`} slug={portal.slug} />
      </main>
    </div>
  );
}
