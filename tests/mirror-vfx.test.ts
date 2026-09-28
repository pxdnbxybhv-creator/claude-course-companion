// 水月幻镜 · 流光 (the player's light, engine/vfx.ts, engine/trails.ts, paint/vfx.ts): the weapons, 镜技
// and summons emit crisp shockwaves, crescents, lances, lightning and beams in their own light (never
// vermilion: danger is the enemy's colour); every pool keeps to its budget per quality and halves under
// the frame guard; ribbon trails are pooled typed arrays that restart for a reused slot and never grow
// per frame; the renderer turns the old ring and line fx into vectors and draws every layer without a
// throw; reduced motion keeps trails short and the i-frames steady; the go stones no longer shake.
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import type { CharacterId as CharId } from '../src/data/characters';
import { COMPANIONS } from '../src/views/mirror/data';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { Renderer, drawOrder } from '../src/views/mirror/engine/render';
import { VFX_CAP, VF, VT, WPN_TINT, slashTint, vfxOf } from '../src/views/mirror/engine/vfx';
import { TG, TSY, Trails } from '../src/views/mirror/engine/trails';
import { NVT, VFX_BODY, VFX_CORE, VFX_HALO } from '../src/views/mirror/paint/vfx';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;
const audio: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
function make(run: RunSave, settings: Partial<EngineSettings> = {}, content: ContentRegistry = EMPTY) {
  const hooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
  const s: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...settings };
  return createEngine(canvas(), run, { painter: createDebugPainter(run.map, s.quality, 1), audio, content, hooks, settings: s }) as MirrorEngine;
}
function setupFor(run: RunSave): { run: RunSave; setup: WaveSetup } {
  const r = beginWave(run);
  return { run: r, setup: waveSetup(r, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)) };
}
const withWeapons = (run: RunSave, ws: [WeaponId, 1 | 2 | 3 | 4][]): RunSave => ({ ...run, weapons: ws.map(([id, t]) => ({ id, t })) });
function quiet(eng: MirrorEngine) {
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  return W;
}
function crowd(W: MirrorEngine['world'], n: number, d0 = 70): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, d = d0 + (k % 5) * 30;
    const h = W.spawn('blot', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false });
    const i = W.E.slotOf(h);
    if (i >= 0) { W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0; }
  }
}
/** A 2D context that accepts everything (every property a callable no-op). */
function nullCtx(): CanvasRenderingContext2D {
  const fn: unknown = new Proxy(function () { return fn; }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : fn), set: () => true, apply: () => fn });
  return fn as CanvasRenderingContext2D;
}
/** A 2D context that records the alpha of every fill and image (the rest are no-ops). */
function recCtx() {
  const log: { op: string; a: number; fill: string }[] = [];
  const st = { globalAlpha: 1, fillStyle: '#000' as string };
  const noop = () => {};
  const ctx = new Proxy(st as Record<string, unknown>, {
    get: (t, k) => {
      if (k === 'fill' || k === 'fillRect' || k === 'drawImage') return () => log.push({ op: k as string, a: t.globalAlpha as number, fill: String(t.fillStyle) });
      if (k in t) return t[k as string];
      return noop;
    },
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}
const camOf = (W: MirrorEngine['world']) => ({ x: W.px, y: W.py, scale: 1.35, w: 1280, h: 800, dpr: 1 });

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hueSat(hex: string): { h: number; s: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

describe('流光: the palette and the budgets', () => {
  it('no tint of the player\'s light is vermilion (danger stays the enemy\'s colour)', () => {
    for (const list of [VFX_HALO, VFX_BODY, VFX_CORE]) {
      expect(list).toHaveLength(NVT);
      for (const c of list) {
        const { h, s } = hueSat(c);
        // vermilion / cinnabar sits at hue ≈ 0–20° with strong saturation
        expect(s > 0.35 && (h < 22 || h > 348), `${c} h${h.toFixed(0)} s${s.toFixed(2)}`).toBe(false);
      }
    }
    // every weapon has a light, and every light is one of the VFX tints
    for (const [id, t] of Object.entries(WPN_TINT)) expect(t >= 0 && t < NVT, id).toBe(true);
    for (let fc = 0; fc < 15; fc++) expect(slashTint(fc)).toBeLessThan(NVT);
  });

  it('budgets grow with quality; low has no shot glows and two ribbon passes', () => {
    const keys = Object.keys(VFX_CAP.low) as (keyof typeof VFX_CAP.low)[];
    for (const k of keys) {
      expect(VFX_CAP.low[k], k).toBeLessThanOrEqual(VFX_CAP.mid[k]);
      expect(VFX_CAP.mid[k], k).toBeLessThanOrEqual(VFX_CAP.high[k]);
    }
    expect(VFX_CAP.low.glows).toBe(0);
    expect(VFX_CAP.low.passes).toBe(2);
    expect(VFX_CAP.high.trails).toBeLessThanOrEqual(96);
  });

  it('every pool keeps to its cap, and to half of it under the frame guard', () => {
    for (const q of ['low', 'mid', 'high'] as const) {
      const { run, setup } = setupFor(newRun(opts()));
      const eng = make(run, { quality: q });
      eng.start(run, setup);
      const W = quiet(eng);
      const V = vfxOf(W);
      for (let k = 0; k < 200; k++) {
        V.shock(k, 0, 80, VT.gold); V.slash(0, 0, k, 90, 120, VT.azure); V.lance(0, 0, k, 100, 8, VT.azure);
        V.bolt(0, 0, 100, k, VT.gold); V.beam(0, 0, k, 300, 8, VT.moon); V.bloom(0, 0, 30, VT.gold, 0.3); V.stain(k, 0, 20, 0);
      }
      const c = VFX_CAP[q];
      expect(V.rings.count, q).toBeLessThanOrEqual(c.rings);
      expect(V.slashes.count).toBeLessThanOrEqual(c.slashes);
      expect(V.lances.count).toBeLessThanOrEqual(c.lances);
      expect(V.bolts.count).toBeLessThanOrEqual(c.bolts);
      expect(V.beams.count).toBeLessThanOrEqual(c.beams);
      expect(V.flecks.count).toBeLessThanOrEqual(c.flecks);
      expect(V.blooms.count).toBeLessThanOrEqual(c.blooms);
      expect(V.stains.count).toBeLessThanOrEqual(c.stains);
      V.clear();
      W.degrade = 1;
      for (let k = 0; k < 200; k++) { V.shock(k, 0, 80, VT.gold, { prio: 2 }); V.slash(0, 0, k, 90, 120, VT.azure, 0, 0.2, 2); }
      expect(V.rings.count).toBeLessThanOrEqual(Math.max(1, c.rings >> 1));
      expect(V.slashes.count).toBeLessThanOrEqual(Math.max(1, c.slashes >> 1));
      eng.dispose();
    }
  });
});

describe('流光: ribbon trails', () => {
  it('a fed owner continues its trail; a reused slot (cut, or a jump) starts a new one; the finished are reaped', () => {
    const T = new Trails('mid');
    const px = T.px;
    T.begin('mid', 0);
    const a = T.feed(TG.shot, 5, 0, 0, 0, 6, 0.2, VT.jade, TSY.light);
    expect(a).toBeGreaterThanOrEqual(0);
    let t = 0;
    for (let f = 1; f <= 10; f++) { t += 1 / 60; T.begin('mid', t); expect(T.feed(TG.shot, 5, f * 12, 0, t, 6, 0.2, VT.jade, TSY.light)).toBe(a); }
    expect(T.np[a]).toBeGreaterThan(3);
    // a jump far away is a new owner in the same slot
    t += 1 / 60; T.begin('mid', t);
    const b = T.feed(TG.shot, 5, 900, 900, t, 6, 0.2, VT.jade, TSY.light);
    expect(b).not.toBe(a);
    // cut: the next feed starts afresh even close by
    t += 1 / 60; T.begin('mid', t);
    T.cut(TG.shot, 5);
    const c = T.feed(TG.shot, 5, 902, 900, t, 6, 0.2, VT.jade, TSY.light);
    expect(c).not.toBe(b);
    // long after, everything is reaped and the arrays were never replaced
    T.begin('mid', t + 2);
    T.reap(t + 2);
    expect(T.count).toBe(0);
    expect(T.px).toBe(px);
  });

  it('never holds more trails than its quality allows (and the limit passed in)', () => {
    for (const q of ['low', 'mid', 'high'] as const) {
      const T = new Trails(q);
      T.begin(q, 0.1);
      for (let k = 0; k < 400; k++) T.feed(TG.shot, k, k * 3, 0, 0.1, 6, 0.3, VT.jade, TSY.light);
      expect(T.count, q).toBe(VFX_CAP[q].trails);
      expect(T.refused).toBeGreaterThan(0);
      const T2 = new Trails(q);
      T2.begin(q, 0.1);
      for (let k = 0; k < 400; k++) T2.feed(TG.shot, k, k * 3, 0, 0.1, 6, 0.3, VT.jade, TSY.light, 5);
      expect(T2.count).toBeLessThanOrEqual(5);
    }
  });

  it('draws a ribbon (polygon fills) for a moving owner, and an arc ribbon for an orbiting blade', () => {
    const T = new Trails('high');
    const { ctx, log } = recCtx();
    const cam = { x: 0, y: 0, scale: 1.35, w: 1280, h: 800, dpr: 1 };
    let t = 0;
    for (let f = 0; f < 8; f++) { t += 1 / 60; T.begin('high', t); T.feed(TG.shot, 1, f * 14, 0, t, 6, 0.2, VT.jade, TSY.light); }
    T.draw(ctx, cam, t, TG.shot, 3);
    expect(log.filter((l) => l.op === 'fill').length).toBe(3);
    log.length = 0;
    T.draw(ctx, cam, t, TG.shot, 2);
    expect(log.filter((l) => l.op === 'fill').length).toBe(2);
    log.length = 0;
    T.arc(ctx, cam, 0, 0, 100, 1, 0.6, 1, 5, VT.jade, 3);
    expect(log.filter((l) => l.op === 'fill').length).toBe(3);
  });
});

describe('流光: the weapons emit their light', () => {
  const cases: [WeaponId, 'slashes' | 'lances' | 'rings' | 'bolts' | 'beams' | 'blooms'][] = [
    ['longquan', 'slashes'], ['yanyue', 'slashes'], ['claw', 'slashes'], ['drunkfist', 'slashes'], ['qingfeng', 'lances'], ['pestle', 'rings'],
    ['qin', 'rings'], ['thunder', 'bolts'], ['moonmirror', 'beams'], ['fire', 'rings'], ['gourd', 'rings'], ['seven', 'rings'], ['qingping', 'blooms'],
  ];
  for (const [id, pool] of cases) {
    it(`${id} → ${pool}`, () => {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 11 })), [[id, 3]]), wave: 6 });
      const eng = make(run);
      eng.start(run, setup);
      const W = quiet(eng);
      crowd(W, 16, id === 'qingfeng' || id === 'pestle' || id === 'qin' ? 50 : 90);
      const V = vfxOf(W);
      const before = V.st[pool];
      eng.stepN(240);
      expect(V.st[pool], id).toBeGreaterThan(before);
      // the old ring and line fx are gone from the player's side
      for (let i = 0; i < W.P.n; i++) if (W.P.alive[i]) expect(['slashArc', 'beamRay', 'boltChain', 'swordStreak', 'pulseRing', 'critSpark']).not.toContain(W.P.kind[i]);
      eng.dispose();
    });
  }

  it('the go stones blast in ink without moving the camera', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 5, char: 'player' as CharId })), [['gobowl', 4]]), wave: 8 });
    const eng = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    // mortal bodies walking in, so the stones go off
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; W.spawn('blot', W.px + Math.cos(a) * 160, W.py + Math.sin(a) * 160, { bloom: false }); }
    const V = vfxOf(W);
    let worst = 0, now = 1000;
    for (let f = 0; f < 60 * 12; f++) { now += 1000 / 60; eng.frame(now); worst = Math.max(worst, Math.hypot(W.feel.offX, W.feel.offY)); }
    expect(V.st.rings).toBeGreaterThan(0);
    expect(worst).toBe(0);
    eng.dispose();
  });
});

