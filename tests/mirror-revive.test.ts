// 水月幻镜 · 破镜重圆 and the wider pickup: the run's first death goes 'down' (the world frozen) when the
// UI answers `downed`; revive() rises at 50% 气血 with 2 s of invulnerability, a jade shockwave that
// throws the crowd back and wipes enemy shots near you, and run.revived = true; a second death, a
// tutorial run or a UI without the hook die at once as before; giveUp() is the normal death. The
// starting pickup radius is 150% of the old 90 u.
import { describe, expect, it } from 'vitest';
import type {
  ContentRegistry, DeathResult, DownInfo, EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveResult, WaveSetup,
} from '../src/views/mirror/types';
import { F } from '../src/views/mirror/data';
import { REVIVE, allUnlocked, beginWave, canRevive, computeStats, emptyStats, newRun, pickupRadius, validateRun, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { DOWN_ANIM, drawDown } from '../src/views/mirror/engine/down';
import { VT, vfxOf } from '../src/views/mirror/engine/vfx';
import { CONTENT } from '../src/views/mirror/engine/content';

const EMPTY: ContentRegistry = { skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {} };
const sounds: string[] = [];
const AUDIO: MirrorAudio = { prime: async () => {}, sfx: (n) => { sounds.push(n); }, pickup: () => {}, music: () => {}, dispose: () => {} };

function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const canvas = () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800, getContext: () => null, getBoundingClientRect: () => ({ width: 1280, height: 800 }) }) as unknown as HTMLCanvasElement;

interface Log { downs: DownInfo[]; deaths: DeathResult[]; ends: WaveResult[]; errors: unknown[] }
type OnDown = (eng: MirrorEngine, d: DownInfo) => void;

function make(run: RunSave, o: { downed?: OnDown | false; content?: ContentRegistry; settings?: Partial<EngineSettings> } = {}): { eng: MirrorEngine; log: Log } {
  const log: Log = { downs: [], deaths: [], ends: [], errors: [] };
  let eng!: MirrorEngine;
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {},
    waveEnd: (r) => log.ends.push(r), death: (d) => log.deaths.push(d), error: (e) => log.errors.push(e),
  };
  const cb = o.downed;
  if (cb !== false) hooks.downed = (d) => { log.downs.push({ ...d }); cb?.(eng, d); };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh', ...o.settings };
  eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, settings.quality, 1), audio: AUDIO, content: o.content ?? EMPTY, hooks, settings }) as MirrorEngine;
  return { eng, log };
}
function setupFor(run: RunSave): { run: RunSave; setup: WaveSetup } {
  const r = beginWave(run);
  return { run: r, setup: waveSetup(r, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20)) };
}
/** A lethal, undodgeable blow from nowhere. */
function kill(eng: MirrorEngine, cause = 'blot'): void {
  const W = eng.world;
  W.iframes = 0; W.invulnT = 0; W.hp = 1;
  W.hurtFrom(999, -1, true, true, cause, false, false);
}
/** A still, harmless crowd around you (d0 … d0 + 120 u). */
function crowd(W: MirrorEngine['world'], n: number, d0 = 60): number[] {
  const hs: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, d = d0 + (k % 5) * 30;
    const h = W.spawn('blot', W.px + Math.cos(a) * d, W.py + Math.sin(a) * d, { bloom: false });
    const i = W.E.slotOf(h);
    if (i >= 0) { W.E.hp[i] = W.E.hpMax[i] = 1e9; W.E.speed[i] = 0; W.E.dmg[i] = 0; }
    hs.push(h);
  }
  return hs;
}
const distOf = (W: MirrorEngine['world'], h: number) => { const i = W.E.slotOf(h); return Math.hypot(W.E.x[i] - W.px, W.E.y[i] - W.py); };

