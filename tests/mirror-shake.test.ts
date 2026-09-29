// 水月幻镜 · 屏幕抖动 (round 5): nothing moves on screen that the player did not cause.
//   · render interpolation: the figure you steer stands still on screen while you run, at 60 (and a
//     real panel's 59.94), 90, 120 and 144 Hz and with Chrome's 0.1 ms / Safari's 1 ms timestamps (the
//     fixed 60 Hz simulation is drawn between its last two steps; the old loop drew the last step
//     against a camera that moved every frame: a 1–5 px judder of every figure against the ground);
//   · vsync snap: a 60 Hz display that is really 59.94 / 60.02 / 60.05 Hz runs exactly one step a frame;
//   · the lerp is drawing-only (the simulation is bit-identical with it on) and covers zones (their
//     radius too) and damage numbers;
//   · the camera: no swing back when you stop, a dash glides instead of whip-panning, no camera motion
//     from hits, slams, phases, deaths, the 镜技 or a blow you take; no world freeze in ordinary play;
//   · your own figure: a blow no longer knocks it across the screen or blinks it at 10 Hz;
//   · dynamic resolution: a notch is applied before a frame draws (never leaves the canvas cleared)
//     and keeps the boss zoom.
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import { allUnlocked, beginWave, newRun } from '../src/views/mirror/logic';
import { wavePlan } from '../src/views/mirror/logic/spawn';
import { computeStats } from '../src/views/mirror/logic/formulas';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const SILENT = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} } as unknown as MirrorAudio;
const HOOKS = { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} };
const opts = (o: Partial<NewRunOpts> = {}): NewRunOpts => ({
  seed: 4242, char: 'guan', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
  runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
});
function setupOf(run: RunSave): WaveSetup {
  const w = run.inWave ?? run.wave + 1;
  return { wave: w, plan: wavePlan(run, w), coins: [], mutators: [], term: run.term, sky: { fullMoonDay: false, lunation: 0.5, fullWave: false }, stats: computeStats(run) };
}
interface Drawn { px: number; py: number; ex: number; cx: number; cy: number; s: number; zr: number; zx: number; nx: number }
type Cam = { x: number; y: number; scale: number; dpr: number; w: number; h: number };
/** An engine on a 390×844 (or 1280×800) canvas whose draw is recorded: where the figure and the
 *  camera were when the frame was drawn (css px per u = scale / dpr). */
