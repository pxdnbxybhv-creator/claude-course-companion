// 开篇 · the shot table, every line on screen, the reading rule, memory and layout (Builder A, spec §12).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CUTS, DEVICE_FLE_MB, HOLD_CAP, LINES, SHORT_L_BAND, TAIL, TAKEOVER, TEXT, captionPx, columnPx, frameSpec, layoutFor, liveFle,
  resumeAt, shotFle, skyLine, subHint, tailPlan, COLUMN_PITCH,
} from '../src/views/intro/shots';
import { lint } from './helpers/style-lint';
import { POEMS } from '../src/data/poems';
import { todayLine } from '../src/views/garden/env';
import { RING } from '../src/app/intro';
import type { SceneEnv } from '../src/ink/scene-types';

type Cut = 'full' | 'short';
const CUT_IDS: Cut[] = ['full', 'short'];
const hz = (s: string) => [...s].filter((c) => /[㐀-鿿]/.test(c)).length;
const need = (s: string) => 1.8 + 0.25 * hz(s);

describe('the shot table', () => {
  for (const cut of CUT_IDS) {
    const c = CUTS[cut];
    it(`${cut} tiles 0–${c.end} with no gaps or overlaps`, () => {
      expect(c.shots[0].t0).toBe(0);
      for (let i = 1; i < c.shots.length; i++) expect(c.shots[i].t0).toBeCloseTo(c.shots[i - 1].t1, 9);
      expect(c.shots[c.shots.length - 1].t1).toBeCloseTo(c.end, 9);
    });
    it(`${cut} lies in [30, 90] and its end + the ${HOLD_CAP} s hold cap ≤ 90`, () => {
      expect(c.end).toBeGreaterThanOrEqual(30);
      expect(c.end).toBeLessThanOrEqual(90);
      expect(c.end + HOLD_CAP).toBeLessThanOrEqual(90);
    });
    it(`${cut}: HITS are sorted and each lies inside a shot`, () => {
      for (let i = 1; i < c.hits.length; i++) expect(c.hits[i].t).toBeGreaterThanOrEqual(c.hits[i - 1].t);
      for (const h of c.hits) expect(c.shots.some((s) => h.t >= s.t0 && h.t < s.t1 + 1e-9)).toBe(true);
    });
    it(`${cut}: resume points are shot starts and the earliest is the takeover`, () => {
      expect(c.resume[0]).toBe(TAKEOVER);
      expect(TAKEOVER).toBe(3.9);
      for (const r of c.resume.slice(1)) expect(c.shots.some((s) => s.t0 === r)).toBe(true);
      expect(resumeAt(cut, 1.2)).toBe(3.9);
      expect(resumeAt(cut, 30)).toBe(26.4);
    });
    it(`${cut}: acts`, () => {
      expect(c.acts).toEqual(cut === 'full' ? [0, 19.0, 49.2, 67.1] : [0, 19.0, 49.2, 54.2]);
    });
  }
  it('the short cut shares 起 and 承 (0–49.2) with the full cut exactly', () => {
    const early = (cut: Cut) => JSON.stringify({ s: CUTS[cut].shots.filter((s) => s.t1 <= 49.2), t: TEXT[cut].filter((x) => x.out <= 49.2), h: CUTS[cut].hits.filter((h) => h.t < 49.2) });
    expect(early('short')).toBe(early('full'));
  });
  it('the short cut has the window plate, and S12 shifted by −15.2 s', () => {
    expect(CUTS.short.shots.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7s', 'S9s', 'S11s', 'S12']);
    const s12 = CUTS.short.shots.find((s) => s.id === 'S12')!;
    expect(s12.t0).toBeCloseTo(79.5 - 15.2, 9);
  });
});

describe('every line on screen (spec §5)', () => {
  for (const cut of CUT_IDS) {
    const txt = TEXT[cut];
    const caps = txt.filter((t) => t.kind === 'cap').sort((a, b) => a.lines[0].at - b.lines[0].at);
    it(`${cut}: every line meets the reading rule from its own in-time`, () => {
      for (const t of txt) for (const l of t.lines) {
        if (t.kind === 'label' && hz(l.zh) < 5) continue;
        expect(t.out - l.at + 1e-9, `${t.id} ${l.zh}`).toBeGreaterThanOrEqual(need(l.zh));
      }
    });
    it(`${cut}: no caption overlaps another`, () => {
      for (let i = 1; i < caps.length; i++) expect(caps[i].lines[0].at).toBeGreaterThanOrEqual(caps[i - 1].out - 1e-9);
    });
    it(`${cut}: a quote overlaps a caption by ≤ 1.0 s, except Q1 with N`, () => {
      for (const q of txt.filter((t) => t.kind === 'quote')) for (const c of caps) {
        const ov = Math.min(q.out, c.out) - Math.max(q.lines[0].at, c.lines[0].at);
        if (q.id === 'Q1' && c.id === 'N') continue;
        expect(ov, `${q.id}/${c.id}`).toBeLessThanOrEqual(1.0 + 1e-9);
      }
    });
    it(`${cut}: each line ≤ 14 字; a two-line caption breaks between lines`, () => {
      for (const t of txt) {
        for (const l of t.lines) expect(hz(l.zh), l.zh).toBeLessThanOrEqual(14);
        if (t.kind === 'cap' && t.lines.length > 1) for (let i = 1; i < t.lines.length; i++) expect(t.lines[i].at).toBeGreaterThanOrEqual(t.lines[i - 1].at);
      }
    });
    it(`${cut}: text ends inside the film`, () => {
      for (const t of txt) expect(t.out).toBeLessThanOrEqual(CUTS[cut].end + 1e-9);
    });
  }
  it('the counts: 6 two-line captions in the full cut', () => {
    expect(TEXT.full.filter((t) => t.kind === 'cap' && t.lines.length === 2).length).toBe(6);
  });

  it('lint: every caption, variant and UI string passes narr; the quotes pass quote', () => {
    const all = new Set<string>();
    for (const cut of CUT_IDS) for (const t of TEXT[cut]) if (t.kind !== 'quote') for (const l of t.lines) all.add(l.zh);
    for (const s of [LINES.C22bent, LINES.C22half, LINES.C22day, LINES.late, LINES.hint, LINES.subOn, LINES.subOff, LINES.Q1by, LINES.Q3by]) all.add(s);
    for (const s of all) expect(lint(s, 'narr'), s).toEqual([]);
    for (const s of [LINES.Q1, LINES.Q3a, LINES.Q3b]) expect(lint(s, 'quote'), s).toEqual([]);
  });

  it('the quotes are exact substrings of POEMS[0], by-lines from its dynasty and author', () => {
    const p = POEMS[0];
    const poem = p.lines.join('');
    for (const s of [LINES.Q1, LINES.Q3a, LINES.Q3b]) expect(poem.includes(s), s).toBe(true);
    expect(p.lines).toContain(`${LINES.Q3a}？${LINES.Q3b}。`);
    expect(LINES.Q3by).toBe(`${p.dynasty}·${p.author}`);
    expect(LINES.Q1by).toBe(`${p.dynasty}·${p.author}《${p.title}》`);
    const q1 = TEXT.full.find((t) => t.id === 'Q1')!;
    expect(q1.aria).toBe('半亩方塘一鉴开。——宋·朱熹《观书有感》');
    expect(TEXT.full.find((t) => t.id === 'Q3')!.aria).toBe('问渠那得清如许？为有源头活水来。——宋·朱熹');
  });

  it('every brushed string is in the brush set', () => {
    const brush = new Set([...readFileSync(new URL('../scripts/brush_chars.txt', import.meta.url), 'utf8')]);
    for (const s of [LINES.hint, LINES.Q1, LINES.Q3a, LINES.Q3b, LINES.slip, LINES.T, '月']) for (const c of s) expect(brush.has(c), c).toBe(true);
  });

  it('L1 is the almanac line of the night 半亩 began', () => {
    expect(LINES.L1).toBe(todayLine(new Date('2026-09-24T19:09:00+08:00')).zh);
  });

  it('the sub-hint', () => {
    expect(subHint(true)).toBe('一分多钟 · 有声音');
    expect(subHint(false)).toBe('一分多钟');
  });
});

describe('skyLine (C22)', () => {
  const env = (tod: SceneEnv['tod'], moonPhase: number): SceneEnv => ({ season: 'autumn', tod, hour: tod === 'night' ? 22 : 12, moonPhase, termIndex: 17, clarity: 0.92, seed: 1127 });
  const vis = { x: 0, y: 0, w: 390, h: 413 };
  const moon = { kind: 'moon' as const, x: 280, y: 80, r: 16 };
  it('night with a visible disc: 圆 / 弯 / 一个样 by the lit fraction', () => {
    expect(skyLine(env('night', 0.5), moon, vis)).toBe(LINES.C22round);
    expect(skyLine(env('night', 0.38), moon, vis)).toBe(LINES.C22round); // ≈ 84 % lit
    expect(skyLine(env('night', 0.12), moon, vis)).toBe(LINES.C22bent);
    expect(skyLine(env('night', 0.25), moon, vis)).toBe(LINES.C22half);
  });
  it('night with the disc outside the visible rect: the hour line', () => {
    expect(skyLine(env('night', 0.5), { ...moon, x: 385 }, vis)).toBe(LINES.C22day);
    expect(skyLine(env('night', 0.5), { ...moon, y: 5 }, vis)).toBe(LINES.C22day);
  });
  it('no body, dawn, day and dusk: the hour line', () => {
    expect(skyLine(env('night', 0.5), null, vis)).toBe(LINES.C22day);
    expect(skyLine(env('night', 0.5), { ...moon, r: 0 }, vis)).toBe(LINES.C22day);
    for (const tod of ['dawn', 'day', 'dusk'] as const) expect(skyLine(env(tod, 0.5), { ...moon, kind: 'sun' }, vis)).toBe(LINES.C22day);
  });
  it('every variant fits the fixed 5.3 s slot', () => {
    for (const s of [LINES.C22round, LINES.C22bent, LINES.C22half, LINES.C22day]) expect(need(s)).toBeLessThanOrEqual(5.3 + 1e-9);
    for (const cut of CUT_IDS) {
      const c22 = TEXT[cut].find((t) => t.id === 'C22')!;
      expect(c22.out - c22.lines[0].at).toBeCloseTo(5.3, 9);
    }
  });
});

describe('the skip tail', () => {
  it('is 2.5 s; before the takeover a skip is the gate\'s close; the rabbit hops only from S8 on', () => {
    expect(TAIL).toBe(2.5);
    expect(tailPlan('full', 3.0).kind).toBe('gate');
    expect(tailPlan('full', 3.9).kind).toBe('tail');
    expect(tailPlan('full', 60.4).rabbit).toBe(false);
    expect(tailPlan('full', 60.5).rabbit).toBe(true);
    expect(tailPlan('short', 54.1).rabbit).toBe(false);
    expect(tailPlan('short', 54.2).rabbit).toBe(true);
  });
});

describe('canvas memory under the keep rule (spec §8.3)', () => {
  it('the full cut\'s per-shot table and its peak', () => {
    const want = [3.6, 4.16, 4.72, 4.22, 3.22, 4.99, 4.99, 4.62, 3.5, 4.6, 4.6, 3.8, 1.7];
    const got = CUTS.full.shots.map((s) => shotFle('full', s.id));
    got.forEach((v, i) => expect(v, CUTS.full.shots[i].id).toBeCloseTo(want[i], 2));
    expect(Math.max(...got)).toBeCloseTo(4.99, 2);
  });
  for (const cut of CUT_IDS) {
    it(`${cut}: every resume shot and every t (0.1 s) stays within 30 MB iPhone and 45 MB iPad`, () => {
      const end = CUTS[cut].end;
      for (const r of CUTS[cut].resume) {
        for (let t = r; t < end; t += 0.1) {
          const f = liveFle(cut, t);
          expect(f * DEVICE_FLE_MB['iPhone P']).toBeLessThanOrEqual(30);
          expect(f * DEVICE_FLE_MB['iPad L']).toBeLessThanOrEqual(45);
        }
      }
      for (const s of CUTS[cut].shots) {
        expect(shotFle(cut, s.id) * DEVICE_FLE_MB['iPhone P']).toBeLessThanOrEqual(30);
        expect(shotFle(cut, s.id) * DEVICE_FLE_MB['iPad L']).toBeLessThanOrEqual(45);
      }
    });
    it(`${cut}: a resume finds its shot's layers alive (the keep rule: a layer lives to a shot's end)`, () => {
      const ends = new Set(CUTS[cut].shots.map((s) => s.t1));
      for (const l of CUTS[cut].layers) expect(ends.has(l.until), l.id).toBe(true);
    });
  }
});

describe('layout', () => {
  it('classes', () => {
    expect(layoutFor(390, 844).cls).toBe('P');
    expect(layoutFor(1280, 800).cls).toBe('L');
    expect(layoutFor(844, 390).cls).toBe('shortL');
    expect(layoutFor(320, 568).cls).toBe('P');
    const m = layoutFor(1024, 1024).mix;
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(0.8);
  });
  it('short L columns fit y 6–58 %', () => {
    const [w, h] = [844, 390];
    const px = columnPx(32, 7, w, h);
    expect(7 * px * COLUMN_PITCH).toBeLessThanOrEqual((SHORT_L_BAND[1] - SHORT_L_BAND[0]) * h + 1e-9);
    expect(px).toBeGreaterThan(22);
  });
  it('at 320×568 a 14-字 line plus 2 marks fits 100vw − 32px on one line at ≥ 16 px', () => {
    const px = captionPx(320, 568);
    expect(px).toBeGreaterThanOrEqual(16);
    expect(16 * px).toBeLessThanOrEqual(320 - 32 + 1e-9);
    expect(captionPx(390, 844)).toBe(19);
    expect(captionPx(1280, 800)).toBe(23);
    expect(captionPx(844, 390)).toBe(16);
  });
  it('no column is longer than 60 % of the height', () => {
    for (const [w, h] of [[390, 844], [1280, 800], [844, 390], [320, 568], [1024, 600]]) {
      for (const size of [28, 30, 32]) expect(7 * columnPx(size, 7, w, h) * COLUMN_PITCH).toBeLessThanOrEqual(0.6 * h + 1e-9);
    }
  });
});

describe('frames and rings', () => {
  it('frameSpec names the shot and the lines on screen', () => {
    const f = frameSpec(15.6, 'full');
    expect(f.shot).toBe('S3');
    expect(f.text.map((x) => x.id)).toEqual(expect.arrayContaining(['L1', 'Q1', 'N']));
    expect(frameSpec(9.0, 'full').text.find((x) => x.id === 'C3')!.lines).toEqual(['八月十四，']);
  });
  it('the S9 and S9s rings read RING', () => {
    expect(RING.n).toBe(3);
    expect(RING.stagger).toBe(0.18);
    const src = readFileSync(new URL('../src/views/intro/paint/rings.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\bRING\b/);
  });
  it('the S12 settle animates transform and opacity only', () => {
    const src = readFileSync(new URL('../src/views/intro/captions.ts', import.meta.url), 'utf8');
    const film = readFileSync(new URL('../src/views/intro/Film.ts', import.meta.url), 'utf8');
    expect(film).not.toMatch(/clip-path|clipPath:/);
    const m = src.match(/SETTLE_PROPS\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    expect(m![1].replace(/['"\s]/g, '').split(',').filter(Boolean).sort()).toEqual(['opacity', 'transform']);
    expect(src).not.toMatch(/clip-path|clipPath:/);
  });
});

