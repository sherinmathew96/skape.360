/**
 * Browser-only: lighting environments drawn in code, so nothing is fetched.
 * Each is an HDR equirectangular image (2:1, Radiance .hdr) the 3D viewer
 * uses for light and reflections: a sky above the horizon, ground below and a
 * sun many times brighter than white. The sun is what gives a model real
 * light and shade: faces turned to it are lit, the others get the sky only.
 */

import type { Lighting } from "@/db/schema";

type Sky = {
  zenith: string;
  horizon: string;
  groundNear: string;
  groundFar: string;
  /** Sky and ground brightness (1 = the colours as they are) */
  scale: number;
  /**
   * Sun direction: azimuth 0–1 around, elevation 0–1 from horizon to top.
   * Its disc is soft (radius in degrees) and a wider halo warms the sky round it.
   */
  sun?: { azimuth: number; elevation: number; color: string; radius: number; power: number; halo: number; haloPower: number };
  /** A broad, soft glow opposite the sun (light bouncing back), so faces in shade aren't murky. */
  fill?: { azimuth: number; elevation: number; spread: number; power: number };
};

const SKIES: Record<Exclude<Lighting, "studio">, Sky> = {
  // A soft, slightly warm sky: a saturated blue one tints roofs and paving blue.
  daylight: {
    zenith: "#9db8da",
    horizon: "#f5f1e8",
    groundFar: "#c4bba8",
    groundNear: "#8f8775",
    // Overall about as bright as the old flat sky at exposure 1, so saved
    // exposures still look right; the sun now carries most of the light.
    scale: 0.43,
    // Front left, about 40° up: front faces lit, right-hand faces in soft shade.
    sun: { azimuth: 0.8, elevation: 0.45, color: "#fff2da", radius: 6, power: 78, halo: 22, haloPower: 0.5 },
    fill: { azimuth: 0.3, elevation: 0.25, spread: 45, power: 1.2 },
  },
  overcast: {
    zenith: "#c9ced4",
    horizon: "#e6e7e6",
    groundFar: "#8f8d86",
    groundNear: "#6a6862",
    scale: 1,
  },
  evening: {
    zenith: "#26365f",
    horizon: "#f3a35a",
    groundFar: "#5b4a3e",
    groundNear: "#2f2924",
    scale: 0.8,
    sun: { azimuth: 0.82, elevation: 0.06, color: "#ffd59a", radius: 4, power: 30, halo: 18, haloPower: 1 },
  },
};

/** A hex colour as linear light. */
function linear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** Radiance .hdr (RGBE, flat scanlines) from linear RGB floats. */
function encodeHdr(w: number, h: number, rgb: Float32Array): Uint8Array {
  const head = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`);
  const out = new Uint8Array(head.length + w * h * 4);
  out.set(head);
  for (let i = 0, o = head.length; i < w * h; i++, o += 4) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const m = Math.max(r, g, b);
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m) + 1e-9);
    const f = 256 / 2 ** e;
    out[o] = Math.min(255, Math.floor(r * f));
    out[o + 1] = Math.min(255, Math.floor(g * f));
    out[o + 2] = Math.min(255, Math.floor(b * f));
    out[o + 3] = e + 128;
  }
  return out;
}

const cache = new Map<string, string>();

export async function skyUrl(lighting: Exclude<Lighting, "studio">): Promise<string> {
  const hit = cache.get(lighting);
  if (hit) return hit;
  const sky = SKIES[lighting];
  const w = 512;
  const h = 256;
  const zenith = linear(sky.zenith);
  const horizon = linear(sky.horizon);
  const groundFar = linear(sky.groundFar);
  const groundNear = linear(sky.groundNear);
  const sun = sky.sun && {
    ...sky.sun,
    rgb: linear(sky.sun.color),
    lon: sky.sun.azimuth * 2 * Math.PI,
    lat: (sky.sun.elevation * Math.PI) / 2,
    r: (sky.sun.radius * Math.PI) / 180,
    halo: (sky.sun.halo * Math.PI) / 180,
  };
  const fill = sky.fill && {
    lon: sky.fill.azimuth * 2 * Math.PI,
    lat: (sky.fill.elevation * Math.PI) / 2,
    spread: (sky.fill.spread * Math.PI) / 180,
    power: sky.fill.power,
  };
  // How far (radians) a pixel at lat/lon is from a point on the sphere.
  const away = (lat: number, lon: number, p: { lat: number; lon: number }) =>
    Math.acos(Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(p.lat) + Math.cos(lat) * Math.cos(p.lat) * Math.cos(lon - p.lon))));
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    // lat: +90° at the top row, −90° at the bottom.
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const t = Math.abs(lat) / (Math.PI / 2);
    const base =
      lat >= 0 ? mix(horizon, zenith, Math.min(1, t / 0.75) ** 0.8) : mix(groundFar, groundNear, Math.min(1, t * 1.6));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const lon = ((x + 0.5) / w) * 2 * Math.PI;
      let [r, g, b] = base.map((v) => v * sky.scale);
      if (fill) {
        const k = fill.power * Math.exp(-((away(lat, lon, fill) / fill.spread) ** 2));
        r += base[0] * k;
        g += base[1] * k;
        b += base[2] * k;
      }
      if (sun && lat > -0.05) {
        const a = away(lat, lon, sun);
        const k = sun.power * Math.exp(-((a / sun.r) ** 2)) + sun.haloPower * Math.exp(-((a / sun.halo) ** 2));
        r += sun.rgb[0] * k;
        g += sun.rgb[1] * k;
        b += sun.rgb[2] * k;
      }
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }
  const blob = new Blob([encodeHdr(w, h, rgb) as BlobPart], { type: "image/vnd.radiance" });
  // The viewer picks its HDR loader by the address ending in ".hdr"; a blob
  // address ignores everything after the #. A browser that can't read it that
  // way gets the viewer's own neutral light instead of a broken one.
  const url = URL.createObjectURL(blob) + "#.hdr";
  const ok = await fetch(url)
    .then(async (r) => r.ok && (await r.blob()).size === blob.size)
    .catch(() => false);
  const use = ok ? url : "neutral";
  cache.set(lighting, use);
  return use;
}
