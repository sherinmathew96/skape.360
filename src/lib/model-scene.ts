/**
 * Browser-only: layers, explode, a plan cut and a vertical section for a model
 * shown in <model-viewer>. The viewer has no public API for these, so this
 * reaches its three.js scene through the element's own "scene" and "renderer"
 * fields (the viewer is pinned to 4.4.0 for that reason). If they are not
 * found the tools simply don't appear.
 *
 * Everything is measured in the world: the plan cut is metres above the
 * model's base, the section runs across the model's front (or its side), and
 * layers lift straight up whatever the model's own axes.
 */
import { Box3, DoubleSide, Plane, Vector3, type Material, type Mesh, type Object3D } from "three";

/** Names exporters give on their own (Group#12, 3DGeom-1…): not layers. Matches optimize-model.ts. */
const GENERIC_NAME = /^(group|component|componentinstance|instance|3dgeom|geom|geometry|mesh|node|object|assembly|default|scene|root|sketchup|model)?[\s#_.-]*\d*$/i;

/**
 * A vertical cut. "front": a plane parallel to the front face, at: 0 at the
 * front to 1 at the back; "side": parallel to the side, at: 0 at the left to
 * 1 at the right. flip: keep the other half.
 */
export type Section = { dir: "front" | "side"; at: number; flip: boolean };

export type SceneTools = {
  /** Layer names, bottom to top. Empty when the model has none. */
  layers: string[];
  /** Model height in metres. */
  height: number;
  /** Depth (front to back) and width (side to side) in metres, for a given front direction. */
  extent(dir: Section["dir"], frontYaw: number): number;
  setHidden(names: string[]): void;
  /** 0 = assembled, 1 = fully apart. */
  setExplode(amount: number): void;
  /** Plan cut height in metres above the base, or null for no cut. */
  setCut(height: number | null): void;
  /** Vertical section, or null for none. frontYaw: the model's front, in degrees. */
  setSection(section: Section | null, frontYaw: number): void;
  /** Keeps the cuts in place after the camera target moves. */
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

/**
 * The horizontal direction a section is measured along. The viewer's camera
 * sits on +Z at turn 0, so the model's front faces (sin f, 0, cos f) for a
 * front turned f degrees, and its right side (cos f, 0, -sin f).
 */
function axis(dir: Section["dir"], frontYaw: number) {
  const f = (frontYaw * Math.PI) / 180;
  return dir === "front" ? new Vector3(Math.sin(f), 0, Math.cos(f)) : new Vector3(Math.cos(f), 0, -Math.sin(f));
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
  const start = root.getWorldPosition(new Vector3());
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
  );
  /** Where the model starts and ends along a direction, in the world as it was first shown. */
  const span = (n: Vector3) => {
    const d = corners.map((c) => c.dot(n));
    return { min: Math.min(...d), max: Math.max(...d) };
  };

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

  // Each plane keeps what lies on its positive side.
  const planPlane = new Plane(new Vector3(0, -1, 0), 0);
  const sectionPlane = new Plane(new Vector3(0, 0, -1), 0);
  let cut: number | null = null;
  let section: (Section & { yaw: number }) | null = null;
  let explode = 0;
  let active: Plane[] = [];

  const placePlanes = () => {
    // The viewer slides the model when the camera target moves: follow it.
    const moved = root.getWorldPosition(new Vector3()).sub(start);
    if (cut !== null) planPlane.constant = baseY + moved.y + cut;
    if (section) {
      const n = axis(section.dir, section.yaw);
      const { min, max } = span(n);
      // at is measured from the front (for a front section) or from the left (for a side one).
      const at = (section.dir === "front" ? max - (max - min) * section.at : min + (max - min) * section.at) + moved.dot(n);
      // Not flipped: keep the back (or left) part, so it is seen cut from the front (or right).
      if (section.flip) sectionPlane.normal.copy(n);
      else sectionPlane.normal.copy(n).negate();
      sectionPlane.constant = section.flip ? -at : at;
    }
  };

  // Cut surfaces: the inside of walls shows as solid grey, like poché on a drawing.
  const applyCuts = () => {
    const next = [...(cut !== null ? [planPlane] : []), ...(section ? [sectionPlane] : [])];
    if (next.length === active.length && next.every((p, i) => p === active[i])) return;
    active = next;
    const on = next.length > 0;
    for (const m of materials) {
      m.clippingPlanes = on ? next : null;
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
      m.customProgramCacheKey = () => (on ? `skape-cut-${next.length}` : "");
      m.needsUpdate = true;
    }
  };

  const placeLayers = () => {
    const step = (height * 0.45) / Math.max(1, layerNodes.length - 1);
    const up = new Vector3();
    const cutting = cut !== null || section !== null;
    layerNodes.forEach((l, i) => {
      l.node.position.copy(l.start);
      const lift = cutting ? 0 : i * step * explode;
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

  const refresh = () => {
    applyCuts();
    placeLayers();
    placePlanes();
    scene.queueRender();
  };

  return {
    layers,
    height,
    extent(dir, frontYaw) {
      const { min, max } = span(axis(dir, frontYaw));
      return Math.max(0.01, max - min);
    },
    setHidden(names) {
      const hidden = new Set(names);
      for (const l of layerNodes) l.node.visible = !hidden.has(l.name);
      scene.queueRender();
    },
    setExplode(amount) {
      explode = Math.min(1, Math.max(0, amount));
      refresh();
    },
    setCut(h) {
      cut = h === null ? null : Math.min(height, Math.max(0, h));
      refresh();
    },
    setSection(s, frontYaw) {
      section = s ? { ...s, at: Math.min(1, Math.max(0, s.at)), yaw: frontYaw } : null;
      refresh();
    },
    update() {
      placePlanes();
      scene.queueRender();
    },
  };
}
