"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Box, ChevronLeft, ChevronRight, Image as ImageIcon, MessageSquare, Orbit, X } from "lucide-react";
import { ClientThread } from "./comment-thread";
import type { DrawingVisuals } from "@/lib/visuals";

// The 3D and 360° viewers are heavy; they load only when opened.
const ModelViewer = dynamic(() => import("./model-viewer").then((m) => m.ModelViewer), {
  ssr: false,
  loading: () => <Loading />,
});
const TourViewer = dynamic(() => import("./tour-viewer").then((m) => m.TourViewer), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  return <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted">Loading…</div>;
}

export type VisualKind = "model" | "tour" | "renders";

/** The 3D, 360° and Renders buttons on a drawing's row; only what the drawing has. */
export function VisualButtons({ visuals, title, onOpen }: { visuals: DrawingVisuals; title: string; onOpen: (kind: VisualKind) => void }) {
  const parts = [
    { kind: "model" as const, n: visuals.models.length, Icon: Box, label: "3D" },
    { kind: "tour" as const, n: visuals.tours.length, Icon: Orbit, label: "360°" },
    { kind: "renders" as const, n: visuals.renders.length, Icon: ImageIcon, label: "Renders" },
  ].filter((p) => p.n > 0);
  if (!parts.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {parts.map(({ kind, n, Icon, label }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onOpen(kind)}
          aria-label={`${label} for ${title}${n > 1 ? `, ${n}` : ""}`}
          className="flex h-8 items-center gap-1.5 rounded-full border border-[#dcd6fb] bg-[#f4f1ff] px-2.5 text-xs font-medium text-primary transition-colors hover:bg-[#ebe5ff]"
        >
          <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
          {label}
          {n > 1 ? <span className="num opacity-70">{n}</span> : null}
        </button>
      ))}
    </span>
  );
}

/**
 * Full-screen view of a drawing's 3D model, 360° view or renders. With more
 * than one model or tour, tabs switch between them; renders page left and right.
 */
export function VisualModal({
  title,
  visuals,
  kind,
  fileBase,
  slug,
  startIndex = 0,
  onKind,
  onClose,
}: {
  title: string;
  visuals: DrawingVisuals;
  kind: VisualKind;
  fileBase: string;
  slug: string;
  /** Which model, tour or render to show first */
  startIndex?: number;
  onKind: (k: VisualKind) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [talk, setTalk] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const list = kind === "model" ? visuals.models : kind === "tour" ? visuals.tours : visuals.renders;
  const at = Math.min(index, Math.max(0, list.length - 1));

  useEffect(() => {
    closeRef.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (kind === "renders" && e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, visuals.renders.length - 1));
      if (kind === "renders" && e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [kind, onClose, visuals.renders.length]);

  const tabs = [
    { k: "model" as const, n: visuals.models.length, label: "3D model" },
    { k: "tour" as const, n: visuals.tours.length, label: "360° view" },
    { k: "renders" as const, n: visuals.renders.length, label: "Renders" },
  ].filter((t) => t.n > 0);
  const file = (id: string) => `${fileBase}${id}`;
  const render = kind === "renders" ? visuals.renders[at] : null;
  // Comments go with the 3D model or render on screen (not 360° views).
  const talkItem = kind === "model" && visuals.models[at] ? { kind: "model" as const, id: visuals.models[at].id, title: visuals.models[at].title } : render ? { kind: "render" as const, id: render.id, title: render.title } : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#14141a]/70 backdrop-brightness-75 md:p-6" role="dialog" aria-modal="true" aria-label={`${title}, ${kind === "model" ? "3D model" : kind === "tour" ? "360° view" : "renders"}`}>
      <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden bg-surface md:rounded-2xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3 md:px-6">
          <p className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.01em]">{title}</p>
          {tabs.length > 1 ? (
            <div className="flex gap-1 rounded-full bg-raised p-1" role="tablist" aria-label="What to show">
              {tabs.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  role="tab"
                  aria-selected={kind === t.k}
                  onClick={() => {
                    setIndex(0);
                    onKind(t.k);
                  }}
                  className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${kind === t.k ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
          {talkItem ? (
            <button type="button" aria-pressed={talk} onClick={() => setTalk((v) => !v)} className={`btn h-10 gap-2 px-3 text-sm ${talk ? "btn-primary" : "btn-secondary"}`}>
              <MessageSquare size={16} strokeWidth={1.8} aria-hidden="true" />
              Comments
            </button>
          ) : null}
          <button ref={closeRef} type="button" className="btn btn-secondary h-10 w-10 p-0" aria-label="Close" onClick={onClose}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        {kind !== "renders" && list.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto border-b border-rule px-4 py-2 md:px-6">
            {list.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={i === at}
                onClick={() => setIndex(i)}
                className={`h-8 flex-none rounded-md px-3 text-sm ${i === at ? "bg-primary text-white" : "bg-ground text-muted hover:text-text"}`}
              >
                {item.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
        <div className={`relative min-h-0 flex-1 bg-white ${talk && talkItem ? "hidden md:block" : ""}`}>
          {kind === "model" && visuals.models[at] ? (
            <ModelViewer
              key={visuals.models[at].id}
              src={file(visuals.models[at].fileId)}
              title={visuals.models[at].title}
              poster={visuals.models[at].coverFileId ? file(visuals.models[at].coverFileId!) : null}
              view={visuals.models[at].view}
              className="h-full w-full"
            />
          ) : null}
          {kind === "tour" && visuals.tours[at] ? <TourViewer key={visuals.tours[at].id} tour={visuals.tours[at]} fileBase={fileBase} className="h-full w-full" /> : null}
          {render ? (
            <div className="flex h-full flex-col">
              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#f6f7fb]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img key={render.id} src={file(render.fileId) + "?w=2048"} alt={render.title} className="max-h-full max-w-full object-contain" />
                {visuals.renders.length > 1 ? (
                  <>
                    <button type="button" disabled={at === 0} onClick={() => setIndex(at - 1)} aria-label="Previous render" className="btn btn-secondary absolute left-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full p-0 shadow-md disabled:opacity-30">
                      <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <button type="button" disabled={at === visuals.renders.length - 1} onClick={() => setIndex(at + 1)} aria-label="Next render" className="btn btn-secondary absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full p-0 shadow-md disabled:opacity-30">
                      <ChevronRight size={22} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </div>
              {visuals.renders.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto border-t border-rule p-2">
                  {visuals.renders.map((r, i) => (
                    <button key={r.id} type="button" aria-pressed={i === at} aria-label={`Render ${i + 1}: ${r.title}`} onClick={() => setIndex(i)} className={`h-16 w-24 flex-none overflow-hidden rounded-md border-2 ${i === at ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file(r.fileId) + "?w=320"} alt="" width={96} height={64} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {talk && talkItem ? (
          <aside className="flex min-h-0 w-full flex-col border-rule md:w-[360px] md:flex-none md:border-l" aria-label={`Comments on ${talkItem.title}`}>
            <p className="truncate border-b border-rule px-4 py-3 text-sm font-semibold">Comments on {talkItem.title}</p>
            <div className="min-h-0 flex-1">
              <ClientThread key={talkItem.id} slug={slug} item={{ kind: talkItem.kind, id: talkItem.id }} />
            </div>
          </aside>
        ) : null}
        </div>
      </div>
    </div>
  );
}
