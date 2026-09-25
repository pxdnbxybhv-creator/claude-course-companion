// The people of the painting: who is about at which hour, where a walker on a route is, the peddler's
// shop rules, the day's tale / fortune / errand picks, and which line is said to which companion.
import { describe, expect, it } from 'vitest';
import { regionAt } from '../src/views/walk/map';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import {
  WARES, WARE, bagChoices, canBuy, clockSeconds, countToday, dayPart, flowerReward, forCompanion, giftKey, onDuty, ownFlag, ownedWares, pickDaily,
  pingPong, routeAt, routeCycle, seasonOf, shutongDay, shutongStage, slipFor, special, sugarCount, taleFor, FLOWER_PRICE, SHUTONG_NOTE, SHUTONG_SEEK,
  type RouteStop,
} from '../src/views/walk/features/npcs/logic';
import {
  CALLS, FARMER_HELLO, FEST_CALLS, FLOWER_AGAIN, FLOWER_HELLO, FLOWER_HELLO_AGAIN, FLOWER_THANKS, FORTUNE_HELLO, HELLO, HELLO_NIGHT, KITE_HELLO,
  MASTER_FOUND, MONK_HELLO, PEDDLER_HELLO, PEDDLER_REGULAR, POET_NPC_HELLO, SHUTONG_ASK, SHUTONG_CLUE, SLIPS, SUGAR_HELLO, SUGAR_MAKE, TALES,
  TALE_SPOTTED, TEA_HELLO, FISHER_HELLO, WARE_PITCH, peddlerHello,
} from '../src/views/walk/features/npcs/lines';
import { PEDDLER_ROUTE, PEDDLER_SPEED, SHUTONG_SPOTS } from '../src/views/walk/features/npcs/places';

describe('the hours', () => {
  it('names the parts of the day', () => {
    expect(dayPart(6)).toBe('dawn');
    expect(dayPart(12)).toBe('day');
    expect(dayPart(18)).toBe('dusk');
    expect(dayPart(23)).toBe('night');
    expect(dayPart(2)).toBe('night');
    expect(dayPart(26)).toBe('night');
  });
  it('puts people on duty by night and hour', () => {
    expect(onDuty('always', 3, true)).toBe(true);
    expect(onDuty('day', 12, false)).toBe(true);
    expect(onDuty('day', 12, true)).toBe(false); // the visitor forced the night
    expect(onDuty('night', 22, true)).toBe(true);
    expect(onDuty('night', 22, false)).toBe(false);
    // washing in the morning, chatting at the well in the afternoon (they overlap at noon)
    expect(onDuty('morning', 9, false)).toBe(true);
    expect(onDuty('morning', 15, false)).toBe(false);
    expect(onDuty('afternoon', 15, false)).toBe(true);
    expect(onDuty('afternoon', 9, false)).toBe(false);
    expect(onDuty('morning', 12, false) && onDuty('afternoon', 12, false)).toBe(true);
    // monks sweep early and late
    expect(onDuty('dawn', 6, false)).toBe(true);
    expect(onDuty('dawn', 13, false)).toBe(false);
    expect(onDuty('dawn', 17, false)).toBe(true);
    expect(onDuty('dawn', 6, true)).toBe(false);
    // the night market: after dark until ten (midnight on a festival night), not in the small hours
    expect(onDuty('evening', 20, true)).toBe(true);
    expect(onDuty('evening', 20, false)).toBe(false);
    expect(onDuty('evening', 22.5, true)).toBe(false);
    expect(onDuty('evening', 22.5, true, true)).toBe(true);
    expect(onDuty('evening', 2, true, true)).toBe(false);
    expect(onDuty('evening', 14, true)).toBe(true); // a festival forcing the night by day
    expect(onDuty('fest', 21, true)).toBe(false);
    expect(onDuty('fest', 21, true, true)).toBe(true);
    expect(onDuty('fest', 21, false, true)).toBe(false);
  });
  it('counts the clock from midnight', () => {
    expect(clockSeconds(new Date(2026, 8, 25, 1, 2, 3))).toBe(3723);
  });
});

