"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { deleteGroup, moveDrawing, moveGroup, renameGroup } from "@/app/drawing-actions";

const icon = "btn btn-quiet h-8 w-8 p-0 text-muted";

/** Rename, reorder and remove a register group. */
export function GroupControls({ projectId, groupId, name, first, last }: { projectId: string; groupId: string; name: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (work: () => Promise<unknown>) => start(async () => { await work(); router.refresh(); });
  return (
    <span className="flex flex-none items-center">
      <button type="button" className={icon} disabled={pending || first} aria-label={`Move ${name} up`} title="Move up" onClick={() => run(() => moveGroup({ projectId, groupId, direction: "up" }))}>
        <ArrowUp size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className={icon} disabled={pending || last} aria-label={`Move ${name} down`} title="Move down" onClick={() => run(() => moveGroup({ projectId, groupId, direction: "down" }))}>
        <ArrowDown size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={icon}
        disabled={pending}
        aria-label={`Rename ${name}`}
        title="Rename"
        onClick={() => {
          const next = window.prompt("Group name", name);
          if (next && next.trim() && next.trim() !== name) run(() => renameGroup({ projectId, groupId, name: next }));
        }}
      >
        <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${icon} hover:text-negative`}
        disabled={pending}
        aria-label={`Remove the group ${name}`}
        title="Remove group"
        onClick={() => {
          if (window.confirm(`Remove the group “${name}”? Its drawings move to General; nothing is deleted.`)) run(() => deleteGroup({ projectId, groupId }));
        }}
      >
        <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </span>
  );
}

/** Move a drawing up or down within its group. */
export function RowOrder({ projectId, drawingId, title, first, last }: { projectId: string; drawingId: string; title: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (direction: "up" | "down") => start(async () => { await moveDrawing({ projectId, drawingId, direction }); router.refresh(); });
  return (
    <span className="flex flex-none">
      <button type="button" className="btn btn-quiet h-8 w-7 p-0 text-muted" disabled={pending || first} aria-label={`Move ${title} up`} title="Move up" onClick={() => move("up")}>
        <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-quiet h-8 w-7 p-0 text-muted" disabled={pending || last} aria-label={`Move ${title} down`} title="Move down" onClick={() => move("down")}>
        <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </span>
  );
}
