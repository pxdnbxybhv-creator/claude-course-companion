// 轻功 · parkour: today's coin spots (deterministic, spread over the places, some challenges), the
// 梅花桩 run's clock, and the best-time rules.
import { describe, expect, it } from 'vitest';
import {
  DAILY_SPOTS, FIRST_FINISH_COINS, MIN_CHALLENGES, PoleRun, RECORD_COINS, RUN_LIMIT,
  finishReward, fmtTime, inRect, pickDaily, poleScore, poleTime, stoneLine, type SpotLike,
} from '../src/views/walk/features/parkour/logic';
import { SITES, DECK_COINS } from '../src/views/walk/features/parkour/sites';
import { POLE_COINS } from '../src/views/walk/features/parkour/poles';

const spots: SpotLike[] = [];
for (const r of ['village', 'lake', 'bamboo', 'plum', 'mountain']) {
  for (let i = 0; i < 14; i++) spots.push({ id: `${r}-${i}`, region: r, challenge: i % 6 === 5 ? 'high' : undefined });
}

describe('daily coin spots', () => {
  it('are the same all day for the same seed, different on another day', () => {
    const a = pickDaily(spots, 1234).map((s) => s.id);
    const b = pickDaily(spots, 1234).map((s) => s.id);
    const c = pickDaily(spots, 98765).map((s) => s.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('picks exactly n distinct spots, in the original order', () => {
    const p = pickDaily(spots, 7);
    expect(p.length).toBe(DAILY_SPOTS);
    expect(new Set(p.map((s) => s.id)).size).toBe(DAILY_SPOTS);
    const idx = p.map((s) => spots.indexOf(s));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });
  it('shares the spots out between the places', () => {
    for (let seed = 0; seed < 30; seed++) {
      const p = pickDaily(spots, seed);
      const per = new Map<string, number>();
      for (const s of p) per.set(s.region, (per.get(s.region) ?? 0) + 1);
      expect(per.size).toBe(5);
      for (const n of per.values()) expect(n).toBeGreaterThanOrEqual(6);
    }
  });
  it('always puts out a few challenges', () => {
    for (let seed = 0; seed < 30; seed++) {
      const p = pickDaily(spots, seed);
      expect(p.filter((s) => s.challenge).length).toBeGreaterThanOrEqual(MIN_CHALLENGES);
    }
  });
  it('handles small sets and n = 0', () => {
    expect(pickDaily(spots.slice(0, 5), 1).length).toBe(5);
    expect(pickDaily(spots, 1, 0)).toEqual([]);
  });
  it('the hand-placed set is larger than a day, with unique ids and sane values', () => {
    const all = [...SITES.flatMap((s) => s.coins), ...POLE_COINS, ...DECK_COINS];
    expect(all.length).toBeGreaterThan(DAILY_SPOTS);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.value).toBeGreaterThanOrEqual(1);
      expect(c.value).toBeLessThanOrEqual(5);
    }
    expect(all.filter((c) => c.challenge).length).toBeGreaterThanOrEqual(MIN_CHALLENGES);
  });
});

describe('梅花桩 run', () => {
  it('arms on the start stone, starts when you leave it, stops at the finish', () => {
    const r = new PoleRun();
    expect(r.step(0, 'away')).toBeNull();
    expect(r.step(1, 'start')).toBe('armed');
    expect(r.step(1.5, 'start')).toBeNull();
    expect(r.step(2, 'air')).toBe('go');
    expect(r.elapsed(5)).toBeCloseTo(3);
    expect(r.step(3, 'pole')).toBeNull();
    expect(r.step(14.25, 'finish')).toBe('finish');
    expect(r.time).toBeCloseTo(12.25);
    expect(r.phase).toBe('finished');
    expect(r.elapsed(20)).toBe(0);
  });
  it('touching the ground is a fall; back on the start it arms again', () => {
    const r = new PoleRun();
    r.step(0, 'start');
    r.step(1, 'pole');
    expect(r.phase).toBe('running');
    expect(r.step(2, 'ground')).toBe('fall');
    expect(r.step(2.5, 'ground')).toBeNull();
    expect(r.step(3, 'start')).toBe('armed');
    expect(r.step(4, 'pole')).toBe('go');
    expect(r.t0).toBe(4);
  });
  it('stepping off the start onto the ground, or straight to the finish, does not start a run', () => {
    const r = new PoleRun();
    r.step(0, 'start');
    expect(r.step(1, 'ground')).toBeNull();
    expect(r.phase).toBe('idle');
    r.step(2, 'start');
    expect(r.step(3, 'finish')).toBeNull();
    expect(r.phase).toBe('idle');
  });
  it('walking away or taking too long calls the run off', () => {
    const r = new PoleRun();
    r.step(0, 'start');
    r.step(1, 'air');
    expect(r.step(2, 'away')).toBe('abort');
    r.step(3, 'start');
    r.step(4, 'air');
    expect(r.step(4 + RUN_LIMIT + 1, 'pole')).toBe('abort');
  });
  it('jumping on the start stone just starts again', () => {
    const r = new PoleRun();
    r.step(0, 'start');
    expect(r.step(1, 'air')).toBe('go');
    expect(r.step(1.4, 'start')).toBe('armed');
    expect(r.phase).toBe('armed');
  });
});

describe('best times', () => {
  it('a faster time is a higher score (recordMax keeps the best)', () => {
    expect(poleScore(10)).toBeGreaterThan(poleScore(12));
    expect(poleTime(poleScore(12.34))).toBeCloseTo(12.34);
    expect(poleTime(undefined)).toBeNull();
    expect(poleTime(0)).toBeNull();
    expect(poleScore(1e6)).toBe(1);
  });
  it('pays for the first finish and for every new best, nothing otherwise', () => {
    expect(finishReward(null, 20)).toEqual({ coins: FIRST_FINISH_COINS, first: true, record: true });
    expect(finishReward(20, 18.5)).toEqual({ coins: RECORD_COINS, first: false, record: true });
    expect(finishReward(18.5, 18.5)).toEqual({ coins: 0, first: false, record: false });
    expect(finishReward(18.5, 18.504)).toEqual({ coins: 0, first: false, record: false });
    expect(finishReward(18.5, 25)).toEqual({ coins: 0, first: false, record: false });
  });
  it('formats times', () => {
    expect(fmtTime(12.345)).toBe('12.3″');
    expect(fmtTime(0)).toBe('0.0″');
    expect(fmtTime(75.25)).toBe('1′15.2″');
  });
});

describe('geometry', () => {
  it('stepping stones lie between the banks, evenly, zig-zagging', () => {
    const s = stoneLine({ x: 0, z: 0 }, { x: 0, z: 10 }, 4, 0.4, 3);
    expect(s.length).toBe(4);
    s.forEach((p, i) => {
      expect(p.z).toBeCloseTo((10 * (i + 1)) / 5);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.4);
    });
    expect(Math.sign(s[0].x)).toBe(-Math.sign(s[1].x));
  });
  it('tests points in an oriented rectangle', () => {
    const k = Math.SQRT1_2;
    expect(inRect(1, 1, 0, 0, k, k, 2, 0.5)).toBe(true);
    expect(inRect(1, -1, 0, 0, k, k, 2, 0.5)).toBe(false);
  });
});
