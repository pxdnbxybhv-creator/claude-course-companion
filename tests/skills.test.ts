// The companions' skills: verse chosen by place, season and hour without repeats; cooldown clocks;
// where the painter's crane flies; the qin player's phrase.
import { describe, expect, it } from 'vitest';
import { POEMS } from '../src/data/poems';
import { ENCOUNTERS } from '../src/data/encounters';
import { CHARACTERS } from '../src/data/characters';
import { REGIONS, WAYPOINTS, type RegionId } from '../src/views/walk/map';
import { VerseDeck, clausesOf, hourKind, scorePoem, type VersePlace } from '../src/views/walk/features/skills/verses';
import { Cooldowns, SKILL_TIMING, craneTarget, qinPhrase, type Discovery } from '../src/views/walk/features/skills/logic';
import { makeRng } from '../src/core/rng';

const HAN = /^\p{Script=Han}+$/u;

describe('verse clauses', () => {
  it('splits a poem at its punctuation into whole, readable clauses', () => {
    const p = POEMS[0];
    expect(clausesOf(p)).toEqual(['半亩方塘一鉴开', '天光云影共徘徊', '问渠那得清如许', '为有源头活水来']);
    for (const q of POEMS) for (const c of clausesOf(q)) {
      expect(c).toMatch(HAN);
      expect([...c].length).toBeGreaterThanOrEqual(3);
      expect([...c].length).toBeLessThanOrEqual(9);
    }
  });
  it('never repeats a clause back to back (争渡，争渡)', () => {
    const p = POEMS.find((q) => q.lines.join('').includes('争渡，争渡'))!;
    const c = clausesOf(p);
    for (let i = 1; i < c.length; i++) expect(c[i]).not.toBe(c[i - 1]);
  });
  it('most poems have something to show', () => {
    expect(POEMS.filter((p) => clausesOf(p).length > 0).length).toBeGreaterThan(POEMS.length * 0.9);
  });
});

describe('hours', () => {
  it('reads the hour, and a forced night or day wins', () => {
    expect(hourKind(6)).toBe('dawn');
    expect(hourKind(12)).toBe('day');
    expect(hourKind(18)).toBe('dusk');
    expect(hourKind(23)).toBe('night');
    expect(hourKind(12, true)).toBe('night');
    expect(hourKind(23, false)).toBe('day');
  });
});

