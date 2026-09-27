// 水月幻镜 · shared helpers for engine/content: geometry, the player's hit tests, damage scaling from
// a boss's home-wave numbers, per-wave shared state, arena points and a tiny coroutine runner (a
// pattern or a skill is a generator that yields the seconds to wait; `yield 0` resumes next step).
import type { BossId, MapId, MonsterId } from '../../ids';
import type { Bilingual, SfxName, TeleShape, Vec, WorldApi } from '../../types';
import { BOSSES } from '../../data';
import { dmgMul } from '../../logic/formulas';
import { core } from './bridge';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const b = (zh: string, en: string): Bilingual => ({ zh, en });

export function angDiff(a: number, c: number): number {
  let d = (a - c) % TAU;
  if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU;
  return d;
}
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, c: number, k: number) => a + (c - a) * k;

// ─────────────────────────────────────────────── the player and shapes

/** Is the player (hitbox included) inside this telegraph shape? Rings honour their gaps. */
export function playerIn(w: WorldApi, s: TeleShape, pad = 0): boolean {
  const p = w.player, pr = p.r + pad;
  const dx = p.x - s.x, dy = p.y - s.y;
  switch (s.kind) {
    case 'circle': return dx * dx + dy * dy <= (s.r + pr) * (s.r + pr);
    case 'ring': {
      const d = Math.hypot(dx, dy), r0 = Math.min(s.r, s.r2), r1 = Math.max(s.r, s.r2);
      if (d < r0 - pr || d > r1 + pr) return false;
      return !inGap(Math.atan2(dy, dx), s.gaps, d > 1 ? Math.asin(Math.min(1, p.r / d)) : 0);
    }
    case 'line': {
      const ex = s.x + Math.cos(s.dir) * s.len, ey = s.y + Math.sin(s.dir) * s.len;
      return segDist2(p.x, p.y, s.x, s.y, ex, ey) <= (s.w / 2 + pr) * (s.w / 2 + pr);
    }
    case 'cone': {
      const d2 = dx * dx + dy * dy;
      if (d2 > (s.r + pr) * (s.r + pr)) return false;
      if (d2 < pr * pr) return true;
      const half = (s.deg / 2) * DEG + Math.asin(Math.min(1, pr / Math.sqrt(d2)));
      return Math.abs(angDiff(Math.atan2(dy, dx), s.dir)) <= half;
    }
    case 'fan': return false;
  }
}
/** Is angle a inside one of the gaps (each { at, w } in radians), with a little slack? */
export function inGap(a: number, gaps: readonly { at: number; w: number }[] | undefined, slack = 0): boolean {
  if (!gaps) return false;
  for (const g of gaps) if (Math.abs(angDiff(a, g.at)) <= g.w / 2 - slack) return true;
  return false;
}
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const toPlayer = (w: WorldApi, x: number, y: number) => Math.atan2(w.player.y - y, w.player.x - x);

// ─────────────────────────────────────────────── damage to the player

/**
 * A content hit on the player of `n` final damage (dodge, armour and i-frames apply unless flagged).
 * 嫦娥's moon pool takes 30% off hits from attackers standing in it.
 */
export function hurtPlayer(w: WorldApi, n: number, src: string, o: { undodgeable?: boolean; noArmor?: boolean; from?: Vec } = {}): void {
  let d = n;
  if (o.from) d *= poolFactor(w, o.from.x, o.from.y);
  if (d <= 0) return;
  w.hurt(d, { undodgeable: o.undodgeable, noArmor: o.noArmor, src });
}
/** 广寒清辉: enemies inside a moon pool deal −30%. */
export function poolFactor(w: WorldApi, x: number, y: number): number {
  const sh = shared(w);
  for (const p of sh.pools) if (p.until > w.t && (x - p.x) ** 2 + (y - p.y) ** 2 <= p.r * p.r) return 1 - p.dr;
  return 1;
}
/**
 * Scale from a boss's home-wave 照影 numbers to this wave: DMG(w) × diff × vows × 劫 over DMG(home).
 * Endless bosses keep their own home (a wave-10 boss at wave 40 hits like wave 40, not like wave 10).
 */
