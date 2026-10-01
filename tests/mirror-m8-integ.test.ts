// 水月幻镜 · m8 Phase 2 seams the integrator connected (PLAN §2): the Results deed line's report field
// (cr/B-integrator.md: RunReport.deeds, set in settleMeta) and 诗成 in the engine's skill packets
// (cr/I-integrator.md: World.hitSlot reads critOverflowOf like the weapon slot).
import { describe, expect, it } from 'vitest';
import type { EngineHooks, EngineSettings, MirrorAudio, NewRunOpts, RunSave, WaveSetup } from '../src/views/mirror/types';
import { PASSIVES } from '../src/views/mirror/data';
import { allUnlocked, beginWave, deedDust, newRun, settleMeta, waveSetup } from '../src/views/mirror/logic';
import { defaultMeta } from '../src/app/mirror';
import { createEngine, type MirrorEngine } from '../src/views/mirror/engine';
import { createDebugPainter } from '../src/views/mirror/engine/debugPainter';
import { CONTENT } from '../src/views/mirror/engine/content';

const DAY = '2026-10-01';
function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 4242, char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 20, free: false,
    runIndex: 1, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
const run = (o: Partial<NewRunOpts> = {}, patch: Partial<RunSave> = {}): RunSave => ({ ...newRun(opts(o)), pending: { ...newRun(opts(o)).pending, start: null }, ...patch });

describe('m8 integrator seams', () => {
  it('settleMeta names the item deeds it pays for (once), and nothing for weapon deeds or deeds already done', () => {
    const m0 = defaultMeta(DAY);
    const r = run({}, { wave: 6, runStats: { peakCurse: 5, peakCritsWave: 120, killsSword: 600 } });
    const first = settleMeta(m0, r, 'death', DAY);
    expect([...(first.report.deeds ?? [])].sort()).toEqual(['critWave', 'curseFive']);
    expect(first.report.deeds!.reduce((s, id) => s + deedDust(id), 0)).toBe(20 + 30);
    expect(first.report.unlocks).toEqual(['longquan']); // the weapon deed opens its weapon, not a deed line
    const again = settleMeta(first.meta, r, 'death', DAY);
    expect('deeds' in again.report).toBe(false);
    expect('deeds' in settleMeta(m0, run({}, { wave: 6 }), 'death', DAY).report).toBe(false);
  });

  const SILENT: MirrorAudio = { prime: async () => {}, sfx: () => {}, pickup: () => {}, music: () => {}, dispose: () => {} };
  const canvas = (w = 1280, h = 800) =>
    ({ width: w, height: h, clientWidth: w, clientHeight: h, getContext: () => null, getBoundingClientRect: () => ({ width: w, height: h }) }) as unknown as HTMLCanvasElement;
  function critMOfSkill(char: 'poet' | 'scholar'): number {
    const base = beginWave({ ...newRun(opts({ char })), wave: 5 });
    const setup: WaveSetup = waveSetup(base, defaultMeta(DAY), new Date(2026, 9, 1, 20));
    const hooks: EngineHooks = { hud: () => {}, levelUp: () => {}, crate: () => {}, coin: () => {}, boss: () => {}, waveEnd: () => {}, death: () => {}, error: (e) => { throw e; } };
    const settings: EngineSettings = { quality: 'high', dprCap: 1, reduceMotion: false, nums: 2, shake: true, aim: 'auto', lang: 'zh' };
    const eng = createEngine(canvas(), base, { painter: createDebugPainter(base.map, 'high', 1), audio: SILENT, content: CONTENT, hooks, settings }) as MirrorEngine;
    eng.start(base, setup);
    eng.world.godmode = true;
    const W = eng.world as unknown as Record<string, unknown> & { stats: { crit: number; critDmg: number }; px: number; py: number };
    const h = eng.world.spawn('blot', W.px + 60, W.py, { bloom: false });
    const slot = (eng.world as unknown as { E: { slotOf(h: number): number } }).E.slotOf(h as number);
    W.stats = { ...W.stats, crit: 150, critDmg: 0 };
    let critM = NaN;
    const orig = (W.strike as (...a: unknown[]) => number).bind(eng.world);
    W.strike = (...a: unknown[]) => { critM = a[3] as number; return orig(...a); };
    (W.hitSlot as (i: number, pk: unknown, x: number, y: number) => number).call(eng.world, slot, { base: 5, src: 'skill' }, W.px, W.py);
    eng.dispose();
    return critM;
  }
  it('诗成 reaches the skill packets: 诗仙\'s crit over 100 counts ×overflow there too', () => {
    const over = PASSIVES.baipian.p.overflow ?? 1;
    expect(over).toBeGreaterThan(1);
    expect(critMOfSkill('poet') - critMOfSkill('scholar')).toBeCloseTo(((150 - 100) / 100) * (over - 1));
  });
});
