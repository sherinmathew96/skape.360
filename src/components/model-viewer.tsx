"use client";

import { useEffect, useRef, useState } from "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean | "";
        "touch-action"?: string;
        "shadow-intensity"?: string;
        exposure?: string;
        "environment-image"?: string;
        ar?: boolean | "";
        "ar-modes"?: string;
        "interaction-prompt"?: string;
      };
    }
  }
}

/**
 * Orbit, zoom and pan around a .glb model. On phones that support it, the
 * AR button places the model in the room.
 */
export function ModelViewer({ src, title, className = "" }: { src: string; title: string; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const onProgress = (e: Event) => setProgress((e as CustomEvent<{ totalProgress: number }>).detail.totalProgress);
    const onError = () => setFailed(true);
    el.addEventListener("progress", onProgress);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("error", onError);
    };
  }, [ready]);

  return (
    <div className={`relative overflow-hidden bg-[#eceae6] ${className}`}>
      {ready ? (
        <model-viewer
          ref={ref}
          src={src}
          alt={title}
          camera-controls=""
          touch-action="pan-y"
          shadow-intensity="1"
          exposure="1"
          environment-image="neutral"
          ar=""
          ar-modes="webxr scene-viewer quick-look"
          interaction-prompt="none"
          style={{ width: "100%", height: "100%", background: "transparent" }}
        >
          {/* Hides the built-in loading strip; ours sits at the bottom. */}
          <div slot="progress-bar" />
        </model-viewer>
      ) : null}
      {failed ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
          This model could not be loaded.
        </p>
      ) : progress < 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/5" role="progressbar" aria-label="Loading model" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-stage transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}
