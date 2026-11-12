"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { createSnag, markSnagFixed } from "@/app/site-actions";
import { Uploader } from "./uploader";

/** One optional photo, uploaded as soon as it's picked; shows a preview with Remove. */
function PhotoPicker({ projectId, fileId, onChange, label }: { projectId: string; fileId: string | null; onChange: (id: string | null) => void; label: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  if (fileId && preview) {
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Chosen photo" width={96} height={72} className="h-[72px] w-24 rounded-[4px] object-cover" />
        <button
          type="button"
          className="btn btn-quiet text-muted"
          onClick={() => {
            URL.revokeObjectURL(preview);
            setPreview(null);
            onChange(null);
          }}
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" /> Remove photo
        </button>
      </div>
    );
  }
  return (
    <Uploader
      projectId={projectId}
      kind="photo"
      label={label}
      onUploaded={async (id, file) => {
        setPreview(URL.createObjectURL(file));
        onChange(id);
      }}
    />
  );
}

export function RaiseSnag({ projectId, team, defaultAssignee }: { projectId: string; team: { id: string; name: string }[]; defaultAssignee: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  const [dueDate, setDueDate] = useState("");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState(0);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createSnag({ projectId, title, location, assigneeId, dueDate, photoFileId });
          setMessage(res);
          if (res.ok) {
            setTitle("");
            setLocation("");
            setDueDate("");
            setPhotoFileId(null);
            setPhotoKey((k) => k + 1);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <label htmlFor="snag-title" className="field-label">What&rsquo;s wrong</label>
        <input id="snag-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} autoComplete="off" className="field" />
      </div>
      <div>
        <label htmlFor="snag-location" className="field-label">Where</label>
        <input id="snag-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. First floor, bedroom 2" autoComplete="off" className="field" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div>
          <label htmlFor="snag-assignee" className="field-label">Who fixes it</label>
          <select id="snag-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field">
            <option value="">Not assigned yet</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="snag-due" className="field-label">Fix by</label>
          <input id="snag-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />
        </div>
      </div>
      <div>
        <span className="field-label">Photo</span>
        <PhotoPicker key={photoKey} projectId={projectId} fileId={photoFileId} onChange={setPhotoFileId} label="Take or add a photo" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Raise snag"}</button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.error ?? message?.ok ?? ""}</p>
      </div>
    </form>
  );
}

export function FixSnag({ projectId, snagId, code }: { projectId: string; snagId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary">
        <Check size={16} strokeWidth={1.5} aria-hidden="true" /> Mark fixed
      </button>
    );
  }
  return (
    <div className="mt-2 w-full space-y-3 rounded-md bg-ground p-4">
      <div>
        <label htmlFor={`fix-note-${snagId}`} className="field-label">What was done</label>
        <input id={`fix-note-${snagId}`} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" className="field" />
      </div>
      <div>
        <span className="field-label">After photo</span>
        <PhotoPicker projectId={projectId} fileId={photoFileId} onChange={setPhotoFileId} label="Add an after photo" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className="btn btn-primary"
          onClick={() =>
            start(async () => {
              const res = await markSnagFixed({ projectId, snagId, note, photoFileId });
              if (res.error) return setError(res.error);
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : `Mark ${code} fixed`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">Cancel</button>
        {error ? <p role="alert" className="text-negative">{error}</p> : null}
      </div>
    </div>
  );
}
