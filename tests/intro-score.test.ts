// The opening PV's score (spec §7, §12): every HIT has its sound, the poem plays its own 平仄, the
// lapse is one 二胡 note, the drip returns identically, the voices stay within budget.
import { describe, expect, it } from 'vitest';
import { MAX_VOICES } from '../src/audio/music-player';
import {
  ACTS, END, GLYPH_STEP, P, PINGZE, QUOTE_AT, TAIL_CHOKE, buildScore, pingze, scoreActs, tailCue, type ReelEvent, type Score, type SfxCue,
} from '../src/views/intro/score';
import type { Cut } from '../src/app/intro';
// A's shot table: the HITS and ACTS the score must agree with (A and S change a time only together).
import { ACTS as SHOT_ACTS, CUTS as SHOT_CUTS, HITS } from '../src/views/intro/shots';

const CUTS_: Cut[] = ['full', 'short'];
const S: Record<Cut, Score> = { full: buildScore('full'), short: buildScore('short') };
const PENT = new Set([5, 7, 9, 0, 2]);
const near = (a: number, b: number, eps = 0.0101) => Math.abs(a - b) <= eps;

/** The film time of every sound an event makes (its onsets). */
function onsets(e: ReelEvent): number[] {
  const j = e.job;
  if (j.op === 'pluck') return j.notes.map((n) => e.t + n.t);
  if (j.op === 'line') return j.notes.map((n) => e.t + n.t);
  if (j.op === 'kit') return j.hits.map((h) => e.t + h.t);
  return [e.t];
}
const allOnsets = (s: Score) => [...s.events.flatMap(onsets), ...s.sfx.map((c) => c.t)];
const sounding = (s: Score, t: number) => s.events.filter((e) => e.t <= t + 1e-9 && t < e.t + e.dur - 1e-9);

/**
 * The audible sync hits the spec fixes (§3, §7.1): the score must answer each within ±10 ms. When
 * A's shots.ts lands, its HITS marked audible are checked the same way (below).
 */
const SPEC_HITS: Record<Cut, number[]> = {
  full: [
    0, 1.0, 3.1, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 9.0, 10.0, 11.0, 15.5, 16.4, 19.6, 22.5, 26.5, 27.5, 28.5, 29.5, 30.5, 31.5, 32.5,
    33.5, 36.5, 37.5, 38.5, 39.5, 43.6, 45.2, 49.2, 51.5, 52.5, 53.5, 54.5, 56.5, 57.5, 59.8, 60.1, 61.0, 61.5, 62.5, 64.5, 67.5,
    68.3, 73.5, 74.4, 74.9, 75.6, 76.0, 77.5, 77.8, 78.1, 79.5, 79.7, 80.2, 80.6, 81.5, 83.2, 83.5, 83.8, 84.0, 84.8,
  ],
  short: [
    0, 1.0, 3.1, 7.0, 9.0, 15.5, 16.4, 22.5, 26.5, 32.5, 33.5, 36.5, 39.5, 43.6, 45.2, 49.2, 49.9, 50.4, 50.5, 51.5, 54.6,
    55.4, 57.2, 58.2, 59.5, 64.3, 64.5, 65.0, 65.4, 66.3, 68.0, 68.3, 68.6, 68.8, 69.6,
  ],
};

