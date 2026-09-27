// 水月幻镜 · 打击感 (the engine's feel layer): the hitstop budget holds in a busy second, the sound bus
// never starts more than 4 voices a step and meets the hit on its own step, sparks stay inside their
// pool, reduced motion turns off every stop, shake, kick, zoom and squash, numbers pop at once and
// merge per body, and the impact voices render cleanly.
import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import type { WeaponId } from '../src/views/mirror/ids';
import { allUnlocked, beginWave, newRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { FC, fcOfWeapon } from '../src/views/mirror/engine/feel';
import { FEEL_MIX, FEEL_NAMES, renderFeel } from '../src/views/mirror/audio/voices';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;
/** An audio with the impact layer that logs every voice with the simulation step it started on. */
function logAudio(W: () => MirrorEngine['world'] | null) {
  const log: { name: string; step: number }[] = [];
  const a: MirrorAudio & { feel(name: string): void } = {
    prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {},
    feel: (name: string) => { log.push({ name, step: W()?.perf.steps ?? -1 }); },
  };
  return { a, log };
}
function make(run: RunSave, settings: Partial<EngineSettings> = {}) {
  let eng: MirrorEngine | null = null;
  const { a, log } = logAudio(() => eng?.world ?? null);
  const hooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: () => {} };
  const s: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...settings };
  eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, s.quality, 1), audio: a, content: EMPTY, hooks, settings: s }) as MirrorEngine;
  return { eng, log };
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
/** A crowd of immortal bodies around you (a busy screen). */
function crowd(W: MirrorEngine['world'], n: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, d = 70 + (k % 5) * 30;
    const h = W.spawn(k % 7 === 0 ? 'turtle' : 'blot', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false });
    const i = W.E.slotOf(h);
    if (i >= 0) { W.E.hp[i] = W.E.hpMax[i] = 1e12; W.E.speed[i] = 0; W.E.dmg[i] = 0; }
  }
}
const BUSY: [WeaponId, 1 | 2 | 3 | 4][] = [['yanyue', 4], ['pestle', 4], ['longquan', 4], ['claw', 4], ['repeater', 4], ['thunder', 4]];

