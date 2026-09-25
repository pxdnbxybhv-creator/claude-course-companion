import { describe, expect, it } from 'vitest';
import {
  adoptCheck, capacity, decayLoss, digCoins, hasTrick, hearts, isSpecies, LOVE, nextTrick, present, ROLES, ROUTINES, routineAt,
  settleDecay, SPECIES, SPECIES_DEF, stewardNews, strokeGain, tricksFor, visitGift, visitorFor, type Species,
} from '../src/views/walk/features/home/life/logic';
import { KIND, PET_HOUSE_KINDS } from '../src/views/walk/features/home/catalog';
import type { HomeItem, Pet } from '../src/app/home';
import { cellCentre, placeSpot, PLOT, route, solidCells } from '../src/views/walk/features/home/life/plot';
import type { CharacterId } from '../src/data/characters';

const item = (kind: string) => ({ kind });
const pet = (species: string, o: Partial<Pet> = {}): Pet => ({ uid: `p-${species}-${Math.random()}`, species, name: '', since: '2026-09-01', fed: '', love: 50, follow: false, ...o });

describe('home life · pets need a home', () => {
  it('every species lives in one of the fixed pet-home kinds, which the catalog builds', () => {
    for (const s of SPECIES) {
      expect(PET_HOUSE_KINDS).toContain(s.house);
      expect(KIND[s.house], s.house).toBeTruthy();
      expect(KIND[s.house].pets ?? []).toContain(s.id);
      expect(s.names.length).toBeGreaterThanOrEqual(6);
      expect(s.price).toBeGreaterThan(0);
    }
    expect(SPECIES_DEF.koi.house).toBe('pond');
    expect(SPECIES_DEF.crane.house).toBe('pond');
    expect(SPECIES_DEF.dog.house).toBe('doghouse');
    expect(SPECIES_DEF.goat.house).toBe('pen');
  });

  it('no home: blocked with "house"', () => {
    const r = adoptCheck('dog', [item('catbed'), item('pond')], []);
    expect(r).toMatchObject({ ok: false, block: 'house', capacity: 0, count: 0 });
  });

  it('a home holds its number, then it is full', () => {
    expect(capacity([item('doghouse')], 'dog')).toBe(1);
    expect(adoptCheck('dog', [item('doghouse')], []).ok).toBe(true);
    expect(adoptCheck('dog', [item('doghouse')], [pet('dog')])).toMatchObject({ ok: false, block: 'full', capacity: 1, count: 1 });
    expect(adoptCheck('dog', [item('doghouse'), item('doghouse')], [pet('dog')]).ok).toBe(true);
    // a coop takes three ducks
    const ducks = [pet('duck'), pet('duck')];
    expect(adoptCheck('duck', [item('coop')], ducks).ok).toBe(true);
    expect(adoptCheck('duck', [item('coop')], [...ducks, pet('duck')]).block).toBe('full');
  });

  it('a pond is home to koi and one crane, counted apart', () => {
    const pond = [item('pond')];
    const koi = Array.from({ length: 5 }, () => pet('koi'));
    expect(adoptCheck('koi', pond, koi).block).toBe('full');
    expect(adoptCheck('crane', pond, koi).ok).toBe(true);
    expect(adoptCheck('crane', pond, [...koi, pet('crane')]).block).toBe('full');
  });

  it('the household limit and the purse come into it', () => {
    const many = Array.from({ length: 12 }, () => pet('dog'));
    expect(adoptCheck('cat', [item('catbed')], many, { limit: 12 }).block).toBe('limit');
    expect(adoptCheck('cat', [item('catbed')], [], { coins: 50 }).block).toBe('coins');
    expect(adoptCheck('cat', [item('catbed')], [], { coins: 50, price: 40 }).ok).toBe(true);
  });

  it('knows its species', () => {
    expect(isSpecies('parrot')).toBe(true);
    expect(isSpecies('dragon')).toBe(false);
  });
});