describe('the score: bounds, key, voices', () => {
  for (const cut of CUTS_) {
    const s = S[cut];
    it(`${cut}: every event and cue lies in [0, END] (${END[cut]} s)`, () => {
      expect(s.end).toBe(END[cut]);
      expect(s.acts).toEqual(ACTS[cut]);
      for (const e of s.events) {
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t + e.dur).toBeLessThanOrEqual(s.end + 1e-6);
        expect(Number.isFinite(e.gain) && e.gain > 0 && e.gain <= 1.5).toBe(true);
      }
      for (const c of s.sfx) expect(c.t >= 0 && c.t < s.end).toBe(true);
    });

    it(`${cut}: never more than ${MAX_VOICES} voices (and the ≤ 16 target) at once`, () => {
      let peak = 0;
      for (let t = 0; t < s.end; t += 0.01) peak = Math.max(peak, sounding(s, t).length);
      expect(peak).toBeLessThanOrEqual(16);
      expect(peak).toBeLessThanOrEqual(MAX_VOICES);
    });

    it(`${cut}: every pitched note is in 宫 F pentatonic (F G A C D)`, () => {
      let n = 0;
      for (const e of s.events) for (const x of e.notes ?? []) { expect(PENT.has(((Math.round(x.midi) % 12) + 12) % 12)).toBe(true); n++; }
      for (const e of s.events) {
        const j = e.job;
        const fs = j.op === 'pluck' || j.op === 'line' ? j.notes.map((x) => x.freq) : j.op === 'sheng' ? j.freqs : j.op === 'ling' || j.op === 'temple' ? [j.freq] : [];
        for (const f of fs) { const m = Math.round(69 + 12 * Math.log2(f / 440)); expect(PENT.has(((m % 12) + 12) % 12)).toBe(true); n++; }
      }
      expect(n).toBeGreaterThan(200);
    });

    it(`${cut}: only the instruments the spec names (no 唢呐)`, () => {
      const ok = new Set(['qin', 'harm', 'zheng', 'pipa', 'xiao', 'dizi', 'erhu', 'sheng', 'drum', 'wood', 'gong', 'ling', 'temple', 'bo']);
      for (const e of s.events) expect(ok.has(e.inst)).toBe(true);
      const used = new Set(s.events.map((e) => e.inst));
      for (const i of ['qin', 'harm', 'zheng', 'pipa', 'xiao', 'dizi', 'erhu', 'sheng', 'drum', 'wood', 'gong', 'ling']) expect(used.has(i as never)).toBe(true);
    });

    it(`${cut}: each act's events start inside the act`, () => {
      const acts = scoreActs(cut);
      expect(acts.map((a) => a.start)).toEqual(ACTS[cut]);
      acts.forEach((a, i) => {
        const next = i + 1 < acts.length ? acts[i + 1].start : END[cut];
        for (const e of a.events) { expect(e.t).toBeGreaterThanOrEqual(a.start - 1e-9); expect(e.t).toBeLessThan(next); }
        for (const c of a.sfx) { expect(c.t).toBeGreaterThanOrEqual(a.start - 1e-9); expect(c.t).toBeLessThan(next); }
      });
    });

    it(`${cut}: every spec HIT has an event or sfx cue within ±10 ms`, () => {
      const on = allOnsets(s);
      const miss = SPEC_HITS[cut].filter((t) => !on.some((x) => near(x, t)));
      expect(miss).toEqual([]);
    });

    it(`${cut}: every audible HIT in A's shots.ts has an event or cue within ±10 ms, and the acts agree`, () => {
      const on = allOnsets(s);
      const audible = HITS[cut].filter((h) => h.audible !== false);
      expect(audible.length).toBeGreaterThan(30);
      const miss = audible.filter((h) => !on.some((x) => near(x, h.t))).map((h) => `${h.t} ${h.id}`);
      expect(miss).toEqual([]);
      expect(SHOT_ACTS[cut]).toEqual(ACTS[cut]);
      expect(SHOT_CUTS[cut].end).toBe(END[cut]);
      // and the spec's own list (§3, §7.1) is covered by A's table or is a score-only moment
      for (const h of HITS[cut]) expect(h.t).toBeLessThanOrEqual(END[cut]);
    });
  }

  it('both cuts share 起 and 承 (0–49.2) exactly', () => {
    const cut = (s: Score) => JSON.stringify({ e: s.events.filter((e) => e.t < 49.2), c: s.sfx.filter((c) => c.t < 49.2) });
    expect(cut(S.short)).toBe(cut(S.full));
  });

  it('the tail cue fits the 2.5 s tail', () => {
    const ev = tailCue();
    expect(ev.map((e) => e.inst).sort()).toEqual(['gong', 'qin', 'sheng']);
    for (const e of ev) { expect(e.t).toBeGreaterThanOrEqual(0); expect(e.t + e.dur).toBeLessThanOrEqual(2.5); }
    expect(TAIL_CHOKE).toBeLessThanOrEqual(2.5 - 0.4 + 1e-9);
    const f2 = ev.find((e) => e.inst === 'qin')!;
    expect(f2.notes?.[0].midi).toBe(P.F2);
  });
});

