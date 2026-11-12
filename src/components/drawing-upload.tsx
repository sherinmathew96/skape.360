"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addRevision, checkDrawingDetails, createDrawing, createGroup, setDrawingStatus } from "@/app/drawing-actions";
import { DISCIPLINES, type DrawingStatus } from "@/db/schema";
import { FILE_KINDS } from "@/lib/file-kinds";
import { uploadFile } from "@/lib/upload-client";
import { STATUS_ORDER, STATUS_STYLE } from "./drawing-status";

const DISCIPLINE: Record<(typeof DISCIPLINES)[number], string> = {
  architectural: "Architectural",
  structural: "Structural",
  mep: "MEP",
  interior: "Interior",
  landscape: "Landscape",
};

/**
 * Adds a row to the drawing register. The file is optional, so drawings can
 * be listed before they are drawn (Pending, Design discussion), as in the
 * studio's spreadsheet. Stays open for the next row.
 */
export function NewDrawing({
  projectId,
  groups,
  team,
}: {
  projectId: string;
  groups: { id: string; name: string }[];
  team: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [newGroup, setNewGroup] = useState("");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [discipline, setDiscipline] = useState("interior");
  const [status, setStatus] = useState<DrawingStatus>("pending");
  const [assigneeId, setAssigneeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rev, setRev] = useState("0");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMessage(null);
          try {
            const check = await checkDrawingDetails({ projectId, number, title, discipline });
            if ("error" in check && check.error) throw new Error(check.error);
            let gid = groupId === "__new" ? "" : groupId;
            if (groupId === "__new") {
              if (!newGroup.trim()) throw new Error("Name the new group.");
              gid = (await createGroup({ projectId, name: newGroup })).id;
            }
            let fileId: string | null = null;
            if (file) {
              setMessage({ text: "Uploading the drawing…" });
              fileId = await uploadFile(projectId, "drawing", file);
            }
            await createDrawing({ projectId, groupId: gid, number, title, discipline, status, assigneeId, fileId, rev: file ? Number(rev) || 0 : null, note: "" });
            setMessage({ text: `${title} added.` });
            setTitle("");
            setNumber("");
            setFile(null);
            setRev("0");
            if (fileRef.current) fileRef.current.value = "";
            if (groupId === "__new") {
              setGroupId(gid);
              setNewGroup("");
            }
            router.refresh();
          } catch (err) {
            setMessage({ text: err instanceof Error ? err.message : "Couldn't add the drawing.", error: true });
          }
        });
      }}
    >
      <div>
        <label htmlFor="dwg-group" className="field-label">Group</label>
        <select id="dwg-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="field">
          <option value="">General</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
          <option value="__new">+ New group…</option>
        </select>
        {groupId === "__new" ? (
          <input
            aria-label="New group name"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="e.g. Room 01, Master bedroom, Pool"
            autoComplete="off"
            className="field mt-2"
          />
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
        <div>
          <label htmlFor="dwg-title" className="field-label">Drawing</label>
          <input id="dwg-title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wardrobe detail" autoComplete="off" className="field" />
        </div>
        <div>
          <label htmlFor="dwg-number" className="field-label">Sheet no.</label>
          <input id="dwg-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" autoComplete="off" spellCheck={false} className="field font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="dwg-status" className="field-label">Status</label>
          <select id="dwg-status" value={status} onChange={(e) => setStatus(e.target.value as DrawingStatus)} className="field">
            {STATUS_ORDER.map((st) => (
              <option key={st} value={st}>{STATUS_STYLE[st].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dwg-discipline" className="field-label">Discipline</label>
          <select id="dwg-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="field">
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>{DISCIPLINE[d]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="dwg-assignee" className="field-label">Drawn by</label>
        <select id="dwg-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field">
          <option value="">Not assigned</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_90px] items-end gap-3">
        <div>
          <label htmlFor="dwg-file" className="field-label">Drawing file (optional)</label>
          <input
            ref={fileRef}
            id="dwg-file"
            type="file"
            accept={FILE_KINDS.drawing.accept}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-raised file:px-3 file:font-medium"
          />
        </div>
        <div>
          <label htmlFor="dwg-rev" className="field-label">Revision</label>
          <input id="dwg-rev" type="number" min={0} max={99} disabled={!file} value={rev} onChange={(e) => setRev(e.target.value)} className="field num text-right" />
        </div>
      </div>
      <p className="text-xs text-muted">PDF (best) or JPG/PNG. Set the revision if the drawing is already past R0.</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Add drawing"}</button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.text ?? ""}</p>
      </div>
    </form>
  );
}

/** Upload the next revision; the number can be set to continue an older series. */
export function NewRevision({ projectId, drawingId, nextRev }: { projectId: string; drawingId: string; nextRev: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [rev, setRev] = useState(String(nextRev));
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return setMessage({ text: "Choose the drawing file.", error: true });
        start(async () => {
          try {
            setMessage({ text: "Uploading…" });
            const fileId = await uploadFile(projectId, "drawing", file);
            const res = await addRevision({ projectId, drawingId, fileId, note, rev: Number(rev) });
            setMessage({ text: `R${res.rev} uploaded.` });
            setNote("");
            setFile(null);
            if (fileRef.current) fileRef.current.value = "";
            router.refresh();
          } catch (err) {
            setMessage({ text: err instanceof Error ? err.message : "Upload failed.", error: true });
          }
        });
      }}
    >
      <div>
        <label htmlFor="rev-note" className="field-label">What changed</label>
        <textarea id="rev-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field h-auto py-2" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_90px] items-end gap-3">
        <div>
          <label htmlFor="rev-file" className="field-label">File</label>
          <input
            ref={fileRef}
            id="rev-file"
            type="file"
            accept={FILE_KINDS.drawing.accept}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-raised file:px-3 file:font-medium"
          />
        </div>
        <div>
          <label htmlFor="rev-number" className="field-label">Revision</label>
          <input id="rev-number" type="number" min={nextRev} max={99} value={rev} onChange={(e) => setRev(e.target.value)} className="field num text-right" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-secondary">{pending ? "Uploading…" : `Upload R${rev || nextRev}`}</button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.text ?? ""}</p>
      </div>
    </form>
  );
}

/** The status column: one tap to change it. */
export function StatusSelect({ projectId, drawingId, status, label }: { projectId: string; drawingId: string; status: DrawingStatus; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const style = STATUS_STYLE[value];
  return (
    <select
      aria-label={`Status of ${label}`}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as DrawingStatus;
        setValue(next);
        start(async () => {
          await setDrawingStatus({ projectId, drawingId, status: next });
          router.refresh();
        });
      }}
      className="h-8 max-w-full cursor-pointer rounded-[4px] border-0 py-0 pl-2 pr-7 text-xs font-medium"
      style={{ background: style.bg, color: style.ink }}
    >
      {STATUS_ORDER.map((st) => (
        <option key={st} value={st}>{STATUS_STYLE[st].label}</option>
      ))}
    </select>
  );
}
