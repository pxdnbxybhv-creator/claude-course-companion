import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import {
  Composer, cadence, dayKey, daySeed, degreeToMidi, developMotif, fold, gongPc, halfCadence, makeMotif, makeRhythm,
  modeSteps, nearestOctave, relatedMode, stepName, type MNote, type Style,
} from '../src/audio/music-theory';
import { THEMES, arrange, phraseSeconds, type ThemeId } from '../src/audio/music-themes';
import { renderDrum, renderGong, renderLine, renderPlucks, renderSheng } from '../src/audio/music-dsp';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

describe('pentatonic modes', () => {
  it('rotates 宫商角徵羽 to each final', () => {
    expect(modeSteps(0)).toEqual([0, 2, 4, 7, 9]); // 宫: C D E G A
    expect(modeSteps(1)).toEqual([0, 2, 5, 7, 10]); // 商: D E G A C
    expect(modeSteps(2)).toEqual([0, 3, 5, 8, 10]); // 角: E G A C D
    expect(modeSteps(3)).toEqual([0, 2, 5, 7, 9]); // 徵: G A C D E
    expect(modeSteps(4)).toEqual([0, 3, 5, 7, 10]); // 羽: A C D E G
  });

  it('maps degrees to MIDI across octaves and names the steps', () => {
    const yu = { tonic: 57, final: 4 }; // 羽 on A3, 宫 = C
    expect([-1, 0, 1, 2, 3, 4, 5].map((d) => degreeToMidi(yu, d))).toEqual([55, 57, 60, 62, 64, 67, 69]);
    expect([0, 1, 2, 3, 4, 5].map((d) => stepName(yu, d))).toEqual(['羽', '宫', '商', '角', '徵', '羽']);
    expect(gongPc(yu)).toBe(0);
    expect(gongPc({ tonic: 62, final: 3 })).toBe(7); // 徵 on D → 宫 = G
  });

  it('every degree of every mode is a pentatonic note of its 宫', () => {
    for (let final = 0; final < 5; final++) {
      const mode = { tonic: 60 + final, final };
      const gong = gongPc(mode);
      for (let d = -7; d <= 12; d++) {
        const pc = (((degreeToMidi(mode, d) - gong) % 12) + 12) % 12;
        expect([0, 2, 4, 7, 9]).toContain(pc);
      }
    }
  });

  it('half cadences fall on the fifth, or the fourth in 角', () => {
    expect([0, 1, 2, 3, 4].map(halfCadence)).toEqual([3, 3, 2, 3, 3]);
  });

  it('同宫 modulation keeps the 宫 and moves the tonic by less than a tritone', () => {
    const m = { tonic: 62, final: 0 };
    for (const f of [1, 2, 3, 4]) {
      const r = relatedMode(m, f);
      expect(gongPc(r)).toBe(gongPc(m));
      expect(r.final).toBe(f);
      expect(Math.abs(r.tonic - m.tonic)).toBeLessThanOrEqual(6);
    }
  });
});

describe('phrase building blocks', () => {
  const style = THEMES.lake.style;

  it('folds degrees back into range', () => {
    expect(fold(10, 0, 8)).toBe(6);
    expect(fold(-3, 0, 8)).toBe(3);
    expect(fold(4, 0, 8)).toBe(4);
  });

  it('rhythms fill the motif exactly', () => {
    const r = makeRng(3);
    for (let i = 0; i < 50; i++) {
      const rh = makeRhythm(style.cells, 4, r);
      expect(rh.reduce((a, b) => a + b, 0)).toBeCloseTo(4, 6);
    }
  });

  it('motifs stay coherent as they develop', () => {
    const r = makeRng(9);
    let m = makeMotif(style, r);
    for (let i = 0; i < 40; i++) {
      m = developMotif(m, style, r);
      expect(m.rhythm.length).toBe(m.steps.length);
      expect(m.steps[0]).toBe(0);
      expect(m.rhythm.reduce((a, b) => a + b, 0)).toBeCloseTo(style.motifBeats, 6);
    }
  });

  it('cadences approach the target by step and hold it', () => {
    const s: Style = { ...style, range: [0, 8], cadenceBeats: 3 };
    const notes: MNote[] = [{ beat: 0, dur: 1, deg: 7, vel: 0.7 }];
    cadence(notes, 0, s, 0.6);
    const last = notes[notes.length - 1], prev = notes[notes.length - 2];
    expect(((last.deg % 5) + 5) % 5).toBe(0);
    expect(last.cad).toBe(true);
    expect(last.dur).toBe(3);
    expect(Math.abs(prev.deg - last.deg)).toBeLessThanOrEqual(2);
    expect(nearestOctave(0, 7, 0, 8)).toBe(5);
  });
});

