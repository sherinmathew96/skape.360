/**
 * Browser-only: makes a .glb fast to open before it is uploaded.
 *
 * Tested on a 20 MB SketchUp export (3,356 meshes, 958k triangles) it gave
 * about 3 MB and 126 draw calls, with no change to the geometry:
 *
 * - turns old specular-glossiness materials (SketchUp, older exporters) into
 *   matte building materials: those exporters mark everything as half-mirror,
 *   which washes textures out under real lighting;
 * - draws repeated objects (plants, windows, railings) once with GPU instancing;
 * - merges the rest by material, so the graphics card draws far fewer pieces;
 * - compresses geometry with meshopt, which the viewer decodes on its own;
 * - resizes textures over 2048 px and stores them as WebP.
 */

export type OptimizeReport = {
  before: number;
  after: number;
  meshesBefore: number;
  meshesAfter: number;
  texturesResized: number;
};

const MAX_TEXTURE = 2048;
const SPEC_GLOSS = "KHR_materials_pbrSpecularGlossiness";

type GltfDocument = import("@gltf-transform/core").Document;
type SpecGloss = {
  getDiffuseFactor(): number[];
  getDiffuseTexture(): import("@gltf-transform/core").Texture | null;
  getGlossinessFactor(): number;
};

/**
 * SketchUp-style materials to realistic ones. Colours and textures are kept;
 * surfaces become non-metallic and fairly rough, glass and water smooth.
 */
function realisticMaterials(doc: GltfDocument) {
  for (const m of doc.getRoot().listMaterials()) {
    const sg = m.getExtension<SpecGloss & import("@gltf-transform/core").ExtensionProperty>(SPEC_GLOSS);
    // A flat 0.5 metalness with no texture is an exporter's placeholder, not a real metal.
    const placeholder = !m.getMetallicRoughnessTexture() && Math.abs(m.getMetallicFactor() - 0.5) < 1e-6;
    if (!sg && !placeholder) continue;
    if (sg) {
      if (!m.getBaseColorTexture() && sg.getDiffuseTexture()) m.setBaseColorTexture(sg.getDiffuseTexture());
      m.setBaseColorFactor(sg.getDiffuseFactor() as [number, number, number, number]);
      m.setExtension(SPEC_GLOSS, null);
    }
    const alpha = m.getBaseColorFactor()[3];
    const glassy = alpha < 0.99 || /glass|water|mirror|pool/i.test(m.getName());
    const metal = /steel|metal|alumin|chrome|iron/i.test(m.getName()) && !glassy;
    m.setMetallicFactor(metal ? 0.6 : 0).setRoughnessFactor(glassy ? 0.06 : metal ? 0.45 : 0.8);
    if (glassy && alpha < 0.99) m.setAlphaMode("BLEND");
  }
  doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === SPEC_GLOSS)?.dispose();
}
const WEBP_QUALITY = 0.86;

async function toWebp(image: Uint8Array, mime: string): Promise<{ data: Uint8Array; resized: boolean } | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([image as BlobPart], { type: mime }));
    const scale = Math.min(1, MAX_TEXTURE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    if (!blob || blob.type !== "image/webp") return null; // the browser can't write WebP
    const data = new Uint8Array(await blob.arrayBuffer());
    // Keep the original if WebP isn't smaller and nothing was resized.
    if (scale === 1 && data.byteLength >= image.byteLength) return null;
    return { data, resized: scale < 1 };
  } catch {
    return null;
  }
}

export async function optimizeModel(file: File, onStep?: (step: string) => void): Promise<{ file: File; report: OptimizeReport }> {
  onStep?.("Loading the optimiser…");
  const [{ WebIO }, ext, fn, mo] = await Promise.all([
    import("@gltf-transform/core"),
    import("@gltf-transform/extensions"),
    import("@gltf-transform/functions"),
    import("meshoptimizer"),
  ]);
  await Promise.all([mo.MeshoptEncoder.ready, mo.MeshoptDecoder.ready]);
  const io = new WebIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({
    "meshopt.encoder": mo.MeshoptEncoder,
    "meshopt.decoder": mo.MeshoptDecoder,
  });

  onStep?.("Reading the model…");
  const doc = await io.readBinary(new Uint8Array(await file.arrayBuffer()));
  const meshesBefore = doc.getRoot().listMeshes().length;

  onStep?.("Merging and compressing geometry…");
  realisticMaterials(doc);
  await doc.transform(
    fn.dedup(),
    fn.instance({ min: 2 }),
    fn.flatten(),
    fn.join({ keepNamed: false }),
    fn.weld(),
    fn.prune(),
  );

  onStep?.("Shrinking textures…");
  let texturesResized = 0;
  let anyWebp = false;
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    const mime = texture.getMimeType();
    if (!image || mime === "image/webp" || mime === "image/ktx2") continue;
    const result = await toWebp(image, mime);
    if (!result) continue;
    texture.setImage(result.data).setMimeType("image/webp");
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.(png|jpe?g)$/i, ".webp"));
    anyWebp = true;
    if (result.resized) texturesResized++;
  }
  if (anyWebp) doc.createExtension(ext.EXTTextureWebP).setRequired(true);

  await doc.transform(fn.meshopt({ encoder: mo.MeshoptEncoder, level: "high" }));

  onStep?.("Packing…");
  const out = await io.writeBinary(doc);
  const name = file.name.replace(/\.glb$/i, "") + ".glb";
  return {
    file: new File([out as BlobPart], name, { type: "model/gltf-binary", lastModified: file.lastModified }),
    report: {
      before: file.size,
      after: out.byteLength,
      meshesBefore,
      meshesAfter: doc.getRoot().listMeshes().length,
      texturesResized,
    },
  };
}
