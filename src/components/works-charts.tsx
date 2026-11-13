import { Check } from "lucide-react";
import type { WorkStatus } from "@/db/schema";
import type { SectionSummary, WorksSummary } from "@/lib/works";

export const WORK_STATUS: Record<
  WorkStatus,
  { label: string; pill: string; color: string }
> = {
  pending: { label: "Not started", pill: "pill", color: "#d4d7e5" },
  started: {
    label: "In progress",
    pill: "pill pill-warning",
    color: "#f0a020",
  },
  done: { label: "Completed", pill: "pill pill-positive", color: "#00b087" },
};

export function WorkStatusPill({ status }: { status: WorkStatus }) {
  return (
    <span className={WORK_STATUS[status].pill}>
      {WORK_STATUS[status].label}
    </span>
  );
}

const pctText = (pct: number) =>
  `${pct > 0 && pct < 1 ? "<1" : Math.floor(pct)}%`;

/** The big ring: how much of the project is complete. */
export function ProgressRing({
  pct,
  size = 152,
  caption,
}: {
  pct: number;
  size?: number;
  caption?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative flex-none"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pctText(pct)} complete`}
    >
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--raised)"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`}
        />
      </svg>
      <span
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <span className="num text-[30px] font-semibold leading-none tracking-[-0.02em]">
          {pctText(pct)}
        </span>
        {caption ? (
          <span className="mt-1 text-xs text-muted">{caption}</span>
        ) : null}
      </span>
    </div>
  );
}

