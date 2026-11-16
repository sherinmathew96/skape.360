"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { reorderDrawings } from "@/app/drawing-actions";
import { RowOrder } from "./group-controls";

type Item = { id: string; title: string; cells: React.ReactNode };

/**
 * A group's drawings, reordered by dragging the handle (mouse or touch) or
 * with the up and down arrows. The new order is saved for the studio and the
 * client register alike.
 */
export function SortableDrawings({ projectId, rowClass, items }: { projectId: string; rowClass: string; items: Item[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const rows = useRef(new Map<string, HTMLLIElement>());
  const before = useRef<string[]>([]);

  // New data from the server (a save, another person's change): follow it.
  const serverKey = items.map((i) => i.id).join(",");
  const [seenKey, setSeenKey] = useState(serverKey);
  if (serverKey !== seenKey && !dragging) {
    setSeenKey(serverKey);
    setOrder(serverKey ? serverKey.split(",") : []);
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const shown = order.filter((id) => byId.has(id));

  const save = (next: string[]) => {
    const moved = byId.get(dragging ?? "")?.title;
    start(async () => {
      await reorderDrawings({ projectId, ids: next });
      router.refresh();
      if (moved) setNote(`${moved} moved to position ${next.indexOf(dragging ?? "") + 1}.`);
    });
  };

  const onDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0 || pending) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    before.current = shown;
    setDragging(id);
  };

  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const y = e.clientY;
    // The row under the pointer: the first whose middle is below it.
    const others = shown.filter((id) => id !== dragging);
    let at = others.length;
    for (const [i, id] of others.entries()) {
      const r = rows.current.get(id)?.getBoundingClientRect();
      if (r && y < r.top + r.height / 2) {
        at = i;
        break;
      }
    }
    const next = [...others.slice(0, at), dragging, ...others.slice(at)];
    if (next.join() !== shown.join()) setOrder(next);
  };

  const onUp = () => {
    if (!dragging) return;
    const changed = shown.join() !== before.current.join();
    if (changed) save(shown);
    setDragging(null);
  };

  return (
    <>
      <ul className="[counter-reset:row]" aria-busy={pending}>
        {shown.map((id, i) => {
          const it = byId.get(id)!;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              className={`${rowClass} ${dragging === id ? "relative z-10 bg-surface shadow-[0_8px_24px_rgba(20,20,43,0.12)]" : ""} ${dragging && dragging !== id ? "transition-transform" : ""}`}
            >
              <span className="flex flex-none items-center">
                <button
                  type="button"
                  className={`btn btn-quiet h-8 w-7 touch-none p-0 text-muted ${dragging === id ? "cursor-grabbing" : "cursor-grab"}`}
                  aria-label={`Drag to reorder ${it.title}`}
                  title="Drag to reorder"
                  disabled={pending}
                  onPointerDown={(e) => onDown(e, id)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onKeyDown={(e) => {
                    // Keyboard: the arrow keys move the row, like the buttons beside it.
                    const j = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
                    if (j < 0 || j >= shown.length) return;
                    e.preventDefault();
                    const next = [...shown];
                    [next[i], next[j]] = [next[j], next[i]];
                    setOrder(next);
                    start(async () => {
                      await reorderDrawings({ projectId, ids: next });
                      router.refresh();
                      setNote(`${it.title} moved to position ${j + 1}.`);
                    });
                  }}
                >
                  <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <RowOrder projectId={projectId} drawingId={id} title={it.title} first={i === 0} last={i === shown.length - 1} />
              </span>
              {it.cells}
            </li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {note}
      </p>
    </>
  );
}
