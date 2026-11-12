"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Compass, Eye, ImageIcon, Zap } from "lucide-react";
import { replaceModelFile, saveModelView, setModelCover } from "@/app/studio-actions";
import type { ModelView } from "@/db/schema";
import { formatBytes } from "@/lib/file-kinds";
import { uploadFile } from "@/lib/upload-client";
import { ModelViewer, type ViewerApi } from "./model-viewer";

/**
 * The model page for studio staff: the viewer, plus the controls that set how
 * clients will see it (front, lighting, cover) and the one-time optimisation.
 */
export function ModelWorkspace({
  projectId,
  modelId,
  title,
  src,
  poster,
  view,
  optimized,
  size,
  canManage,
}: {
  projectId: string;
  modelId: string;
  title: string;
  src: string;
  poster: string | null;
  view: ModelView;
  optimized: boolean;
  size: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [api, setApi] = useState<ViewerApi | null>(null);
  const onApi = useCallback((a: ViewerApi) => setApi(a), []);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();

  const run = (label: string, work: () => Promise<string>) =>
    start(async () => {
      setStatus({ text: label });
      try {
        setStatus({ text: await work() });
        router.refresh();
      } catch (err) {
        setStatus({ text: err instanceof Error ? err.message : "That didn't work. Try again.", error: true });
      }
    });

  const optimise = () =>
    run("Downloading the model…", async () => {
      const res = await fetch(src);
      if (!res.ok) throw new Error("Couldn't download the model to optimise it.");
      const original = new File([await res.blob()], `${title}.glb`, { type: "model/gltf-binary" });
      const { optimizeModel } = await import("@/lib/optimize-model");
      const { file, report } = await optimizeModel(original, (step) => setStatus({ text: step }));
      if (report.after >= report.before) return "This model is already as small as it gets.";
      const fileId = await uploadFile(projectId, "model", file, (l, t) => setStatus({ text: `Uploading… ${Math.round((l / t) * 100)}%` }));
      await replaceModelFile({ projectId, modelId, fileId });
      return `Optimised: ${formatBytes(report.before)} to ${formatBytes(report.after)}, ${report.meshesBefore.toLocaleString("en-IN")} pieces to ${report.meshesAfter.toLocaleString("en-IN")}.`;
    });

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="card overflow-hidden">
        <ModelViewer src={src} title={title} poster={poster} view={view} onApi={onApi} className="aspect-[4/5] w-full sm:aspect-[4/3] lg:aspect-auto lg:h-[600px]" />
      </div>

      {canManage ? (
        <section className="card p-5" aria-labelledby="client-view-title">
          <h2 id="client-view-title" className="card-title mb-1">How clients see it</h2>
          <p className="mb-4 text-muted">Frame the model and pick the lighting above, then save. Client links and embeds open this way.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!api || busy}
              className="btn btn-primary"
              onClick={() =>
                run("Saving…", async () => {
                  const camera = api!.currentCamera();
                  if (!camera) throw new Error("Wait for the model to load first.");
                  await saveModelView({ projectId, modelId, view: { opening: camera, lighting: api!.lighting, exposure: api!.exposure } });
                  return "Saved. Clients open the model on this view, with this lighting.";
                })
              }
            >
              <Eye size={16} strokeWidth={1.5} aria-hidden="true" /> Save as opening view
            </button>
            <button
              type="button"
              disabled={!api || busy}
              className="btn btn-secondary"
              onClick={() =>
                run("Saving…", async () => {
                  const yaw = api!.currentYaw();
                  await saveModelView({ projectId, modelId, view: { frontYaw: ((yaw % 360) + 360) % 360 } });
                  return "Saved. The Front view now looks from this direction.";
                })
              }
            >
              <Compass size={16} strokeWidth={1.5} aria-hidden="true" /> Use this direction as Front
            </button>
            <button
              type="button"
              disabled={!api || busy}
              className="btn btn-secondary"
              onClick={() =>
                run("Making the cover…", async () => {
                  const blob = await api!.snapshot();
                  if (!blob) throw new Error("Wait for the model to load first.");
                  const fileId = await uploadFile(projectId, "cover", new File([blob], `${title}-cover.jpg`, { type: "image/jpeg" }));
                  await setModelCover({ projectId, modelId, fileId });
                  return "Cover saved. Clients see it while the model loads.";
                })
              }
            >
              <ImageIcon size={16} strokeWidth={1.5} aria-hidden="true" /> Use this view as cover
            </button>
            {!optimized ? (
              <button type="button" disabled={busy} className="btn btn-secondary" onClick={optimise}>
                <Zap size={16} strokeWidth={1.5} aria-hidden="true" /> Optimise for fast loading ({formatBytes(size)})
              </button>
            ) : null}
          </div>
          <p aria-live="polite" className={`mt-3 min-h-5 ${status?.error ? "text-negative" : "text-muted"}`}>{status?.text ?? ""}</p>
        </section>
      ) : null}
    </div>
  );
}
