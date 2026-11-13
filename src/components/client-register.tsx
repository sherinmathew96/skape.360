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
        <div className="space-y-10">
          {shownGroups.map((g) => (
            <section key={g.key} aria-labelledby={`group-${g.key}`}>
              <h2 id={`group-${g.key}`} className="mb-4 text-lg font-semibold tracking-[-0.01em]">
                {g.name} <span className="num ml-1 text-sm font-normal text-muted">{g.drawings.length}</span>
              </h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.drawings.map((d) => (
                  <li key={d.id} className="flex">
                    <DrawingCard drawing={d} onOpen={() => setOpenId(d.id)} />
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

/** One drawing: a sheet-like face with its status, then its name, revision and date. */
function DrawingCard({ drawing: d, onOpen }: { drawing: Drawing; onOpen: () => void }) {
  const style = STATUS_STYLE[d.status];
  const body = (
    <>
      {/* A drawing sheet in miniature: title block bottom right, in the status colour. A small square on phones. */}
      <span className="relative flex w-20 flex-none items-center justify-center overflow-hidden border-r border-rule bg-[#f6f7fb] sm:aspect-[16/9] sm:w-auto sm:border-b sm:border-r-0">
        <span className="absolute inset-2 rounded-md border border-dashed border-control sm:inset-3" aria-hidden="true" />
        <span className="absolute bottom-2 right-2 h-3 w-8 rounded-sm sm:bottom-3 sm:right-3 sm:h-6 sm:w-20" style={{ background: style.bg }} aria-hidden="true" />
        <FileText strokeWidth={1.2} className="relative h-6 w-6 text-[#9197b3] sm:h-[34px] sm:w-[34px]" aria-hidden="true" />
        {d.number ? <span className="absolute left-5 top-5 hidden font-mono text-xs text-muted sm:block">{d.number}</span> : null}
        <span className="absolute right-4 top-4 hidden sm:block">
          <StatusChip status={d.status} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="mb-1.5 block sm:hidden">
            <StatusChip status={d.status} />
          </span>
          <span className="block truncate font-semibold">{d.title}</span>
          <span className="num mt-0.5 block truncate text-xs text-muted">
            {d.number ? <span className="sm:hidden">{d.number} · </span> : null}
            {d.revision ? `R${d.revision.rev} · issued ${dateFmt.format(d.revision.issuedAt ?? d.revision.createdAt)}` : `Not issued yet · updated ${dateFmt.format(d.statusChangedAt)}`}
          </span>
        </span>
        {d.revision ? (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-active text-primary transition-colors group-hover:bg-primary group-hover:text-white" aria-hidden="true">
            <ArrowRight size={16} strokeWidth={1.8} />
          </span>
        ) : null}
      </span>
    </>
  );
  return d.revision ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${d.title}${d.number ? ` (${d.number})` : ""}, ${style.label}`}
      className="card group flex w-full flex-row overflow-hidden text-left transition-[transform,box-shadow] sm:flex-col duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(89,50,234,0.12)] motion-reduce:transition-none"
    >
      {body}
    </button>
  ) : (
    <div className="card flex w-full flex-row overflow-hidden opacity-75 sm:flex-col">{body}</div>
  );
}