describe('the poem plays its own 平仄', () => {
  it('pins the tones', () => {
    expect(PINGZE).toEqual({ Q1: '仄仄平平仄仄平', Q3a: '仄平仄仄平平仄', Q3b: '仄仄平平仄仄平' });
  });

  it('maps 平 to 宫/徵 and 仄 to 商/羽, alternating; a final 平 resolves, a final 仄 hangs', () => {
    const q1 = pingze(PINGZE.Q1).map((n) => n.midi);
    expect(q1).toEqual([[P.G4], [P.D5], [P.F3], [P.C4], [P.G4], [P.D5], [P.F3, P.F2]]);
    expect(pingze(PINGZE.Q3b).map((n) => n.midi)).toEqual(q1);
    const q3a = pingze(PINGZE.Q3a);
    expect(q3a.map((n) => n.midi)).toEqual([[P.G4], [P.F3], [P.D5], [P.G4], [P.C4], [P.F3], [P.D5]]);
    const last = q3a[6];
    expect(last.vib).toBe(true);
    expect(last.ring).toBeGreaterThanOrEqual(1.3);
    for (const n of pingze(PINGZE.Q1).slice(0, 6)) {
      if (n.tone === '平') { expect(n.long).toBe(true); expect(n.vel).toBe(0.5); } else { expect(n.long).toBe(false); expect(n.vel).toBe(0.35); }
    }
  });

  for (const cut of CUTS_) {
    it(`${cut}: one 古琴 pluck per glyph, at its ink-in; Q1 and Q3b end on 宫 + the open string, Q3a on 羽 with 吟`, () => {
      const s = S[cut];
      const qinNotes = s.events.filter((e) => e.job.op === 'pluck' && e.inst === 'qin').flatMap((e) => (e.job.op === 'pluck' ? e.job.notes.map((n) => ({ t: e.t + n.t, m: Math.round(69 + 12 * Math.log2(n.freq / 440)), vib: !!n.vib, e })) : []));
      for (const [k, at] of Object.entries(QUOTE_AT) as [keyof typeof PINGZE, number][]) {
        const want = pingze(PINGZE[k]);
        want.forEach((n, i) => {
          const t = at + i * GLYPH_STEP;
          const got = qinNotes.filter((x) => near(x.t, t) && x.m === n.midi[0]);
          expect(got.length, `${k} glyph ${i} at ${t.toFixed(2)}`).toBe(1);
          if (i === 6 && n.tone === '仄') expect(got[0].vib).toBe(true);
        });
        const lastT = at + 6 * GLYPH_STEP;
        if (k !== 'Q3a') {
          // the open string F2 sounds with the final F3 (Q1's is the naming's pluck at 15.5)
          expect(qinNotes.some((x) => x.m === P.F2 && Math.abs(x.t - lastT) <= 0.03)).toBe(true);
        }
      }
    });

    it(`${cut}: the question hangs — nothing else starts or sounds 44.92–45.2`, () => {
      const s = S[cut];
      const hang = QUOTE_AT.Q3a + 6 * GLYPH_STEP;
      for (const e of s.events) {
        if (e.inst === 'qin' && e.t >= QUOTE_AT.Q3a - 1e-9 && e.t < hang) continue; // the Q3a column itself
        for (const t of onsets(e)) expect(t > hang + 1e-6 && t < QUOTE_AT.Q3b - 1e-6, `onset ${t}`).toBe(false);
        if (e.t < hang - 1e-6) expect(e.t + e.dur, `${e.inst} at ${e.t}`).toBeLessThanOrEqual(hang + 1e-6);
      }
      for (const c of s.sfx) expect(c.t > hang && c.t < QUOTE_AT.Q3b).toBe(false);
    });
  }
});

