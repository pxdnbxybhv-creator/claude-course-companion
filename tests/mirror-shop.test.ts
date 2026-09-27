// 水月幻镜 · 镜市 (GDD §7): odds, prices, rerolls, locks, merging, slot limits and bans.
import { describe, expect, it } from 'vitest';
import type { NewRunOpts, RunSave, ShopSlot } from '../src/views/mirror/types';
import { WEAPONS } from '../src/views/mirror/data';
import {
  allUnlocked, buy, itemPrice, merge, openShop, reroll, rerollCost, sell, shopOdds, shopView, starterUnlocks, toggleLock,
  weaponPrice, newRun, cardRerollCost, freeRerolls, sellPrice,
} from '../src/views/mirror/logic';

function run(o: Partial<NewRunOpts> = {}, r: Partial<RunSave> = {}): RunSave {
  const base = newRun({
    seed: 77, char: 'gardener', map: 'lake', diff: 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
    runIndex: 2, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: allUnlocked(), mastery: 0, ...o,
  });
  return { ...base, wave: 1, moon: 500, ...r };
}

describe('shop odds and prices', () => {
  it('odds rows sum to 100 and luck renormalises', () => {
    for (const w of [1, 4, 8, 13, 20, 30, 45]) for (const luck of [-80, 0, 40, 150, 1000]) for (const extra of [false, true]) {
      const o = shopOdds(w, luck, extra);
      expect(o.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
      for (const x of o) expect(x).toBeGreaterThanOrEqual(0);
    }
    expect(shopOdds(1, 0)).toEqual([90, 10, 0, 0]);
    expect(shopOdds(20, 0)).toEqual([30, 38, 25, 7]);
    const lucky = shopOdds(20, 100);
    expect(lucky[0]).toBe(0);
    expect(lucky[1] / lucky[2]).toBeCloseTo(38 / 25);
  });
  it('prices follow round(base × tier × (1 + 0.18(w−1)))', () => {
    expect([1, 10, 20, 30].map((w) => itemPrice('whetstone', w))).toEqual([16, 42, 71, 100]);
    expect([1, 2, 3, 4].map((t) => weaponPrice('qingfeng', t as 1, 1))).toEqual([22, 44, 84, 143]);
    const r = run({}, { items: { miser: 1 }, vows: { qianlin: 2 } });
    expect(itemPrice('whetstone', 1, r)).toBe(Math.round(16 * 1.16 * 1.08));
  });
  it('rerolls cost ⌈w/2⌉ + 1 + k·⌈0.5w⌉ and cards 2 + ⌈w/2⌉ + k', () => {
    expect([0, 1, 2].map((k) => rerollCost(1, k))).toEqual([2, 3, 4]);
    expect([0, 1, 2].map((k) => rerollCost(10, k))).toEqual([6, 11, 16]);
    expect([0, 1, 2].map((k) => rerollCost(20, k))).toEqual([11, 21, 31]);
    expect(rerollCost(20, 0, run({ heart: { heartReroll: 3 } }))).toBe(Math.round(11 * 0.88));
    expect([cardRerollCost(1, 0), cardRerollCost(10, 2)]).toEqual([3, 9]);
  });
});

describe('the shop', () => {
  it('rolls the same shop for the same seed, 4 slots (镜台, 镜裂 +1 each)', () => {
    const r = run();
    const a = openShop(r, allUnlocked()), b = openShop(r, allUnlocked());
    expect(a.shop).toEqual(b.shop);
    expect(a.shop!.slots).toHaveLength(4);
    expect(a.shop!.wave).toBe(2);
    expect(openShop(a, allUnlocked())).toBe(a); // idempotent
    expect(openShop(run({ heart: { heartStand: 1 } }, { items: { crackedmirror: 1 } }), allUnlocked()).shop!.slots).toHaveLength(6);
  });
  it('only offers what the account has unlocked', () => {
    const u = starterUnlocks();
    for (let s = 0; s < 40; s++) {
      const r = openShop(run({ seed: s }, { wave: 12 }), u);
      for (const sl of r.shop!.slots) if (sl) expect(sl.kind === 'weapon' ? u.weapons.has(sl.id) : u.items.has(sl.id)).toBe(true);
    }
  });
  it('never shows 暗器 to 关公 or 重器/弓弩 to 大橘', () => {
    for (let s = 0; s < 60; s++) {
      for (const [char, bans] of [['guan', ['hidden']], ['cat', ['heavy', 'bow']]] as const) {
        const r = openShop(run({ seed: s, char }, { wave: 8 }), allUnlocked());
        for (const sl of r.shop!.slots) if (sl?.kind === 'weapon') expect(WEAPONS[sl.id].classes.some((c) => (bans as readonly string[]).includes(c))).toBe(false);
      }
    }
  });
  it('buys, merges a copy when slots are full, and caps 关公 at 5 weapons', () => {
    const r = openShop(run(), allUnlocked());
    const guan = run({ char: 'guan' }, { weapons: Array.from({ length: 5 }, () => ({ id: 'qingfeng' as const, t: 1 as const })) });
    const slot: ShopSlot = { kind: 'weapon', id: 'yanyue', t: 1, locked: false };
    const g = { ...guan, shop: { wave: 2, k: 0, free: 0, slots: [slot] } };
    expect(buy(g, 0)).toBeNull(); // full and nothing to merge
    const copy: ShopSlot = { kind: 'weapon', id: 'qingfeng', t: 1, locked: false };
    const m = buy({ ...g, shop: { ...g.shop, slots: [copy] } }, 0)!;
    expect(m.weapons).toHaveLength(5);
    expect(m.weapons.filter((w) => w.t === 2)).toHaveLength(1);
    expect(m.moon).toBe(500 - weaponPrice('qingfeng', 1, 1, m));
    const i = r.shop!.slots.findIndex((s) => s !== null);
    const after = buy(r, i)!;
    expect(after.shop!.slots[i]).toBeNull();
    expect(buy({ ...r, moon: 0 }, i)).toBeNull();
  });
  it('merges two of a kind up to 神 and no further', () => {
    const r = run({}, { weapons: [{ id: 'hoe', t: 1 }, { id: 'hoe', t: 1 }, { id: 'hoe', t: 4 }, { id: 'hoe', t: 4 }] });
    const m = merge(r, 0, 1)!;
    expect(m.weapons).toEqual([{ id: 'hoe', t: 2 }, { id: 'hoe', t: 4 }, { id: 'hoe', t: 4 }]);
    expect(merge(r, 2, 3)).toBeNull();
    expect(merge(r, 0, 2)).toBeNull();
  });
  it('locks carry over to the next shop at the new price; rerolls keep them', () => {
    let r = openShop(run(), allUnlocked());
    r = toggleLock(r, 2);
    const locked = r.shop!.slots[2]!;
    expect(locked.locked).toBe(true);
    const rr = reroll(r, allUnlocked())!;
    expect(rr.shop!.slots[2]).toEqual(locked);
    expect(rr.moon).toBe(r.moon - 2);
    expect(rr.shop!.k).toBe(1);
    const next = openShop({ ...rr, wave: 2 }, allUnlocked());
    expect(next.shop!.slots.some((s) => s && s.locked && s.kind === locked.kind && s.id === locked.id)).toBe(true);
    const v = shopView({ ...rr, wave: 2 });
    expect(v.wave).toBe(2);
  });
  it('uses free rerolls first (签筒, 书生, 棋士, after a boss)', () => {
    const r = openShop(run({ char: 'scholar' }, { items: { lots: 2 }, weapons: [{ id: 'qingfeng', t: 1 }] }), allUnlocked());
    expect(r.shop!.free).toBe(3);
    expect(shopView(r).rerollCost).toBe(0);
    const once = reroll(r, allUnlocked())!;
    expect(once.moon).toBe(r.moon);
    expect(once.shop!.free).toBe(2);
    expect(once.shop!.slots).not.toEqual(r.shop!.slots);
    expect(freeRerolls(run({ char: 'player' }, { wave: 10 }))).toBe(2);
  });
  it('破釜沉舟 ends rerolls and locks', () => {
    let r = openShop(run(), allUnlocked());
    r = toggleLock(r, 0);
    r = { ...r, shop: { ...r.shop!, slots: [{ kind: 'item', id: 'burnboats', locked: false }, ...r.shop!.slots.slice(1)] } };
    r = toggleLock(r, 1);
    const b = buy(r, 0)!;
    expect(b.items.burnboats).toBe(1);
    expect(b.shop!.slots.every((s) => !s || !s.locked)).toBe(true);
    expect(reroll(b, allUnlocked())).toBeNull();
    expect(toggleLock(b, 1)).toBe(b);
    expect(shopView(b).canReroll).toBe(false);
    expect(shopView(b).canLock).toBe(false);
  });
  it('sells at 25% (当票 60%, 善贾 +10% a rank) and keeps the last weapon', () => {
    const r = run({}, { weapons: [{ id: 'yanyue', t: 2 }, { id: 'hoe', t: 1 }], wave: 10 });
    const p = weaponPrice('yanyue', 2, 10, r);
    expect(sell(r, 0).moon).toBe(r.moon + Math.round(p * 0.25));
    expect(sellPrice({ ...r, items: { pawn: 1 } }, 'yanyue', 2, 10)).toBe(Math.round(p * 0.6));
    expect(sellPrice({ ...r, heart: { heartTrade: 2 } }, 'yanyue', 2, 10)).toBe(Math.round(p * 0.25 * 1.2));
    const one = run({}, { weapons: [{ id: 'hoe', t: 1 }] });
    expect(sell(one, 0)).toBe(one);
  });
  it('previews the next wave for 棋士', () => {
    const r = openShop(run({ char: 'player' }, { wave: 4 }), allUnlocked());
    expect(shopView(r).preview!.elites).toHaveLength(1);
    expect(shopView(openShop(run(), allUnlocked())).preview).toBeNull();
  });
  it('never offers a maxed item or a legendary before wave 8', () => {
    for (let s = 0; s < 50; s++) {
      const r = openShop(run({ seed: s }, { wave: 5, items: { luckycat: 2, yujian: 2 } }), allUnlocked());
      for (const sl of r.shop!.slots) if (sl?.kind === 'item') {
        expect(['luckycat', 'yujian']).not.toContain(sl.id);
        expect(['wanjian', 'inkdragon', 'dugu', 'samadhi', 'treasurebowl', 'penglai', 'ambush', 'needle', 'jiangjinjiu', 'watermoon']).not.toContain(sl.id);
      }
    }
  });
});