/** One bar split into completed, in progress and not started, with a legend. */
export function StatusSplit({
  summary,
}: {
  summary: Pick<WorksSummary, "done" | "started" | "pending" | "total">;
}) {
  const parts = (["done", "started", "pending"] as const).map((k) => ({
    k,
    n: summary[k],
  }));
  return (
    <div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-raised"
        aria-hidden="true"
      >
        {parts.map((p) =>
          p.n ? (
            <span
              key={p.k}
              style={{
                width: `${(p.n / summary.total) * 100}%`,
                background: WORK_STATUS[p.k].color,
              }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.k} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: WORK_STATUS[p.k].color }}
              aria-hidden="true"
            />
            <span className="text-muted">{WORK_STATUS[p.k].label}</span>
            <span className="num font-semibold">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The sections in the order they are done on site, as connected steps. */
export function WorkSequence({ sections }: { sections: SectionSummary[] }) {
  return (
    <ol
      className="-mx-1 flex snap-x gap-0 overflow-x-auto px-1 pb-1"
      aria-label="Order of work"
    >
      {sections.map((sec, i) => {
        const st = WORK_STATUS[sec.status];
        return (
          <li
            key={sec.name}
            className="relative flex w-[132px] flex-none snap-start flex-col items-center px-1 text-center"
          >
            {i > 0 ? (
              <span
                className="absolute right-1/2 top-[18px] h-[3px] w-full -translate-y-1/2"
                style={{
                  background:
                    sections[i - 1].status === "done"
                      ? WORK_STATUS.done.color
                      : "var(--raised)",
                }}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                sec.status === "done"
                  ? "border-transparent text-white"
                  : sec.status === "started"
                    ? "bg-surface"
                    : "border-[#d4d7e5] bg-surface text-muted"
              }`}
              style={
                sec.status === "done"
                  ? { background: st.color }
                  : sec.status === "started"
                    ? { borderColor: st.color, color: "#8a5300" }
                    : undefined
              }
            >
              {sec.status === "done" ? (
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
              ) : (
                i + 1
              )}
            </span>
            <span className="mt-2 line-clamp-2 text-sm font-medium leading-5">
              {sec.name}
            </span>
            <span className="num text-xs text-muted">
              {st.label === "In progress"
                ? `${Math.floor(sec.pct)}% done`
                : st.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Each section's share complete, as bars. */
export function SectionBars({ sections }: { sections: SectionSummary[] }) {
  const list = (
    <ul className="space-y-4">
      {sections.map((sec) => (
        <li key={sec.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{sec.name}</span>
            <span className="num flex-none text-muted">
              {sec.done}/{sec.works.length} ·{" "}
              <span className="font-semibold text-text">
                {pctText(sec.pct)}
              </span>
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-raised"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(sec.pct > 0 ? 2 : 0, sec.pct)}%`,
                background:
                  sec.status === "done"
                    ? WORK_STATUS.done.color
                    : "var(--primary)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
  // A long BOQ scrolls inside its card instead of stretching the page.
  return sections.length > 8 ? (
    <Scroller label="Progress by main work" max="max-h-[352px]">
      {list}
    </Scroller>
  ) : (
    list
  );
}

/** A box that scrolls on its own, reachable by keyboard, with a fade at the bottom while there is more. */
function Scroller({
  label,
  max,
  children,
}: {
  label: string;
  max: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className={`${max} overflow-y-auto overscroll-contain pb-2 pr-2 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-primary`}
      >
        {children}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

const dayMs = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const monthFmt = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});
const yearFmt = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * The timeline: each section's planned span (light) and the actual span
 * (green when finished, amber while running), with a line for today.
 */
export function WorksGantt({
  sections,
  today,
}: {
  sections: SectionSummary[];
  today: string;
}) {
  const rows = sections.map((sec) => ({
    sec,
    plan:
      sec.plannedStart && sec.plannedEnd
        ? [sec.plannedStart, sec.plannedEnd]
        : sec.plannedStart
          ? [sec.plannedStart, sec.plannedStart]
          : null,
    actual: sec.startedOn ? [sec.startedOn, sec.completedOn ?? today] : null,
  }));
  const dates = rows.flatMap((r) => [...(r.plan ?? []), ...(r.actual ?? [])]);
  if (!dates.length) return null;
  dates.push(today);
  const lo = Math.min(...dates.map(ms));
  const hi = Math.max(...dates.map(ms)) + dayMs;
  const span = Math.max(hi - lo, 14 * dayMs);
  const at = (iso: string) => ((ms(iso) - lo) / span) * 100;
  const width = (a: string, b: string) =>
    Math.max(((ms(b) + dayMs - ms(a)) / span) * 100, 1.2);

  // Month ticks along the top.
  const ticks: { left: number; label: string }[] = [];
  const d = new Date(lo);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const crossesYear =
    new Date(lo).getUTCFullYear() !== new Date(hi).getUTCFullYear();
  while (d.getTime() < lo + span) {
    ticks.push({
      left: ((d.getTime() - lo) / span) * 100,
      label: (crossesYear ? yearFmt : monthFmt).format(d),
    });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const todayLeft = at(today);

  const chart = (
    <div className="flex gap-4 pb-5">
      <div className="hidden w-[180px] flex-none md:block" aria-hidden="true">
        <div className="h-6" />
        {rows.map(({ sec }) => (
          <p
            key={sec.name}
            className="mb-3 flex h-8 items-center truncate text-sm font-medium"
          >
            {sec.name}
          </p>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="relative h-6 text-xs text-muted" aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t.left}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${t.left}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
        {rows.map(({ sec, plan, actual }) => (
          <div key={sec.name} className="mb-3">
            <p className="relative z-10 mb-1 w-fit max-w-full truncate bg-surface pr-2 text-sm font-medium md:hidden">
              {sec.name}
            </p>
            <div className="relative h-8 rounded-md bg-ground">
              {ticks.map((t) => (
                <span
                  key={t.left}
                  className="absolute inset-y-0 w-px bg-rule"
                  style={{ left: `${t.left}%` }}
                  aria-hidden="true"
                />
              ))}
              {plan ? (
                <span
                  className="absolute top-1 h-2.5 rounded-full border border-[#c9bdf9] bg-[#eeeaff]"
                  style={{
                    left: `${at(plan[0])}%`,
                    width: `${width(plan[0], plan[1])}%`,
                  }}
                  title={`Planned ${dayFmt.format(new Date(ms(plan[0])))} – ${dayFmt.format(new Date(ms(plan[1])))}`}
                />
              ) : null}
              {actual ? (
                <span
                  className="absolute bottom-1 h-3 rounded-full"
                  style={{
                    left: `${at(actual[0])}%`,
                    width: `${width(actual[0], actual[1])}%`,
                    background:
                      WORK_STATUS[sec.status === "done" ? "done" : "started"]
                        .color,
                  }}
                  title={`${sec.status === "done" ? "Done" : "Running"} ${dayFmt.format(new Date(ms(actual[0])))} – ${sec.completedOn ? dayFmt.format(new Date(ms(actual[1]))) : "today"}`}
                />
              ) : null}
              <span className="sr-only">
                {sec.name}:{" "}
                {plan
                  ? `planned ${dayFmt.format(new Date(ms(plan[0])))} to ${dayFmt.format(new Date(ms(plan[1])))}. `
                  : ""}
                {actual
                  ? `${sec.status === "done" ? "done" : "started"} ${dayFmt.format(new Date(ms(actual[0])))}${sec.completedOn ? ` to ${dayFmt.format(new Date(ms(actual[1])))}` : ""}.`
                  : "not started."}
              </span>
            </div>
          </div>
        ))}
        <span
          className="pointer-events-none absolute bottom-3 top-6 w-0.5 bg-negative/70"
          style={{ left: `${todayLeft}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute -bottom-3 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-negative"
          style={{ left: `${Math.min(96, Math.max(4, todayLeft))}%` }}
          aria-hidden="true"
        >
          Today
        </span>
      </div>
    </div>
  );

  return (
    <div>
      {rows.length > 10 ? (
        <Scroller label="Timeline of main works" max="max-h-[520px]">
          {chart}
        </Scroller>
      ) : (
        chart
      )}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span
            className="h-2.5 w-6 rounded-full border border-[#c9bdf9] bg-[#eeeaff]"
            aria-hidden="true"
          />
          Planned
        </li>
        <li className="flex items-center gap-2">
          <span
            className="h-2.5 w-6 rounded-full"
            style={{ background: WORK_STATUS.started.color }}
            aria-hidden="true"
          />
          In progress
        </li>
        <li className="flex items-center gap-2">
          <span
            className="h-2.5 w-6 rounded-full"
            style={{ background: WORK_STATUS.done.color }}
            aria-hidden="true"
          />
          Completed
        </li>
      </ul>
    </div>
  );
}
