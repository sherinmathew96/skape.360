"use client";

export { GroupCard } from "./group-card";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { deleteGroup, trashDrawing, updateDrawing } from "@/app/drawing-actions";
import { DISCIPLINES, type Discipline } from "@/db/schema";

// ── Removing a group: with its drawings, or just the group ─────────────────

export function DeleteGroupButton({ projectId, groupId, name, count }: { projectId: string; groupId: string; name: string; count: number }) {
  const router = useRouter();
  const [open, setOpenDialog] = useState(false);
  const [pending, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenDialog(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const run = (withDrawings: boolean) =>
    start(async () => {
      await deleteGroup({ projectId, groupId, withDrawings });
      setOpenDialog(false);
      router.refresh();
    });
  return (
    <>
      <button type="button" className="btn btn-quiet h-8 w-8 p-0 text-muted hover:text-negative" aria-label={`Delete the group ${name}`} title="Delete group" onClick={() => setOpenDialog(true)}>
        <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#14141a]/50 md:items-center md:p-6" role="alertdialog" aria-modal="true" aria-labelledby={`dg-${groupId}`}>
          <div className="w-full max-w-[460px] rounded-t-2xl bg-surface p-5 md:rounded-2xl">
            <div className="mb-2 flex items-start gap-3">
              <p id={`dg-${groupId}`} className="min-w-0 flex-1 text-lg font-semibold tracking-[-0.01em]">Delete “{name}”?</p>
              <button ref={closeRef} type="button" onClick={() => setOpenDialog(false)} className="btn btn-quiet h-9 w-9 flex-none p-0" aria-label="Cancel">
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">Both choices can be undone: deleted items wait in Settings → Recycle bin until the retention period ends.</p>
            <div className="space-y-2">
              <button type="button" disabled={pending} onClick={() => run(true)} className="btn w-full justify-start border border-[#e7b4b1] bg-surface px-4 text-left text-negative hover:bg-[#fff5f4]">
                <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                {count ? `Move the group and its ${count} ${count === 1 ? "drawing" : "drawings"} to the recycle bin` : "Move the group to the recycle bin"}
              </button>
              {count ? (
                <button type="button" disabled={pending} onClick={() => run(false)} className="btn btn-secondary w-full justify-start px-4 text-left">
                  Delete only the group; keep its drawings in General
                </button>
              ) : null}
              <button type="button" disabled={pending} onClick={() => setOpenDialog(false)} className="btn btn-quiet w-full">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── A drawing row: edit its details, or move it to the bin ─────────────────

type RowDrawing = { id: string; title: string; number: string | null; groupId: string | null; discipline: Discipline; assigneeId: string | null; clientVisible: boolean };

export function DrawingRowActions({
  projectId,
  drawing,
  groups,
  team,
  disciplineLabel,
}: {
  projectId: string;
  drawing: RowDrawing;
  groups: { id: string; name: string }[];
  team: { id: string; name: string }[];
  disciplineLabel: Record<Discipline, string>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [state, action, saving] = useActionState(updateDrawing, undefined);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) {
      setEditing(false);
      router.refresh();
    }
  }
  const name = drawing.number ? `${drawing.number} ${drawing.title}` : drawing.title;
  const p = `edit-${drawing.id.slice(0, 8)}`;
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditing(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  return (
    <span className="flex flex-none items-center justify-end">
      <button type="button" className="btn btn-quiet h-8 w-8 p-0 text-muted" aria-label={`Edit ${name}`} title="Edit" onClick={() => setEditing(true)}>
        <Pencil size={14} strokeWidth={1.6} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="btn btn-quiet h-8 w-8 p-0 text-muted hover:text-negative"
        aria-label={`Delete ${name}`}
        title="Delete"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Delete “${name}”?\n\nIt moves to the recycle bin (Settings → Recycle bin) with its revisions, renders and comments, and can be restored from there.`)) {
            start(async () => {
              await trashDrawing({ projectId, drawingId: drawing.id });
              router.refresh();
            });
          }
        }}
      >
        <Trash2 size={14} strokeWidth={1.6} aria-hidden="true" />
      </button>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#14141a]/50 text-left md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby={`${p}-title`}>
          <form action={action} className="max-h-[92dvh] w-full max-w-[520px] space-y-4 overflow-y-auto rounded-t-2xl bg-surface p-5 md:rounded-2xl">
            <div className="flex items-start gap-3">
              <p id={`${p}-title`} className="min-w-0 flex-1 text-lg font-semibold tracking-[-0.01em]">Edit drawing</p>
              <button type="button" onClick={() => setEditing(false)} className="btn btn-quiet h-9 w-9 flex-none p-0" aria-label="Close">
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="drawingId" value={drawing.id} />
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
              <div>
                <label htmlFor={`${p}-t`} className="field-label">Drawing</label>
                <input id={`${p}-t`} name="title" required minLength={2} defaultValue={drawing.title} autoComplete="off" className="field" />
              </div>
              <div>
                <label htmlFor={`${p}-n`} className="field-label">Sheet no.</label>
                <input id={`${p}-n`} name="number" defaultValue={drawing.number ?? ""} autoComplete="off" spellCheck={false} className="field font-mono" />
              </div>
            </div>
            <div>
              <label htmlFor={`${p}-g`} className="field-label">Group</label>
              <select id={`${p}-g`} name="groupId" defaultValue={drawing.groupId ?? ""} className="field">
                <option value="">General</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${p}-d`} className="field-label">Discipline</label>
                <select id={`${p}-d`} name="discipline" defaultValue={drawing.discipline} className="field">
                  {DISCIPLINES.map((d) => (
                    <option key={d} value={d}>{disciplineLabel[d]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${p}-a`} className="field-label">Drawn by</label>
                <select id={`${p}-a`} name="assigneeId" defaultValue={drawing.assigneeId ?? ""} className="field">
                  <option value="">Not assigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex min-h-10 items-center gap-2">
              <input type="checkbox" name="clientVisible" defaultChecked={drawing.clientVisible} className="h-4 w-4 accent-primary" />
              Show on the client&rsquo;s drawing register
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button type="submit" disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setEditing(false)} className="btn btn-quiet">Cancel</button>
              <p aria-live="polite" className={state?.error ? "text-negative" : "text-muted"}>{state?.error ?? ""}</p>
            </div>
          </form>
        </div>
      ) : null}
    </span>
  );
}
