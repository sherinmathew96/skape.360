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
import { Box3, DoubleSide, Matrix4, Plane, Raycaster, Vector3, type BufferGeometry, type Camera, type Material, type Mesh, type Object3D, type Vector2 } from "three";

/** Names exporters give on their own (Group#12, 3DGeom-1…): not layers. Matches optimize-model.ts. */
const GENERIC_NAME = /^(group|component|componentinstance|instance|3dgeom|geom|geometry|mesh|node|object|assembly|default|scene|root|sketchup|model)?[\s#_.-]*\d*$/i;

/**
 * A vertical cut. "front": a plane parallel to the front face, at: 0 at the
 * front to 1 at the back; "side": parallel to the side, at: 0 at the left to
 * 1 at the right. flip: keep the other half.
 */
export type Section = { dir: "front" | "side"; at: number; flip: boolean };

/**
 * Parts that open, by their group name in SketchUp. The group's red axis
 * points the way the part opens (out of the cupboard, into the room).
 * Left and right are as seen standing on that side, facing the part.
 *   Door L / Door R   swings 90° on its left or right edge (Door L 180: folds right back)
 *   Drawer            slides out along the red axis
 *   Slide L / Slide R slides sideways (wardrobe shutters, sliding doors)
 * Matches optimize-model.ts.
 */
const MOVABLE = /^(door|drawer|slide)(?![a-z])\s*(l|r|left|right)?(?![a-z])\s*(\d+)?/i;

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
  /** How many doors, drawers and sliding parts the model has. */
  movable: number;
  /** The door or drawer under a point on screen, or null. */
  pick(clientX: number, clientY: number): number | null;
  /** Opens these parts (by number) and closes the rest. */
  setOpen(open: number[], animate?: boolean): void;
};

type ModelScene = Object3D & { target: Object3D; queueRender(): void; getNDC(x: number, y: number): Vector2; getCamera(): Camera };
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
    const named = parts.filter((p) => p.name && !GENERIC_NAME.test(display(p.name)) && !UUID.test(p.name) && !MOVABLE.test(display(p.name)));
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

type Movable = {
  node: Object3D;
  /** Its local transform when closed. */
  start: Matrix4;
  /** The parent's world transform when measured: motion is worked out in the world, then brought back. */
  parentWorld: Matrix4;
  parentInverse: Matrix4;
  /** Fully open: a turn (radians) about a vertical hinge through pivot, or a slide. */
  turn: number;
  pivot: Vector3;
  slide: Vector3;
  /** 0 closed … 1 open, now and where it is heading. */
  at: number;
  to: number;
};

function findMovables(root: Object3D): Object3D[] {
  const found: Object3D[] = [];
  const walk = (o: Object3D) => {
    if (o.name && MOVABLE.test(display(o.name)) && hasMesh(o)) found.push(o);
    else o.children.forEach(walk);
  };
  walk(root);
  return found;
}