export function homeScale(w: WorldApi, home: number): number {
  return core(w).plan.dmgX / Math.max(1e-6, dmgMul(home));
}
/** A ShotSpec's `dmg` is multiplied by the plan's dmgX in the core: pass home numbers through this. */
export function shotDmg(home: number, d: number): number { return d / Math.max(1e-6, dmgMul(home)); }

// ─────────────────────────────────────────────── the arena

/** The inscribed radius of the arena (the rim a boss circles). */
export function rimR(w: WorldApi): number {
  const s = w.arena.shape;
  return s.kind === 'circle' ? s.r : s.kind === 'rect' ? Math.min(s.w, s.h) / 2 : s.r * Math.cos(Math.PI / 8);
}
/** A random open point in the arena at least `m` from the rim and obstacles, optionally near (x, y). */
export function openPoint(w: WorldApi, m: number, near?: Vec, spread = 300): Vec {
  const A = w.arena;
  for (let k = 0; k < 24; k++) {
    const x = near ? near.x + (w.rng() * 2 - 1) * spread : A.minX + (A.maxX - A.minX) * w.rng();
    const y = near ? near.y + (w.rng() * 2 - 1) * spread : A.minY + (A.maxY - A.minY) * w.rng();
    if (w.inArena(x, y, m)) return { x, y };
  }
  return w.clampToArena({ x: near?.x ?? 0, y: near?.y ?? 0 }, m);
}
/**
 * Where a ray from (x, y) along (dx, dy) leaves the open arena (rim or obstacle), keeping r clear,
 * and the reflected direction there. Used by the ricochets (巨鳌, 刑天's shield charge).
 */
export function rayToWall(w: WorldApi, x: number, y: number, dx: number, dy: number, r: number, obstacles = true): { x: number; y: number; nx: number; ny: number; len: number } {
  const L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  const ok = (px: number, py: number) => obstacles ? w.inArena(px, py, r) : insideArena(w, px, py, r);
  let lo = 0, hi = 0;
  for (let s = 20; s < 4000; s += 20) { if (!ok(x + dx * s, y + dy * s)) { hi = s; break; } lo = s; }
  if (!hi) hi = lo + 20;
  for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (ok(x + dx * m, y + dy * m)) lo = m; else hi = m; }
  const hx = x + dx * lo, hy = y + dy * lo;
  // the surface normal: the nearest obstacle or the rim, measured from just past the hit
  let nx = 0, ny = 0;
  const qx = x + dx * hi, qy = y + dy * hi;
  let obst = false;
  if (obstacles) for (const o of w.arena.obstacles) {
    const d = Math.hypot(qx - o.x, qy - o.y);
    if (d < o.r + r + 1) { nx = (qx - o.x) / (d || 1); ny = (qy - o.y) / (d || 1); obst = true; break; }
  }
  if (!obst) {
    const c = w.clampToArena({ x: qx * 1.02, y: qy * 1.02 }, r);
    nx = c.x - qx * 1.02; ny = c.y - qy * 1.02;
    const n = Math.hypot(nx, ny);
    if (n < 1e-6) { nx = -qx; ny = -qy; }
    const nn = Math.hypot(nx, ny) || 1;
    nx /= nn; ny /= nn;
  }
  return { x: hx, y: hy, nx, ny, len: lo };
}
function insideArena(w: WorldApi, x: number, y: number, r: number): boolean {
  const c = w.clampToArena({ x, y }, r);
  return Math.abs(c.x - x) < 0.01 && Math.abs(c.y - y) < 0.01;
}
export function reflect(dx: number, dy: number, nx: number, ny: number): { x: number; y: number } {
  const d = dx * nx + dy * ny;
  return { x: dx - 2 * d * nx, y: dy - 2 * d * ny };
}
/** The map's small swarm (墨蝌 / 竹鼠 / 月兔影), for adds and 召. */
export function swarmOf(map: MapId): MonsterId {
  return map === 'lake' ? 'tadpole' : map === 'forest' ? 'rat' : 'shadowhare';
}

