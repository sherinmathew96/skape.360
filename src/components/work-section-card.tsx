"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * A main work as a card that shows only its title row (number, name, how
 * many sub works are done, status and a bar) until it is opened.
 */
export function WorkSectionCard({
  number,
  name,
  done,
  total,
  pct,
  started = 0,
  pill,
  actions,
  heading: Heading = "h2",
  children,
}: {
  heading?: "h2" | "h3";
  number: number;
  name: string;
  done: number;
  total: number;
  pct: number;
  started?: number;
  pill: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 pr-3 md:pr-4">
        <Heading className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="group flex w-full min-w-0 items-center gap-3 py-4 pl-4 text-left md:pl-5"
          >
            <ChevronRight
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className={`flex-none text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold group-hover:text-primary">
                <span className="num mr-1.5">{number}.</span>
                {name}
              </span>
              <span className="num mt-0.5 block text-xs font-normal text-muted">
                {done} of {total} sub {total === 1 ? "work" : "works"} completed · {Math.floor(pct)}%{started ? ` · ${started} in progress` : ""}
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#00b087" : "var(--primary)" }} />
              </span>
            </span>
          </button>
        </Heading>
        <div className="flex flex-none items-center gap-1.5">
          <span className="hidden sm:inline-flex">{pill}</span>
          {actions}
        </div>
      </div>
      <div id={id} hidden={!open} className="border-t border-rule">
        {children}
      </div>
    </section>
  );
}
