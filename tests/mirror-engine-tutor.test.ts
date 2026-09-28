// 水月幻镜 · the tutorial's engine controller (engine/tutor.ts, d-tutorial §5.4) headless with the
// debug painter: each wave script sends its cues in order and ends within its budget under a simple
// input bot; a cue can hold the engine like the boss intro; the clock holds, ends later or ends now;
// nobody goes down in practice; no coin is ever dropped. The real runs' tip watcher is read-only: a
// wave plays byte-identically with it, and it says 'elite' once.
import { describe, expect, it } from 'vitest';
import type { CoinDrop, DeathResult, EngineHooks, EngineSettings, MirrorAudio, RunSave, WaveResult } from '../src/views/mirror/types';
import { allUnlocked, beginWave, newRun, waveSetup, wavePlan } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';
import { attachScript, attachTipWatch, clock, hold, type TutorScriptId } from '../src/views/mirror/engine/tutor';
import { tutorRun, tutorScript, tutorSetup } from '../src/views/mirror/tutor/run';

const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
function canvas(w = 1280, h = 800): HTMLCanvasElement {
  return { width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) } as unknown as HTMLCanvasElement;
}
interface Log { ends: WaveResult[]; deaths: DeathResult[]; coins: CoinDrop[]; errors: unknown[]; levels: number[] }
function make(run: RunSave): { eng: MirrorEngine; log: Log } {
  const log: Log = { ends: [], deaths: [], coins: [], errors: [], levels: [] };
  const hooks: EngineHooks = {
    hud: () => {}, levelUp: (l) => log.levels.push(l), crate: () => {}, coin: (d) => log.coins.push(d), boss: () => {},
    waveEnd: (r) => log.ends.push(r), death: (d) => log.deaths.push(d), error: (e) => log.errors.push(e),
  };
  const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 0, shake: false, aim: 'auto', lang: 'zh' };
  const eng = createEngine(canvas(), run, { painter: createDebugPainter(run.map, 'high', 1), audio: SILENT, content: CONTENT, hooks, settings }) as MirrorEngine;
  return { eng, log };
}

/** A simple player: walk to the nearest foe; step out of a circle telegraph that holds you; cast on a crowd. */
function bot(eng: MirrorEngine): void {
  const W = eng.world;
  let tx = 0, ty = 0, best = Infinity;
  for (let i = 0; i < W.E.n; i++) {
    if (!W.targetable(i) || W.E.kind[i] > 1) continue; // a blooming body waits while you stand on it
    const d = Math.hypot(W.E.x[i] - W.px, W.E.y[i] - W.py);
    if (d < best) { best = d; tx = W.E.x[i]; ty = W.E.y[i]; }
  }
  let mx = 0, my = 0;
  // walk up to the nearest foe, then circle it at sword's reach (a player keeps moving)
  if (best < Infinity) {
    const dx = tx - W.px, dy = ty - W.py;
    if (best > 110) { mx = dx; my = dy; } else { mx = -dy + (best < 70 ? -dx : 0); my = dx + (best < 70 ? -dy : 0); }
  }
  for (let i = 0; i < W.T.n; i++) {
    if (!W.T.alive[i]) continue;
    const s = W.T.shape[i];
    if (s.kind === 'circle' && Math.hypot(W.px - s.x, W.py - s.y) < s.r + 20) { mx = W.px - s.x || 1; my = W.py - s.y; }
  }
  // no target yet: wander so walking counts
  if (!mx && !my && best === Infinity) { mx = Math.cos(W.t); my = Math.sin(W.t); }
  const n = Math.hypot(mx, my) || 1;
  eng.input.move(mx / n, my / n);
}

