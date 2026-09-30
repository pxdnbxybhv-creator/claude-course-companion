// 水月幻镜 · 帧率 (m7: 「最高能达到120帧，电脑最好能够无上限」): the loop at 30–360 Hz with synthetic vsync
// stamps. The simulation is a fixed 60 Hz step, so the game plays the same at every rate (state, effect
// counts); the effects clock (World.tFx) moves the drawn effects on every frame and is exactly `t` at
// 60 Hz; the frame cap (30 · 60 · 120 · 不限) skips vsyncs and holds; uncapped draws every vsync; the
// guard and dynamic resolution do not trip on a fast screen, and a 120 Hz screen that only gets 60
// trades overlays and at most two notches (never an effect), then a steady half rate.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineSettings, MirrorAudio, RunSave, WaveSetup } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun } from '../src/views/mirror/logic';
import { wavePlan } from '../src/views/mirror/logic/spawn';
import { computeStats } from '../src/views/mirror/logic/formulas';
import { capOf, capVsyncs, createEngine, nominalPeriod, snapStep, type MirrorEngine } from '../src/views/mirror/engine';
import { CONTENT } from '../src/views/mirror/engine/content';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { fillLoad } from '../src/views/mirror/engine/dev';
import { vfxOf } from '../src/views/mirror/engine/vfx';
import { defaultMeta, sanitizeMirror } from '../src/app/mirror';
import { PK } from '../src/views/mirror/engine/consts';
import { SF, SMode } from '../src/views/mirror/engine/pools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const HOOKS = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
const EMPTY = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const STEP = 1 / 60;
const RATES = [30, 60, 90, 120, 144, 165, 240, 360] as const;

