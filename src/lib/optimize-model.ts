/**
 * Browser-only: makes a .glb fast to open before it is uploaded.
 *
 * Tested on a 20 MB SketchUp export (3,356 meshes, 958k triangles) it gave
 * about 3 MB and 126 draw calls, with no change to the geometry:
 *
 * - turns old specular-glossiness materials (SketchUp, older exporters) into
 *   matte building materials: those exporters mark everything as half-mirror,
 *   which washes textures out under real lighting;
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
  /** Named groups kept as layers (Plinth, Walls, Roof…); empty when none */
  layers: string[];
  /** Doors, drawers and sliding parts kept so the viewer can open them. */
  movable: number;
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

type GNode = import("@gltf-transform/core").Node;
type Mat4 = Parameters<GNode["setMatrix"]>[0];

/** a × b for column-major 4×4 matrices (glTF's layout). */
function multiply(a: readonly number[], b: readonly number[]): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out as unknown as Mat4;
}

/** The inverse of a column-major 4×4 matrix (identity if it can't be inverted). */
function invert(m: readonly number[]): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as unknown as Mat4;
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ] as unknown as Mat4;
}

/** Names exporters give on their own (Group#12, 3DGeom-1, Component 4…): not layers. */
const GENERIC_NAME = /^(group|component|componentinstance|instance|3dgeom|geom|geometry|mesh|node|object|assembly|default|scene|root|sketchup|model)?[\s#_.-]*\d*$/i;

/** A part's layer name, or null for an unnamed or exporter-named part. */
export function layerName(node: GNode): string | null {
  const name = node.getName().trim();
  return name && !GENERIC_NAME.test(name) ? name : null;
}

/** Doors, drawers, sliding shutters and bi-folds: parts the viewer opens. Matches model-scene.ts. */
const MOVABLE = /^(door|drawer|slide|fold)(?![a-z])/i;
export const isMovable = (node: GNode) => MOVABLE.test(node.getName().trim());

/** The outermost movable parts below a node (a drawer inside a door moves with the door). */
function movablesIn(nodes: GNode[]): GNode[] {
  const found: GNode[] = [];
  const walk = (n: GNode) => (isMovable(n) ? found.push(n) : n.listChildren().forEach(walk));
  nodes.forEach(walk);
  return found;
}

/** Moves a node under a new parent (or to the scene's top level) without moving it in the world. */
function reparent(node: GNode, parent: GNode | import("@gltf-transform/core").Scene) {
  const world = node.getWorldMatrix();
  const local = "getWorldMatrix" in parent ? multiply(invert(parent.getWorldMatrix()), world) : (world as unknown as Mat4);
  node.getParentNode()?.removeChild(node);
  for (const s of node.listParents()) if (s.propertyType === "Scene") (s as import("@gltf-transform/core").Scene).removeChild(node);
  node.setMatrix(local);
  parent.addChild(node);
}

/**
 * Puts every mesh below a part (outside the movable parts inside it) directly
 * under it, keeping where it sits in the world, so the part merges within
 * itself but never with anything else. A part's own mesh moves to a child,
 * so the part itself is never merged away.
 */
function gather(unit: GNode, doc: GltfDocument) {
  const own = unit.getMesh();
  if (own) {
    unit.setMesh(null);
    unit.addChild(doc.createNode("").setMesh(own));
  }
  const meshes: GNode[] = [];
  const walk = (n: GNode) =>
    n.listChildren().forEach((c) => {
      if (isMovable(c)) return;
      if (c.getMesh() && c.getParentNode() !== unit) meshes.push(c);
      walk(c);
    });
  walk(unit);
  for (const node of meshes) {
    reparent(node, unit);
    node.setName("");
  }
}

/**
 * A bi-fold: each panel (a group inside it) is kept whole and separate, so the
 * viewer can fold them against each other. Loose geometry in the bi-fold
 * group itself (a track, say) becomes a fixed "Fold frame".
 */
function gatherFold(unit: GNode, doc: GltfDocument) {
  let leaves = unit.listChildren().filter(hasMesh);
  while (leaves.length === 1 && !leaves[0].getMesh()) leaves = leaves[0].listChildren().filter(hasMesh);
  if (leaves.length < 2) return gather(unit, doc);
  const own = unit.getMesh();
  if (own) {
    unit.setMesh(null);
    unit.addChild(doc.createNode("Fold frame").setMesh(own));
  }
  leaves.forEach((leaf, i) => {
    if (leaf.getParentNode() !== unit) reparent(leaf, unit);
    if (!leaf.getName().trim() || isMovable(leaf)) leaf.setName(`Panel ${i + 1}`);
    gather(leaf, doc);
  });
}

/** Keeps a movable part together the way the viewer moves it. */
const gatherPart = (part: GNode, doc: GltfDocument) => (/^fold(?![a-z])/i.test(part.getName().trim()) ? gatherFold(part, doc) : gather(part, doc));

const hasMesh = (node: GNode): boolean => Boolean(node.getMesh()) || node.listChildren().some(hasMesh);

/**
 * The model's layers: the first level below any wrapper nodes where two or
 * more parts carry real names (Plinth, Walls, Roof). Null when there are none.
 */
export function findLayers(doc: GltfDocument): GNode[] | null {
  let level = doc.getRoot().listScenes()[0]?.listChildren() ?? [];
  for (let depth = 0; depth < 8; depth++) {
    const parts = level.filter(hasMesh);
    if (parts.length === 1) {
      if (parts[0].getMesh()) return null;
      level = parts[0].listChildren();
      continue;
    }
    const named = parts.filter((p) => layerName(p) && !isMovable(p));
    return named.length >= 2 && named.length <= 40 ? parts : null;
  }
  return null;
}

/**
 * Puts every mesh of a layer directly under the layer node, keeping where it
 * sits in the world, so the layer can be merged within itself but never with
 * another layer. Unnamed parts stay in the model but are not layers.
 */
export function keepLayers(layers: GNode[], doc: GltfDocument): number {
  let movable = 0;
  for (const layer of layers) {
    if (isMovable(layer)) {
      gatherPart(layer, doc);
      movable++;
      continue;
    }
    if (!layerName(layer)) layer.setName("");
    for (const part of movablesIn(layer.listChildren())) {
      reparent(part, layer);
      gatherPart(part, doc);
      movable++;
    }
    gather(layer, doc);
  }
  return movable;
}

/**
 * Like flatten(), but each door, drawer and sliding part comes up whole, with
 * its own axes (the hinge and the way it opens), and its meshes under it.
 */
function flattenKeepingMovables(doc: GltfDocument): number {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) return 0;
  const parts = movablesIn(scene.listChildren());
  const loose: GNode[] = [];
  const walk = (n: GNode) =>
    n.listChildren().forEach((c) => {
      if (isMovable(c)) return;
      if (c.getMesh()) loose.push(c);
      walk(c);
    });
  scene.listChildren().forEach((n) => {
    if (isMovable(n)) return;
    if (n.getMesh()) loose.push(n);
    walk(n);
  });
  for (const part of parts) {
    reparent(part, scene);
    gatherPart(part, doc);
  }
  for (const node of loose) reparent(node, scene);
  return parts.length;
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
  const layers = findLayers(doc);
  let movable = 0;
  if (layers) {
    // Named groups (Plinth, Walls, Roof…) stay separate so the viewer can show,
    // hide and lift them; each one is merged within itself.
    await doc.transform(fn.dedup());
    movable = keepLayers(layers, doc);
    await doc.transform(fn.join({ keepNamed: true }), fn.weld(), fn.prune());
  } else if (movablesIn(doc.getRoot().listScenes()[0]?.listChildren() ?? []).length) {
    await doc.transform(fn.dedup());
    movable = flattenKeepingMovables(doc);
    await doc.transform(fn.prune({ propertyTypes: ["Node"], keepLeaves: false }), fn.join({ keepNamed: false }), fn.weld(), fn.prune());
  } else {
    await doc.transform(
      fn.dedup(),
      // No GPU instancing: the viewer measures instanced parts at the wrong size,
      // which drops the floor shadow below the model (it looks like it floats).
      fn.flatten(),
      fn.join({ keepNamed: false }),
      fn.weld(),
      fn.prune(),
    );
  }

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
      layers: [...new Set((layers ?? []).filter((l) => !isMovable(l)).map((l) => layerName(l)).filter((n): n is string => Boolean(n)))],
      movable,
    },
  };
}