describe('home life · affection', () => {
  it('grows by strokes, a few a day', () => {
    expect(strokeGain(50, 0)).toBe(LOVE.stroke);
    expect(strokeGain(50, LOVE.strokesPerDay - 1)).toBe(LOVE.stroke);
    expect(strokeGain(50, LOVE.strokesPerDay)).toBe(0);
    expect(strokeGain(100, 0)).toBe(0);
    expect(hearts(0)).toBe(0);
    expect(hearts(100)).toBe(5);
    expect(hearts(59)).toBe(3);
  });

  it('fades one step per day apart, not for the day it was fed, never before it came home', () => {
    const p = { since: '2026-09-01', fed: '' as const };
    // never settled: nothing lost
    expect(decayLoss(p, '', '2026-09-20', 3)).toBe(0);
    // settled yesterday: one day apart
    expect(decayLoss(p, '2026-09-19', '2026-09-20', 3)).toBe(3);
    // five days apart
    expect(decayLoss(p, '2026-09-15', '2026-09-20', 3)).toBe(15);
    // fed on one of those days: that day counts as cared for
    expect(decayLoss({ since: '2026-09-01', fed: '2026-09-17' }, '2026-09-15', '2026-09-20', 3)).toBe(12);
    // fed today: still lost the days before (today is not yet over)
    expect(decayLoss({ since: '2026-09-01', fed: '2026-09-20' }, '2026-09-15', '2026-09-20', 3)).toBe(15);
    // adopted after the marker: only the days since it came
    expect(decayLoss({ since: '2026-09-18', fed: '' }, '2026-09-10', '2026-09-20', 3)).toBe(6);
    // same day: nothing
    expect(decayLoss(p, '2026-09-20', '2026-09-20', 3)).toBe(0);
    // capped at 60 days
    expect(decayLoss({ since: '2020-01-01', fed: '' }, '2025-01-01', '2026-09-20', 1)).toBe(60);
  });

  it('settles every pet by its own rate, floors at zero, keeps untouched pets identical', () => {
    const dog = pet('dog', { love: 40 });
    const cat = pet('cat', { love: 40 });
    const fedDog = pet('dog', { love: 40, fed: '2026-09-19' });
    const low = pet('goat', { love: 2 });
    const out = settleDecay([dog, cat, fedDog, low], '2026-09-18', '2026-09-20');
    expect(out[0].love).toBe(40 - 2 * SPECIES_DEF.dog.decay);
    expect(out[1].love).toBe(40 - 2 * SPECIES_DEF.cat.decay); // the cat minds less
    expect(out[2].love).toBe(40 - SPECIES_DEF.dog.decay);
    expect(out[3].love).toBe(0);
    const same = settleDecay([dog], '2026-09-20', '2026-09-20');
    expect(same[0]).toBe(dog);
  });

  it('a week of care outgrows a week apart (feed + strokes beat the fade)', () => {
    for (const s of SPECIES) {
      const perDay = LOVE.feed + LOVE.stroke * LOVE.strokesPerDay;
      expect(perDay, s.id).toBeGreaterThan(s.decay * 3);
    }
  });

  it('unlocks tricks as affection grows', () => {
    expect(tricksFor('dog', 0).map((t) => t.id)).toEqual(['fetch']);
    expect(tricksFor('dog', 55).map((t) => t.id)).toEqual(['fetch', 'sit', 'spin']);
    expect(hasTrick('dog', 79, 'dig')).toBe(false);
    expect(hasTrick('dog', 80, 'dig')).toBe(true);
    expect(nextTrick('dog', 31)?.id).toBe('spin');
    expect(nextTrick('dog', 100)).toBeNull();
    expect(hasTrick('parrot', 30, 'teach')).toBe(true);
    for (const s of SPECIES) expect(tricksFor(s.id, 100).length, s.id).toBeGreaterThan(0);
  });

  it('the dog digs up a steady handful: the same all day', () => {
    const a = digCoins('2026-09-20', 'p1');
    expect(a).toBe(digCoins('2026-09-20', 'p1'));
    for (let d = 1; d <= 28; d++) {
      const n = digCoins(`2026-09-${String(d).padStart(2, '0')}`, 'p1');
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(30);
    }
  });
});

describe('home life · the residents’ day', () => {
  it('every role has a routine covering all 24 hours without overlap', () => {
    for (const r of ROLES) {
      const slots = ROUTINES[r.id];
      for (let h = 0; h < 24; h += 0.25) {
        const hits = slots.filter((s) => (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to));
        expect(hits.length, `${r.id} at ${h}`).toBe(1);
      }
    }
  });

  it('keeps each role’s habits', () => {
    expect(routineAt('cook', 6.5)).toMatchObject({ act: 'cook', at: 'kitchen' });
    expect(routineAt('cook', 17)).toMatchObject({ act: 'cook' });
    expect(routineAt('steward', 7)).toMatchObject({ act: 'sweep' });
    expect(routineAt('steward', 10)).toMatchObject({ act: 'report', at: 'gate' });
    expect(routineAt('student', 9).act).toBe('read');
    expect(routineAt('musician', 15).act).toBe('flute');
    expect(routineAt('gardener', 8)).toMatchObject({ act: 'tend', at: 'beds' });
    expect(routineAt('guard', 10)).toMatchObject({ act: 'guard', at: 'gate' });
    // night: everyone sleeps except the guard, who walks the fence
    expect(routineAt('guard', 23)).toMatchObject({ act: 'patrol', at: 'fence' });
    expect(routineAt('guard', 3).act).toBe('patrol');
    for (const r of ROLES) if (r.id !== 'guard') expect(routineAt(r.id, 2.5).act, r.id).toBe('sleep');
    expect(present(routineAt('guard', 2))).toBe(true);
    expect(present(routineAt('cook', 2))).toBe(false);
    expect(present(routineAt('cook', 9))).toBe(false); // off to market
    // wraps past midnight, and an unknown role gets the steward's day
    expect(routineAt('steward', 25)).toEqual(routineAt('steward', 1));
    expect(routineAt('someone', 7)).toEqual(routineAt('steward', 7));
  });

  it('the steward tells the news by the names you gave', () => {
    const news = stewardNews('2026-09-20', [{ uid: 'a', species: 'dog', name: '旺财' }], [{ uid: 'b', role: 'cook', name: '王嫂' }]);
    expect(news.length).toBe(2);
    expect(news.some((n) => n.zh.includes('旺财'))).toBe(true);
    expect(news.some((n) => n.zh.includes('王嫂'))).toBe(true);
    expect(stewardNews('2026-09-20', [{ uid: 'a', species: 'dog', name: '旺财' }], [])).toEqual(stewardNews('2026-09-20', [{ uid: 'a', species: 'dog', name: '旺财' }], []));
    const quiet = stewardNews('2026-09-20', [], [], '半亩山居');
    expect(quiet.length).toBe(1);
    expect(quiet[0].zh).toContain('半亩山居');
    const lots = stewardNews('2026-09-20', SPECIES.map((s, i) => ({ uid: `u${i}`, species: s.id, name: `n${i}` })), []);
    expect(lots.length).toBe(3);
  });
});