describe('routes', () => {
  const square: RouteStop[] = [{ x: 0, z: 0, dwell: 10, id: 'a' }, { x: 10, z: 0 }, { x: 10, z: 10, dwell: 5, id: 'c' }, { x: 0, z: 10 }];
  it('adds walking and dwelling into one cycle', () => {
    expect(routeCycle(square, 1)).toBeCloseTo(40 + 15);
    expect(routeCycle(square, 2)).toBeCloseTo(20 + 15);
  });
  it('dwells at a stop, then walks on', () => {
    const p = routeAt(square, 1, 4);
    expect(p).toMatchObject({ x: 0, z: 0, moving: false, stop: 'a' });
    const q = routeAt(square, 1, 15);
    expect(q.moving).toBe(true);
    expect(q.x).toBeCloseTo(5);
    expect(q.z).toBeCloseTo(0);
    expect(q.heading).toBeCloseTo(Math.PI / 2); // walking +x
    const r = routeAt(square, 1, 10 + 10 + 10 + 2);
    expect(r).toMatchObject({ x: 10, z: 10, stop: 'c', moving: false });
  });
  it('wraps round, even for negative times', () => {
    const cyc = routeCycle(square, 1);
    const a = routeAt(square, 1, 17), b = routeAt(square, 1, 17 + cyc * 3), c = routeAt(square, 1, 17 - cyc);
    expect(b.x).toBeCloseTo(a.x); expect(b.z).toBeCloseTo(a.z);
    expect(c.x).toBeCloseTo(a.x); expect(c.z).toBeCloseTo(a.z);
  });
  it('moves continuously (no jumps between frames)', () => {
    let prev = routeAt(PEDDLER_ROUTE, PEDDLER_SPEED, 0);
    const cyc = routeCycle(PEDDLER_ROUTE, PEDDLER_SPEED);
    for (let t = 0.5; t < cyc + 1; t += 0.5) {
      const p = routeAt(PEDDLER_ROUTE, PEDDLER_SPEED, t);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(PEDDLER_SPEED * 0.5 + 1e-6);
      prev = { ...p };
    }
  });
  it('sends the peddler round the market, the gate and the dock', () => {
    const stops = PEDDLER_ROUTE.filter((s) => s.id).map((s) => s.id);
    expect(stops).toEqual(['market', 'gate', 'dock']);
    expect(regionAt(12, 96.5)).toBe('village');
    expect(regionAt(58, 32.5)).toBe('lake');
    // a round takes a while, but not all day: he comes by every quarter of an hour or so
    const cyc = routeCycle(PEDDLER_ROUTE, PEDDLER_SPEED);
    expect(cyc).toBeGreaterThan(8 * 60);
    expect(cyc).toBeLessThan(20 * 60);
    // the same hour finds him in the same place
    const a = routeAt(PEDDLER_ROUTE, PEDDLER_SPEED, clockSeconds(new Date(2026, 8, 25, 10, 0, 0)));
    const b = routeAt(PEDDLER_ROUTE, PEDDLER_SPEED, clockSeconds(new Date(2026, 8, 26, 10, 0, 0)));
    expect([a.x, a.z]).toEqual([b.x, b.z]);
  });
  it('walks to and fro along a line', () => {
    const line = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }];
    const o = { x: 0, z: 0, heading: 0 };
    pingPong(line, 2, o);
    expect([o.x, o.z]).toEqual([2, 0]);
    expect(o.heading).toBeCloseTo(Math.PI / 2);
    pingPong(line, 6, o); // at the far end
    expect(o.x).toBeCloseTo(4); expect(o.z).toBeCloseTo(2);
    pingPong(line, 9, o); // coming back (7 m out, 2 m back)
    expect(o.x).toBeCloseTo(4); expect(o.z).toBeCloseTo(1);
    expect(Math.abs(o.heading)).toBeCloseTo(Math.PI); // walking −z
    pingPong(line, 14, o); // home again, and on
    expect(o.x).toBeCloseTo(0); expect(o.z).toBeCloseTo(0);
  });
});

