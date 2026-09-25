// Shared toolkit for the three hill regions (竹林 bamboo grove, 梅岭 plum ridge, 山寺 mountain temple):
// lifetime bookkeeping, ink-palette toon materials (with a cheap "rim ink" that darkens silhouettes
// like a brush outline), geometry batching (everything static is tinted with vertex colours and
// merged into one mesh + one ink-line mesh per region), terrain-aware platforms and stairs, curved
// Chinese roofs, tapered tubes for trunks, rocks, painted textures from the ink brush engine.
// Runtime three.js comes from ctx.THREE only.
import type * as T from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, Interactable, Occluder, WorldCtx } from '../types';
import type { RegionId, XZ } from '../map';
import { PATHS } from '../map';
import { makeNoise2, makeRng, type Rng } from '../../../core/rng';
import type { Drawing, Stroke, StrokeKind } from '../../../ink/types';
import { rasterize } from '../../../ink/brush';
import { registerClearing, registerDeck, segmentDeck, type Clearing, type Deck } from './water-decks';
import { NIGHT_SHADE } from './water-kit';

export type Three = WorldCtx['THREE'];
type BG = T.BufferGeometry;

/** The three.js namespace of the world being built (set by the first Hill). */
let TH: Three;
export const three = (): Three => TH;

export const COL = {
  ink: '#1b1916',
  inkSoft: '#3a3631',
  paper: '#efe9dc',
  stone: '#cfc8b8',
  stoneMid: '#b1ab9e',
  stoneDark: '#8f8a80',
  stoneWarm: '#c2b7a2',
  whitewash: '#eee9df',
  tile: '#5d5c5a',
  tileDark: '#434241',
  lacquer: '#8b3e2f',
  cinnabar: '#b0473a',
  wood: '#5b3d2e',
  woodDark: '#3b2a21',
  woodLight: '#8b6c4c',
  ochre: '#a8703a',
  templeWall: '#bfa47c',
  bronze: '#5f5b45',
  bronzeDark: '#34322a',
  indigo: '#3d5a73',
  malachite: '#5f8a6e',
  thatch: '#9a8560',
  bamboo: '#7f9270',
  bambooDry: '#a79d74',
};

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function reducedMotion(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// ───────────────────────────── lifetime ─────────────────────────────

export class Hill {
  readonly THREE: Three;
  readonly group: T.Group;
  /** Seconds since start; shared by every animated material of the region. */
  readonly time = { value: 0 };
  /** The light falling on painted (unlit) things: paper white by day, moon blue by night. */
  readonly paper: T.Color;
  /** 0 day … 1 night, eased. */
  night = 0;
  readonly reduced = reducedMotion();
  private owned = new Set<{ dispose(): void }>();
  private offs: (() => void)[] = [];
  private grad: T.DataTexture | null = null;
  private disposed = false;

  /** Lit materials that dim with the night like the painted ones (their day colour × paper). */
  private shaded: { m: { color: T.Color }; base: T.Color }[] = [];

  constructor(readonly ctx: WorldCtx, readonly id: RegionId) {
    TH = ctx.THREE;
    this.THREE = ctx.THREE;
    this.group = new TH.Group();
    this.group.name = `region:${id}`;
    ctx.regionGroup(id).add(this.group);
    this.paper = new TH.Color('#ffffff');
    const day = new TH.Color('#ffffff'), nightC = new TH.Color(NIGHT_SHADE);
    let first = true, last = -1;
    this.frame((dt, t) => {
      this.time.value = t;
      const n = ctx.sky.isNight() ? 1 : 0;
      this.night = first ? n : this.night + (n - this.night) * (1 - Math.exp(-1.6 * Math.min(dt, 0.1)));
      first = false;
      this.paper.copy(day).lerp(nightC, this.night);
      if (Math.abs(this.night - last) < 1e-3) return;
      last = this.night;
      for (const s of this.shaded) s.m.color.copy(s.base).multiply(this.paper);
    });
  }

  /** Let a lit material dim with the night, as the land and the painted cards do (emissive lanterns keep their glow). Returns it. */
  nightShade<M extends { color: T.Color }>(m: M): M {
    const base = m.color.clone();
    this.shaded.push({ m, base });
    m.color.copy(base).multiply(this.paper);
    return m;
  }

  own<D extends { dispose(): void }>(d: D): D {
    this.owned.add(d);
    return d;
  }
  frame(fn: (dt: number, t: number) => void): void {
    this.offs.push(this.ctx.onFrame(fn));
  }
  collide(c: Collider): void {
    this.offs.push(this.ctx.addCollider(c));
  }
  occlude(o: Occluder): void {
    this.offs.push(this.ctx.addOccluder(o));
  }
  interact(i: Interactable): void {
    this.offs.push(this.ctx.addInteractable(i));
  }
  /** A walkable surface (terrace, stairs, platform) the core stands the player on; unregistered on dispose. */
  deck(d: Deck): void {
    this.offs.push(registerDeck(d));
  }
  /** Built-over ground where nothing should be scattered; unregistered on dispose. */
  clearing(c: Clearing): void {
    this.offs.push(registerClearing(c));
  }
  add<O extends T.Object3D>(o: O): O {
    this.group.add(o);
    return o;
  }
  y(x: number, z: number): number {
    return this.ctx.groundY(x, z);
  }
  /** Highest and lowest ground over a disc (sampled). */
  span(x: number, z: number, r: number): { hi: number; lo: number } {
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * TAU;
      const d = i === 8 ? 0 : r;
      const y = this.y(x + Math.cos(a) * d, z + Math.sin(a) * d);
      if (y > hi) hi = y;
      if (y < lo) lo = y;
    }
    return { hi, lo };
  }

  gradient(): T.DataTexture {
    if (this.grad) return this.grad;
    const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
    const t = this.own(new TH.DataTexture(data, 3, 1, TH.RGBAFormat));
    t.minFilter = t.magFilter = TH.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.grad = t;
    return t;
  }

  /**
   * Toon wash in three flat bands. `rim` (0..1) darkens surfaces seen edge-on toward ink — a brush
   * outline for thin things (culms, branches) that costs no extra draw call.
   */
  toon(color: T.ColorRepresentation, o: { vc?: boolean; side?: T.Side; rim?: number; emissive?: T.ColorRepresentation } = {}): T.MeshToonMaterial {
    const m = this.nightShade(this.own(new TH.MeshToonMaterial({
      color,
      gradientMap: this.gradient(),
      vertexColors: !!o.vc,
      side: o.side ?? TH.FrontSide,
      ...(o.emissive !== undefined ? { emissive: new TH.Color(o.emissive) } : {}),
    })));
    const rim = o.rim ?? 0;
    if (rim > 0) {
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
          {
            float nv = abs(dot(normalize(normal), normalize(vViewPosition)));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.106, 0.098, 0.086), smoothstep(0.5, 0.86, 1.0 - nv) * ${rim.toFixed(3)});
          }`);
      };
      m.customProgramCacheKey = () => `hill-rim${rim.toFixed(3)}`;
    }
    return m;
  }

  /** Inverted-hull ink outline: back faces pushed out along the normal. */
  outline(width: number, color: T.ColorRepresentation = COL.ink): T.MeshBasicMaterial {
    const m = this.own(new TH.MeshBasicMaterial({ color, side: TH.BackSide }));
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
    };
    m.customProgramCacheKey = () => `hill-outline${width.toFixed(4)}`;
    return m;
  }

  lineMat(opacity = 0.7, color: T.ColorRepresentation = COL.ink): T.LineBasicMaterial {
    return this.own(new TH.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  }

  tex(c: HTMLCanvasElement, o: { repeat?: boolean; mips?: boolean } = {}): T.CanvasTexture {
    const t = this.own(new TH.CanvasTexture(c));
    t.colorSpace = TH.SRGBColorSpace;
    t.wrapS = t.wrapT = o.repeat ? TH.RepeatWrapping : TH.ClampToEdgeWrapping;
    if (o.mips === false) {
      t.generateMipmaps = false;
      t.minFilter = TH.LinearFilter;
    }
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  /** A drawing from the ink engine as a texture (≤ 512 px on its long side). */
  painted(d: Drawing, px = 512): T.CanvasTexture {
    const scale = px / Math.max(d.width, d.height);
    return this.tex(rasterize(d, 1, scale));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.offs.splice(0).reverse()) {
      try { f(); } catch { /* already gone */ }
    }
    this.group.removeFromParent();
    const seen = new Set<unknown>();
    const free = (d: { dispose(): void } | null | undefined) => {
      if (!d || seen.has(d)) return;
      seen.add(d);
      d.dispose();
    };
    this.group.traverse((o) => {
      const m = o as T.Mesh;
      if (m.geometry) free(m.geometry);
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        const mm = mat as T.MeshBasicMaterial;
        if (mm.map) free(mm.map);
        free(mat);
      }
    });
    for (const d of this.owned) free(d);
    this.owned.clear();
  }
}

// ───────────────────────────── geometry ─────────────────────────────

const _m = () => new TH.Matrix4();

/** Scale, tilt (rx then rz), yaw (ry), then move. */
export function place(g: BG, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): BG {
  const m = _m().compose(new TH.Vector3(x, y, z), new TH.Quaternion().setFromEuler(new TH.Euler(rx, ry, rz, 'YXZ')), new TH.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}

/** Strip to position/normal, add a flat vertex colour (with optional per-vertex jitter). Non-indexed. */
export function tint(geo: BG, color: T.ColorRepresentation, jitter = 0, seed = 1): BG {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new TH.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < n; i += 3) {
    // jitter per triangle, like uneven washes
    let k = 1;
    if (jitter) {
      s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
      k = 1 + ((s / 4294967296) - 0.5) * jitter;
    }
    for (let j = i; j < Math.min(n, i + 3); j++) {
      arr[j * 3] = c.r * k; arr[j * 3 + 1] = c.g * k; arr[j * 3 + 2] = c.b * k;
    }
  }
  g.setAttribute('color', new TH.BufferAttribute(arr, 3));
  return g;
}

/** Keep only position/normal/color, non-indexed (for geometries that already carry colours). */
export function strip(geo: BG): BG {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/**
 * Static scenery collected for one region and merged: all solids share one vertex-coloured toon
 * material (one draw), smooth things get an inverted-hull outline (one draw), architecture gets
 * crisp ink lines along hard edges and tile rows (one draw).
 */
export class Batch {
  solid: BG[] = [];
  hull: BG[] = [];
  lines: BG[] = [];
  rimSolid: BG[] = [];

  /** Add a primitive with a flat colour. edge: crease angle for ink lines (0 = none). */
  add(geo: BG, color: T.ColorRepresentation, o: { edge?: number; hull?: boolean; jitter?: number; seed?: number; rim?: boolean } = {}): void {
    if (o.edge) this.lines.push(new TH.EdgesGeometry(geo, o.edge));
    const g = tint(geo, color, o.jitter ?? 0, o.seed ?? 1);
    (o.rim ? this.rimSolid : this.solid).push(g);
    if (o.hull) this.hull.push(g);
  }
  /** Add a geometry that already has vertex colours. */
  colored(geo: BG, o: { hull?: boolean; rim?: boolean } = {}): void {
    const g = strip(geo);
    (o.rim ? this.rimSolid : this.solid).push(g);
    if (o.hull) this.hull.push(g);
  }
  /** Raw ink line segments (pairs of points). */
  segs(pts: number[]): void {
    if (!pts.length) return;
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.Float32BufferAttribute(pts, 3));
    this.lines.push(g);
  }

  build(h: Hill, name: string, o: { outline?: number; lineOpacity?: number; rim?: number } = {}): T.Object3D[] {
    const out: T.Object3D[] = [];
    const merge = (list: BG[]) => {
      if (!list.length) return null;
      const m = mergeGeometries(list, false);
      return m;
    };
    const solid = merge(this.solid);
    if (solid) {
      const mesh = new TH.Mesh(solid, h.toon('#ffffff', { vc: true }));
      mesh.name = `${name}:solid`;
      out.push(h.add(mesh));
    }
    const rimSolid = merge(this.rimSolid);
    if (rimSolid) {
      const mesh = new TH.Mesh(rimSolid, h.toon('#ffffff', { vc: true, rim: o.rim ?? 0.75 }));
      mesh.name = `${name}:rim`;
      out.push(h.add(mesh));
    }
    if (this.hull.length) {
        const hm = merge(this.hull.map((g) => {
        const c = new TH.BufferGeometry();
        c.setAttribute('position', g.attributes.position);
        c.setAttribute('normal', g.attributes.normal);
        return c;
      }));
      if (hm) {
        const mesh = new TH.Mesh(hm, h.outline(o.outline ?? 0.035));
        mesh.name = `${name}:outline`;
        out.push(h.add(mesh));
      }
    }
    const lines = merge(this.lines);
    if (lines) {
      const ls = new TH.LineSegments(lines, h.lineMat(o.lineOpacity ?? 0.72));
      ls.name = `${name}:lines`;
      out.push(h.add(ls));
    }
    for (const g of [...this.solid, ...this.rimSolid, ...this.lines]) g.dispose();
    this.solid = []; this.hull = []; this.lines = []; this.rimSolid = [];
    return out;
  }
}

/** A box whose top face is at `top` and which reaches down into the ground (for terraces, bases). */
export function footing(b: Batch, h: Hill, x: number, z: number, hw: number, hd: number, ry: number, top: number, color: string, o: { edge?: number; jitter?: number } = {}): void {
  const r = Math.hypot(hw, hd);
  const lo = Math.min(h.span(x, z, r).lo, top) - 0.6;
  const H = top - lo;
  b.add(place(new TH.BoxGeometry(hw * 2, H, hd * 2), x, lo + H / 2, z, ry), color, { edge: o.edge ?? 30, jitter: o.jitter ?? 0.04 });
}

/**
 * Stone stairs from a to b (world points with y), each step a box reaching into the ground, with
 * low cheek walls. Returns the number of steps.
 */
export function stairs(b: Batch, h: Hill, a: T.Vector3, c: T.Vector3, width: number, o: { rise?: number; color?: string; cheeks?: boolean; seed?: number } = {}): number {
  const dx = c.x - a.x, dz = c.z - a.z;
  const len = Math.hypot(dx, dz);
  const dy = c.y - a.y;
  const rise = o.rise ?? 0.17;
  const n = Math.max(1, Math.round(Math.abs(dy) / rise));
  const ry = Math.atan2(dx, dz);
  const run = len / n;
  const rng = makeRng(o.seed ?? 7);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a.x + dx * t, z = a.z + dz * t;
    const top = a.y + dy * ((dy > 0 ? i + 1 : i) / n);
    const g = h.y(x, z);
    const lo = Math.min(g, top) - 0.5;
    const H = top - lo;
    const col = new TH.Color(o.color ?? COL.stone).multiplyScalar(rng.range(0.9, 1.05));
    b.add(place(new TH.BoxGeometry(width + rng.range(-0.06, 0.06), H, run + 0.04), x + rng.range(-0.03, 0.03), lo + H / 2, z, ry + rng.range(-0.012, 0.012)), col, { edge: 40 });
  }
  if (o.cheeks !== false) {
    for (const side of [-1, 1]) {
      const ox = Math.cos(ry) * side * (width / 2 + 0.16), oz = -Math.sin(ry) * side * (width / 2 + 0.16);
      const segs = Math.max(1, Math.round(len / 3));
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const y0 = a.y + dy * t0, y1 = a.y + dy * t1;
        const x0 = a.x + dx * t0 + ox, z0 = a.z + dz * t0 + oz, x1 = a.x + dx * t1 + ox, z1 = a.z + dz * t1 + oz;
        const l = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
        const pitch = Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
        const g = new TH.BoxGeometry(0.3, 0.9, l + 0.02);
        place(g, (x0 + x1) / 2, (y0 + y1) / 2 + 0.05, (z0 + z1) / 2, ry, 1, 1, 1, -pitch);
        b.add(g, COL.stoneMid, { edge: 40, jitter: 0.05 });
      }
    }
  }
  return n;
}

/** Stepping stones along a polyline (flat slabs sitting on the ground). */
export function steppingStones(b: Batch, h: Hill, pts: XZ[], o: { gap?: number; w?: number; seed?: number; color?: string } = {}): void {
  const rng = makeRng(o.seed ?? 3);
  const gap = o.gap ?? 0.8;
  const w = o.w ?? 0.7;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const n = Math.max(1, Math.floor(len / gap));
    for (let k = 0; k < n; k++) {
      const t = (k + rng.range(0.2, 0.8)) / n;
      const x = lerp(a.x, c.x, t) + rng.range(-0.18, 0.18), z = lerp(a.z, c.z, t) + rng.range(-0.18, 0.18);
      const s = w * rng.range(0.75, 1.2);
      const g = new TH.CylinderGeometry(s * 0.5, s * 0.55, 0.16, 7);
      place(g, x, h.y(x, z) + 0.03, z, rng() * TAU, 1, 1, rng.range(0.7, 1));
      b.add(g, new TH.Color(o.color ?? COL.stone).multiplyScalar(rng.range(0.86, 1.04)), { edge: 50 });
    }
  }
}

// ───────────────────────────── roofs ─────────────────────────────

/**
 * A curved Chinese roof between an outer (eave) polygon and an inner (top) polygon of the same
 * vertex count (use repeated points for a ridge or an apex). The surface sags (凹曲面), the corners
 * turn up (翼角起翘) and flare out; the underside is rafter-dark; tile rows and hips are inked.
 * Polygons are [x, z] in local space, counter-clockwise seen from above; y is absolute.
 */
export function roof(b: Batch, outer: [number, number][], inner: [number, number][], eaveY: number, topY: number, o: { curl?: number; flare?: number; color?: string; under?: string; U?: number; V?: number; rows?: boolean; fascia?: number } = {}): void {
  const U = o.U ?? 10, V = o.V ?? 8;
  const curl = o.curl ?? 0.45, flare = o.flare ?? 0.3;
  const n = outer.length;
  const pos: number[] = [], under: number[] = [], lines: number[] = [];
  const cx = outer.reduce((s, p) => s + p[0], 0) / n, cz = outer.reduce((s, p) => s + p[1], 0) / n;
  const fas = o.fascia ?? 0.14;
  for (let s = 0; s < n; s++) {
    const A = outer[s], B = outer[(s + 1) % n];
    const Ai = inner[s], Bi = inner[(s + 1) % n];
    const grid: number[][] = [];
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      const row: number[] = [];
      for (let i = 0; i <= U; i++) {
        const u = i / U;
        const e = Math.abs(u - 0.5) * 2;
        const e3 = Math.pow(e, 3);
        let ex = lerp(A[0], B[0], u), ez = lerp(A[1], B[1], u);
        // flare the corners outward from the centre
        const ox = ex - cx, oz = ez - cz, ol = Math.hypot(ox, oz) || 1;
        ex += (ox / ol) * flare * e3;
        ez += (oz / ol) * flare * e3;
        const ey = eaveY + curl * Math.pow(e, 2.6);
        const tx = lerp(Ai[0], Bi[0], u), tz = lerp(Ai[1], Bi[1], u);
        const k = Math.pow(v, 1.25);
        const x = lerp(ex, tx, k), z = lerp(ez, tz, k);
        const y = ey + (topY - ey) * Math.pow(v, 1.7);
        row.push(x, y, z);
      }
      grid.push(row);
    }
    const P = (i: number, j: number) => [grid[j][i * 3], grid[j][i * 3 + 1], grid[j][i * 3 + 2]];
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < U; i++) {
        const a = P(i, j), bb = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1);
        // top (CCW from above → normal up/out) and underside (reversed)
        pos.push(...a, ...bb, ...c, ...bb, ...d, ...c);
        under.push(...a, ...c, ...bb, ...bb, ...c, ...d);
      }
    }
    // fascia board: a thin band hanging from the eave
    for (let i = 0; i < U; i++) {
      const a = P(i, 0), bb = P(i + 1, 0);
      const a2 = [a[0], a[1] - fas, a[2]], b2 = [bb[0], bb[1] - fas, bb[2]];
      under.push(...a, ...bb, ...a2, ...bb, ...b2, ...a2);
      under.push(...a, ...a2, ...bb, ...bb, ...a2, ...b2);
      lines.push(...a2, ...b2);
    }
    if (o.rows !== false) {
      for (let i = 1; i < U; i++) {
        if (i % 1) continue;
        for (let j = 0; j < V - 1; j++) {
          const p = P(i, j), q = P(i, j + 1);
          lines.push(p[0], p[1] + 0.012, p[2], q[0], q[1] + 0.012, q[2]);
        }
      }
    }
    for (let j = 0; j < V; j++) {
      const p = P(0, j), q = P(0, j + 1);
      lines.push(p[0], p[1] + 0.02, p[2], q[0], q[1] + 0.02, q[2]);
    }
    for (let i = 0; i < U; i++) {
      const p = P(i, 0), q = P(i + 1, 0);
      lines.push(...p, ...q);
    }
  }
  const top = new TH.BufferGeometry();
  top.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
  top.computeVertexNormals();
  b.add(top, o.color ?? COL.tile, { jitter: 0.06, seed: pos.length });
  const bot = new TH.BufferGeometry();
  bot.setAttribute('position', new TH.Float32BufferAttribute(under, 3));
  bot.computeVertexNormals();
  b.add(bot, o.under ?? COL.woodDark);
  b.segs(lines);
}

/** Rectangle corners (CCW from above), half extents a (x) and c (z). */
export function rect(a: number, c: number): [number, number][] {
  return [[a, c], [a, -c], [-a, -c], [-a, c]];
}
/** Regular polygon corners (CCW from above). */
export function ngon(n: number, r: number, rot = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot - (i / n) * TAU;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}
export function xform(pts: [number, number][], x: number, z: number, ry: number): [number, number][] {
  const c = Math.cos(ry), s = Math.sin(ry);
  // matches Object3D rotation.y: x' = x cos + z sin, z' = -x sin + z cos
  return pts.map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
}

/** A hip roof (庑殿) on a rectangle: ridge along local x. */
export function hipRoof(b: Batch, x: number, z: number, ry: number, a: number, c: number, eaveY: number, rise: number, o: { curl?: number; flare?: number; color?: string; ridge?: boolean } = {}): void {
  const ridge = Math.max(0.05, a - c * 0.9);
  const outer = xform(rect(a, c), x, z, ry);
  const inner = xform([[ridge, 0], [ridge, 0], [-ridge, 0], [-ridge, 0]], x, z, ry);
  roof(b, outer, inner, eaveY, eaveY + rise, { curl: o.curl, flare: o.flare, color: o.color });
  if (o.ridge !== false) {
    // ridge beam with 鸱吻 horns at the ends, sized to the roof
    const k = clamp(c / 2.2, 0.25, 1.4);
    const g = new TH.BoxGeometry(ridge * 2 + 0.3 * k, 0.22 * k, 0.2 * k);
    place(g, x, eaveY + rise + 0.08 * k, z, ry);
    b.add(g, COL.tileDark, { edge: 30 });
    for (const s of [-1, 1]) {
      const hx = x + Math.cos(ry) * s * (ridge + 0.1 * k), hz = z - Math.sin(ry) * s * (ridge + 0.1 * k);
      const horn = new TH.ConeGeometry(0.13 * k, 0.55 * k, 5);
      place(horn, hx, eaveY + rise + 0.36 * k, hz, ry, 1, 1, 1, 0, -s * 0.45);
      b.add(horn, COL.tileDark, { edge: 30 });
    }
  }
}

// ───────────────────────────── organic shapes ─────────────────────────────

/** A tube along pts with a radius per point (tapered), vertex-coloured by height (darker at the foot). */
export function taperTube(pts: T.Vector3[], radii: number[], radial = 6, color: T.ColorRepresentation = COL.woodDark, o: { jitter?: number; seed?: number; cap?: boolean; dark?: T.ColorRepresentation } = {}): BG {
  const n = pts.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new TH.Color(color);
  const dark = new TH.Color(o.dark ?? COL.ink);
  const rng = makeRng(o.seed ?? 1);
  let normal = new TH.Vector3(1, 0, 0);
  const tan = new TH.Vector3(), bin = new TH.Vector3(), tmp = new TH.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[Math.min(n - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
    tan.subVectors(q, pp).normalize();
    if (i === 0) {
      normal = Math.abs(tan.y) < 0.9 ? new TH.Vector3(0, 1, 0).cross(tan).normalize() : new TH.Vector3(1, 0, 0).cross(tan).normalize();
    } else {
      // parallel transport
      tmp.copy(normal);
      normal.sub(tan.clone().multiplyScalar(tmp.dot(tan))).normalize();
    }
    bin.crossVectors(tan, normal).normalize();
    const r = radii[i];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const w = 1 + (o.jitter ?? 0.12) * (rng() - 0.5);
      const nx = normal.x * Math.cos(a) + bin.x * Math.sin(a);
      const ny = normal.y * Math.cos(a) + bin.y * Math.sin(a);
      const nz = normal.z * Math.cos(a) + bin.z * Math.sin(a);
      pos.push(p.x + nx * r * w, p.y + ny * r * w, p.z + nz * r * w);
      // bark: darker on one side (the shadowed flank of a dry-brush stroke) and in streaks
      const streak = 0.78 + 0.3 * rng();
      const side = 0.5 + 0.5 * Math.cos(a + 0.8);
      const c = base.clone().lerp(dark, clamp(0.15 + 0.45 * (1 - side) * streak, 0, 0.9));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k, bb = i * radial + ((k + 1) % radial);
      const c = a + radial, d = bb + radial;
      idx.push(a, c, bb, bb, c, d);
    }
  }
  const g = new TH.BufferGeometry();
  g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new TH.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A Taihu-like rock, vertex coloured with darker crevices (皴). Sits on y = 0. */
export function rockGeometry(seed: number, w: number, hgt: number, o: { detail?: number; base?: string; dark?: string; lean?: number; flat?: number } = {}): BG {
  let g: BG = new TH.IcosahedronGeometry(1, o.detail ?? 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const n = makeNoise2(seed);
  const rng = makeRng(seed);
  const p = g.attributes.position as T.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const base = new TH.Color(o.base ?? '#b9b3a6');
  const dark = new TH.Color(o.dark ?? '#57544e');
  const twist = rng.range(-0.5, 0.5);
  const lean = o.lean ?? 0.2;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const big = n(x * 1.3 + z * 0.8 + 3.1, y * 1.6 - 1.7);
    const fine = n(x * 3.7 - z * 2.1, y * 3.3 + z * 1.9 + 5);
    const r = 1 + 0.3 * big + 0.12 * fine;
    x *= r; y *= r; z *= r;
    const yy = (y + 1) / 2;
    const waist = 1 - 0.22 * Math.sin(yy * Math.PI * 1.1) * (0.5 + 0.5 * n(yy * 3, 9.1));
    const ang = twist * yy;
    const cx = x * Math.cos(ang) - z * Math.sin(ang), cz = x * Math.sin(ang) + z * Math.cos(ang);
    let py = yy * hgt - hgt * 0.1;
    if (o.flat) py = Math.max(py, -hgt * 0.1) * (py > hgt * (1 - o.flat) ? 0.97 : 1);
    p.setXYZ(i, cx * w * 0.5 * waist + yy * yy * w * lean * twist, py, cz * w * 0.45 * waist);
    const cav = Math.max(0, -big * 1.3 - fine * 0.5 + 0.1);
    const c = base.clone().lerp(dark, Math.min(1, cav * 1.2 + (1 - yy) * 0.15));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new TH.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// ───────────────────────────── painting ─────────────────────────────

type Pt = [number, number, number?];

/** Collects brush strokes into a Drawing for the ink engine. */
export class Painter {
  readonly strokes: Stroke[] = [];
  constructor(readonly rng: Rng) {}
  add(kind: StrokeKind, pts: Pt[], tone: number, extra: Partial<Stroke> = {}): void {
    this.strokes.push({ kind, tone, birth: 0, seed: this.rng.int(1, 2 ** 31 - 1), pts: pts.map(([x, y, w]) => ({ x, y, w: w ?? 2 })), ...extra });
  }
  stroke(pts: [number, number][], w0: number, w1: number, tone: number, extra: Partial<Stroke> = {}, kind: StrokeKind = 'brush'): void {
    const n = pts.length;
    this.add(kind, pts.map(([x, y], i) => {
      const k = n > 1 ? i / (n - 1) : 0;
      const w = w0 + (w1 - w0) * k;
      return [x, y, i === 0 ? w * 0.7 : w];
    }), tone, extra);
  }
  /** A bamboo leaf: pointed tip, belly a third of the way, slight droop. */
  leaf(x: number, y: number, ang: number, len: number, w: number, tone: number, extra: Partial<Stroke> = {}): void {
    const c = Math.cos(ang), s = Math.sin(ang);
    const bend = (this.rng() - 0.5) * 0.35;
    this.add('brush', [
      [x, y, w * 0.3],
      [x + c * len * 0.33 - s * len * bend * 0.12, y + s * len * 0.33 + c * len * bend * 0.12, w],
      [x + c * len * 0.7 - s * len * bend * 0.2, y + s * len * 0.7 + c * len * bend * 0.2, w * 0.55],
      [x + c * len, y + s * len, w * 0.08],
    ], tone, { wet: 0.5, ...extra });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 24): Pt[] {
    const out: Pt[] = [];
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  drawing(width: number, height: number, ax = width / 2, ay = height): Drawing {
    return { width, height, anchor: { x: ax, y: ay }, strokes: this.strokes };
  }
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const BRUSH_FONT = '"Ma Shan Zheng", "LXGW WenKai", "KaiTi", "STKaiti", serif';

/** A plaque / signboard: calligraphy on a lacquered board with a thin frame. */
export function plaqueCanvas(text: string, o: { w?: number; h?: number; bg?: string; fg?: string; frame?: string; vertical?: boolean; seal?: boolean; font?: number } = {}): HTMLCanvasElement {
  const W = o.w ?? 256, H = o.h ?? 96;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = o.bg ?? '#2f2620';
  g.fillRect(0, 0, W, H);
  if (o.frame !== '') {
    g.strokeStyle = o.frame ?? '#8c6a3e';
    g.lineWidth = Math.max(3, Math.min(W, H) * 0.05);
    g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
  }
  g.fillStyle = o.fg ?? '#e8d9b0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text];
  if (o.vertical) {
    const fs = o.font ?? Math.min(W * 0.72, (H * 0.86) / chars.length);
    g.font = `${fs}px ${BRUSH_FONT}`;
    chars.forEach((ch, i) => g.fillText(ch, W / 2, H * 0.07 + fs * (i + 0.5)));
  } else {
    const fs = o.font ?? Math.min(H * 0.64, (W * 0.84) / chars.length);
    g.font = `${fs}px ${BRUSH_FONT}`;
    const step = (W * 0.84) / chars.length;
    chars.forEach((ch, i) => g.fillText(ch, W * 0.08 + step * (i + 0.5), H * 0.54));
  }
  if (o.seal) {
    g.fillStyle = COL.cinnabar;
    const s = Math.min(W, H) * 0.12;
    g.fillRect(W * 0.1, H - s * 1.8, s, s);
  }
  return c;
}

/** A stone stele face: columns of calligraphy read right to left, carved dark into pale stone. */
export function steleCanvas(lines: string[], o: { w?: number; h?: number; title?: string } = {}): HTMLCanvasElement {
  const W = o.w ?? 256, H = o.h ?? 512;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#6f6a62';
  g.fillRect(0, 0, W, H);
  const r = makeRng(99);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r.range(0.02, 0.07)})`;
    g.fillRect(r() * W, r() * H, r.range(1, 6), r.range(1, 3));
  }
  g.strokeStyle = 'rgba(20,18,16,0.5)';
  g.lineWidth = 3;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = 'rgba(232,224,206,0.92)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let top = 26;
  if (o.title) {
    g.font = `${W * 0.16}px ${BRUSH_FONT}`;
    [...o.title].forEach((ch, i) => g.fillText(ch, W / 2 + (i - (o.title!.length - 1) / 2) * W * 0.17, 40));
    top = 76;
  }
  const cols = lines.length;
  const colW = (W - 40) / cols;
  const maxLen = Math.max(...lines.map((l) => [...l].length));
  const fs = Math.min(colW * 0.82, (H - top - 30) / maxLen);
  g.font = `${fs}px ${BRUSH_FONT}`;
  lines.forEach((line, ci) => {
    const x = W - 20 - colW * (ci + 0.5);
    [...line].forEach((ch, i) => g.fillText(ch, x, top + fs * (i + 0.5)));
  });
  return c;
}

