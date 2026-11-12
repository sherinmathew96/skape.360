import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { unlockFirm } from "@/app/firm-actions";
import { ActionForm } from "@/components/action-form";
import { Mark } from "@/components/mark";
import type { FirmProjectCard } from "@/lib/firms";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-6 md:px-8">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Mark size={28} />
          Studio Skape
        </span>
        <span className="text-xs text-muted">Architecture and interiors, Kochi</span>
      </header>
      <main className="mx-auto max-w-[1200px] px-5 pb-16 md:px-8">{children}</main>
    </div>
  );
}

/** Before the passcode: the firm's name only. */
export function FirmLocked({ name, slug }: { name: string; slug: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-[440px] pt-10 md:pt-20">
        <div className="card p-7">
          <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-active text-primary" aria-hidden="true">
            <Building2 size={26} strokeWidth={1.6} />
          </span>
          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em]">{name}</h1>
          <p className="mb-6 mt-2 text-muted">Enter the passcode Studio Skape gave you to see your projects.</p>
          <ActionForm action={unlockFirm} submitLabel="Open" pendingLabel="Checking…" className="space-y-4">
            <input type="hidden" name="slug" value={slug} />
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

/** The firm's page: a card for every project the studio did for it. */
export function FirmProjects({ name, projects }: { name: string; projects: FirmProjectCard[] }) {
  const live = projects.filter((p) => p.status === "active").length;
  return (
    <Shell>
      <div className="mb-8 mt-2 md:mb-10 md:mt-6">
        <h1 className="text-[clamp(32px,4.4vw,56px)] font-semibold leading-[1.05] tracking-[-0.03em]">{name}</h1>
        <p className="mt-3 max-w-[60ch] text-lg leading-7 text-muted">
          {projects.length
            ? `${projects.length} ${projects.length === 1 ? "project" : "projects"} designed by Studio Skape${live ? `, ${live} in progress` : ""}. Open one to see its drawings, 3D, 360° tours and progress.`
            : "Your projects with Studio Skape will appear here."}
        </p>
      </div>

      {projects.length ? (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const pct = p.stagesTotal ? Math.round((p.stagesDone / p.stagesTotal) * 100) : 0;
            const body = (
              <>
                <span className="relative block aspect-[4/3] overflow-hidden bg-active">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" width={640} height={480} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[56px] font-semibold tracking-[-0.04em] text-primary/40" aria-hidden="true">
                      {p.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <span className={`pill absolute left-3 top-3 ${p.status === "active" ? "pill-positive" : p.status === "on_hold" ? "pill-warning" : ""}`}>
                    {p.status === "active" ? "In progress" : p.status === "on_hold" ? "On hold" : p.status === "completed" ? "Completed" : "Closed"}
                  </span>
                </span>
                <span className="block p-5">
                  <span className="block truncate text-lg font-semibold tracking-[-0.01em]">{p.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {[p.clientName, p.location].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-4 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.stage}</span>
                    <span className="num flex-none text-xs text-muted">
                      {PROJECT_TYPE_LABEL[p.type]}
                      {p.dueDate ? ` · ${monthFmt.format(new Date(`${p.dueDate}T00:00:00Z`))}` : ""}
                    </span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <span className="block h-full rounded-full bg-mint-ink" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="sr-only">
                    {p.stagesDone} of {p.stagesTotal} stages done.
                  </span>
                  {p.portalSlug ? (
                    <span className="mt-4 flex items-center gap-1.5 text-sm font-medium text-primary">
                      Open project <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  ) : (
                    <span className="mt-4 block text-sm text-muted">Not shared yet</span>
                  )}
                </span>
              </>
            );
            return (
              <li key={p.id}>
                {p.portalSlug ? (
                  <Link href={`/${p.portalSlug}`} className="card group block h-full overflow-hidden transition-transform hover:-translate-y-0.5 motion-reduce:transition-none">
                    {body}
                  </Link>
                ) : (
                  <div className="card block h-full overflow-hidden">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">No projects yet.</p>
      )}
      <p className="mt-12 text-xs text-muted">Shared privately with {name} by Studio Skape. Please do not forward this address.</p>
    </Shell>
  );
}
