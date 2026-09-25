// The people of the painting: who is about at which hour, where a walker on a route is, the peddler's
// shop rules, the day's tale / fortune / errand picks, and which line is said to which companion.
import { describe, expect, it } from 'vitest';
import { regionAt } from '../src/views/walk/map';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import {
  WARES, WARE, bagChoices, canBuy, clockSeconds, dayPart, forCompanion, onDuty, ownFlag, ownedWares, pickDaily, pingPong, routeAt, routeCycle,
  seasonOf, shutongDay, slipFor, special, sugarCount, taleFor, type RouteStop,
} from '../src/views/walk/features/npcs/logic';
import {
  CALLS, FARMER_HELLO, FLOWER_HELLO, FLOWER_THANKS, FORTUNE_HELLO, HELLO, KITE_HELLO, MASTER_FOUND, MONK_HELLO, PEDDLER_HELLO, POET_NPC_HELLO,
  SHUTONG_ASK, SHUTONG_CLUE, SLIPS, SUGAR_MAKE, TALES, TALE_SPOTTED, TEA_HELLO, FISHER_HELLO,
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
    const tables = { PEDDLER_HELLO, FORTUNE_HELLO, FLOWER_HELLO, FARMER_HELLO, SUGAR_MAKE, SHUTONG_ASK, MASTER_FOUND, TALE_SPOTTED, TEA_HELLO, FISHER_HELLO, MONK_HELLO, POET_NPC_HELLO, KITE_HELLO, HELLO };
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
});
