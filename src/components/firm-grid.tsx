"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Building, MapPin } from "lucide-react";
import type { FirmProjectCard } from "@/lib/firms";
import { PROJECT_TYPE_LABEL } from "@/lib/stages";

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const STATUS: Record<FirmProjectCard["status"], { label: string; tone: string }> = {
  active: { label: "In progress", tone: "bg-white text-primary" },
  on_hold: { label: "On hold", tone: "bg-[#fff6e5] text-[#8a5300]" },
  completed: { label: "Completed", tone: "bg-[#e5f8f2] text-[#00775a]" },
  cancelled: { label: "Closed", tone: "bg-white text-muted" },
};

type Filter = "all" | "active" | "completed";

/** The firm's projects as cards, with tabs when some are running and some are done. */
export function FirmGrid({ projects }: { projects: FirmProjectCard[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const running = projects.filter((p) => p.status === "active" || p.status === "on_hold").length;
  const done = projects.filter((p) => p.status === "completed").length;
  const tabs: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All projects", n: projects.length },
    { id: "active", label: "In progress", n: running },
    { id: "completed", label: "Completed", n: done },
  ];
  const showTabs = running > 0 && done > 0;
  const shown = projects.filter((p) =>
    filter === "all" ? true : filter === "active" ? p.status === "active" || p.status === "on_hold" : p.status === "completed",
  );

  return (
    <>
      {showTabs ? (
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 shadow-[var(--lift)] sm:inline-flex" role="tablist" aria-label="Show">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`flex h-10 flex-none items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                filter === t.id ? "bg-primary text-white" : "text-muted hover:bg-active hover:text-primary"
              }`}
            >
              {t.label}
              <span className={`num rounded-full px-1.5 text-xs ${filter === t.id ? "bg-white/20" : "bg-raised"}`}>{t.n}</span>
            </button>
          ))}
        </div>
      ) : null}

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => {
          const pct = p.stagesTotal ? Math.round((p.stagesDone / p.stagesTotal) * 100) : 0;
          const status = STATUS[p.status];
          const inner = (
            <>
              <span className="relative block aspect-[16/10] overflow-hidden bg-[#f1eeff]">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt=""
                    width={720}
                    height={450}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                ) : (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-primary/70" aria-hidden="true">
                    <Building size={44} strokeWidth={1.2} />
                    <span className="text-sm font-medium tracking-[0.02em] text-primary/60">{p.name}</span>
                  </span>
                )}
                <span className={`absolute left-4 top-4 inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold shadow-sm ${status.tone}`}>
                  {status.label}
                </span>
              </span>

              <span className="flex flex-1 flex-col p-6">
                <span className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block truncate text-xl font-semibold tracking-[-0.01em]">{p.name}</span>
                    <span className="mt-1 block truncate text-sm text-muted">{p.clientName}</span>
                  </span>
                  {p.portalSlug ? (
                    <span
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-active text-primary transition-colors group-hover:bg-primary group-hover:text-white"
                      aria-hidden="true"
                    >
                      <ArrowUpRight size={18} strokeWidth={1.8} />
                    </span>
                  ) : null}
                </span>

                <span className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {p.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} strokeWidth={1.8} aria-hidden="true" />
                      {p.location}
                    </span>
                  ) : null}
                  <span>{PROJECT_TYPE_LABEL[p.type]}</span>
                  {p.dueDate ? <span className="num">Due {monthFmt.format(new Date(`${p.dueDate}T00:00:00Z`))}</span> : null}
                </span>

                <span className="mt-auto block pt-5">
                  <span className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.stage}</span>
                    <span className="num flex-none text-xs text-muted">
                      {p.stagesTotal ? `${p.stagesDone} of ${p.stagesTotal} stages` : ""}
                    </span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <span className="block h-full rounded-full bg-mint-ink" style={{ width: `${pct}%` }} />
                  </span>
                </span>
              </span>
            </>
          );
          return (
            <li key={p.id} className="flex">
              {p.portalSlug ? (
                <Link
                  href={`/${p.portalSlug}`}
                  aria-label={`Open ${p.name}`}
                  className="card group flex w-full flex-col overflow-hidden transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(89,50,234,0.12)] motion-reduce:transition-none"
                >
                  {inner}
                </Link>
              ) : (
                <div className="card flex w-full flex-col overflow-hidden opacity-80">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
