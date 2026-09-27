// 水月幻镜 · 镜衡 smoke: batches of bot runs and the summary the tests check (GDD §24.4, §25).
// A SMOKE TEST ONLY: bot.ts's simplified combat step disagrees with the real engine in both directions,
// so these numbers do not vouch for balance.md. Tune on the real engine with sim/realbal.ts (API.md §2.1a).
import { COMPANION_REG, type MapId } from '../ids';
import type { CharacterId, DiffIndex } from '../types';
import { settlePay } from '../logic/economy';
import { simulateRun, type BotRun } from './bot';

export interface Summary {
  runs: number;
  meanWave: number;
  medianWave: number;
  minWave: number;
  maxWave: number;
  reached5: number;
  reached10: number;
  cleared30: number;
  meanCoins: number;
  meanPay: number;
  maxCoins: number;
}
export function summarize(runs: readonly BotRun[]): Summary {
  const ws = runs.map((r) => r.W).sort((a, b) => a - b);
  const n = Math.max(1, runs.length);
  const pay = runs.map((r) => settlePay(r.meta, r.run, '2026-09-27').pay.income);
  return {
    runs: runs.length,
    meanWave: ws.reduce((a, b) => a + b, 0) / n,
    medianWave: ws[Math.floor(ws.length / 2)] ?? 0,
    minWave: ws[0] ?? 0,
    maxWave: ws[ws.length - 1] ?? 0,
    reached5: runs.filter((r) => r.W >= 5).length / n,
    reached10: runs.filter((r) => r.W >= 10).length / n,
    cleared30: runs.filter((r) => r.W >= 30).length / n,
    meanCoins: runs.reduce((a, r) => a + r.coins, 0) / n,
    meanPay: pay.reduce((a, b) => a + b, 0) / n,
    maxCoins: Math.max(0, ...runs.map((r) => r.coins)),
  };
}
/** `seeds` runs per companion on its natural lean (the §24.4 smoke). */
export function companionSmoke(seeds: number, o: { map?: MapId; diff?: DiffIndex; maxWave?: number; beginner?: boolean } = {}): Record<CharacterId, Summary> {
  const out = {} as Record<CharacterId, Summary>;
  for (const c of COMPANION_REG) {
    const runs: BotRun[] = [];
    for (let s = 1; s <= seeds; s++) runs.push(simulateRun({ seed: s * 7919 + c.id.length, char: c.id, map: o.map, diff: o.diff, maxWave: o.maxWave, beginner: o.beginner }));
    out[c.id] = summarize(runs);
  }
  return out;
}
