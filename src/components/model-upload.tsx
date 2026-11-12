"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createModel } from "@/app/studio-actions";
import { Uploader } from "./uploader";

/** Name the model, pick the .glb, and open it once it has uploaded. */
export function ModelUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="model-title" className="field-label">Name</label>
        <input
          id="model-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
          aria-describedby="model-title-help"
          className="field"
        />
        <p id="model-title-help" className="mt-2 text-xs text-muted">Leave empty to use the file name.</p>
      </div>
      <Uploader
        projectId={projectId}
        kind="model"
        label="Choose .glb file"
        onUploaded={async (fileId) => {
          const { id } = await createModel({ projectId, fileId, title });
          setTitle("");
          router.push(`/projects/${projectId}/models/${id}`);
        }}
      />
    </div>
  );
}
