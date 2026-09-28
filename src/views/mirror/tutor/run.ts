// 水月幻镜 · the tutorial's fixed run (d-tutorial §1.3): 书生 on 月湖 at 闲游 with one 青锋剑, a fixed
// seed and the starter pool, gentle waves the scripts pace (engine/tutor.ts), and a preset first shop.
// Pure: no meta is read, so every player gets the same practice run.
import type { RunSave, ShopState, SpawnPlan, WaveSetup } from '../types';
import type { DateKey } from '../../../core/types';
import { TUT } from '../data/tutorial';
import { computeStats, freeRerolls, newRun, starterUnlocks } from '../logic';
import type { TutorScriptId } from '../engine/tutor';

/** The practice run's seed: a constant, unrelated to real seeds (fresh crypto values) and the daily seed. */
export const TUTOR_SEED = TUT.seed >>> 0;
/** The practice run's pool: a fresh account's (every player sees the same shops). */
export const tutorUnlocks = starterUnlocks;

/** A fresh practice run. `today` only stamps it; nothing is paid, counted or saved. */
export function tutorRun(today: DateKey = '2026-01-01'): RunSave {
  const r = newRun({
    seed: TUTOR_SEED, char: 'scholar', map: 'lake', diff: 0, vows: {}, daily: false, plain: true, heart: {},
    ticket: 0, free: false, runIndex: 0, rate: 0, startedDay: today, term: null, mutator: null, boon: null,
    unlocks: tutorUnlocks(), mastery: 0,
  });
  return { ...r, weapons: [{ id: 'qingfeng', t: 1 }], pending: { ...r.pending, start: null }, tutorial: true };
}

/** A tutorial wave's plan: untimed and empty; the wave's script spawns and sets the clock. */
export function tutorPlan(w: number): SpawnPlan {
  return { wave: w, len: null, kind: 'normal', hpX: TUT.hpX, dmgX: TUT.dmgX, spdX: TUT.spdX, groups: [], elites: [], treasures: [], boss: null, kills: 0 };
}
/** The script that paces wave w (1..3; later waves reuse the last). */
export const tutorScript = (w: number): TutorScriptId => (w <= 1 ? 'tut1' : w === 2 ? 'tut2' : 'tut3');

/** Everything the engine needs for a tutorial wave: no coins, no 镜蚀, no 节气, a plain sky. */
export function tutorSetup(run: RunSave): WaveSetup {
  const wave = run.inWave ?? run.wave + 1;
  return {
    wave, plan: tutorPlan(wave), coins: [], mutators: [], term: null,
    sky: { fullMoonDay: false, lunation: 0.25, fullWave: false }, stats: computeStats(run),
  };
}

/** The first shop, preset: a second 青锋剑 (to merge), 松子, 草鞋 (to lock) and 铜铃. */
export const TUTOR_SHOP1 = [
  { kind: 'weapon', id: 'qingfeng', t: 1, locked: false },
  { kind: 'item', id: 'songzi', locked: false },
  { kind: 'item', id: 'sandals', locked: false },
  { kind: 'item', id: 'bell', locked: false },
] as const;
/** The run after wave 1 with the preset shop in place (openShop keeps a shop for the same wave). */
export function tutorShop1(run: RunSave): RunSave {
  const shop: ShopState = { wave: run.wave + 1, k: 0, free: freeRerolls(run), slots: TUTOR_SHOP1.map((s) => ({ ...s })) };
  return { ...run, shop };
}