/** How a part opens, from its name, its red axis and its shape. */
function measureMovable(node: Object3D): Movable | null {
  const m = MOVABLE.exec(display(node.name));
  if (!m || !node.parent) return null;
  const kind = m[1].toLowerCase();
  const side = (m[2] ?? "l").toLowerCase().startsWith("r") ? "r" : "l";
  // Numbers 100–180 are an angle; small ones are the loader's count for repeated names (Door_L_2).
  const angle = m[3] && +m[3] >= 100 && +m[3] <= 180 ? +m[3] : 90;

  node.updateWorldMatrix(true, true);
  const up = new Vector3(0, 1, 0);
  const out = new Vector3(1, 0, 0).transformDirection(node.matrixWorld).setY(0);
  // Its vertices in the world, to measure along the way it opens (out), across it (right).
  const points: Vector3[] = [];
  const v = new Vector3();
  node.traverse((o) => {
    const geo = (o as Mesh).isMesh ? ((o as Mesh).geometry as BufferGeometry) : null;
    const pos = geo?.getAttribute("position");
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += stride) points.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  if (!points.length) return null;
  if (out.lengthSq() < 1e-6) {
    // Red axis points straight up: open across the thinner side instead.
    const b = new Box3().setFromPoints(points);
    const thinX = b.max.x - b.min.x < b.max.z - b.min.z;
    out.set(thinX ? 1 : 0, 0, thinX ? 0 : 1);
  }
  out.normalize();
  const right = new Vector3().crossVectors(up, out);
  const range = (n: Vector3) => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      const d = p.dot(n);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max, size: max - min };
  };
  const along = range(out);
  const across = range(right);

  const parentWorld = node.parent.matrixWorld.clone();
  const base = { node, start: node.matrix.clone(), parentWorld, parentInverse: parentWorld.clone().invert(), at: 0, to: 0 };
  const none = { turn: 0, pivot: new Vector3(), slide: new Vector3() };
  if (kind === "drawer") return { ...base, ...none, slide: out.clone().multiplyScalar(Math.max(0.05, along.size * 0.8)) };
  if (kind === "slide") return { ...base, ...none, slide: right.clone().multiplyScalar((side === "l" ? -1 : 1) * across.size * 0.95) };
  // A door: the hinge runs up its left or right edge, on the face it opens towards.
  const hinge = side === "l" ? across.min : across.max;
  const pivot = right.clone().multiplyScalar(hinge).addScaledVector(out, along.max);
  // Turn whichever way swings the free edge out.
  const free = right.clone().multiplyScalar(side === "l" ? 1 : -1);
  const sign = Math.sign(new Vector3().crossVectors(up, free).dot(out)) || 1;
  return { ...base, ...none, turn: (sign * angle * Math.PI) / 180, pivot };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

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

  const movables = findMovables(root)
    .map(measureMovable)
    .filter((m): m is Movable => m !== null);
  const turnAt = new Matrix4();
  const moveTo = new Matrix4();
  const placeMovable = (m: Movable) => {
    const k = ease(m.at);
    // In the world: about the hinge, or along the slide…
    if (m.turn) {
      turnAt.makeTranslation(m.pivot.x, m.pivot.y, m.pivot.z);
      turnAt.multiply(moveTo.makeRotationY(m.turn * k));
      turnAt.multiply(moveTo.makeTranslation(-m.pivot.x, -m.pivot.y, -m.pivot.z));
    } else turnAt.makeTranslation(m.slide.x * k, m.slide.y * k, m.slide.z * k);
    // …then in the parent's own terms, so it follows the model when it is lifted or moved.
    moveTo.copy(m.parentInverse).multiply(turnAt).multiply(m.parentWorld).multiply(m.start);
    moveTo.decompose(m.node.position, m.node.quaternion, m.node.scale);
  };
  let frame = 0;
  let last = 0;
  const animate = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    let moving = false;
    for (const m of movables) {
      if (m.at === m.to) continue;
      m.at = m.to > m.at ? Math.min(m.to, m.at + dt / 0.7) : Math.max(m.to, m.at - dt / 0.7);
      placeMovable(m);
      moving = true;
    }
    scene.queueRender();
    frame = moving ? requestAnimationFrame(animate) : 0;
    if (!moving) last = 0;
  };
  const raycaster = new Raycaster();

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
    movable: movables.length,
    pick(clientX, clientY) {
      if (!movables.length) return null;
      raycaster.setFromCamera(scene.getNDC(clientX, clientY), scene.getCamera());
      for (const hit of raycaster.intersectObject(root, true)) {
        // Skip what is hidden (a layer turned off) or cut away.
        let shown = true;
        for (let o: Object3D | null = hit.object; o; o = o.parent) if (!o.visible) shown = false;
        if (!shown || active.some((p) => p.distanceToPoint(hit.point) < 0)) continue;
        for (let o: Object3D | null = hit.object; o && o !== root; o = o.parent) {
          const i = movables.findIndex((m) => m.node === o);
          if (i >= 0) return i;
        }
        return null;
      }
      return null;
    },
    setOpen(open, smooth = true) {
      const set = new Set(open);
      movables.forEach((m, i) => {
        m.to = set.has(i) ? 1 : 0;
        if (!smooth) {
          m.at = m.to;
          placeMovable(m);
        }
      });
      if (!smooth) scene.queueRender();
      else if (!frame) frame = requestAnimationFrame(animate);
    },
  };
}
