import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { createShareLink, revokeShareLink } from "@/app/studio-actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyField } from "@/components/copy-field";
import { PortalSettings } from "@/components/portal-settings";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { appOrigin } from "@/lib/origin";
import { can } from "@/lib/permissions";
import { shareableDrawings } from "@/lib/drawings";
import { getProjectPortal, slugify } from "@/lib/portal";
import { listModels, listShareLinks, listTours } from "@/lib/studio";

export const metadata: Metadata = { title: "Client sharing" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function SharingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await visibleProject(user, (await params).id);
  if (!project) notFound();
  const manage = can(user.role, "share.manage");

  const [portal, links, models, tours, drawings, origin] = await Promise.all([
    getProjectPortal(project.id),
    listShareLinks(project.id),
    listModels(project.id),
    listTours(project.id),
    shareableDrawings(project.id),
    appOrigin(),
  ]);
  const itemTitle = (type: string, id: string) => {
    if (type === "site_updates") return "Site progress updates";
    if (type === "drawing_register") return "Drawing register";
    if (type === "drawing") {
      const d = drawings.find((x) => x.id === id);
      return d ? [d.number, d.title].filter(Boolean).join(" ") : undefined;
    }
    return type === "model" ? models.find((m) => m.id === id)?.title : tours.find((t) => t.id === id)?.title;
  };
  const now = new Date();
  const open = links.filter((l) => !l.revokedAt && !(l.expiresAt && l.expiresAt < now));
  const shareable = [
    ...(project.type !== "design"
      ? [{ value: `site_updates:${project.id}`, label: "Site progress updates", kind: "Reports marked for the client" }]
      : []),
    { value: `drawing_register:${project.id}`, label: "Drawing register", kind: "Live status and current revisions" },
    ...drawings.map((d) => ({ value: `drawing:${d.id}`, label: [d.number, d.title].filter(Boolean).join(" "), kind: "Drawing" })),
    ...models.map((m) => ({ value: `model:${m.id}`, label: m.title, kind: "3D model" })),
    ...tours.filter((t) => t.scenes > 0).map((t) => ({ value: `tour:${t.id}`, label: t.title, kind: "360° tour" })),
  ];

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        subtitle={`${open.length} open ${open.length === 1 ? "link" : "links"}. Clients open them without an account.`}
      />

      <div className={`grid grid-cols-1 items-start gap-3 ${manage ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <div className="grid min-w-0 grid-cols-1 gap-3">
        <section className="card p-5" aria-labelledby="portal-title">
          <h2 id="portal-title" className="card-title mb-1">Client portal</h2>
          {portal ? (
            <>
              <p className="mb-4 text-muted">
                {portal.enabled ? "The client's own page for this project: a cover, then drawings, 3D, 360° tours and site progress, always up to date." : "Closed. The address shows nothing until you open it again."}
              </p>
              {portal.enabled ? <CopyField label="Portal address" value={`${origin}/${portal.slug}`} /> : null}
              <p className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  {portal.passcodeHash ? "Passcode needed" : "No passcode"} · {portal.views} {portal.views === 1 ? "visit" : "visits"}
                  {portal.lastViewedAt ? `, last ${timeFmt.format(portal.lastViewedAt)}` : ""}
                </span>
                {portal.enabled ? (
                  <a href={`/${portal.slug}`} target="_blank" rel="noreferrer" className="font-medium text-text hover:underline">Open the portal</a>
                ) : null}
              </p>
            </>
          ) : (
            <p className="text-muted">
              {manage ? "Give the client one address for everything on this project, like a portfolio page. Set it up on the right." : "No portal yet."}
            </p>
          )}
        </section>
        <section className="card" aria-labelledby="links-title">
          <h2 id="links-title" className="card-title px-5 pb-2 pt-4">Links and embeds</h2>
          {links.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">No links yet. Create one to send the client drawings, models and tours.</p>
          ) : (
            <ul>
              {links.map((l) => {
                const expired = l.expiresAt !== null && l.expiresAt < now;
                const closed = l.revokedAt !== null || expired;
                const embed = l.title.startsWith("Embed:");
                const names = l.items.map((i) => itemTitle(i.itemType, i.itemId)).filter(Boolean);
                const url = embed && l.items[0]
                  ? `${origin}/e/${l.token}`
                  : `${origin}/s/${l.token}`;
                return (
                  <li key={l.id} className={`border-t border-rule px-5 py-4 first:border-t-0 ${closed ? "text-muted" : ""}`}>
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          {l.hasPasscode ? <Lock size={14} strokeWidth={1.5} aria-label="Needs a passcode" /> : null}
                          <span className="truncate">{l.title}</span>
                          {l.revokedAt ? <span className="pill">Revoked</span> : expired ? <span className="pill pill-warning">Expired</span> : embed ? <span className="pill">Embed</span> : null}
                        </p>
                        <p className="text-xs leading-4 text-muted">
                          {names.length > 0 ? names.join(", ") : "Shared items were deleted"}
                        </p>
                      </div>
                      <p className="num text-right text-xs leading-4 text-muted">
                        <span className="block text-sm text-text">
                          {l.views} {l.views === 1 ? "view" : "views"}
                        </span>
                        {l.lastViewedAt ? `Last ${timeFmt.format(l.lastViewedAt)}` : "Not opened yet"}
                      </p>
                    </div>
                    {!closed ? <CopyField label={`Link for ${l.title}`} value={url} /> : null}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted">
                      <span>
                        {[
                          `Made ${dateFmt.format(l.createdAt)}${l.createdByName ? ` by ${l.createdByName}` : ""}`,
                          l.expiresAt && !expired ? `expires ${dateFmt.format(l.expiresAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {manage && !l.revokedAt ? (
                        <form action={revokeShareLink}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="id" value={l.id} />
                          <ConfirmButton message={`Revoke “${l.title}”? Anyone using it will lose access at once.`}>Revoke</ConfirmButton>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>

        {manage ? (
          <div className="grid min-w-0 grid-cols-1 gap-3">
          <section className="card p-5" aria-labelledby="portal-setup-title">
            <h2 id="portal-setup-title" className="card-title mb-4">{portal ? "Portal settings" : "Set up the portal"}</h2>
            <PortalSettings
              projectId={project.id}
              origin={origin}
              suggestedSlug={slugify(project.name)}
              showSite={project.type !== "design"}
              existing={
                portal
                  ? {
                      slug: portal.slug,
                      enabled: portal.enabled,
                      hasPasscode: Boolean(portal.passcodeHash),
                      coverUrl: portal.coverFileId ? `/api/files/${portal.coverFileId}` : null,
                      brief: portal.brief,
                      area: portal.area,
                      sections: portal.sections,
                    }
                  : null
              }
            />
          </section>
          <section className="card p-5" aria-labelledby="new-link-title">
            <h2 id="new-link-title" className="card-title mb-1">New client link</h2>
            <p className="mb-4 text-muted">Send it by WhatsApp or email. It opens on any phone or computer.</p>
            {shareable.length === 0 ? (
              <p className="empty">Issue a drawing, upload a 3D model or build a 360° tour first.</p>
            ) : (
              <ActionForm action={createShareLink} submitLabel="Create link" pendingLabel="Creating…" className="space-y-4">
                <input type="hidden" name="projectId" value={project.id} />
                <div>
                  <label htmlFor="link-title" className="field-label">Title the client sees</label>
                  <input id="link-title" name="title" required defaultValue={`${project.name}: design presentation`} autoComplete="off" className="field" />
                </div>
                <fieldset>
                  <legend className="field-label">Share</legend>
                  <ul className="space-y-1">
                    {shareable.map((it) => (
                      <li key={it.value}>
                        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-ground">
                          <input type="checkbox" name="item" value={it.value} defaultChecked className="h-4 w-4 accent-primary" />
                          <span className="min-w-0 flex-1 truncate">{it.label}</span>
                          <span className="flex-none text-xs text-muted">{it.kind}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <div>
                  <label htmlFor="link-message" className="field-label">Note to the client</label>
                  <textarea id="link-message" name="message" rows={3} className="field h-auto py-2" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div>
                    <label htmlFor="link-passcode" className="field-label">Passcode</label>
                    <input id="link-passcode" name="passcode" autoComplete="off" spellCheck={false} aria-describedby="passcode-help" className="field" />
                    <p id="passcode-help" className="mt-2 text-xs text-muted">Optional. Tell the client separately.</p>
                  </div>
                  <div>
                    <label htmlFor="link-expires" className="field-label">Expires</label>
                    <input id="link-expires" name="expires" type="date" aria-describedby="expires-help" className="field" />
                    <p id="expires-help" className="mt-2 text-xs text-muted">Optional. Works through that day.</p>
                  </div>
                </div>
              </ActionForm>
            )}
          </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