describe('流光: every 镜技 has a signature', () => {
  const chars = Object.keys(COMPANIONS) as CharId[];
  for (const ch of chars) {
    it(`${ch} · ${COMPANIONS[ch].skill}`, () => {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 21, char: ch })), [['qingping', 2], ['yanyue', 2], ['casket', 2]]), wave: 6, stats: { crit: 100 } });
      const eng = make(run, {}, CONTENT);
      eng.start(run, setup);
      const W = quiet(eng);
      crowd(W, 20, 90);
      eng.stepN(30);
      const V = vfxOf(W);
      const sum = () => V.st.rings + V.st.slashes + V.st.lances + V.st.bolts + V.st.blooms + V.st.flecks;
      const before = sum();
      // stop the weapons so only the skill speaks
      W.slots.length = 0;
      W.skillCd = 0;
      expect(W.castSkill(null, { x: 1, y: 0 })).toBe(true);
      let crit = 0;
      for (let k = 0; k < 60 * 6 && W.skillRun; k++) { eng.stepN(1); for (let i = 0; i < W.P.n; i++) if (W.P.alive[i] && W.P.kind[i] === 'critSpark') crit++; }
      expect(sum(), ch).toBeGreaterThan(before);
      // the vermilion crit star never marks the player's skill
      expect(crit).toBe(0);
      eng.dispose();
    });
  }
});

