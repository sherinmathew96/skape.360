import type { FileKind } from "./file-kinds";

/** Longest side in pixels and JPEG quality for each kind of image upload. */
const PRESETS: Partial<Record<FileKind, { maxSide: number; quality: number }>> = {
  photo: { maxSide: 2400, quality: 0.85 },
  receipt: { maxSide: 2400, quality: 0.85 },
  render: { maxSide: 3840, quality: 0.9 },
  panorama: { maxSide: 8192, quality: 0.88 },
  drawing: { maxSide: 6000, quality: 0.92 },
  cover: { maxSide: 1600, quality: 0.88 },
};

/**
 * Browser-only: compresses an image before it is uploaded, keeping it sharp
 * for its use (4K for renders, 8K for 360° photos, 2400 px for site photos).
 * Transparent areas become white. The original is kept when it is not an
 * image the browser can read, or when compressing would not make it smaller.
 */
export async function compressImage(file: File, kind: FileKind): Promise<File> {
  const preset = PRESETS[kind];
  if (!preset || !file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, preset.maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  // Already a lean JPEG at the right size: leave it alone.
  if (scale === 1 && file.type === "image/jpeg" && file.size <= width * height * 0.25) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", preset.quality));
  canvas.width = canvas.height = 0;
  // Too large for this device's canvas, or no saving: send the original.
  if (!blob || blob.size === 0 || (scale === 1 && blob.size >= file.size * 0.95)) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
}
