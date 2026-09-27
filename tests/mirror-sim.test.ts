// 水月幻镜 · 镜衡 smoke (GDD §24.4): bots play whole runs through the real logic in seconds, without
// throwing, deterministically, and the summary stays in range. The combat step is simplified (sim/bot.ts).
import { describe, expect, it } from 'vitest';
import { COMPANION_REG } from '../src/views/mirror/ids';
import { companionSmoke, summarize } from '../src/views/mirror/sim/balance';
import { simulateRun } from '../src/views/mirror/sim/bot';
import { starterUnlocks, validateRun } from '../src/views/mirror/logic';

describe('镜衡 smoke', () => {
  it('5 seeds per companion reach wave 5 without throwing, and the numbers are sane', () => {
    const t0 = Date.now();
    const s = companionSmoke(5, { maxWave: 32 });
    for (const c of COMPANION_REG) {
      const x = s[c.id];
      expect(x.runs).toBe(5);
      expect(x.reached5, c.id).toBe(1);
      expect(x.medianWave, c.id).toBeGreaterThanOrEqual(10);
      expect(x.maxCoins).toBeLessThanOrEqual(20);
      expect(x.meanPay).toBeLessThanOrEqual(70);
    }
    const means = COMPANION_REG.map((c) => s[c.id].meanWave);
    expect(Math.max(...means) / Math.min(...means)).toBeLessThan(2);
    expect(Date.now() - t0).toBeLessThan(15000);
  }, 30000);

  it('beginners fall earlier than skilled bots', () => {
    const skilled = summarize(['gardener', 'cat', 'guan'].map((c, i) => simulateRun({ seed: 11 + i, char: c as 'cat', maxWave: 25 })));
    const beginner = summarize(['gardener', 'cat', 'guan'].map((c, i) => simulateRun({ seed: 11 + i, char: c as 'cat', maxWave: 25, beginner: true })));
    expect(beginner.meanWave).toBeLessThan(skilled.meanWave);
  });

  it('is deterministic, keeps a valid save, and respects a fresh account’s unlocks', () => {
    const a = simulateRun({ seed: 42, char: 'scholar', maxWave: 15, unlocks: starterUnlocks() });
    const b = simulateRun({ seed: 42, char: 'scholar', maxWave: 15, unlocks: starterUnlocks() });
    expect(a.run).toEqual(b.run);
    expect(a.log).toEqual(b.log);
    expect(validateRun(JSON.parse(JSON.stringify(a.run)))).toEqual(a.run);
    const u = starterUnlocks();
    for (const w of a.run.weapons) expect(u.weapons.has(w.id)).toBe(true);
    for (const id of Object.keys(a.run.items)) expect(u.items.has(id as 'songzi')).toBe(true);
    expect(a.run.coins).toBeLessThanOrEqual(20);
  });
});