describe('流光: the renderer', () => {
  it('turns the old ring fx into vectors: an enemy slam in ink, your level-up in gold with a column of light', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const eng = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const V = vfxOf(W);
    const r = new Renderer(createDebugPainter(run.map, 'high', 1));
    W.fx('shockRing', W.px + 200, W.py, { r: 90, life: 0.3 });
    W.fx('levelRing', W.px, W.py, { r: 120, life: 0.5 });
    r.draw(W, nullCtx(), camOf(W));
    let fx = 0;
    for (let i = 0; i < W.P.n; i++) if (W.P.alive[i] && (W.P.kind[i] === 'shockRing' || W.P.kind[i] === 'levelRing')) fx++;
    expect(fx).toBe(0);
    let ink = 0, gold = 0;
    for (let i = 0; i < V.rings.n; i++) if (V.rings.alive[i]) { if (V.rings.flags[i] & VF.ink) ink++; if (V.rings.tint[i] === VT.gold) gold++; }
    expect(ink).toBe(1);
    expect(gold).toBe(1);
    expect(V.blooms.count).toBeGreaterThan(0);
    eng.dispose();
  });

  it('draws every layer with the light alive (shots, trails, dash, summons, zones, stains), lit and dark, on each quality and under reduced motion', () => {
    for (const q of ['low', 'mid', 'high'] as const) for (const reduceMotion of [false, true]) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 9, char: 'swordsman' })), [['qingping', 4], ['casket', 4], ['brush', 4], ['crane', 4], ['moonwheel', 4], ['fire', 4]]), wave: 9 });
      const eng = make(run, { quality: q, reduceMotion }, CONTENT);
      eng.start(run, setup);
      const W = quiet(eng);
      crowd(W, 20, 120);
      const r = new Renderer(createDebugPainter(run.map, q, 1));
      const V = vfxOf(W);
      for (let f = 0; f < 90; f++) {
        eng.stepN(2);
        if (f === 30) { W.skillCd = 0; W.castSkill(null, { x: 1, y: 0 }); }
        if (f === 60) W.light(260);
        expect(() => r.draw(W, nullCtx(), camOf(W))).not.toThrow();
      }
      expect(V.count() + r.trails.count).toBeGreaterThan(0);
      expect(drawOrder(true)).toContain('playerShots');
      eng.dispose();
    }
  });

  it('shot trails and glows follow the budget; the frame guard drops the glows and halves the trails', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 9 })), [['repeater', 4], ['dart', 4], ['qingping', 4], ['flute', 4]]), wave: 9, stats: { aspd: 200 } });
    const eng = make(run, { quality: 'mid' });
    eng.start(run, setup);
    const W = quiet(eng);
    crowd(W, 30, 200);
    const r = new Renderer(createDebugPainter(run.map, 'mid', 1));
    for (let f = 0; f < 60; f++) { eng.stepN(1); r.draw(W, nullCtx(), camOf(W)); }
    expect(r.trails.live(TG.shot)).toBeGreaterThan(0);
    expect(r.trails.count).toBeLessThanOrEqual(VFX_CAP.mid.trails);
    W.degrade = 1;
    for (let f = 0; f < 60; f++) { eng.stepN(1); r.draw(W, nullCtx(), camOf(W)); }
    expect(r.trails.count).toBeLessThanOrEqual(VFX_CAP.mid.trails >> 1);
    eng.dispose();
  });

  it('reduced motion: the i-frames hold a steady half-tone instead of a 10 Hz blink; the dash ribbon is short', () => {
    const alphas = (calm: boolean) => {
      const { run, setup } = setupFor(newRun(opts({ char: 'swordsman' })));
      const eng = make(run, { reduceMotion: calm });
      eng.start(run, setup);
      const W = quiet(eng);
      const r = new Renderer(createDebugPainter(run.map, 'high', 1));
      W.iframes = 1;
      const seen = new Set<number>();
      for (let f = 0; f < 12; f++) {
        eng.stepN(1);
        W.iframes = 1;
        const { ctx, log } = recCtx();
        r.layer('player', W, ctx, camOf(W));
        // the figure is the debug painter's paper-white circle
        for (const l of log) if (l.op === 'fill' && l.fill === '#f4f1e8') seen.add(Math.round(l.a * 100));
      }
      eng.dispose();
      return seen;
    };
    const blink = alphas(false), calm = alphas(true);
    expect(blink.size).toBeGreaterThan(1);
    expect([...calm]).toEqual([55]);
  });
});