describe('VerseDeck', () => {
  const places: VersePlace[] = [
    { region: 'plum', season: 'winter', hour: 9 },
    { region: 'lake', season: 'summer', hour: 22, night: true },
    { region: 'bamboo', season: 'autumn', hour: 6 },
    { region: 'village', season: 'spring', hour: 18 },
    { region: 'mountain', season: 'autumn', hour: 14 },
    { region: null, season: 'spring', hour: 11 },
    { region: 'garden', season: 'winter', hour: 21, night: true },
    { region: 'home', season: 'summer', hour: 7 },
  ];

  it('never shows the same line twice in a row, wherever and whenever', () => {
    for (let seed = 1; seed < 6; seed++) {
      const deck = new VerseDeck(seed);
      let last = '';
      for (let i = 0; i < 400; i++) {
        const place = places[Math.floor(i / 7) % places.length];
        const l = deck.next(place);
        expect(l.text).not.toBe(last);
        expect(l.text).toMatch(HAN);
        last = l.text;
      }
    }
  });

  it('cycles widely through many poems', () => {
    const deck = new VerseDeck(42);
    const seen = new Set<string>();
    for (let i = 0; i < 240; i++) seen.add(deck.next(places[0]).poem.title);
    expect(seen.size).toBeGreaterThanOrEqual(30);
    // and in every place, not a single one
    for (const pl of places) {
      const d = new VerseDeck(7);
      const s = new Set<string>();
      for (let i = 0; i < 80; i++) s.add(d.next(pl).poem.title);
      expect(s.size).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps a poem’s clauses in reading order', () => {
    const deck = new VerseDeck(3);
    let prev = deck.next(places[1]);
    for (let i = 0; i < 100; i++) {
      const l = deck.next(places[1]);
      if (l.poem === prev.poem) expect(l.at).toBe(prev.at + 1);
      prev = l;
    }
  });

  it('suits the place: plum poems on Plum Ridge in winter, lotus on the lake in summer', () => {
    const share = (place: VersePlace, test: (text: string, plants: string[]) => boolean) => {
      const deck = new VerseDeck(11);
      let hit = 0;
      const N = 60;
      for (let i = 0; i < N; i++) {
        const p = deck.pickPoem(place);
        if (test(p.lines.join(''), p.plants ?? [])) hit++;
      }
      return hit / N;
    };
    expect(share(places[0], (t, pl) => pl.includes('plum') || t.includes('梅') || t.includes('雪'))).toBeGreaterThan(0.35);
    expect(share({ region: 'lake', season: 'summer', hour: 11 }, (t, pl) => pl.includes('lotus') || /荷|莲|藕|芙蓉/.test(t))).toBeGreaterThan(0.25);
  });

  it('suits the season: no snow in high summer (by score), and the moon by night', () => {
    const snow = POEMS.find((p) => p.lines.join('').includes('独钓寒江雪'))!;
    const summer: VersePlace = { region: 'lake', season: 'summer', hour: 12 };
    const winter: VersePlace = { region: 'lake', season: 'winter', hour: 12 };
    expect(scorePoem(snow, summer)).toBeLessThan(scorePoem(snow, winter));
    const moon = POEMS.find((p) => p.lines.join('').includes('举杯邀明月'))!;
    expect(scorePoem(moon, { region: 'garden', season: 'autumn', hour: 22, night: true })).toBeGreaterThan(scorePoem(moon, { region: 'garden', season: 'autumn', hour: 12, night: false }));
    // by night, more of what is picked belongs to the night
    const nightShare = (night: boolean) => {
      const d = new VerseDeck(5);
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const p = d.pickPoem({ region: 'garden', season: 'autumn', hour: night ? 22 : 12, night });
        if (p.themes?.includes('night') || p.themes?.includes('moon') || /月|夜/.test(p.lines.join(''))) n++;
      }
      return n;
    };
    expect(nightShare(true)).toBeGreaterThan(nightShare(false));
  });

  it('keeps dawn poems to the early hours, and gives each place a night of its own', () => {
    const regions = ['garden', 'village', 'lake', 'bamboo', 'plum', 'mountain', 'home'] as const;
    for (const p of POEMS.filter((q) => q.themes?.includes('morning'))) {
      for (const region of regions) {
        expect(scorePoem(p, { region, season: 'autumn', hour: 14, night: false })).toBeLessThanOrEqual(-50);
        expect(scorePoem(p, { region, season: 'autumn', hour: 23, night: true })).toBeLessThanOrEqual(-50);
      }
    }
    // the poem each place opens with most often by night: not one shared night poem everywhere
    const favourite = (region: (typeof regions)[number]) => {
      const c = new Map<string, number>();
      for (let seed = 1; seed <= 120; seed++) {
        const t = new VerseDeck(seed * 7919).pickPoem({ region, season: 'autumn', hour: 23, night: true }).title;
        c.set(t, (c.get(t) ?? 0) + 1);
      }
      return [...c].sort((a, b) => b[1] - a[1])[0][0];
    };
    expect(new Set(regions.map(favourite)).size).toBeGreaterThanOrEqual(5);
  });

  it('gives the poet whole couplets, then moves on to another poem', () => {
    const deck = new VerseDeck(9);
    const a = deck.couplet(places[1]);
    const b = deck.couplet(places[1]);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((l) => l.poem === a[0].poem)).toBe(true);
    expect(b[0].poem).not.toBe(a[0].poem);
    expect(b[0].text).not.toBe(a[a.length - 1].text);
  });
});

describe('cooldowns', () => {
  it('every companion has a skill that cools down in 6–20 s', () => {
    for (const c of CHARACTERS) {
      const t = SKILL_TIMING[c.id];
      expect(t.cooldown).toBeGreaterThanOrEqual(6);
      expect(t.cooldown).toBeLessThanOrEqual(20);
      expect(c.skill.glyph.length).toBe(1);
    }
  });
  it('counts down per companion, from 1 to 0', () => {
    const cd = new Cooldowns();
    expect(cd.ready('fisher', 0)).toBe(true);
    cd.start('fisher', 10, 20);
    expect(cd.ready('fisher', 15)).toBe(false);
    expect(cd.frac('fisher', 10)).toBeCloseTo(1);
    expect(cd.frac('fisher', 20)).toBeCloseTo(0.5);
    expect(cd.left('fisher', 25)).toBeCloseTo(5);
    expect(cd.ready('fisher', 30)).toBe(true);
    expect(cd.frac('fisher', 31)).toBe(0);
    // another companion's clock is its own
    expect(cd.ready('cat', 15)).toBe(true);
  });
});

