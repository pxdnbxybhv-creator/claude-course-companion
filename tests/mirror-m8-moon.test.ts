// 水月幻镜 · m8 月华 (ART A1, PLAN D20–D22, art.md §5): the tiers (满月 25 / 月华珠 5 / 月华 1) split every haul
// greedily and sum to it; an ordinary 1–3 kill drops exactly as before; 蓄月 pays per whole point, so the
// income is what it was; pearls streaming in are drawn after the enemies; under 减少动态 a pearl is the
// static v0 frame with no float; the pickup ping and glints are the art's.
import { describe, expect, it } from 'vitest';
import type { AtlasId, Camera, ContentRegistry, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, Painter, RunSave, Sprite, WaveSetup } from '../src/views/mirror/types';
import { F } from '../src/views/mirror/data';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { DK } from '../src/views/mirror/engine/consts';
import { isMoonKind, moonDraws, moonKindOf, splitMoon } from '../src/views/mirror/engine/moon';
import { HELD, Renderer, drawOrder, moonIdle } from '../src/views/mirror/engine/render';
import { kindScale } from '../src/views/mirror/paint';
import { PICK_GLINT } from '../src/views/mirror/engine/feel';
import { DROP_SPECS } from '../src/views/mirror/paint/things';
import { B, extentOf } from '../src/views/mirror/paint/kit';