describe('the peddler’s shop', () => {
  it('sells what you can pay for', () => {
    const kite = WARE.kite;
    expect(canBuy(kite, kite.price, {})).toEqual({ ok: true, cost: kite.price });
    expect(canBuy(kite, kite.price - 1, {})).toEqual({ ok: false, why: 'poor' });
  });
  it('sells a kept ware only once, but haws again and again', () => {
    expect(canBuy(WARE.umbrella, 999, { [ownFlag('umbrella')]: true })).toEqual({ ok: false, why: 'owned' });
    expect(WARE.haws.keep).toBe(false);
    expect(canBuy(WARE.haws, 999, { [ownFlag('haws')]: true })).toEqual({ ok: true, cost: WARE.haws.price });
  });
  it('asks a fair price for each ware (haws cheapest, the kite dearest)', () => {
    const prices = WARES.map((w) => w.price);
    expect(Math.min(...prices)).toBe(WARE.haws.price);
    expect(Math.max(...prices)).toBe(WARE.kite.price);
    for (const w of WARES) expect(w.price).toBeGreaterThan(0);
  });
  it('fills the bag with what you own and carry', () => {
    const flags = { [ownFlag('kite')]: true as const, [ownFlag('lantern')]: true as const, 'own:haws': true as const };
    expect(ownedWares(flags)).toEqual(['lantern', 'kite']);
    expect(bagChoices(flags, { haws: 3, flower: 0, sugar: null })).toEqual(['haws', 'lantern', 'kite']);
    expect(bagChoices({}, { haws: 0, flower: 1, sugar: 'guan' })).toEqual(['flower', 'sugar']);
    expect(bagChoices({}, { haws: 0, flower: 0, sugar: null })).toEqual([]);
  });
});