function make(o: { w?: number; h?: number; wave?: number; char?: NewRunOpts['char']; weapons?: [WeaponId, 1 | 2 | 3 | 4][]; settings?: Partial<EngineSettings>; content?: ContentRegistry; empty?: boolean; noDraw?: boolean } = {}) {
  const w = o.w ?? 390, h = o.h ?? 844;
  const cv = { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
  let run: RunSave = { ...newRun(opts(o.char ? { char: o.char } : {})), weapons: (o.weapons ?? []).map(([id, t]) => ({ id, t })), wave: (o.wave ?? 3) - 1 };
  run = beginWave(run);
  const settings: EngineSettings = { quality: 'mid', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...o.settings };
  const eng = createEngine(cv, run, { painter: createDebugPainter('lake', 'mid', 1), audio: SILENT, content: o.content ?? EMPTY, hooks: HOOKS, settings }) as MirrorEngine;
  const setup = setupOf(run);
  if (o.empty !== false) setup.plan = { ...setup.plan, groups: [], elites: [], treasures: [] };
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = true;
  if (o.empty !== false) { W.len = 1e9; (W.arena.obstacles as unknown[]).length = 0; }
  const drawn: Drawn[] = [];
  const E = eng as unknown as { ctx: unknown; renderer: { draw: (W: MirrorEngine['world'], ctx: unknown, cam: Cam) => void } };
  if (!o.noDraw) E.ctx = {};
  let track = -1, zone = -1, num = -1;
  let also: ((Wd: MirrorEngine['world'], cam: Cam) => void) | null = null;
  E.renderer.draw = (Wd, _ctx, cam) => {
    drawn.push({ px: Wd.px, py: Wd.py, ex: track >= 0 ? Wd.E.x[track] : NaN, cx: cam.x, cy: cam.y, s: cam.scale / cam.dpr,
      zr: zone >= 0 ? Wd.Z.r[zone] : NaN, zx: zone >= 0 ? Wd.Z.x[zone] : NaN, nx: num >= 0 ? Wd.N.x[num] : NaN });
    also?.(Wd, cam);
  };
  return { eng, W, drawn, cv, track: (i: number) => { track = i; }, zone: (i: number) => { zone = i; }, num: (i: number) => { num = i; }, also: (f: typeof also) => { also = f; } };
}
/** rAF timestamps: `hz`, rounded like a browser (Chrome 0.1 ms, Safari 1 ms), with a little jitter. */
function clock(hz: number, n: number, round: 0.1 | 1, seed = 7): number[] {
  let s = seed; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out: number[] = []; let t = 1000.37;
  for (let i = 0; i < n; i++) { t += 1000 / hz; const v = t + (r() - 0.5) * 0.3; out.push(round === 1 ? Math.floor(v) : Math.round(v * 10) / 10); }
  return out;
}
/** The high-frequency part of a screen path (css px): each frame's displacement minus its centred
 *  7-frame mean. Smooth motion at any speed scores 0; a figure that jumps 0/2 steps scores the jump. */
function judder(xs: number[], ys: number[]): number[] {
  const d: [number, number][] = [];
  for (let i = 1; i < xs.length; i++) d.push([xs[i] - xs[i - 1], ys[i] - ys[i - 1]]);
  const out: number[] = [];
  for (let i = 3; i < d.length - 3; i++) {
    let mx = 0, my = 0; for (let k = -3; k <= 3; k++) { mx += d[i + k][0]; my += d[i + k][1]; }
    out.push(Math.hypot(d[i][0] - mx / 7, d[i][1] - my / 7));
  }
  return out;
}
const rms = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));
const p99 = (a: number[]) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * 0.99))] ?? 0; };

