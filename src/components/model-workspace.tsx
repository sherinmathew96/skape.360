"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Compass, Eye, ImageIcon, Zap } from "lucide-react";
import { addSavedView, deleteSavedView, replaceModelFile, saveModelView, setModelCover } from "@/app/studio-actions";
import type { ModelView } from "@/db/schema";
import { formatBytes } from "@/lib/file-kinds";
import { uploadFile } from "@/lib/upload-client";
import { ModelViewer, type ViewerApi } from "./model-viewer";

/** The middle of a still, cut to the cards' 4:3 shape and at most 1200 px wide. */
async function toCardThumb(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const target = 4 / 3;
  let w = bitmap.width;
  let h = bitmap.height;
  if (w / h > target) w = Math.round(h * target);
  else h = Math.round(w / target);
  const sx = Math.round((bitmap.width - w) / 2);
  const sy = Math.round((bitmap.height - h) / 2);
  const scale = Math.min(1, 1200 / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, sx, sy, w, h, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the thumbnail."))), "image/jpeg", 0.88));
}

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
      if (report.after >= report.before && !report.movable) return "This model is already as small as it gets.";
      const fileId = await uploadFile(projectId, "model", file, (l, t) => setStatus({ text: `Uploading… ${Math.round((l / t) * 100)}%` }));
      await replaceModelFile({ projectId, modelId, fileId });
      const layerNote = report.layers.length ? ` Layers kept: ${report.layers.join(", ")}.` : "";
      const moveNote = report.movable ? ` Doors and drawers that open: ${report.movable}.` : "";
      return `Optimised: ${formatBytes(report.before)} to ${formatBytes(report.after)}, ${report.meshesBefore.toLocaleString("en-IN")} pieces to ${report.meshesAfter.toLocaleString("en-IN")}.${layerNote}${moveNote}`;
    });

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="card overflow-hidden">
        <ModelViewer
          src={src}
          title={title}
          poster={poster}
          view={view}
          onApi={onApi}
          onSaveView={canManage ? (v) => addSavedView({ projectId, modelId, view: v }) : undefined}
          onDeleteView={canManage ? (id) => deleteSavedView({ projectId, modelId, viewId: id }) : undefined}
          className="aspect-[4/5] w-full sm:aspect-[4/3] lg:aspect-auto lg:h-[600px]"
        />
      </div>

      {canManage ? (
        <section className="card p-5" aria-labelledby="client-view-title">
          <h2 id="client-view-title" className="card-title mb-1">How clients see it</h2>
          <p className="mb-4 text-muted">Frame the model above, then save. Client links and embeds open this way.</p>
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
                  return "Saved. Clients open the model on this view.";
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
            {!optimized ? (
              <button type="button" disabled={busy} className="btn btn-secondary" onClick={optimise}>
                <Zap size={16} strokeWidth={1.5} aria-hidden="true" /> Optimise for fast loading ({formatBytes(size)})
              </button>
            ) : null}
          </div>
          <p aria-live="polite" className={`mt-3 min-h-5 ${status?.error ? "text-negative" : "text-muted"}`}>{status?.text ?? ""}</p>
        </section>
      ) : null}

      {canManage ? (
        <section className="card p-5" aria-labelledby="thumb-title">
          <h2 id="thumb-title" className="card-title mb-1">Thumbnail</h2>
          <p className="mb-4 text-muted">Turn and zoom the model above to the view you like, then set it. It shows on this model&rsquo;s card in the studio and on the client&rsquo;s 3D models page.</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="relative flex aspect-[4/3] w-40 flex-none items-center justify-center overflow-hidden rounded-lg border border-rule bg-gradient-to-br from-[#f6f7fb] to-[#eceefa]">
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${poster}?w=640`} alt={`Thumbnail of ${title}`} width={160} height={120} className="h-full w-full object-cover" />
              ) : (
                <span className="px-3 text-center text-xs text-muted">No thumbnail yet</span>
              )}
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <button
                type="button"
                disabled={!api || busy}
                className="btn btn-primary"
                onClick={() =>
                  run("Making the thumbnail…", async () => {
                    const blob = await api!.snapshot();
                    if (!blob) throw new Error("Wait for the model to load first.");
                    const thumb = await toCardThumb(blob);
                    const fileId = await uploadFile(projectId, "cover", new File([thumb], `${title}-thumbnail.jpg`, { type: "image/jpeg" }));
                    await setModelCover({ projectId, modelId, fileId });
                    return "Thumbnail set. It now shows on the model's cards.";
                  })
                }
              >
                <ImageIcon size={16} strokeWidth={1.5} aria-hidden="true" /> {poster ? "Set this view as the new thumbnail" : "Set this view as thumbnail"}
              </button>
              <p className="mt-2 text-xs text-muted">The middle of the view is used, in the cards&rsquo; 4:3 shape. Clients also see it while the model loads.</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