function playScript(w: 1 | 2 | 3, budgetSec: number, holdOn: readonly string[] = []): { cues: string[]; log: Log; sec: number; held: string[]; eng: MirrorEngine } {
  const base = tutorRun('2026-09-28');
  const run: RunSave = { ...base, wave: w - 1, inWave: w };
  const { eng, log } = make(run);
  eng.start(run, tutorSetup(run));
  const cues: string[] = [];
  const held: string[] = [];
  attachScript(eng, tutorScript(w), (key) => {
    if (key !== 'foeHp') cues.push(key);
    if (key === 'crowd') eng.skill({ kind: 'auto' });
    return holdOn.includes(key);
  });
  let steps = 0;
  for (; steps < budgetSec * 60; steps++) {
    const ph = eng.world.phase;
    if (ph !== 'wave' && ph !== 'ending') break;
    if (eng.paused) { held.push(cues[cues.length - 1]); eng.resume(); }
    bot(eng);
    eng.stepN(1);
  }
  return { cues, log, sec: steps / 60, held, eng };
}

describe('the tutorial wave scripts', () => {
  it('tut1: walk, three blots, moonlight, the packs, the clock — and the wave ends in budget', () => {
    const r = playScript(1, 90);
    expect(r.log.errors).toEqual([]);
    expect(r.cues).toEqual(['move', 'moved', 'kills3', 'pickups3', 'clock']);
    expect(r.log.ends).toHaveLength(1);
    expect(r.sec).toBeLessThan(90);
    expect(r.log.levels.length).toBeGreaterThanOrEqual(1); // 书生 levels in wave 1 (W5)
    expect(r.log.coins).toEqual([]);
    expect(r.log.deaths).toEqual([]);
  });
  it('tut2: pause, the red circle (held), dodges, lanterns, the crowd and the skill, then the clock', () => {
    const r = playScript(2, 90, ['tele1']);
    expect(r.log.errors).toEqual([]);
    const i = (k: string) => r.cues.indexOf(k);
    expect(i('pause')).toBe(0);
    expect(i('tele1')).toBeGreaterThan(0);
    expect(i('dodged2')).toBeGreaterThan(i('tele1'));
    expect(i('lanterns')).toBeGreaterThan(i('dodged2'));
    expect(i('crowd')).toBeGreaterThan(i('lanterns'));
    expect(i('cast')).toBeGreaterThan(i('crowd'));
    expect(r.held).toContain('tele1');
    expect(r.log.ends).toHaveLength(1);
    expect(r.sec).toBeLessThan(90);
    expect(r.log.deaths).toEqual([]);
  });
  it('tut3: the big one (held), its first strike (held), down, a casket — the wave ends in budget', () => {
    const r = playScript(3, 75, ['foe', 'tele']);
    expect(r.log.errors).toEqual([]);
    const i = (k: string) => r.cues.indexOf(k);
    expect(i('foe')).toBeGreaterThanOrEqual(0);
    expect(i('foeDown')).toBeGreaterThan(i('foe'));
    expect(r.held).toContain('foe');
    expect(r.log.ends).toHaveLength(1);
    expect(r.log.ends[0].crates).toBeGreaterThanOrEqual(1);
    expect(r.sec).toBeLessThan(75);
    expect(r.log.deaths).toEqual([]);
    expect(r.log.coins).toEqual([]);
  });
  it('the lethal guard: a blow that would put you down heals you instead, and says so', () => {
    const run: RunSave = { ...tutorRun(), wave: 0, inWave: 1 };
    const { eng, log } = make(run);
    eng.start(run, tutorSetup(run));
    const cues: string[] = [];
    attachScript(eng, 'tut1', (k) => { cues.push(k); });
    eng.stepN(5);
    eng.world.hurt(9999, { undodgeable: true, noArmor: true });
    eng.stepN(5);
    expect(log.deaths).toEqual([]);
    expect(eng.world.hp).toBeGreaterThan(0);
    expect(cues).toContain('saved');
    expect(eng.phase).toBe('wave');
  });
});