describe('拾取: the starting pickup radius is 150% of the old one', () => {
  it('F.pickupBase is 135 u (90 × 1.5), and 拾取% scales it as before', () => {
    expect(F.pickupBase).toBe(135);
    expect(F.pickupBase).toBe(90 * 1.5);
    const s = emptyStats();
    expect(pickupRadius(s)).toBe(135);
    expect(pickupRadius({ ...s, pickup: 40 })).toBeCloseTo(189);
    expect(pickupRadius({ ...s, pickup: -25 })).toBeCloseTo(101.25);
  });
  it('the engine picks up from 135 u at the wave start (a companion with no 拾取)', () => {
    const { run, setup } = setupFor(newRun(opts()));
    expect(computeStats(run).pickup).toBe(0);
    const { eng } = make(run);
    eng.start(run, setup);
    expect(eng.world.pickupR).toBe(135);
    eng.dispose();
  });
});

describe('破镜重圆: the first death goes down', () => {
  it('canRevive: not once revived, never in a tutorial', () => {
    expect(canRevive({})).toBe(true);
    expect(canRevive({ revived: false })).toBe(true);
    expect(canRevive({ revived: true })).toBe(false);
    expect(canRevive({ tutorial: true })).toBe(false);
    expect(REVIVE).toMatchObject({ price: 50, hpPct: 0.5, invuln: 2 });
  });

  it('the first death: phase down, downed once, no death; the world is frozen and the fall animates', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    eng.stepN(120);
    const hs = crowd(W, 6);
    const i0 = W.E.slotOf(hs[0]);
    W.E.speed[i0] = 80;
    kill(eng, 'blot');
    expect(eng.phase).toBe('down');
    expect(log.deaths).toHaveLength(0);
    expect(log.downs).toEqual([{ canRevive: true, price: 50, wave: 1, cause: 'blot' }]);
    expect(W.hp).toBe(0);
    const t = W.t, x = W.E.x[i0], y = W.E.y[i0], nE = W.E.count, tw = W.tWave;
    eng.stepN(90);
    expect(W.t).toBe(t);
    expect(W.tWave).toBe(tw);
    expect([W.E.x[i0], W.E.y[i0], W.E.count]).toEqual([x, y, nE]);
    expect(W.downAge).toBeCloseTo(1.5);
    expect(W.downAnimating).toBe(false);
    // stray blows while down do nothing
    expect(W.hurtFrom(50, -1, true, true, 'x', false, false)).toBe(0);
    expect(log.downs).toHaveLength(1);
    // the engine's calls outside 'down' are no-ops
    expect(eng.revive()).toBe(true);
    expect(eng.revive()).toBe(false);
    eng.giveUp();
    expect(log.deaths).toHaveLength(0);
    eng.dispose();
  });

  it('revive: 50% 气血, 2 s invulnerable (with the shimmer), run.revived, the crowd thrown back, enemy shots near you wiped', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    eng.stepN(60);
    const hs = crowd(W, 8, 50);
    // enemy shots: two near, one far
    const blob = (x: number, y: number) => W.enemyShot('inkBlob', W.px + x, W.py + y, 0, 0, 6, 5, 5, false, 0, 0, 0, 0, -1);
    blob(60, 0); blob(-150, 100); blob(600, 0);
    expect(W.ES.count).toBe(3);
    const d0 = hs.map((h) => distOf(W, h));
    kill(eng);
    expect(eng.phase).toBe('down');
    eng.stepN(30);
    const rings0 = vfxOf(W).st.rings;
    sounds.length = 0;
    expect(eng.revive()).toBe(true);
    expect(eng.phase).toBe('wave');
    expect(W.hp).toBe(Math.round(W.hpMax * 0.5));
    expect(W.invulnT).toBeCloseTo(2);
    expect(W.reviveT).toBeCloseTo(2);
    expect(run.revived).toBe(true);
    expect(W.ES.count).toBe(1);
    expect(vfxOf(W).st.rings).toBeGreaterThanOrEqual(rings0 + 2);
    expect(sounds).toContain('levelUp');
    expect(W.titles.some((t) => t.text.zh === '破镜重圆')).toBe(true);
    // the revival shockwave's light is the player's (jade and moon-white), never vermilion
    const R = vfxOf(W).rings;
    const tints = new Set<number>();
    for (let i = 0; i < R.n; i++) if (R.alive[i]) tints.add(R.tint[i]);
    expect(tints.has(VT.jade)).toBe(true);
    expect(tints.has(VT.moon)).toBe(true);
    eng.stepN(12);
    const d1 = hs.map((h) => distOf(W, h));
    for (let k = 0; k < hs.length; k++) expect(d1[k]).toBeGreaterThan(d0[k] + 60);
    // invulnerable for 2 s: blows do nothing; the shimmer keeps ringing
    const hp = W.hp;
    const r1 = vfxOf(W).st.rings;
    expect(W.hurtFrom(40, -1, true, true, 'x', false, false)).toBe(0);
    eng.stepN(60);
    expect(W.hp).toBeGreaterThanOrEqual(hp);
    expect(vfxOf(W).st.rings).toBeGreaterThanOrEqual(r1 + 3);
    eng.stepN(70);
    expect(W.invulnT).toBe(0);
    expect(W.reviveT).toBe(0);
    expect(W.hurtFrom(10, -1, true, true, 'x', false, false)).toBeGreaterThan(0);
    expect(log.deaths).toHaveLength(0);
    eng.dispose();
  });

  it('a second death offers no revive: hooks.death at once', () => {
    const { run, setup } = setupFor(newRun(opts({ char: 'musician' })));
    const { eng, log } = make(run);
    eng.start(run, setup);
    kill(eng);
    expect(eng.revive()).toBe(true);
    eng.stepN(200);
    kill(eng, 'second');
    expect(log.downs).toHaveLength(1);
    expect(log.deaths).toHaveLength(1);
    expect(log.deaths[0].cause).toBe('second');
    expect(eng.phase).toBe('dead');
    eng.dispose();
  });

  it('a run that already revived (a later wave) and a tutorial run die at once', () => {
    for (const extra of [{ revived: true }, { tutorial: true }] as Partial<RunSave>[]) {
      const { run, setup } = setupFor({ ...newRun(opts()), ...extra });
      const { eng, log } = make(run);
      eng.start(run, setup);
      kill(eng);
      expect(log.downs).toHaveLength(0);
      expect(log.deaths).toHaveLength(1);
      expect(eng.phase).toBe('dead');
      eng.dispose();
    }
  });

  it('without a downed hook (today\'s UI, the sims) the death is exactly as before', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run, { downed: false });
    eng.start(run, setup);
    sounds.length = 0;
    kill(eng, 'blot');
    expect(eng.phase).toBe('dead');
    expect(log.deaths).toHaveLength(1);
    expect(log.deaths[0].cause).toBe('blot');
    expect(sounds.filter((s) => s === 'shatter')).toHaveLength(1);
    expect(run.revived).toBeUndefined();
    eng.dispose();
  });

  it('giveUp: the normal death path (the partial, the cause), one shatter in all', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng, log } = make(run);
    eng.start(run, setup);
    eng.stepN(300);
    sounds.length = 0;
    kill(eng, 'blot');
    eng.stepN(30);
    expect(log.deaths).toHaveLength(0);
    eng.giveUp();
    expect(eng.phase).toBe('dead');
    expect(log.deaths).toHaveLength(1);
    expect(log.deaths[0]).toMatchObject({ wave: 1, cause: 'blot' });
    expect(log.deaths[0].partial.wave).toBe(1);
    expect(log.deaths[0].partial.ms).toBe(5000);
    expect(sounds.filter((s) => s === 'shatter')).toHaveLength(1);
    expect(run.revived).toBeUndefined();
    expect(eng.revive()).toBe(false);
    eng.dispose();
  });

  it('the UI may answer inside the hook; a hook that throws gives up (never a stuck down)', () => {
    const a = setupFor(newRun(opts()));
    const A = make(a.run, { downed: (e) => e.giveUp() });
    A.eng.start(a.run, a.setup);
    kill(A.eng);
    expect(A.eng.phase).toBe('dead');
    expect(A.log.deaths).toHaveLength(1);
    A.eng.dispose();

    const b = setupFor(newRun(opts()));
    const B = make(b.run, { downed: (e) => { e.revive(); } });
    B.eng.start(b.run, b.setup);
    kill(B.eng);
    expect(B.eng.phase).toBe('wave');
    expect(B.eng.world.hp).toBe(Math.round(B.eng.world.hpMax * 0.5));
    B.eng.stepN(60);
    expect(B.log.deaths).toHaveLength(0);
    B.eng.dispose();

    const c = setupFor(newRun(opts()));
    const C = make(c.run, { downed: () => { throw new Error('ui'); } });
    const err = console.error;
    console.error = () => {};
    try {
      C.eng.start(c.run, c.setup);
      kill(C.eng);
    } finally { console.error = err; }
    expect(C.eng.phase).toBe('dead');
    expect(C.log.deaths).toHaveLength(1);
    C.eng.dispose();
  });

  it('is deterministic: the same revive at the same step gives the same wave; a wave with no death is unchanged by the hook', () => {
    const base = { ...newRun(opts({ char: 'swordsman' })), weapons: [{ id: 'qingping' as const, t: 2 as const }, { id: 'dart' as const, t: 1 as const }] };
    const play = (withHook: boolean, dieAt: number | null) => {
      const { run, setup } = setupFor(base);
      const { eng, log } = make(run, { downed: withHook ? undefined : false, content: CONTENT });
      eng.start(run, setup);
      for (let k = 0; k < 60 * 40 && (eng.phase === 'wave' || eng.phase === 'ending' || eng.phase === 'down'); k++) {
        if (eng.paused) eng.resume();
        eng.world.godmode = dieAt === null || k < dieAt || k > dieAt + 1;
        if (k === dieAt) { eng.world.godmode = false; kill(eng); eng.stepN(20); eng.revive(); }
        eng.stepN(1);
      }
      eng.dispose();
      return { end: log.ends[0], revived: run.revived === true, downs: log.downs.length };
    };
    const a = play(true, 600), b = play(true, 600);
    expect(a.end).toBeDefined();
    expect([a.revived, a.downs]).toEqual([true, 1]);
    expect(a).toEqual(b);
    const c = play(true, null), d = play(false, null);
    expect(c.end).toBeDefined();
    expect(c.end).toEqual(d.end);
  });

  it('drawDown draws the blot and the fading figure only while down (reduced motion too)', () => {
    const { run, setup } = setupFor(newRun(opts()));
    const { eng } = make(run);
    eng.start(run, setup);
    const W = eng.world;
    const calls: string[] = [];
    const ctx = new Proxy({ globalAlpha: 1, fillStyle: '#000' } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => { void a; calls.push(String(k)); }),
      set: (t, k, v) => { t[k as string] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const cam = { x: W.px, y: W.py, scale: 1.35, w: 1280, h: 800, dpr: 1 };
    expect(drawDown(W, ctx, cam)).toBe(false);
    kill(eng);
    eng.stepN(10);
    expect(drawDown(W, ctx, cam)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    W.settings.reduceMotion = true;
    eng.stepN(Math.ceil(DOWN_ANIM * 60));
    calls.length = 0;
    expect(drawDown(W, ctx, cam)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    eng.revive();
    expect(drawDown(W, ctx, cam)).toBe(false);
    eng.dispose();
  });
});

describe('破镜重圆: the save', () => {
  it('validateRun keeps revived, tutorial and downAt when set, and adds nothing to a run without them', () => {
    const r = newRun(opts());
    expect(validateRun(r)).toEqual(r);
    expect(Object.keys(validateRun(r)!)).not.toContain('revived');
    const v = validateRun({ ...r, revived: true, tutorial: true, downAt: 3 })!;
    expect([v.revived, v.tutorial, v.downAt]).toEqual([true, true, 3]);
    const bad = validateRun({ ...r, revived: 'yes', tutorial: 1, downAt: -2 })!;
    expect([bad.revived, bad.tutorial, bad.downAt]).toEqual([undefined, undefined, undefined]);
    expect(validateRun(JSON.parse(JSON.stringify({ ...r, revived: true })))!.revived).toBe(true);
  });
});
