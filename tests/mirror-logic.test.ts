// 水月幻镜 · formulas and the run's life (GDD §4–§7, §23; the GDD's tables are the expected values).
import { describe, expect, it } from 'vitest';
import type { NewRunOpts, RunSave, WaveResult } from '../src/views/mirror/types';
import { COMPANION_REG } from '../src/views/mirror/ids';
import { COMPANIONS, F, MAPS, MONSTERS } from '../src/views/mirror/data';
import {
  allUnlocked, armorMult, arenaGeom, beginWave, bossHp, budget, budgetBase, cardOdds, cardsView, computeStats, cooldown, crateItem,
  dmgMul, dodgeCapOf, dodgeChance, endWave, fmtBig, harvestNext, heartOffer, hpMul, insideShape, nextScreen, newRun, pickCard,
  pickHeart, pickStart, procCoef, rerollCards, resolveCrate, screenOf, starterUnlocks, waveLen, wavePlan, xpNext, xpTotal, rngFor,
  enemyHit, weaponHit, playerHit, critMult, heatOf, activeMutators, spdX, isEliteWave, affixCount,
  isBossWave, isHordeWave, maxHp, summonCapOf, stonesOf,
} from '../src/views/mirror/logic';

export function opts(o: Partial<NewRunOpts> = {}): NewRunOpts {
  return {
    seed: 1234, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
    runIndex: 2, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  };
}
export function result(w: number, o: Partial<WaveResult> = {}): WaveResult {
  return {
    wave: w, moon: 40, xp: 40, field: 3, storeLeft: 0, levels: 0, crates: 0, hearts: [], sleeve: [], lives: 0, once: [], drunk: 0,
    stats: { kills: 30 }, killsBy: { blot: 20 }, byWeapon: {}, bosses: [], ms: 20000, ...o,
  };
}

