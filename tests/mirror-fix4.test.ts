// 水月幻镜 · the fix round after the owner's feedback (revive, view size, HP bars, effects):
// - one animation-frame loop after a revive answered inside `downed`; a pause on `downed` still plays the fall;
// - ranged monsters wind up only within SHOOT_R of you, and keepers settle inside their keep distance;
// - the bodies' HP bars sit right over the bodies (under you and the blows), yours stays late;
// - the off-screen chevrons stay clear of the HUD (the UI's rectangles, or today's default), and a
//   threat under the HUD counts as unseen; the chevron is baked at the screen's resolution;
// - the impacts grow back part of the way at the wider views.
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentRegistry, DownInfo, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { Renderer, drawOrder, type Layer } from '../src/views/mirror/engine/render';
import { HUD_DEFAULT, chevPx } from '../src/views/mirror/engine/threats';
import { KEEP_BAND, SHOOT_R, ST } from '../src/views/mirror/engine/enemies';
import { DOWN_ANIM } from '../src/views/mirror/engine/down';
import { impactViewK, vfxOf } from '../src/views/mirror/engine/vfx';
import { VIEW_SPAN } from '../src/views/mirror/paint/draw';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const SILENT = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} } as unknown as MirrorAudio;

function opts(): NewRunOpts {
  return {
    seed: 77, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  };
}
function world(o: { downed?: (eng: MirrorEngine, d: DownInfo) => void; map?: 'lake' | 'forest' | 'palace' } = {}) {
  const run: RunSave = beginWave({ ...newRun({ ...opts(), map: o.map ?? 'lake' }), wave: 4, weapons: [] });
  const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  const cv = { width: 390, height: 844, clientWidth: 390, clientHeight: 844, getContext: () => null, getBoundingClientRect: () => ({ width: 390, height: 844 }) } as unknown as HTMLCanvasElement;
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  let eng!: MirrorEngine;
  const hooks: EngineHooks = { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} };
  if (o.downed) { const cb = o.downed; hooks.downed = (d) => cb(eng, d); }
  eng = createEngine(cv, run, { painter: createDebugPainter(run.map, 'high', 1), audio: SILENT, content: EMPTY, hooks, settings }) as MirrorEngine;
  eng.start(run, setup);
  const W = eng.world;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
  return { eng, W };
}

// ─────────────────────────────────────────────── a fake animation-frame clock

const g = globalThis as unknown as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
const saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
let queue: Map<number, (t: number) => void> = new Map();
let nextId = 1;
function fakeFrames(): void {
  queue = new Map(); nextId = 1;
  g.requestAnimationFrame = (cb: (t: number) => void) => { const id = nextId++; queue.set(id, cb); return id; };
  g.cancelAnimationFrame = (id: number) => { queue.delete(id); };
}
/** Run the frames scheduled now (one "vsync"), at time t. */
function vsync(t: number): number {
  const due = [...queue.entries()];
  queue.clear();
  for (const [, cb] of due) cb(t);
  return due.length;
}
afterEach(() => { g.requestAnimationFrame = saved.raf; g.cancelAnimationFrame = saved.caf; });

describe('破镜重圆 and the frame loop', () => {
  it('a revive answered inside `downed` leaves exactly one frame scheduled (never two loops)', () => {
    fakeFrames();
    const { eng, W } = world({ downed: (e) => { e.revive(); } });
    expect(queue.size).toBe(1);
    let t = 1000;
    vsync(t += 16.7); vsync(t += 16.7);
    // the lethal blow lands inside a step (as in play: inside the frame the loop is running)
    const step0 = W.step.bind(W);
    let armed = true;
    W.step = (dt: number) => {
      if (armed) { armed = false; W.iframes = 0; W.invulnT = 0; W.hp = 1; W.hurtFrom(999, -1, true, true, 'blot', false, false); }
      step0(dt);
    };
    vsync(t += 16.7);
    expect(W.run.revived).toBe(true);
    expect(eng.phase).toBe('wave');
    expect(queue.size).toBe(1);
    for (let k = 0; k < 30; k++) { expect(vsync(t += 16.7)).toBe(1); }
    expect(queue.size).toBe(1);
    eng.dispose();
  });

  it('a UI that pauses on `downed` still sees the fall play out; then the loop stops and the frame holds', () => {
    fakeFrames();
    const { eng, W } = world({ downed: (e) => { e.pause(); } });
    let t = 1000;
    vsync(t += 16.7);
    const step0 = W.step.bind(W);
    let armed = true;
    W.step = (dt: number) => {
      if (armed) { armed = false; W.iframes = 0; W.invulnT = 0; W.hp = 1; W.hurtFrom(999, -1, true, true, 'blot', false, false); }
      step0(dt);
    };
    vsync(t += 16.7);
    expect(eng.phase).toBe('down');
    expect(eng.paused).toBe(true);
    let frames = 0;
    while (queue.size && frames < 200) { vsync(t += 16.7); frames++; }
    expect(W.downAge).toBeGreaterThanOrEqual(DOWN_ANIM);
    expect(W.downAnimating).toBe(false);
    expect(frames).toBeGreaterThanOrEqual(Math.floor(DOWN_ANIM * 60) - 2);
    expect(frames).toBeLessThan(DOWN_ANIM * 60 + 10);
    expect(queue.size).toBe(0);
    // still down and paused: the world held (the wave clock did not run)
    expect(eng.phase).toBe('down');
    expect(eng.paused).toBe(true);
    // the revive lifts the pause and plays on, one loop
    expect(eng.revive()).toBe(true);
    expect(queue.size).toBe(1);
    vsync(t += 16.7);
    expect(queue.size).toBe(1);
    eng.dispose();
  });
});

