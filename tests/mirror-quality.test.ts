// 水月幻镜 · picture quality: sprites baked at the size they are drawn, the canvas at the screen's own
// resolution on every quality (dynamic resolution steps it down under load), the auto policy, and the
// ambience layer's contract with the engine.
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineSettings, MirrorAudio, NewRunOpts, Quality, RunSave } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, RES_STEPS, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { EKind } from '../src/views/mirror/engine/pools';
import { SHOOT_R, ST } from '../src/views/mirror/engine/enemies';
import { bakeScale, createPainter, DEMON_INK, edgeOf, kindScale, specOf, viewScale, VIEWS, VIEW_SPAN } from '../src/views/mirror/paint';
import { isSoft, obstacleScale } from '../src/views/mirror/paint/arena';
import { CHAR_SPECS } from '../src/views/mirror/paint/figures';
import { B } from '../src/views/mirror/paint/kit';
import { AMB_EKIND, AMB_ST, Ambience } from '../src/views/mirror/paint/ambient';
import { isZone } from '../src/views/mirror/paint/things';
import { FX_REG } from '../src/views/mirror/ids';
import { dprCapOf, qualityOf } from '../src/views/mirror/ui/Run';

const QS: Quality[] = ['low', 'mid', 'high'];
/** Phones (portrait, DPR 2–3) and desktops (DPR 1–2). */
const SCREENS = [
  { name: 'phone 390×844', w: 390, h: 844, dprs: [2, 3] },
  { name: 'phone 430×932', w: 430, h: 932, dprs: [2, 3] },
  { name: 'phone 360×780', w: 360, h: 780, dprs: [2, 3] },
  { name: 'desktop 1280×800', w: 1280, h: 800, dprs: [1, 2] },
  { name: 'desktop 1920×1080', w: 1920, h: 1080, dprs: [1, 2] },
];

