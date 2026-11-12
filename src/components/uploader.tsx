"use client";

import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { startUpload } from "@/app/studio-actions";
import { FILE_KINDS, formatBytes, type FileKind } from "@/lib/file-kinds";
import { shrinkImage } from "@/lib/shrink-image";

type Progress = { name: string; loaded: number; total: number; index: number; count: number };

function put(url: string, file: File, contentType: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.send(file);
  });
}

/**
 * Picks files, sends each straight to storage with a progress bar, then hands
 * the stored file to `onUploaded` (which creates the model or scene).
 */
export function Uploader({
  projectId,
  kind,
  multiple = false,
  label,
  onUploaded,
  validate,
}: {
  projectId: string | null;
  kind: FileKind;
  multiple?: boolean;
  label: string;
  onUploaded: (fileId: string, file: File) => Promise<void>;
  /** Runs after files are picked, before uploading; return a message to stop. */
  validate?: () => Promise<string | null>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const info = FILE_KINDS[kind];

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    try {
      const problem = validate ? await validate() : null;
      if (problem) throw new Error(problem);
      for (const [index, picked] of list.entries()) {
        const file = kind === "photo" || kind === "receipt" ? await shrinkImage(picked) : picked;
        setProgress({ name: file.name, loaded: 0, total: file.size, index, count: list.length });
        const ticket = await startUpload({ projectId, kind, name: file.name, size: file.size, type: file.type });
        if ("error" in ticket) throw new Error(ticket.error);
        await put(ticket.uploadUrl, file, ticket.contentType, (loaded) =>
          setProgress({ name: file.name, loaded, total: file.size, index, count: list.length }),
        );
        await onUploaded(ticket.fileId, file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed. Try again.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  const pct = progress ? Math.round((progress.loaded / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={info.accept}
        multiple={multiple}
        className="sr-only"
        aria-describedby={`${id}-help`}
        disabled={progress !== null}
        onChange={(e) => handle(e.currentTarget.files)}
      />
      {progress ? (
        <div role="status" aria-live="polite" className="rounded-md border border-border bg-surface p-3">
          <p className="flex justify-between gap-3">
            <span className="truncate">
              {progress.count > 1 ? `${progress.index + 1} of ${progress.count}: ` : ""}
              {progress.name}
            </span>
            <span className="num flex-none text-muted">{pct}%</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-stage transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="num mt-1.5 text-xs text-muted">
            {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
          </p>
        </div>
      ) : (
        <label htmlFor={id} className="btn btn-secondary cursor-pointer has-[:focus-visible]:outline-2">
          <Upload size={16} strokeWidth={1.5} aria-hidden="true" />
          {label}
        </label>
      )}
      <p id={`${id}-help`} className="mt-2 text-xs text-muted">{info.help}</p>
      {error ? (
        <p role="alert" className="mt-2 text-negative">{error}</p>
      ) : null}
    </div>
  );
}
