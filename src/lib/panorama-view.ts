/**
 * Browser-only helpers for showing 360° photos at their best in Photo Sphere
 * Viewer: the sharpest copy the device can hold, drawn with smooth filtering.
 */

type Viewer = import("@photo-sphere-viewer/core").Viewer;

/**
 * How wide a 360° photo this device can open: 4096 px on phones and tablets
 * (more runs them out of memory), up to 8192 on computers, and never wider
 * than the graphics chip can draw. The server makes and keeps that copy.
 */
export function panoramaWidth(): 2048 | 4096 | 8192 {
  let maxTexture = 4096;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (gl) maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  } catch {
    // Keep the safe default.
  }
  const touch = window.matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 768;
  const wanted = Math.min(touch ? 4096 : 8192, maxTexture);
  return wanted >= 8192 ? 8192 : wanted >= 4096 ? 4096 : 2048;
}

/** three.js LinearMipmapLinearFilter. */
const TRILINEAR = 1008;

/**
 * Draws every photo the viewer loads with mipmaps and anisotropic filtering.
 * Without them a large photo shrunk to the screen is sampled pixel by pixel:
 * fine lines, text and edges come out jagged and grainy, and shimmer as you
 * turn. With them it looks like the original, and the full detail still shows
 * when you zoom in.
 */
export function smoothPanoramas(viewer: Viewer) {
  viewer.addEventListener("panorama-loaded", ({ data }) => {
    const texture = data.texture as { minFilter?: number; generateMipmaps?: boolean; anisotropy?: number; needsUpdate?: boolean } | null;
    if (!texture || typeof texture.minFilter !== "number") return;
    texture.minFilter = TRILINEAR;
    texture.generateMipmaps = true;
    // three.js lowers this to what the graphics chip allows.
    texture.anisotropy = 16;
    texture.needsUpdate = true;
    viewer.needsUpdate();
  });
}