describe('打击感: the feel layer', () => {
  it('hitstop never takes more than ~15% of any second of a busy, crit-heavy fight', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3 })), BUSY), wave: 11, stats: { aspd: 150, crit: 70 } });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    crowd(W, 60);
    let now = 1000;
    const secs: number[] = [];
    let frozen0 = 0, real0 = 0;
    for (let f = 0; f < 60 * 8; f++) {
      now += 1000 / 60;
      eng.frame(now);
      if (f % 60 === 59) { const st = W.feel.st; secs.push((st.frozenMs - frozen0) / (st.realMs - real0)); frozen0 = st.frozenMs; real0 = st.realMs; }
    }
    const st = W.feel.stats();
    expect(st.stopReqMs).toBeGreaterThan(st.stopMs); // it asked for more than it got: the budget bit
    expect(st.stopMs).toBeGreaterThan(100); // … and it still stops
    for (const s of secs) expect(s).toBeLessThanOrEqual(0.15);
    expect(st.maxShare).toBeLessThanOrEqual(0.15);
    expect(st.hits).toBeGreaterThan(200);
    eng.dispose();
  });

  it('the sound bus: ≤ 4 impact voices a step, started on the step of the hit; sparks stay in their pool', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 5 })), BUSY), wave: 11, stats: { aspd: 150, crit: 50 } });
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    crowd(W, 80);
    let maxSparks = 0;
    const hitSteps = new Set<number>();
    const s0 = W.feel.hit.bind(W.feel);
    W.feel.hit = (...a: Parameters<typeof s0>) => { if (!a[6]) hitSteps.add(W.perf.steps); s0(...a); };
    for (let k = 0; k < 600; k++) { eng.stepN(1); maxSparks = Math.max(maxSparks, W.feel.sp.count); }
    const per = new Map<number, number>();
    for (const v of log) if (v.name !== 'whoosh' && v.name !== 'release' && v.name !== 'zip' && v.name !== 'heart') per.set(v.step, (per.get(v.step) ?? 0) + 1);
    expect(per.size).toBeGreaterThan(50);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(4);
    // every class-colour voice starts on a step that landed a hit (never a frame late)
    const classVoices = new Set(['slash', 'smash', 'arrow', 'dartHit', 'spark', 'splash', 'blot', 'jade', 'clack', 'pluckHit', 'moonHit', 'clawHit']);
    for (const v of log) if (classVoices.has(v.name)) expect(hitSteps.has(v.step)).toBe(true);
    expect(log.some((v) => v.name === 'crack')).toBe(true);
    expect(log.some((v) => v.name === 'thump')).toBe(true);
    expect(maxSparks).toBeLessThanOrEqual(W.feel.sp.cap);
    eng.dispose();
  });

  it('reduced motion: no stop, shake, kick, zoom or squash reaches the frame', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 7 })), BUSY), wave: 11, stats: { crit: 100 } });
    const { eng } = make(run, { reduceMotion: true, shake: true });
    eng.start(run, setup);
    const W = quiet(eng);
    crowd(W, 30);
    let now = 1000, worst = 0;
    const t0 = W.tWave;
    for (let f = 0; f < 240; f++) {
      now += 1000 / 60;
      eng.frame(now);
      worst = Math.max(worst, W.hitstopMs, Math.abs(W.feel.offX), Math.abs(W.feel.offY), W.feel.zoom, W.shakePx);
    }
    W.hitstop(80); W.shake(12); W.feel.punch(0.1);
    eng.frame(now + 16);
    expect(worst).toBe(0);
    expect(W.hitstopMs).toBe(0);
    expect(W.tWave - t0).toBeGreaterThan(3.95); // the game never froze
    expect(W.feel.st.hits).toBeGreaterThan(50);
    eng.dispose();
  });

  it('numbers show on the first hit and merge per body; crits are marked', () => {
    const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 9 })), []), wave: 3 });
    const { eng } = make(run);
    eng.start(run, setup);
    const W = quiet(eng);
    const h = W.spawn('blot', W.px + 80, W.py, { bloom: false });
    const i = W.E.slotOf(h);
    W.E.hp[i] = W.E.hpMax[i] = 1e9;
    W.strike(i, 10, 0, 1, 0, W.px, W.py, -1, 0, 0);
    expect(W.N.count).toBe(1); // at once, in step with the flash
    expect(W.E.flash[i]).toBeGreaterThan(0);
    for (let k = 0; k < 12; k++) { W.strike(i, 10, k === 5 ? 1 : 0, 2, 0, W.px, W.py, -1, 0, 0); eng.stepN(2); }
    expect(W.N.count).toBe(1); // one climbing number, not a pile
    let j = -1;
    for (let k = 0; k < W.N.n; k++) if (W.N.alive[k]) j = k;
    expect(W.N.v[j]).toBeGreaterThan(60); // several hits in one number
    expect(W.N.style[j]).toBe(1);
    eng.dispose();
  });

  it('the camera: never past 6 px in a busy crit fight, small bumps most of the time; zoom halves with shake off', () => {
    const zmax: number[] = [];
    for (const shake of [true, false]) {
      const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 3 })), BUSY), wave: 11, stats: { aspd: 150, crit: 60 } });
      const { eng } = make(run, { shake });
      eng.start(run, setup);
      const W = quiet(eng);
      crowd(W, 60);
      let now = 1000, z = 0;
      const offs: number[] = [];
      for (let f = 0; f < 60 * 6; f++) {
        now += 1000 / 60;
        eng.frame(now);
        offs.push(Math.hypot(W.feel.offX, W.feel.offY));
        z = Math.max(z, W.feel.zoom);
        if (f === 200) W.feel.skillImpact(W.px, W.py); // a big jolt on top of the crits
      }
      offs.sort((a, b) => a - b);
      if (shake) {
        expect(offs[offs.length - 1]).toBeLessThanOrEqual(6.0001); // GDD §20.3
        expect(offs[Math.floor(offs.length * 0.9)]).toBeLessThanOrEqual(3.5);
        expect(offs[Math.floor(offs.length * 0.9)]).toBeGreaterThan(0.3); // … but the crits are felt
      } else expect(offs[offs.length - 1]).toBe(0);
      zmax.push(z);
      eng.dispose();
    }
    expect(zmax[0]).toBeGreaterThan(0.04);
    expect(zmax[1]).toBeCloseTo(zmax[0] / 2, 5);
  });

  it('a blow you take: no drift, an 8 ms tick, the drum under the grunt in the bus; crits never buzz', () => {
    const buzz: number[] = [];
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (ms: number) => { buzz.push(ms); return true; } }, configurable: true, writable: true });
    try {
      for (const reduceMotion of [false, true]) {
        buzz.length = 0;
        const { run, setup } = setupFor({ ...withWeapons(newRun(opts({ seed: 7 })), BUSY), wave: 11, stats: { crit: 100 } });
        let sfx: string[] = [];
        const { eng, log } = make(run, { reduceMotion });
        (eng.world.audio as MirrorAudio).sfx = (n) => { sfx.push(n); };
        eng.start(run, setup);
        const W = quiet(eng);
        crowd(W, 20);
        eng.stepN(240); // a crit storm
        expect(W.feel.st.hits).toBeGreaterThan(50);
        expect(buzz).toEqual([]);
        W.godmode = false;
        const h = W.spawn('blot', W.px + 30, W.py, { bloom: false });
        const a = W.E.slotOf(h);
        const x0 = W.px, y0 = W.py;
        sfx = [];
        const before = log.length;
        W.hurtFrom(3, a, true, false, 'blot', false, true);
        eng.stepN(1);
        let drift = 0;
        for (let k = 0; k < 30; k++) { eng.stepN(1); drift = Math.max(drift, Math.hypot(W.px - x0, W.py - y0)); }
        expect(drift).toBe(0); // GDD §20.1: no drift
        expect(buzz).toEqual([8]); // GDD §20.2
        expect(sfx).toContain('hurt'); // the heartbeat drum
        expect(log.slice(before).some((v) => v.name === 'grunt')).toBe(true);
        eng.dispose();
      }
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it('every weapon has a feel class; the impact voices render short and clean', () => {
    expect(fcOfWeapon('yanyue', ['heavy'])).toBe(FC.heavy);
    expect(fcOfWeapon('qingping', ['flying'])).toBe(FC.flying);
    expect(fcOfWeapon('sunbow', ['bow'])).toBe(FC.arrow);
    expect(fcOfWeapon('gobowl', ['go'])).toBe(FC.go);
    const sr = 8000;
    for (const name of FEEL_NAMES) {
      const [x] = renderFeel(name, sr);
      let peak = 0;
      for (let k = 0; k < x.length; k++) { const v = Math.abs(x[k]); if (!Number.isFinite(v)) throw new Error(name); if (v > peak) peak = v; }
      expect(peak, name).toBeGreaterThan(0.05);
      expect(peak, name).toBeLessThan(0.95);
      expect(x.length / sr, name).toBeLessThan(1.2);
      expect(FEEL_MIX[name].cap).toBeGreaterThanOrEqual(1);
    }
  });
});
