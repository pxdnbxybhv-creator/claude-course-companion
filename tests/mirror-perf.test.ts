// 水月幻镜 · the frame's hot loops (m7 PERF): the cheaper draws must put every pixel where the old ones did.
// A context that composes the transform records each drawImage's device-space quad; the tests compare
// those quads with the old per-sprite matrices (blit, blitRot), check that nothing wholly off the canvas
// makes a call, that a run of shots turning together shares one setTransform, and that the trail pool
// is swept at most once a frame however many shots it refuses.
import { describe, expect, it } from 'vitest';
import type { AtlasId, Camera, ContentRegistry, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, Painter, RunSave, Sprite, WaveSetup } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { Renderer } from '../src/views/mirror/engine/render';
import { Trails, TG, TSY } from '../src/views/mirror/engine/trails';
import { PK } from '../src/views/mirror/engine/consts';
import { SF, SMode } from '../src/views/mirror/engine/pools';
import { blit, blitAt, blitRot, offCanvas, reach } from '../src/views/mirror/paint/draw';

type Quad = { img: unknown; pts: number[]; a: number };
/** A context that keeps the current matrix and records every drawImage as its four device corners. */
function matCtx() {
  let m = [1, 0, 0, 1, 0, 0];
  let alpha = 1;
  const quads: Quad[] = [];
  const calls = { setTransform: 0, drawImage: 0, alpha: 0 };
  const P = (x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const target: Record<string, unknown> = {
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { calls.setTransform++; m = [a, b, c, d, e, f]; },
    drawImage(img: unknown, ...r: number[]) {
      calls.drawImage++;
      const [dx, dy, dw, dh] = r.length >= 8 ? r.slice(4) : r.length >= 4 ? r : [r[0], r[1], 0, 0];
      quads.push({ img, a: alpha, pts: [...P(dx, dy), ...P(dx + dw, dy), ...P(dx + dw, dy + dh), ...P(dx, dy + dh)] });
    },
    beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, closePath() {}, fillRect() {}, strokeRect() {},
    fillText() {}, save() {}, restore() {}, quadraticCurveTo() {}, translate() {}, scale() {}, rotate() {}, rect() {}, clip() {},
    measureText: () => ({ width: 10 }), createPattern: () => null,
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : k === 'globalAlpha' ? alpha : () => {}),
    set: (_t, k, v) => { if (k === 'globalAlpha') { calls.alpha++; alpha = v; } return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, quads, calls, reset: () => { quads.length = 0; calls.setTransform = calls.drawImage = calls.alpha = 0; } };
}
const close = (a: number[], b: number[], eps = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps * Math.max(1, Math.abs(b[i])));
const IMG = { tag: 'atlas' };
const spr = (w: number, h: number, ax = 0.5, ay = 0.5): Sprite => ({ img: IMG as unknown as CanvasImageSource, sx: 3, sy: 5, sw: w * 2, sh: h * 2, w, h, ax, ay });
const CAM: Camera = { x: 100, y: -40, scale: 2.7, w: 1170, h: 2532, dpr: 3 };

describe('blit helpers: the same pixels with fewer calls', () => {
  it('blitAt (a destination rect under the identity) maps the sprite exactly where blit did', () => {
    for (const [s, x, y, size] of [[spr(20, 10), 120, -30, 1], [spr(33, 17, 0.3, 0.8), -80, 60, 1.4], [spr(8, 8), 300, 400, 0.55]] as const) {
      const A = matCtx(), B = matCtx();
      blit(A.ctx, CAM, s, x, y, size);
      B.ctx.setTransform(1, 0, 0, 1, 0, 0);
      blitAt(B.ctx, CAM, s, x, y, size);
      expect(A.quads.length).toBe(1); expect(B.quads.length).toBe(1);
      expect(close(B.quads[0].pts, A.quads[0].pts)).toBe(true);
    }
  });
  it('a sprite wholly off the canvas makes no call at all; one a pixel inside still draws', () => {
    const s = spr(20, 10);
    const R = reach(s, CAM.scale * 1.2);
    // the screen x of world x: (x − cam.x)·scale + w/2
    const wx = (sx: number) => (sx - CAM.w / 2) / CAM.scale + CAM.x;
    const wy = (sy: number) => (sy - CAM.h / 2) / CAM.scale + CAM.y;
    for (const [sx, sy, drawn] of [[-R - 1, 500, false], [-R + 1, 500, true], [CAM.w + R + 1, 500, false], [600, CAM.h + R - 1, true], [600, -R - 2, false]] as const) {
      const C = matCtx();
      blitRot(C.ctx, CAM, s, wx(sx), wy(sy), 0.7, 1.2, 0.5);
      blit(C.ctx, CAM, s, wx(sx), wy(sy), 1.2 / Math.SQRT2, false, 0.5);
      expect(C.calls.drawImage > 0).toBe(drawn);
      if (!drawn) { expect(C.calls.setTransform).toBe(0); expect(C.calls.alpha).toBe(0); }
      expect(offCanvas(CAM, sx, sy, R)).toBe(!drawn);
    }
  });
});

// ─────────────────────────────────────────── the shots layer
const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const SILENT = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} } as unknown as MirrorAudio;
const HOOKS: EngineHooks = { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} };
function opts(): NewRunOpts {
  return {
    seed: 77, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  };
}
/** A debug painter whose projectiles have a sprite (the rest stay plain circles). */
function painter(): Painter {
  const P = createDebugPainter('lake', 'high', 1);
  const dart = spr(12, 12);
  const sprite = (id: AtlasId, v?: number): Sprite | null => { void v; return id.startsWith('proj:') ? dart : null; };
  return new Proxy(P, { get: (t, k) => (k === 'sprite' ? sprite : (t as unknown as Record<string | symbol, unknown>)[k]) }) as Painter;
}
function world() {
  const run: RunSave = beginWave({ ...newRun(opts()), wave: 4, weapons: [] });
  const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  const cv = { width: 390, height: 844, clientWidth: 390, clientHeight: 844, getContext: () => null, getBoundingClientRect: () => ({ width: 390, height: 844 }) } as unknown as HTMLCanvasElement;
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(cv, run, { painter: createDebugPainter('lake', 'high', 1), audio: SILENT, content: EMPTY, hooks: HOOKS, settings }) as MirrorEngine;
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = true; W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
  return { eng, W };
}
function shot(W: ReturnType<typeof world>['W'], x: number, y: number, vx: number, vy: number, mode: number): number {
  const PS = W.PS, i = PS.spawnSlot();
  PS.x[i] = x; PS.y[i] = y; PS.vx[i] = vx; PS.vy[i] = vy; PS.speed[i] = Math.hypot(vx, vy);
  PS.life[i] = PS.life0[i] = 1; PS.kind[i] = PK.dartStar; PS.dmg[i] = 0; PS.r[i] = 6; PS.pierce[i] = 9;
  PS.flags[i] = SF.projectile; PS.mode[i] = mode; PS.tx[i] = 300; PS.aux[i] = 0; PS.slot[i] = -1;
  return i;
}

