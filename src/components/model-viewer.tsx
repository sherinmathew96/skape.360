"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Archive, Bookmark, Box, Camera, DoorOpen, FoldHorizontal, Hand, Layers, Maximize2, Minimize2, Move, MoveHorizontal, Pause, Play, Plus, RotateCcw, RotateCw, Scissors, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Lighting, ModelView, SavedView } from "@/db/schema";
import type { PartKind, SceneTools, Section } from "@/lib/model-scene";
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
  getCameraTarget(): { x: number; y: number; z: number };
  getFieldOfView(): number;
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
  touchAction = "pan-y",
  onApi,
  onSaveView,
  onDeleteView,
}: {
  src: string;
  title: string;
  poster?: string | null;
  view?: ModelView;
  className?: string;
  /** "none" when the viewer fills the screen and the page has nothing to scroll. */
  touchAction?: "pan-y" | "none";
  onApi?: (api: ViewerApi) => void;
  /** Studio only: keep the current cut, layers and camera as a named view. */
  onSaveView?: (view: Omit<SavedView, "id">) => Promise<{ error?: string; view?: SavedView }>;
  onDeleteView?: (id: string) => Promise<unknown>;
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
  const [hint, setHint] = useState(false);
  // Layers, explode and the plan cut (when the viewer's scene can be reached).
  const [tools, setTools] = useState<SceneTools | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [explode, setExplode] = useState(0);
  const [cutOn, setCutOn] = useState(false);
  const [cutH, setCutH] = useState(1.2);
  const [secOn, setSecOn] = useState(false);
  const [sec, setSec] = useState<Section>({ dir: "front", at: 0.5, flip: false });
  // Doors, drawers and sliding shutters that are open, by number.
  const [open, setOpen] = useState<number[]>([]);
  // Until someone opens a part, a note says they can.
  // A small button on the part under the mouse; on touch screens, on every part for a moment.
  const [hoverPart, setHoverPart] = useState<number | null>(null);
  const [marks, setMarks] = useState(false);
  const [saved, setSaved] = useState<SavedView[]>(view.saved ?? []);
  const [viewName, setViewName] = useState("");
  const [viewNote, setViewNote] = useState<{ text: string; error?: boolean } | null>(null);
  // New saved views from the server (another person, a refresh): follow them.
  const [savedKey, setSavedKey] = useState(JSON.stringify(view.saved ?? []));
  const incomingKey = JSON.stringify(view.saved ?? []);
  if (incomingKey !== savedKey) {
    setSavedKey(incomingKey);
    setSaved(view.saved ?? []);
  }
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
      if (window.matchMedia("(pointer: coarse)").matches) setHint(true);
      setDims(el.getDimensions());
      setCanAR(Boolean(el.canActivateAR));
      import("@/lib/model-scene")
        .then((m) => {
          const tools = m.attachSceneTools(el);
          setTools(tools);
          if (tools) setCutH((h) => Math.min(h, tools.height));
        })
        .catch(() => setTools(null));
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

  useEffect(() => {
    tools?.setHidden(hidden);
  }, [tools, hidden]);
  const cutting = cutOn || secOn;
  useEffect(() => {
    tools?.setCut(cutOn ? cutH : null);
    tools?.setSection(secOn ? sec : null, front);
    tools?.setExplode(cutting ? 0 : explode);
    // The floor shadow ignores hidden, lifted, cut and opened parts: leave it out while they apply.
    ref.current?.setAttribute("shadow-intensity", cutting || explode > 0 || hidden.length || open.length ? "0" : "1");
  }, [tools, cutOn, cutH, secOn, sec, front, cutting, explode, hidden, open.length]);
  useEffect(() => {
    tools?.setOpen(open);
  }, [tools, open]);
  // A tap (not a drag) on a door or drawer opens or closes it.
  useEffect(() => {
    const el = ref.current;
    if (!el || !tools?.movable) return;
    const viewer = el as unknown as { disableTap: boolean };
    let down: { x: number; y: number; t: number; id: number; part: number } | null = null;
    // Caught on the way in, before the viewer sees it: a tap on a part opens it
    // instead of moving the view's centre there (the viewer's own tap).
    const onDown = (e: PointerEvent) => {
      const part = e.isPrimary ? tools.pick(e.clientX, e.clientY) : null;
      down = part === null ? null : { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, part };
      viewer.disableTap = part !== null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId) return;
      // Let the viewer's own tap work again once it has seen this one.
      setTimeout(() => (viewer.disableTap = false));
      if (e.timeStamp - d.t > 500 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      setOpen((o) => (o.includes(d.part) ? o.filter((x) => x !== d.part) : [...o, d.part]));
      setMarks(false);
    };
    // A pointing hand over parts that open (mouse only, checked a few times a second).
    const surface = el.shadowRoot?.querySelector<HTMLElement>(".userInput") ?? null;
    let at: { x: number; y: number } | null = null;
    let timer = 0;
    let over = false;
    const check = () => {
      timer = 0;
      if (!surface || !at) return;
      const part = tools.pick(at.x, at.y);
      const now = part !== null;
      if (now !== over) surface.style.cursor = now ? "pointer" : "grab";
      over = now;
      setHoverPart(part);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (e.buttons) return setHoverPart(null);
      at = { x: e.clientX, y: e.clientY };
      // Where the mouse is after a short pause, never more than ~10 times a second.
      if (!timer) timer = window.setTimeout(check, 90);
    };
    el.addEventListener("pointerdown", onDown, { capture: true });
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    const onLeave = () => {
      at = null;
      setHoverPart(null);
    };
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown, { capture: true });
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      window.clearTimeout(timer);
      viewer.disableTap = false;
    };
  }, [tools]);
  // The cuts stay put when the view is panned.
  useEffect(() => {
    const el = ref.current;
    if (!el || !tools || !cutting) return;
    const onMove = () => tools.update();
    el.addEventListener("camera-change", onMove);
    return () => el.removeEventListener("camera-change", onMove);
  }, [tools, cutting]);

  const planView = () => {
    setFlat(true);
    goTo("top", true);
  };

  // Looking straight at the cut face, without perspective, like a drawn section.
  const sectionView = () => {
    setFlat(true);
    goTo(sec.dir === "front" ? (sec.flip ? "back" : "front") : sec.flip ? "left" : "right", true);
  };

  const openSaved = (v: SavedView) => {
    const el = ref.current;
    if (!el) return;
    setHidden(v.hidden);
    setExplode(v.explode);
    setCutOn(v.cut !== null);
    if (v.cut !== null) setCutH(v.cut);
    setSecOn(Boolean(v.section));
    if (v.section) setSec(v.section);
    setOpen(v.open ?? []);
    setSpinning(false);
    setFlat(Boolean(v.fov));
    el.minFieldOfView = v.fov ? "1deg" : "10deg";
    el.maxCameraOrbit = v.fov ? `Infinity ${MAX_PHI} ${Number.parseFloat(v.orbit.split(" ")[2]) * 1.6}m` : `Infinity ${MAX_PHI} auto`;
    el.fieldOfView = v.fov ?? "auto";
    (el as unknown as { cameraTarget: string }).cameraTarget = v.target;
    el.cameraOrbit = v.orbit;
  };

  const saveCurrent = async () => {
    const el = ref.current;
    if (!el || !onSaveView) return;
    const name = viewName.trim();
    if (!name) return setViewNote({ text: "Give the view a name.", error: true });
    const o = el.getCameraOrbit();
    const tg = el.getCameraTarget();
    const n = (x: number, d = 2) => Number(x.toFixed(d));
    const fov = el.getFieldOfView();
    const res = await onSaveView({
      name,
      orbit: `${n(deg(o.theta), 1)}deg ${n(deg(o.phi), 1)}deg ${n(o.radius)}m`,
      target: `${n(tg.x)}m ${n(tg.y)}m ${n(tg.z)}m`,
      ...(fov < 9 ? { fov: `${n(fov, 1)}deg` } : {}),
      cut: cutOn ? n(cutH) : null,
      section: secOn ? { ...sec, at: n(sec.at, 3) } : null,
      hidden,
      explode: cutting ? 0 : n(explode),
      ...(open.length ? { open } : {}),
    });
    const made = res.view;
    if (res.error || !made) return setViewNote({ text: res.error ?? "That view could not be saved.", error: true });
    setSaved((s) => [...s, made]);
    setViewName("");
    setViewNote({ text: `Saved “${made.name}”.` });
  };

  const removeSaved = async (v: SavedView) => {
    if (!onDeleteView || !window.confirm(`Delete the view “${v.name}”?`)) return;
    await onDeleteView(v.id);
    setSaved((s) => s.filter((x) => x.id !== v.id));
  };

  // After the gesture card on a touch screen: a moment of buttons on the parts
  // that open, the first few times on this device only.
  const afterHint = () => {
    setHint(false);
    if (!tools?.movable) return;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem("skape-part-marks")) || 0;
      localStorage.setItem("skape-part-marks", String(seen + 1));
    } catch {}
    if (seen >= 3) return;
    setMarks(true);
    window.setTimeout(() => setMarks(false), 5000);
  };

  const showLayers = Boolean(tools && tools.layers.length >= 2);
  const fmtM = (m: number) => `${m.toFixed(2)} m`;

  const rotate = (by: number) => {
    const el = ref.current;
    if (!el) return;
    const o = el.getCameraOrbit();
    setSpinning(false);
    el.cameraOrbit = `${deg(o.theta) + by}deg ${deg(o.phi)}deg ${o.radius}m`;
  };

  // The viewer's background is see-through; a JPEG straight from it turns that black.
  // Capture as PNG and lay it on white, as the model is shown.
  const snapshot = useCallback(async () => {
    const el = ref.current;
    if (!el?.loaded) return null;
    const png = await el.toBlob({ mimeType: "image/png", idealAspect: true });
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return png;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
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
          touch-action={touchAction}
          interaction-prompt="none"
          min-camera-orbit="auto 0deg auto"
          max-camera-orbit={`Infinity ${MAX_PHI} auto`}
          interpolation-decay="90"
          shadow-intensity="1"
          shadow-softness="0.7"
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

      {hint ? <GestureHint touchAction={touchAction} movable={Boolean(tools?.movable)} onDone={afterHint} /> : null}

      {tools?.movable && !hint && (hoverPart !== null || marks) ? (
        <PartBadges tools={tools} parts={hoverPart !== null ? [hoverPart] : tools.kinds.map((_, i) => i)} open={open} labelled={hoverPart !== null} />
      ) : null}

      {loaded ? (
        // Pinned to the viewer's height, so a long menu scrolls inside it rather than spilling over the top.
        <div className="pointer-events-none absolute bottom-3 right-3 top-3 flex flex-col items-end justify-end gap-2">
          {menu ? (
            <div
              id={menuId}
              className="pointer-events-auto min-h-0 w-[min(300px,calc(100cqw-24px))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-white p-3 shadow-[0_12px_40px_rgba(41,45,50,0.16)]"
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

              {saved.length || onSaveView ? (
                <>
                  <p className="mt-2 flex items-center gap-1.5 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">
                    <Bookmark size={13} strokeWidth={1.8} aria-hidden="true" /> Saved views
                  </p>
                  {saved.length ? (
                    <ul className="grid grid-cols-1 gap-1">
                      {saved.map((v) => (
                        <li key={v.id} className="flex items-center gap-1">
                          <button type="button" onClick={() => openSaved(v)} className="h-10 min-w-0 flex-1 truncate rounded-lg bg-ground px-3 text-left text-sm hover:bg-active hover:text-primary">
                            {v.name}
                          </button>
                          {onDeleteView ? (
                            <button type="button" onClick={() => removeSaved(v)} aria-label={`Delete the view ${v.name}`} title="Delete view" className="btn btn-quiet h-10 w-9 flex-none p-0 text-muted">
                              <X size={15} strokeWidth={1.8} aria-hidden="true" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {onSaveView ? (
                    <form
                      className="mt-1 flex gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveCurrent();
                      }}
                    >
                      <label className="sr-only" htmlFor={`${menuId}-vname`}>
                        View name
                      </label>
                      <input
                        id={`${menuId}-vname`}
                        value={viewName}
                        onChange={(e) => setViewName(e.target.value)}
                        placeholder="e.g. Ground floor plan"
                        maxLength={60}
                        autoComplete="off"
                        className="input h-10 min-w-0 flex-1 text-sm"
                      />
                      <button type="submit" className="btn btn-primary h-10 flex-none px-3 text-sm">
                        Save view
                      </button>
                    </form>
                  ) : null}
                  {viewNote ? (
                    <p role={viewNote.error ? "alert" : "status"} className={`px-1 pt-1 text-xs ${viewNote.error ? "text-negative" : "text-muted"}`}>
                      {viewNote.text}
                    </p>
                  ) : null}
                </>
              ) : null}

              {tools ? (
                <>
                  <p className="mt-2 flex items-center gap-1.5 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">
                    <Scissors size={13} strokeWidth={1.8} aria-hidden="true" /> Plan cut
                  </p>
                  <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-active">
                    Cut through the model
                    <input type="checkbox" checked={cutOn} onChange={(e) => setCutOn(e.target.checked)} className="h-4 w-4" />
                  </label>
                  {cutOn ? (
                    <div className="px-3 pb-1">
                      <label htmlFor={`${menuId}-cut`} className="flex items-baseline justify-between text-xs text-muted">
                        Cut height <span className="num text-sm font-medium text-text">{fmtM(cutH)}</span>
                      </label>
                      <input
                        id={`${menuId}-cut`}
                        type="range"
                        min={0}
                        max={tools.height}
                        step={0.05}
                        value={cutH}
                        onChange={(e) => setCutH(Number(e.target.value))}
                        className="w-full accent-[var(--primary)]"
                        aria-valuetext={fmtM(cutH)}
                      />
                      <button type="button" onClick={planView} className="mt-1 h-10 w-full rounded-lg bg-ground text-sm hover:bg-active hover:text-primary">
                        Plan view (from above)
                      </button>
                    </div>
                  ) : null}

                  <p className="mt-2 flex items-center gap-1.5 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">
                    <Scissors size={13} strokeWidth={1.8} aria-hidden="true" className="rotate-90" /> Section
                  </p>
                  <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-active">
                    Vertical section
                    <input type="checkbox" checked={secOn} onChange={(e) => setSecOn(e.target.checked)} className="h-4 w-4" />
                  </label>
                  {secOn ? (
                    <div className="px-3 pb-1">
                      <div className="mb-2 grid grid-cols-2 gap-1" role="radiogroup" aria-label="Section direction">
                        {(
                          [
                            ["front", "Front to back"],
                            ["side", "Side to side"],
                          ] as const
                        ).map(([dir, label]) => (
                          <button
                            key={dir}
                            type="button"
                            role="radio"
                            aria-checked={sec.dir === dir}
                            onClick={() => setSec((s) => ({ ...s, dir }))}
                            className={`h-9 rounded-lg text-sm transition-colors ${sec.dir === dir ? "bg-primary font-medium text-white" : "bg-ground text-text hover:bg-active hover:text-primary"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label htmlFor={`${menuId}-sec`} className="flex items-baseline justify-between text-xs text-muted">
                        {sec.dir === "front" ? "From the front" : "From the left"}
                        <span className="num text-sm font-medium text-text">{fmtM(sec.at * tools.extent(sec.dir, front))}</span>
                      </label>
                      <input
                        id={`${menuId}-sec`}
                        type="range"
                        min={0}
                        max={1}
                        step={0.005}
                        value={sec.at}
                        onChange={(e) => setSec((s) => ({ ...s, at: Number(e.target.value) }))}
                        className="w-full accent-[var(--primary)]"
                        aria-valuetext={fmtM(sec.at * tools.extent(sec.dir, front))}
                      />
                      <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-lg text-sm">
                        {sec.dir === "front" ? "Keep the front part" : "Keep the right part"}
                        <input type="checkbox" checked={sec.flip} onChange={(e) => setSec((s) => ({ ...s, flip: e.target.checked }))} className="h-4 w-4" />
                      </label>
                      <button type="button" onClick={sectionView} className="mt-1 h-10 w-full rounded-lg bg-ground text-sm hover:bg-active hover:text-primary">
                        Section view (straight on)
                      </button>
                    </div>
                  ) : null}

                  {tools.movable ? (
                    <>
                      <p className="mt-2 flex items-center gap-1.5 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">
                        <DoorOpen size={13} strokeWidth={1.8} aria-hidden="true" /> Doors and drawers
                      </p>
                      <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-active">
                        Open all
                        <input
                          type="checkbox"
                          checked={open.length === tools.movable}
                          onChange={(e) => {
                            setOpen(e.target.checked ? Array.from({ length: tools.movable }, (_, i) => i) : []);
                          }}
                          className="h-4 w-4"
                        />
                      </label>
                      <p className="px-3 pb-1 text-xs text-muted">Or tap one in the model to open or close it.</p>
                    </>
                  ) : null}

                  {showLayers ? (
                    <>
                      <p className="mt-2 flex items-center gap-1.5 border-t border-rule px-1 pb-1 pt-3 text-xs font-medium text-muted">
                        <Layers size={13} strokeWidth={1.8} aria-hidden="true" /> Layers
                      </p>
                      <ul className="grid grid-cols-1">
                        {[...tools.layers].reverse().map((name) => (
                          <li key={name}>
                            <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-active">
                              <span className="min-w-0 truncate">{name}</span>
                              <input
                                type="checkbox"
                                checked={!hidden.includes(name)}
                                onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== name) : [...h, name]))}
                                className="h-4 w-4"
                              />
                            </label>
                          </li>
                        ))}
                      </ul>
                      <div className="px-3 pb-1 pt-1">
                        <label htmlFor={`${menuId}-explode`} className="flex items-baseline justify-between text-xs text-muted">
                          Explode {cutting ? <span>(off while cutting)</span> : null}
                        </label>
                        <input
                          id={`${menuId}-explode`}
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={explode}
                          disabled={cutting}
                          onChange={(e) => setExplode(Number(e.target.value))}
                          className="w-full accent-[var(--primary)] disabled:opacity-40"
                        />
                      </div>
                    </>
                  ) : null}
                  {cutting || explode > 0 || hidden.length ? (
                    <button
                      type="button"
                      className={item}
                      onClick={() => {
                        setCutOn(false);
                        setSecOn(false);
                        setExplode(0);
                        setHidden([]);
                      }}
                    >
                      <Undo2 size={18} strokeWidth={1.6} aria-hidden="true" /> Show the whole model
                    </button>
                  ) : null}
                </>
              ) : null}

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
            className="pointer-events-auto flex h-14 w-14 flex-none items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_24px_rgba(89,50,234,0.35)] transition-[background-color,transform] hover:bg-[var(--primary-hover)] active:scale-95"
          >
            <Plus size={26} strokeWidth={2} aria-hidden="true" className={`transition-transform duration-200 motion-reduce:transition-none ${menu ? "rotate-45" : ""}`} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Shown over the model on phones: how to move it. Goes on the first touch or after a few seconds. */
const PART_ICON: Record<PartKind, typeof DoorOpen> = { door: DoorOpen, drawer: Archive, slide: MoveHorizontal, fold: FoldHorizontal };

/** Small buttons over the parts that open, following them as the model turns. Taps pass through to the model. */
function PartBadges({ tools, parts, open, labelled }: { tools: SceneTools; parts: number[]; open: number[]; labelled: boolean }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const key = parts.join(",");
  useEffect(() => {
    const list = key.split(",").map(Number);
    let raf = 0;
    const place = () => {
      list.forEach((p, k) => {
        const badge = refs.current[k];
        if (!badge) return;
        const a = tools.anchor(p);
        badge.style.opacity = a ? "1" : "0";
        if (a) badge.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -50%)`;
      });
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [tools, key]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {parts.map((p, k) => {
        const Icon = PART_ICON[tools.kinds[p]];
        return (
          <span
            key={p}
            ref={(n) => {
              refs.current[k] = n;
            }}
            style={{ opacity: 0 }}
            className={`absolute left-0 top-0 flex items-center gap-1.5 rounded-full bg-white/95 text-primary shadow-[0_4px_16px_rgba(41,45,50,0.22)] transition-opacity duration-150 ${labelled ? "h-8 pl-2 pr-3 text-xs font-medium" : "h-7 w-7 justify-center motion-safe:animate-pulse"}`}
          >
            <Icon size={labelled ? 15 : 14} strokeWidth={1.9} />
            {labelled ? (open.includes(p) ? "Close" : "Open") : null}
          </span>
        );
      })}
    </div>
  );
}

function GestureHint({ touchAction, movable, onDone }: { touchAction: "pan-y" | "none"; movable: boolean; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const away = () => done.current();
    const t = window.setTimeout(away, 6000);
    window.addEventListener("pointerdown", away, { capture: true, once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", away, { capture: true });
    };
  }, []);
  const rows = [
    { Icon: Hand, text: touchAction === "none" ? "One finger: turn and tilt" : "Drag sideways: turn and tilt" },
    { Icon: ZoomIn, text: "Pinch: zoom in and out" },
    { Icon: Move, text: "Two fingers: move" },
    ...(movable ? [{ Icon: DoorOpen, text: "Tap a door or drawer: open it" }] : []),
  ];
  return (
    <div role="note" aria-live="polite" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 p-6">
      <div className="w-full max-w-[280px] rounded-2xl bg-white/95 p-4 shadow-[0_12px_40px_rgba(41,45,50,0.2)]">
        <p className="mb-2 text-sm font-semibold">Move the model</p>
        <ul className="space-y-2.5">
          {rows.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#f4f1ff] text-primary" aria-hidden="true">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Touch anywhere to start.</p>
      </div>
    </div>
  );
}