describe('formulas', () => {
  it('armour both ways', () => {
    expect(armorMult(0)).toBe(1);
    expect(armorMult(15)).toBe(0.5);
    expect(armorMult(-15)).toBe(2);
    expect(enemyHit(10, 15)).toBe(5);
    expect(enemyHit(0.2, 50)).toBe(1); // at least 1
    expect(enemyHit(100, 0, { guan: true, maxHp: 40 })).toBe(8); // 关公: ≤ 20% of max HP
  });
  it('dodge cap', () => {
    expect(dodgeChance(80, 60)).toBe(0.6);
    expect(dodgeChance(80, 90)).toBe(0.75); // hard 75
    const r = newRun(opts({ char: 'change' }));
    expect(dodgeCapOf(r)).toBe(70);
    expect(dodgeCapOf({ ...r, items: { osmanthus: 1 } })).toBe(75);
  });
  it('attack speed signs and floor, proc bands', () => {
    expect(cooldown(1.2, 20)).toBeCloseTo(1);
    expect(cooldown(1, -50)).toBeCloseTo(1.5);
    expect(cooldown(1, -200)).toBeCloseTo(1.8); // clamp −80%
    expect(cooldown(0.2, 1000)).toBe(0.1);
    expect(cooldown(1, 100, true)).toBeCloseTo(1 / 1.5);
    expect([procCoef(0.4), procCoef(0.5), procCoef(0.9), procCoef(1), procCoef(4)]).toEqual([0.3, 0.6, 0.6, 1, 1]);
  });
  it('crit overflow and the damage pipeline', () => {
    const r = newRun(opts({ char: 'scholar' }));
    const s = { ...computeStats({ ...r, weapons: [{ id: 'qingfeng', t: 1 }] }), crit: 120, critDmg: 50 };
    expect(critMult(2, 10, s)).toBeCloseTo(2 + 0.5 + 0.3);
    const h = weaponHit({ ...r, weapons: [{ id: 'qingfeng', t: 1 }] }, { ...s, melee: 5, dmg: 50 }, 'qingfeng', 1);
    expect(h.raw).toBe(15);
    expect(h.mult).toBeCloseTo(1.5);
    expect(playerHit(15, 1.5, false, 2, { armor: 2 })).toBe(21); // round(22.5 − 2)
    expect(playerHit(15, 1.5, false, 2, { armor: 99 })).toBe(1);
    expect(playerHit(3, 1, false, 2, { armor: 99, noArmor: true })).toBe(3);
  });
  it('harvest grows to 30 and decays after', () => {
    expect(harvestNext(10, 5, false)).toBe(11);
    expect(harvestNext(10, 5, true)).toBe(11);
    expect(harvestNext(30, 5, true)).toBe(33);
    expect(harvestNext(30, 31, false)).toBe(27);
  });
  it('budget, HP, damage and boss HP match the §5.2 table', () => {
    expect(budgetBase(1)).toBeCloseTo(29.4);
    expect(budgetBase(10)).toBe(150);
    expect(budgetBase(30)).toBe(650);
    expect(budgetBase(45)).toBeCloseTo(650 * Math.pow(1.02, 15));
    // DMG grows 1.06 a wave from 11 (⚖3, the real-engine harness: was 1.08, 20.8 at 29 and 23.1 at 30)
    const rows: [number, number, number][] = [[1, 1, 1], [5, 2.2, 1.6], [9, 3.4, 2.2], [10, 3.7, 2.35], [12, 5.5, 2.81], [15, 14, 3.91], [19, 46, 5.9], [20, 62, 6.5], [25, 260, 10.4], [29, 800, 14.84], [30, 1056, 16.19]];
    for (const [w, hp, dmg] of rows) {
      expect(hpMul(w) / hp).toBeGreaterThan(0.99);
      expect(hpMul(w) / hp).toBeLessThan(1.01);
      expect(dmgMul(w) / dmg).toBeGreaterThan(0.99);
      expect(dmgMul(w) / dmg).toBeLessThan(1.01);
    }
    expect(hpMul(31)).toBeCloseTo(hpMul(30)); // no cliff at 31
    expect(hpMul(32)).toBeCloseTo(hpMul(30) * 1.08);
    const lake = newRun(opts()), palace = newRun(opts({ map: 'palace' }));
    expect(Math.round(bossHp(10, lake))).toBe(4810);
    expect(Math.round(bossHp(10, palace))).toBe(5051);
    expect(Math.round(bossHp(20, lake) / 100) * 100).toBe(74200);
    expect(Math.round(bossHp(30, lake) / 1000) * 1000).toBe(739000);
    expect(budget(10, { ...lake, vows: { qunmo: 2 } })).toBeCloseTo(150 * 1.24);
    expect(budget(10, { ...lake, items: { delusion: 1 } })).toBeCloseTo(180);
  });
  it('wave length, elites, affixes, 镜境 ramp', () => {
    const r = newRun(opts());
    expect([1, 5, 9, 20, 31].map((w) => waveLen(w, r))).toEqual([20, 40, 60, null, 60]);
    expect(waveLen(9, { ...r, vows: { jijing: 1 } })).toBe(51);
    expect(isEliteWave(5, 1)).toBe(true);
    expect(isEliteWave(5, 0)).toBe(false); // 闲游: none before 11
    expect(isEliteWave(33, 1)).toBe(true);
    expect([affixCount(10, 4), affixCount(11, 4), affixCount(21, 4), affixCount(21, 5), affixCount(35, 1)]).toEqual([0, 1, 1, 2, 1]);
    const hard = newRun(opts({ diff: 5 }));
    expect(spdX(1, hard) / spdX(1, r)).toBeCloseTo(1.08);
    expect(wavePlan(hard, 10).hpX / wavePlan(r, 10).hpX).toBeCloseTo(1 + 1.2 * 0.5); // ramped
    expect(wavePlan(hard, 25).hpX / wavePlan(r, 25).hpX).toBeCloseTo(2.2);
  });
  it('XP and card odds', () => {
    expect(xpNext(2)).toBe(25);
    expect([2, 5, 10, 15, 20, 25, 30].map(xpTotal)).toEqual([16, 126, 636, 1771, 3781, 6916, 11426]);
    for (const L of [1, 7, 12, 20, 30]) for (const luck of [-80, 0, 50, 300]) {
      const o = cardOdds(L, luck);
      expect(o.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
      for (const x of o) expect(x).toBeGreaterThanOrEqual(0);
    }
    expect(cardOdds(1, 0)).toEqual([91, 9, 0, 0]);
  });
  it('abbreviates big numbers', () => {
    expect(fmtBig(9999, 'zh')).toBe('9999');
    expect(fmtBig(12000, 'zh')).toBe('1.2万');
    expect(fmtBig(12000, 'en')).toBe('12k');
    expect(fmtBig(3.4e8, 'zh')).toBe('3.4亿');
  });
  it('lays out arenas inside their shapes, the same way for the same seed', () => {
    for (const m of ['lake', 'forest', 'palace'] as const) {
      const g = arenaGeom(m, 99);
      expect(g).toEqual(arenaGeom(m, 99));
      for (const o of g.obstacles) expect(insideShape(g.shape, o.x, o.y, o.r)).toBe(true);
    }
    expect(arenaGeom('lake', 1).obstacles).toHaveLength(6);
    expect(arenaGeom('forest', 1).obstacles).toHaveLength(14);
    expect(arenaGeom('palace', 1).obstacles).toEqual([{ x: 0, y: 0, r: 90, kind: 'tree', blocks: 'all' }]);
  });
});

describe('stats', () => {
  it('builds every companion’s body and passive', () => {
    for (const c of COMPANION_REG) {
      const r = newRun(opts({ char: c.id }));
      const s = computeStats(r);
      const d = COMPANIONS[c.id];
      expect(s.hp).toBe(d.hp);
      expect(s.armor).toBe(d.armor);
      expect(s.summonCap).toBe(c.id === 'painter' ? 5 : 3);
      expect(s.stones).toBe(c.id === 'player' ? 8 : 6);
    }
    const g = computeStats(newRun(opts({ char: 'gardener' })));
    expect([g.regen, g.harvest, g.aspd]).toEqual([2, 8, -15]);
    const f = computeStats(newRun(opts({ char: 'fisher' })));
    expect([f.luck, f.pickup, f.dmg]).toEqual([15, 40, -5]);
  });
  it('applies sets, items, 劫数, converts, 心镜 and the cat / Chang’e gain rules', () => {
    const r = newRun(opts({ char: 'scholar' }));
    const two = computeStats({ ...r, weapons: [{ id: 'qingfeng', t: 1 }, { id: 'qingfeng', t: 1 }] });
    expect(two.crit).toBe(5);
    const six = computeStats({ ...r, weapons: Array.from({ length: 6 }, () => ({ id: 'yanyue' as const, t: 1 as const })) });
    expect([six.melee, six.armor, six.area]).toEqual([6, 1 + 2, 15]);
    const cursed = computeStats({ ...r, items: { cuthair: 2 } });
    expect(cursed.curse).toBe(2);
    expect(cursed.dmg).toBe(20 + 4);
    expect(cursed.hp).toBe(24 - 4);
    const armoured = computeStats({ ...r, items: { ironbone: 1, needle: 1, guardmirror: 10 } });
    expect(armoured.armor).toBe(1 + 8 + 20);
    expect(armoured.dmg).toBe(40); // 铁骨 + 定海神针 share a +40% cap
    const fast = computeStats({ ...r, items: { chasewind: 1, sandals: 6 } });
    expect(fast.dmg).toBeCloseTo(10);
    const heart = computeStats({ ...r, heart: { heartHp: 2, heartLuck: 1 } });
    expect([heart.hp, heart.luck]).toEqual([28, 4]);
    const cat = computeStats({ ...newRun(opts({ char: 'cat' })), items: { songzi: 2 } });
    expect(cat.hp).toBe(16 + 4);
    const change = computeStats({ ...newRun(opts({ char: 'change' })), items: { guardmirror: 2 } });
    expect(change.armor).toBe(3);
    const guan = computeStats({ ...newRun(opts({ char: 'guan' })), wave: 40 });
    expect(guan.melee).toBe(10);
    const solo = computeStats({ ...r, weapons: [{ id: 'qingfeng', t: 1 }], items: { dugu: 1 } });
    expect(solo.crit).toBe(15); // counts as 6 swords
    expect(computeStats({ ...r, vows: { wusuo: 1, canyue: 2 } }).pickup).toBe(-25);
    expect(computeStats({ ...r, vows: { canyue: 2 }, diff: 4 }).heal).toBe(-50);
  });
  it('heat from vows', () => {
    expect(heatOf({ qunmo: 3, daoxuan: 1, jijing: 1 })).toBe(7);
  });
});

describe('the run', () => {
  it('starts with the companion’s weapon, 30 月华 and 心镜 bonuses', () => {
    const r = newRun(opts({ heart: { heartMoon: 2 } }));
    expect(r.weapons).toEqual([{ id: 'hoe', t: 1 }]);
    expect(r.moon).toBe(50);
    expect(r.wave).toBe(0);
    expect(nextScreen(r)).toBe('ready');
    expect(newRun(opts({ plain: true, heart: { heartMoon: 2 } })).moon).toBe(30);
    expect(newRun(opts({ char: 'cat' })).lives).toBe(8);
    expect(Object.keys(newRun(opts({ heart: { heartPack: 1 } })).items)).toHaveLength(1);
    expect(newRun(opts({ boon: 'amulet' })).items.amulet).toBe(1);
  });
  it('lets 书生 pick from three unlocked weapons (four at mastery 3) and mastery 3 pick a second weapon', () => {
    const r = newRun(opts({ char: 'scholar', unlocks: starterUnlocks() }));
    expect(r.pending.start).toHaveLength(3);
    expect(screenOf(r)).toBe('start');
    expect(newRun(opts({ char: 'scholar', mastery: 3 })).pending.start).toHaveLength(4);
    const id = r.pending.start![1];
    const p = pickStart(r, id);
    expect(p.weapons).toEqual([{ id, t: 1 }]);
    expect(p.pending.start).toBeNull();
    expect(pickStart(r, 'seven')).toBe(r); // not offered
    expect(newRun(opts({ mastery: 3 })).pending.start).toEqual(['hoe', 'pestle']);
  });
  it('folds a wave: 月华, harvest, interest, levels, cards, crates, 镜心, counters', () => {
    let r = newRun(opts());
    r = beginWave(r);
    expect(r.inWave).toBe(1);
    const before = r;
    r = endWave(r, result(1, { crates: 1, stats: { kills: 30, hitsTaken: 0 } }));
    expect(r.inWave).toBeNull();
    expect(r.wave).toBe(1);
    // 30 + 40 + harvest 8 (园丁)
    expect(r.moon).toBe(78);
    expect(r.harvest).toBe(1); // 8 → ceil(8·1.08) = 9
    expect(r.lvl).toBe(3); // 48 XP: 16 then 25
    expect(r.pending.cards).toBe(2);
    expect(r.stats.hp).toBe(2);
    expect(r.pending.crates).toBe(1);
    expect(r.store).toBe(3);
    expect(r.runStats.kills).toBe(30);
    expect(r.runStats.noHitNow).toBe(1);
    expect(screenOf(r)).toBe('cards');
    expect(before.wave).toBe(0); // pure
    const withAbacus = endWave(beginWave({ ...newRun(opts()), items: { abacus: 2 }, moon: 300 }), result(1, { moon: 0, xp: 0 }));
    expect(withAbacus.moon).toBe(308 + 50);
    const gall = endWave(beginWave({ ...newRun(opts()), items: { gall: 3 } }), result(1, { moon: 0, xp: 0 }));
    expect(gall.stats.hp).toBe(6);
  });
  it('shows the same cards, crates and 镜心 for the same seed; rerolls and picks', () => {
    let r = endWave(beginWave(newRun(opts())), result(1, { xp: 200, crates: 2 }));
    const v = cardsView(r)!;
    expect(v.cards).toHaveLength(4);
    expect(cardsView(r)).toEqual(v);
    expect(new Set(v.cards.map((c) => c.stat)).size).toBe(4);
    expect(v.rerollCost).toBe(3);
    const rr = rerollCards(r)!;
    expect(rr.moon).toBe(r.moon - 3);
    expect(cardsView(rr)!.rerollCost).toBe(4);
    r = pickCard(r, 0);
    expect(r.stats[v.cards[0].stat]).toBeGreaterThan(0);
    while (r.pending.cards) r = pickCard(r, 0);
    expect(screenOf(r)).toBe('crate');
    const id = crateItem(r, allUnlocked());
    expect(crateItem(r, allUnlocked())).toBe(id);
    const kept = resolveCrate(r, true, allUnlocked());
    expect(kept.items[id]).toBe((r.items[id] ?? 0) + 1);
    const melted = resolveCrate(r, false, allUnlocked());
    expect(melted.moon).toBeGreaterThan(r.moon);
    const h = { ...r, wave: 10, pending: { ...r.pending, crates: 0, hearts: ['boss' as const] } };
    const offer = heartOffer(h, allUnlocked());
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    const picked = pickHeart(h, 1, allUnlocked());
    expect(picked.items[offer[1]]).toBe(1);
    expect(picked.pending.hearts).toEqual([]);
    const w30 = heartOffer({ ...h, wave: 30 }, allUnlocked());
    expect(w30.some((x) => ['wanjian', 'inkdragon', 'dugu', 'samadhi', 'treasurebowl', 'penglai', 'ambush', 'needle', 'jiangjinjiu', 'watermoon'].includes(x))).toBe(true);
  });
  it('plans the same spawns for the same seed and different ones for another', () => {
    const r = newRun(opts());
    expect(wavePlan(r, 7)).toEqual(wavePlan(r, 7));
    expect(wavePlan(r, 7)).not.toEqual(wavePlan({ ...r, seed: 99 }, 7));
    const p = wavePlan(r, 5);
    expect(p.kind).toBe('elite');
    expect(p.elites).toHaveLength(1);
    expect(p.groups.every((g) => g.t <= 40 - 3)).toBe(true);
    let spent = 0;
    for (const g of p.groups) spent += g.n * ({ blot: 1, paperman: 1, shard: 2, lantern: 2, tadpole: 0.5, shrimp: 1, frog: 1, crab: 3 } as Record<string, number>)[g.id];
    expect(spent).toBeLessThanOrEqual(budget(5, r) * 1.06); // g·⌈(L−3)/g⌉ groups of B·g/(L−3.5)
    expect(spent).toBeGreaterThan(budget(5, r) * 0.85);
    const b = wavePlan(r, 10);
    expect(b.kind).toBe('boss');
    expect(b.boss!.ids).toEqual(['carp']);
    expect(b.len).toBeNull();
    const twins = wavePlan(newRun(opts({ diff: 5 })), 20);
    expect(twins.boss!.ids).toEqual(['mirage', 'mirage']);
    expect(wavePlan(r, 40).boss!.ids).toHaveLength(2);
    expect(wavePlan(r, 50).boss!.ids).toEqual(['mirrorself']);
    expect(wavePlan(r, 6).kind).toBe('horde');
  });
  it('draws 镜蚀: 无相 from 11, endless every 5, 今日镜 at half strength', () => {
    let r = newRun(opts({ diff: 5 }));
    r = { ...r, wave: 10 };
    expect(beginWave({ ...r, wave: 9 }).mutators).toHaveLength(0);
    expect(beginWave(r).mutators).toHaveLength(1);
    const deep = beginWave({ ...newRun(opts()), wave: 44 });
    expect(deep.mutators).toHaveLength(3); // 35, 40, 45
    expect(beginWave(deep).mutators).toEqual(deep.mutators); // replay draws nothing new
    const d = newRun(opts({ daily: true, mutator: 'jiying' }));
    expect(activeMutators(d, 1)).toEqual([{ id: 'jiying', x: 0.5 }]);
  });
  it('streams are independent and stable', () => {
    expect(rngFor(1, 2, 'shop', 3)()).toBe(rngFor(1, 2, 'shop', 3)());
    expect(rngFor(1, 2, 'shop', 3)()).not.toBe(rngFor(1, 2, 'coin', 3)());
  });
});

export type { RunSave };

describe('QA fixes', () => {
  it('a spawn plan spends the whole threat budget B(w) (≈1.2·B on horde waves), every map, waves 1–60', () => {
    for (const map of ['lake', 'forest', 'palace'] as const) {
      for (let w = 1; w <= 60; w++) {
        let spent = 0, B = 0;
        for (let k = 0; k < 8; k++) {
          const r = newRun(opts({ seed: 500 + k * 31, map, char: 'scholar' }));
          for (const g of wavePlan(r, w).groups) spent += g.n * MONSTERS[g.id].cost;
          B += budget(w, r) * (isBossWave(w) ? F.bossAddsFrac : 1);
        }
        const f = spent / B;
        const [lo, hi] = !isBossWave(w) && isHordeWave(w) ? [1.1, 1.35] : [0.9, 1.1];
        expect(f, `${map} w${w}`).toBeGreaterThanOrEqual(lo);
        expect(f, `${map} w${w}`).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('a spawn group stays a crowd of one type (≤ 3 packs); late ticks bring more types at once', () => {
    const r = newRun(opts({ seed: 77 }));
    const p = wavePlan(r, 29);
    for (const g of p.groups) expect(g.n).toBeLessThanOrEqual(3 * MONSTERS[g.id].pack);
    const ticks = new Set(p.groups.map((g) => g.t)).size;
    expect(p.groups.length).toBeGreaterThan(ticks);
    expect([...p.groups].map((g) => g.t)).toEqual([...p.groups].map((g) => g.t).sort((a, b) => a - b));
  });
  it('墨宝 crit only with 画龙点睛, at ×2.0', () => {
    const r = { ...newRun(opts({ char: 'painter' })), stats: { crit: 20, critDmg: 10 } };
    for (const id of ['brush', 'inkstone', 'crane'] as const) {
      const plain = weaponHit(r, computeStats(r), id, 1);
      expect(plain.crit, id).toBe(0);
      const dot = { ...r, items: { dotting: 1 } };
      const h = weaponHit(dot, computeStats(dot), id, 1);
      expect(h.crit, id).toBeCloseTo(computeStats(dot).crit / 100);
      expect(h.critM, id).toBeCloseTo(2.0 + computeStats(dot).critDmg / 100);
    }
    expect(weaponHit(r, computeStats(r), 'hoe', 1).crit).toBeGreaterThan(0); // other weapons as before
  });
  it('the §4.1 limits: 气血 ≥ 1, 墨宝上限 ≤ 12, 棋子 ≤ 14', () => {
    const r = { ...newRun(opts({ char: 'painter' })), stats: { hp: -500, summonCap: 30, stones: 40 } };
    const s = computeStats(r);
    expect([s.hp, s.summonCap, s.stones]).toEqual([1, 12, 14]);
    expect([maxHp({ ...s, hp: -3 }), summonCapOf({ ...s, summonCap: 13.5 }), stonesOf({ ...s, stones: 99 })]).toEqual([1, 12, 14]);
  });
  it('fmtBig moves up a unit when rounding reaches it', () => {
    expect(fmtBig(999_999, 'en')).toBe('1m');
    expect(fmtBig(999_499, 'en')).toBe('999k');
    expect(fmtBig(99_999_999, 'zh')).toBe('1亿');
    expect(fmtBig(99_999, 'zh')).toBe('10万');
    expect(fmtBig(9_999.6, 'zh')).toBe('1万');
    expect(fmtBig(999_999_999, 'en')).toBe('1b');
    expect(fmtBig(-999_999, 'en')).toBe('-1m');
    expect(fmtBig(1.5e13, 'zh')).toBe('150000亿');
  });
  it('墨林 always has its 14 bamboo clumps, apart and inside', () => {
    const want = MAPS.forest.obstacles.reduce((a, o) => a + (o.kind === 'tree' ? 1 : o.n), 0);
    for (let seed = 0; seed < 400; seed++) {
      const g = arenaGeom('forest', seed * 7919 + 13);
      expect(g.obstacles.length, `seed ${seed}`).toBe(want);
      for (const o of g.obstacles) expect(insideShape(g.shape, o.x, o.y, o.r)).toBe(true);
    }
  });
  it('endWave folds only the wave in play, once', () => {
    const r = beginWave(newRun(opts()));
    const once = endWave(r, result(1));
    expect(endWave(once, result(1))).toBe(once);
    expect(endWave(r, result(4))).toBe(r);
  });
});
