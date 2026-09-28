// 水月幻镜 · the view pass: HP bars over every ordinary monster (vermilion, faded while untouched) and
// over you (jade, the shield a grey cap), drawn in fill runs whatever the crowd; off-screen threats as
// chevrons at the edge (tells, shots on their way, elites, the boss), capped and most urgent first.
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { Renderer, drawOrder } from '../src/views/mirror/engine/render';
import { BAR_IDLE_A } from '../src/views/mirror/engine/bars';
import { THREAT_CAP, TK } from '../src/views/mirror/engine/threats';
import { ST } from '../src/views/mirror/engine/enemies';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const SILENT = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} } as unknown as MirrorAudio;
const HOOKS: EngineHooks = { hud() {}, levelUp() {}, crate() {}, coin() {}, boss() {}, waveEnd() {}, death() {}, error() {} };

function opts(): NewRunOpts {
  return {
    seed: 77, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  };
}
function world(reduceMotion = false) {
  const run: RunSave = beginWave({ ...newRun(opts()), wave: 4, weapons: [] });
  const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  const cv = { width: 390, height: 844, clientWidth: 390, clientHeight: 844, getContext: () => null, getBoundingClientRect: () => ({ width: 390, height: 844 }) } as unknown as HTMLCanvasElement;
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
  const eng = createEngine(cv, run, { painter: createDebugPainter('lake', 'high', 1), audio: SILENT, content: EMPTY, hooks: HOOKS, settings }) as MirrorEngine;
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = true; W.plan = { ...W.plan, groups: [], elites: [], treasures: [] }; W.len = 1e9;
  return { eng, W };
}
/** A context that records fillStyle changes and fillRect calls (with the style and alpha in force). */
function recCtx() {
  const rec = { styles: [] as string[], rects: [] as { style: string; a: number; x: number; y: number; w: number; h: number }[], images: 0 };
  let style = '', alpha = 1;
  const target: Record<string, unknown> = {
    setTransform() {}, drawImage() { rec.images++; }, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, closePath() {},
    fillText() {}, save() {}, restore() {}, quadraticCurveTo() {}, translate() {}, scale() {}, rotate() {},
    fillRect(x: number, y: number, w: number, h: number) { rec.rects.push({ style, a: alpha, x, y, w, h }); },
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : k === 'globalAlpha' ? alpha : k === 'fillStyle' ? style : () => {}),
    set: (_t, k, v) => { if (k === 'fillStyle') { style = String(v); rec.styles.push(style); } else if (k === 'globalAlpha') alpha = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, rec };
}
const RED = '#c8412c', JADE = '#3e9a63', SHIELD = '#b9bfc8';

describe('HP bars', () => {
  it('every ordinary monster carries a vermilion bar: faded untouched, full once hurt; bosses and allies none', () => {
    const { eng, W } = world();
    const a = W.E.slotOf(W.spawn('blot', W.px + 60, W.py, { bloom: false }));
    const b = W.E.slotOf(W.spawn('lantern', W.px - 60, W.py, { bloom: false }));
    expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThanOrEqual(0);
    W.E.hp[b] = W.E.hpMax[b] * 0.5;
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const cam = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    const { ctx, rec } = recCtx();
    r.draw(W, ctx, cam);
    expect(r.bars.count).toBe(2);
    const reds = rec.rects.filter((q) => q.style === RED);
    expect(reds.length).toBe(2);
    expect(reds.map((q) => q.a).sort()).toEqual([BAR_IDLE_A, 1].sort());
    // the hurt one is half full (its width over the track's)
    const hurt = reds.find((q) => q.a === 1)!;
    const track = rec.rects.find((q) => q.a === 1 && q.style.startsWith('rgba(22,18,16') && Math.abs(q.y - hurt.y + 1) < 1.5)!;
    expect(hurt.w / (track.w - 2)).toBeCloseTo(0.5, 1);
    // bars sit over the heads (above the body's centre on screen)
    for (const q of reds) { expect(q.y).toBeLessThan(844 / 2 - 15); expect(q.y).toBeGreaterThan(844 / 2 - 50); }
    eng.dispose();
  });
  it('you carry a jade bar with the shield as a grey cap', () => {
    const { eng, W } = world();
    W.hp = W.hpMax * 0.75; W.shieldV = W.hpMax * 0.5;
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const { ctx, rec } = recCtx();
    r.draw(W, ctx, { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 });
    const jade = rec.rects.filter((q) => q.style === JADE);
    expect(jade.length).toBe(1);
    const shield = rec.rects.filter((q) => q.style === SHIELD);
    expect(shield.length).toBe(1);
    expect(shield[0].y).toBeLessThan(jade[0].y);
    expect(shield[0].w / jade[0].w).toBeCloseTo(0.5 / 0.75, 1);
    eng.dispose();
  });
  it('140 bodies cost a few style changes: the bars are drawn in fill runs', () => {
    const { eng, W } = world();
    for (let k = 0; k < 140; k++) {
      const a = (k / 140) * Math.PI * 2, d = 60 + (k % 7) * 20;
      const i = W.E.slotOf(W.spawn(k % 2 ? 'blot' : 'paperman', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false, capped: false }));
      if (i >= 0 && k % 3 === 0) W.E.hp[i] = W.E.hpMax[i] * 0.4;
    }
    expect(W.E.count).toBeGreaterThanOrEqual(140);
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const cam = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    const { ctx, rec } = recCtx();
    r.bars.begin(W);
    for (const L of drawOrder(false)) if (L === 'enemies' || L === 'player') r.layer(L, W, ctx, cam);
    const s0 = rec.styles.length, n0 = rec.rects.length;
    r.layer('enemyBars', W, ctx, cam);
    r.layer('bars', W, ctx, cam);
    expect(r.bars.count).toBeGreaterThanOrEqual(140);
    // two alpha groups × (track, chip, red) + your bar's (track, fill): ≤ 8 style changes for any crowd
    expect(rec.styles.length - s0).toBeLessThanOrEqual(8);
    expect(rec.rects.length - n0).toBeLessThanOrEqual(3 * r.bars.count + 4);
    eng.dispose();
  });
  it("a blow's chip holds, then drains into the bar (not under reduced motion)", () => {
    for (const calm of [false, true]) {
      const { eng, W } = world(calm);
      const i = W.E.slotOf(W.spawn('crab', W.px + 60, W.py, { bloom: false }));
      const r = new Renderer(createDebugPainter('lake', 'high', 1));
      const cam = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
      const chips = () => { const { ctx, rec } = recCtx(); r.draw(W, ctx, cam); return rec.rects.filter((q) => q.style.startsWith('rgba(246,238,222')); };
      chips();
      W.E.hp[i] = W.E.hpMax[i] * 0.5;
      const c0 = chips();
      if (calm) expect(c0.length).toBe(0);
      else expect(c0.length).toBe(1);
      for (let k = 0; k < 90; k++) { W.t += 1 / 60; chips(); }
      expect(chips().length).toBe(0); // drained
      eng.dispose();
    }
  });
});

