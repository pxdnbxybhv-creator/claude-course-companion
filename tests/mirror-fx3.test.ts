// 水月幻镜 · 流光, third pass (the owner: 「攻击的特效进一步提升」): every blow lands an impact where it
// meets the body — a hot white core, a halo in the light of the weapon that struck, sparks of it flung
// along the blow and what flies off by flavour (embers off fire, arcs off 雷符, wine, ink, jade chips, go
// stones); a crit adds a star-burst, a kill a ring and a flash; the hit marks take the weapon's light;
// the dead bodies' pieces fly over the effects; impacts keep to a budget per step and per quality
// (halved under the frame guard); reduced motion keeps them calm; the level-up keeps its streaks off
// the figure.
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { Renderer } from '../src/views/mirror/engine/render';
import { FK, FL, IF, VFX_CAP, VT, WPN_FLAVOR, WPN_TINT, vfxOf } from '../src/views/mirror/engine/vfx';
import { HF, SRCI } from '../src/views/mirror/engine/consts';
import { PF } from '../src/views/mirror/engine/feel';
import { SH, TN } from '../src/views/mirror/paint/feel';
import { WEAPON_REG } from '../src/views/mirror/ids';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;
const audio: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
function make(run: RunSave, settings: Partial<EngineSettings> = {}) {
  const hooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
  const s: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...settings };
  return createEngine(canvas(), run, { painter: createDebugPainter(run.map, s.quality, 1), audio, content: EMPTY, hooks, settings: s }) as MirrorEngine;
}
function start(ws: [WeaponId, 1 | 2 | 3 | 4][], settings: Partial<EngineSettings> = {}) {
  const run0 = { ...newRun(opts()), weapons: ws.map(([id, t]) => ({ id, t })) };
  const run = beginWave(run0);
  const setup: WaveSetup = waveSetup(run, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
  const eng = make(run, settings);
  eng.start(run, setup);
  const W = eng.world;
  W.godmode = true;
  W.plan = { ...W.plan, groups: [], elites: [], treasures: [] };
  W.len = 1e9;
  return { eng, W };
}
/** A still, tough body at (dx, dy) from you; its slot. */
function body(W: MirrorEngine['world'], dx: number, dy: number, hp = 1e12): number {
  const h = W.spawn('blot', W.px + dx, W.py + dy, { bloom: false });
  const i = W.E.slotOf(h);
  W.E.hp[i] = W.E.hpMax[i] = hp; W.E.speed[i] = 0; W.E.dmg[i] = 0;
  return i;
}
function nullCtx(): CanvasRenderingContext2D {
  const fn: unknown = new Proxy(function () { return fn; }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : fn), set: () => true, apply: () => fn });
  return fn as CanvasRenderingContext2D;
}
const camOf = (W: MirrorEngine['world']) => ({ x: W.px, y: W.py, scale: 1.35, w: 1280, h: 800, dpr: 1 });
const live = (P: { n: number; alive: Uint8Array }, f: (i: number) => boolean = () => true) => { let n = 0; for (let i = 0; i < P.n; i++) if (P.alive[i] && f(i)) n++; return n; };

