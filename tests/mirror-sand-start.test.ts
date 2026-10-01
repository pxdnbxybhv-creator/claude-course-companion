// 水月幻镜 · m8 · the 模拟场's start run (sandbox.md §3, §11): start at wave N (1, 10, 30, 45, 70) with the bot's
// build, bare hands, a copy of the paused run or the last sandbox build: wave = N − 1, inWave = null, nothing
// owed or paid, `sand` present (and dropped by validateRun, so a real save can never carry it), the bot build
// deterministic per seed and never dead (immortal), the paused real run untouched.
import { describe, expect, it } from 'vitest';
import { defaultMeta } from '../src/app/mirror';
import { allUnlocked, computeStats, heartFor, MASTERY_MAX, NEVER_LENT, newRun, validateRun } from '../src/views/mirror/logic';
import { SAND_WAVE, clampWave, sandHeart, sandStart, sandUnlocks, type SandStartOpts } from '../src/views/mirror/sim/sandstart';
import { simulateRun } from '../src/views/mirror/sim/bot';
import { F, HEART } from '../src/views/mirror/data';
import { COMPANION_REG, ITEM_REG, WEAPON_REG } from '../src/views/mirror/ids';
import type { MirrorMeta, RunSave } from '../src/views/mirror/types';

const DAY = '2026-09-30';
function meta(o: Partial<MirrorMeta> = {}): MirrorMeta {
  return { ...defaultMeta(DAY), heart: { ranks: { heartHp: 2, heartLuck: 1, heartRevive: 0 }, pick: {}, plain: false }, mastery: { musician: 30 }, ...o };
}
const opts = (o: Partial<SandStartOpts> = {}): SandStartOpts => ({
  char: 'musician', map: 'lake', diff: 1, vows: {}, wave: 30, seed: 7, heart: 'full', mastery: 'full', pool: 'all', build: 'bot', today: DAY, ...o,
});
function paused(): RunSave {
  const r = newRun({
    seed: 77, char: 'painter', map: 'forest', diff: 2, vows: {}, daily: false, plain: false, heart: {}, ticket: 5, free: false,
    runIndex: 2, rate: 1, startedDay: DAY, term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0,
  });
  return { ...r, wave: 12, inWave: 13, coins: 9, downAt: 13, revived: true, moon: 321 };
}
const noSand = (r: RunSave) => { const { sand: _s, ...rest } = r; void _s; return rest as RunSave; };

