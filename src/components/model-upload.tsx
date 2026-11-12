"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createModel } from "@/app/studio-actions";
import { formatBytes } from "@/lib/file-kinds";
import type { OptimizeReport } from "@/lib/optimize-model";
import { Uploader } from "./uploader";

/** Name the model, pick the .glb, optimise it in the browser, and open it once uploaded. */
export function ModelUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [optimize, setOptimize] = useState(true);
  const [report, setReport] = useState<OptimizeReport | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

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
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[#141414]" />
        <span>
          Make it load fast (recommended)
          <span className="block text-xs text-muted">
            Merges and compresses the model and its textures in your browser before uploading, and fixes SketchUp-style materials. Usually 3 to 6 times smaller.
          </span>
        </span>
      </label>
      <Uploader
        projectId={projectId}
        kind="model"
        label="Choose .glb file"
        prepare={
          optimize
            ? async (file, onStep) => {
                setReport(null);
                setWarning(null);
                // Very large files can exhaust a browser tab's memory; send those as they are.
                if (file.size > 250 * 1024 * 1024) {
                  setWarning("This file is too large to optimise in the browser, so it was uploaded as it is.");
                  return file;
                }
                try {
                  const { optimizeModel } = await import("@/lib/optimize-model");
                  const res = await optimizeModel(file, onStep);
                  setReport(res.report);
                  return res.report.after < res.report.before ? res.file : file;
                } catch {
                  setWarning("This model couldn't be optimised, so it was uploaded as it is.");
                  return file;
                }
              }
            : undefined
        }
        onUploaded={async (fileId) => {
          const { id } = await createModel({ projectId, fileId, title });
          setTitle("");
          router.push(`/projects/${projectId}/models/${id}`);
        }}
      />
      {report ? (
        <p role="status" className="text-xs text-muted">
          Optimised from {formatBytes(report.before)} to {formatBytes(report.after)}, {report.meshesBefore.toLocaleString("en-IN")} pieces to{" "}
          {report.meshesAfter.toLocaleString("en-IN")}.
        </p>
      ) : null}
      {warning ? <p role="status" className="text-xs text-[#92400e]">{warning}</p> : null}
    </div>
  );
}