describe('the clock and holds', () => {
  const fresh = () => {
    const run: RunSave = { ...tutorRun(), wave: 0, inWave: 1 };
    const m = make(run);
    m.eng.start(run, tutorSetup(run));
    return m;
  };
  it('clock(null) holds the wave; clock(5) ends it about 5 s later; clock(0) ends it now', () => {
    const a = fresh();
    clock(a.eng, null);
    a.eng.stepN(120 * 60);
    expect(a.eng.world.phase).toBe('wave');
    expect(a.eng.world.len).toBeNull();
    const b = fresh();
    clock(b.eng, 5);
    b.eng.stepN(4.8 * 60);
    expect(b.eng.world.phase).toBe('wave');
    b.eng.stepN(0.4 * 60);
    expect(b.eng.world.phase).not.toBe('wave');
    const c = fresh();
    clock(c.eng, 0);
    c.eng.stepN(1);
    expect(c.eng.world.phase).not.toBe('wave');
  });
  it('hold() and a cue that returns true pause at that step, like the boss intro; resume() goes on', () => {
    const a = fresh();
    hold(a.eng);
    a.eng.stepN(10);
    expect(a.eng.paused).toBe(true);
    a.eng.resume();
    expect(a.eng.paused).toBe(false);
    const run: RunSave = { ...tutorRun(), wave: 0, inWave: 1 };
    const b = make(run);
    b.eng.start(run, tutorSetup(run));
    attachScript(b.eng, 'tut1', (k) => k === 'move');
    b.eng.stepN(2 * 60);
    expect(b.eng.paused).toBe(true);
    const t = b.eng.world.tWave;
    expect(t).toBeLessThan(1);
    b.eng.resume();
    b.eng.stepN(10);
    expect(b.eng.world.tWave).toBeGreaterThan(t);
  });
  it('is harmless on an engine without a world (the stub)', () => {
    const stub = { phase: 'wave' } as unknown as MirrorEngine;
    expect(() => { attachScript(stub, 'tut1', () => {}); attachTipWatch(stub, () => {}); clock(stub, 3); hold(stub); }).not.toThrow();
  });
});

describe('real runs are untouched', () => {
  const opts = (seed: number) => ({
    seed, char: 'gardener' as const, map: 'lake' as const, diff: 1 as const, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
  const eliteWave = (run: RunSave): number => { for (let w = 1; w <= 29; w++) if (wavePlan(run, w).elites.length) return w; return 0; };
  function real(watch: boolean): { res: WaveResult | null; elites: number } {
    const base = newRun(opts(4242));
    const w = eliteWave(base);
    expect(w).toBeGreaterThan(0);
    const r = beginWave({ ...base, wave: w - 1 });
    const setup = waveSetup(r, defaultMeta('2026-09-27'), new Date(2026, 8, 27, 20));
    expect((setup as unknown as Record<string, unknown>).script).toBeUndefined();
    const { eng, log } = make(r);
    eng.start(r, setup);
    eng.world.godmode = true;
    let elites = 0;
    if (watch) attachTipWatch(eng, (k) => { if (k === 'elite') elites++; });
    for (let i = 0; i < 60 * 70; i++) {
      const ph = eng.world.phase;
      if (ph !== 'wave' && ph !== 'ending') break;
      if (eng.paused) eng.resume();
      eng.stepN(1);
    }
    return { res: log.ends[0] ?? null, elites };
  }
  it('a wave with the tip watcher plays exactly as one without, and the watcher says elite once', () => {
    const a = real(false), b = real(true);
    expect(a.res).not.toBeNull();
    expect(JSON.stringify(b.res)).toBe(JSON.stringify(a.res));
    expect(b.elites).toBe(1);
  });
  it('the tutorial plan is its own: no script field, real setups unchanged', () => {
    const run: RunSave = { ...tutorRun(), wave: 0, inWave: 1 };
    const s = tutorSetup(run);
    expect(s.plan.groups).toEqual([]);
    expect(Object.keys(s)).not.toContain('script');
    const id: TutorScriptId = tutorScript(1);
    expect(id).toBe('tut1');
  });
});
