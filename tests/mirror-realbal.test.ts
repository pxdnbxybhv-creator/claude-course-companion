// 水月幻镜 · 镜衡 on the real engine (sim/realbal.ts): a short smoke on every run of the suite, and the
// balance sweep on demand: MIRROR_REALBAL=1 [SEEDS=3 MAXW=31 MAP=lake LEVEL=average CHARS=guan DIFF=1 ZONES=1
// OUT=file.jsonl] npx vitest run tests/mirror-realbal.test.ts. The sweep prints a summary a bot level; it
// asserts nothing about depth.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPANION_REG, type MapId } from '../src/views/mirror/ids';
import type { CharacterId, DiffIndex } from '../src/views/mirror/types';
import { playReal, summarizeReal, type BotLevel, type RealRun } from '../src/views/mirror/sim/realbal';

describe('镜衡 on the real engine', () => {
  it('plays a short run headless, deterministically, without errors', () => {
    const a = playReal({ seed: 4242, char: 'gardener', maxWave: 3 });
    const b = playReal({ seed: 4242, char: 'gardener', maxWave: 3 });
    expect(a.errors).toBe(0);
    expect(a.W).toBeGreaterThanOrEqual(1);
    expect(b.trace).toEqual(a.trace);
    expect(a.msPerStep).toBeLessThan(4);
  });

  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  // LEVEL=beginner|average|skilled (comma-separated; default all three, BEGIN=1 = beginner only), CHARS=a,b
  // (default all 13), DIFF=0..5, SEEDS=n (seeds SEED0..SEED0+n−1, SEED0 default 1), MAXW, MAP, ZONES=1 (the bot steps out
  // of enemy ground zones), OUT=file.jsonl (one line a run, with its level)
  it.runIf(env.MIRROR_REALBAL === '1')('sweep: every companion × SEEDS, for each bot level', () => {
    const seeds = +(env.SEEDS ?? 3), maxWave = +(env.MAXW ?? 31), map = (env.MAP ?? 'lake') as MapId;
    const diff = +(env.DIFF ?? 1) as DiffIndex;
    const levels = (env.BEGIN === '1' ? 'beginner' : env.LEVEL ?? 'beginner,average,skilled').split(',') as BotLevel[];
    const chars = env.CHARS ? (env.CHARS.split(',') as CharacterId[]) : COMPANION_REG.map((c) => c.id as CharacterId);
    const all: RealRun[] = [];
    for (const level of levels) {
      const runs: RealRun[] = [];
      const s0 = +(env.SEED0 ?? 1);
      for (const c of chars) for (let s = s0; s < s0 + seeds; s++) {
        const r = playReal({ seed: s * 7919 + c.length, char: c, map, maxWave, level, diff, zones: env.ZONES === '1' });
        runs.push(r);
        if (env.OUT) appendFileSync(env.OUT, JSON.stringify({ ...r, trace: r.trace.slice(-3), level, diff }) + '\n');
      }
      console.log(level, JSON.stringify(summarizeReal(runs)));
      all.push(...runs);
    }
    expect(all.every((r) => r.errors === 0)).toBe(true);
  }, 7_200_000);
});
