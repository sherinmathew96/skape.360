"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, MousePointerClick, Pencil, Star, Trash2, X } from "lucide-react";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { addHotspot, addScene, deleteHotspot, deleteScene, renameScene, setStartScene } from "@/app/studio-actions";
import type { TourData } from "@/lib/studio";
import { TourViewer } from "./tour-viewer";
import { Uploader } from "./uploader";

type Viewer = import("@photo-sphere-viewer/core").Viewer;
type Markers = import("@photo-sphere-viewer/markers-plugin").MarkersPlugin;

const doorHtml = (label: string) =>
  `<div class="skape-door" role="img" aria-label="Door to ${label.replace(/[<>&"]/g, "")}"><span></span></div>`;

/**
 * Builds a tour: upload 360° photos, then stand in one room and click where
 * the doorway to the next room is. Each click saves an arrow.
 */
export function TourBuilder({ projectId, tour }: { projectId: string; tour: TourData }) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [selectedId, setSelectedId] = useState<string | null>(tour.scenes[0]?.id ?? null);
  const [placing, setPlacing] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ viewer: Viewer; markers: Markers } | null>(null);
  const placingRef = useRef({ placing, targetId: '', targetTitle: '', selectedId });

  const selected = tour.scenes.find((s) => s.id === selectedId) ?? tour.scenes[0] ?? null;
  const others = tour.scenes.filter((s) => s.id !== selected?.id);
  const doors = tour.hotspots.filter((h) => h.sceneId === selected?.id);
  const sceneTitle = (id: string) => tour.scenes.find((s) => s.id === id)?.title ?? "scene";

  // The door's destination: the one picked, or the first other room.
  const target = others.some((o) => o.id === targetId) ? targetId : (others[0]?.id ?? "");
  const targetTitle = sceneTitle(target);

  // The viewer's click handler reads the latest choices from here.
  useEffect(() => {
    placingRef.current = { placing, targetId: target, targetTitle, selectedId: selected?.id ?? null };
  }, [placing, target, targetTitle, selected?.id]);

  // One viewer for the edit mode; swap its panorama when the scene changes.
  useEffect(() => {
    const el = container.current;
    if (mode !== "edit" || !el || !selected) return;
    let alive = true;
    let instance: Viewer | null = null;
    (async () => {
      const [{ Viewer }, { MarkersPlugin }] = await Promise.all([
        import("@photo-sphere-viewer/core"),
        import("@photo-sphere-viewer/markers-plugin"),
      ]);
      if (!alive) return;
      instance = new Viewer({
        container: el,
        panorama: `/api/files/${selected.fileId}?w=4096`,
        navbar: ["zoom", "move", "fullscreen"],
        defaultZoomLvl: 0,
        loadingTxt: "",
        mousewheelCtrlKey: true,
        plugins: [MarkersPlugin],
      });
      const markers = instance.getPlugin(MarkersPlugin) as Markers;
      viewerRef.current = { viewer: instance, markers };

      instance.addEventListener("click", ({ data }) => {
        const { placing, targetId, targetTitle, selectedId } = placingRef.current;
        if (!placing || !targetId || !selectedId || data.rightclick) return;
        setPlacing(false);
        start(async () => {
          try {
            await addHotspot({ projectId, sceneId: selectedId, targetSceneId: targetId, yaw: data.yaw, pitch: data.pitch });
            setMessage(`Door to ${targetTitle} added.`);
            router.refresh();
          } catch {
            setMessage("Could not save the door. Try again.");
          }
        });
      });

      markers.addEventListener("select-marker", ({ marker }) => {
        const label = marker.config.tooltip ? String((marker.config.tooltip as { content?: string }).content ?? "") : "this door";
        if (!window.confirm(`Remove the ${label.toLowerCase()}?`)) return;
        start(async () => {
          await deleteHotspot({ projectId, hotspotId: marker.id });
          setMessage("Door removed.");
          router.refresh();
        });
      });
    })();
    return () => {
      alive = false;
      viewerRef.current = null;
      instance?.destroy();
    };
    // Re-create only when the photo itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected?.fileId]);

  // Draw this scene's doors whenever they change.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const draw = () =>
      v.markers.setMarkers(
        doors.map((d) => ({
          id: d.id,
          position: { yaw: d.yaw, pitch: d.pitch },
          html: doorHtml(sceneTitle(d.targetSceneId)),
          size: { width: 44, height: 44 },
          anchor: "center center",
          tooltip: { content: `Door to ${sceneTitle(d.targetSceneId)}`, position: "top center" },
        })),
      );
    if (v.viewer.state.ready) draw();
    else v.viewer.addEventListener("ready", draw, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(doors), tour.scenes.map((s) => s.title).join("|")]);

  useEffect(() => {
    if (container.current) container.current.style.cursor = placing ? "crosshair" : "";
  }, [placing]);

  const uploadPanel = (
    <Uploader
      projectId={projectId}
      kind="panorama"
      multiple
      label={tour.scenes.length ? "Add 360° photos" : "Upload 360° photos"}
      onUploaded={async (fileId) => {
        const { id } = await addScene({ projectId, tourId: tour.id, fileId, title: "" });
        setSelectedId((current) => current ?? id);
        router.refresh();
      }}
    />
  );

  if (tour.scenes.length === 0) {
    return (
      <div className="card p-5">
        <h2 className="card-title mb-1">Start with the photos</h2>
        <p className="mb-4 text-muted">
          Upload one 360° photo per room or viewpoint. You can add more at any time, then link them with doors.
        </p>
        {uploadPanel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="card overflow-hidden" aria-label="Tour view">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
          <div role="group" aria-label="Mode" className="flex rounded-md bg-raised p-1">
            <button
              type="button"
              aria-pressed={mode === "edit"}
              onClick={() => setMode("edit")}
              className={`flex h-8 items-center gap-1.5 rounded-[5px] px-3 ${mode === "edit" ? "bg-surface font-medium" : "text-muted hover:text-text"}`}
            >
              <Pencil size={14} strokeWidth={1.5} aria-hidden="true" /> Edit doors
            </button>
            <button
              type="button"
              aria-pressed={mode === "preview"}
              onClick={() => {
                setPlacing(false);
                setMode("preview");
              }}
              className={`flex h-8 items-center gap-1.5 rounded-[5px] px-3 ${mode === "preview" ? "bg-surface font-medium" : "text-muted hover:text-text"}`}
            >
              <Eye size={14} strokeWidth={1.5} aria-hidden="true" /> Preview
            </button>
          </div>

          {mode === "edit" && others.length > 0 ? (
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <label htmlFor="door-target" className="text-muted">Door to</label>
              <select
                id="door-target"
                value={target}
                onChange={(e) => setTargetId(e.target.value)}
                className="field w-auto max-w-48"
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>
              {placing ? (
                <button type="button" onClick={() => setPlacing(false)} className="btn btn-secondary">
                  <X size={16} strokeWidth={1.5} aria-hidden="true" /> Cancel
                </button>
              ) : (
                <button type="button" onClick={() => setPlacing(true)} disabled={pending} className="btn btn-primary">
                  <MousePointerClick size={16} strokeWidth={1.5} aria-hidden="true" /> Place door
                </button>
              )}
            </div>
          ) : null}
        </div>

        {mode === "edit" ? (
          <div className="relative aspect-[4/3] bg-[#1a1a1a] lg:aspect-auto lg:h-[520px]">
            <div ref={container} className="absolute inset-0" />
            {placing ? (
              <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-black/75 px-3 py-1.5 text-white">
                Click the doorway to {sceneTitle(target)}
              </p>
            ) : null}
          </div>
        ) : (
          <TourViewer tour={tour} fileBase="/api/files/" className="aspect-[4/3] lg:aspect-auto lg:h-[520px]" />
        )}

        <p aria-live="polite" className="border-t border-rule px-5 py-3 text-xs text-muted">
          {message ??
            (mode === "edit"
              ? others.length === 0
                ? "Add a second photo to link rooms with doors."
                : `${selected?.title}: ${doors.length} ${doors.length === 1 ? "door" : "doors"}. Click a door to remove it.`
              : "This is what your client sees. Drag to look around; click an arrow to move.")}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3">
        <section className="card" aria-labelledby="scenes-title">
          <h2 id="scenes-title" className="card-title px-5 pb-2 pt-4">
            Rooms <span className="num text-sm font-normal text-muted">{tour.scenes.length}</span>
          </h2>
          <ul>
            {tour.scenes.map((scene, i) => {
              const active = scene.id === selected?.id;
              const count = tour.hotspots.filter((h) => h.sceneId === scene.id).length;
              return (
                <li key={scene.id} className={`flex items-center gap-2 border-t border-rule px-3 py-2 first:border-t-0 ${active ? "bg-active" : ""}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("edit");
                      setPlacing(false);
                      setMessage(null);
                      setSelectedId(scene.id);
                    }}
                    aria-current={active ? "true" : undefined}
                    className="min-w-0 flex-1 rounded-md px-2 py-1 text-left"
                  >
                    <span className="block truncate">{scene.title}</span>
                    <span className="block text-xs leading-4 text-muted">
                      {i === 0 ? "Tour opens here · " : ""}
                      {count} {count === 1 ? "door" : "doors"}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Rename"
                    aria-label={`Rename ${scene.title}`}
                    className="btn btn-quiet h-9 w-9 p-0 text-muted"
                    onClick={() => {
                      const name = window.prompt("Room name", scene.title);
                      if (name && name.trim() && name.trim() !== scene.title) {
                        start(async () => {
                          await renameScene({ projectId, sceneId: scene.id, title: name });
                          router.refresh();
                        });
                      }
                    }}
                  >
                    <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                  {i > 0 ? (
                    <button
                      type="button"
                      title="Open the tour here"
                      aria-label={`Open the tour at ${scene.title}`}
                      className="btn btn-quiet h-9 w-9 p-0 text-muted"
                      onClick={() =>
                        start(async () => {
                          await setStartScene({ projectId, sceneId: scene.id });
                          router.refresh();
                        })
                      }
                    >
                      <Star size={15} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    title="Delete"
                    aria-label={`Delete ${scene.title}`}
                    className="btn btn-quiet h-9 w-9 p-0 text-muted hover:text-negative"
                    onClick={() => {
                      if (!window.confirm(`Delete “${scene.title}” and its doors?`)) return;
                      start(async () => {
                        await deleteScene({ projectId, sceneId: scene.id });
                        if (active) setSelectedId(null);
                        router.refresh();
                      });
                    }}
                  >
                    <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border bg-ground/60 p-5">{uploadPanel}</div>
        </section>
      </div>
    </div>
  );
}