describe('off-screen threats', () => {
  it('tells, shots on their way, elites and the boss past the edge get a chevron; on-screen ones and shots flying away do not', () => {
    const { eng, W } = world();
    const cam = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    // on screen: nothing to point at
    const near = W.E.slotOf(W.spawn('lantern', W.px + 100, W.py, { bloom: false }));
    W.E.st[near] = ST.tell;
    // off to the right: a lantern winding up, an elite; a shot coming in from the left; one flying away
    const far = W.E.slotOf(W.spawn('lantern', W.px + 330, W.py, { bloom: false }));
    W.E.st[far] = ST.tell; W.E.stT[far] = 5;
    W.spawn('turtle', W.px + 500, W.py - 200, { bloom: false });
    W.enemyShot('eFireball', W.px - 400, W.py + 10, 220, 0, 9, 4, 3, false, 0, 0, 0, 0, -1);
    W.enemyShot('eFireball', W.px - 400, W.py + 300, -220, 0, 9, 4, 3, false, 0, 0, 0, 0, -1);
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const { ctx } = recCtx();
    r.draw(W, ctx, cam);
    const got = r.threats.list();
    expect(got.map((t) => t.kind).sort()).toEqual([TK.tell, TK.shot, TK.elite].sort());
    expect(got.find((t) => t.kind === TK.tell)!.x).toBeCloseTo(W.E.x[far], 0);
    expect(r.threats.drawn).toBe(3);
    eng.dispose();
  });
  it('capped by quality, most urgent first, one per direction', () => {
    const { eng, W } = world();
    const cam = { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 };
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, i = W.E.slotOf(W.spawn('lantern', W.px + Math.cos(a) * 600, W.py + Math.sin(a) * 600, { bloom: false, capped: false }));
      if (i >= 0) { W.E.st[i] = ST.tell; W.E.stT[i] = 5; }
    }
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const { ctx } = recCtx();
    r.draw(W, ctx, cam);
    expect(r.threats.list().length).toBe(THREAT_CAP.high);
    expect(r.threats.drawn).toBeLessThanOrEqual(THREAT_CAP.high);
    W.degrade = 1;
    r.draw(W, ctx, cam);
    expect(r.threats.list().length).toBe(THREAT_CAP.high >> 1);
    eng.dispose();
  });
  it('nothing between waves', () => {
    const { eng, W } = world();
    W.spawn('turtle', W.px + 900, W.py, { bloom: false });
    W.phase = 'idle' as typeof W.phase;
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    r.draw(W, recCtx().ctx, { x: W.px, y: W.py, scale: 1, w: 390, h: 844, dpr: 1 });
    expect(r.threats.drawn).toBe(0);
    eng.dispose();
  });
});
