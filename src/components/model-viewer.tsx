"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Camera,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  Ruler,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import type { Lighting, ModelView } from "@/db/schema";
import { skyUrl } from "@/lib/sky";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

type MV = HTMLElement & {
  loaded: boolean;
  cameraOrbit: string;
  fieldOfView: string;
  maxCameraOrbit: string;
  minFieldOfView: string;
  getCameraOrbit(): { theta: number; phi: number; radius: number };
  getDimensions(): { x: number; y: number; z: number };
  jumpCameraToGoal(): void;
  zoom(steps: number): void;
  toBlob(o?: { mimeType?: string; qualityArgument?: number; idealAspect?: boolean }): Promise<Blob>;
};

export type ViewName = "3d" | "front" | "right" | "back" | "left" | "top";
const VIEWS: { id: ViewName; label: string; theta: number; phi: number }[] = [
  { id: "3d", label: "3D", theta: 35, phi: 68 },
  { id: "front", label: "Front", theta: 0, phi: 90 },
  { id: "right", label: "Right", theta: 90, phi: 90 },
  { id: "back", label: "Back", theta: 180, phi: 90 },
  { id: "left", label: "Left", theta: -90, phi: 90 },
  { id: "top", label: "Top", theta: 0, phi: 0.01 },
];
const LIGHTS: { id: Lighting; label: string }[] = [
  { id: "daylight", label: "Daylight" },
  { id: "overcast", label: "Overcast" },
  { id: "evening", label: "Evening" },
  { id: "studio", label: "Studio" },
];
/** Narrow lens used for "flat" elevations: close to an orthographic drawing. */
const FLAT_FOV = 5;

const deg = (r: number) => (r * 180) / Math.PI;

export type ViewerApi = {
  /** Current horizontal direction of the camera, degrees */
  currentYaw(): number;
  /** The camera as saved for the opening view */
  currentCamera(): { orbit: string; target: string } | null;
  snapshot(): Promise<Blob | null>;
  lighting: Lighting;
  exposure: number;
};

/**
 * The 3D viewer: preset elevation views (with a flat, drawing-like option),
 * orbit and zoom controls, auto-rotate, lighting and exposure, real
 * dimensions, a saved image, and full screen. Designed for clients on phones.
 */
