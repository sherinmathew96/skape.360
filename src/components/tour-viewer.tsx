"use client";

import { useEffect, useRef, useState } from "react";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import type { TourData } from "@/lib/studio";

/**
 * How wide a 360° photo this device can open: 4096 px on phones and tablets
 * (more runs them out of memory), up to 8192 on computers, and never wider
 * than the graphics chip can draw. The server makes and keeps that copy.
 */
function panoramaWidth(): 2048 | 4096 | 8192 {
  let maxTexture = 4096;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  } catch {
    // Keep the safe default.
  }
  const touch = window.matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 768;
  const wanted = Math.min(touch ? 4096 : 8192, maxTexture);
  return wanted >= 8192 ? 8192 : wanted >= 4096 ? 4096 : 2048;
}

/**
 * Walks through a 360° tour: drag to look around, click an arrow to move to
 * the next room. `fileUrl` turns a file id into a URL the viewer may load.
 */
export function TourViewer({
  tour,
  fileBase,
  className = "",
}: {
  tour: TourData;
  /** URL prefix for files, e.g. "/api/files/" or "/s/<token>/f/" */
  fileBase: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = container.current;
    if (!el || tour.scenes.length === 0) return;
    let viewer: import("@photo-sphere-viewer/core").Viewer | null = null;
    let alive = true;

    (async () => {
      const [{ Viewer }, { MarkersPlugin }, { VirtualTourPlugin }] = await Promise.all([
        import("@photo-sphere-viewer/core"),
        import("@photo-sphere-viewer/markers-plugin"),
        import("@photo-sphere-viewer/virtual-tour-plugin"),
      ]);
      if (!alive) return;
      const width = panoramaWidth();
      const nodes = tour.scenes.map((scene) => ({
        id: scene.id,
        panorama: `${fileBase}${scene.fileId}?w=${width}`,
        name: scene.title,
        caption: scene.title,
        links: tour.hotspots
          .filter((h) => h.sceneId === scene.id)
          .map((h) => ({ nodeId: h.targetSceneId, position: { yaw: h.yaw, pitch: h.pitch } })),
      }));
      try {
        viewer = new Viewer({
          container: el,
          navbar: ["zoom", "move", "caption", "fullscreen"],
          defaultZoomLvl: 0,
          touchmoveTwoFingers: false,
          mousewheelCtrlKey: true,
          loadingTxt: "",
          plugins: [
            MarkersPlugin,
            // Each room loads when you walk into it: preloading every photo at once runs phones out of memory.
            [VirtualTourPlugin, { positionMode: "manual", renderMode: "3d", nodes, startNodeId: tour.scenes[0].id, preload: false }],
          ],
        });
        viewer.addEventListener("panorama-error", () => setFailed(true));
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      alive = false;
      viewer?.destroy();
    };
  }, [tour, fileBase]);

  if (tour.scenes.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-raised p-6 text-center text-muted ${className}`}>
        This tour has no 360° photos yet.
      </div>
    );
  }

  return (
    <div className={`relative bg-[#1a1a1a] ${className}`}>
      <div ref={container} className="absolute inset-0" aria-label={`${tour.title}, 360° tour. Drag to look around.`} role="application" />
      {failed ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">
          This 360° photo could not be loaded.
        </p>
      ) : null}
    </div>
  );
}
