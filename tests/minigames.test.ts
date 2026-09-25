// The in-world mini-games' rules: the fish of the lake and the reel, pitch-pot flight and scoring,
// the river a lantern floats down, where the cat hides, and the poet's 飞花令 lines.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { makeRng } from '../src/core/rng';
import { addDays } from '../src/core/date';
import { LAKE, RIVER, RIVER_LAKE_BREAK, REGION, ANCHORS } from '../src/views/walk/map';
import {
  FISH, fishOdds, rollFish, biteDelay, newReel, reelZone, stepReel, inZone,
  POT, throwFlight, flightAt, idealPower, classifyThrow, scoreRound,
  makePath, lowerRiver, lanternDrift,
  CAT_SPOTS, catSpotFor,
  clauses, feihuaTurns, playableLing, fishAlbum,
} from '../src/views/walk/features/minigames/logic';
import { hold, modalOpen } from '../src/views/walk/features/minigames/ui';
import { findMooring } from '../src/views/walk/features/minigames/boat';

describe('fishing', () => {
  it('odds are a distribution; rare fish are rare, legends rarer', () => {
    for (const night of [false, true]) {
      for (const month of [1, 4, 8]) {
        const odds = fishOdds({ month, night });
        expect(odds.reduce((a, e) => a + e.p, 0)).toBeCloseTo(1, 9);
        const p = (id: string) => odds.find((e) => e.species.id === id)!.p;
        expect(p('koi')).toBeLessThan(0.04);
        expect(p('dragon')).toBeLessThan(p('koi'));
        expect(p('kun')).toBeLessThan(p('dragon'));
        expect(p('crucian')).toBeGreaterThan(0.2);
      }
    }
    // mandarin fish are fatter in spring (桃花流水鳜鱼肥); black carp come out at night
    expect(fishOdds({ month: 4, night: false }).find((e) => e.species.id === 'mandarin')!.p)
      .toBeGreaterThan(fishOdds({ month: 9, night: false }).find((e) => e.species.id === 'mandarin')!.p);
    expect(fishOdds({ month: 9, night: true }).find((e) => e.species.id === 'blackcarp')!.p)
      .toBeGreaterThan(fishOdds({ month: 9, night: false }).find((e) => e.species.id === 'blackcarp')!.p * 5);
  });

  it('rolls match the odds and sizes stay in range', () => {
    const rng = makeRng(7);
    const n = 40000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const c = rollFish(rng, { month: 9, night: false });
      count[c.species.id] = (count[c.species.id] ?? 0) + 1;
      expect(c.cm).toBeGreaterThanOrEqual(c.species.cm[0]);
      expect(c.cm).toBeLessThanOrEqual(c.species.cm[1]);
    }
    for (const e of fishOdds({ month: 9, night: false })) {
      const got = (count[e.species.id] ?? 0) / n;
      expect(Math.abs(got - e.p)).toBeLessThan(Math.max(0.01, e.p * 0.25));
    }
    expect(count.koi).toBeGreaterThan(0);
  });

  it('every species has a verse and a source', () => {
    const ids = new Set(FISH.map((f) => f.id));
    expect(ids.size).toBe(FISH.length);
    for (const f of FISH) {
      expect(f.verseZh.length).toBeGreaterThan(6);
      expect(f.srcZh).toMatch(/《.+》/);
      expect(f.verseEn.length).toBeGreaterThan(10);
    }
  });

  it('the fisher bites sooner and gets a wider zone', () => {
    const a = makeRng(3), b = makeRng(3);
    for (let i = 0; i < 50; i++) expect(biteDelay(b, 1.8)).toBeLessThan(biteDelay(a, 1));
    for (const f of FISH) {
      expect(reelZone(f.fight, 1.8)).toBeGreaterThan(reelZone(f.fight, 1));
      expect(reelZone(f.fight, 1)).toBeGreaterThan(0.15);
    }
  });

  it('a player who follows the fish lands it; one who never holds loses a lively one', () => {
    for (const f of FISH) {
      const rng = makeRng(11);
      const r = newReel(reelZone(f.fight));
      let res: string | null = null;
      for (let i = 0; i < 60 * 60 && !res; i++) res = stepReel(r, 1 / 60, r.zone < r.fish, f.fight, rng);
      expect(res, f.id).toBe('caught');
    }
    const rng = makeRng(5);
    const r = newReel(reelZone(1.6));
    let res: string | null = null;
    for (let i = 0; i < 60 * 60 && !res; i++) res = stepReel(r, 1 / 60, false, 1.6, rng);
    expect(res).toBe('lost');
    // the zone never leaves the track
    const z = newReel(0.3);
    for (let i = 0; i < 600; i++) {
      stepReel(z, 1 / 60, i < 300, 1, makeRng(i));
      expect(z.zone - z.zoneW / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(z.zone + z.zoneW / 2).toBeLessThanOrEqual(1 + 1e-9);
      expect(typeof inZone(z)).toBe('boolean');
    }
  });
});

