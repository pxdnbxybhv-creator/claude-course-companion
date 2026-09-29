// 水月幻镜 · walking reads the same in every direction (the owner: 「往往向上走慢，向下快」): the stick
// gives full speed early, so a few px of thumb offset cannot split up from down, and the pad settling
// in the first 100 ms re-anchors the base instead of becoming a push; the base follows a thumb that runs
// past the rim; world speed is the same in all 8 directions; a 60 Hz display with a coarse rAF clock
// steps the world once a frame and the figure never slides back against the ground; 广寒's 桂树 neither
// stands in front of you at the start nor stops a head-on push dead.
import { describe, expect, it } from 'vitest';
import type { EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun } from '../src/views/mirror/logic';
import { wavePlan } from '../src/views/mirror/logic/spawn';
import { computeStats } from '../src/views/mirror/logic/formulas';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { keysVector, stickFollow, stickVector, STICK_R } from '../src/views/mirror/ui/text';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
const EMPTY = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const HOOKS = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return { seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o };
}
/** The wave's setup built from the run alone (no meta: the engine tests never load src/app). */
function setupOf(run: RunSave): WaveSetup {
  const w = run.inWave ?? run.wave + 1;
  return { wave: w, plan: wavePlan(run, w), coins: [], mutators: [], term: run.term, sky: { fullMoonDay: false, lunation: 0.5, fullWave: false }, stats: computeStats(run) };
}
function canvas(w: number, h: number) {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
const SETTINGS = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', view: 'mid' } as EngineSettings;
function engineOn(map: 'lake' | 'palace', w = 390, h = 844, keepObstacles = false): MirrorEngine {
  const run = beginWave({ ...newRun(opts({ map })), wave: 3 } as RunSave);
  const eng = createEngine(canvas(w, h), run, { painter: createDebugPainter(run.map, 'high', 1), audio: SILENT, content: EMPTY as never, hooks: HOOKS, settings: { ...SETTINGS } }) as MirrorEngine;
  eng.start(run, setupOf(run));
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  if (!keepObstacles) (W.arena.obstacles as unknown[]).length = 0;
  return eng;
}
const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const mag = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('walking · the stick', () => {
  it('reaches full speed by 20 px of thumb travel, in every direction', () => {
    for (const d of [20, 24, 30, 40, 56, 90]) for (const [x, y] of DIRS) {
      const n = Math.hypot(x, y);
      expect(mag(stickVector((x / n) * d, (y / n) * d))).toBeGreaterThan(0.999);
    }
  });
  it('a few px of thumb offset (the pad settling after touchdown) cannot make up slower than down', () => {
    // the same thumb travel up and down, the reported point b px lower than the thumb's
    for (const [d, b] of [[30, 3], [30, 6], [40, 10], [56, 16]]) {
      const up = mag(stickVector(0, -d + b)), down = mag(stickVector(0, d + b));
      expect(up / down).toBeGreaterThan(0.98);
    }
  });
  it('a push that starts at touchdown is never eaten', () => {
    // touch events at 60 / 120 Hz; an ease-out push of d px at v px/s from the first event; the pad
    // settles b px toward the palm over 40 ms. A settle re-anchor near touchdown (round 5's first try)
    // chased any thumb moving < 8 px an event: 20% of these pushes stood still, and up ÷ down fell to 0.
    for (const hz of [60, 120]) for (const v of [150, 300, 500, 900]) for (const d of [30, 40, 56]) for (const b of [0, 3, 6, 10]) for (const uy of [-1, 1]) {
      const a = { x: 100, y: 600 };
      let m = 0;
      const Tp = (2 * d) / v * 1000;
      for (let k = 1; k < 400; k++) {
        const t = k * 1000 / hz, u = Math.min(1, t / Tp), s = d * (1 - (1 - u) ** 2), py = 600 + uy * s + b * Math.min(1, t / 40);
        stickFollow(a, 100, py);
        m = mag(stickVector(0, py - a.y));
        if (u >= 1 && t > 250) break;
      }
      expect(m).toBeGreaterThan(0.98);
    }
  });
  it('the base follows a thumb that runs past its rim, so turning round is one short move', () => {
    const a = { x: 100, y: 300 };
    stickFollow(a, 100, 150); // the thumb ran 150 px up
    expect(300 - a.y).toBeCloseTo(150 - STICK_R, 5);
    // now 30 px back down (past the anchor) walks down at full speed
    const v = stickVector(100 - a.x, 150 + STICK_R + 30 - a.y);
    expect(v.y).toBeGreaterThan(0.999);
  });
});

describe('walking · the engine', () => {
  it('world speed is the same in all 8 directions, from the keys and from the stick', () => {
    const speeds: number[] = [];
    for (const [x, y] of DIRS) for (const src of ['keys', 'stick'] as const) {
      const eng = engineOn('lake');
      const W = eng.world;
      const v = src === 'keys'
        ? keysVector(new Set([x < 0 ? 'a' : x > 0 ? 'd' : '', y < 0 ? 'w' : y > 0 ? 's' : ''].filter(Boolean)))
        : stickVector((x / Math.hypot(x, y)) * 60, (y / Math.hypot(x, y)) * 60);
      eng.input.move(v.x, v.y);
      eng.stepN(12);
      const x0 = W.px, y0 = W.py;
      eng.stepN(30);
      speeds.push(Math.hypot(W.px - x0, W.py - y0) * 2);
      eng.dispose();
    }
    for (const s of speeds) expect(s).toBeCloseTo(280, 1);
  });

  it('a 60 Hz display with a coarse rAF clock (17, 17, 16 ms …) steps the world once every frame, also at 59.94 / 60.02 Hz', () => {
    for (const hz of [60, 59.94, 60.02]) {
      const eng = engineOn('lake');
      const W = eng.world;
      eng.input.move(0, -1);
      let bad = 0;
      for (let i = 0; i < hz * 30; i++) {
        const before = W.tWave;
        eng.frame(1000 + Math.floor((i * 1000) / hz)); // Safari's 1 ms clock
        if (i > 2 && Math.round((W.tWave - before) * 60) !== 1) bad++;
      }
      expect({ hz, bad }).toEqual({ hz, bad: 0 });
      eng.dispose();
    }
  });

  it('on a 120 Hz screen the figure never slides back against the ground while you walk', () => {
    for (const [w, h, dx, dy] of [[1280, 800, 1, 0], [1280, 800, 0, -1], [390, 844, 1, 0], [390, 844, 0, 1]] as const) {
      const eng = engineOn('lake', w, h);
      (eng as unknown as { ctx: unknown }).ctx = {};
      type Cam = { x: number; y: number; scale: number; dpr: number };
      const R = (eng as unknown as { renderer: { draw: (Wd: { px: number; py: number }, c: unknown, cam: Cam) => void } }).renderer;
      let s = 0;
      R.draw = (D, _c, c) => {
        const k = c.scale / c.dpr;
        s = ((D.px - c.x) * dx + (D.py - c.y) * dy) * k; // your screen position along the walk (css px), as drawn
      };
      eng.input.move(dx, dy);
      // (from 0.9 s: the camera's lead toward where you run has eased in over its first 0.3–0.8 s)
      let now = 1000, prev: number | null = null, back = 0;
      for (let i = 0; i < 220; i++) {
        eng.frame((now += 1000 / 120));
        if (i > 108 && prev !== null && s - prev < -0.25) back++;
        prev = s;
      }
      expect(back).toBe(0);
      eng.dispose();
    }
  });
});

describe('walking · 广寒', () => {
  it('from a wave start, walking up is not stopped by the 桂树 within the first half second', () => {
    const dist: number[] = [];
    for (const dy of [-1, 1]) {
      const eng = engineOn('palace', 390, 844, true);
      const W = eng.world;
      const y0 = W.py;
      eng.input.move(0, dy);
      eng.stepN(30);
      dist.push((W.py - y0) * dy);
      eng.dispose();
    }
    expect(dist[0]).toBeGreaterThan(dist[1] * 0.95); // the old start: 56 u up (then stuck under the tree) against 134 u down
  });

  it('a head-on push into the 桂树 from any side slides round it at ≥ 80% of your speed', () => {
    for (let k = 0; k < 8; k++) {
      const eng = engineOn('palace', 390, 844, true);
      const W = eng.world;
      const o = W.arena.obstacles.find((b) => Math.hypot(b.x, b.y) < b.r + W.pr)!;
      expect(o).toBeTruthy();
      const a = (k / 8) * Math.PI * 2, m = o.r + W.pr;
      W.px = o.x + Math.cos(a) * (m + 1); W.py = o.y + Math.sin(a) * (m + 1);
      eng.input.move(-Math.cos(a), -Math.sin(a)); // straight at the tree's heart
      eng.stepN(6);
      let path = 0, x = W.px, y = W.py;
      for (let s = 0; s < 18; s++) { eng.stepN(1); path += Math.hypot(W.px - x, W.py - y); x = W.px; y = W.py; }
      // the old collision: 0 u (a straight push into a circle has no sideways part)
      expect({ k, fast: path / (18 / 60) >= 0.8 * W.moveSpd }).toEqual({ k, fast: true });
      // … and never through it
      expect(Math.hypot(W.px - o.x, W.py - o.y)).toBeGreaterThanOrEqual(m - 1e-3);
      eng.dispose();
    }
  });
});
