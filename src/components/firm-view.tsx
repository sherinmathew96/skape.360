import { Lock } from "lucide-react";
import { unlockFirm } from "@/app/firm-actions";
import { ActionForm } from "@/components/action-form";
import { FirmGrid } from "@/components/firm-grid";
import { Mark } from "@/components/mark";
import type { FirmProjectCard } from "@/lib/firms";

const initials = (name: string) =>
  name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-6 md:px-8">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Mark size={30} />
          Studio Skape
        </span>
        <span className="hidden text-xs text-muted sm:block">Architecture and interiors, Kochi</span>
      </header>
      <main className="mx-auto max-w-[1200px] px-5 pb-20 md:px-8">{children}</main>
    </div>
  );
}

/** Before the passcode: the firm's name only. */
export function FirmLocked({ name, slug }: { name: string; slug: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-[440px] pt-8 md:pt-16">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-4 bg-primary px-7 py-7 text-white">
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-white/15 text-lg font-semibold" aria-hidden="true">
              {initials(name)}
            </span>
            <h1 className="min-w-0 text-2xl font-semibold leading-8 tracking-[-0.02em]">{name}</h1>
          </div>
          <div className="p-7">
            <p className="mb-6 flex items-center gap-2 text-muted">
              <Lock size={16} strokeWidth={1.8} aria-hidden="true" /> Enter your passcode to see your projects.
            </p>
            <ActionForm action={unlockFirm} submitLabel="Open" pendingLabel="Checking…" className="space-y-4">
              <input type="hidden" name="slug" value={slug} />
              <div>
                <label htmlFor="passcode" className="field-label">Passcode</label>
                <input id="passcode" name="passcode" required autoComplete="off" autoCapitalize="none" spellCheck={false} className="field" />
              </div>
            </ActionForm>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/** The firm's page: its name and figures in a banner, then a card for every project. */
export function FirmProjects({ name, projects }: { name: string; projects: FirmProjectCard[] }) {
  const running = projects.filter((p) => p.status === "active" || p.status === "on_hold").length;
  const done = projects.filter((p) => p.status === "completed").length;
  const figures = [
    { label: projects.length === 1 ? "Project" : "Projects", value: projects.length },
    { label: "In progress", value: running },
    { label: "Completed", value: done },
  ];

  return (
    <Shell>
      <section aria-labelledby="firm-name" className="mb-10 overflow-hidden rounded-[28px] bg-primary text-white shadow-[0_24px_60px_rgba(89,50,234,0.25)]">
        <div className="flex flex-col gap-8 px-6 py-8 md:flex-row md:items-end md:justify-between md:px-10 md:py-10">
          <div className="flex min-w-0 items-center gap-5">
            <span className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-white/15 text-xl font-semibold md:h-20 md:w-20 md:text-2xl" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="min-w-0">
              <h1 id="firm-name" className="text-[clamp(30px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.03em]">{name}</h1>
              <p className="mt-2 text-white/75">Projects with Studio Skape</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 md:flex md:gap-3">
            {figures.map((f) => (
              <div key={f.label} className="flex flex-col-reverse rounded-2xl bg-white/12 px-4 py-3 md:min-w-[112px] md:px-5">
                <dt className="text-xs text-white/75">{f.label}</dt>
                <dd className="num text-2xl font-semibold leading-8 md:text-[28px]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {projects.length ? <FirmGrid projects={projects} /> : <p className="empty">Your projects will appear here.</p>}
    </Shell>
  );
}