describe('pitch-pot', () => {
  it('there is a power that lands dead centre, in the middle of the bar', () => {
    const p = idealPower();
    expect(p).toBeGreaterThan(0.25);
    expect(p).toBeLessThan(0.75);
    const f = throwFlight(0, p);
    expect(Math.hypot(f.x, f.z)).toBeLessThan(0.01);
    expect(classifyThrow(f.x, f.z)).toBe('hu');
    // flightAt agrees with throwFlight at the crossing
    const g = flightAt(0, p, f.t);
    expect(g.y).toBeCloseTo(POT.mouthY, 6);
    expect(g.vy).toBeLessThan(0);
  });

  it('a little power is forgiving, a lot is not', () => {
    const p = idealPower();
    expect(classifyThrow(throwFlight(0, p + 0.02).x, throwFlight(0, p + 0.02).z)).toBe('hu');
    expect(classifyThrow(throwFlight(0, p - 0.02).x, throwFlight(0, p - 0.02).z)).toBe('hu');
    expect(classifyThrow(throwFlight(0, p + 0.2).x, throwFlight(0, p + 0.2).z)).toBe('miss');
    expect(classifyThrow(throwFlight(0, 0).x, throwFlight(0, 0).z)).toBe('miss');
  });

  it('ears are symmetric, and aiming at one threads it', () => {
    expect(classifyThrow(POT.earOff, 0)).toBe('er');
    expect(classifyThrow(-POT.earOff, 0)).toBe('er');
    expect(classifyThrow(0, POT.earOff)).toBe('miss');
    expect(classifyThrow(POT.mouthR + 0.02, 0)).toBe('yi');
    const p = idealPower();
    const along = POT.dist;
    const aim = Math.asin(POT.earOff / along);
    const r = throwFlight(aim, p);
    expect(classifyThrow(r.x, r.z)).toBe('er');
    const l = throwFlight(-aim, p);
    expect(classifyThrow(l.x, l.z)).toBe('er');
    expect(r.x).toBeCloseTo(-l.x, 9);
  });

  it('scores the traditional feats', () => {
    expect(scoreRound([]).total).toBe(0);
    const miss8 = scoreRound(Array(8).fill('miss'));
    expect(miss8).toEqual({ total: 0, hits: 0, feats: [] });
    // 有初 +5, 连中: two in a row +3
    const s = scoreRound(['hu', 'hu', 'miss']);
    expect(s.total).toBe(10 + 10 + 3 + 5);
    expect(s.feats.map((f) => f.zh)).toEqual(['有初', '连中2']);
    const e = scoreRound(['miss', 'er']);
    expect(e.total).toBe(15);
    expect(e.feats.map((f) => f.zh)).toEqual(['贯耳']);
    // 全壶: all eight in (8×10 + 7 runs×3 + 有初 5 + 全壶 20)
    const all = scoreRound(Array(8).fill('hu'));
    expect(all.total).toBe(80 + 21 + 5 + 20);
    expect(all.hits).toBe(8);
    expect(all.feats.some((f) => f.zh === '全壶')).toBe(true);
    // leaning on the rim counts as in, for runs
    expect(scoreRound(['yi', 'yi']).total).toBe(5 + 5 + 3 + 5);
  });
});

