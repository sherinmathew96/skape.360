"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, FileText, Search, X } from "lucide-react";
import type { DrawingStatus } from "@/db/schema";
import type { clientRegister } from "@/lib/drawings";
import { STATUS_ORDER, STATUS_STYLE, StatusChip } from "./drawing-status";
import { DrawingViewer } from "./drawing-viewer";

type Register = Awaited<ReturnType<typeof clientRegister>>;
type Drawing = Register[number]["drawings"][number];

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * The client's drawings: search, group and status filters over a grid of
 * drawing cards. A card opens the current revision full screen, with the
 * previous and next drawing a tap (or arrow key) away.
 */
export function ClientRegister({
  register,
  fileBase,
  initialId,
}: {
  register: Register;
  fileBase: string;
  /** Opens this drawing straight away */
  initialId?: string;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [status, setStatus] = useState<DrawingStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(() => {
    const d = register.flatMap((g) => g.drawings).find((x) => x.id === initialId);
    return d?.revision ? d.id : null;
  });
  const closeRef = useRef<HTMLButtonElement>(null);

  const groups = useMemo(
    () =>
      register.map((g) => ({
        key: g.id ?? "general",
        name: g.name,
        drawings: g.drawings.filter((d) => {
          const q = query.trim().toLowerCase();
          if (q && !`${d.title} ${d.number ?? ""}`.toLowerCase().includes(q)) return false;
          return status === "all" || d.status === status;
        }),
      })),
    [register, query, status],
  );
  const shownGroups = groups.filter((g) => (group === "all" || g.key === group) && g.drawings.length > 0);
  // The order the viewer steps through: what's on screen, drawings with a file only.
  const viewable = shownGroups.flatMap((g) => g.drawings).filter((d) => d.revision);
  const all = register.flatMap((g) => g.drawings);
  const open = all.find((d) => d.id === openId) ?? null;
  const at = open ? viewable.findIndex((d) => d.id === open.id) : -1;
  const counts = STATUS_ORDER.map((st) => ({ st, n: all.filter((d) => d.status === st).length })).filter((c) => c.n > 0);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
      if (e.key === "ArrowRight" && at >= 0 && at < viewable.length - 1) setOpenId(viewable[at + 1].id);
      if (e.key === "ArrowLeft" && at > 0) setOpenId(viewable[at - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, at, viewable]);

  const chip = (active: boolean) =>
    `flex h-10 flex-none items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
      active ? "bg-primary text-white" : "bg-surface text-muted shadow-[var(--lift)] hover:text-primary"
    }`;

  return (
    <>
      {/* Find: by name, by group, by status. */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-60">
            <label htmlFor="drawing-search" className="sr-only">Search drawings</label>
            <Search size={18} strokeWidth={1.6} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9197b3]" />
            <input
              id="drawing-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drawings"
              autoComplete="off"
              className="field h-11 border-transparent bg-surface pl-11 shadow-[var(--lift)]"
            />
          </div>
          <div>
            <label htmlFor="drawing-status" className="sr-only">Status</label>
            <select
              id="drawing-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as DrawingStatus | "all")}
              className="field h-11 w-auto cursor-pointer border-transparent bg-surface pr-9 shadow-[var(--lift)]"
            >
              <option value="all">All statuses</option>
              {counts.map(({ st, n }) => (
                <option key={st} value={st}>
                  {STATUS_STYLE[st].label} ({n})
                </option>
              ))}
            </select>
          </div>
        </div>
        {register.length > 1 ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Groups">
            <button type="button" aria-pressed={group === "all"} onClick={() => setGroup("all")} className={chip(group === "all")}>
              All <span className="num opacity-70">{all.length}</span>
            </button>
            {register.map((g) => {
              const key = g.id ?? "general";
              return (
                <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} className={chip(group === key)}>
                  {g.name} <span className="num opacity-70">{g.drawings.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {shownGroups.length === 0 ? (
        <p className="empty">No drawings match. Clear the search or pick another group or status.</p>
      ) : (
        <div className="space-y-6">
          {shownGroups.map((g) => (
            <section key={g.key} className="card overflow-hidden" aria-labelledby={`group-${g.key}`}>
              <h2 id={`group-${g.key}`} className="px-5 pb-3 pt-5 text-lg font-semibold tracking-[-0.01em] md:px-6">
                {g.name} <span className="num ml-1 text-sm font-normal text-muted">{g.drawings.length}</span>
              </h2>
              {/* Column names on wide screens; phones read each row on its own. */}
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_96px_56px_120px_190px_36px] gap-x-4 border-t border-rule px-6 py-2.5 text-xs font-medium text-muted md:grid">
                <span>Drawing</span>
                <span>Sheet</span>
                <span>Rev</span>
                <span>Issued</span>
                <span>Status</span>
                <span />
              </div>
              <ul>
                {g.drawings.map((d) => (
                  <li key={d.id} className="border-t border-rule">
                    <DrawingRow drawing={d} onOpen={() => setOpenId(d.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {open && open.revision ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#14141a]/70 backdrop-brightness-75 md:p-6" role="dialog" aria-modal="true" aria-label={open.title}>
          <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden bg-surface md:rounded-2xl">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3 md:px-6">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold tracking-[-0.01em]">{open.title}</p>
                <p className="num truncate text-xs text-muted">
                  {[open.number, `R${open.revision.rev}`, `issued ${dateFmt.format(open.revision.issuedAt ?? open.revision.createdAt)}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <StatusChip status={open.status} />
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-quiet h-10 w-10 p-0" aria-label="Previous drawing" disabled={at <= 0} onClick={() => setOpenId(viewable[at - 1].id)}>
                  <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <span className="num w-14 text-center text-xs text-muted" aria-live="polite">
                  {at >= 0 ? `${at + 1} of ${viewable.length}` : ""}
                </span>
                <button type="button" className="btn btn-quiet h-10 w-10 p-0" aria-label="Next drawing" disabled={at < 0 || at >= viewable.length - 1} onClick={() => setOpenId(viewable[at + 1].id)}>
                  <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button ref={closeRef} type="button" className="btn btn-secondary ml-1 h-10 w-10 p-0" aria-label="Close" onClick={() => setOpenId(null)}>
                  <X size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DrawingViewer
                key={open.revision.fileId}
                src={`${fileBase}${open.revision.fileId}`}
                contentType={open.revision.contentType}
                title={`${[open.number, open.title].filter(Boolean).join(" ")} R${open.revision.rev}`}
              />
              {open.revision.note ? (
                <div className="border-t border-rule px-4 py-4 md:px-6">
                  <p className="mb-1 font-medium">What changed in R{open.revision.rev}</p>
                  <p className="whitespace-pre-line text-muted">{open.revision.note}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** One drawing as a row: name, sheet, revision, issue date and status. Opens the current revision. */
function DrawingRow({ drawing: d, onOpen }: { drawing: Drawing; onOpen: () => void }) {
  const issued = d.revision ? dateFmt.format(d.revision.issuedAt ?? d.revision.createdAt) : null;
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#f6f7fb] text-[#9197b3]" aria-hidden="true">
          <FileText size={18} strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{d.title}</span>
          {/* On phones the details sit under the name. */}
          <span className="num block truncate text-xs text-muted md:hidden">
            {[d.number, d.revision ? `R${d.revision.rev}` : "Not issued yet", issued].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>
      <span className="num hidden truncate font-mono text-xs text-muted md:block">{d.number ?? "–"}</span>
      <span className="num hidden font-mono text-xs md:block">{d.revision ? `R${d.revision.rev}` : "–"}</span>
      <span className="num hidden text-sm text-muted md:block">{issued ?? "Not issued"}</span>
      <span className="min-w-0 justify-self-end md:justify-self-start">
        <StatusChip status={d.status} />
      </span>
      <span className="hidden justify-self-end md:block" aria-hidden="true">
        {d.revision ? <ArrowRight size={16} strokeWidth={1.8} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /> : null}
      </span>
    </>
  );
  const grid = "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3 text-left md:grid-cols-[minmax(0,1fr)_96px_56px_120px_190px_36px] md:px-6";
  return d.revision ? (
    <button type="button" onClick={onOpen} aria-label={`Open ${d.title}${d.number ? ` (${d.number})` : ""}, ${STATUS_STYLE[d.status].label}`} className={`group ${grid} transition-colors hover:bg-[#fbfbff]`}>
      {body}
    </button>
  ) : (
    <div className={`${grid} opacity-70`}>{body}</div>
  );
}