/** A 2D context that takes every call (no pixels). */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  const grad = { addColorStop() {} };
  const fn = () => grad;
  return new Proxy(store, { get: (t, p) => (p in t ? t[p] : fn), set: (t, p, v) => { t[p] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}
function canvas(w: number, h: number, ctx: CanvasRenderingContext2D | null) {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
function opts(o: Any = {}): Any {
  return { seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false, runIndex: 1, rate: 1,
    startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o };
}
function setupOf(run: RunSave): WaveSetup {
  const w = run.inWave ?? run.wave + 1;
  return { wave: w, plan: wavePlan(run, w), coins: [], mutators: [], term: run.term, sky: { fullMoonDay: false, lunation: 0.5, fullWave: false }, stats: computeStats(run) } as WaveSetup;
}
const SETTINGS: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', view: 'mid' };
/** A quiet engine (no spawns, endless wave, god mode) drawing to a fake context; `draws` counts draws. */
function quiet(o: { fps?: number; dpr?: number; w?: number; h?: number; amb?: boolean } = {}) {
  const run = beginWave({ ...newRun(opts()), wave: 3 } as RunSave);
  const painter = createDebugPainter(run.map, 'high', 1);
  if (o.amb) Object.assign(painter, { ambience: { shed: false } });
  const eng = createEngine(canvas(o.w ?? 1280, o.h ?? 800, fakeCtx()), run, {
    painter, audio: SILENT, content: EMPTY as never, hooks: HOOKS, settings: { ...SETTINGS, dprCap: o.dpr ?? 1, fps: o.fps ?? 0 },
  }) as MirrorEngine;
  eng.start(run, setupOf(run));
  const W = eng.world as Any;
  W.godmode = true; W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
  (W.arena.obstacles as unknown[]).length = 0;
  const R = (eng as unknown as { renderer: { draw: (...a: unknown[]) => void } }).renderer;
  const d0 = R.draw.bind(R);
  const log = { draws: 0, tFx: [] as number[], t: [] as number[], onDraw: null as null | (() => void) };
  R.draw = (...a: unknown[]) => { log.draws++; log.tFx.push(W.tFx); log.t.push(W.t); log.onDraw?.(); d0(...a); };
  return { eng, W, log, painter: painter as Any };
}
/** Vsync stamps: `hz` for `seconds` from t0, floored to a clock of q ms (Chrome 0.1, Safari 1). */
function stamps(hz: number, seconds: number, q = 0.1, t0 = 1000): number[] {
  const out: number[] = [];
  const n = Math.round(hz * seconds);
  for (let i = 0; i < n; i++) out.push(Math.floor((t0 + (i * 1000) / hz) / q) * q);
  return out;
}

const g = globalThis as Any;
const savedWindow = g.window;
const savedMM = g.matchMedia;
afterEach(() => { g.window = savedWindow; g.matchMedia = savedMM; vi.restoreAllMocks(); });

describe('帧率 · the vsync snap at every rate', () => {
  it('names the nominal rate of 30–360 Hz panels (within 2%) and nothing else', () => {
    const table: [number, number][] = [[30, 30], [60, 60], [59.94, 60], [60.02, 60], [90, 90], [120, 120], [119.88, 120], [144, 144], [143.86, 144],
      [165, 165], [240, 240], [239.76, 240], [360, 360]];
    for (const [hz, nominal] of table) expect(1 / nominalPeriod(1 / hz)).toBeCloseTo(nominal, 6);
    expect(nominalPeriod(1 / 57)).toBeNaN();
    expect(nominalPeriod(1 / 110)).toBeNaN();
    // 60 Hz snaps to exactly one step (the 60 Hz picture is what it always was)
    expect(snapStep(0.017, 1 / 59.94)).toBe(STEP);
    expect(snapStep(0.016, 1 / 60)).toBe(STEP);
    // a hitch is used as it came
    expect(snapStep(0.0105, 1 / 144)).toBe(0.0105);
  });
  it('the game runs at 60 steps a second at every rate, with Chrome’s 0.1 ms and Safari’s 1 ms clocks', () => {
    for (const hz of RATES) for (const q of [0.1, 1]) {
      const { eng, W } = quiet();
      const T = stamps(hz, 4, q);
      const t0 = W.tWave;
      for (const now of T) eng.frame(now);
      const speed = (W.tWave - t0) / ((T[T.length - 1] - T[0]) / 1000);
      expect({ hz, q, speed: Math.abs(speed - 1) < 0.01 }).toEqual({ hz, q, speed: true });
      eng.dispose();
    }
  });
});

describe('帧率 · the game is the same at every rate', () => {
  /** 6 s of combat (5 weapons, 50 enemies, a walk that turns on the game clock) to step N; the state and
   *  every effect counter at that step. */
  function combat(hz: number, cap = 0, N = 330) {
    let run = newRun(opts({ seed: 777, char: 'swordsman' })) as Any;
    run = { ...run, weapons: [{ id: 'qingfeng', t: 2 }, { id: 'sunbow', t: 2 }, { id: 'qingping', t: 2 }, { id: 'thunder', t: 2 }, { id: 'claw', t: 2 }], pending: { ...run.pending, start: null } };
    run = beginWave({ ...run, wave: 6 } as RunSave);
    const eng = createEngine(canvas(1280, 800, fakeCtx()), run, { painter: createDebugPainter(run.map, 'high', 1), audio: SILENT, content: CONTENT, hooks: HOOKS, settings: { ...SETTINGS, fps: cap } }) as MirrorEngine;
    eng.start(run, setupOf(run));
    const W = eng.world as Any;
    W.godmode = true;
    fillLoad(eng, { enemies: 50 });
    const V = vfxOf(W) as Any;
    let at: Any | null = null;
    // the motes shots shed, by shot slot mod 8 (a shed mote starts 14 u behind its shot: render.ts)
    const bySlot = new Array(8).fill(0);
    const fl0 = V.fleck.bind(V), PS = W.PS;
    V.fleck = (x: number, y: number, ...rest: unknown[]) => {
      for (let i = 0; i < PS.n; i++) {
        if (!PS.alive[i]) continue;
        const L = Math.hypot(PS.vx[i], PS.vy[i]) || 1;
        if (Math.abs(PS.x[i] - (PS.vx[i] / L) * 14 - x) < 1e-3) { bySlot[i & 7]++; break; }
      }
      return fl0(x, y, ...rest);
    };
    const step0 = W.step.bind(W);
    // the walk turns on the simulation's clock (a new heading every 0.5 s of game time), set per step
    W.step = (dt: number) => {
      const k = Math.floor(W.t * 2);
      W.moveX = Math.cos(k * 1.3); W.moveY = Math.sin(k * 1.3);
      step0(dt);
      if (W.perf.steps === N && !at) {
        let h = 0;
        for (let i = 0; i < W.E.n; i++) if (W.E.alive[i]) h = (h * 31 + Math.round(W.E.x[i] * 100) + Math.round(W.E.y[i] * 7)) | 0;
        at = { t: W.t, kills: W.kills, hp: W.hp, px: W.px, py: W.py, enemyHash: h, sparks: W.feel.st.emitted, marks: W.feel.st.marks, frags: W.feel.st.frags, voices: W.feel.st.voices, vfx: { ...V.st }, bySlot: [...bySlot] };
      }
    };
    for (const now of stamps(hz, 8)) { eng.frame(now); if (at) break; }
    eng.dispose();
    return at;
  }
  it('the same state and the same effect counts at step 330, at 60–360 Hz and under every cap', { timeout: 60_000 }, () => {
    const ref = combat(60);
    expect(ref).not.toBeNull();
    expect(ref!.kills).toBeGreaterThan(0);
    expect(ref!.sparks).toBeGreaterThan(100);
    // every simulation-side count exactly; the motes shot heads shed as they are drawn (render.ts, vfx
    // flecks, and what a full pool drops) are the renderer's and are held to a few per cent
    const sim = (r: Any) => { const { flecks, dropped, ...vfx } = r.vfx; void flecks; void dropped; const { bySlot, ...rest } = r; void bySlot; return { ...rest, vfx }; };
    const motes: Any[] = [];
    const check = (hz: number, cap: number) => {
      const r = combat(hz, cap)!;
      expect({ hz, cap, ...sim(r) }).toEqual({ hz, cap, ...sim(ref!) });
      motes.push({ hz, cap, flecks: r.vfx.flecks });
      expect(Math.abs(r.vfx.flecks / ref!.vfx.flecks - 1)).toBeLessThan(0.08);
    };
    // (a 30 Hz screen with no cap is a slow one to the guard, which cuts effects: the 省电 cap is not)
    for (const hz of RATES.filter((r) => r > 30)) check(hz, 0);
    for (const [hz, cap] of [[60, 30], [120, 60], [144, 120], [240, 30], [360, 120]] as const) check(hz, cap);
    console.log('[m7] motes shed by step 330 (60 Hz: %d):', ref!.vfx.flecks, JSON.stringify(motes));
  });
  it('every shot sheds its motes at the same rate at 30–360 Hz (per step, never per drawn frame): by slot, not just in total', { timeout: 60_000 }, () => {
    const ref = combat(60)!.bySlot as number[];
    const tot = ref.reduce((a, b) => a + b, 0);
    expect(tot).toBeGreaterThan(25);
    for (const [hz, cap] of [[120, 0], [144, 0], [240, 0], [360, 0], [60, 30], [144, 120], [165, 60]] as const) {
      const got = combat(hz, cap)!.bySlot as number[];
      // each slot residue within a few motes of 60 Hz's (none left out, none doubled)
      const off = got.map((v, k) => Math.abs(v - ref[k]) - Math.max(3, 0.2 * ref[k])).filter((d) => d > 0).length;
      expect({ hz, cap, got, off }).toEqual({ hz, cap, got, off: 0 });
    }
  });
});

describe('帧率 · the effects clock (World.tFx)', () => {
  it('is exactly t on every frame at 60 Hz (Chrome’s and Safari’s clocks, 59.94 Hz too), headless and on a still redraw', () => {
    for (const [hz, q] of [[60, 0.1], [60, 1], [59.94, 1], [60.02, 0.1]] as const) {
      const { eng, W, log } = quiet();
      for (const now of stamps(hz, 3, q)) eng.frame(now);
      expect(log.draws).toBeGreaterThan(170);
      expect({ hz, q, same: log.tFx.every((v, i) => v === log.t[i]) }).toEqual({ hz, q, same: true });
      expect(W.tFx).toBe(W.t);
      expect(W.dFx).toBe(0);
      eng.pause();
      expect(W.tFx).toBe(W.t);
      eng.dispose();
    }
  });
  it('moves on every frame at 90–360 Hz, within half a step of t, and keeps pace with the wall clock', () => {
    for (const hz of [90, 120, 144, 165, 240, 360]) {
      const { eng, log } = quiet();
      const T = stamps(hz, 3, 0.1);
      for (const now of T) eng.frame(now);
      const n = log.tFx.length;
      let still = 0, worst = 0, lead = 0;
      // (from the 9th frame: the first few draw effects on t while the display's period is measured)
      for (let i = 9; i < n; i++) {
        if (!(log.tFx[i] > log.tFx[i - 1])) still++;
        worst = Math.max(worst, Math.abs(log.tFx[i] - log.t[i]));
      }
      // against the wall clock: tFx − tFx0 tracks the stamps' own time (± a step's rounding)
      for (let i = 20; i < n; i++) lead = Math.max(lead, Math.abs((log.tFx[i] - log.tFx[19]) - (T[i] - T[19]) / 1000));
      expect({ hz, still, half: worst <= STEP / 2 + 1e-9, pace: lead < 0.003 }).toEqual({ hz, still: 0, half: true, pace: true });
      eng.dispose();
    }
  });
  it('a struck body’s pose (the recoil, 打击感) has a new state on every frame at 144 Hz, and lasts as long as at 60 Hz', () => {
    const run = (hz: number) => {
      const { eng, W } = quiet();
      const F = W.feel as Any, E = W.E as Any;
      const ei = E.slotOf(W.spawn('blot', W.px + 120, W.py, { bloom: false, capped: false }));
      E.speed[ei] = 0;
      const offs: number[] = [];
      let track = false, frames = 0;
      const pose0 = F.pose.bind(F);
      F.pose = (i: number) => { const r = pose0(i); if (track && i === ei) offs.push(F.po.x - E.x[i]); return r; };
      const T = stamps(hz, 2);
      for (let i = 0; i < T.length; i++) {
        if (i === Math.round(hz)) { F.hit(ei, W.px, W.py, 5, false, 0, false, 0); track = true; }
        if (i === Math.round(hz * 1.4)) track = false;
        if (track) frames++;
        eng.frame(T[i]);
      }
      eng.dispose();
      const moving = offs.filter((u) => Math.abs(u) > 0.05).length;
      let jump = 0;
      for (let k = 1; k < offs.length; k++) jump = Math.max(jump, Math.abs(offs[k] - offs[k - 1]));
      return { frames, distinct: new Set(offs.map((u) => u.toFixed(5))).size, movingS: moving / hz, jump };
    };
    const a = run(60), b = run(144);
    // (a few frames repeat by design: the freeze holds the body where it was struck)
    expect(b.distinct).toBeGreaterThanOrEqual(0.85 * b.frames);
    expect(b.distinct).toBeGreaterThan(a.distinct * 2);
    expect(b.jump).toBeLessThan(0.6 * a.jump);
    expect(Math.abs(b.movingS - a.movingS)).toBeLessThan(0.02);
  });
});

describe('帧率 · ribbons and resume', () => {
  /** One flying sword crossing a still camera at 600 u/s: its ribbon's length (screen px) and how its
   *  tail moves, frame by frame (the jerk: each frame's move less the mean of its neighbours'). */
  function ribbon(hz: number) {
    const { eng, W } = quiet();
    const T = stamps(hz, 3, 0.1);
    let f = 0;
    for (; f < T.length && T[f] - T[0] < 1000; f++) eng.frame(T[f]);
    const PS = W.PS;
    const i = PS.spawnSlot();
    PS.x[i] = W.px - 250; PS.y[i] = W.py - 120; PS.vx[i] = 600; PS.vy[i] = 0; PS.speed[i] = 600;
    PS.life[i] = PS.life0[i] = 1e6; PS.kind[i] = PK.flySword; PS.dmg[i] = 0; PS.r[i] = 8; PS.pierce[i] = 30000;
    PS.flags[i] = SF.sword | SF.pierceAll; PS.mode[i] = SMode.Straight; PS.slot[i] = -1;
    const TR = (eng as Any).renderer.trails;
    const d0 = TR.draw.bind(TR);
    const L: number[] = [], tail: number[] = [];
    TR.draw = (ctx: Any, cam: Any, t: number, group: number, ...rest: unknown[]) => {
      if (group === 0) for (let k = 0; k < TR.cap; k++) {
        if (!TR.alive[k] || TR.group[k] !== 0) continue;
        const m = TR.fill(k, cam, t);
        if (m < 1) continue;
        let len = 0;
        for (let j = 1; j <= m; j++) len += Math.hypot(TR.sx[j] - TR.sx[j - 1], TR.sy[j] - TR.sy[j - 1]);
        L.push(len); tail.push(TR.sx[0]);
      }
      return d0(ctx, cam, t, group, ...rest);
    };
    const x0 = PS.x[i];
    for (; f < T.length; f++) { eng.frame(T[f]); if (PS.x[i] - x0 > 900) break; }
    eng.dispose();
    const a = Math.round(L.length * 0.35), b = Math.round(L.length * 0.95);
    const Ls = L.slice(a, b), ts = tail.slice(a, b);
    const d = ts.slice(1).map((v, k) => v - ts[k]);
    let jerk = 0;
    for (let k = 3; k < d.length - 3; k++) { let m = 0; for (let j = -3; j <= 3; j++) m += d[k + j]; jerk = Math.max(jerk, Math.abs(d[k] - m / 7)); }
    return { mean: Ls.reduce((x, y) => x + y, 0) / Ls.length, swing: Math.max(...Ls) - Math.min(...Ls), jerk };
  }
  it('a flying sword’s ribbon keeps its 60 Hz length at 90–360 Hz and its tail glides (no step-sawing)', () => {
    const ref = ribbon(60);
    expect(ref.swing).toBeLessThan(0.5);
    for (const hz of [90, 120, 144, 240, 360]) {
      const r = ribbon(hz);
      expect({ hz, len: Math.abs(r.mean - ref.mean) < 0.5, swing: r.swing < 1.5, jerk: r.jerk < 0.6 }).toEqual({ hz, len: true, swing: true, jerk: true });
    }
  });
  it('the first frame after a resume moves one vsync, not 1–1.75 steps (no jump at 120–360 Hz)', () => {
    for (const hz of [60, 120, 240, 360]) {
      const { eng, W } = quiet();
      W.moveX = 1; W.moveY = 0;
      const xs: number[] = [];
      const R = (eng as Any).renderer, d0 = R.draw;
      R.draw = (...a: unknown[]) => { xs.push(W.px); return d0(...a); };
      let now = 1000;
      for (let k = 0; k < hz * 2; k++) eng.frame((now += 1000 / hz));
      const ordinary = xs[xs.length - 1] - xs[xs.length - 2];
      eng.pause();
      const n0 = xs.length;
      eng.resume();
      now += 3000;
      eng.frame(now);
      const first = xs[n0 + (xs.length > n0 + 1 ? 1 : 0)] - xs[n0 - 1];
      void first;
      const jump = xs[xs.length - 1] - xs[n0 - 1];
      expect({ hz, ratio: Math.round((jump / ordinary) * 10) / 10 <= 1.05 }).toEqual({ hz, ratio: true });
      eng.dispose();
    }
  });
});

describe('帧率 · the frame cap', () => {
  const drawn = (hz: number, cap: number, seconds = 4, q = 0.1) => {
    const { eng, log } = quiet({ fps: cap });
    const T = stamps(hz, seconds, q);
    const t0 = eng.world.tWave;
    for (const now of T) eng.frame(now);
    const s = (T[T.length - 1] - T[0]) / 1000;
    const r = { fps: log.draws / s, speed: (eng.world.tWave - t0) / s, calls: T.length, draws: log.draws };
    eng.dispose();
    return r;
  };
  it('uncapped (不限) draws on every vsync, 60–360 Hz, with either clock', () => {
    for (const hz of [60, 90, 120, 144, 165, 240, 360]) for (const q of [0.1, 1]) {
      const r = drawn(hz, 0, 4, q);
      expect({ hz, q, draws: r.draws }).toEqual({ hz, q, draws: r.calls });
    }
  });
  it('holds 30 / 60 / 120 on every screen on a steady whole-vsync cadence (the nearest), at full game speed', () => {
    // 60 on 90 Hz: 45; 60 on 144: 72; 60 on 165: 55; 120 on 144 / 165: every vsync; 30 on 165: 27.5
    expect([[60, 90], [60, 144], [60, 165], [120, 144], [120, 165], [30, 165], [30, 144], [120, 240]].map(([c, h]) => capVsyncs(1000 / c, 1000 / h))).toEqual([2, 2, 3, 1, 1, 6, 5, 2]);
    for (const cap of [30, 60, 120]) for (const hz of [60, 90, 120, 144, 165, 240, 360]) for (const q of [0.1, 1]) {
      const r = drawn(hz, cap, 4, q);
      const expect0 = hz / capVsyncs(1000 / cap, 1000 / hz);
      expect({ cap, hz, q, ok: Math.abs(r.fps - expect0) <= 1.2, speed: Math.abs(r.speed - 1) < 0.01 }).toEqual({ cap, hz, q, ok: true, speed: true });
    }
  });
  it('a cap presents on a steady cadence: every drawn interval is the same whole number of vsyncs', () => {
    for (const [cap, hz] of [[120, 144], [60, 90], [60, 144], [60, 165], [30, 165]] as const) {
      const { eng, log } = quiet({ fps: cap });
      const T = stamps(hz, 3, 0.1);
      const at: number[] = [];
      log.onDraw = () => { at.push(cur); };
      let cur = 0;
      for (const now of T) { cur = now; eng.frame(now); }
      const k = capVsyncs(1000 / cap, 1000 / hz), P = 1000 / hz;
      const odd = at.slice(10).map((v, i, a) => (i ? v - a[i - 1] : k * P)).filter((d) => Math.abs(d - k * P) > 0.3).length;
      expect({ cap, hz, odd }).toEqual({ cap, hz, odd: 0 });
      eng.dispose();
    }
  });
  it('a 120 cap on a 120 Hz screen draws every vsync, with a jittery clock too', () => {
    const { eng, log } = quiet({ fps: 120 });
    let now = 1000, calls = 0;
    for (let i = 0; i < 600; i++) { now += 1000 / 120 + (i % 3 === 0 ? 0.4 : i % 3 === 1 ? -0.4 : 0); eng.frame(Math.floor(now * 10) / 10); calls++; }
    expect(log.draws).toBe(calls);
    eng.dispose();
  });
  it('applies live through setSettings, and capOf keeps only sane values', () => {
    const { eng, log } = quiet();
    let now = 1000;
    for (let i = 0; i < 240; i++) eng.frame((now += 1000 / 240));
    const a = log.draws;
    eng.setSettings({ fps: 60 });
    for (let i = 0; i < 240; i++) eng.frame((now += 1000 / 240));
    expect(a).toBe(240);
    expect(Math.abs(log.draws - a - 60)).toBeLessThanOrEqual(1);
    expect(eng.frameStats.cap).toBe(60);
    expect([capOf(undefined), capOf(0), capOf(-5), capOf(Number.NaN), capOf('120'), capOf(30), capOf(120)]).toEqual([0, 0, 0, 0, 0, 30, 120]);
    eng.dispose();
  });
});

describe('帧率 · the readout and the display', () => {
  it('frameStats reports a second of frames and displayHz the screen, at 60–360 Hz', () => {
    for (const hz of [60, 120, 144, 240, 360]) {
      const { eng, W } = quiet();
      for (const now of stamps(hz, 3, 1)) eng.frame(now);
      const f = eng.frameStats;
      expect({ hz, fps: Math.abs(f.fps - hz) < hz * 0.02, ms: Math.abs(f.ms - 1000 / hz) < 0.05 * (1000 / hz), disp: Math.abs(eng.displayHz - hz) < hz * 0.03, wfps: Math.abs(W.fps - hz) < hz * 0.02 })
        .toEqual({ hz, fps: true, ms: true, disp: true, wfps: true });
      eng.dispose();
    }
  });
  it('a stop does not inflate the count (it counts frames over wall time)', () => {
    const { eng, W } = quiet();
    let now = 1000;
    for (let i = 0; i < 120; i++) eng.frame((now += 1000 / 60));
    W.hitstopMs = 400;
    for (let i = 0; i < 120; i++) eng.frame((now += 1000 / 60));
    expect(Math.abs(eng.frameStats.fps - 60)).toBeLessThan(1.5);
    eng.dispose();
  });
});

describe('帧率 · the guard on fast screens', () => {
  /** `work`: our own JS ms a drawn frame from the light second on (a fake performance clock the draw
   *  advances); `fine`: a computer (a fine pointer); `at`: the stamps of the drawn frames. */
  function drive(o: { hz: number; seconds: number; gen?: (i: number, drew: boolean) => number; fps?: number; dpr?: number; work?: number | ((sec: number) => number); fine?: boolean; lead?: number }) {
    g.window = { devicePixelRatio: o.dpr ?? 3 };
    if (o.fine !== undefined) g.matchMedia = (q: string) => ({ matches: q.includes('coarse') ? !o.fine : false });
    let clock = 0, working = false;
    if (o.work !== undefined) vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const r = quiet({ fps: o.fps ?? 0, dpr: o.dpr ?? 3, w: 390, h: 844, amb: true });
    const { eng, W, painter, log } = r;
    const acts: string[] = [];
    const at: number[] = [];
    let now = 1000, i = 0, dpr = eng.resolution, shed = false, deg = 0, half = false;
    log.onDraw = () => {
      at.push(now);
      if (working && o.work !== undefined) clock += typeof o.work === 'function' ? o.work((now - 1000) / 1000) : o.work;
    };
    // a light second first: the screen shows what it can do
    for (let k = 0; k < (o.lead ?? o.hz); k++) { eng.frame((now += 1000 / o.hz)); clock = now; }
    working = true;
    let drew = true;
    while (now < 1000 + (o.seconds + 1) * 1000) {
      now += o.gen ? o.gen(i++, drew) : 1000 / o.hz;
      const n0 = log.draws;
      clock = Math.max(clock, now);
      eng.frame(now);
      drew = log.draws > n0;
      const t = ((now - 1000) / 1000).toFixed(1);
      if (painter.ambience.shed !== shed) { shed = painter.ambience.shed; acts.push(`${t} ${shed ? 'shed' : 'unshed'}`); }
      if (eng.resolution !== dpr) { acts.push(`${t} dpr ${dpr}→${eng.resolution}`); dpr = eng.resolution; }
      if (W.degrade !== deg) { deg = W.degrade; acts.push(`${t} degrade ${deg}`); }
      if (eng.frameStats.half !== half) { half = eng.frameStats.half; acts.push(`${t} half ${half}`); }
    }
    const res = { acts, dpr: eng.resolution, degrade: W.degrade, fps: eng.frameStats.fps, hz: eng.displayHz, at, shed: painter.ambience.shed as boolean };
    eng.dispose();
    return res;
  }
  it('steady 60–360 Hz screens (capped or not) never shed anything', () => {
    for (const hz of [60, 90, 120, 144, 165, 240, 360]) for (const fps of [0, 120, 60, 30]) {
      const r = drive({ hz, seconds: 30, fps });
      expect({ hz, fps, acts: r.acts }).toEqual({ hz, fps, acts: [] });
    }
  }, 60_000);
  it('a 60 Hz-limited Safari (animation frames at 60 from the start) is left alone', () => {
    const r = drive({ hz: 60, seconds: 60, fps: 120 });
    expect(r.acts).toEqual([]);
  });
  it('a display that drops from 120 to 60 Hz mid-run (light work) is re-learned, not taken for a slow device, and 120 comes back with it', () => {
    let sec = 0;
    const r = drive({ hz: 120, seconds: 50, work: 3.8, gen: () => { const d = sec >= 10 && sec < 30 ? 1000 / 60 : 1000 / 120; sec += d / 1000; return d; } });
    expect(r.acts).toEqual([]);
    expect(Math.abs(r.fps - 120)).toBeLessThan(3);
    expect(Math.abs(r.hz - 120)).toBeLessThan(3);
    // mid-switch the readout says 60
    const mid = drive({ hz: 120, seconds: 20, work: 3.8, gen: (i) => (i > 1200 ? 1000 / 60 : 1000 / 120) });
    expect(mid.acts).toEqual([]);
    expect(Math.abs(mid.hz - 60)).toBeLessThan(2);
  });
  it('a JS-bound phone steady at 60 on a 120 Hz screen holds it: no notch (resolution cannot help), nothing shed, no effect cut', () => {
    const r = drive({ hz: 120, seconds: 40, work: 10, gen: () => 2000 / 120 });
    expect(r.acts).toEqual([]);
    expect(Math.abs(r.fps - 60)).toBeLessThan(2);
    expect(r.hz).toBeCloseTo(120, 0);
  });
  it('Low Power Mode (animation frames at 30 from the browser, light work): nothing shed, full resolution, effects kept — on an iPhone at 120 and a laptop at 不限', () => {
    for (const [dpr, fps] of [[3, 120], [2, 0], [3, 60]] as const) {
      const r = drive({ hz: 30, seconds: 30, fps, dpr, work: 1 });
      expect({ dpr, fps, acts: r.acts, degrade: r.degrade, res: r.dpr }).toEqual({ dpr, fps, acts: [], degrade: 0, res: dpr });
      expect(Math.abs(r.hz - 30)).toBeLessThan(1);
    }
    // on for 15 s mid-run, then off: nothing is shed on the way in or out
    let sec = 0;
    const r = drive({ hz: 120, seconds: 40, work: 1, gen: () => { const d = sec >= 5 && sec < 20 ? 1000 / 30 : 1000 / 120; sec += d / 1000; return d; } });
    expect(r.acts).toEqual([]);
    expect(Math.abs(r.fps - 120)).toBeLessThan(3);
  });
  it('a device that is really slow at 30 (its own JS is the frame) still cuts effects', () => {
    const r = drive({ hz: 60, seconds: 12, dpr: 1, work: 30, gen: () => 2000 / 60 });
    expect(r.degrade).toBe(1);
    // JS-bound: straight to the effects (no notch of resolution, which cannot help)
    expect(r.acts.some((a) => a.includes('dpr'))).toBe(false);
  });
  it('the half rate is a steady whole number of vsyncs: 72 on 144 Hz, 82.5 on 165, 60 on 120 and 240', () => {
    for (const [hz, k] of [[144, 2], [165, 2], [120, 2], [240, 4]] as const) {
      const P = 1000 / hz;
      // a drawn frame takes 2 vsyncs, one in five only 1 (240 Hz: 3 and 2), so the aim of 120 is missed by
      // > 20%; a skipped vsync costs nothing (the next comes one vsync on)
      const pat = hz >= 240 ? [3, 3, 2, 3, 3] : [2, 2, 1, 2, 2];
      let j = 0;
      const r = drive({ hz, seconds: 30, dpr: 1, gen: (_i, drew) => (drew ? pat[j++ % 5] : 1) * P });
      const h = r.acts.findIndex((a) => a.endsWith('half true'));
      expect({ hz, half: h >= 0 }).toEqual({ hz, half: true });
      const t0 = 1000 + Number(r.acts[h].split(' ')[0]) * 1000 + 500;
      const after = r.at.filter((t) => t > t0);
      const odd = after.slice(1).map((t, i) => t - after[i]).filter((d) => Math.abs(d - k * P) > 0.3).length;
      expect({ hz, odd }).toEqual({ hz, odd: 0 });
    }
  });
  it('a computer at 不限 never falls to a half rate below the rate it achieves; a phone does, for a steady picture', () => {
    const P = 1000 / 144, pat = [2, 2, 1, 2, 2];
    let j = 0;
    const gen = (_i: number, drew: boolean) => (drew ? pat[j++ % 5] : 1) * P;
    // (80 fps achieved; the half rate would be 72)
    const pc = drive({ hz: 144, seconds: 30, dpr: 1, fine: true, gen });
    expect(pc.acts.some((a) => a.endsWith('half true'))).toBe(false);
    expect(pc.fps).toBeGreaterThan(78);
    const phone = drive({ hz: 144, seconds: 30, dpr: 1, fine: false, gen });
    expect(phone.acts.some((a) => a.endsWith('half true'))).toBe(true);
  });
  it('a steady 72 on a 144 Hz screen (every other vsync) is held as it is: nothing shed, no half rate', () => {
    const r = drive({ hz: 144, seconds: 30, dpr: 1, gen: () => 2000 / 144, work: 9 });
    expect(r.acts).toEqual([]);
    expect(Math.abs(r.fps - 72)).toBeLessThan(2);
  });
  it('a notch that does not raise the rate is given back, and no more are taken', () => {
    // light JS, a 1-1-2 cadence the notch does not change (raster-bound in the model): shed, one notch, back
    const r = drive({ hz: 120, seconds: 12, gen: (i) => (i % 3 === 2 ? 2 : 1) * (1000 / 120) });
    const downs = r.acts.filter((a) => /dpr 3→2\.5$/.test(a)).length, ups = r.acts.filter((a) => /dpr 2\.5→3$/.test(a)).length;
    expect(downs).toBe(1);
    expect(ups).toBe(1);
    expect(r.dpr).toBe(3);
  });
  it('a 120 Hz screen juddering at 90 (2 of 3 vsyncs) falls back to a steady 60, and tries 120 again later without shedding', { timeout: 30_000 }, () => {
    const r = drive({ hz: 120, seconds: 150, gen: (i) => (i % 3 === 2 ? 2 : 1) * (1000 / 120) });
    expect(r.degrade).toBe(0);
    const halves = r.acts.filter((a) => a.endsWith('half true')).length;
    const tries = r.acts.filter((a) => a.endsWith('half false')).length;
    expect(halves).toBeGreaterThanOrEqual(2);
    expect(tries).toBeGreaterThanOrEqual(1);
    // a try sheds nothing: every shed happened before the first half
    const first = r.acts.findIndex((a) => a.endsWith('half true'));
    expect(r.acts.slice(first).filter((a) => a.endsWith(' shed')).length).toBe(0);
    expect(r.acts.slice(first).filter((a) => /dpr \S+→(2\.5|2|1\.5)$/.test(a) && !a.includes('→3')).length).toBe(0);
  });
  it('the same 60 ms hitch every 1.5 s weighs no more on a 144 or 240 Hz screen than on a 60 Hz one', () => {
    const at = (hz: number) => drive({ hz, seconds: 40, dpr: 1, gen: (i) => (i % Math.round(hz * 1.5) === 0 ? 60 : 1000 / hz) }).acts.filter((a) => !a.includes('half'));
    const base = at(60).length;
    expect(at(144).length).toBeLessThanOrEqual(base);
    expect(at(240).length).toBeLessThanOrEqual(base);
  });
  it('the 省电 cap (30) is not mistaken for a slow device; 22 fps under it still is', () => {
    expect(drive({ hz: 60, seconds: 30, fps: 30, dpr: 1 }).acts).toEqual([]);
    const slow = drive({ hz: 60, seconds: 12, fps: 30, dpr: 1, gen: () => 45, work: 30 });
    expect(slow.degrade).toBe(1);
  });
});

describe('帧率 · the setting', () => {
  it('sanitizeMirror keeps 帧率 when it is one of the four, 显示帧率 and the tip flag only when true', () => {
    const base = defaultMeta('2026-09-30');
    const s = (x: Any) => sanitizeMirror({ ...base, settings: { ...base.settings, ...x } }, '2026-09-30').settings as Any;
    for (const v of [0, 30, 60, 120]) expect(s({ fps: v }).fps).toBe(v);
    for (const v of [45, '120', null, -1, 1e9, true]) expect('fps' in s({ fps: v })).toBe(false);
    expect(s({ showFps: true }).showFps).toBe(true);
    expect('showFps' in s({ showFps: 'yes' })).toBe(false);
    expect(s({ fpsTip: true }).fpsTip).toBe(true);
    expect('fpsTip' in s({ fpsTip: 1 })).toBe(false);
    // the default is left missing: each device takes its own (120 on a phone, 不限 on a computer)
    expect('fps' in sanitizeMirror(base, '2026-09-30').settings).toBe(false);
  });
});