describe('player shots: one turned frame per shot, shared along a spin', () => {
  it('every shot lands exactly where blitRot put it, with one setTransform per distinct angle and none off the canvas', () => {
    const { eng, W } = world();
    const cam: Camera = { x: W.px, y: W.py, scale: 1.3, w: 390, h: 844, dpr: 1 };
    const want: { i: number; ang: number }[] = [];
    // eight boomerangs (one shared spin angle), five straight darts at their own angles, three far off screen
    for (let k = 0; k < 8; k++) want.push({ i: shot(W, W.px + 40 * k - 150, W.py + 25 * k - 90, 300, 50 * k, SMode.BoomOut), ang: NaN });
    for (let k = 0; k < 5; k++) { const a = k * 1.1 - 2; want.push({ i: shot(W, W.px - 60 + 30 * k, W.py + 140, Math.cos(a) * 400, Math.sin(a) * 400, SMode.Straight), ang: a }); }
    for (let k = 0; k < 3; k++) shot(W, W.px + 5000 + k * 30, W.py, 300, 0, SMode.Straight);
    const r = new Renderer(painter());
    const C = matCtx();
    r.layer('playerShots', W, C.ctx, cam);
    const qs = C.quads.filter((q) => q.img === IMG);
    expect(qs.length).toBe(13);
    const s = spr(12, 12);
    const k = cam.scale * Math.fround(1.2); // dartStar is drawn at 1.2× (a Float32Array's 1.2)
    // (drawn in slot order)
    want.sort((a, b) => a.i - b.i);
    for (let j = 0; j < 13; j++) {
      const { i } = want[j];
      const ang = Number.isNaN(want[j].ang) ? W.t * 16 : Math.atan2(W.PS.vy[i], W.PS.vx[i]);
      const px = (W.PS.x[i] - cam.x) * cam.scale + cam.w / 2, py = (W.PS.y[i] - cam.y) * cam.scale + cam.h / 2;
      const c = Math.cos(ang), n = Math.sin(ang);
      // blitRot's matrix on the sprite's rect
      const M = [c * k, n * k, -n * k, c * k, px, py];
      const P = (x: number, y: number) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
      const x0 = -s.ax * s.w, y0 = -s.ay * s.h;
      const exp = [...P(x0, y0), ...P(x0 + s.w, y0), ...P(x0 + s.w, y0 + s.h), ...P(x0, y0 + s.h)];
      expect(close(qs[j].pts, exp, 1e-9)).toBe(true);
    }
    // 1 for the eight boomerangs + 5 straight darts (+ the trails' identity)
    expect(C.calls.setTransform).toBeLessThanOrEqual(1 + 5 + 1);
    eng.dispose();
  });
});

describe('trails: the pool is swept once a frame', () => {
  it('hundreds of refused shots cost one sweep, and the pool ends where a sweep per shot left it', () => {
    const T = new Trails('mid');
    let sweeps = 0;
    const reap = T.reap.bind(T);
    T.reap = (t: number) => { sweeps++; reap(t); };
    const t0 = 5;
    T.begin('mid', t0);
    for (let k = 0; k < T.cap; k++) T.feed(TG.shot, k, k * 50, 0, t0, 4, 0.12, 0, TSY.light);
    expect(T.count).toBe(T.cap);
    // next frame, the clock a little on: all are still fresh; 300 new shots are refused
    T.begin('mid', t0 + 1 / 60);
    for (let k = 0; k < 300; k++) expect(T.feed(TG.shot, 1000 + k, 0, 5000 + k * 50, t0 + 1 / 60, 4, 0.12, 0, TSY.light)).toBe(-1);
    expect(sweeps).toBe(1);
    // a frame later still, past the trails' length: the first new shot sweeps and gets a trail
    T.begin('mid', t0 + 0.5);
    expect(T.feed(TG.shot, 2000, 0, 9000, t0 + 0.5, 4, 0.12, 0, TSY.light)).toBeGreaterThanOrEqual(0);
    expect(sweeps).toBe(2);
    expect(T.count).toBe(1);
  });
});