// ─────────────────────────────────────────────── per-wave shared state

export interface Shared {
  plan: unknown;
  /** 一网打尽: netted bodies → until, and their 月华. */
  nets: Map<number, { until: number; cost: number }>;
  /** 满园春色: the flowerbeds (at most 2). */
  beds: number[];
  /** 广寒清辉: live moon pools. */
  pools: { x: number; y: number; r: number; until: number; dr: number }[];
  /** 墨潮: live ink puddles (capped). */
  puddles: number[];
  /** The charm glyph: controls reversed until, and the last input we wrote. */
  reverseUntil: number;
  revX: number; revY: number;
  /** Bosses by handle (patterns find their runner here). */
  bosses: Map<number, unknown>;
  /** Titles already shown this wave (once-only flavour). */
  said: Set<string>;
  /** Decoy bodies (mirages, illusions, reflections, monkeys): never counted, captured or split. */
  phantoms: Set<number>;
  /** 裂 copies (they drop nothing). */
  copies: Set<number>;
  /** 噬 elites (they heal from what they deal). */
  devour: Set<number>;
  /** One mirage wall and one eclipse at a time, whichever twin raised it. */
  wall: unknown;
  dark: { prev: number | null; until: number } | null;
}
const SHARED = new WeakMap<object, Shared>();
/** The content state of this wave (reset whenever the engine starts a new wave). */
export function shared(w: WorldApi): Shared {
  const W = core(w);
  let s = SHARED.get(W);
  if (!s || s.plan !== W.plan) {
    s = { plan: W.plan, nets: new Map(), beds: [], pools: [], puddles: [], reverseUntil: 0, revX: 0, revY: 0, bosses: new Map(), said: new Set(), phantoms: new Set(), copies: new Set(), devour: new Set(), wall: null, dark: null };
    SHARED.set(W, s);
  }
  return s;
}
/** An edge title once per wave per key. */
export function sayOnce(w: WorldApi, key: string, text: Bilingual): void {
  const s = shared(w);
  if (s.said.has(key)) return;
  s.said.add(key);
  w.title(text, 'edge');
}
export const sfx = (w: WorldApi, n: SfxName) => w.sfx(n);

// ─────────────────────────────────────────────── coroutines

/** A step coroutine: yields seconds to wait (0 = the next step). */
export type Co = Generator<number, void, void>;
/** Drive a coroutine one step; false when it has finished. */
export class CoRun {
  private wait = 0;
  done = false;
  constructor(private g: Co) {}
  tick(dt: number): boolean {
    if (this.done) return false;
    this.wait -= dt;
    if (this.wait > 1e-9) return true;
    const r = this.g.next();
    if (r.done) { this.done = true; return false; }
    this.wait = Math.max(0, r.value);
    return true;
  }
  stop(): void {
    if (this.done) return;
    this.done = true;
    try { this.g.return(undefined); } catch { /* a finally that throws is its own problem */ }
  }
}
/** Repeat `fn` every step for `sec` seconds (fn gets the time in and dt). */
export function* during(w: () => WorldApi, sec: number, fn: (t: number, dt: number) => boolean | void): Co {
  let t = 0;
  while (t < sec) {
    const W = w();
    if (fn(t, W.dt) === false) return;
    t += W.dt;
    yield 0;
  }
}

/** Boss home wave (10 / 20 / 30) for a boss id. */
export function homeOf(id: BossId | 'mirrorself'): number {
  return id === 'mirrorself' ? 30 : BOSSES[id]?.wave ?? 30;
}