describe('the lapse, the drip, the cuts', () => {
  for (const cut of CUTS_) {
    const s = S[cut];
    it(`${cut}: 33.5–36.3 is one 二胡 note sliding 角 A4 → 商 G4, and nothing else`, () => {
      const inWin = s.events.filter((e) => e.t < 36.3 && e.t + e.dur > 33.5);
      expect(inWin.length).toBe(1);
      const e = inWin[0];
      expect(e.inst).toBe('erhu');
      expect(e.t).toBe(33.5);
      expect(e.job.op === 'line' && e.job.notes.map((n) => [n.t, n.dur, Math.round(69 + 12 * Math.log2(n.freq / 440)), !!n.slide])).toEqual([[0, 1.8, P.A4, false], [1.8, 1.0, P.G4, true]]);
      expect(s.sfx.filter((c) => c.t >= 33.5 && c.t < 36.5)).toEqual([]);
      expect(s.events.filter((e2) => e2.inst === 'wood' && e2.t >= 33.5 && e2.t < 36.5)).toEqual([]);
    });

    it(`${cut}: the drip returns identically (0.0 and ${cut === 'full' ? 67.5 : 54.6})`, () => {
      const drips = s.sfx.filter((c): c is Extract<SfxCue, { kind: 'drip' }> => c.kind === 'drip');
      const a = drips.find((c) => c.t === 0)!, b = drips.find((c) => near(c.t, cut === 'full' ? 67.5 : 54.6))!;
      expect(a.by).toBe('gate');
      expect([b.pitch, b.gain]).toEqual([a.pitch, a.gain]);
      expect(b.by).toBeUndefined();
      expect(drips.filter((c) => c.t > 0 && c.t !== b.t).map((c) => c.pitch).every((p) => p < 1)).toBe(true); // the plop and the splash are lower
    });

    it(`${cut}: the check-in chimes follow the streaks (#1 … #66, the reset to 1)`, () => {
      const ch = s.sfx.filter((c): c is Extract<SfxCue, { kind: 'chime' }> => c.kind === 'chime').map((c) => [c.t, c.streak]);
      expect(ch).toEqual([[22.5, 1], [26.5, 2], [27.5, 3], [28.5, 6], [29.5, 13], [30.5, 22], [31.5, 31], [32.5, 39], [36.5, 1], [37.5, 11], [38.5, 20], [39.5, 27]]);
      for (const [t] of ch) expect(s.events.some((e) => e.inst === 'wood' && near(e.t, t as number))).toBe(true);
    });

    it(`${cut}: every stream bed is restored`, () => {
      const beds = s.sfx.filter((c): c is Extract<SfxCue, { kind: 'ambient' }> => c.kind === 'ambient');
      for (let i = 0; i < beds.length; i += 2) { expect(beds[i].bed).toBe('stream'); expect(beds[i + 1]?.bed).toBe('restore'); }
    });
  }

  it('full: the hard cut on the sneeze (60.5) and the comic rest (63.5) are silent', () => {
    const s = S.full;
    for (const e of s.events) if (e.t < 60.5) expect(e.t + e.dur).toBeLessThanOrEqual(60.5 + 1e-6);
    expect(allOnsets(s).filter((t) => t > 60.5 && t < 60.6)).toEqual([]);
    expect(allOnsets(s).filter((t) => Math.abs(t - 63.5) < 0.2)).toEqual([]);
    const bo = s.events.find((e) => e.inst === 'bo' && near(e.t, 60.1))!;
    expect(bo.until! - bo.t).toBeCloseTo(0.12, 5); // choked
  });

  it('short: the 转′ window act has no mirror fight, and a knock at 50.5', () => {
    const s = S.short;
    const win = s.events.filter((e) => e.t >= 49.2 && e.t < 54.2);
    expect(win.some((e) => e.job.op === 'pluck' && e.job.tone === 'battle')).toBe(false);
    expect(win.some((e) => e.job.op === 'kit')).toBe(false);
    expect(win.filter((e) => e.inst === 'gong').length).toBe(2);
    expect(s.sfx.find((c) => c.kind === 'knock')?.t).toBe(50.5);
    for (const e of win) expect(e.t + e.dur).toBeLessThanOrEqual(54.0 + 1e-6); // silence from 54.0
    const full = S.full.events.filter((e) => e.t >= 50.6 && e.t < 55.6);
    expect(full.some((e) => e.job.op === 'pluck' && e.job.tone === 'battle')).toBe(true);
  });

  it('short: 合′ is the full cut\'s S12 shifted by −15.2 s', () => {
    const tail = (s: Score, from: number, d: number) => s.events.filter((e) => e.t >= from).map((e) => [+(e.t + d).toFixed(2), e.inst, e.gain]);
    expect(tail(S.short, 64.3, 15.2)).toEqual(tail(S.full, 79.5, 0));
  });
});