describe('流光 v3: impacts', () => {
  it('every weapon has a flavour; the light of each blow is its weapon\'s', () => {
    for (const w of WEAPON_REG) {
      expect(WPN_FLAVOR[w.id as WeaponId], w.id).toBeGreaterThanOrEqual(0);
      expect(WPN_TINT[w.id as WeaponId], w.id).toBeGreaterThanOrEqual(0);
    }
    const { eng, W } = start([['qingping', 3], ['peach', 3], ['yanyue', 3]]);
    const V = vfxOf(W);
    V.clear();
    const i = body(W, 120, 0);
    W.strike(i, 1, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
    expect(V.impacts.count).toBe(1);
    const j = V.impacts.alive.indexOf(1);
    expect(V.impacts.tint[j]).toBe(VT.jade);
    expect(V.impacts.kind[j]).toBe(FL.jade);
    // where the blow meets the body: on the near side, toward where it came from
    expect(V.impacts.x[j]).toBeLessThan(W.E.x[i]);
    // a 桃木剑 blow: gamboge; a 偃月 blow: gold and heavy
    eng.stepN(1);
    V.clear();
    W.strike(i, 1, 0, 1, 0, W.px, W.py, 1, SRCI.weapon, 0);
    const k = V.impacts.alive.indexOf(1);
    expect(V.impacts.tint[k]).toBe(VT.gamboge);
    eng.stepN(1);
    V.clear();
    W.strike(i, 1, 0, 1, 0, W.px, W.py, 2, SRCI.weapon, HF.melee);
    const m = V.impacts.alive.indexOf(1);
    expect(V.impacts.tint[m]).toBe(VT.gold);
    expect(V.impacts.flags[m] & IF.heavy).toBeTruthy();
    // a burn's tick lands no impact
    eng.stepN(1);
    V.clear();
    W.strike(i, 1, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, HF.dot | HF.quiet);
    expect(V.impacts.count).toBe(0);
    eng.dispose();
  });

  it('a crit adds a star-burst; a kill a ring and a flash in the killing weapon\'s light', () => {
    const { eng, W } = start([['qingping', 3]]);
    const V = vfxOf(W);
    V.clear();
    const i = body(W, 120, 0);
    W.strike(i, 1, 1, 2, 0, W.px, W.py, 0, SRCI.weapon, 0);
    expect(live(V.impacts, (j) => (V.impacts.flags[j] & IF.crit) !== 0)).toBe(1);
    eng.stepN(1);
    V.clear();
    const d = body(W, -120, 0, 1);
    W.strike(d, 50, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
    expect(!!W.E.alive[d] && W.E.hp[d] > 0).toBe(false);
    const kills = live(V.impacts, (j) => (V.impacts.flags[j] & IF.kill) !== 0);
    expect(kills).toBe(1);
    for (let j = 0; j < V.impacts.n; j++) if (V.impacts.alive[j] && V.impacts.flags[j] & IF.kill) {
      expect(V.impacts.tint[j]).toBe(VT.jade);
      expect(V.impacts.life[j]).toBeGreaterThan(0.25);
    }
    eng.dispose();
  });

  it('what flies off a blow is its flavour: embers off fire, arcs off 雷符, wine, jade chips, go stones', () => {
    const cases: [WeaponId, (W: MirrorEngine['world']) => boolean][] = [
      ['fire', (W) => live(vfxOf(W).flecks, (j) => vfxOf(W).flecks.kind[j] === FK.flame) > 0],
      ['thunder', (W) => vfxOf(W).bolts.count > 0],
      ['gourd', (W) => live(vfxOf(W).flecks, (j) => vfxOf(W).flecks.kind[j] === FK.drop) > 0],
      ['qingping', (W) => live(vfxOf(W).flecks, (j) => vfxOf(W).flecks.kind[j] === FK.chip) > 0],
      ['gobowl', (W) => live(vfxOf(W).flecks, (j) => vfxOf(W).flecks.kind[j] === FK.stone) > 0 && live(vfxOf(W).impacts, (j) => (vfxOf(W).impacts.flags[j] & IF.clack) !== 0) > 0],
      ['qin', (W) => live(vfxOf(W).flecks, (j) => vfxOf(W).flecks.kind[j] === FK.note || vfxOf(W).flecks.kind[j] === FK.glint) > 0],
    ];
    for (const [w, ok] of cases) {
      const { eng, W } = start([[w, 3]]);
      const V = vfxOf(W);
      V.clear();
      const i = body(W, 120, 0);
      W.strike(i, 1, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
      expect(ok(W), w).toBe(true);
      eng.dispose();
    }
  });

  it('keeps to a budget: a few impacts a step (crits and kills twice), the pool\'s cap, half under the frame guard', () => {
    for (const q of ['low', 'mid', 'high'] as const) {
      const { eng, W } = start([['qingfeng', 3]], { quality: q });
      const V = vfxOf(W);
      V.clear();
      const bodies: number[] = [];
      for (let k = 0; k < 40; k++) bodies.push(body(W, 80 + (k % 8) * 20, (k >> 3) * 20));
      for (const i of bodies) W.strike(i, 1, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
      expect(V.impacts.count, q).toBe(VFX_CAP[q].impStep);
      eng.stepN(1);
      V.clear();
      for (const i of bodies) W.strike(i, 1, 1, 2, 0, W.px, W.py, 0, SRCI.weapon, 0);
      expect(V.impacts.count, q).toBe(Math.min(VFX_CAP[q].impacts, VFX_CAP[q].impStep * 2));
      // many steps: never past the pool's cap
      for (let s = 0; s < 20; s++) { eng.stepN(1); for (const i of bodies) W.strike(i, 1, 1, 2, 0, W.px, W.py, 0, SRCI.weapon, 0); }
      expect(V.impacts.count, q).toBeLessThanOrEqual(VFX_CAP[q].impacts);
      // the frame guard halves it
      W.degrade = 1;
      V.clear();
      eng.stepN(1);
      for (const i of bodies) W.strike(i, 1, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
      expect(V.impacts.count, q).toBeLessThanOrEqual(Math.max(1, VFX_CAP[q].impStep >> 1));
      eng.dispose();
    }
  });

  it('reduced motion: fewer flecks off a blow, and the impact draws without a throw', () => {
    const count = (calm: boolean) => {
      const { eng, W } = start([['yanyue', 3]], { reduceMotion: calm });
      const V = vfxOf(W);
      V.clear();
      const i = body(W, 60, 0);
      W.strike(i, 1, 1, 2, 0, W.px, W.py, 0, SRCI.weapon, HF.melee);
      const n = V.flecks.count;
      const r = new Renderer(createDebugPainter('lake', 'high', 1));
      expect(() => r.draw(W, nullCtx(), camOf(W))).not.toThrow();
      eng.dispose();
      return n;
    };
    const calm = count(true), full = count(false);
    expect(calm).toBeGreaterThan(0);
    expect(calm).toBeLessThan(full);
  });
});

describe('流光 v3: marks, pieces and the level-up', () => {
  it('the hit marks take the light of the weapon that struck', () => {
    const { eng, W } = start([['peach', 3], ['qingping', 3]]);
    const F = W.feel, M = F.mk;
    const i = body(W, 120, 0);
    const tints = (slot: number) => {
      M.clear();
      W.strike(i, 1, 1, 2, 0, W.px, W.py, slot, SRCI.weapon, 0);
      const out: number[] = [];
      for (let j = 0; j < M.n; j++) if (M.alive[j] && (M.shape[j] === SH.star || M.shape[j] === SH.beam)) out.push(M.tint[j]);
      eng.stepN(1);
      return out;
    };
    const peach = tints(0);
    expect(peach).toContain(TN.gamboge);
    expect(peach).not.toContain(TN.jade);
    expect(tints(1)).toContain(TN.jade);
    eng.dispose();
  });

  it('the dead bodies\' pieces are drawn with the effects, over them, not under them in the enemy layer', () => {
    const { eng, W } = start([['qingping', 3]]);
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const d = body(W, 120, 0, 1);
    W.feel.corpse('mon:blot' as never, 0, 1);
    W.strike(d, 50, 0, 1, 0, W.px, W.py, 0, SRCI.weapon, 0);
    // (the debug painter has no shards: plant a piece by hand)
    const Fr = W.feel.fr;
    if (!Fr.count) { const f = Fr.take(); Fr.x[f] = W.px; Fr.y[f] = W.py; Fr.life[f] = Fr.life0[f] = 0.3; Fr.g[f] = 2; Fr.q[f] = 0; Fr.sc[f] = 1; Fr.id[f] = 'mon:blot' as never; }
    const calls: string[] = [];
    const R = r as unknown as Record<string, (...a: unknown[]) => unknown>;
    const df = R.drawFrags.bind(r);
    R.drawFrags = (...a: unknown[]) => { calls.push('frags'); return df(...a); };
    r.layer('enemies', W, nullCtx(), camOf(W));
    expect(calls).toEqual([]);
    r.layer('effects', W, nullCtx(), camOf(W));
    expect(calls).toEqual(['frags']);
    eng.dispose();
  });

  it('light shots shed motes of their light only while the world moves (a held frame sheds nothing)', () => {
    const { eng, W } = start([['dart', 3], ['qingping', 3], ['sunbow', 3]], { quality: 'high' });
    for (let k = 0; k < 6; k++) body(W, 260 + k * 20, -60 + k * 25);
    const r = new Renderer(createDebugPainter('lake', 'high', 1));
    const V = vfxOf(W);
    let shed = 0;
    for (let f = 0; f < 90; f++) {
      eng.stepN(1);
      const n0 = V.st.flecks;
      r.draw(W, nullCtx(), camOf(W));
      shed += V.st.flecks - n0;
      expect(V.st.flecks - n0).toBeLessThanOrEqual(VFX_CAP.high.sheds);
      // the same world time drawn again (a hitstop, a held frame): nothing more
      const n1 = V.st.flecks;
      r.draw(W, nullCtx(), camOf(W));
      expect(V.st.flecks).toBe(n1);
    }
    expect(shed).toBeGreaterThan(0);
    eng.dispose();
  });

  it('the level-up\'s streaks start well clear of the figure (their tails never cross him)', () => {
    const { eng, W } = start([['qingping', 3]]);
    const P = W.feel.sp;
    P.clear();
    W.feel.level(W.px, W.py);
    let streaks = 0;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i] || P.tint[i] === TN.ink) continue;
      if (P.flags[i] & PF.stretch) { streaks++; expect(Math.hypot(P.x[i] - W.px, P.y[i] - W.py)).toBeGreaterThanOrEqual(38); }
    }
    expect(streaks).toBeGreaterThan(0);
    eng.dispose();
  });
});