describe('home life · visitors', () => {
  const all: CharacterId[] = ['scholar', 'gardener', 'fisher', 'poet'];
  it('a companion (never the one you walk as) drops by on most days, the same all day', () => {
    let visits = 0;
    for (let d = 1; d <= 30; d++) {
      const day = `2026-09-${String(d).padStart(2, '0')}`;
      const v = visitorFor(day, all, 'scholar');
      expect(v).toBe(visitorFor(day, all, 'scholar'));
      if (v) { visits++; expect(v).not.toBe('scholar'); expect(all).toContain(v); }
    }
    expect(visits).toBeGreaterThan(10);
    expect(visits).toBeLessThan(30);
    expect(visitorFor('2026-09-01', ['scholar'], 'scholar')).toBeNull();
  });

  it('leaves a modest gift', () => {
    for (let d = 1; d <= 20; d++) {
      const g = visitGift(`2026-09-${String(d).padStart(2, '0')}`, 'poet');
      expect(g.coins).toBeGreaterThanOrEqual(20);
      expect(g.coins).toBeLessThanOrEqual(60);
    }
  });
});

describe('home life · species coverage', () => {
  it('has the eight homestead animals', () => {
    const ids: Species[] = ['dog', 'cat', 'rabbit', 'crane', 'duck', 'koi', 'parrot', 'goat'];
    expect(SPECIES.map((s) => s.id).sort()).toEqual([...ids].sort());
    expect(SPECIES.filter((s) => !s.follows).map((s) => s.id)).toEqual(['koi']);
  });
});

describe('home life · getting about the plot', () => {
  const built = (kind: string, i: number, j: number): HomeItem => ({ uid: `${kind}-${i}-${j}`, kind, i, j, rot: 0 });

  it('calls each pet home what the build catalog calls it', () => {
    for (const s of SPECIES) {
      expect(s.houseZh).toBe(KIND[s.house].zh);
      expect(s.houseEn).toBe(KIND[s.house].en.toLowerCase());
    }
  });

  it('walks round a house instead of through it, and straight across open ground', () => {
    const items = [built('house', 8, 8)]; // 5 x 4 cells: i 8…12, j 8…11
    const solid = solidCells(items);
    const a = cellCentre(10, 5), b = cellCentre(10, 14);
    const way = route(solid, a.x, a.z, b.x, b.z);
    expect(way.length).toBeGreaterThan(1);
    expect(way[way.length - 1]).toEqual(b);
    // sample the whole polyline: never inside the house
    let px = a.x, pz = a.z;
    for (const p of way) {
      for (let k = 0; k <= 20; k++) {
        const x = px + ((p.x - px) * k) / 20, z = pz + ((p.z - pz) * k) / 20;
        const i = Math.floor(x - PLOT.x0), j = Math.floor(z - PLOT.z0);
        expect(solid.has(i * 256 + j)).toBe(false);
      }
      px = p.x; pz = p.z;
    }
    // nothing in the way: one straight step
    const open = route(solid, cellCentre(2, 2).x, cellCentre(2, 2).z, cellCentre(20, 3).x, cellCentre(20, 3).z);
    expect(open).toHaveLength(1);
  });

  it('lets people step over paving and the cat’s basket', () => {
    const solid = solidCells([built('paving', 3, 3), built('catbed', 4, 4), built('doghouse', 5, 5)]);
    expect(solid.has(3 * 256 + 3)).toBe(false);
    expect(solid.has(4 * 256 + 4)).toBe(false);
    expect(solid.has(5 * 256 + 5)).toBe(true);
  });

  it('gives the guard and the steward their own spots by the gate', () => {
    const occ = new Set<number>();
    const guard = placeSpot([], occ, 'gate', 0);
    for (const salt of [1, 2, 3]) {
      const other = placeSpot([], occ, 'gate', salt);
      expect(Math.hypot(other.x - guard.x, other.z - guard.z)).toBeGreaterThan(1.2);
    }
  });
});