describe('resolution: nothing is drawn larger than it was painted', () => {
  it('the canvas is at the device resolution on every quality (DPR ≤ 3): the browser never stretches it', () => {
    for (const q of QS) for (const s of SCREENS) for (const dpr of s.dprs) {
      const canvasDpr = Math.min(dpr, dprCapOf(q));
      expect(dpr / canvasDpr, `${s.name} @${dpr} ${q}`).toBeLessThanOrEqual(1);
    }
  });
  it('sprites bake at ≥ the camera scale (effective upscale ≤ 1.0 at zoom 1) on every quality and view, within memory caps', () => {
    for (const view of VIEWS) for (const q of QS) for (const s of SCREENS) for (const dpr of s.dprs) {
      const canvasDpr = Math.min(dpr, dprCapOf(q));
      const cam = viewScale(s.w, s.h, view) * canvasDpr; // canvas px per u, what the engine draws at
      const k = bakeScale(s.w, s.h, canvasDpr, q, view);
      const tag = `${view} ${s.name} @${dpr} ${q}: cam ${cam.toFixed(2)} k ${k.toFixed(2)}`;
      expect(cam / k, tag).toBeLessThanOrEqual(1.0001);
      expect(k).toBeLessThanOrEqual(3.4);
      // mid and high keep headroom for the zoom punches (unless the floor of 1 px per u already covers it)
      if (q !== 'low' && k > 1) expect(k / cam, tag).toBeGreaterThanOrEqual(1.09);
      // and the bake follows the view: never finer than the view needs (memory)
      if (k > 1) expect(k / cam, tag).toBeLessThanOrEqual(1.1001);
    }
    // the default view is 'mid' on both sides (the UI's painter and the engine's camera agree without it)
    expect(bakeScale(390, 844, 3, 'mid')).toBe(bakeScale(390, 844, 3, 'mid', 'mid'));
    expect(viewScale(390, 844)).toBe(viewScale(390, 844, 'mid'));
    // a farther view bakes smaller: a DPR-3 390-px phone on mid ≈ 2.93 near, 2.01 mid, 1.72 far
    expect(bakeScale(390, 844, 3, 'mid', 'near')).toBeCloseTo(2.925, 2);
    expect(bakeScale(390, 844, 3, 'mid', 'mid')).toBeCloseTo(1.839, 2);
    expect(bakeScale(390, 844, 3, 'mid', 'far')).toBeCloseTo(1.570, 2);
  });
  it('the engine and the painter start from the same view scale', () => {
    expect(viewScale(390, 844, 'near')).toBeCloseTo(390 / 440, 5);
    expect(viewScale(390, 844, 'mid')).toBeCloseTo(390 / 700, 5);
    expect(viewScale(390, 844, 'far')).toBeCloseTo(390 / 820, 5);
    expect(viewScale(1920, 1080, 'near')).toBe(1.5);
    expect(viewScale(1920, 1080, 'mid')).toBe(1.25);
    expect(viewScale(1920, 1080, 'far')).toBe(1.05);
    expect(viewScale(200, 300, 'near')).toBe(0.7);
    expect(viewScale(200, 300, 'mid')).toBe(0.5);
    expect(viewScale(200, 300, 'far')).toBe(0.45);
    for (const v of VIEWS) expect(viewScale(0, 0, v)).toBe(1);
    expect(viewScale(390, 844, 'bogus' as never)).toBe(viewScale(390, 844, 'mid'));
  });
  it('the views: mid keeps shooters on a portrait phone, far keeps figures readable', () => {
    // half the width a 390×844 phone shows (u) against the keep distances of the shooters (260–360 u)
    const half = (v: (typeof VIEWS)[number]) => 390 / viewScale(390, 844, v) / 2;
    expect(half('near')).toBeCloseTo(220, 0);
    expect(half('mid')).toBeGreaterThanOrEqual(350); // keepers settle inside lantern and clerk 320, imp 300, 樵鬼 280, spider and star 260
    expect(half('mid')).toBeGreaterThanOrEqual(SHOOT_R - 70); // a shooter in range is ≤ 70 u past the edge
    expect(half('far')).toBeGreaterThanOrEqual(400); // 灯笼鬼 360, and nearly all of SHOOT_R
    // the companion's figure (54 u tall) stays ≥ 25 css px at far on a 390-px phone (30 at mid)
    const h = CHAR_SPECS.scholar.box[3] - CHAR_SPECS.scholar.box[1];
    expect(h).toBe(54);
    expect(h * viewScale(390, 844, 'far')).toBeGreaterThanOrEqual(25);
    expect(h * viewScale(390, 844, 'mid')).toBeGreaterThanOrEqual(30);
    // each view shows clearly more than the last
    expect(VIEW_SPAN.mid / VIEW_SPAN.near).toBeGreaterThanOrEqual(1.4);
    expect(VIEW_SPAN.far / VIEW_SPAN.mid).toBeGreaterThanOrEqual(1.15);
  });
  it('the painter keeps the bake scale it is given, and its dpr up to 3', () => {
    const p = createPainter('lake', 'mid', 3, 2.9) as unknown as { k: number; dpr: number };
    expect(p.k).toBeCloseTo(2.9, 5);
    expect(p.dpr).toBe(3);
    // without a bake scale: the old dpr × quality factor
    expect((createPainter('lake', 'high', 1) as unknown as { k: number }).k).toBeCloseTo(1.15, 5);
  });
  it('obstacles are painted at the camera scale (never enlarged), within 3 px per u', () => {
    for (const q of QS) for (const sc of SCREENS) for (const dpr of sc.dprs) {
      const canvasDpr = Math.min(dpr, dprCapOf(q));
      const cam = viewScale(sc.w, sc.h) * canvasDpr;
      const ko = obstacleScale(bakeScale(sc.w, sc.h, canvasDpr, q), q);
      expect(ko).toBeLessThanOrEqual(3);
      if (cam <= 3) expect(cam / ko, `${sc.name} @${dpr} ${q}: cam ${cam.toFixed(2)} obstacles ${ko.toFixed(2)}`).toBeLessThanOrEqual(1.0001);
      // and no finer than that (memory): the painter's headroom is for rotating sprites
      expect(ko / cam).toBeLessThanOrEqual(1.0001);
    }
  });
  it('kill bursts and strikes, drawn at r / 32 (up to 2–4×), are baked larger; status marks smaller', () => {
    expect(kindScale('fx:inkBurst')).toBeGreaterThanOrEqual(1.5);
    expect(kindScale('fx:petalBurst')).toBeGreaterThanOrEqual(1.5);
    expect(kindScale('fx:lightningStrike')).toBeGreaterThanOrEqual(2);
    expect(kindScale('fx:hitSpark')).toBe(1);
    expect(kindScale('fx:stunMark')).toBe(0.5);
    expect(kindScale('boss:carp:0')).toBeLessThan(1);
  });
  it('the fields a run shows large and long (its map\'s standing hazard, its own 镜技) bake at their drawn size', () => {
    const run = (char: RunSave['char'], map: RunSave['map']) => newRun({
      seed: 7, char, map, diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
      runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
    });
    type Z = { plan: (r: RunSave, s: 'start') => unknown; zoneScale: (l: string) => number };
    // a DPR-3 phone on mid: camera 2.66 px per u, sprites at 2.93
    const p = createPainter('lake', 'mid', 3, 2.93) as unknown as Z;
    p.plan(run('scholar', 'lake'), 'start');
    // 月影 (r 110): drawn at 2.66 × 110 / 32 = 9.1 px per u of its disc — baked at least that fine
    expect(p.zoneScale('moonCircle')).toBeGreaterThanOrEqual(2.66 * 110 / 32);
    // 一字千钧's glyph (r 180) up to the 640 px cap (it was 2.93: a 5× enlargement)
    expect(p.zoneScale('zhenGlyph') * 68).toBeCloseTo(640, 0);
    expect(p.zoneScale('vortex')).toBe(0); // another companion's field keeps the small bake
    expect(p.zoneScale('inkPuddle')).toBe(0); // another map's
    const f = createPainter('forest', 'high', 1, 1.485) as unknown as Z;
    f.plan(run('taoist', 'forest'), 'start');
    expect(f.zoneScale('vortex')).toBeCloseTo(1.485 * 180 / 32, 3);
    expect(f.zoneScale('inkPuddle')).toBeCloseTo(1.485 * 90 / 32, 3);
    expect(f.zoneScale('moonCircle')).toBe(0);
    // low keeps the fixed zone resolution (memory)
    const l = createPainter('lake', 'low', 3, 2.66) as unknown as Z;
    l.plan(run('scholar', 'lake'), 'start');
    expect(l.zoneScale('moonCircle')).toBe(0);
  });
  it('zone looks are flagged so they bake at a fixed pixel size', () => {
    const zones = FX_REG.filter((f) => { const s = specOf(`fx:${f.id}`); return !!s && isZone(s.spec); }).map((f) => f.id);
    expect(zones).toContain('shockRing');
    expect(zones).toContain('bossShadow');
    expect(zones).not.toContain('hitSpark');
  });
});

