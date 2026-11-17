/**
 * Browser-only: layers, explode and a plan cut for a model shown in
 * <model-viewer>. The viewer has no public API for these, so this reaches its
 * three.js scene through the element's own "scene" and "renderer" fields (the
 * viewer is pinned to 4.4.0 for that reason). If they are not found the tools
 * simply don't appear.
 *
 * Everything is measured in the world: the cut height is metres above the
 * model's base, and layers lift straight up whatever the model's own axes.
 */
import { Box3, DoubleSide, Plane, Vector3, type Material, type Mesh, type Object3D } from "three";

/** Names exporters give on their own (Group#12, 3DGeom-1…): not layers. Matches optimize-model.ts. */
const GENERIC_NAME = /^(group|component|componentinstance|instance|3dgeom|geom|geometry|mesh|node|object|assembly|default|scene|root|sketchup|model)?[\s#_.-]*\d*$/i;

export type SceneTools = {
  /** Layer names, bottom to top. Empty when the model has none. */
  layers: string[];
  /** Model height in metres. */
  height: number;
  setHidden(names: string[]): void;
  /** 0 = assembled, 1 = fully apart. */
  setExplode(amount: number): void;
  /** Cut height in metres above the base, or null for no cut. */
  setCut(height: number | null): void;
  /** Keeps the cut in place after the camera target moves. */
  update(): void;
};

type ModelScene = Object3D & { target: Object3D; queueRender(): void };
type Renderer = { threeRenderer?: { localClippingEnabled: boolean } };

/** One of the viewer's private fields, by its symbol's name (on the element or its classes). */
const field = <T,>(el: object, name: string): T | undefined => {
  for (let o: object | null = el; o; o = Object.getPrototypeOf(o)) {
    const sym = Object.getOwnPropertySymbols(o).find((s) => s.description === name);
    if (sym) return (el as Record<symbol, unknown>)[sym] as T;
  }
  return undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasMesh = (o: Object3D): boolean => (o as Mesh).isMesh === true || o.children.some(hasMesh);

/** "Ground_Floor_Walls" (the loader's spelling) → "Ground Floor Walls". */
const display = (name: string) => name.replace(/_/g, " ").trim();

function findLayers(root: Object3D): Object3D[] {
  let level = root.children;
  for (let depth = 0; depth < 10; depth++) {
    const parts = level.filter(hasMesh);
    if (parts.length === 1) {
      if ((parts[0] as Mesh).isMesh) return [];
      level = parts[0].children;
      continue;
    }
    // Unnamed parts get an id from the viewer (a UUID): not layers either.
    const named = parts.filter((p) => p.name && !GENERIC_NAME.test(display(p.name)) && !UUID.test(p.name));
    return named.length >= 2 ? named : [];
  }
  return [];
}

export function attachSceneTools(el: HTMLElement): SceneTools | null {
  const scene = field<ModelScene>(el, "scene");
  const renderer = field<Renderer>(el, "renderer")?.threeRenderer;
  const root = scene?.target?.children.find(hasMesh);
  if (!scene || !renderer || !root || typeof scene.queueRender !== "function") return null;
  renderer.localClippingEnabled = true;

  root.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(root);
  const baseY = box.min.y;
  const height = Math.max(0.01, box.max.y - box.min.y);
  const rootY0 = root.getWorldPosition(new Vector3()).y;

  // Layers bottom to top, with where each one started.
  const layerNodes = findLayers(root)
    .map((node) => ({ node, name: display(node.name), bottom: new Box3().setFromObject(node).min.y, start: node.position.clone() }))
    .sort((a, b) => a.bottom - b.bottom);
  const layers = [...new Set(layerNodes.map((l) => l.name))];

  // This model's own copies of its materials, so a cut never shows on another
  // viewer of the same file (a thumbnail, say).
  const materials: Material[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const own = (m: Material) => {
      const c = m.clone();
      c.userData.side = c.side;
      materials.push(c);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
  });

  const plane = new Plane(new Vector3(0, -1, 0), 0);
  let cut: number | null = null;
  let explode = 0;

  const placePlane = () => {
    if (cut === null) return;
    // The viewer slides the model when the camera target moves: follow it.
    const dy = root.getWorldPosition(new Vector3()).y - rootY0;
    plane.constant = baseY + dy + cut;
  };

  // Cut surfaces: the inside of walls shows as solid grey, like poché on a plan.
  const solidCut = (on: boolean) => {
    for (const m of materials) {
      m.clippingPlanes = on ? [plane] : null;
      m.clipShadows = on;
      m.side = on ? DoubleSide : (m.userData.side as Material["side"]);
      m.onBeforeCompile = on
        ? (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <dithering_fragment>",
              // The inside of a cut wall often lies exactly on the slab it stands on;
              // nudged towards the camera it always wins, instead of flickering in stripes.
              "#include <dithering_fragment>\n  gl_FragDepth = gl_FrontFacing ? gl_FragCoord.z : gl_FragCoord.z - 0.000002;\n  if (!gl_FrontFacing) gl_FragColor = vec4(vec3(0.24), 1.0);",
            );
          }
        : () => {};
      m.customProgramCacheKey = () => (on ? "skape-cut" : "");
      m.needsUpdate = true;
    }
  };

  const placeLayers = () => {
    const step = (height * 0.45) / Math.max(1, layerNodes.length - 1);
    const up = new Vector3();
    layerNodes.forEach((l, i) => {
      l.node.position.copy(l.start);
      const lift = cut === null ? i * step * explode : 0;
      if (!lift || !l.node.parent) return;
      // Straight up in the world, whatever the parent's axes are.
      const parent = l.node.parent;
      parent.updateWorldMatrix(true, false);
      const at = parent.getWorldPosition(new Vector3());
      const from = parent.worldToLocal(at.clone());
      const to = parent.worldToLocal(at.clone().add(up.set(0, lift, 0)));
      l.node.position.add(to.sub(from));
    });
  };

  return {
    layers,
    height,
    setHidden(names) {
      const hidden = new Set(names);
      for (const l of layerNodes) l.node.visible = !hidden.has(l.name);
      scene.queueRender();
    },
    setExplode(amount) {
      explode = Math.min(1, Math.max(0, amount));
      placeLayers();
      scene.queueRender();
    },
    setCut(h) {
      const was = cut !== null;
      cut = h === null ? null : Math.min(height, Math.max(0, h));
      if (was !== (cut !== null)) solidCut(cut !== null);
      placeLayers();
      placePlane();
      scene.queueRender();
    },
    update() {
      placePlane();
      scene.queueRender();
    },
  };
}
