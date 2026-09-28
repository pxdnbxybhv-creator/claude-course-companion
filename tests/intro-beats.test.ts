// 开篇 · the montage's beats from the app's own habit arithmetic (Builder A, spec §4 S5, §12).
import { describe, expect, it } from 'vitest';
import { POND_STATES, beatTable, montageAt, pondMix, reflectedRabbit, litOf, phaseOf } from '../src/views/intro/beats';
import { freshnessFor, growthFor, streakFor } from '../src/core/habits';
import { vigorFor } from '../src/views/garden/scene';

// the synthetic daily habit, built here on its own: checked in on nights 0–38 and 46–72
const base = Date.UTC(2026, 0, 1, 12);
const key = (n: number) => new Date(base + n * 864e5).toISOString().slice(0, 10);
const habit = { days: [0, 1, 2, 3, 4, 5, 6], createdAt: key(0) };
const doneNights: number[] = [];
for (let n = 0; n <= 38; n++) doneNights.push(n);
for (let n = 46; n <= 72; n++) doneNights.push(n);
const doneBy = (night: number) => new Set(doneNights.filter((d) => d <= night).map(key));

describe('the beat table', () => {
  const B = beatTable();
  it('each beat reads the app: growth, pond, vigour and the chime', () => {
    for (const b of B) {
      const done = doneBy(b.night);
      const count = doneNights.filter((d) => d <= b.night).length;
      expect(b.growth, `${b.t}`).toBeCloseTo(growthFor(count), 12);
      expect(b.pond, `${b.t}`).toBeCloseTo(freshnessFor(habit, done, key(b.night)), 12);
      expect(b.vigor, `${b.t}`).toBe(vigorFor(b.pond));
      if (b.kind !== 'lapse') expect(b.chime, `${b.t}`).toBe(streakFor(habit, done, key(b.night)));
    }
  });
  it('matches the spec table', () => {
    const want: [number, number | null, number, number, number | null][] = [
      [22.5, 1, 0.104, 1.0, 1], [26.5, 2, 0.145, 1.0, 2], [27.5, 3, 0.185, 1.0, 3], [28.5, 6, 0.294, 1.0, 6], [29.5, 13, 0.494, 1.0, 13],
      [30.5, 22, 0.670, 1.0, 22], [31.5, 31, 0.785, 1.0, 31], [32.5, 39, 0.853, 1.0, 39],
      [33.5, null, 0.853, 0.70, null], [34.5, null, 0.853, 0.48, null], [35.5, null, 0.853, 0.32, null],
      [36.5, 40, 0.860, 0.36, 1], [37.5, 50, 0.913, 0.92, 11], [38.5, 59, 0.943, 1.0, 20], [39.5, 66, 0.959, 1.0, 27],
    ];
    expect(B.map((b) => b.t)).toEqual(want.map((w) => w[0]));
    B.forEach((b, i) => {
      const [, count, growth, pond, chime] = want[i];
      expect(b.count).toBe(count);
      expect(b.growth).toBeCloseTo(growth, 3);
      expect(b.pond).toBeCloseTo(pond, 2);
      expect(b.chime).toBe(chime);
    });
  });
  it('the sprout is check-in #1 with chime(1); the bloom is #66; nights are monotone', () => {
    expect(B[0].kind).toBe('sprout');
    expect(B[0].count).toBe(1);
    expect(B[0].chime).toBe(1);
    expect(B[B.length - 1].kind).toBe('bloom');
    expect(B[B.length - 1].count).toBe(66);
    for (let i = 1; i < B.length; i++) expect(B[i].night).toBeGreaterThan(B[i - 1].night);
  });
  it('the pond never darkens on a check-in beat', () => {
    let prev = -1;
    for (const b of B) {
      if (b.kind !== 'lapse' && prev >= 0) expect(b.pond, `${b.t}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = b.pond;
    }
  });
  it('every clarity lies within the baked states', () => {
    for (const b of B) {
      expect(b.pond).toBeGreaterThanOrEqual(POND_STATES[0] - 1e-9);
      expect(b.pond).toBeLessThanOrEqual(POND_STATES[POND_STATES.length - 1] + 1e-9);
      const m = pondMix(b.pond);
      const v = POND_STATES[m.a] + (POND_STATES[m.b] - POND_STATES[m.a]) * m.k;
      expect(v).toBeCloseTo(b.pond, 9);
    }
  });
  it('the moon: ≥ .99 lit in the lapse and at the bloom, ≤ .05 at the sprout', () => {
    expect(B.filter((b) => b.kind === 'lapse').some((b) => b.lit >= 0.99)).toBe(true);
    expect(B[B.length - 1].lit).toBeGreaterThanOrEqual(0.99);
    expect(B[0].lit).toBeLessThanOrEqual(0.05);
    expect(phaseOf(0)).toBeCloseTo(0.062, 9);
    expect(litOf(0.5)).toBeCloseTo(1, 9);
  });
  it('no ensō and no tok on lapse beats; the return is chime(1)', () => {
    for (const b of B.filter((x) => x.kind === 'lapse')) { expect(b.enso).toBe(false); expect(b.chime).toBeNull(); }
    const ret = B.find((b) => b.kind === 'return')!;
    expect(ret.chime).toBe(1);
    expect(ret.enso).toBe(true);
  });
  it('the flip-book runs on the beats that jump many nights', () => {
    expect(B.filter((b) => b.flip).map((b) => b.t)).toEqual([28.5, 29.5, 30.5, 31.5, 32.5, 37.5, 38.5]);
  });
  it('the reflected rabbit is drawn only in S6', () => {
    for (let t = 0; t < 86; t += 0.1) expect(reflectedRabbit(t)).toBe(t >= 39.5 && t < 49.2);
  });
});

describe('the montage between beats', () => {
  it('growth only rises, and reaches each beat\'s value within 0.85 s', () => {
    let prev = 0;
    for (let t = 19; t < 49.2; t += 0.05) {
      const m = montageAt(t);
      expect(m.growth).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = m.growth;
    }
    for (const b of beatTable().slice(1)) expect(montageAt(b.t + 0.86).growth).toBeCloseTo(b.growth, 9);
  });
  it('the phase wheels forward and the rabbit leans only in the lapse', () => {
    expect(montageAt(34.0).lean).toBeGreaterThan(0);
    expect(montageAt(32.0).lean).toBe(0);
    expect(montageAt(37.5).lean).toBe(0);
    expect(montageAt(39.6).lit).toBeGreaterThan(0.99);
  });
});