describe('auto quality', () => {
  const g = globalThis as unknown as { matchMedia?: unknown; navigator?: unknown; window?: unknown };
  const saved = { matchMedia: g.matchMedia, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), window: g.window };
  afterEach(() => {
    g.matchMedia = saved.matchMedia;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
    g.window = saved.window;
  });
  const env = (coarse: boolean, cores: number, mem: number | undefined, width: number) => {
    g.matchMedia = () => ({ matches: coarse });
    Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: cores, deviceMemory: mem }, configurable: true });
    g.window = { innerWidth: width };
  };
  it('a phone gets mid whatever its core count (iOS reports few); only a device that says it is weak gets low', () => {
    env(true, 4, undefined, 390); expect(qualityOf('auto')).toBe('mid');
    env(true, 8, 8, 412); expect(qualityOf('auto')).toBe('mid');
    env(true, 8, 2, 412); expect(qualityOf('auto')).toBe('low');
    env(true, 2, undefined, 390); expect(qualityOf('auto')).toBe('low');
    env(false, 8, 8, 1440); expect(qualityOf('auto')).toBe('high');
    env(false, 8, 8, 800); expect(qualityOf('auto')).toBe('mid');
    expect(qualityOf('low')).toBe('low');
  });
});

describe('dynamic resolution', () => {
  const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} } as unknown as MirrorAudio;
  const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
  const opts = (): NewRunOpts => ({
    seed: 4242, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => { g.window = savedWindow; });
  function make(q: Quality, dpr: number, amb?: { shed: boolean }) {
    g.window = { devicePixelRatio: dpr };
    const cv = { width: 390, height: 844, clientWidth: 390, clientHeight: 844, getContext: () => null, getBoundingClientRect: () => ({ width: 390, height: 844 }) } as unknown as HTMLCanvasElement;
    const run: RunSave = beginWave(newRun(opts()));
    const settings: EngineSettings = { quality: q, dprCap: 3, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
    const painter = createDebugPainter('lake', q, 1);
    if (amb) Object.assign(painter, { ambience: amb });
    const eng = createEngine(cv, run, { painter, audio: SILENT, content: EMPTY, hooks: { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} }, settings }) as MirrorEngine;
    eng.start(run, waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)));
    const W = eng.world;
    W.godmode = true; W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
    return { eng, W, cv };
  }
  it('slow frames step the canvas dpr down (3 → 2.5 → 2 → 1.5) before any effect is cut; a minute of fast frames brings one notch back, once a run', () => {
    const { eng, W, cv } = make('mid', 3);
    expect(eng.resolution).toBe(3);
    expect(cv.width).toBe(1170);
    let now = 1000;
    const seen: number[] = [];
    for (let f = 0; f < 60 * 12; f++) { now += 40; eng.frame(now); if (seen[seen.length - 1] !== eng.resolution) seen.push(eng.resolution); if (W.degrade) break; }
    expect(seen).toEqual([3, 2.5, 2, 1.5]);
    expect(W.degrade).toBe(1); // only at the floor
    expect(cv.width).toBe(Math.round(390 * 1.5));
    // fast again: effects first, then a notch of resolution after a long fast stretch
    for (let f = 0; f < 60 * 9; f++) { now += 1000 / 60; eng.frame(now); }
    expect(W.degrade).toBe(0);
    expect(eng.resolution).toBe(1.5);
    for (let f = 0; f < 60 * 22; f++) { now += 1000 / 60; eng.frame(now); }
    expect(eng.resolution).toBe(1.5); // (each notch is a visible change: no step up after only 20 s)
    for (let f = 0; f < 60 * 40; f++) { now += 1000 / 60; eng.frame(now); }
    expect(eng.resolution).toBe(2);
    // slow again: down it goes, and it stays down (one step up a run: no flip-flop)
    for (let f = 0; f < 60 * 12; f++) { now += 40; eng.frame(now); if (eng.resolution < 2) break; }
    expect(eng.resolution).toBe(1.5);
    for (let f = 0; f < 60 * 70; f++) { now += 1000 / 60; eng.frame(now); }
    expect(eng.resolution).toBe(1.5);
    expect(RES_STEPS[0]).toBe(3);
    eng.dispose();
  });
  it('with the ambience overlays on, the guard sheds them first (before any resolution), and restores them last', () => {
    const amb = { shed: false };
    const { eng, W } = make('mid', 3, amb);
    let now = 1000;
    const seen: string[] = [];
    const state = () => `${amb.shed ? 'shed' : 'full'}@${eng.resolution}`;
    for (let f = 0; f < 60 * 14; f++) { now += 40; eng.frame(now); if (seen[seen.length - 1] !== state()) seen.push(state()); if (W.degrade) break; }
    expect(seen).toEqual(['full@3', 'shed@3', 'shed@2.5', 'shed@2', 'shed@1.5']);
    // fast again: effects, then one notch of resolution after a minute; the overlays would come back only
    // once the resolution is all back, which one step up a run never reaches after a fall this deep
    for (let f = 0; f < 60 * 9; f++) { now += 1000 / 60; eng.frame(now); }
    expect(W.degrade).toBe(0);
    for (let f = 0; f < 60 * 63 * 3; f++) { now += 1000 / 60; eng.frame(now); }
    expect(eng.resolution).toBe(2);
    expect(amb.shed).toBe(true); // the resolution comes first
    eng.dispose();
    // a low-quality run draws no overlays: nothing to shed, resolution first as before
    const low = { shed: false };
    const r = make('low', 3, low);
    now = 1000;
    for (let f = 0; f < 60; f++) { now += 40; r.eng.frame(now); } // 2.4 s of slow frames: one notch
    expect(low.shed).toBe(false);
    expect(r.eng.resolution).toBe(2.5);
    r.eng.dispose();
  });
  it('setView applies live: the camera takes the view at once and the painter re-bakes for it (resize never re-bakes)', async () => {
    const { eng } = make('mid', 3);
    const painter = (eng as unknown as { painter: object }).painter;
    const calls: number[] = [];
    Object.assign(painter, { k: bakeScale(390, 844, 3, 'mid', 'mid'), rescale: async (k: number) => { calls.push(k); (painter as { k: number }).k = k; return true; } });
    expect(eng.view).toBe('mid');
    expect(eng.camera.scale).toBeCloseTo(viewScale(390, 844, 'mid') * 3, 5);
    expect(await eng.setView('near')).toBe(true);
    expect(eng.view).toBe('near');
    expect(eng.camera.scale).toBeCloseTo(viewScale(390, 844, 'near') * 3, 5);
    expect(calls).toEqual([bakeScale(390, 844, 3, 'mid', 'near')]);
    // the same view again: nothing to do
    expect(await eng.setView('near')).toBe(false);
    // setSettings({ view }) is the same call
    eng.setSettings({ view: 'far' });
    await Promise.resolve(); await Promise.resolve();
    expect(eng.view).toBe('far');
    expect(eng.camera.scale).toBeCloseTo(viewScale(390, 844, 'far') * 3, 5);
    expect(calls[1]).toBeCloseTo(bakeScale(390, 844, 3, 'mid', 'far'), 5);
    eng.resize();
    expect(calls.length).toBe(2);
    eng.dispose();
  });
  it('a DPR-1 screen has nothing to step down: the guard cuts effects as before', () => {
    const { eng, W } = make('high', 1);
    let now = 1000;
    for (let f = 0; f < 60; f++) { now += 40; eng.frame(now); }
    expect(eng.resolution).toBe(1);
    expect(W.degrade).toBe(1);
    eng.dispose();
  });
});