describe('屏幕抖动: the fixed-step loop is drawn smoothly', () => {
  for (const [hz, round] of [[60, 0.1], [60, 1], [59.94, 0.1], [59.94, 1], [90, 0.1], [120, 0.1], [144, 0.1]] as const) {
    for (const [w, h] of [[390, 844], [1280, 800]] as const) {
      it(`running at full speed, the figure stands still on screen (${hz} Hz, ${round} ms stamps, ${w}×${h})`, () => {
        const { eng, W, drawn } = make({ w, h });
        eng.input.move(1, 0);
        const T = clock(hz, Math.round(hz * 1.6), round);
        for (const t of T) eng.frame(t);
        // the last second (the camera settled): the figure's path on screen is flat
        const tail = drawn.slice(-Math.round(hz * 1));
        const sx = tail.map((d) => (d.px - d.cx) * d.s), sy = tail.map((d) => (d.py - d.cy) * d.s);
        const j = judder(sx, sy);
        expect(W.pvx).toBeGreaterThan(200); // really running
        expect(rms(j)).toBeLessThan(0.15);
        expect(p99(j)).toBeLessThan(0.5); // the old loop: 1.2–5.5 px at 60 Hz, 1–2.6 px every other frame at 120 Hz
        eng.dispose();
      });
    }
  }

  it('a real "60 Hz" panel (59.94, 60.02, 60.05 Hz) runs exactly one simulation step a frame for a minute', () => {
    for (const hz of [59.94, 60.02, 60.05]) for (const round of [0.1, 1] as const) {
      const { eng, W } = make({ noDraw: true });
      let n = 0; const s0 = W.step.bind(W); W.step = (dt: number) => { n++; s0(dt); };
      let bad = 0, frames = 0;
      for (const t of clock(hz, Math.round(hz * 60), round, 11)) { const n0 = n; eng.frame(t); if (frames++ > 0 && n - n0 !== 1) bad++; }
      // the old loop: 0.4–3.3% of frames ran 0 or 2 steps (a figure that stops, then jumps a step)
      expect({ hz, round, bad }).toEqual({ hz, round, bad: 0 });
      eng.dispose();
    }
  });

  it('the lerp is drawing only: the simulation is bit-identical with or without drawing, and a reused slot is never slid from its last owner', () => {
    const play = (noDraw: boolean) => {
      const r = make({ wave: 8, weapons: [['yanyue', 3], ['qingfeng', 2]], empty: false, content: CONTENT, noDraw });
      const hist: number[] = [];
      let k = 0;
      for (const t of clock(120, 1200, 0.1)) {
        r.eng.input.move(Math.cos(k / 50), Math.sin(k / 70)); k++;
        r.eng.frame(t);
        let sx = 0; for (let i = 0; i < r.W.E.n; i++) if (r.W.E.alive[i]) sx += r.W.E.x[i] * (i + 1);
        let zx = 0; for (let i = 0; i < r.W.Z.n; i++) if (r.W.Z.alive[i]) zx += (r.W.Z.x[i] + r.W.Z.r[i]) * (i + 1);
        let nx = 0; for (let i = 0; i < r.W.N.n; i++) if (r.W.N.alive[i]) nx += r.W.N.x[i] * (i + 1);
        hist.push(r.W.px, r.W.py, r.W.E.count, sx, r.W.PS.count, zx, nx, r.W.t);
      }
      r.eng.dispose();
      return hist;
    };
    expect(play(false)).toEqual(play(true));
    // a slot freed and taken again between two steps: the new body is drawn where it is, not on the
    // path from where the old one was
    const { eng, W, drawn, track } = make();
    let t = 1000;
    for (let f = 0; f < 20; f++) eng.frame((t += 1000 / 120));
    const a = W.E.slotOf(W.spawn('blot', W.px - 300, W.py, { bloom: false }));
    eng.frame((t += 1000 / 120)); eng.frame((t += 1000 / 120)); eng.frame((t += 1000 / 120));
    W.E.release(a);
    const b = W.E.slotOf(W.spawn('blot', W.px + 300, W.py + 200, { bloom: false }));
    expect(b).toBe(a); // the same slot, a new generation
    track(b);
    eng.frame((t += 1000 / 120)); eng.frame((t += 1000 / 120));
    expect(Math.abs(drawn[drawn.length - 1].ex - W.E.x[b])).toBeLessThan(10);
    eng.dispose();
  });

  it('zones (their radius too) and damage numbers are drawn between steps like everything else (120 Hz)', () => {
    const { eng, W, drawn, zone, num } = make();
    let t = 1000;
    for (let f = 0; f < 12; f++) eng.frame((t += 1000 / 120));
    // a ring that grows 300 u/s (涟漪) and a zone that follows you while you walk; a number in flight
    const zi = W.zone({ side: 'player', look: 'ripple' as never, x: W.px, y: W.py, r: 40, life: 60, follow: 'player' }) % 1024;
    const s0 = W.step.bind(W); W.step = (dt: number) => { s0(dt); if (W.Z.alive[zi]) W.Z.r[zi] += 300 * dt; };
    const ni = W.addNum(12, W.px, W.py - 30, 0);
    W.N.vx[ni] = 180; W.N.vy[ni] = 0;
    zone(zi); num(ni);
    eng.input.move(1, 0);
    const at = drawn.length;
    for (let f = 0; f < 24; f++) eng.frame((t += 1000 / 120));
    const d = drawn.slice(at + 2);
    // every frame moves on (the old loop held them still on every other frame, then jumped a step)
    let heldR = 0, heldN = 0, detached = 0;
    for (let k = 1; k < d.length; k++) {
      if (!(d[k].zr > d[k - 1].zr + 1e-3)) heldR++;
      if (Number.isFinite(d[k].nx) && Number.isFinite(d[k - 1].nx) && !(Math.abs(d[k].nx - d[k - 1].nx) > 1e-3)) heldN++;
      if (Math.abs(d[k].zx - d[k].px) > 0.01) detached++; // a following zone sits on the drawn you
    }
    expect({ heldR, heldN, detached }).toEqual({ heldR: 0, heldN: 0, detached: 0 });
    eng.dispose();
  });
});

