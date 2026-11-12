/** What each kind of upload accepts. Shared by the browser and the server. */
export const FILE_KINDS = {
  model: {
    label: "3D model",
    accept: ".glb,model/gltf-binary",
    extensions: [".glb"],
    contentTypes: ["model/gltf-binary", "application/octet-stream", ""],
    storedType: "model/gltf-binary",
    maxBytes: 300 * 1024 * 1024,
    help: "A .glb file, up to 300 MB. Export from SketchUp, Revit, Rhino or Blender as glTF binary.",
  },
  panorama: {
    label: "360° photo",
    accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    storedType: null,
    maxBytes: 60 * 1024 * 1024,
    help: "Equirectangular JPG, PNG or WebP (twice as wide as tall), up to 60 MB each.",
  },
  drawing: {
    label: "drawing",
    accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
    extensions: [".pdf", ".jpg", ".jpeg", ".png"],
    contentTypes: ["application/pdf", "image/jpeg", "image/png"],
    storedType: null,
    maxBytes: 80 * 1024 * 1024,
    help: "A PDF (best) or a JPG/PNG of the sheet, up to 80 MB.",
  },
  photo: {
    label: "photo",
    accept: "image/*",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    storedType: null,
    maxBytes: 25 * 1024 * 1024,
    help: "Take a photo or choose from the gallery. Photos are reduced to about 2000 px before uploading.",
  },
  receipt: {
    label: "receipt or bill",
    accept: "image/*,.pdf,application/pdf",
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".pdf"],
    contentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    storedType: null,
    maxBytes: 25 * 1024 * 1024,
    help: "A photo or PDF of the receipt or bill.",
  },
} as const;

export type FileKind = keyof typeof FILE_KINDS;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