/** A soft radial glow (white). */
export function glowCanvas(size = 64, falloff = 1): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25 * falloff, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** A soft ink-wash puff (smoke, mist, spray). */
export function puffCanvas(size = 64, seed = 5): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const r = makeRng(seed);
  for (let i = 0; i < 7; i++) {
    const x = size / 2 + r.range(-0.14, 0.14) * size, y = size / 2 + r.range(-0.14, 0.14) * size, rr = size * r.range(0.22, 0.42);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

// ───────────────────────────── instanced foliage ─────────────────────────────

/**
 * Unlit painted cards with alpha test that sway in the vertex shader (per-instance phase), and an
 * optional 2×2 texture atlas chosen per instance (attribute aCell).
 */
export function swayCards(h: Hill, tex: T.Texture, o: { amp?: number; atlas?: boolean; alphaTest?: number; key?: string; speed?: number } = {}): T.MeshBasicMaterial {
  const m = h.own(new TH.MeshBasicMaterial({ map: tex, alphaTest: o.alphaTest ?? 0.4, side: TH.DoubleSide }));
  const amp = h.reduced ? 0 : (o.amp ?? 0.08);
  const speed = o.speed ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = h.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${o.atlas ? 'attribute vec2 aCell;' : ''}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${o.atlas ? '#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + aCell * 0.5;\n#endif' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.37 + ip.z * 0.53 + ip.y * 0.2;
        float sw = sin(uTime * ${(1.1 * speed).toFixed(3)} + ph) + 0.45 * sin(uTime * ${(2.3 * speed).toFixed(3)} + ph * 1.7);
        float k = ${amp.toFixed(3)} * (0.4 + position.y);
        transformed.x += sw * k;
        transformed.z += cos(uTime * ${(0.9 * speed).toFixed(3)} + ph) * k * 0.6;`);
  };
  m.customProgramCacheKey = () => `hill-sway${o.key ?? ''}${amp}${o.atlas ? 'a' : ''}${speed}`;
  return m;
}

/** Keep a mesh's paper-lit material in step with the day/night light. */
export function lit(h: Hill, mat: { color: T.Color }, base: T.ColorRepresentation = '#ffffff'): void {
  const c = new TH.Color(base);
  h.frame(() => { mat.color.copy(c).multiply(h.paper); });
}

// ───────────────────────────── layout ─────────────────────────────

export function polyDist(pts: XZ[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L, 0, 1);
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/** Distance to the nearest world path (map.ts PATHS). */
export function pathDist(x: number, z: number): number {
  let best = Infinity;
  for (const p of PATHS) best = Math.min(best, polyDist(p, x, z));
  return best;
}

/** Point along a polyline at arc-length fraction t. */
export function along(pts: XZ[], t: number): XZ & { dir: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); lens.push(l); total += l; }
  let d = clamp(t, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? d / lens[i] : 0;
      const a = pts[i], b = pts[i + 1];
      return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), dir: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    d -= lens[i];
  }
  return { ...pts[0], dir: 0 };
}

/** A smooth winding path through control points (Catmull-Rom), sampled every `step` m. */
export function wind(ctrl: XZ[], step = 1): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** Count the triangles and draw calls under an object (for the perf report). */
export function stats(o: T.Object3D): { draws: number; tris: number } {
  let draws = 0, tris = 0;
  o.traverse((c) => {
    const m = c as T.Mesh;
    if (!m.geometry || !c.visible) return;
    const g = m.geometry;
    const count = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    const inst = (m as unknown as T.InstancedMesh).isInstancedMesh ? (m as unknown as T.InstancedMesh).count : 1;
    draws++;
    if ((m as T.Mesh).isMesh) tris += Math.floor(count / 3) * inst;
  });
  return { draws, tris };
}

// ───────────────────────────── wind & particles ─────────────────────────────

/**
 * GLSL replacing <project_vertex>: after instancing, push the vertex downwind in world space by a
 * slow travelling gust, growing with height above baseY (so a culm and its leaves sway together).
 * Needs `uniform float uTime;`.
 */
export function windProject(amp: number, baseY: number, span: number): string {
  const f = (v: number) => v.toFixed(3);
  return `vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  {
    float hk = clamp((mvPosition.y - ${f(baseY)}) / ${f(span)}, 0.0, 1.6);
    float ww = sin(uTime * 0.8 + mvPosition.x * 0.11 + mvPosition.z * 0.07) * 0.7 + sin(uTime * 1.9 + mvPosition.x * 0.37 - mvPosition.z * 0.29) * 0.3;
    mvPosition.xz += vec2(1.0, 0.45) * (ww + 0.35) * ${f(amp)} * hk * hk;
  }
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`;
}

/** Instanced unlit cards (alpha-tested painted texture) that sway with the world wind. */
export function windCards(h: Hill, tex: T.Texture, o: { amp: number; baseY: number; span: number; atlas?: boolean; alphaTest?: number; key?: string }): T.MeshBasicMaterial {
  const m = h.own(new TH.MeshBasicMaterial({ map: tex, alphaTest: o.alphaTest ?? 0.4, side: TH.DoubleSide }));
  const amp = h.reduced ? 0 : o.amp;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = h.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${o.atlas ? 'attribute vec2 aCell;' : ''}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${o.atlas ? '#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + aCell * 0.5;\n#endif' : ''}`)
      .replace('#include <project_vertex>', windProject(amp, o.baseY, o.span));
  };
  m.customProgramCacheKey = () => `hill-wind${o.key ?? ''}${amp},${o.baseY},${o.span}${o.atlas ? 'a' : ''}`;
  return m;
}

