// Small shared toolkit for world features: lifetime bookkeeping, ink-palette materials, canvas
// textures, placement on the land, and proximity. Runtime three.js objects come from ctx.THREE.
import type * as T from 'three';
import type { Interactable, WorldCtx, WorldFeature } from '../types';
import { activeHabits } from '../../../app/store';
import { hashString, makeRng, type Rng } from '../../../core/rng';

export type Three = WorldCtx['THREE'];

export function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const tr = (ctx: WorldCtx, zh: string, en: string) => (ctx.lang === 'zh' ? zh : en);

/** A generator of this feature's own, seeded from the day: the same garden all day long. */
export function dayRng(ctx: WorldCtx, salt: string): Rng {
  const d = ctx.env.date;
  return makeRng(hashString(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}:${salt}`));
}

// ───────────────────────────── lifetime ─────────────────────────────

/** Everything a feature adds, so dispose() can take it all back. */
export class Bag {
  private offs: (() => void)[] = [];
  private roots: T.Object3D[] = [];
  private owned = new Set<{ dispose(): void }>();
  private counters = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  disposed = false;

  constructor(readonly ctx: WorldCtx) {}

  /** Add to the scene (or a parent) and remember it for disposal. */
  add<O extends T.Object3D>(o: O, parent?: T.Object3D): O {
    (parent ?? this.ctx.scene).add(o);
    this.roots.push(o);
    return o;
  }
  /** Something with dispose() that is not reachable from a scene object (a shared texture…). */
  own<D extends { dispose(): void }>(d: D): D {
    this.owned.add(d);
    return d;
  }
  frame(fn: (dt: number, t: number) => void): void {
    if (import.meta.env.DEV) {
      // DEV: window.__walkFeatureMs — a running average of all features' per-frame work
      const w = window as unknown as { __walkFeatureMs?: { ms: number; acc: number; last: number } };
      const stat = (w.__walkFeatureMs ??= { ms: 0, acc: 0, last: 0 });
      const inner = fn;
      fn = (dt, t) => {
        const t0 = performance.now();
        inner(dt, t);
        const now = performance.now();
        if (now - stat.last > 4) { stat.ms = stat.ms * 0.95 + stat.acc * 0.05; stat.acc = 0; stat.last = now; }
        stat.acc += now - t0;
      };
    }
    this.offs.push(this.ctx.onFrame(fn));
  }
  interact(i: Interactable): () => void {
    let off: (() => void) | null = this.ctx.addInteractable(i);
    if (import.meta.env.DEV) devList().set(i.id, i);
    const once = () => { off?.(); off = null; if (import.meta.env.DEV) devList().delete(i.id); };
    this.offs.push(once);
    return once;
  }
  counter(id: string, label: { zh: string; en: string }, value: string): void {
    this.counters.add(id);
    this.ctx.hud.setCounter(id, label, value);
  }
  later(ms: number, fn: () => void): void {
    const h = setTimeout(() => { this.timers.delete(h); if (!this.disposed) fn(); }, ms);
    this.timers.add(h);
  }
  onDispose(fn: () => void): void {
    this.offs.push(fn);
  }
  /** Remove and free one object that was added with add(). */
  drop(o: T.Object3D): void {
    const i = this.roots.indexOf(o);
    if (i >= 0) this.roots.splice(i, 1);
    o.removeFromParent();
    freeTree(o);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const h of this.timers) clearTimeout(h);
    this.timers.clear();
    for (const f of this.offs.splice(0).reverse()) {
      try { f(); } catch (e) { console.warn('[walk] dispose', e); }
    }
    for (const id of this.counters) this.ctx.hud.setCounter(id, null);
    const seen = new Set<unknown>();
    for (const r of this.roots.splice(0)) {
      r.removeFromParent();
      freeTree(r, seen);
    }
    for (const d of this.owned) if (!seen.has(d)) d.dispose();
    this.owned.clear();
  }
}

type Disposable = { dispose(): void };

/** DEV only: every live feature interactable, for scripted tests (window.__walkFeatures). */
function devList(): Map<string, Interactable> {
  const w = window as unknown as { __walkFeatures?: Map<string, Interactable> };
  return (w.__walkFeatures ??= new Map());
}

function freeMaterial(m: T.Material, seen: Set<unknown>) {
  if (seen.has(m)) return;
  seen.add(m);
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v && typeof v === 'object' && (v as { isTexture?: boolean }).isTexture && !seen.has(v)) {
      seen.add(v);
      (v as Disposable).dispose();
    }
  }
  const u = (m as T.ShaderMaterial).uniforms;
  if (u) for (const k in u) {
    const v = u[k]?.value as { isTexture?: boolean } | undefined;
    if (v && v.isTexture && !seen.has(v)) { seen.add(v); (v as unknown as Disposable).dispose(); }
  }
  m.dispose();
}

export function freeTree(root: T.Object3D, seen = new Set<unknown>()): void {
  root.traverse((o) => {
    const mesh = o as T.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const mat = mesh.material as T.Material | T.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => freeMaterial(m, seen));
    else if (mat) freeMaterial(mat, seen);
    const inst = o as T.InstancedMesh;
    if (inst.isInstancedMesh && !seen.has(inst)) { seen.add(inst); inst.dispose(); }
  });
}

/** A feature whose whole lifetime lives in one Bag. `build` may be async (fonts). */
export function feature(id: string, build: (bag: Bag, ctx: WorldCtx) => void | Promise<void>): WorldFeature {
  let bag: Bag | null = null;
  return {
    id,
    async init(ctx) {
      bag?.dispose();
      const b = new Bag(ctx);
      bag = b;
      try {
        await build(b, ctx);
      } catch (e) {
        console.warn(`[walk] feature ${id} failed`, e);
        b.dispose();
      }
    },
    dispose() {
      bag?.dispose();
      bag = null;
    },
  };
}

// ───────────────────────────── colour & materials ─────────────────────────────

/** Mix two CSS colours; t = 0 → a. */
export function mix(THREE: Three, a: string, b: string, t: number): T.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** Flat-shaded, matte material — the default look of every little thing in the garden. */
export function flat(THREE: Three, color: T.ColorRepresentation, o: Partial<T.MeshLambertMaterialParameters> = {}): T.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
}

/** Unlit, for things that glow (lantern paper at night, the moon path, fireflies). */
export function glowMat(THREE: Three, color: T.ColorRepresentation, opacity = 1): T.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
}

// ───────────────────────────── canvas textures ─────────────────────────────

export function canvasTexture(THREE: Three, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): T.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A soft round glow (white → transparent) for sprites and points; tint it with the material colour. */
export function glowTexture(THREE: Three, size = 64, hard = 0.15): T.CanvasTexture {
  return canvasTexture(THREE, size, size, (g, w) => {
    const r = w / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(hard, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
}

export const BRUSH_FONT = '"Ma Shan Zheng", "LXGW WenKai", "STKaiti", "KaiTi", serif';
export const TEXT_FONT = '"LXGW WenKai", "STKaiti", "KaiTi", serif';

/** Wait (briefly) for the brush face to hold these characters, so canvas text is brushed, not a fallback. */
export async function loadBrush(chars: string): Promise<void> {
  try {
    if (!document.fonts?.load) return;
    await Promise.race([
      Promise.all([document.fonts.load(`64px "Ma Shan Zheng"`, chars), document.fonts.load(`64px "LXGW WenKai"`, chars)]),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
  } catch { /* fall back to whatever is there */ }
}

// ───────────────────────────── placement ─────────────────────────────

export interface Spot { x: number; z: number; r: number }

const occupied = new WeakMap<WorldCtx, Spot[]>();
const arrival = new WeakMap<WorldCtx, { x: number; z: number; dx: number; dz: number; d: number }>();

/**
 * Places claimed by features (and landmarks) in this world, so props do not pile on each other.
 * The way in — from where the visitor arrives to the pond — is kept clear.
 */
export function claims(ctx: WorldCtx): Spot[] {
  let list = occupied.get(ctx);
  if (!list) {
    list = [];
    occupied.set(ctx, list);
    for (const l of landmarks(ctx)) list.push({ x: l.position.x, z: l.position.z, r: l.radius + (l.kind === 'plant' ? 1.3 : 0.3) }); // plants keep their name tablets clear
    const a = entry(ctx);
    for (let s = 0; s < a.d; s += 1.4) list.push({ x: a.x - a.dx * s, z: a.z - a.dz * s, r: 1.1 });
  }
  return list;
}

/** Where the visitor arrived (the player's position when features start) and the way to the pond. */
export function entry(ctx: WorldCtx): { x: number; z: number; dx: number; dz: number; d: number } {
  let a = arrival.get(ctx);
  if (!a) {
    const p = ctx.player.position, c = ctx.pond.center;
    const d = Math.hypot(p.x - c.x, p.z - c.z) || 1;
    a = { x: p.x, z: p.z, dx: (p.x - c.x) / d, dz: (p.z - c.z) / d, d };
    arrival.set(ctx, a);
  }
  return a;
}

/** Normalised elliptic distance from the pond centre (1 = the shoreline). */
export function pondDist(ctx: WorldCtx, x: number, z: number, margin = 0): number {
  const p = ctx.pond;
  const dx = (x - p.center.x) / (p.radiusX + margin);
  const dz = (z - p.center.z) / (p.radiusZ + margin);
  return Math.sqrt(dx * dx + dz * dz);
}

export interface FindOpts {
  /** Distance from the garden centre (0,0). */
  minR?: number;
  maxR?: number;
  /** Keep at least this far (m) outside the shoreline. */
  pondMargin?: number;
  /** Keep this clear radius around the spot (and claim it). */
  clear?: number;
  /** Search near this point instead of the whole garden. */
  near?: { x: number; z: number; r: number; min?: number };
  /** Do not claim the spot. */
  noClaim?: boolean;
  tries?: number;
}

/** A random walkable spot on land (ground-height y), clear of other features. */
export function findSpot(ctx: WorldCtx, rng: () => number, o: FindOpts = {}): T.Vector3 {
  const { THREE } = ctx;
  const R = ctx.bounds.radius;
  const minR = o.minR ?? 0, maxR = Math.min(o.maxR ?? R * 0.82, R * 0.92);
  const clear = o.clear ?? 1;
  const margin = o.pondMargin ?? 1.2;
  const list = claims(ctx);
  let best: { x: number; z: number; score: number } | null = null;
  const tries = o.tries ?? 80;
  for (let i = 0; i < tries; i++) {
    let x: number, z: number;
    if (o.near) {
      const a = rng() * Math.PI * 2, d = (o.near.min ?? 0) + rng() * (o.near.r - (o.near.min ?? 0));
      x = o.near.x + Math.cos(a) * d;
      z = o.near.z + Math.sin(a) * d;
    } else {
      const a = rng() * Math.PI * 2, d = Math.sqrt(minR * minR + rng() * (maxR * maxR - minR * minR));
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
    }
    if (!ctx.isWalkable(x, z)) continue;
    if (pondDist(ctx, x, z, margin) < 1) continue;
    if (Math.hypot(x, z) > R * 0.94) continue;
    // stay on the garden side of the way in (a gate usually stands between the arrival and the pond)
    const a = entry(ctx);
    if ((x - ctx.pond.center.x) * a.dx + (z - ctx.pond.center.z) * a.dz > a.d * 0.7) continue;
    // the whole footprint on open ground
    let open = true;
    for (let k = 0; k < 6 && open; k++) {
      const ang = (k / 6) * Math.PI * 2;
      if (!ctx.isWalkable(x + Math.cos(ang) * clear * 0.75, z + Math.sin(ang) * clear * 0.75)) open = false;
    }
    if (!open) continue;
    let crowd = Infinity;
    for (const s of list) crowd = Math.min(crowd, Math.hypot(s.x - x, s.z - z) - s.r - clear);
    if (crowd >= 0) { best = { x, z, score: crowd }; break; }
    if (!best || crowd > best.score) best = { x, z, score: crowd };
  }
  const p = best ?? { x: 0, z: R * 0.5 };
  if (!o.noClaim) list.push({ x: p.x, z: p.z, r: clear });
  return new THREE.Vector3(p.x, ctx.groundY(p.x, p.z), p.z);
}

/** A point on the shore at angle a (radians), `out` metres outside the waterline. */
export function shorePoint(ctx: WorldCtx, a: number, out: number): T.Vector3 {
  const p = ctx.pond;
  const x = p.center.x + Math.cos(a) * (p.radiusX + out);
  const z = p.center.z + Math.sin(a) * (p.radiusZ + out);
  return new ctx.THREE.Vector3(x, ctx.groundY(x, z), z);
}

export const distXZ = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// ───────────────────────────── landmarks ─────────────────────────────

export interface Landmark {
  kind: string;
  position: T.Vector3;
  radius: number;
  object: T.Object3D;
  /** For plants: the habit, its name and plant kind (from the core's tags, or the store). */
  habitId?: string;
  habitName?: string;
  plant?: string;
}

const landmarkCache = new WeakMap<WorldCtx, Landmark[]>();

/**
 * Things the core built that features like to sit next to (plants, pavilion, bridge, rocks…).
 * Not part of the contract: read from `userData.landmark` / `userData.habitId` / object names when
 * the core tags them, and simply empty otherwise.
 */
export function landmarks(ctx: WorldCtx): Landmark[] {
  const hit = landmarkCache.get(ctx);
  if (hit) return hit;
  const out: Landmark[] = [];
  const { THREE } = ctx;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const habits = activeHabits.value;
  ctx.scene.traverse((o) => {
    const ud = o.userData ?? {};
    let kind: string | undefined = typeof ud.landmark === 'string' ? ud.landmark : undefined;
    if (!kind && typeof ud.habitId === 'string') kind = 'plant';
    let key: string | undefined;
    if (!kind && /^plant:/.test(o.name || '')) { kind = 'plant'; key = o.name.slice(6); }
    if (!kind) {
      const n = (o.name || '').toLowerCase();
      const m = /^(plant|pavilion|bridge|rock|gate|moongate|table|bench|stone|path|tree|shrine)\b/.exec(n);
      if (m) kind = m[1] === 'moongate' ? 'gate' : m[1];
    }
    if (!kind) return;
    const pos = new THREE.Vector3();
    o.getWorldPosition(pos);
    box.setFromObject(o);
    let radius = 1;
    if (!box.isEmpty()) {
      box.getSize(size);
      radius = Math.max(0.4, Math.min(6, Math.max(size.x, size.z) / 2));
    }
    const habitId = typeof ud.habitId === 'string' ? ud.habitId : key;
    const habit = habitId ? habits.find((h) => h.id === habitId) : undefined;
    out.push({
      kind, position: pos, radius, object: o, habitId,
      habitName: habit?.name,
      plant: typeof ud.plant === 'string' ? ud.plant : typeof ud.plantKind === 'string' ? ud.plantKind : habit?.plant,
    });
  });
  landmarkCache.set(ctx, out);
  return out;
}

// ───────────────────────────── maths ─────────────────────────────

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeInOut = (t: number) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** A one-shot tween driven by the world clock; returns a cancel function. */
export function tween(bag: Bag, ms: number, step: (k: number) => void, done?: () => void): () => void {
  let t = 0;
  let off: (() => void) | null = bag.ctx.onFrame((dt) => {
    t += dt * 1000;
    const k = Math.min(1, t / ms);
    step(k);
    if (k >= 1) { off?.(); off = null; done?.(); }
  });
  bag.onDispose(() => { off?.(); off = null; });
  return () => { off?.(); off = null; };
}
