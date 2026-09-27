// 水月幻镜 · 镜衡 on the real engine (sim/realbal.ts): a short smoke on every run of the suite, and the
// balance sweep on demand: MIRROR_REALBAL=1 [SEEDS=3 MAXW=31 MAP=lake BEGIN=1 OUT=file.jsonl] npx vitest
// run tests/mirror-realbal.test.ts. The sweep prints a summary; it asserts nothing about depth.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPANION_REG, type MapId } from '../src/views/mirror/ids';
import type { CharacterId } from '../src/views/mirror/types';
import { playReal, summarizeReal, type RealRun } from '../src/views/mirror/sim/realbal';

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
  it.runIf(env.MIRROR_REALBAL === '1')('sweep: every companion × SEEDS', () => {
    const seeds = +(env.SEEDS ?? 3), maxWave = +(env.MAXW ?? 31), map = (env.MAP ?? 'lake') as MapId, beginner = env.BEGIN === '1';
    const runs: RealRun[] = [];
    for (const c of COMPANION_REG) for (let s = 1; s <= seeds; s++) {
      const r = playReal({ seed: s * 7919 + c.id.length, char: c.id as CharacterId, map, maxWave, beginner });
      runs.push(r);
      if (env.OUT) appendFileSync(env.OUT, JSON.stringify(r) + '\n');
    }
    console.log(JSON.stringify(summarizeReal(runs)));
    expect(runs.every((r) => r.errors === 0)).toBe(true);
  }, 1_800_000);
});