export interface ParticleOpts {
  count: number;
  /** Emitters: each particle is born at one of these points plus a random offset in `spread`. */
  at: T.Vector3[];
  spread: [number, number, number];
  /** Velocity (m/s) over its life. */
  vel: [number, number, number];
  /** Random extra velocity per particle (± each axis). */
  velJitter?: [number, number, number];
  gravity?: number;
  life: number;
  size: number;
  /** Size multiplier reached at the end of life. */
  grow?: number;
  color: T.ColorRepresentation;
  opacity: number;
  tex: T.Texture;
  additive?: boolean;
  /** Side-to-side flutter amplitude (m). */
  wobble?: number;
  /** Tumble the sprite (petals). */
  spin?: boolean;
  fog?: boolean;
  seed?: number;
  /** Colour variation per particle: pick from these. */
  colors?: T.ColorRepresentation[];
}

/** A GPU particle stream: Points whose motion is a pure function of time (one draw, no CPU per frame). */
export function particles(h: Hill, o: ParticleOpts): T.Points {
  const rng = makeRng(o.seed ?? 11);
  const n = o.count;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n), off = new Float32Array(n * 3), vj = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const palette = (o.colors ?? [o.color]).map((c) => new TH.Color(c));
  const vjit = o.velJitter ?? [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = o.at[i % o.at.length];
    pos[i * 3] = a.x; pos[i * 3 + 1] = a.y; pos[i * 3 + 2] = a.z;
    seed[i] = rng();
    off[i * 3] = (rng() - 0.5) * 2 * o.spread[0];
    off[i * 3 + 1] = (rng() - 0.5) * 2 * o.spread[1];
    off[i * 3 + 2] = (rng() - 0.5) * 2 * o.spread[2];
    vj[i * 3] = (rng() - 0.5) * 2 * vjit[0];
    vj[i * 3 + 1] = (rng() - 0.5) * 2 * vjit[1];
    vj[i * 3 + 2] = (rng() - 0.5) * 2 * vjit[2];
    const c = palette[Math.floor(rng() * palette.length)];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new TH.BufferGeometry();
  g.setAttribute('position', new TH.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new TH.BufferAttribute(seed, 1));
  g.setAttribute('aOff', new TH.BufferAttribute(off, 3));
  g.setAttribute('aVj', new TH.BufferAttribute(vj, 3));
  g.setAttribute('color', new TH.BufferAttribute(col, 3));
  const m = h.own(new TH.PointsMaterial({
    size: o.size, map: o.tex, color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, opacity: o.opacity,
    blending: o.additive ? TH.AdditiveBlending : TH.NormalBlending, fog: o.fog ?? true, sizeAttenuation: true,
  }));
  const f = (v: number) => v.toFixed(4);
  const [vx, vy, vz] = o.vel;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = h.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; attribute float aSeed; attribute vec3 aOff; attribute vec3 aVj;
        varying float vFade; varying float vAng; varying float vFlip;`)
      .replace('#include <begin_vertex>', `
        float ph = fract(uTime / ${f(o.life)} + aSeed);
        float age = ph * ${f(o.life)};
        vec3 transformed = position + aOff + (vec3(${f(vx)}, ${f(vy)}, ${f(vz)}) + aVj) * age;
        transformed.y -= 0.5 * ${f(o.gravity ?? 0)} * age * age;
        float wb = ${f(o.wobble ?? 0)};
        transformed.x += sin(uTime * 1.3 + aSeed * 40.0) * wb * ph;
        transformed.z += cos(uTime * 1.1 + aSeed * 23.0) * wb * ph;
        vFade = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.62, 1.0, ph));
        vAng = uTime * (1.0 + aSeed * 2.0) + aSeed * 6.28;
        vFlip = 0.35 + 0.65 * abs(cos(uTime * (0.8 + aSeed) + aSeed * 9.0));`)
      .replace('gl_PointSize = size;', `gl_PointSize = size * (1.0 + ph * ${f((o.grow ?? 1) - 1)});`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade; varying float vAng; varying float vFlip;')
      .replace('#include <map_particle_fragment>', o.spin ? `
        #if defined( USE_MAP )
          vec2 pc = gl_PointCoord - 0.5;
          float ca = cos(vAng), sa = sin(vAng);
          pc = vec2(ca * pc.x - sa * pc.y, sa * pc.x + ca * pc.y);
          pc.x /= vFlip;
          vec2 uv = pc + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0) discard;
          diffuseColor *= texture2D( map, vec2(uv.x, 1.0 - uv.y) );
        #endif` : '#include <map_particle_fragment>')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.a *= vFade;');
  };
  const key = `hill-particles${o.spin ? 's' : ''}:${[o.life, vx, vy, vz, o.gravity ?? 0, o.wobble ?? 0, o.grow ?? 1].join(',')}`;
  m.customProgramCacheKey = () => key;
  const p = new TH.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 3;
  return p;
}