describe('composer', () => {
  it('is deterministic for a seed and visit', () => {
    for (const id of THEME_IDS) {
      const a = new Composer(THEMES[id].style, 1234, 2), b = new Composer(THEMES[id].style, 1234, 2);
      for (let i = 0; i < 12; i++) expect(a.next()).toEqual(b.next());
    }
  });

  it('different days give different tunes', () => {
    const s = THEMES.garden.style;
    const tune = (seed: number) => JSON.stringify(Array.from({ length: 4 }, () => new Composer(s, seed).next().notes.map((n) => n.deg)));
    expect(daySeed('garden', '2026-09-25')).not.toBe(daySeed('garden', '2026-09-26'));
    expect(daySeed('garden', '2026-09-25')).not.toBe(daySeed('lake', '2026-09-25'));
    expect(tune(daySeed('garden', '2026-09-25'))).not.toBe(tune(daySeed('garden', '2026-09-26')));
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('builds 起承转合 periods that come home to the final', () => {
    for (const id of THEME_IDS) {
      const c = new Composer(THEMES[id].style, daySeed(id, '2026-09-25'));
      const roles: string[] = [];
      for (let i = 0; i < 24; i++) {
        const p = c.next();
        roles.push(p.role);
        const [lo, hi] = THEMES[id].style.range;
        expect(p.notes.length).toBeGreaterThan(0);
        for (const n of p.notes) {
          expect(n.deg).toBeGreaterThanOrEqual(lo);
          expect(n.deg).toBeLessThanOrEqual(hi);
          expect(n.dur).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
        // monophonic: onsets increase, no overlaps
        for (let k = 1; k < p.notes.length; k++) expect(p.notes[k].beat).toBeGreaterThanOrEqual(p.notes[k - 1].beat + p.notes[k - 1].dur - 1e-6);
        const last = p.notes[p.notes.length - 1];
        expect(last.cad).toBe(true);
        if (p.role === 'he') expect(((last.deg % 5) + 5) % 5).toBe(0); // 合 ends on the final
        if (p.role === 'qi') expect(((last.deg % 5) + 5) % 5).not.toBe(0); // 起 stays open
        expect(p.beats).toBeGreaterThan(p.end); // a breath after every phrase
        // at most a step or a small leap into the cadence
        if (p.notes.length > 1) expect(Math.abs(last.deg - p.notes[p.notes.length - 2].deg)).toBeLessThanOrEqual(4);
      }
      expect(roles.slice(0, 8)).toEqual(['qi', 'cheng', 'zhuan', 'he', 'qi', 'cheng', 'zhuan', 'he']);
    }
  });

  it('never loops: phrases keep changing over a long session', () => {
    for (const id of ['garden', 'village', 'lake'] as ThemeId[]) {
      const c = new Composer(THEMES[id].style, 77);
      const sigs = Array.from({ length: 64 }, () => { const p = c.next(); return `${p.mode.tonic}/${p.notes.map((n) => `${n.deg}:${n.dur}`).join(',')}`; });
      expect(new Set(sigs).size).toBeGreaterThan(40);
      // no 8-phrase window repeats
      const windows = new Set<string>();
      for (let i = 0; i + 8 <= sigs.length; i++) windows.add(sigs.slice(i, i + 8).join('|'));
      expect(windows.size).toBe(sigs.length - 7);
    }
  });
});

describe('arrangements', () => {
  it('every theme arranges playable, bounded layers', () => {
    for (const id of THEME_IDS) {
      const c = new Composer(THEMES[id].style, 99);
      const r = makeRng(5);
      let total = 0, secs = 0;
      for (let i = 0; i < 8; i++) {
        const p = c.next();
        const evs = arrange(id, p, r, 42 + i);
        secs += phraseSeconds(p);
        total += evs.length;
        for (const e of evs) {
          expect(e.t).toBeGreaterThanOrEqual(0);
          expect(e.t).toBeLessThan(phraseSeconds(p) + 1);
          expect(e.gain).toBeGreaterThan(0);
          expect(e.gain).toBeLessThanOrEqual(1);
          expect(Math.abs(e.pan)).toBeLessThanOrEqual(1);
          for (const n of e.notes ?? []) { expect(n.midi).toBeGreaterThan(24); expect(n.midi).toBeLessThan(110); }
        }
        if (id !== 'quiet' && id !== 'night') expect(evs.some((e) => e.prio === 0)).toBe(true);
      }
      expect(total).toBeGreaterThan(0);
      expect(secs).toBeGreaterThan(20);
    }
  });

  it('is deterministic', () => {
    const run = () => { const c = new Composer(THEMES.festival.style, 5); const r = makeRng(1); return JSON.stringify([0, 1, 2, 3].map((i) => arrange('festival', c.next(), r, i))); };
    expect(run()).toBe(run());
  });
});

describe('instruments', () => {
  const sr = 16000;
  const ok = (x: Float32Array, maxPeak = 0.95) => {
    let peak = 0, sum = 0;
    for (const v of x) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); sum += v; }
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThan(maxPeak);
    expect(Math.abs(sum / x.length)).toBeLessThan(0.01);
  };

  it('renders every line instrument cleanly', () => {
    for (const inst of ['xiao', 'dizi', 'erhu', 'suona'] as const) {
      const x = renderLine(sr, inst, [
        { t: 0, dur: 0.6, freq: 440, vel: 0.7 },
        { t: 0.6, dur: 0.4, freq: 494, vel: 0.6, slide: true },
        { t: 1.1, dur: 1, freq: 587, vel: 0.8, grace: 659 },
      ], 3);
      ok(x);
      expect(x.length / sr).toBeGreaterThan(2.1);
    }
  });

  it('renders plucks, tremolo, pads and percussion', () => {
    const [L, R] = renderPlucks(sr, 'pipa', [{ t: 0, freq: 330, vel: 0.7, trem: 0.6 }, { t: 0.8, freq: 440, vel: 0.6, pan: 0.5 }], 1);
    ok(L); ok(R);
    const [zl] = renderPlucks(sr, 'zheng', [{ t: 0, freq: 294, vel: 0.7, bend: [{ at: 0.2, cents: 200, time: 0.12 }] }], 2);
    ok(zl, 1.2);
    const [sl, sr2] = renderSheng(sr, [196, 294, 392], 3, 0.7, 4, 1);
    ok(sl); ok(sr2);
    ok(renderDrum(sr, 'tang', 1));
    ok(renderGong(sr, 'da', 1));
    ok(renderGong(sr, 'xiao', 2));
  });
});

describe('themes share the key of the sound effects', () => {
  it('every theme mode has its 宫 on F, and modulation stays near home', async () => {
    const { THEMES } = await import('../src/audio/music-themes');
    const { MUSIC_GONG_PC, relatedMode } = await import('../src/audio/music-theory');
    for (const [id, spec] of Object.entries(THEMES)) {
      for (const m of spec.style.modes) {
        expect(gongPc(m), `${id} ${JSON.stringify(m)}`).toBe(MUSIC_GONG_PC);
        let cur = m;
        for (let i = 0; i < 200; i++) {
          cur = relatedMode(cur, (i * 3 + 1) % 5, m.tonic);
          expect(Math.abs(cur.tonic - m.tonic)).toBeLessThanOrEqual(6);
          expect(gongPc(cur)).toBe(MUSIC_GONG_PC);
        }
      }
    }
  });
});

describe('桃源 · the valley theme', () => {
  it('is its own: 徵 mode, 60–68 bpm, 笛 over 古筝 and a 笙 pad, sent into the echo', () => {
    const s = THEMES.taoyuan;
    expect(s).not.toBe(THEMES.garden);
    expect(s.style.bpm[0]).toBeGreaterThanOrEqual(60);
    expect(s.style.bpm[1]).toBeLessThanOrEqual(68);
    for (const m of s.style.modes) expect(m.final).toBe(3);
    const c = new Composer(s.style, 7);
    const r = makeRng(3);
    const inst = new Set<string>();
    let echo = 0;
    for (let i = 0; i < 8; i++) for (const e of arrange('taoyuan', c.next(), r, i)) { inst.add(e.inst); echo = Math.max(echo, e.echo); }
    expect(inst.has('dizi')).toBe(true);
    expect(inst.has('zheng')).toBe(true);
    expect(inst.has('sheng')).toBe(true);
    expect(echo).toBeGreaterThan(0.1);
  });
});