/** The split before the tiers: one piece per whole point, a fractional remainder on the last. */
function oldSplit(worth: number): number[] {
  const out: number[] = [];
  let left = worth;
  while (left > 0.001) { const w = left >= 2 ? 1 : left; out.push(w); left -= w; }
  return out;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('splitMoon: 满月 25 / 月华珠 5 / 月华 1', () => {
  it('the tiers are 25 and 5 (F.moonTiers)', () => {
    expect(F.moonTiers).toEqual([25, 5]);
  });
  it('every haul splits into pieces that sum to it, largest first, each wearing its pearl', () => {
    let s = 7;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const worths = [0.3, 1, 1.5, 2, 2.5, 3, 3.3, 4.99, 5, 5.7, 6.7, 24.9, 25, 25.5, 30, 33.3, 60, 137.25];
    for (let k = 0; k < 400; k++) worths.push(Math.round(rnd() * 3000) / 10 * (rnd() < 0.5 ? 1 : 1.03 + rnd() * 0.3));
    for (const w of worths) {
      const P = splitMoon(w);
      expect(Math.abs(sum(P) - w), `${w}`).toBeLessThan(0.0011);
      // the tier pieces first, largest first; then the small ones (the remainder rides on the last)
      const big = P.filter((p) => p >= 5);
      expect(P.slice(0, big.length)).toEqual(big);
      // (a remainder below 1 joins the last piece, which may then be up to 1 more than the one before it)
      for (let i = 1; i < big.length; i++) expect(big[i]).toBeLessThanOrEqual(big[i - 1] + (i === P.length - 1 ? 1 : 1e-9));
      for (const p of P) {
        const k = moonKindOf(p);
        expect(isMoonKind(k)).toBe(true);
        if (p >= 25) expect(k).toBe(DK.moonFull); else if (p >= 5) expect(k).toBe(DK.moonThick); else expect(k).toBe(DK.moonDrop);
      }
      // at most one piece is not a whole tier or 1 (the remainder), and it is never below 1 unless alone
      expect(P.filter((p) => p !== 25 && p !== 5 && p !== 1).length).toBeLessThanOrEqual(1);
      if (P.length > 1) expect(Math.min(...P)).toBeGreaterThanOrEqual(1);
    }
  });
  it('an ordinary 1–3 kill (with or without 劫\'s bonus) drops exactly as before the tiers', () => {
    for (const n of [1, 2, 3]) for (const vx of [1, 1.03, 1.1, 1.2, 1.5]) {
      const w = n * vx;
      expect(splitMoon(w)).toEqual(oldSplit(w));
    }
  });
  it('reuses the buffer it is given (dropMoon allocates nothing)', () => {
    const buf: number[] = [9, 9, 9, 9, 9, 9];
    expect(splitMoon(31, buf)).toBe(buf);
    expect(buf).toEqual([25, 5, 1]);
    expect(splitMoon(0, buf)).toEqual([]);
  });
});

describe('蓄月 per whole point (PLAN D21): the income is unchanged', () => {
  it('the draws of a split haul equal the old one-per-piece draws, for every haul', () => {
    for (let t = 1; t <= 4000; t++) {
      const w = t / 10 * (t % 3 === 0 ? 1.06 : 1);
      const P = splitMoon(w);
      const draws = P.reduce((a, p) => a + moonDraws(moonKindOf(p), p), 0);
      expect(draws, `${w}`).toBe(oldSplit(w).length);
    }
    // gold is never split and always draws one
    expect(moonDraws(DK.goldShard, 4)).toBe(1);
    expect(moonDraws(DK.carpGold, 5)).toBe(1);
  });

  const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
  const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
  const HOOKS: EngineHooks = { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  function opts(seed = 4242): NewRunOpts {
    return {
      seed, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
      runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
    };
  }
  const cv = { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) } as unknown as HTMLCanvasElement;
  function engine(store: number, wave = 4): MirrorEngine {
    const run: RunSave = beginWave({ ...newRun(opts()), wave, store, weapons: [] });
    const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
    const eng = createEngine(cv, run, { painter: createDebugPainter('lake', 'high', 1), audio: SILENT, content: EMPTY, hooks: HOOKS, settings }) as MirrorEngine;
    eng.start(run, setup);
    const W = eng.world;
    W.godmode = true; W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
    return eng;
  }
  /** Drop the hauls round the player, let them all stream in; the 月华 got (worth + 蓄月). */
  function haul(hauls: number[], store: number): { got: number; store: number } {
    const eng = engine(store);
    const W = eng.world;
    hauls.forEach((w, i) => W.dropMoon(W.px + 60 + (i % 5) * 10, W.py + 30 - (i % 3) * 10, w));
    for (let k = 0; k < 60 * 6 && W.D.count > 0; k++) eng.stepN(1);
    expect(W.D.count).toBe(0);
    const r = { got: W.moonGot, store: W.store };
    eng.dispose();
    return r;
  }
  const HAULS = [1, 2, 3, 3.3, 20, 25, 25.5, 40, 60, 7.2, 137.25, 3, 1.5];
  it('fixed hauls: 月华 got and 蓄月 left are the same with the tiers as with the old 1-worth pieces', () => {
    const tiers = F.moonTiers;
    for (const store of [120, 1000]) {
      const withTiers = haul(HAULS, store);
      try {
        (F as unknown as { moonTiers: readonly [number, number] }).moonTiers = [1e9, 1e9];
        const before = haul(HAULS, store);
        expect(withTiers.got).toBeCloseTo(before.got, 6);
        expect(withTiers.store).toBeCloseTo(before.store, 6);
      } finally { (F as unknown as { moonTiers: readonly [number, number] }).moonTiers = tiers; }
      // the worth plus one 蓄月 draw per whole point, while the store lasts
      expect(withTiers.got).toBeCloseTo(sum(HAULS) + Math.min(store, HAULS.reduce((a, w) => a + oldSplit(w).length, 0)), 6);
    }
  });
  it('a big haul lands as few pearls: 137.25 is five 满月, two 月华珠, a 1 and a 1.25', () => {
    const eng = engine(0);
    const W = eng.world;
    const n0 = W.D.count;
    W.dropMoon(W.px + 400, W.py, 137.25);
    const kinds: number[] = [];
    for (let i = 0; i < W.D.n; i++) if (W.D.alive[i]) kinds.push(W.D.kind[i]);
    expect(W.D.count - n0).toBe(9);
    expect(kinds.filter((k) => k === DK.moonFull).length).toBe(5);
    expect(kinds.filter((k) => k === DK.moonThick).length).toBe(2);
    expect(kinds.filter((k) => k === DK.moonDrop).length).toBe(2);
    eng.dispose();
  });
  it('the octave-up chime for 月华珠 / 满月 and a soft bell for 满月', () => {
    const picks: number[] = [], sfx: [string, number | undefined][] = [];
    const audio: MirrorAudio = { prime: async () => {}, sfx: (n, o) => { sfx.push([n, o?.gain]); }, pickup: (c) => { picks.push(c); }, music: () => {}, dispose: () => {} };
    const run: RunSave = beginWave({ ...newRun(opts()), wave: 4, weapons: [] });
    const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
    const eng = createEngine(cv, run, { painter: createDebugPainter('lake', 'high', 1), audio, content: EMPTY, hooks: HOOKS, settings }) as MirrorEngine;
    eng.start(run, setup);
    const W = eng.world;
    W.collectMoon(1); W.collectMoon(1); W.collectMoon(1);
    expect(picks).toEqual([0, 1]);
    W.collectMoon(5, 5, 1);
    expect(picks[picks.length - 1]).toBeGreaterThanOrEqual(5);
    W.collectMoon(25, 25, 2);
    expect(picks[picks.length - 1]).toBeGreaterThanOrEqual(5);
    expect(sfx).toContainEqual(['bell', 0.5]);
    for (const p of picks) expect(p).toBeLessThan(15);
    eng.dispose();
  });
});

// ─────────────────────────────────────────── drawing
type Rec = { img: string; x: number; y: number; w: number; h: number; a: number };
function recCtx() {
  let m = [1, 0, 0, 1, 0, 0], alpha = 1;
  const log: Rec[] = [];
  const target: Record<string, unknown> = {
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { m = [a, b, c, d, e, f]; },
    drawImage(img: { tag?: string }, ...r: number[]) {
      const [dx, dy, dw, dh] = r.length >= 8 ? r.slice(4) : r;
      log.push({ img: img?.tag ?? '?', x: m[0] * dx + m[2] * dy + m[4], y: m[1] * dx + m[3] * dy + m[5], w: Math.hypot(m[0], m[1]) * dw, h: Math.hypot(m[2], m[3]) * dh, a: alpha });
    },
    measureText: () => ({ width: 10 }), createPattern: () => null, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : k === 'globalAlpha' ? alpha : () => {}),
    set: (_t, k, v) => { if (k === 'globalAlpha') alpha = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}
/** A debug painter whose drops, enemies and weapons have tagged sprites (the rest stay plain). */
function painter(): Painter {
  const P = createDebugPainter('lake', 'high', 1);
  const cache = new Map<string, Sprite>();
  const sprite = (id: AtlasId, v = 0): Sprite | null => {
    if (!(id.startsWith('drop:') || id.startsWith('mon:') || id.startsWith('wpn:'))) return null;
    const key = `${id}#${v}`;
    let s = cache.get(key);
    if (!s) { s = { img: { tag: key } as unknown as CanvasImageSource, sx: 0, sy: 0, sw: 40, sh: 20, w: 20, h: 10, ax: 0.5, ay: 0.5 }; cache.set(key, s); }
    return s;
  };
  return new Proxy(P, { get: (t, k) => (k === 'sprite' ? sprite : (t as unknown as Record<string | symbol, unknown>)[k]) }) as Painter;
}
function scene(reduceMotion = false) {
  const run: RunSave = beginWave({ ...newRun({
    seed: 77, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  }), wave: 4, weapons: [{ id: 'qingfeng', t: 1 }] });
  const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  const cv = { width: 390, height: 844, clientWidth: 390, clientHeight: 844, getContext: () => null, getBoundingClientRect: () => ({ width: 390, height: 844 }) } as unknown as HTMLCanvasElement;
  const st: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const SIL = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} } as unknown as MirrorAudio;
  const EMP: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
  const H: EngineHooks = { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} };
  const eng = createEngine(cv, run, { painter: createDebugPainter('lake', 'high', 1), audio: SIL, content: EMP, hooks: H, settings: st }) as MirrorEngine;
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = true; W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
  return { eng, W };
}

