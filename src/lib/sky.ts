/**
 * Browser-only: lighting environments drawn in code, so nothing is fetched.
 * Each is an equirectangular image (2:1) the 3D viewer uses for light and
 * reflections: a sky above the horizon, ground below, and a sun.
 */

import type { Lighting } from "@/db/schema";

type Sky = {
  zenith: string;
  horizon: string;
  groundNear: string;
  groundFar: string;
  /** Sun direction: azimuth 0–1 around, elevation 0–1 from horizon to top */
  sun?: { azimuth: number; elevation: number; color: string; size: number; glow: number };
};

const SKIES: Record<Exclude<Lighting, "studio">, Sky> = {
  // A soft, slightly warm sky: a saturated blue one tints roofs and paving blue.
  daylight: {
    zenith: "#9db8da",
    horizon: "#f5f1e8",
    groundFar: "#c4bba8",
    groundNear: "#8f8775",
    sun: { azimuth: 0.18, elevation: 0.6, color: "#fff4dc", size: 0.03, glow: 0.22 },
  },
  overcast: {
    zenith: "#c9ced4",
    horizon: "#e6e7e6",
    groundFar: "#8f8d86",
    groundNear: "#6a6862",
  },
  evening: {
    zenith: "#26365f",
    horizon: "#f3a35a",
    groundFar: "#5b4a3e",
    groundNear: "#2f2924",
    sun: { azimuth: 0.82, elevation: 0.06, color: "#ffd59a", size: 0.025, glow: 0.22 },
  },
};

const cache = new Map<string, string>();

export async function skyUrl(lighting: Exclude<Lighting, "studio">): Promise<string> {
  const hit = cache.get(lighting);
  if (hit) return hit;
  const sky = SKIES[lighting];
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;

  const skyGrad = g.createLinearGradient(0, 0, 0, h / 2);
  skyGrad.addColorStop(0, sky.zenith);
  skyGrad.addColorStop(0.75, sky.horizon);
  skyGrad.addColorStop(1, sky.horizon);
  g.fillStyle = skyGrad;
  g.fillRect(0, 0, w, h / 2);

  const ground = g.createLinearGradient(0, h / 2, 0, h);
  ground.addColorStop(0, sky.groundFar);
  ground.addColorStop(1, sky.groundNear);
  g.fillStyle = ground;
  g.fillRect(0, h / 2, w, h / 2);

  if (sky.sun) {
    const x = sky.sun.azimuth * w;
    const y = (h / 2) * (1 - sky.sun.elevation);
    const glow = g.createRadialGradient(x, y, 0, x, y, sky.sun.glow * w);
    glow.addColorStop(0, sky.sun.color);
    glow.addColorStop(sky.sun.size / sky.sun.glow, sky.sun.color);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
  cache.set(lighting, url);
  return url;
}
