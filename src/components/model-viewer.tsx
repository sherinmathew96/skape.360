"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Box, Camera, Maximize2, Minimize2, Pause, Play, Plus, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
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
  canActivateAR: boolean;
  activateAR(): void;
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
/** One light for every model: soft daylight. */
const LIGHTING = "daylight" satisfies Lighting;
/** The camera stops at the horizon, so nobody sees the underside of a model. */
const MAX_PHI = "90deg";
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
 * The 3D viewer on a white ground: drag to turn, pinch to zoom. Everything
 * else (preset elevation views with a flat, drawing-like option, turning,
 * zoom, auto-rotate, a saved image, full screen, AR) sits behind one +
 * button so the model has the whole frame. Designed for clients on phones.
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
  const menuId = useId();
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<ViewName>("3d");
  const [flat, setFlat] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [envUrl, setEnvUrl] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [canAR, setCanAR] = useState(false);
  const [full, setFull] = useState(false);
  const [dims, setDims] = useState<{ x: number; y: number; z: number } | null>(null);
  const lighting = LIGHTING;
  const exposure = view.exposure ?? 1;
  const front = view.frontYaw ?? 0;

  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => {
      // Compressed (optimised) models need the meshopt decoder switched on. The
      // viewer loads it from this address; it is served by the app itself.
      const MVClass = customElements.get("model-viewer") as unknown as { meshoptDecoderLocation: string } | undefined;
      if (MVClass) MVClass.meshoptDecoderLocation = "/vendor/meshopt_decoder.js";
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The daylight sky is drawn once, in the browser.
  useEffect(() => {
    let alive = true;
    skyUrl(lighting).then((u) => alive && setEnvUrl(u));
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
      setCanAR(Boolean(el.canActivateAR));
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
        el.maxCameraOrbit = `Infinity ${MAX_PHI} auto`;
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
        el.maxCameraOrbit = `Infinity ${MAX_PHI} ${radius * 1.6}m`;
        el.fieldOfView = `${FLAT_FOV}deg`;
        el.cameraOrbit = `${v.theta + front}deg ${v.phi}deg ${radius}m`;
      } else {
        el.maxCameraOrbit = `Infinity ${MAX_PHI} auto`;
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

  // Escape closes the menu first, then full screen.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setMenu(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menu]);

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

  const item =
    "flex h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm text-text transition-colors hover:bg-active hover:text-primary";

  return (
    <div
      className={`${full ? "fixed inset-0 z-50 h-dvh w-screen" : `relative ${className}`} @container overflow-hidden bg-white`}
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
          max-camera-orbit={`Infinity ${MAX_PHI} auto`}
          interpolation-decay="90"
          shadow-intensity="1"
          shadow-softness="0.85"
          exposure={String(exposure)}
          tone-mapping="neutral"
          environment-image={envUrl ?? "neutral"}
          auto-rotate={spinning ? "" : undefined}
          auto-rotate-delay="0"
          rotation-per-second="14deg"
          ar=""
          ar-modes="webxr scene-viewer quick-look"
          style={{ width: "100%", height: "100%", background: "transparent", ["--poster-color" as string]: "transparent" } as React.CSSProperties}
        >
          <div slot="progress-bar" />
          {/* AR starts from the menu instead of the viewer's own button. */}
          <span slot="ar-button" hidden />
        </model-viewer>
      ) : null}

      {failed ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
          This model could not be loaded.
        </p>
      ) : !loaded ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/5"
          role="progressbar"
          aria-label="Loading model"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="h-full bg-stage transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}

      {loaded ? (
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
          {menu ? (
            <div
              id={menuId}
              className="max-h-[calc(100cqh-84px)] w-[min(300px,calc(100cqw-24px))] overflow-y-auto rounded-2xl border border-border bg-white p-3 shadow-[0_12px_40px_rgba(41,45,50,0.16)]"
              role="group"
              aria-label="Views and tools"
            >
              <p className="px-1 pb-2 text-xs font-medium text-muted">Views</p>
              <div className="grid grid-cols-3 gap-1" role="toolbar" aria-label="Views">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={current === v.id}
                    onClick={() => goTo(v.id)}
                    className={`h-10 rounded-lg text-sm transition-colors ${
                      current === v.id ? "bg-primary font-medium text-white" : "bg-ground text-text hover:bg-active hover:text-primary"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <label className="mt-1 flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-active" title="Elevations without perspective, like a drawing">
                Flat elevation
                <input
                  type="checkbox"
                  checked={flat}
                  onChange={(e) => {
                    setFlat(e.target.checked);
                    goTo(current === "3d" ? "front" : current, e.target.checked);
                  }}
                  className="h-4 w-4"
                />
              </label>

              <p className="mt-2 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">Move</p>
              <div className="grid grid-cols-2 gap-x-1">
                <button type="button" className={item} onClick={() => rotate(-45)}>
                  <RotateCcw size={18} strokeWidth={1.6} aria-hidden="true" /> Turn left
                </button>
                <button type="button" className={item} onClick={() => rotate(45)}>
                  <RotateCw size={18} strokeWidth={1.6} aria-hidden="true" /> Turn right
                </button>
                <button type="button" className={item} onClick={() => ref.current?.zoom(10)}>
                  <ZoomIn size={18} strokeWidth={1.6} aria-hidden="true" /> Zoom in
                </button>
                <button type="button" className={item} onClick={() => ref.current?.zoom(-10)}>
                  <ZoomOut size={18} strokeWidth={1.6} aria-hidden="true" /> Zoom out
                </button>
                <button type="button" className={item} aria-pressed={spinning} onClick={() => setSpinning((x) => !x)}>
                  {spinning ? <Pause size={18} strokeWidth={1.6} aria-hidden="true" /> : <Play size={18} strokeWidth={1.6} aria-hidden="true" />}
                  {spinning ? "Stop turning" : "Turn slowly"}
                </button>
                <button type="button" className={item} onClick={() => goTo("3d", false)}>
                  <Undo2 size={18} strokeWidth={1.6} aria-hidden="true" /> Reset view
                </button>
              </div>

              <p className="mt-2 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">More</p>
              <div className="grid grid-cols-1">
                <button type="button" className={item} onClick={saveImage}>
                  <Camera size={18} strokeWidth={1.6} aria-hidden="true" /> Save this view as an image
                </button>
                <button type="button" className={item} onClick={() => setFull((x) => !x)}>
                  {full ? <Minimize2 size={18} strokeWidth={1.6} aria-hidden="true" /> : <Maximize2 size={18} strokeWidth={1.6} aria-hidden="true" />}
                  {full ? "Exit full screen" : "Full screen"}
                </button>
                {canAR ? (
                  <button type="button" className={item} onClick={() => ref.current?.activateAR()}>
                    <Box size={18} strokeWidth={1.6} aria-hidden="true" /> View in your room
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            aria-label={menu ? "Close views and tools" : "Open views and tools"}
            aria-expanded={menu}
            aria-controls={menuId}
            title={menu ? "Close" : "Views and tools"}
            onClick={() => setMenu((x) => !x)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_24px_rgba(89,50,234,0.35)] transition-[background-color,transform] hover:bg-[var(--primary-hover)] active:scale-95"
          >
            <Plus size={26} strokeWidth={2} aria-hidden="true" className={`transition-transform duration-200 motion-reduce:transition-none ${menu ? "rotate-45" : ""}`} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