describe('the start run', () => {
  it('the start wave is 1–70, default 30', () => {
    expect(SAND_WAVE).toEqual({ min: 1, max: 70, def: 30 });
    expect(clampWave(0)).toBe(1);
    expect(clampWave(99)).toBe(70);
    expect(clampWave(Number.NaN)).toBe(30);
    expect(clampWave(44.6)).toBe(45);
  });

  for (const N of [1, 10, 30, 45, 70]) {
    for (const build of ['bot', 'bare', 'copy'] as const) {
      it(`wave ${N}, ${build}: ends wave ${N - 1}, not in a wave, owes and pays nothing, and loads as a real save only without sand`, () => {
        const m = meta({ active: paused() });
        const before = structuredClone(m);
        const r = sandStart(m, opts({ wave: N, build }));
        expect(r.wave).toBe(N - 1);
        expect(r.inWave).toBeNull();
        expect(r.ticket).toBe(0);
        expect(r.coins).toBe(0);
        expect(r.downAt).toBeUndefined();
        expect(r.revived).toBeUndefined();
        expect(r.sand).toEqual({ sheet: [], curse: 0 });
        expect(r.weapons.length).toBeGreaterThan(0);
        expect(r.pending.start).toBeNull();
        const v = validateRun(r);
        expect(v).not.toBeNull();
        expect(v!.sand).toBeUndefined();
        expect(validateRun(noSand(r))).toEqual(v);
        // the paused real run (and all of meta) is never touched
        expect(m).toEqual(before);
      });
    }
  }

  it('the bot build is deterministic per seed and plays on to N − 1 (immortal), with the chosen 心镜', () => {
    const m = meta();
    const a = sandStart(m, opts({ wave: 30, seed: 11 }));
    const b = sandStart(m, opts({ wave: 30, seed: 11 }));
    expect(b).toEqual(a);
    const c = sandStart(m, opts({ wave: 30, seed: 12 }));
    expect(JSON.stringify(c.weapons) + JSON.stringify(c.items)).not.toBe(JSON.stringify(a.weapons) + JSON.stringify(a.items));
    // without immortal the logic bot can die early; with it, it reaches the wave asked
    const bot = simulateRun({ seed: 11, char: 'musician', map: 'lake', diff: 1, maxWave: 29, immortal: true });
    expect(bot.dead).toBe(false);
    expect(bot.run.wave).toBe(29);
    expect(a.heart).toEqual(heartFor(m, true));
    expect(a.heart.heartRevive).toBeUndefined(); // 回魂 never lent
    expect(a.runStats).toEqual({});
    expect(a.byWeapon).toEqual({});
    expect(a.shop).toBeNull();
    expect(computeStats(a).hp).toBeGreaterThan(computeStats(sandStart(m, opts({ wave: 30, seed: 11, heart: 'plain' }))).hp);
  });

  it('bare: the starting weapon, a level that fits the wave (with its 气血), and the start 月华 unless given', () => {
    const r = sandStart(meta(), opts({ build: 'bare', wave: 30 }));
    expect(r.lvl).toBe(1 + Math.round(0.9 * 29));
    expect(r.stats.hp ?? 0).toBe(r.lvl - 1);
    expect(r.moon).toBe(F.startMoon);
    expect(sandStart(meta(), opts({ build: 'bare', moon: 480 })).moon).toBe(480);
    // 书生 picks from a choice: the first is taken
    const s = sandStart(meta(), opts({ build: 'bare', char: 'scholar' }));
    expect(s.weapons.length).toBe(1);
  });

  it('copy: the paused run, detached (ticket, coins, revive marks gone), never written back; falls back to bare without one', () => {
    const p = paused();
    const m = meta({ active: p });
    const r = sandStart(m, opts({ build: 'copy', wave: 20, moon: 50 }));
    expect(r.char).toBe('painter');
    expect(r.seed).toBe(p.seed);
    expect(r.wave).toBe(19);
    expect(r.moon).toBe(50);
    expect(m.active).toBe(p);
    expect(p.inWave).toBe(13);
    const none = sandStart(meta(), opts({ build: 'copy', wave: 20 }));
    expect(none.char).toBe('musician');
    expect(none.lvl).toBe(1 + Math.round(0.9 * 19));
    // 'last' re-uses a saved sandbox build the same way
    const last = sandStart(meta(), opts({ build: 'last', wave: 5, last: { ...p, sand: { sheet: [{ id: 'aspd', mode: 'add', v: 50 }], curse: 3 } } }));
    expect(last.char).toBe('painter');
    expect(last.sand).toEqual({ sheet: [], curse: 0 });
  });

  it('心镜 满阶 / 自有 / 素镜 and 心得 满 / 自有; the pool all or mine', () => {
    const m = meta({ heart: { ranks: { heartHp: 2 }, pick: {}, plain: true } });
    expect(sandHeart(m, 'full').heartHp).toBe(HEART.heartHp.costs.length);
    expect(sandHeart(m, 'own')).toEqual({ heartHp: 2 }); // 自有 is the earned ranks even while the lobby is on 素镜
    expect(sandHeart(m, 'plain')).toEqual({});
    for (const f of NEVER_LENT) expect(sandHeart(m, 'full')[f]).toBeUndefined();
    const plain = sandStart(m, opts({ build: 'bare', heart: 'plain' }));
    expect(plain.plain).toBe(true);
    expect(plain.heart).toEqual({});
    // 心得 满 gives 琴师 a second starting weapon to choose (resolved to the first here)
    expect(MASTERY_MAX).toBe(10);
    const all = sandUnlocks(m, 'all');
    expect(all.weapons.size).toBe(WEAPON_REG.length);
    expect(all.items.size).toBe(ITEM_REG.length);
    expect(sandUnlocks(m, 'mine').weapons.size).toBeLessThanOrEqual(WEAPON_REG.length);
  });

  it('every companion can be started (the hidden three too)', () => {
    for (const c of COMPANION_REG) {
      const r = sandStart(meta(), opts({ char: c.id, build: 'bare', wave: 10 }));
      expect(r.char).toBe(c.id);
      expect(r.weapons.length).toBe(1);
    }
  });
});