describe('ranged monsters fire from where you can see them', () => {
  const dist = (W: MirrorEngine['world'], i: number) => Math.hypot(W.E.x[i] - W.px, W.E.y[i] - W.py);
  it('a lantern, a 冰魄 and a 莲蓬 turret beyond SHOOT_R never wind up; within it they do', () => {
    for (const [id, map] of [['lantern', 'lake'], ['frost', 'palace'], ['lotuspod', 'lake']] as const) {
      const { eng, W } = world({ map });
      W.godmode = true;
      const i = W.E.slotOf(W.spawn(id, W.px + SHOOT_R + 90, W.py, { bloom: false }));
      expect(i, id).toBeGreaterThanOrEqual(0);
      W.E.x[i] = W.px + SHOOT_R + 90; W.E.y[i] = W.py;
      let told = false;
      for (let k = 0; k < 20; k++) { W.E.cool[i] = 0; eng.stepN(1); if (W.E.st[i] === ST.tell) told = true; }
      expect(dist(W, i), id).toBeGreaterThan(SHOOT_R);
      expect(told, `${id} wound up from ${dist(W, i).toFixed(0)} u`).toBe(false);
      W.E.x[i] = W.px + 250; W.E.y[i] = W.py; W.E.vx[i] = 0; W.E.vy[i] = 0;
      for (let k = 0; k < 5 && !told; k++) { W.E.cool[i] = 0; eng.stepN(1); if (W.E.st[i] === ST.tell) told = true; }
      expect(told, `${id} within range`).toBe(true);
      eng.dispose();
    }
  });
  it('a keeper settles inside its keep distance (320 for the lantern), never past it', () => {
    const { eng, W } = world();
    W.godmode = true;
    const i = W.E.slotOf(W.spawn('lantern', W.px + 345, W.py, { bloom: false }));
    W.E.x[i] = W.px + 345; W.E.y[i] = W.py;
    let lo = Infinity, hi = 0;
    for (let k = 0; k < 60 * 6; k++) {
      W.E.cool[i] = 99; // never fires: only the keeping
      eng.stepN(1);
      if (k > 60) { const d = dist(W, i); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    expect(hi).toBeLessThanOrEqual(320 + 4);
    expect(lo).toBeGreaterThanOrEqual(320 - KEEP_BAND - 12);
    eng.dispose();
  });
});

describe('HP bars layering', () => {
  it("the bodies' bars right after the bodies (under you, your summons and the blows); yours late", () => {
    for (const dark of [false, true]) {
      const o = drawOrder(dark);
      const at = (l: Layer) => o.indexOf(l);
      expect(at('enemyBars')).toBe(at('enemies') + 1);
      for (const l of ['summons', 'player', 'effects', 'playerShots'] as Layer[]) expect(at('enemyBars'), l).toBeLessThan(at(l));
      expect(at('bars')).toBeGreaterThan(at('playerShots'));
      expect(new Set(o).size).toBe(o.length);
    }
  });
});

// ─────────────────────────────────────────────── chevrons and the HUD

/** A context that records the chevrons' centres (the vector fallback's setTransform(c, s, −s, c, x, y)). */
function chevCtx() {
  const at: { x: number; y: number }[] = [];
  const t: Record<string, unknown> = {
    setTransform(a: number, b: number, _c: number, _d: number, e: number, f: number) { if (!(a === 1 && b === 0 && e === 0 && f === 0)) at.push({ x: e, y: f }); },
  };
  const ctx = new Proxy(t, { get: (o, k) => (k in o ? o[k as string] : () => {}), set: () => true }) as unknown as CanvasRenderingContext2D;
  return { ctx, at };
}
describe('off-screen chevrons and the HUD', () => {
  const cam = (W: MirrorEngine['world']) => ({ x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 });
  it("stay out of today's HUD by default (the top row, the 镇 button's corner), and out of the UI's rectangles", () => {
    const { eng, W } = world();
    W.godmode = true;
    // an elite straight above you, far off the top
    W.spawn('turtle', W.px, W.py - 900, { bloom: false });
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    let rec = chevCtx();
    r.threats.draw(W, rec.ctx, cam(W));
    expect(r.threats.drawn).toBe(1);
    expect(rec.at[0].y).toBeGreaterThanOrEqual(HUD_DEFAULT[0].h + 16 - 0.5);
    // the UI's own rectangles
    r.threats.setHud([{ x: 0, y: 0, w: 390, h: 120 }]);
    rec = chevCtx();
    r.threats.draw(W, rec.ctx, cam(W));
    expect(rec.at[0].y).toBeGreaterThanOrEqual(136 - 0.5);
    // none at all: back at the plain inset
    r.threats.setHud([]);
    rec = chevCtx();
    r.threats.draw(W, rec.ctx, cam(W));
    expect(rec.at[0].y).toBeLessThan(40);
    // null: the default again
    r.threats.setHud(null);
    expect(r.threats.hudRects()).toEqual(HUD_DEFAULT.map((q) => ({ ...q })));
    eng.dispose();
  });
  it("the bottom-right corner (the 镇 button): a chevron toward it is pulled clear", () => {
    const { eng, W } = world();
    W.godmode = true;
    W.spawn('turtle', W.px + 700, W.py + 1500, { bloom: false });
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const rec = chevCtx();
    r.threats.draw(W, rec.ctx, cam(W));
    expect(r.threats.drawn).toBe(1);
    const p = rec.at[0];
    const inCorner = p.x > 390 - 104 - 16 + 1 && p.y > 844 - 108 - 16 + 1;
    expect(inCorner, `chevron at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`).toBe(false);
    eng.dispose();
  });
  it('a threat under the HUD counts as unseen (it gets a chevron)', () => {
    const { eng, W } = world();
    W.godmode = true;
    // on the canvas (y ≈ 42 css px), but under the top row
    W.spawn('turtle', W.px, W.py - 380, { bloom: false });
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    r.threats.draw(W, chevCtx().ctx, cam(W));
    expect(r.threats.list().length).toBe(1);
    r.threats.setHud([]);
    r.threats.draw(W, chevCtx().ctx, cam(W));
    expect(r.threats.list().length).toBe(0);
    eng.dispose();
  });
  it('the chevron sprite is baked for the screen: the boss-sized one drawn ≤ 1:1 at dpr 1, 2 and 3', () => {
    for (const d of [1, 2, 3]) expect(chevPx(d) * 0.66).toBeGreaterThanOrEqual(26 * 1.2 * d);
    expect(chevPx(1)).toBe(64);
    expect(chevPx(3)).toBeLessThanOrEqual(256);
  });
});

describe('impacts by view', () => {
  it('1 at near, more at the wider views (≤ 1.3); the pooled radius follows', () => {
    expect(impactViewK('near')).toBe(1);
    expect(impactViewK('mid')).toBeCloseTo(Math.min(1.3, Math.sqrt(VIEW_SPAN.mid / VIEW_SPAN.near)), 5);
    expect(impactViewK('far')).toBeLessThanOrEqual(1.3);
    expect(impactViewK(undefined)).toBe(impactViewK('mid'));
    const { eng, W } = world();
    const V = vfxOf(W);
    W.settings.view = 'near';
    const a = V.impact(W.px, W.py, 0, 20, 0, 0, 0);
    W.settings.view = 'far';
    const b = V.impact(W.px + 10, W.py, 0, 20, 0, 0, 0);
    const R = (V as unknown as { impacts: { r: Float32Array } }).impacts.r;
    expect(R[a]).toBeCloseTo(20, 3);
    expect(R[b]).toBeCloseTo(20 * impactViewK('far'), 3);
    eng.dispose();
  });
});