describe('屏幕抖动: the camera moves only because you do', () => {
  it('when you let go of the stick the view does not swing back against your last heading', () => {
    for (const [w, h] of [[390, 844], [1280, 800]] as const) {
      const { eng, W, drawn } = make({ w, h });
      let t = 1000;
      eng.input.move(1, 0);
      for (let f = 0; f < 60; f++) eng.frame((t += 1000 / 60));
      eng.input.move(0, 0);
      const at = drawn.length;
      for (let f = 0; f < 60; f++) eng.frame((t += 1000 / 60));
      expect(W.pvx).toBe(0);
      // the camera's travel against the heading after the stop (css px): the old camera swung back ≈ 17 px
      let back = 0;
      for (let k = at; k < drawn.length; k++) back = Math.min(back, (drawn[k].cx - drawn[at].cx) * drawn[k].s);
      expect(-back).toBeLessThan(0.5);
      eng.dispose();
    }
  });

  it('a dash (一剑光寒 260 u) glides: the camera never pans faster than twice your walk and settles within 0.4 s', () => {
    for (const char of ['guan', 'swordsman'] as const) for (const hz of [60, 120]) {
      const { eng, W, drawn } = make({ char, w: 1280, h: 800 });
      let t = 1000;
      for (let f = 0; f < hz; f++) eng.frame((t += 1000 / hz));
      const at = drawn.length;
      W.dash(1, 0, 260, 0.22);
      let endAt = -1;
      for (let f = 0; f < hz * 1.2; f++) { eng.frame((t += 1000 / hz)); if (endAt < 0 && W.dashT <= 0) endAt = drawn.length - 1; }
      let peak = 0;
      for (let k = at + 1; k < drawn.length; k++) peak = Math.max(peak, Math.abs(drawn[k].cx - drawn[k - 1].cx) * hz);
      // after 0.4 s the view has come to rest over you (within 1 css px of where it stays)
      const rest = drawn[drawn.length - 1];
      const settle = drawn.slice(endAt + Math.round(0.4 * hz));
      const off = Math.max(...settle.map((d) => Math.abs(d.cx - rest.cx) * d.s));
      expect(W.px - drawn[at].px).toBeGreaterThan(250);
      expect({ char, hz, fast: peak > 2 * W.moveSpd * 1.05 }).toEqual({ char, hz, fast: false }); // the old follow: ≈ 5× your walk
      expect(off).toBeLessThan(1);
      eng.dispose();
    }
  });

  it('slams, phases, a boss falling, a hard blow and the 镜技 never offset or zoom the camera; ordinary play never freezes the world', () => {
    const { eng, W } = make({ wave: 8, weapons: [['yanyue', 4], ['pestle', 4], ['yanyue', 4]], content: CONTENT });
    W.stats.crit = 80;
    // a crowd of immortal bodies around you, and an elite that dies (an elite kill used to stop the world)
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2, d = 60 + (k % 4) * 25;
      const i = W.E.slotOf(W.spawn('blot', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false }));
      if (i >= 0) { W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0; }
    }
    let t = 1000, worst = 0, zoom = 0, frozen = 0;
    for (let f = 0; f < 60 * 12; f++) {
      if (f === 60) { W.shake(5); W.feel.phase(W.px, W.py); }
      if (f === 120) W.feel.bossDown(W.px, W.py);
      if (f === 180) W.feel.hurt(W.px + 40, W.py, true, 0.4);
      if (f === 240) W.feel.skillImpact(W.px, W.py);
      if (W.hitstopMs > 0) frozen++;
      eng.frame((t += 1000 / 60));
      worst = Math.max(worst, Math.hypot(W.feel.offX, W.feel.offY)); zoom = Math.max(zoom, W.feel.zoom);
    }
    expect(worst).toBe(0);
    expect(zoom).toBe(0);
    expect(W.feel.st.hits).toBeGreaterThan(50);
    expect(frozen).toBe(0); // heavy crits, elite kills, the 镜技 and a hard blow no longer stop the world
    eng.dispose();
  });

  it('a blow you take never knocks your figure more than 2.5 u off you, and the i-frames never blink faster than 4 Hz', () => {
    const { eng, W, also } = make();
    const R = (eng as unknown as { renderer: { drawPlayer: (W: unknown, ctx: unknown, cam: unknown) => void } }).renderer;
    // a recording canvas: the figure is the debug painter's 14 u circle
    const rec = { x: NaN, y: NaN, a: 1 };
    const ctx = new Proxy({ fillStyle: '', globalAlpha: 1 } as Record<string, unknown>, {
      get: (o, k) => (k in o ? o[k as string] : k === 'arc'
        ? (x: number, y: number, r: number) => { if (o.fillStyle === '#f4f1e8' && r > 5) { rec.x = x; rec.y = y; rec.a = o.globalAlpha as number; } }
        : () => {}),
      set: (o, k, v) => { o[k as string] = v; return true; },
    });
    let worst = 0, toggles = 0, lastA = -1;
    also((Wd, cam) => {
      rec.x = NaN;
      R.drawPlayer(Wd, ctx, cam);
      if (!Number.isFinite(rec.x)) return;
      const wx = (rec.x - cam.w / 2) / cam.scale + cam.x, wy = (rec.y - cam.h / 2) / cam.scale + cam.y;
      worst = Math.max(worst, Math.hypot(wx - Wd.px, wy - Wd.py));
      if (lastA >= 0 && Math.abs(rec.a - lastA) > 0.05) toggles++;
      lastA = rec.a;
    });
    let t = 1000;
    for (let f = 0; f < 60 * 30; f++) {
      if (f % 30 === 0) { W.feel.hurt(W.px + 40 * Math.cos(f), W.py + 40 * Math.sin(f), f % 60 === 0, 0.3); W.iframes = 0.5; }
      eng.frame((t += 1000 / 60));
    }
    expect(worst).toBeLessThan(2.5); // the old knock: 5–7 u (3–8 css px) at the centre of the screen
    // 60 hurts: a steady half-tone may switch on and off once per hurt (≤ 2 per 0.5 s = 4 Hz), never at 10 Hz
    expect(toggles / 30).toBeLessThanOrEqual(4);
    eng.dispose();
  });
});

