import type { Metadata } from "next";
import { unlockShare } from "@/app/studio-actions";
import { ActionForm } from "@/components/action-form";
import { ClientDecision } from "@/components/client-decision";
import { ClientRegister } from "@/components/client-register";
import { DrawingViewer } from "@/components/drawing-viewer";
import { Mark } from "@/components/mark";
import { ModelViewer } from "@/components/model-viewer";
import { TourViewer } from "@/components/tour-viewer";
import { loadShare, loadSharedItems, logShareView } from "@/lib/share";

type Props = { params: Promise<{ token: string }> };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: process.env.APP_TIMEZONE || undefined });
/** For date-only values (YYYY-MM-DD), which carry no time of day. */
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state, link } = await loadShare((await params).token);
  return {
    title: { absolute: state === "ok" && link ? `${link.title} · Studio Skape` : "Studio Skape" },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="mx-auto flex max-w-[1136px] items-center gap-2.5 px-4 py-5 md:px-8">
        <Mark size={24} />
        <span className="font-medium">Studio Skape</span>
      </header>
      <main className="mx-auto max-w-[1136px] px-4 pb-16 md:px-8">{children}</main>
    </div>
  );
}

const STATE_TEXT = {
  missing: ["This link does not exist", "Check that you copied the whole link, or ask the studio to send it again."],
  revoked: ["This link has been switched off", "Ask the studio for a new link."],
  expired: ["This link has expired", "Ask the studio for a new link."],
} as const;

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const { state, link } = await loadShare(token);

  if (state === "missing" || state === "revoked" || state === "expired" || !link) {
    const [title, body] = STATE_TEXT[state === "revoked" || state === "expired" ? state : "missing"];
    return (
      <Shell>
        <div className="mx-auto max-w-[480px] pt-16">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{title}</h1>
          <p className="mt-2 text-muted">{body}</p>
        </div>
      </Shell>
    );
  }

  if (state === "locked") {
    return (
      <Shell>
        <div className="mx-auto max-w-[400px] pt-12">
          <div className="card p-6">
            <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{link.title}</h1>
            <p className="mb-6 mt-1 text-muted">Enter the passcode Studio Skape gave you.</p>
            <ActionForm action={unlockShare} submitLabel="Open" pendingLabel="Checking…" className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label htmlFor="passcode" className="field-label">Passcode</label>
                <input id="passcode" name="passcode" required autoComplete="off" autoCapitalize="none" spellCheck={false} className="field" />
              </div>
            </ActionForm>
          </div>
        </div>
      </Shell>
    );
  }

  const [{ models, tours, drawings, siteUpdates, register, order }] = await Promise.all([loadSharedItems(link.id), logShareView(link.id, "page")]);
  const fileBase = `/s/${token}/f/`;

  return (
    <Shell>
      <div className="mb-8 max-w-[760px]">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em] md:text-[32px] md:leading-10">{link.title}</h1>
        <p className="mt-1 text-muted">
          {link.projectName} · for {link.clientName}
        </p>
        {link.message ? <p className="mt-4 whitespace-pre-line text-base leading-6">{link.message}</p> : null}
      </div>

      {order.length === 0 ? (
        <p className="empty">Nothing is shared on this link any more.</p>
      ) : (
        <div className="space-y-10">
          {order.map((item) => {
            if (item.itemType === "site_updates") {
              return (
                <section key="site" aria-labelledby="site-progress">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 id="site-progress" className="text-lg font-medium leading-7">Site progress</h2>
                    <p className="text-xs text-muted">
                      {siteUpdates.length ? `${siteUpdates.length} ${siteUpdates.length === 1 ? "update" : "updates"}, newest first` : ""}
                    </p>
                  </div>
                  {siteUpdates.length === 0 ? (
                    <p className="empty">No site updates yet. They will appear here as work progresses.</p>
                  ) : (
                    <ol className="space-y-3">
                      {siteUpdates.map((r) => (
                        <li key={r.id} className="card p-5">
                          <p className="num mb-1 font-medium">{dayFmt.format(new Date(`${r.date}T00:00:00Z`))}</p>
                          <p className="whitespace-pre-line">{r.workDone}</p>
                          {r.photos.length > 0 ? (
                            <ul className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
                              {r.photos.map((p, i) => (
                                <li key={p.id}>
                                  <a href={`${fileBase}${p.fileId}`} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`${fileBase}${p.fileId}`}
                                      alt={`Site photo ${i + 1}, ${dayFmt.format(new Date(`${r.date}T00:00:00Z`))}`}
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
                      ))}
                    </ol>
                  )}
                </section>
              );
            }
            if (item.itemType === "drawing_register") {
              const count = register.reduce((n, g) => n + g.drawings.length, 0);
              return (
                <section key="register" aria-labelledby="drawing-register">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 id="drawing-register" className="text-lg font-medium leading-7">Drawings</h2>
                    <p className="text-xs text-muted">{count ? `${count} ${count === 1 ? "drawing" : "drawings"} · status updated by the studio` : ""}</p>
                  </div>
                  {count === 0 ? (
                    <p className="empty">No drawings listed yet. They will appear here with their status.</p>
                  ) : (
                    <ClientRegister register={register} token={token} fileBase={fileBase} />
                  )}
                </section>
              );
            }
            if (item.itemType === "drawing") {
              const d = drawings.find((x) => x.id === item.itemId);
              if (!d) return null;
              const rev = d.revision;
              const label = `R${rev.rev}`;
              return (
                <section key={d.id} aria-labelledby={`d-${d.id}`}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 id={`d-${d.id}`} className="text-lg font-medium leading-7">
                      {d.title} <span className="font-mono text-sm font-normal text-muted">{d.number} {label}</span>
                    </h2>
                    <p className="text-xs text-muted">Drawing · issued {dateFmt.format(rev.issuedAt ?? rev.createdAt)}</p>
                  </div>
                  <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="card overflow-hidden">
                      <DrawingViewer src={`${fileBase}${rev.fileId}`} contentType={rev.contentType} title={`${[d.number, d.title].filter(Boolean).join(" ")} ${label}`} />
                    </div>
                    <div className="card p-5">
                      {rev.note ? (
                        <>
                          <h3 className="mb-1 font-medium">What changed</h3>
                          <p className="mb-4 whitespace-pre-line text-muted">{rev.note}</p>
                        </>
                      ) : null}
                      {rev.status === "issued" ? (
                        <ClientDecision token={token} revisionId={rev.id} label={label} />
                      ) : rev.decision ? (
                        <div role="status">
                          <p className={rev.decision.decision === "approved" ? "font-medium text-positive" : "font-medium text-negative"}>
                            {rev.decision.decision === "approved" ? `${label} approved` : "Changes requested"}
                          </p>
                          <p className="text-muted">
                            by {rev.decision.name}, {dateFmt.format(rev.decision.createdAt)}
                          </p>
                          {rev.decision.comment ? <p className="mt-3 whitespace-pre-line">{rev.decision.comment}</p> : null}
                          {rev.decision.decision === "changes_requested" ? (
                            <p className="mt-3 text-xs text-muted">The studio will share a revised drawing on this link.</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            }
            if (item.itemType === "model") {
              const m = models.find((x) => x.id === item.itemId);
              if (!m) return null;
              return (
                <section key={m.id} aria-labelledby={`m-${m.id}`}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 id={`m-${m.id}`} className="text-lg font-medium leading-7">{m.title}</h2>
                    <p className="text-xs text-muted">3D model · drag to turn, pinch to zoom, or pick a view below</p>
                  </div>
                  <div className="card overflow-hidden">
                    <ModelViewer
                      src={`${fileBase}${m.fileId}`}
                      title={m.title}
                      poster={m.coverFileId ? `${fileBase}${m.coverFileId}` : null}
                      view={m.view}
                      className="aspect-[4/5] w-full sm:aspect-[4/3] md:aspect-[16/9]"
                    />
                  </div>
                </section>
              );
            }
            const t = tours.find((x) => x.id === item.itemId);
            if (!t || t.scenes.length === 0) return null;
            return (
              <section key={t.id} aria-labelledby={`t-${t.id}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 id={`t-${t.id}`} className="text-lg font-medium leading-7">{t.title}</h2>
                  <p className="text-xs text-muted">
                    360° tour · {t.scenes.length} {t.scenes.length === 1 ? "room" : "rooms"} · drag to look, tap arrows to move
                  </p>
                </div>
                <div className="card overflow-hidden">
                  <TourViewer tour={t} fileBase={fileBase} className="aspect-[4/3] md:aspect-[16/9]" />
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-12 text-xs text-muted">Shared privately by Studio Skape. Please do not forward this link.</p>
    </Shell>
  );
}
