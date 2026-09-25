// Shared toolkit for the water regions (水乡 village, 荷塘 lake): lifetime, toon/ink materials,
// geometry placement and tinting, a merge-per-material collector with ink edge lines, painted
// canvases, sway shaders, river geometry queries and walkable decks. Runtime three.js comes from
// ctx.THREE; only the merge utility is imported.
import type * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, Interactable, Occluder, WorldCtx } from '../types';
import { type XZ } from '../map';
import { RIVER_LOWER_START, RIVER_SAMPLES } from '../world/terrain';
import { registerClearing, registerDeck, type Clearing, type Deck } from './water-decks';

export type Three = WorldCtx['THREE'];
export const INK = '#1b1916';
/**
 * What the night does to a built place's lit surfaces (a multiplier on their day colour): moonlight,
 * a clear indigo-lavender rather than a grey-blue wash. The core's night light stays fairly strong,
 * so without it the white walls and pale paving of the towns stay day-bright on a dark land and the
 * lit windows (amber, emissive) have nothing to glow against.
 */
export const NIGHT_SHADE = '#b7bbd6';

export function reducedMotion(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Everything one region allocates, and a few conveniences over ctx. */
export class Kit {
  readonly T: Three;
  private owned = new Set<{ dispose(): void }>();
  private offs: (() => void)[] = [];
  private grad: T.DataTexture | null = null;
  readonly group: T.Group;
  /** Shared uniform: seconds since start (sway shaders). */
  readonly time = { value: 0 };
  readonly reduced = reducedMotion();
  /** 0 day … 1 night, eased like the sky's own turn. */
  night = 0;
  /** Materials that dim with the night: their day colour, multiplied by NIGHT_SHADE as night falls. */
  private shaded: { m: { color: T.Color }; base: T.Color }[] = [];
  private shade: T.Color;
  constructor(readonly ctx: WorldCtx, id: Parameters<WorldCtx['regionGroup']>[0]) {
    this.T = ctx.THREE;
    this.group = ctx.regionGroup(id);
    this.shade = new ctx.THREE.Color('#ffffff');
    const day = new ctx.THREE.Color('#ffffff'), nightC = new ctx.THREE.Color(NIGHT_SHADE);
    let first = true, last = -1;
    this.frame((dt, t) => {
      this.time.value = this.reduced ? 0 : t;
      const n = ctx.sky.isNight() ? 1 : 0;
      this.night = first ? n : this.night + (n - this.night) * (1 - Math.exp(-1.6 * Math.min(dt, 0.1)));
      first = false;
      if (Math.abs(this.night - last) < 1e-3) return;
      last = this.night;
      this.shade.copy(day).lerp(nightC, this.night);
      for (const s of this.shaded) s.m.color.copy(s.base).multiply(this.shade);
    });
  }
  /** Let a lit (or painted) material dim with the night, as the land around it does. Returns it. */
  nightShade<M extends { color: T.Color }>(m: M): M {
    this.shaded.push({ m, base: m.color.clone() });
    m.color.copy(this.shaded[this.shaded.length - 1].base).multiply(this.shade);
    return m;
  }
  own<D extends { dispose(): void }>(d: D): D { this.owned.add(d); return d; }
  frame(fn: (dt: number, t: number) => void): void { this.offs.push(this.ctx.onFrame(fn)); }
  collider(c: Collider): void { this.offs.push(this.ctx.addCollider(c)); }
  occluder(o: Occluder): void { this.offs.push(this.ctx.addOccluder(o)); }
  interact(i: Interactable): void { this.offs.push(this.ctx.addInteractable(i)); }
  deck(d: Deck): void { this.offs.push(registerDeck(d)); }
  clearing(c: Clearing): void { this.offs.push(registerClearing(c)); }
  private roots: T.Object3D[] = [];
  /** Add to this region's group (only what was added here is removed on dispose; the group is shared). */
  add<O extends T.Object3D>(o: O): O { this.group.add(o); this.roots.push(o); return o; }
  /** A wall of colliders along a segment (parapets, railings, fences). */
  fence(ax: number, az: number, bx: number, bz: number, r = 0.22, h = 1.1): void {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / (r * 1.4)));
    for (let i = 0; i <= n; i++) this.collider({ x: ax + ((bx - ax) * i) / n, z: az + ((bz - az) * i) / n, r, h });
  }
  dispose(): void {
    for (const f of this.offs.splice(0).reverse()) { try { f(); } catch { /* gone */ } }
    for (const r of this.roots.splice(0)) {
      r.removeFromParent();
      r.traverse((o) => {
        const m = o as T.Mesh;
        if (m.geometry) this.owned.add(m.geometry);
        const mat = m.material as T.Material | T.Material[] | undefined;
        if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) this.owned.add(x);
      });
    }
    for (const d of this.owned) { try { d.dispose(); } catch { /* gone */ } }
    this.owned.clear();
  }

  // ───────────── materials

  gradient(): T.DataTexture {
    if (this.grad) return this.grad;
    const { T: THREE } = this;
    const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
    const t = this.own(new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat));
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return (this.grad = t);
  }
  /** Toon wash; it dims with the night (emissive windows and lanterns keep their glow, so they read). */
  toon(color: T.ColorRepresentation, o: { vertexColors?: boolean; side?: T.Side; map?: T.Texture; emissive?: T.ColorRepresentation; alphaTest?: number } = {}): T.MeshToonMaterial {
    const { T: THREE } = this;
    return this.nightShade(this.own(new THREE.MeshToonMaterial({
      color, gradientMap: this.gradient(), vertexColors: !!o.vertexColors, side: o.side ?? THREE.FrontSide,
      ...(o.map ? { map: o.map } : {}),
      ...(o.alphaTest ? { alphaTest: o.alphaTest } : {}),
      ...(o.emissive !== undefined ? { emissive: new THREE.Color(o.emissive) } : {}),
    })));
  }
  lineMat(opacity = 0.72, color = INK): T.LineBasicMaterial {
    return this.own(new this.T.LineBasicMaterial({ color, transparent: true, opacity }));
  }
  /** Inverted-hull ink outline (works for InstancedMesh too). */
  outline(width: number, color = INK): T.MeshBasicMaterial {
    const m = this.own(new this.T.MeshBasicMaterial({ color, side: this.T.BackSide }));
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
    };
    m.customProgramCacheKey = () => 'wk-outline' + width;
    return m;
  }
  canvasTex(c: HTMLCanvasElement, o: { repeat?: boolean; mips?: boolean } = {}): T.CanvasTexture {
    const { T: THREE } = this;
    const t = this.own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    if (o.mips === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  // ───────────── geometry

  /** Move / rotate / scale a geometry in place. */
  xf(g: T.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): T.BufferGeometry {
    const { T: THREE } = this;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    return g;
  }
  /** Non-indexed, position/normal/color only (uv kept when keepUv), flat colour with a little jitter. */
  tint(geo: T.BufferGeometry, color: T.ColorRepresentation, jitter = 0, seed = 1, keepUv = false): T.BufferGeometry {
    const { T: THREE } = this;
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    let s = seed >>> 0;
    let k = 1;
    for (let i = 0; i < n; i++) {
      if (jitter && i % 3 === 0) {
        s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
        k = 1 + (s / 4294967296 - 0.5) * jitter;
      }
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  box(w: number, h: number, d: number, color: T.ColorRepresentation, x: number, y: number, z: number, ry = 0, jitter = 0.04, rx = 0, rz = 0): T.BufferGeometry {
    return this.tint(this.xf(new this.T.BoxGeometry(w, h, d), x, y, z, ry, rx, rz), color, jitter, (x * 131 + z * 71) | 0);
  }
  cyl(rt: number, rb: number, h: number, seg: number, color: T.ColorRepresentation, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, jitter = 0.04): T.BufferGeometry {
    return this.tint(this.xf(new this.T.CylinderGeometry(rt, rb, h, seg), x, y, z, ry, rx, rz), color, jitter, (x * 37 + z * 91) | 0);
  }
  /** A beam from a to b (square section s). */
  beam(a: T.Vector3Like, b: T.Vector3Like, s: number, color: T.ColorRepresentation, round = false): T.BufferGeometry {
    const { T: THREE } = this;
    const va = new THREE.Vector3(a.x, a.y, a.z), vb = new THREE.Vector3(b.x, b.y, b.z);
    const L = va.distanceTo(vb);
    const g = round ? new THREE.CylinderGeometry(s / 2, s / 2, L, 6) : new THREE.BoxGeometry(s, L, s);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    return this.tint(g, color, 0.05, (a.x * 13 + b.z * 7) | 0);
  }
}

/** Collects static geometry for one material; merges it (and its ink edges) into a mesh. */
export class Parts {
  readonly geos: T.BufferGeometry[] = [];
  private edgeGeos: T.BufferGeometry[] = [];
  constructor(private kit: Kit) {}
  /** Add a world-placed, tinted geometry. edges = crease angle for ink lines (false = none). */
  add(g: T.BufferGeometry, edges: number | false = 32): T.BufferGeometry {
    this.geos.push(g);
    if (edges !== false) this.edgeGeos.push(new this.kit.T.EdgesGeometry(g, edges));
    return g;
  }
  addAll(gs: T.BufferGeometry[], edges: number | false = 32): void { for (const g of gs) this.add(g, edges); }
  /** Raw line positions (x0,y0,z0,x1,y1,z1…), e.g. tile rows. */
  lines(pos: number[]): void {
    if (!pos.length) return;
    const g = new this.kit.T.BufferGeometry();
    g.setAttribute('position', new this.kit.T.Float32BufferAttribute(pos, 3));
    this.edgeGeos.push(g);
  }
  /** The merged geometry (owned by the kit), or null when empty. */
  geometry(): T.BufferGeometry | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    return this.kit.own(merged);
  }
  mesh(mat: T.Material, name: string): T.Mesh | null {
    const merged = this.geometry();
    if (!merged) return null;
    const m = new this.kit.T.Mesh(merged, mat);
    m.name = name;
    return m;
  }
  edges(mat: T.LineBasicMaterial, name: string): T.LineSegments | null {
    if (!this.edgeGeos.length) return null;
    const merged = mergeGeometries(this.edgeGeos, false);
    for (const g of this.edgeGeos) g.dispose();
    this.edgeGeos.length = 0;
    if (!merged) return null;
    const l = new this.kit.T.LineSegments(this.kit.own(merged), mat);
    l.name = name;
    return l;
  }
}

// ───────────── shaders

/**
 * Sway for foliage and cloth: displaces vertices by a wind wave keyed on the instance (or vertex)
 * world position. `weight` picks the lever: 'y' (local y², stems), 'hang' (below the top, willow
 * strands), 'attr' (a per-vertex aw attribute: cloth tied along one edge).
 */
export function sway<M extends T.Material>(m: M, time: { value: number }, amp: number, weight: 'y' | 'hang' | 'attr', key: string, top = 0): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    const w = weight === 'y' ? 'position.y * position.y' : weight === 'hang' ? `max(0.0, ${top.toFixed(3)} - position.y) * max(0.0, ${top.toFixed(3)} - position.y) * 0.25` : 'aw';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${weight === 'attr' ? 'attribute float aw;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif
        float ph = ip.x * 0.23 + ip.z * 0.17;
        float sw = sin(uTime * 1.1 - ph) + 0.45 * sin(uTime * 2.7 + ip.z * 0.9 + ip.x * 0.3) + 0.25 * sin(uTime * 4.3 + ph * 3.0);
        float wk = ${w};
        transformed.x += sw * ${amp.toFixed(4)} * wk;
        transformed.z += (0.6 * sw + 0.4 * sin(uTime * 1.7 + ph)) * ${(amp * 0.6).toFixed(4)} * wk;
        ${weight === 'attr' ? `transformed.y += cos(uTime * 2.3 - ph * 2.0 + position.x * 3.0) * ${(amp * 0.25).toFixed(4)} * wk;` : ''}`);
  };
  m.customProgramCacheKey = () => `wk-sway-${key}`;
  return m;
}

/** A slow bob and roll for things moored on water (instanced): y bob and a little pitch. */
export function bob<M extends T.Material>(m: M, time: { value: number }, amp: number, key: string, outlineW = 0): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${outlineW ? `transformed += normalize(normal) * ${outlineW.toFixed(4)};` : ''}
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float bph = ip.x * 0.7 + ip.z * 0.4;
        transformed.y += sin(uTime * 1.3 + bph) * ${amp.toFixed(4)} + position.z * sin(uTime * 0.9 + bph) * ${(amp * 0.12).toFixed(4)} + position.x * sin(uTime * 1.1 + bph * 1.3) * ${(amp * 0.25).toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `wk-bob-${key}`;
  return m;
}

// ───────────── canvases & fonts

/**
 * Warm pools of lamplight (#ffb86b) on the ground — or on the water, or a bridge deck — under each
 * lantern, for the night: one instanced, additive draw. Returns a setter for the night (0..1).
 */
export function lampPools(kit: Kit, at: [number, number, number][], tex: T.Texture, name: string): (night: number, flick: number) => void {
  const THREE = kit.T;
  const ctx = kit.ctx;
  if (!at.length) return () => {};
  const geo = kit.own(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2));
  const mat = kit.own(new THREE.MeshBasicMaterial({
    map: tex, color: '#ffb86b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  const pools = new THREE.InstancedMesh(geo, mat, at.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  at.forEach(([x, y, z], i) => {
    const w = ctx.waterAt(x, z);
    const gy = Math.max(ctx.groundY(x, z), w ?? -Infinity);
    const r = clamp(1.3 + (y - gy) * 0.55, 1.1, 3.2);
    pools.setMatrixAt(i, m.compose(p.set(x, gy + 0.03, z), q, sc.set(r, 1, r)));
  });
  pools.instanceMatrix.needsUpdate = true;
  pools.computeBoundingSphere();
  pools.name = name;
  pools.visible = false;
  pools.renderOrder = 1;
  kit.add(pools);
  return (night, flick) => {
    mat.opacity = 0.56 * night * flick;
    pools.visible = night > 0.02;
  };
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export const BRUSH_FONT = '"Ma Shan Zheng", "LXGW WenKai", "KaiTi", "STKaiti", serif';

/** Wait (briefly) for the brush face so calligraphy on signboards is not painted in a fallback. */
export async function fontsReady(chars: string): Promise<void> {
  try {
    const f = document.fonts;
    if (!f) return;
    await Promise.race([
      Promise.all([f.load(`64px "Ma Shan Zheng"`, chars), f.load(`64px "LXGW WenKai"`, chars)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back */ }
}

// ───────────── river

export interface RiverPt { d: number; w: number; px: number; pz: number; tx: number; tz: number }

/** Nearest point on the river centreline (lake gap excluded): distance, half-width, tangent.
 *  Follows the channel the world core actually carved (a smooth curve through map.ts's RIVER). */
export function riverNear(x: number, z: number): RiverPt {
  const RS = RIVER_SAMPLES;
  let best: RiverPt = { d: Infinity, w: 4, px: x, pz: z, tx: 1, tz: 0 };
  for (let i = 1; i < RS.length; i++) {
    if (i === RIVER_LOWER_START) continue;
    const a = RS[i - 1], b = RS[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) {
      const L = Math.sqrt(L2);
      best = { d, w: a.w + (b.w - a.w) * t, px, pz, tx: dx / L, tz: dz / L };
    }
  }
  return best;
}

/** The river's centre z where it crosses the vertical line x (downstream of the lake). */
export function riverZ(x: number): { z: number; w: number; tx: number; tz: number } {
  const RS = RIVER_SAMPLES;
  for (let i = RIVER_LOWER_START + 1; i < RS.length; i++) {
    const a = RS[i - 1], b = RS[i];
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi && hi > lo) {
      const t = (x - a.x) / (b.x - a.x);
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      return { z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
    }
  }
  const e = RS[RS.length - 1];
  return { z: e.z, w: e.w, tx: -1, tz: 0 };
}

/** Heading (radians about +Y) that turns local +z toward (dx, dz). */
export const headingTo = (dx: number, dz: number) => Math.atan2(dx, dz);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (e0: number, e1: number, v: number) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export type { XZ };

// ───────────── painted flats (camera-facing, merged into one draw)

export interface Flat {
  x: number; y: number; z: number;
  /** Size in metres, and where the anchor sits across the width (0 left … 1 right). */
  w: number; h: number; ax?: number;
  uv: [number, number, number, number];
  /** Sway amount at the top (m). */
  sway?: number;
}

/**
 * Brush-painted flats that turn about Y to face the camera (like the garden's plant paintings),
 * all in one mesh: the corner offsets are applied in the vertex shader.
 */
export function flatsMesh(kit: Kit, tex: T.Texture, flats: Flat[], name: string): T.Mesh {
  const THREE = kit.T;
  const pos: number[] = [], off: number[] = [], uv: number[] = [], sw: number[] = [], idx: number[] = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  flats.forEach((f, i) => {
    const ax = f.ax ?? 0.5;
    const [u0, v0, u1, v1] = f.uv;
    const corners: [number, number, number, number][] = [[-ax * f.w, 0, u0, v0], [(1 - ax) * f.w, 0, u1, v0], [(1 - ax) * f.w, f.h, u1, v1], [-ax * f.w, f.h, u0, v1]];
    for (const [ox, oy, u, v] of corners) {
      pos.push(f.x, f.y, f.z);
      off.push(ox, oy);
      uv.push(u, v);
      sw.push((f.sway ?? 0) / Math.max(0.01, f.h * f.h));
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    const R = Math.max(f.w, f.h);
    minX = Math.min(minX, f.x - R); maxX = Math.max(maxX, f.x + R);
    minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y + f.h);
    minZ = Math.min(minZ, f.z - R); maxZ = Math.max(maxZ, f.z + R);
  });
  const g = kit.own(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSw', new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  const m = kit.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.04, side: THREE.DoubleSide }));
  m.forceSinglePass = true; // flat cards: one draw for both faces, not a back pass and a front pass
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = kit.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec2 aOff;\nattribute float aSw;')
      .replace('#include <begin_vertex>', `vec3 transformed = position;
        vec3 toCam = cameraPosition - position; toCam.y = 0.0;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
        float ph = position.x * 0.21 + position.z * 0.13;
        float s = (sin(uTime * 1.05 - ph) + 0.4 * sin(uTime * 2.3 + ph * 2.0)) * aSw * aOff.y * aOff.y;
        transformed += right * (aOff.x + s) + vec3(0.0, aOff.y, 0.0);`);
  };
  m.customProgramCacheKey = () => 'wk-flats';
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name;
  mesh.renderOrder = 2;
  const day = new THREE.Color('#ffffff'), night = new THREE.Color('#b0b8dc');
  kit.frame(() => { m.color.copy(kit.ctx.sky.isNight() ? night : day); });
  return mesh;
}

/** Packs painted canvases into one ≤512 px atlas: slots are [x, y, w, h] in px. */
export function packAtlas(parts: { c: HTMLCanvasElement; slot: [number, number, number, number] }[], size = 512): { canvas: HTMLCanvasElement; uv: [number, number, number, number][] } {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const uv: [number, number, number, number][] = [];
  for (const p of parts) {
    const [x, y, w, h] = p.slot;
    const k = Math.min(w / p.c.width, h / p.c.height);
    const dw = p.c.width * k, dh = p.c.height * k;
    const dx = x + (w - dw) / 2, dy = y + (h - dh);
    g.drawImage(p.c, dx, dy, dw, dh);
    uv.push([dx / size, 1 - (dy + dh) / size, (dx + dw) / size, 1 - dy / size]);
  }
  return { canvas: c, uv };
}