describe('river lanterns', () => {
  it('a path looks up points by distance', () => {
    const p = makePath([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }]);
    expect(p.length).toBe(20);
    expect(p.at(5)).toMatchObject({ x: 5, z: 0, dx: 1, dz: 0 });
    expect(p.at(15)).toMatchObject({ x: 10, z: 5, dx: 0, dz: 1 });
    expect(p.at(-3)).toMatchObject({ x: 0, z: 0 });
    expect(p.at(99)).toMatchObject({ x: 10, z: 10 });
    expect(p.project({ x: 4, z: 2 })).toEqual({ s: 4, d: 2 });
    expect(p.project({ x: 12, z: 7 }).s).toBeCloseTo(17, 9);
  });

  it('the lower river starts at the lake and flows west to the edge of the world', () => {
    const r = lowerRiver();
    expect(r.pts[0]).toEqual(RIVER[RIVER_LAKE_BREAK]);
    expect(r.pts[r.pts.length - 1]).toEqual(RIVER[RIVER.length - 1]);
    // leaves near the lake
    const first = r.pts[0];
    expect(((first.x - LAKE.x) / LAKE.rx) ** 2 + ((first.z - LAKE.z) / LAKE.rz) ** 2).toBeLessThan(2.2);
    // the lantern steps are by the river
    const steps = r.project(ANCHORS.lanternSteps);
    expect(steps.d).toBeLessThan(8);
  });

  it('a drifting lantern follows the flow downstream and stays between the banks', () => {
    const r = lowerRiver();
    const s0 = r.project(ANCHORS.lanternSteps).s;
    let lastS = -1;
    let lastX = Infinity;
    for (let s = s0; s < r.length; s += 2) {
      const d = lanternDrift(r, s, 0.4, s * 1.7);
      const c = r.at(s);
      expect(Math.hypot(d.x - c.x, d.z - c.z)).toBeLessThanOrEqual(c.w * 0.55 + 1e-9);
      expect(Number.isFinite(d.heading)).toBe(true);
      const pr = r.project(d);
      expect(pr.s).toBeGreaterThan(lastS - 1.5);
      lastS = pr.s;
      // below the steps the river runs west
      expect(d.x).toBeLessThan(lastX + 1.5);
      lastX = d.x;
    }
  });
});

describe('hide-and-seek', () => {
  it('the same spot all day; a spread of spots over a season; never in the garden', () => {
    const seen = new Set<string>();
    const regions = new Set<string>();
    let day = '2026-01-01';
    let same = 0, prev = '';
    for (let i = 0; i < 120; i++) {
      const s = catSpotFor(day);
      expect(catSpotFor(day)).toBe(s);
      expect(s.region).not.toBe('garden');
      seen.add(s.id);
      regions.add(s.region);
      if (s.id === prev) same++;
      prev = s.id;
      day = addDays(day, 1);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(regions.size).toBeGreaterThanOrEqual(4);
    expect(same).toBeLessThan(30);
  });

  it('every spot lies within its region and carries a clue', () => {
    const ids = new Set(CAT_SPOTS.map((s) => s.id));
    expect(ids.size).toBe(CAT_SPOTS.length);
    for (const s of CAT_SPOTS) {
      const r = REGION[s.region];
      expect(Math.hypot(s.x - r.center.x, s.z - r.center.z)).toBeLessThan(r.radius * 1.2);
      expect(s.clueZh.length).toBeGreaterThan(6);
      expect(s.clueEn.length).toBeGreaterThan(10);
    }
  });
});

describe('飞花令 with the poet', () => {
  it('clauses are clean', () => {
    const all = clauses();
    expect(all.length).toBeGreaterThan(200);
    for (const c of all) expect(c.text).not.toMatch(/[，。？！；、\s]/);
  });

  it('enough key characters for three rounds of four', () => {
    expect(playableLing(4).length).toBeGreaterThanOrEqual(3);
  });

  it('each turn has exactly one right answer, containing the key; no line twice', () => {
    for (const ling of playableLing(4)) {
      const used = new Set<string>();
      const turns = feihuaTurns(ling, 4, makeRng(ling.charCodeAt(0)), used);
      expect(turns.length).toBe(4);
      const lines = new Set<string>();
      for (const t of turns) {
        expect(t.poet.text).toContain(ling);
        expect(t.options).toHaveLength(3);
        t.options.forEach((o, i) => expect(o.text.includes(ling)).toBe(i === t.answer));
        for (const l of [t.poet.text, t.options[t.answer].text]) {
          expect(lines.has(l)).toBe(false);
          lines.add(l);
        }
      }
    }
  });
});

describe('hold-to-charge input', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const setup = () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    const el = new EventTarget() as unknown as HTMLElement;
    const key = (type: 'keydown' | 'keyup', code = 'Space') => {
      const e = new Event(type, { cancelable: true });
      Object.assign(e, { code, repeat: false });
      win.dispatchEvent(e);
      return e;
    };
    const ptr = (type: string) => (type === 'pointerdown' ? el : win).dispatchEvent(new Event(type, { cancelable: true }));
    return { H: hold(el), key, ptr };
  };

  it('a new press forgets the release of the last one (no instant, powerless throw)', () => {
    const { H, key, ptr } = setup();
    key('keydown');
    expect(H.down).toBe(true);
    expect(H.pressed()).toBe(true);
    key('keyup'); // released while a phase that only asks pressed() is running
    expect(H.down).toBe(false);
    key('keydown');
    expect(H.pressed()).toBe(true);
    expect(H.released()).toBe(false); // the charge must go on
    expect(H.down).toBe(true);
    key('keyup');
    expect(H.released()).toBe(true);
    // the same with a finger
    ptr('pointerdown'); ptr('pointerup');
    ptr('pointerdown');
    expect(H.pressed()).toBe(true);
    expect(H.released()).toBe(false);
    ptr('pointerup');
    expect(H.released()).toBe(true);
    H.dispose();
  });

  it('keys go to a card or dialogue that is open, not to the game behind it', () => {
    const { H, key } = setup();
    let open = true;
    vi.stubGlobal('document', { querySelector: () => (open ? {} : null) });
    expect(modalOpen()).toBe(true);
    const e = key('keydown');
    expect(e.defaultPrevented).toBe(false); // left for the card to close itself
    expect(H.pressed()).toBe(false);
    expect(H.down).toBe(false);
    key('keyup');
    open = false;
    key('keydown');
    expect(H.pressed()).toBe(true);
    // a key held when the card opens still lets go
    open = true;
    key('keyup');
    expect(H.down).toBe(false);
    expect(H.released()).toBe(true);
    H.dispose();
  });
});

