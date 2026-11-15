"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, MessageSquare, PenLine, Search, X } from "lucide-react";
import { decidePortalDrawing } from "@/app/portal-talk-actions";
import { ClientThread } from "./comment-thread";
import { saveClientName, useClientName } from "./use-client-name";
import type { DrawingStatus } from "@/db/schema";
import type { clientRegister } from "@/lib/drawings";
import { STATUS_ORDER, STATUS_STYLE, StatusChip } from "./drawing-status";
import { VisualButtons, VisualModal, type VisualKind } from "./client-visuals";
import { DrawingViewer } from "./drawing-viewer";
import { GroupCard } from "./group-card";

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
  slug,
  initialId,
  initialView,
}: {
  register: Register;
  fileBase: string;
  /** The portal's address; without it (old share links) there are no comments, approvals or visuals */
  slug?: string;
  /** Opens this drawing straight away */
  initialId?: string;
  /** With it: its comments, 3D model, 360° view or renders */
  initialView?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DrawingStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(() => {
    const d = register.flatMap((g) => g.drawings).find((x) => x.id === initialId);
    return d?.revision && (!initialView || initialView === "comments") ? d.id : null;
  });
  const closeRef = useRef<HTMLButtonElement>(null);
  const [visual, setVisual] = useState<{ id: string; kind: VisualKind } | null>(() => {
    const d = register.flatMap((g) => g.drawings).find((x) => x.id === initialId);
    const kind = initialView as VisualKind;
    if (!d || !["model", "tour", "renders"].includes(kind)) return null;
    const has = kind === "model" ? d.visuals.models.length : kind === "tour" ? d.visuals.tours.length : d.visuals.renders.length;
    return has ? { id: d.id, kind } : null;
  });
  const [talk, setTalk] = useState(initialView === "comments");

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
  const shownGroups = groups.filter((g) => g.drawings.length > 0);
  // The order the viewer steps through: what's on screen, drawings with a file only.
  const viewable = shownGroups.flatMap((g) => g.drawings).filter((d) => d.revision);
  const all = register.flatMap((g) => g.drawings);
  const open = all.find((d) => d.id === openId) ?? null;
  const at = open ? viewable.findIndex((d) => d.id === open.id) : -1;
  const counts = STATUS_ORDER.map((st) => ({ st, n: all.filter((d) => d.status === st).length })).filter((c) => c.n > 0);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
      if (e.key === "ArrowRight" && at >= 0 && at < viewable.length - 1) setOpenId(viewable[at + 1].id);
      if (e.key === "ArrowLeft" && at > 0) setOpenId(viewable[at - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open, at, viewable]);

  return (
    <>
      {/* Find: by name or status. */}
      <div className="mb-6">
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
      </div>

      {shownGroups.length === 0 ? (
        <p className="empty">No drawings match. Clear the search or pick another status.</p>
      ) : (
        <div className="space-y-6">
          {shownGroups.map((g) => (
            <GroupCard
              key={g.key}
              projectId={`portal-${slug ?? "share"}`}
              groupKey={g.key}
              name={g.name}
              count={g.drawings.length}
              startOpen={shownGroups.length === 1}
              forceOpen={Boolean(query.trim()) || status !== "all"}
            >
              {/* Column names on wide screens; phones read each row on its own. */}
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_44px_96px_140px_260px_20px] gap-x-4 border-t border-rule px-6 py-2.5 text-xs font-medium text-muted md:grid">
                <span>Drawing</span>
                <span>Rev</span>
                <span>Issued</span>
                <span>Status</span>
                <span>3D · 360° · Renders</span>
                <span />
              </div>
              <ul>
                {g.drawings.map((d) => (
                  <li key={d.id} className="border-t border-rule">
                    <DrawingRow drawing={d} showVisuals={Boolean(slug)} onOpen={() => setOpenId(d.id)} onVisual={(kind) => setVisual({ id: d.id, kind })} />
                  </li>
                ))}
              </ul>
            </GroupCard>
          ))}
        </div>
      )}

      {slug && visual && all.find((d) => d.id === visual.id) ? (
        <VisualModal
          title={all.find((d) => d.id === visual.id)!.title}
          visuals={all.find((d) => d.id === visual.id)!.visuals}
          kind={visual.kind}
          fileBase={fileBase}
          slug={slug}
          onKind={(kind) => setVisual({ id: visual.id, kind })}
          onClose={() => setVisual(null)}
        />
      ) : null}

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
              {slug ? (
              <button
                type="button"
                aria-pressed={talk}
                onClick={() => setTalk((v) => !v)}
                className={`btn h-10 gap-2 px-3 text-sm ${talk ? "btn-primary" : "btn-secondary"}`}
              >
                <MessageSquare size={16} strokeWidth={1.8} aria-hidden="true" />
                Comments
              </button>
              ) : null}
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
            {slug ? <Approval slug={slug} drawingId={open.id} revision={open.revision} /> : null}
            <div className="flex min-h-0 flex-1">
            <div className={`min-h-0 flex-1 overflow-y-auto ${talk ? "hidden md:block" : ""}`}>
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
            {slug && talk ? (
              <aside className="flex min-h-0 w-full flex-col border-rule md:w-[360px] md:flex-none md:border-l" aria-label={`Comments on ${open.title}`}>
                <p className="border-b border-rule px-4 py-3 text-sm font-semibold">Comments on this drawing</p>
                <div className="min-h-0 flex-1">
                  <ClientThread key={open.id} slug={slug} item={{ kind: "drawing", id: open.id }} />
                </div>
              </aside>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * One drawing as a row: name, sheet, revision, issue date, status, then its
 * 3D, 360° and renders. The name side opens the current revision.
 */
function DrawingRow({ drawing: d, showVisuals, onOpen, onVisual }: { drawing: Drawing; showVisuals: boolean; onOpen: () => void; onVisual: (kind: VisualKind) => void }) {
  const issued = d.revision ? dateFmt.format(d.revision.issuedAt ?? d.revision.createdAt) : null;
  const info = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#f6f7fb] text-[#9197b3]" aria-hidden="true">
          <FileText size={18} strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className={`block truncate font-medium ${d.revision ? "group-hover:text-primary" : ""}`}>{d.title}</span>
          {/* On phones the details sit under the name. */}
          <span className="num block truncate text-xs text-muted md:hidden">
            {[d.revision ? `R${d.revision.rev}` : "Not issued yet", issued].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>
      <span className="num hidden font-mono text-xs md:block">{d.revision ? `R${d.revision.rev}` : "–"}</span>
      <span className="num hidden text-sm text-muted md:block">{issued ?? "Not issued"}</span>
    </>
  );
  const infoGrid = "grid min-w-0 grid-cols-1 items-center gap-x-4 text-left md:col-span-3 md:grid-cols-[minmax(0,1fr)_44px_96px]";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-[#fbfbff] md:grid-cols-[minmax(0,1fr)_44px_96px_140px_260px_20px] md:px-6">
      {d.revision ? (
        <button type="button" onClick={onOpen} aria-label={`Open ${d.title}${d.number ? ` (${d.number})` : ""}, ${STATUS_STYLE[d.status].label}`} className={`group ${infoGrid}`}>
          {info}
        </button>
      ) : (
        <div className={infoGrid}>
          <span className="contents opacity-80">{info}</span>
        </div>
      )}
      <span className="min-w-0 justify-self-end md:justify-self-start">
        <StatusChip status={d.status} />
      </span>
      <span className="col-span-2 min-w-0 empty:hidden md:col-span-1">
        {showVisuals ? <VisualButtons visuals={d.visuals} title={d.title} onOpen={onVisual} /> : null}
      </span>
      <span className="hidden justify-self-end md:block" aria-hidden="true">
        {d.revision ? <ArrowRight size={16} strokeWidth={1.8} className="text-muted" /> : null}
      </span>
    </div>
  );
}

/**
 * Under the drawing's title: approve the current revision or ask for changes.
 * Once decided, it says who decided and when, until the next revision.
 */
function Approval({ slug, drawingId, revision }: { slug: string; drawingId: string; revision: NonNullable<Drawing["revision"]> }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "changes">("idle");
  const saved = useClientName();
  // What they typed here; until then, the name remembered on this device.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? saved;
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decided = revision.decision;

  if (decided || revision.status === "approved" || revision.status === "changes_requested") {
    const ok = (decided?.decision ?? revision.status) === "approved";
    return (
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5 text-sm md:px-6 ${ok ? "bg-[#eef7e9]" : "bg-[#fdeee6]"}`}>
        {ok ? <Check size={16} strokeWidth={2.2} aria-hidden="true" className="text-[#2d5a1f]" /> : <PenLine size={16} strokeWidth={2} aria-hidden="true" className="text-[#7d3517]" />}
        <span className="font-medium">{ok ? `R${revision.rev} approved` : `Changes requested on R${revision.rev}`}</span>
        {decided ? <span className="text-muted">by {decided.name} · {dateFmt.format(new Date(decided.createdAt))}</span> : null}
        {decided?.comment ? <span className="basis-full whitespace-pre-line text-muted">“{decided.comment}”</span> : null}
      </div>
    );
  }

  const choose = (next: "approve" | "changes") => setMode(next);

  const submit = (decision: "approved" | "changes_requested") =>
    start(async () => {
      setError(null);
      const res = await decidePortalDrawing(slug, { drawingId, decision, name, comment });
      if ("error" in res) return setError(res.error);
      saveClientName(name);
      setMode("idle");
      router.refresh();
    });

  return (
    <div className="border-b border-rule bg-[#fbfbff] px-4 py-2.5 md:px-6">
      {mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-muted">Is R{revision.rev} good to go?</span>
          <button type="button" onClick={() => choose("approve")} className="btn btn-primary h-9 gap-1.5 px-3 text-sm">
            <Check size={16} strokeWidth={2.2} aria-hidden="true" />
            Approve
          </button>
          <button type="button" onClick={() => choose("changes")} className="btn btn-secondary h-9 gap-1.5 px-3 text-sm">
            <PenLine size={16} strokeWidth={1.8} aria-hidden="true" />
            Request changes
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(mode === "approve" ? "approved" : "changes_requested");
          }}
        >
          <div className="w-full sm:w-48">
            <label htmlFor={`dec-name-${drawingId}`} className="field-label">Your name</label>
            <input id={`dec-name-${drawingId}`} value={name} onChange={(e) => setDraft(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" className="field h-10" />
          </div>
          <div className="min-w-0 flex-1 basis-60">
            <label htmlFor={`dec-comment-${drawingId}`} className="field-label">{mode === "changes" ? "What should change?" : "Note (optional)"}</label>
            <input id={`dec-comment-${drawingId}`} value={comment} onChange={(e) => setComment(e.target.value)} required={mode === "changes"} maxLength={2000} className="field h-10" />
          </div>
          <button type="submit" disabled={pending} className={`btn h-10 px-4 ${mode === "approve" ? "btn-primary" : "btn-secondary"}`}>
            {pending ? "Sending…" : mode === "approve" ? `Approve R${revision.rev}` : "Send request"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className="btn btn-quiet h-10 px-3">Cancel</button>
          {error ? <p role="alert" className="basis-full text-sm text-negative">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
