"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Box, ExternalLink, Image as ImageIcon, Orbit, Plus, Trash2, X } from "lucide-react";
import { addDrawingPanorama, addDrawingRender, createModel, deleteDrawingRender, setDrawingLink } from "@/app/studio-actions";
import { Uploader } from "./uploader";

type Item = { id: string; title: string };
type Render = { id: string; title: string; fileId: string };

export type VisualCounts = { models: number; tours: number; renders: number };

/** Small counts of a drawing's 3D models, 360° tours and renders, as icons. */
export function VisualCounts({ counts, empty }: { counts: VisualCounts; empty?: React.ReactNode }) {
  const parts = [
    { n: counts.models, Icon: Box, label: "3D" },
    { n: counts.tours, Icon: Orbit, label: "360°" },
    { n: counts.renders, Icon: ImageIcon, label: "renders" },
  ].filter((p) => p.n > 0);
  if (!parts.length) return <>{empty ?? null}</>;
  return (
    <span className="flex items-center gap-2.5">
      {parts.map(({ n, Icon, label }) => (
        <span key={label} className="num flex items-center gap-1 text-xs font-medium" title={`${n} ${label}`}>
          <Icon size={14} strokeWidth={1.8} aria-hidden="true" className="text-primary" />
          {n}
          <span className="sr-only"> {label}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * The studio's view of what goes with one drawing: its 3D models, 360° tours
 * and render images. Opens from the drawing's row; studio staff can link
 * what is already on the project, upload new ones, or remove them.
 */
export function DrawingVisualsButton({
  projectId,
  drawing,
  models,
  tours,
  renders,
  allModels,
  allTours,
  canEdit,
}: {
  projectId: string;
  drawing: { id: string; title: string };
  models: Item[];
  tours: (Item & { scenes: number })[];
  renders: Render[];
  allModels: Item[];
  allTours: Item[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const [optimize, setOptimize] = useState(true);
  // True only when the compressed copy is what was uploaded.
  const optimizedUsed = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const counts = { models: models.length, tours: tours.length, renders: renders.length };
  const total = counts.models + counts.tours + counts.renders;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const back = opener.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
      back?.focus();
    };
  }, [open]);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      setMessage("error" in res ? { error: res.error } : { ok });
      if (!("error" in res)) router.refresh();
    });

  if (!total && !canEdit) return <span className="text-xs text-muted">–</span>;

  const unlinkedModels = allModels.filter((m) => !models.some((x) => x.id === m.id));
  const unlinkedTours = allTours.filter((t) => !tours.some((x) => x.id === t.id));

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        className="flex h-9 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-ground"
        aria-label={`3D, 360° and renders for ${drawing.title}: ${counts.models} 3D, ${counts.tours} 360°, ${counts.renders} renders`}
      >
        <VisualCounts counts={counts} empty={<span className="flex items-center gap-1 text-xs font-medium text-primary"><Plus size={14} strokeWidth={2} aria-hidden="true" />Add</span>} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#14141a]/50 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby={`dv-${drawing.id}`}>
          <div className="flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-surface md:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
              <div className="min-w-0 flex-1">
                <p id={`dv-${drawing.id}`} className="truncate text-lg font-semibold tracking-[-0.01em]">{drawing.title}</p>
                <p className="text-xs text-muted">3D models, 360° views and renders shown with this drawing</p>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="btn btn-secondary h-10 w-10 flex-none p-0" aria-label="Close">
                <X size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <p aria-live="polite" className={`text-sm ${message?.error ? "text-negative" : "text-muted"} ${message ? "" : "sr-only"}`}>
                {message?.error ?? message?.ok ?? ""}
              </p>

              {/* 3D models */}
              <section aria-labelledby={`dv-${drawing.id}-3d`}>
                <h3 id={`dv-${drawing.id}-3d`} className="mb-2 flex items-center gap-2 font-semibold">
                  <Box size={18} strokeWidth={1.6} aria-hidden="true" className="text-primary" /> 3D models
                </h3>
                <LinkedList
                  items={models}
                  hrefOf={(m) => `/projects/${projectId}/models/${m.id}`}
                  canEdit={canEdit}
                  pending={pending}
                  removeLabel="Remove from drawing"
                  onRemove={(m) => run(() => setDrawingLink({ projectId, drawingId: drawing.id, kind: "model", itemId: m.id, linked: false }), `${m.title} is no longer shown with this drawing.`)}
                  empty="No 3D model yet."
                />
                {canEdit ? (
                  <div className="mt-3 space-y-3 rounded-md bg-ground p-3">
                    {unlinkedModels.length ? (
                      <LinkPicker
                        id={`dv-${drawing.id}-pick-model`}
                        label="Show a model already on the project"
                        items={unlinkedModels}
                        pending={pending}
                        onLink={(itemId) => run(() => setDrawingLink({ projectId, drawingId: drawing.id, kind: "model", itemId, linked: true }), "Linked.")}
                      />
                    ) : null}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} className="h-4 w-4 accent-primary" />
                      Make it load fast (recommended)
                    </label>
                    <Uploader
                      projectId={projectId}
                      kind="model"
                      label="Upload a .glb"
                      prepare={
                        optimize
                          ? async (file, onStep) => {
                              optimizedUsed.current = false;
                              if (file.size > 250 * 1024 * 1024) return file;
                              try {
                                const { optimizeModel } = await import("@/lib/optimize-model");
                                const res = await optimizeModel(file, onStep);
                                if (res.report.after >= res.report.before) return file;
                                optimizedUsed.current = true;
                                return res.file;
                              } catch {
                                return file;
                              }
                            }
                          : undefined
                      }
                      onUploaded={async (fileId) => {
                        await createModel({ projectId, fileId, title: "", optimized: optimize && optimizedUsed.current, drawingId: drawing.id });
                        setMessage({ ok: "3D model added." });
                        router.refresh();
                      }}
                    />
                  </div>
                ) : null}
              </section>

              {/* 360° */}
              <section aria-labelledby={`dv-${drawing.id}-360`}>
                <h3 id={`dv-${drawing.id}-360`} className="mb-2 flex items-center gap-2 font-semibold">
                  <Orbit size={18} strokeWidth={1.6} aria-hidden="true" className="text-primary" /> 360° views
                </h3>
                <LinkedList
                  items={tours.map((t) => ({ ...t, title: `${t.title}${t.scenes > 1 ? ` · ${t.scenes} rooms` : ""}` }))}
                  hrefOf={(t) => `/projects/${projectId}/tours/${t.id}`}
                  canEdit={canEdit}
                  pending={pending}
                  removeLabel="Remove from drawing"
                  onRemove={(t) => run(() => setDrawingLink({ projectId, drawingId: drawing.id, kind: "tour", itemId: t.id, linked: false }), "Removed from this drawing.")}
                  empty="No 360° view yet."
                />
                {canEdit ? (
                  <div className="mt-3 space-y-3 rounded-md bg-ground p-3">
                    {unlinkedTours.length ? (
                      <LinkPicker
                        id={`dv-${drawing.id}-pick-tour`}
                        label="Show a tour already on the project"
                        items={unlinkedTours}
                        pending={pending}
                        onLink={(itemId) => run(() => setDrawingLink({ projectId, drawingId: drawing.id, kind: "tour", itemId, linked: true }), "Linked.")}
                      />
                    ) : null}
                    <Uploader
                      projectId={projectId}
                      kind="panorama"
                      label="Upload a 360° render"
                      onUploaded={async (fileId) => {
                        const res = await addDrawingPanorama({ projectId, drawingId: drawing.id, fileId, title: "" });
                        if ("error" in res) throw new Error(res.error);
                        setMessage({ ok: "360° view added." });
                        router.refresh();
                      }}
                    />
                  </div>
                ) : null}
              </section>

              {/* Renders */}
              <section aria-labelledby={`dv-${drawing.id}-renders`}>
                <h3 id={`dv-${drawing.id}-renders`} className="mb-2 flex items-center gap-2 font-semibold">
                  <ImageIcon size={18} strokeWidth={1.6} aria-hidden="true" className="text-primary" /> Renders
                </h3>
                {renders.length ? (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {renders.map((r) => (
                      <li key={r.id} className="group relative overflow-hidden rounded-md bg-raised">
                        <a href={`/api/files/${r.fileId}`} target="_blank" rel="noreferrer" title={r.title}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/${r.fileId}?w=640`} alt={r.title} width={320} height={200} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                        </a>
                        {canEdit ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (window.confirm(`Delete the render “${r.title}”? This can't be undone.`)) run(() => deleteDrawingRender({ projectId, renderId: r.id }), "Render deleted.");
                            }}
                            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-negative shadow-sm hover:bg-white"
                            aria-label={`Delete render ${r.title}`}
                          >
                            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No renders yet.</p>
                )}
                {canEdit ? (
                  <div className="mt-3 rounded-md bg-ground p-3">
                    <Uploader
                      projectId={projectId}
                      kind="render"
                      multiple
                      label="Upload renders"
                      onUploaded={async (fileId) => {
                        const res = await addDrawingRender({ projectId, drawingId: drawing.id, fileId });
                        if ("error" in res) throw new Error(res.error);
                        setMessage({ ok: "Renders added." });
                        router.refresh();
                      }}
                    />
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LinkedList({
  items,
  hrefOf,
  canEdit,
  pending,
  removeLabel,
  onRemove,
  empty,
}: {
  items: Item[];
  hrefOf: (i: Item) => string;
  canEdit: boolean;
  pending: boolean;
  removeLabel: string;
  onRemove: (i: Item) => void;
  empty: string;
}) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-rule rounded-md border border-rule">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-2 px-3 py-2">
          <Link href={hrefOf(i)} className="flex min-w-0 flex-1 items-center gap-1.5 font-medium hover:text-primary hover:underline">
            <span className="truncate">{i.title}</span>
            <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" className="flex-none text-muted" />
          </Link>
          {canEdit ? (
            <button type="button" disabled={pending} onClick={() => onRemove(i)} className="btn btn-quiet h-8 flex-none px-2 text-xs text-muted hover:text-negative">
              {removeLabel}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function LinkPicker({ id, label, items, pending, onLink }: { id: string; label: string; items: Item[]; pending: boolean; onLink: (id: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-[220px]">
        <label htmlFor={id} className="field-label">{label}</label>
        <select id={id} value={value} onChange={(e) => setValue(e.target.value)} className="field">
          <option value="">Choose…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.title}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={!value || pending}
        onClick={() => {
          onLink(value);
          setValue("");
        }}
        className="btn btn-secondary"
      >
        Link
      </button>
    </div>
  );
}
