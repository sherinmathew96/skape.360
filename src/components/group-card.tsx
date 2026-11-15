"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";

// ── Collapsible group card ─────────────────────────────────────────────────

const OPEN_KEY = (scope: string) => `skape_open_groups_${scope}`;
const openListeners = new Set<() => void>();

function readOpen(projectId: string): string {
  try {
    return localStorage.getItem(OPEN_KEY(projectId)) ?? "";
  } catch {
    return "";
  }
}

function setOpen(projectId: string, key: string, open: boolean) {
  const keys = new Set(readOpen(projectId).split(",").filter(Boolean));
  if (open) keys.add(key);
  else keys.delete(key);
  try {
    localStorage.setItem(OPEN_KEY(projectId), [...keys].join(","));
  } catch {}
  openListeners.forEach((l) => l());
}

const subscribeOpen = (l: () => void) => {
  openListeners.add(l);
  return () => openListeners.delete(l);
};

/**
 * A drawing group as a card that folds to its title row. Which groups are
 * open is remembered on this device; a project with one group starts open.
 */
export function GroupCard({
  projectId,
  groupKey,
  name,
  count,
  startOpen,
  forceOpen = false,
  controls,
  children,
}: {
  projectId: string;
  groupKey: string;
  name: string;
  count: number;
  startOpen: boolean;
  /** Open regardless, e.g. while searching */
  forceOpen?: boolean;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const saved = useSyncExternalStore(subscribeOpen, () => readOpen(projectId), () => "");
  const [touched, setTouched] = useState(false);
  const open = forceOpen || saved.split(",").includes(groupKey) || (!touched && !saved && startOpen);
  const id = useId();
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 pr-3">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => {
              setTouched(true);
              setOpen(projectId, groupKey, !open);
            }}
            className="group flex w-full min-w-0 items-center gap-2.5 py-3.5 pl-4 text-left"
          >
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className={`flex-none text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
            <span className="card-title min-w-0 truncate group-hover:text-primary">{name}</span>
            <span className="num flex-none text-sm font-normal text-muted">{count}</span>
          </button>
        </h2>
        {controls}
      </div>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