/**
 * Camera-facing soft cards merged into one mesh (mist banks, spray): each quad keeps its centre in
 * an attribute and turns to the camera in the vertex shader. `drift` slides them slowly sideways.
 */
export function mistCards(h: Hill, items: { p: T.Vector3; w: number; h: number }[], o: { tex: T.Texture; color: T.ColorRepresentation; opacity: number; drift?: number; additive?: boolean; fog?: boolean; key?: string }): T.Mesh {
  const pos: number[] = [], uv: number[] = [], ctr: number[] = [], idx: number[] = [], sd: number[] = [];
  const rng = makeRng(items.length * 7 + 1);
  items.forEach((it, i) => {
    const s = rng();
    for (const [cx, cy, u, v] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]]) {
      pos.push(cx * it.w, cy * it.h, 0);
      uv.push(u, v);
      ctr.push(it.p.x, it.p.y, it.p.z);
      sd.push(s);
    }
    const b0 = i * 4;
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  });
  const g = new TH.BufferGeometry();
  g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new TH.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCenter', new TH.Float32BufferAttribute(ctr, 3));
  g.setAttribute('aSeed', new TH.Float32BufferAttribute(sd, 1));
  g.setIndex(idx);
  const m = h.own(new TH.MeshBasicMaterial({ map: o.tex, color: o.color, transparent: true, opacity: o.opacity, depthWrite: false, fog: o.fog ?? true, blending: o.additive ? TH.AdditiveBlending : TH.NormalBlending }));
  const drift = h.reduced ? 0 : (o.drift ?? 0.3);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = h.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute vec3 aCenter; attribute float aSeed;')
      .replace('#include <project_vertex>', `
        vec3 c = aCenter + vec3(sin(uTime * 0.05 + aSeed * 30.0), 0.0, cos(uTime * 0.04 + aSeed * 17.0)) * ${drift.toFixed(3)} * 4.0;
        vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
        mvPosition.xy += transformed.xy;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => `hill-mist${drift}`;
  const mesh = new TH.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

/**
 * Stone steps that follow the ground along a polyline: level slabs every `run` metres, each seated
 * into the slope, so the risers come out of the terrain itself. `endTop` lifts the last steps to
 * meet a platform. Every slab is registered as a walkable deck at the height it is drawn, and no
 * riser is taller than a walker's step (STEP_UP in world/player.ts).
 */
export function stepPath(b: Batch, h: Hill, pts: XZ[], o: { width?: number; run?: number; color?: string; seed?: number; endTop?: number; startTop?: number } = {}): void {
  const rng = makeRng(o.seed ?? 5);
  const width = o.width ?? 1.6, run = o.run ?? 0.5;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const n = Math.max(1, Math.round(total / run));
  const tops: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = along(pts, (i + 0.5) / n);
    tops.push(h.y(p.x, p.z) + 0.1);
  }
  // meet the platform: ramp the last metres up to endTop
  if (o.endTop !== undefined) {
    const k = Math.min(n, Math.ceil(Math.max(0, o.endTop - tops[n - 1]) / 0.16) + 2);
    for (let i = 0; i < k; i++) {
      const j = n - 1 - i;
      tops[j] = Math.max(tops[j], lerp(o.endTop, tops[Math.max(0, n - 1 - k)], i / k));
    }
  }
  if (o.startTop !== undefined) {
    const k = Math.min(n, Math.ceil(Math.max(0, o.startTop - tops[0]) / 0.16) + 2);
    for (let i = 0; i < k; i++) tops[i] = Math.max(tops[i], lerp(o.startTop, tops[Math.min(n - 1, k)], i / k));
  }
  // where the slope is steep, lift the lower slab so no riser is taller than one stride
  const MAX_RISE = 0.3;
  for (let i = n - 2; i >= 0; i--) tops[i] = Math.max(tops[i], tops[i + 1] - MAX_RISE);
  for (let i = 1; i < n; i++) tops[i] = Math.max(tops[i], tops[i - 1] - MAX_RISE);
  // steps are level and never climb less than a few cm (else they read as paving)
  const L = total / n;
  for (let i = 0; i < n; i++) {
    const p = along(pts, (i + 0.5) / n);
    const g = h.y(p.x, p.z);
    const lo = Math.min(g, tops[i]) - 0.45;
    const H = tops[i] - lo;
    const col = new TH.Color(o.color ?? COL.stone).multiplyScalar(rng.range(0.88, 1.05));
    b.add(place(new TH.BoxGeometry(width + rng.range(-0.1, 0.1), H, run * 1.02), p.x + rng.range(-0.04, 0.04), lo + H / 2, p.z, p.dir + rng.range(-0.03, 0.03)), col, { edge: 40 });
    // the slab's tread, a hair longer so neighbours meet without a gap
    const ux = Math.sin(p.dir) * (L / 2 + 0.02), uz = Math.cos(p.dir) * (L / 2 + 0.02);
    h.deck(segmentDeck(`${h.id}:steps${o.seed ?? 5}:${i}`, { x: p.x - ux, z: p.z - uz }, { x: p.x + ux, z: p.z + uz }, width / 2 - 0.05, tops[i]));
  }
}