describe('屏幕抖动: dynamic resolution', () => {
  const g = globalThis as unknown as { window?: unknown };
  const saved = g.window;
  afterEach(() => { g.window = saved; });
  it('a notch is applied before the frame draws (the canvas is never left cleared) and keeps the boss zoom', () => {
    g.window = { devicePixelRatio: 3 };
    const { eng, W, cv, drawn } = make({ settings: { dprCap: 3 } });
    // a canvas whose size assignment clears it (as a browser does): a draw must follow in the same frame
    let cleared = false, w0 = cv.width, h0 = cv.height;
    Object.defineProperty(cv, 'width', { get: () => w0, set: (v: number) => { w0 = v; cleared = true; } });
    Object.defineProperty(cv, 'height', { get: () => h0, set: (v: number) => { h0 = v; cleared = true; } });
    const R = (eng as unknown as { renderer: { draw: (...a: unknown[]) => void } }).renderer;
    const d0 = R.draw.bind(R); R.draw = (...a: unknown[]) => { cleared = false; d0(...a); };
    // a boss on the field: the camera zooms out
    W.bossH.push(-1);
    let t = 1000;
    for (let f = 0; f < 120; f++) eng.frame((t += 1000 / 60));
    const zoom0 = eng.camera.scale / eng.camera.dpr;
    let notches = 0, lastRes = eng.resolution, maxJump = 0, prevS = zoom0 / (390 / 700);
    for (let f = 0; f < 60 * 12; f++) {
      eng.frame((t += 40)); // slow frames: the guard steps the resolution down
      expect(cleared).toBe(false);
      if (eng.resolution !== lastRes) { notches++; lastRes = eng.resolution; }
      const s = eng.camera.scale / eng.camera.dpr / (390 / 700);
      maxJump = Math.max(maxJump, Math.abs(s / prevS - 1)); prevS = s;
      if (W.degrade) break;
    }
    expect(notches).toBeGreaterThanOrEqual(2);
    expect(maxJump).toBeLessThan(0.01); // the old resize reset the boss zoom: an 8.7% jump in one frame
    // a window resize mid-wave (the UI's ResizeObserver runs after the frame drew): redrawn at once
    w0 = 0;
    (cv as unknown as { getBoundingClientRect: () => { width: number; height: number } }).getBoundingClientRect = () => ({ width: 400, height: 820 });
    eng.resize();
    expect(cleared).toBe(false);
    W.bossH.length = 0;
    void drawn;
    eng.dispose();
  });
});