describe('lines for each companion', () => {
  it('falls back to what everyone hears', () => {
    expect(forCompanion(PEDDLER_HELLO, 'guan')).toBe(PEDDLER_HELLO.guan);
    expect(forCompanion(PEDDLER_HELLO, 'painter')).toBe(PEDDLER_HELLO.any);
    expect(special(PEDDLER_HELLO, 'cat')).toBe(true);
    expect(special(PEDDLER_HELLO, 'player')).toBe(false);
    // "nothing special" (null) is kept, not replaced by a fallback
    expect(forCompanion(TEA_HELLO, 'painter')).toBeNull();
  });
  it('gives every new and upgraded person their own words for at least four companions', () => {
    const tables = { SUGAR_HELLO, PEDDLER_HELLO, FORTUNE_HELLO, FLOWER_HELLO, FARMER_HELLO, SUGAR_MAKE, SHUTONG_ASK, MASTER_FOUND, TALE_SPOTTED, TEA_HELLO, FISHER_HELLO, MONK_HELLO, POET_NPC_HELLO, KITE_HELLO, HELLO };
    for (const [name, t] of Object.entries(tables)) {
      const own = CHARACTERS.filter((c) => special(t as never, c.id)).length;
      expect(own, name).toBeGreaterThanOrEqual(4);
    }
  });
  it('bows to 关公 and stares at 嫦娥', () => {
    expect(HELLO.guan!.some((l) => l.zh.includes('关老爷'))).toBe(true);
    expect(HELLO.change!.some((l) => l.zh.includes('嫦娥') || l.zh.includes('仙女'))).toBe(true);
    expect(FORTUNE_HELLO.guan!.zh).toContain('将军何须问卜');
  });
  it('never pitches a ware you already own', () => {
    expect(peddlerHello('scholar', {})).toBe(PEDDLER_HELLO.scholar);
    // the scholar's lantern is bought: he pitches the first kept ware not yet owned
    expect(peddlerHello('scholar', { [ownFlag('lantern')]: true })).toBe(WARE_PITCH.pinwheel);
    expect(peddlerHello('scholar', { [ownFlag('lantern')]: true, [ownFlag('pinwheel')]: true })).toBe(WARE_PITCH.umbrella);
    // a hello that pitches nothing kept stays the companion's own
    expect(peddlerHello('guan', { [ownFlag('lantern')]: true })).toBe(PEDDLER_HELLO.guan);
    const all = Object.fromEntries(WARES.filter((w) => w.keep).map((w) => [ownFlag(w.id), true as const]));
    for (const c of CHARACTERS) {
      const l = peddlerHello(c.id, all);
      expect(l === PEDDLER_REGULAR.any || l === PEDDLER_REGULAR[c.id], c.id).toBe(true);
    }
    // every per-companion pitch names a ware that is on sale and kept
    for (const c of CHARACTERS) for (const w of WARES.filter((x) => x.keep)) {
      const l = peddlerHello(c.id, Object.fromEntries(WARES.filter((x) => x.keep && x.id !== w.id).map((x) => [ownFlag(x.id), true as const])));
      expect(l.zh.length).toBeGreaterThan(0);
    }
  });
  it('says good evening after dark, and fills festival nights with their own calls', () => {
    expect(HELLO_NIGHT.some((l) => l.zh.includes('晚上'))).toBe(true);
    expect(FEST_CALLS.midautumn!.some((l) => l.zh.includes('月饼'))).toBe(true);
    expect(CALLS.snack!.length).toBeGreaterThanOrEqual(4);
  });
  it('lets the watchman call the night watch', () => {
    expect(CALLS.watchman!.some((l) => l.zh.includes('天干物燥，小心火烛'))).toBe(true);
  });
  it('gives bilingual lines everywhere', () => {
    const all = [...Object.values(HELLO).flat(), ...TALES.flatMap((t) => [t.verse, ...t.body]), ...SLIPS.flatMap((s) => [s.verse, s.read, s.yi]), ...Object.values(SHUTONG_CLUE)];
    for (const l of all) { expect(l.zh.length).toBeGreaterThan(0); expect(l.en.length).toBeGreaterThan(0); }
  });
});

