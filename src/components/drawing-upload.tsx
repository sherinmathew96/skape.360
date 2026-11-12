"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addRevision, checkDrawingDetails, createDrawing } from "@/app/drawing-actions";
import { DISCIPLINES } from "@/db/schema";
import { Uploader } from "./uploader";

const LABEL: Record<(typeof DISCIPLINES)[number], string> = {
  architectural: "Architectural",
  structural: "Structural",
  mep: "MEP",
  interior: "Interior",
  landscape: "Landscape",
};

/** New drawing: sheet number, title, discipline, then the file (saved as R0). */
export function NewDrawing({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState<string>("architectural");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
        <div>
          <label htmlFor="dwg-number" className="field-label">Sheet no.</label>
          <input id="dwg-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="A-101" autoComplete="off" spellCheck={false} className="field font-mono" />
        </div>
        <div>
          <label htmlFor="dwg-title" className="field-label">Title</label>
          <input id="dwg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ground floor plan" autoComplete="off" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="dwg-discipline" className="field-label">Discipline</label>
        <select id="dwg-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="field">
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>{LABEL[d]}</option>
          ))}
        </select>
      </div>
      <Uploader
        projectId={projectId}
        kind="drawing"
        label="Choose file and save as R0"
        validate={async () => {
          const res = await checkDrawingDetails({ projectId, number, title, discipline });
          return "error" in res && res.error ? res.error : null;
        }}
        onUploaded={async (fileId) => {
          const { id } = await createDrawing({ projectId, number, title, discipline, fileId, note: "" });
          router.push(`/projects/${projectId}/drawings/${id}`);
        }}
      />
    </div>
  );
}

/** Upload the next revision of an existing drawing. */
export function NewRevision({ projectId, drawingId, nextRev }: { projectId: string; drawingId: string; nextRev: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rev-note" className="field-label">What changed</label>
        <textarea id="rev-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field h-auto py-2" />
      </div>
      <Uploader
        projectId={projectId}
        kind="drawing"
        label={`Upload R${nextRev}`}
        onUploaded={async (fileId) => {
          await addRevision({ projectId, drawingId, fileId, note });
          setNote("");
          router.refresh();
        }}
      />
    </div>
  );
}
