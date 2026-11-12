"use client";

import { startUpload } from "@/app/studio-actions";
import type { FileKind } from "./file-kinds";

/** Sends one file to storage (R2 or this computer) and returns its id. Browser only. */
export async function uploadFile(
  projectId: string | null,
  kind: FileKind,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const ticket = await startUpload({ projectId, kind, name: file.name, size: file.size, type: file.type });
  if ("error" in ticket) throw new Error(ticket.error);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    xhr.setRequestHeader("Content-Type", ticket.contentType);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded, file.size);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.send(file);
  });
  return ticket.fileId;
}