describe('today’s picks', () => {
  const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  it('always tells 关公 his own legend', () => {
    for (const d of days) expect(taleFor(TALES, d, 'guan').hero).toBe('guan');
  });
  it('tells companions their own tale, and everyone else a tale of nobody in particular', () => {
    for (const who of ['painter', 'rabbit', 'player', 'musician', 'change', 'taoist', 'gardener'] as CharacterId[]) expect(taleFor(TALES, days[0], who).hero).toBe(who);
    for (const d of days) expect(taleFor(TALES, d, 'scholar').hero).toBeUndefined();
  });
  it('varies the tale from day to day, and moves on within a day', () => {
    const seen = new Set(days.map((d) => taleFor(TALES, d, 'scholar').id));
    expect(seen.size).toBeGreaterThan(2);
    expect(taleFor(TALES, days[0], 'scholar', 0).id).not.toBe(taleFor(TALES, days[0], 'scholar', 1).id);
    expect(taleFor(TALES, days[3], 'fisher').id).toBe(taleFor(TALES, days[3], 'fisher').id);
  });
  it('draws the same slip for the same day, companion and draw', () => {
    expect(slipFor(SLIPS, days[0], 'scholar', 0)).toBe(slipFor(SLIPS, days[0], 'scholar', 0));
    const draws = new Set(Array.from({ length: 12 }, (_, n) => slipFor(SLIPS, days[0], 'scholar', n).verse.zh));
    expect(draws.size).toBeGreaterThan(3);
  });
  it('loses the page boy and his master in two different places', () => {
    for (const d of days) {
      const { child, master } = shutongDay(SHUTONG_SPOTS, d);
      expect(child.region).not.toBe(master.region);
    }
    for (const s of SHUTONG_SPOTS) {
      expect(regionAt(s.child.x, s.child.z)).toBe(s.region);
      expect(regionAt(s.master.x, s.master.z)).toBe(s.region);
      expect(SHUTONG_CLUE[s.region]).toBeTruthy();
    }
  });
  it('picks the same line all day', () => {
    expect(pickDaily([1, 2, 3, 4], days[5], 'x')).toBe(pickDaily([1, 2, 3, 4], days[5], 'x'));
    expect(pickDaily([1, 2, 3, 4], days[5], 'x', 1)).not.toBe(pickDaily([1, 2, 3, 4], days[5], 'x', 0));
  });
  it('knows the flower of the season', () => {
    expect([3, 4, 5].map(seasonOf)).toEqual([0, 0, 0]);
    expect([6, 7, 8].map(seasonOf)).toEqual([1, 1, 1]);
    expect([9, 10, 11].map(seasonOf)).toEqual([2, 2, 2]);
    expect([12, 1, 2].map(seasonOf)).toEqual([3, 3, 3]);
  });
  it('counts the sugar figures kept, and thanks everyone who can be given a flower', () => {
    expect(sugarCount({ 'sugar:guan': true, 'sugar:cat': true, sugar: true })).toBe(2);
    for (const k of ['tea', 'fisher', 'monk', 'poet', 'kite', 'storyteller', 'fortune', 'peddler', 'farmer', 'master', 'sugar']) expect(FLOWER_THANKS[k], k).toBeTruthy();
  });
  it('rewards only the first flower each person gets in a day, so flowers never farm coins', () => {
    const day = '2026-09-25';
    for (const [who, th] of Object.entries(FLOWER_THANKS)) {
      const first = flowerReward(th, 0);
      expect(first.first).toBe(true);
      expect(first.coins).toBe(th.coins ?? 0);
      // every later flower that day: thanks only
      for (const n of [1, 2, 10]) {
        const r = flowerReward(th, n);
        expect(r.first, who).toBe(false);
        expect(r.coins, who).toBe(0);
        expect(r.card, who).toBeUndefined();
      }
      expect(FLOWER_AGAIN[who] ?? FLOWER_AGAIN.any).toBeTruthy();
    }
    // ten rounds of buy-and-give to the best payer: one reward, then only flowers paid for
    let purse = 100;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      purse -= FLOWER_PRICE;
      const r = flowerReward(FLOWER_THANKS.farmer, countToday({ day, counts }, day, giftKey('farmer')));
      purse += r.coins;
      counts[giftKey('farmer')] = (counts[giftKey('farmer')] ?? 0) + 1;
    }
    expect(purse).toBe(100 - 10 * FLOWER_PRICE + (FLOWER_THANKS.farmer.coins ?? 0));
    expect(purse).toBeLessThan(100);
    // another day starts afresh
    expect(countToday({ day: '2026-09-24', counts }, day, giftKey('farmer'))).toBe(0);
    expect(FLOWER_HELLO_AGAIN.change!.zh).toContain('三文');
  });
  it('keeps the page boy’s errand through the day, and forgets it the next', () => {
    const day = '2026-09-25';
    expect(shutongStage(false, { day, counts: {} }, day)).toBe('idle');
    expect(shutongStage(false, { day, counts: { [SHUTONG_SEEK]: 1 } }, day)).toBe('seeking');
    expect(shutongStage(false, { day, counts: { [SHUTONG_SEEK]: 1, [SHUTONG_NOTE]: 1 } }, day)).toBe('note');
    expect(shutongStage(true, { day, counts: { [SHUTONG_SEEK]: 1, [SHUTONG_NOTE]: 1 } }, day)).toBe('done');
    expect(shutongStage(false, { day: '2026-09-24', counts: { [SHUTONG_NOTE]: 1 } }, day)).toBe('idle');
  });
});