describe('the painter’s crane', () => {
  const none: Discovery = { waypointOpen: () => false, encounterMet: () => false, visited: () => false };

  it('flies to the nearest unlit waypoint first (the garden’s is always lit)', () => {
    const d: Discovery = { ...none, waypointOpen: (id) => id === 'garden' };
    const t = craneTarget({ x: 0, z: 30 }, d);
    expect(t.kind).toBe('waypoint');
    expect(t.region).toBe('village');
    // from the west, the bamboo grove's stele is nearer
    expect(craneTarget({ x: -60, z: 30 }, d).region).toBe('bamboo');
  });

  it('does not point at the stele at your feet when others remain', () => {
    const d: Discovery = { ...none, waypointOpen: (id) => id === 'garden' };
    const w = WAYPOINTS.find((x) => x.id === 'lake')!;
    expect(craneTarget({ x: w.x + 1, z: w.z }, d).region).not.toBe('lake');
  });

  it('then the place of an unmet 奇遇, then a place never visited', () => {
    const lit: Discovery = { ...none, waypointOpen: () => true };
    const e = craneTarget({ x: 0, z: 0 }, lit);
    expect(e.kind).toBe('encounter');
    expect(ENCOUNTERS.some((x) => x.region === e.region && x.hintZh === e.hintZh)).toBe(true);
    const met: Discovery = { waypointOpen: () => true, encounterMet: () => true, visited: (id: RegionId) => id !== 'plum' };
    const r = craneTarget({ x: 0, z: 0 }, met);
    expect(r.kind).toBe('region');
    expect(r.region).toBe('plum');
    const all: Discovery = { waypointOpen: () => true, encounterMet: () => true, visited: () => true };
    expect(craneTarget({ x: 3, z: 4 }, all).kind).toBe('none');
  });

  it('leads to a 奇遇 that can happen now, elsewhere; one whose hour has not come only as a last resort', () => {
    // at night in the garden: the butterfly (a sunny afternoon, in this very garden) is never the target
    const night: Discovery = { ...none, waypointOpen: () => true, visited: () => true, here: 'garden', canHappen: (id) => ENCOUNTERS.find((x) => x.id === id)!.hintZh.includes('夜') };
    const t = craneTarget({ x: 0, z: 20 }, night);
    expect(t.kind).toBe('encounter');
    expect(t.region).not.toBe('garden');
    expect(t.later).toBe(false);
    expect(t.hintZh).toContain('夜');
    // nothing can happen now: a place never visited comes first, then a 奇遇 for later
    const never: Discovery = { ...none, waypointOpen: () => true, here: 'garden', canHappen: () => false, visited: (id: RegionId) => id !== 'plum' };
    expect(craneTarget({ x: 0, z: 20 }, never).region).toBe('plum');
    const later = craneTarget({ x: 0, z: 20 }, { ...never, visited: () => true });
    expect(later.kind).toBe('encounter');
    expect(later.later).toBe(true);
    expect(later.region).not.toBe('garden');
  });

  it('only ever names a real place', () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    const rng = makeRng(5);
    for (let i = 0; i < 50; i++) {
      const t = craneTarget({ x: rng.range(-150, 150), z: rng.range(-150, 150) }, { waypointOpen: () => rng() < 0.5, encounterMet: () => rng() < 0.5, visited: () => rng() < 0.5 });
      if (t.kind !== 'none') expect(ids.has(t.region!)).toBe(true);
    }
  });
});

describe('the qin phrase', () => {
  it('rises, runs down like water, and ends softly, in time order', () => {
    for (let s = 1; s < 20; s++) {
      const notes = qinPhrase(makeRng(s));
      expect(notes.length).toBeGreaterThan(12);
      for (let i = 1; i < notes.length; i++) expect(notes[i].at).toBeGreaterThan(notes[i - 1].at);
      const firstFlow = notes.findIndex((n) => n.flow);
      expect(notes[firstFlow - 1].d).toBeGreaterThan(notes[0].d);
      expect(notes[notes.length - 1].at).toBeLessThan(7);
    }
  });
});