describe('ambience', () => {
  it('its enemy kinds and states match the engine', () => {
    expect(AMB_EKIND).toEqual(EKind);
    expect(AMB_ST.bloom).toBe(ST.bloom);
    expect(AMB_ST.under).toBe(ST.under);
    expect(AMB_ST.air).toBe(ST.air);
  });
  it('the painter owns one, sized by quality (low draws no motes)', () => {
    for (const q of QS) {
      const p = createPainter('forest', q, 2, 2) as unknown as { ambience: Ambience };
      expect(p.ambience).toBeInstanceOf(Ambience);
      const n = (p.ambience as unknown as { n: number }).n;
      if (q === 'low') expect(n).toBe(0); else expect(n).toBeGreaterThan(0);
    }
  });
  it('draws nothing before it is baked (node: no document)', () => {
    const a = new Ambience('lake', 'high', 2, 2);
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k !== 'then' ? (..._a: unknown[]) => { calls.push(k); } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    a.bake(false);
    a.draw({} as never, ctx, { x: 0, y: 0, scale: 2, w: 780, h: 1688, dpr: 2 });
    expect(calls).toEqual([]);
  });
});

describe('bake: soft arena marks and the volume of bodies', () => {
  it('washes and broad bands are painted at half resolution; lines, fills, dots and thin brushes stay crisp', () => {
    const b = new B(1);
    b.wash('#445566', [[0, 0], [40, 0], [40, 40], [0, 40]], 0.1, 10);
    b.brush([[0, 0, 34], [50, 0, 34], [100, 0, 34]], 0.9, '#8a6a3a');
    b.brush([[0, 0, 3], [50, 0, 3]], 0.8, '#3a2c1c');
    b.line([[0, 0], [10, 10]], 1.2, 0.5, '#223344');
    b.fill('#5f8a6e', [[0, 0], [10, 0], [10, 10]], 0.8, 1);
    b.dot(0, 0, 5, 0.6, '#223344');
    expect(b.ops.map((op) => isSoft(op))).toEqual([true, true, false, false, false, false]);
  });
  it('bodies get the moonlight rim and the ink volume; effects, drops and shots stay flat', () => {
    for (const id of ['char:swordsman', 'mon:crab', 'elite:tiger', 'boss:carp:0', 'sum:mohu']) {
      const e = edgeOf(id);
      expect(e.volume, id).toBeGreaterThan(0);
      expect(e.rim, id).toBeGreaterThan(0);
    }
    for (const id of ['fx:shockRing', 'drop:cashCoin', 'proj:flySword', 'wpn:qingfeng', 'item:tea']) expect(edgeOf(id)).toEqual({ rim: 0, outline: 0, volume: 0 });
    // 点化's mark rides a converted foe: an overlay, not a body (no volume turning it into a grey disc)
    expect(edgeOf('sum:inkAlly')).toEqual({ rim: 0, outline: 0, volume: 0 });
    // 心魔 is an enemy: lit like one
    expect(edgeOf('sum:demonSelf')).toEqual(edgeOf('mon:blot'));
  });
  it('心魔 is a purple-ink copy of your own companion, in a dark halo, and inverts in 倒影 like any enemy', () => {
    for (const ch of ['scholar', 'cat', 'guan'] as const) {
      const s = specOf('sum:demonSelf', ch)!;
      expect(s.spec.box).toEqual(CHAR_SPECS[ch].box);
      expect(s.spec.n).toBe(3); // walk, walk, tell (an enemy never shows the hurt frame)
      expect(s.spec.paint).toBe(CHAR_SPECS[ch].paint);
      expect(s.spec.halo).toBe('dark');
      expect(s.duo).toEqual(DEMON_INK);
      expect(s.invertible).toBe(true);
    }
    // the ink pair: dark plum → pale lilac, never the enemy vermilion
    expect(DEMON_INK[0]).not.toBe(DEMON_INK[1]);
  });
});