describe('月华 on screen', () => {
  it('pearls streaming in are drawn after the enemies; pearls on the ground before them', () => {
    const { eng, W } = scene();
    const cam: Camera = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    W.spawn('blot', W.px + 150, W.py, { bloom: false });
    const D = W.D;
    W.dropOne(DK.moonDrop, W.px - 150, W.py + 120, 1, -1);  // on the ground, far
    W.dropOne(DK.moonThick, W.px + 90, W.py - 40, 5, -1);   // streaming in
    for (let i = 0; i < D.n; i++) if (D.alive[i]) D.age[i] = 1;
    for (let i = 0; i < D.n; i++) if (D.alive[i] && D.kind[i] === DK.moonThick) D.magnet[i] = 1;
    const r = new Renderer(painter());
    const C = recCtx();
    for (const L of drawOrder(false)) r.layer(L, W, C.ctx, cam);
    const at = (p: string) => C.log.findIndex((q) => q.img.startsWith(p));
    const lastAt = (p: string) => { let j = -1; C.log.forEach((q, k) => { if (q.img.startsWith(p)) j = k; }); return j; };
    expect(at('drop:moonDrop')).toBeGreaterThanOrEqual(0);
    expect(at('mon:blot')).toBeGreaterThanOrEqual(0);
    expect(at('drop:moonDrop')).toBeLessThan(at('mon:blot'));
    expect(at('drop:moonThick')).toBeGreaterThan(lastAt('mon:blot'));
    eng.dispose();
  });
  it('a pearl floats ±1.8 u and twinkles ≈ 12 % of the time; under 减少动态 it is the static v0 frame', () => {
    let v1 = 0, maxB = 0;
    for (let f = 0; f < 2000; f++) { const m = moonIdle(f / 120, 3, false, false); v1 += m.v; maxB = Math.max(maxB, Math.abs(m.bob)); }
    expect(v1 / 2000).toBeGreaterThan(0.08); expect(v1 / 2000).toBeLessThan(0.16);
    expect(maxB).toBeGreaterThan(1.7); expect(maxB).toBeLessThanOrEqual(1.8);
    for (let f = 0; f < 500; f++) expect(moonIdle(f / 60, f, true, false)).toEqual({ bob: 0, v: 0 });
    // pulled: no float
    expect(moonIdle(0.3, 1, false, true).bob).toBe(0);
    // the renderer under 减少动态: the same place and the v0 sprite on every frame
    const { eng, W } = scene(true);
    const cam: Camera = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    W.dropOne(DK.moonDrop, W.px - 120, W.py + 150, 1, -1);
    for (let i = 0; i < W.D.n; i++) if (W.D.alive[i]) { W.D.age[i] = 1; W.D.vx[i] = 0; W.D.vy[i] = 0; }
    const r = new Renderer(painter());
    const seen = new Set<string>();
    for (let f = 0; f < 40; f++) {
      (W as unknown as { tDraw: number }).tDraw = f * 0.37;
      const C = recCtx();
      r.layer('drops', W, C.ctx, cam);
      const q = C.log.find((x) => x.img.startsWith('drop:moonDrop'))!;
      seen.add(`${q.img}@${q.x.toFixed(3)},${q.y.toFixed(3)}`);
    }
    expect([...seen]).toEqual([...seen].slice(0, 1));
    expect([...seen][0].startsWith('drop:moonDrop#0@')).toBe(true);
    eng.dispose();
  });
  it('the pearls: 2 frames, no halo, every mark inside the canvas, and a 满月 larger than a 月华珠 larger than a 月华', () => {
    const size: number[] = [];
    for (const id of ['moonDrop', 'moonThick', 'moonFull'] as const) {
      const sp = DROP_SPECS[id];
      expect(sp.n).toBe(2);
      expect(sp.halo).toBe('none');
      for (let v = 0; v < 2; v++) {
        const b = new B(3); sp.paint(b, v);
        for (const op of b.ops) if (op.k === 'fn') expect(op.bb, id).toBeTruthy();
        const [x0, , x1] = extentOf(sp, v, 3);
        expect(x0).toBeGreaterThanOrEqual(sp.box[0] - 1); expect(x1).toBeLessThanOrEqual(sp.box[2] + 1);
      }
      size.push(sp.box[2]);
    }
    expect(size[0]).toBeLessThan(size[1]); expect(size[1]).toBeLessThan(size[2]);
    // the drawn pearl with its glow: ≥ 40 device px on a phone at 中 (1.67 device px per u)
    expect(DROP_SPECS.moonDrop.box[2] * 2 * 1.6714).toBeGreaterThanOrEqual(40);
  });
  it('the pickup: a second white glint, the moon glint at 1.25', () => {
    expect(PICK_GLINT).toEqual([1.25, 1]);
  });
});

describe('held weapons (PLAN D22, art §4.3)', () => {
  it('are drawn at 0.8× and alpha 1 on a 30 × 22 u orbit, baked at 0.85', () => {
    expect(HELD).toEqual({ size: 0.8, alpha: 1, orbitX: 30, orbitY: 22 });
    expect(kindScale('wpn:qingfeng')).toBe(0.85);
    const { eng, W } = scene();
    const cam: Camera = { x: W.px, y: W.py, scale: 1.5, w: 390, h: 844, dpr: 1 };
    const r = new Renderer(painter());
    const C = recCtx();
    r.layer('player', W, C.ctx, cam);
    const q = C.log.filter((x) => x.img.startsWith('wpn:qingfeng'));
    expect(q.length).toBe(1);
    // the tagged sprite is 20 × 10 u: drawn 0.8 × 1.5 px per u
    expect(q[0].w).toBeCloseTo(20 * 0.8 * 1.5, 6);
    expect(q[0].h).toBeCloseTo(10 * 0.8 * 1.5, 6);
    expect(q[0].a).toBe(1);
    eng.dispose();
  });
});