export function ModelViewer({
  src,
  title,
  poster,
  view = {},
  className = "",
  onApi,
}: {
  src: string;
  title: string;
  poster?: string | null;
  view?: ModelView;
  className?: string;
  onApi?: (api: ViewerApi) => void;
}) {
  const ref = useRef<MV>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<ViewName>("3d");
  const [flat, setFlat] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [lighting, setLighting] = useState<Lighting>(view.lighting ?? "daylight");
  const [exposure, setExposure] = useState(view.exposure ?? 1);
  const [shadows, setShadows] = useState(true);
  const [envUrl, setEnvUrl] = useState<string | null>(null);
  const [panel, setPanel] = useState<"look" | "size" | null>(null);
  const [full, setFull] = useState(false);
  const [dims, setDims] = useState<{ x: number; y: number; z: number } | null>(null);
  const front = view.frontYaw ?? 0;

  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => {
      // Compressed (optimised) models need the meshopt decoder switched on. The
      // viewer loads it from this address; it is served by the app itself.
      const MV = customElements.get("model-viewer") as unknown as { meshoptDecoderLocation: string } | undefined;
      if (MV) MV.meshoptDecoderLocation = "/vendor/meshopt_decoder.js";
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Lighting: the drawn skies are made once, in the browser.
  useEffect(() => {
    let alive = true;
    if (lighting !== "studio") skyUrl(lighting).then((u) => alive && setEnvUrl(u));
    return () => {
      alive = false;
    };
  }, [lighting]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const onProgress = (e: Event) => setProgress((e as CustomEvent<{ totalProgress: number }>).detail.totalProgress);
    const onLoad = () => {
      setLoaded(true);
      setDims(el.getDimensions());
    };
    const onError = () => setFailed(true);
    el.addEventListener("progress", onProgress);
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [ready]);

  const goTo = useCallback(
    (name: ViewName, flatMode = flat) => {
      const el = ref.current;
      if (!el) return;
      const v = VIEWS.find((x) => x.id === name)!;
      const useFlat = flatMode && name !== "3d";
      setCurrent(name);
      setSpinning(false);
      // The saved opening view: its own camera and framing.
      if (name === "3d" && view.opening && !flatMode) {
        el.maxCameraOrbit = "Infinity 180deg auto";
        el.minFieldOfView = "10deg";
        el.fieldOfView = "auto";
        (el as unknown as { cameraTarget: string }).cameraTarget = view.opening.target;
        el.cameraOrbit = view.opening.orbit;
        return;
      }
      (el as unknown as { cameraTarget: string }).cameraTarget = "auto auto auto";
      if (useFlat && dims) {
        // Far away with a narrow lens: lines stay parallel, like an elevation drawing.
        // Framed to the face being looked at, not the whole bounding box.
        const [w, h, depth] =
          name === "top" ? [dims.x, dims.z, dims.y] : name === "front" || name === "back" ? [dims.x, dims.y, dims.z] : [dims.z, dims.y, dims.x];
        const aspect = Math.max(0.3, el.clientWidth / Math.max(1, el.clientHeight));
        const half = Math.max(h / 2, w / 2 / aspect) * 1.12;
        const radius = half / Math.tan(((FLAT_FOV / 2) * Math.PI) / 180) + depth / 2;
        el.minFieldOfView = "1deg";
        el.maxCameraOrbit = `Infinity 180deg ${radius * 1.6}m`;
        el.fieldOfView = `${FLAT_FOV}deg`;
        el.cameraOrbit = `${v.theta + front}deg ${v.phi}deg ${radius}m`;
      } else {
        el.maxCameraOrbit = "Infinity 180deg auto";
        el.minFieldOfView = "10deg";
        el.fieldOfView = "auto";
        el.cameraOrbit = `${v.theta + front}deg ${v.phi}deg auto`;
      }
    },
    [dims, flat, front, view.opening],
  );

  // Open on the saved opening view, or the 3D view, once the size is known.
  useEffect(() => {
    if (!loaded) return;
    goTo("3d", false);
    ref.current?.jumpCameraToGoal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const rotate = (by: number) => {
    const el = ref.current;
    if (!el) return;
    const o = el.getCameraOrbit();
    setSpinning(false);
    el.cameraOrbit = `${deg(o.theta) + by}deg ${deg(o.phi)}deg ${o.radius}m`;
  };

  const snapshot = useCallback(async () => {
    const el = ref.current;
    if (!el?.loaded) return null;
    return el.toBlob({ mimeType: "image/jpeg", qualityArgument: 0.9, idealAspect: true });
  }, []);

  useEffect(() => {
    onApi?.({
      currentYaw: () => {
        const o = ref.current?.getCameraOrbit();
        return o ? Math.round(deg(o.theta)) : 0;
      },
      currentCamera: () => {
        const el = ref.current as (MV & { getCameraTarget(): { x: number; y: number; z: number } }) | null;
        if (!el) return null;
        const o = el.getCameraOrbit();
        const t = el.getCameraTarget();
        const n = (x: number, d = 2) => Number(x.toFixed(d));
        return { orbit: `${n(deg(o.theta), 1)}deg ${n(deg(o.phi), 1)}deg ${n(o.radius)}m`, target: `${n(t.x)}m ${n(t.y)}m ${n(t.z)}m` };
      },
      snapshot,
      lighting,
      exposure,
    });
  }, [onApi, snapshot, lighting, exposure]);

  // Full screen as a fixed layer: works on iPhones too, where the Fullscreen API doesn't.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [full]);

  const saveImage = async () => {
    const blob = await snapshot();
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "model"}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const tool = "flex h-10 w-10 items-center justify-center rounded-md text-[#141414] transition-colors hover:bg-[#ececec] disabled:opacity-40";
  const fmt = (m: number) => `${m < 10 ? m.toFixed(2) : m.toFixed(1)} m`;

  return (
    <div
      ref={wrap}
      className={`${full ? "fixed inset-0 z-50 h-dvh w-screen" : `relative ${className}`} @container overflow-hidden bg-[#e9e7e3]`}
      role="region"
      aria-label={`${title}, 3D model`}
    >
      {ready ? (
        <model-viewer
          ref={ref}
          src={src}
          alt={title}
          poster={poster ?? undefined}
          loading="eager"
          reveal="auto"
          camera-controls=""
          touch-action="pan-y"
          interaction-prompt="none"
          min-camera-orbit="auto 0deg auto"
          interpolation-decay="90"
          shadow-intensity={shadows ? "1" : "0"}
          shadow-softness="0.85"
          exposure={String(exposure)}
          tone-mapping="neutral"
          environment-image={lighting === "studio" || !envUrl ? "neutral" : envUrl}
          auto-rotate={spinning ? "" : undefined}
          auto-rotate-delay="0"
          rotation-per-second="14deg"
          ar=""
          ar-modes="webxr scene-viewer quick-look"
          style={{ width: "100%", height: "100%", background: "transparent", ["--poster-color" as string]: "transparent" } as React.CSSProperties}
        >
          <div slot="progress-bar" />
          <button
            slot="ar-button"
            type="button"
            className="absolute left-3 top-3 flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-[#141414] shadow-sm"
          >
            <Box size={16} strokeWidth={1.5} aria-hidden="true" /> View in your room
          </button>
        </model-viewer>
      ) : null}

      {failed ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
          This model could not be loaded.
        </p>
      ) : !loaded ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/5" role="progressbar" aria-label="Loading model" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-stage transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}

      {loaded ? (
        <>
          {/* Right: one toolbar. On narrow viewers (phones, small embeds) only what fingers can't do. */}
          <div className="absolute right-2 top-2 flex flex-col gap-0.5 rounded-lg bg-white p-1 shadow-sm" role="toolbar" aria-label="Camera and tools" aria-orientation="vertical">
            <button type="button" className={`${tool} @max-md:hidden`} aria-label="Turn left" title="Turn left" onClick={() => rotate(-45)}>
              <RotateCcw size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={`${tool} @max-md:hidden`} aria-label="Turn right" title="Turn right" onClick={() => rotate(45)}>
              <RotateCw size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${tool} ${spinning ? "bg-[#141414] text-white hover:bg-[#2e2e2e]" : ""}`}
              aria-label={spinning ? "Stop turning" : "Turn slowly"}
              aria-pressed={spinning}
              title={spinning ? "Stop turning" : "Turn slowly"}
              onClick={() => setSpinning((x) => !x)}
            >
              {spinning ? <Pause size={18} strokeWidth={1.5} aria-hidden="true" /> : <Play size={18} strokeWidth={1.5} aria-hidden="true" />}
            </button>
            <span className="mx-2 my-0.5 h-px bg-[#e6e6e6] @max-md:hidden" aria-hidden="true" />
            <button type="button" className={`${tool} @max-md:hidden`} aria-label="Zoom in" title="Zoom in" onClick={() => ref.current?.zoom(10)}>
              <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={`${tool} @max-md:hidden`} aria-label="Zoom out" title="Zoom out" onClick={() => ref.current?.zoom(-10)}>
              <Minus size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={tool} aria-label="Reset the view" title="Reset the view" onClick={() => goTo("3d", false)}>
              <Undo2 size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span className="mx-2 my-0.5 h-px bg-[#e6e6e6]" aria-hidden="true" />
            <button type="button" className={`${tool} ${panel === "look" ? "bg-[#ececec]" : ""}`} aria-label="Lighting" aria-expanded={panel === "look"} title="Lighting" onClick={() => setPanel(panel === "look" ? null : "look")}>
              <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={`${tool} ${panel === "size" ? "bg-[#ececec]" : ""}`} aria-label="Size" aria-expanded={panel === "size"} title="Size" onClick={() => setPanel(panel === "size" ? null : "size")}>
              <Ruler size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={tool} aria-label="Save this view as an image" title="Save this view as an image" onClick={saveImage}>
              <Camera size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={tool} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"} onClick={() => setFull((x) => !x)}>
              {full ? <Minimize2 size={18} strokeWidth={1.5} aria-hidden="true" /> : <Maximize2 size={18} strokeWidth={1.5} aria-hidden="true" />}
            </button>
          </div>

          {/* Bottom: preset views and flat elevations, scrolling sideways when narrow */}
          <div className="absolute bottom-2 left-2 right-2 flex @md:right-auto">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm" role="toolbar" aria-label="Views">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={current === v.id}
                  onClick={() => goTo(v.id)}
                  className={`h-9 flex-none rounded-md px-3 text-sm ${current === v.id ? "bg-[#141414] font-medium text-white" : "text-[#141414] hover:bg-[#ececec]"}`}
                >
                  {v.label}
                </button>
              ))}
              <span className="mx-1 h-6 w-px flex-none bg-[#e6e6e6]" aria-hidden="true" />
              <label className="flex h-9 flex-none cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-[#141414] hover:bg-[#ececec]" title="Elevations without perspective, like a drawing">
                <input
                  type="checkbox"
                  checked={flat}
                  onChange={(e) => {
                    setFlat(e.target.checked);
                    goTo(current === "3d" ? "front" : current, e.target.checked);
                  }}
                  className="h-4 w-4 accent-primary"
                />
                Flat
              </label>
            </div>
          </div>

          {panel ? (
            <div className="absolute right-14 top-2 w-[min(280px,calc(100%-72px))] rounded-lg bg-white p-4 text-sm text-[#141414] shadow-md" role="dialog" aria-label={panel === "look" ? "Lighting" : "Size"}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">{panel === "look" ? "Lighting" : "Size"}</p>
                <button type="button" className="-m-2 flex h-9 w-9 items-center justify-center rounded-md hover:bg-[#ececec]" aria-label="Close" onClick={() => setPanel(null)}>
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              {panel === "look" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Light">
                    {LIGHTS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={lighting === l.id}
                        onClick={() => setLighting(l.id)}
                        className={`h-9 rounded-md ${lighting === l.id ? "bg-[#141414] font-medium text-white" : "bg-[#f2f2f2] hover:bg-[#e8e8e8]"}`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="mv-exposure" className="mb-1 flex justify-between">
                      Brightness <span className="tabular-nums text-muted">{exposure.toFixed(1)}</span>
                    </label>
                    <input id="mv-exposure" type="range" min={0.4} max={2} step={0.1} value={exposure} onChange={(e) => setExposure(Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <label className="flex cursor-pointer items-center justify-between">
                    Ground shadow
                    <input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} className="h-4 w-4 accent-primary" />
                  </label>
                </div>
              ) : dims ? (
                <dl className="space-y-1.5 tabular-nums">
                  <div className="flex justify-between"><dt className="text-muted">Width</dt><dd>{fmt(dims.x)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Depth</dt><dd>{fmt(dims.z)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Height</dt><dd>{fmt(dims.y)}</dd></div>
                  <p className="pt-2 text-xs text-muted">Overall size of the model, including any site and landscaping in it.</p>
                </dl>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