describe('the fish album', () => {
  it('has a page per species, caught or with a hint', () => {
    const pages = fishAlbum({ 'fish:carp': true, 'fish:kun': true }, { 'fishcm:carp': 41.5 });
    expect(pages.length).toBe(FISH.length);
    const carp = pages.find((p) => p.species.id === 'carp')!;
    expect(carp.caught).toBe(true);
    expect(carp.bestCm).toBe(41.5);
    expect(pages.filter((p) => p.caught).length).toBe(2);
    for (const p of pages) expect(p.hintZh.length && p.hintEn.length).toBeTruthy();
    expect(pages.find((p) => p.species.id === 'blackcarp')!.hintZh).toMatch(/夜/);
  });
});

describe('the boat berth', () => {
  // a jetty 1.1 m either side of the x axis from x = 0 to x = 10 (the angler stands at its end),
  // and a T across its end; water everywhere else
  const onJetty = (x: number, z: number) => (x >= 0 && x <= 10 && Math.abs(z) <= 1.1) || (x >= 8.2 && x <= 10.2 && Math.abs(z) <= 3);
  const stand = { x: 10, z: 0 }, dir = { x: 1, z: 0 };
  const hullClear = (x: number, z: number, hd: number) => {
    const fx = Math.sin(hd), fz = Math.cos(hd);
    for (const [f, q] of [[0, 0], [1.75, 0], [-1.75, 0], [1, 0.62], [1, -0.62], [-1, 0.62], [-1, -0.62]]) {
      if (onJetty(x + fx * f + fz * q, z + fz * f - fx * q) || x + fx * f + fz * q < 2) return false;
    }
    return true;
  };

  it('ties up alongside the planks, boardable from them and clear of the angler', () => {
    const m = findMooring(stand, dir, hullClear, onJetty)!;
    expect(m).not.toBeNull();
    expect(onJetty(m.plank.x, m.plank.z)).toBe(true);
    const dStand = Math.hypot(m.plank.x - stand.x, m.plank.z - stand.z);
    expect(dStand).toBeGreaterThanOrEqual(2.2);
    expect(dStand).toBeLessThanOrEqual(6);
    // the boat lies just off the edge: its centre within 2 m of the plank (the prompt radius)
    expect(Math.hypot(m.boat.x - m.plank.x, m.boat.z - m.plank.z)).toBeLessThan(2);
    expect(hullClear(m.boat.x, m.boat.z, Math.atan2(dir.x, dir.z))).toBe(true);
    // it can row straight out: not tucked behind the T's crossbar
    for (let k = 0.25; k <= 6; k += 0.25) expect(hullClear(m.boat.x + k, m.boat.z, Math.atan2(dir.x, dir.z))).toBe(true);
    // which, with a T across the end, means lying off the T's end rather than the stem
    expect(Math.abs(m.boat.z)).toBeGreaterThan(3);
  });
});
