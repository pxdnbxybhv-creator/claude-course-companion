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

describe('水月幻镜 · the mirror themes', () => {
  // imported lazily so the module state (colour, wave clock) is reset per test
  const load = async () => {
    const T = await import('../src/audio/music-themes');
    T.setMirrorMusic({ colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0 });
    return T;
  };
  const COLOURS = ['lake', 'forest', 'palace'] as const;
  const PERC = new Set(['drum', 'wood', 'gong', 'bo', 'ling']);
  /** Arrange `n` phrases; `before(i)` may set the state before each one is composed. */
  const run = async (id: ThemeId, colour: (typeof COLOURS)[number], n: number, before?: (i: number) => void) => {
    const T = await load();
    T.setMirrorColour(colour);
    const c = new Composer(T.THEMES[id].style, daySeed(id, '2026-09-27'));
    const r = makeRng(11);
    return Array.from({ length: n }, (_, i) => {
      before?.(i);
      const p = c.next();
      const evs = arrange(id, p, r, 100 + i);
      return { p, evs, secs: phraseSeconds(p), tier: T.mirrorTier(p) };
    });
  };

  it('waves are 羽 or 商 at 118–138 bpm, bosses faster, the shop calm (≈ 88) — all 宫 on F', async () => {
    const T = await load();
    for (const colour of COLOURS) {
      T.setMirrorColour(colour);
      const wave = T.THEMES.mirror.style, boss = T.THEMES['mirror-boss'].style, calm = T.THEMES['mirror-calm'].style;
      for (const m of wave.modes) expect([1, 4], `${colour} wave mode`).toContain(m.final);
      expect(wave.bpm[0]).toBeGreaterThanOrEqual(118);
      expect(wave.bpm[1] * 1.04).toBeLessThanOrEqual(138); // the tight last 10 s included
      expect(boss.bpm[0]).toBeGreaterThan(wave.bpm[1]);
      expect(calm.bpm[0]).toBeGreaterThanOrEqual(84);
      expect(calm.bpm[1]).toBeLessThanOrEqual(92);
      for (const s of [wave, boss, calm]) for (const m of s.modes) expect(gongPc(m)).toBe(5);
    }
    // three colours, three different bands
    const styles = COLOURS.map((c) => { T.setMirrorColour(c); return T.THEMES.mirror.style; });
    expect(new Set(styles).size).toBe(3);
  });

  it('phrases are squared to whole bars at the theme tempo, so the groove never skips across phrases', async () => {
    for (const id of ['mirror', 'mirror-boss', 'mirror-calm'] as ThemeId[]) {
      for (const colour of COLOURS) {
        for (const { p, evs, secs } of await run(id, colour, 8)) {
          expect(p.beats % 4, `${id} ${colour}`).toBe(0);
          expect(p.beats).toBeGreaterThan(p.end);
          for (const e of evs) expect(e.t).toBeLessThan(secs);
          // the pulse runs through the breath: a drum on every bar
          const spb = 60 / p.bpm;
          for (let b = id === 'mirror-boss' && p.index === 0 ? 1 : 0; b < p.beats / 4; b++) {
            expect(evs.some((e) => e.inst === 'drum' && Math.abs(e.t - b * 4 * spb) < 0.02), `${id} ${colour} bar ${b}`).toBe(true);
          }
        }
      }
    }
  });

  it('a wave builds: drums → bass → 琵琶 → lead, one layer per phrase until the clock is known', async () => {
    for (const colour of COLOURS) {
      const ph = await run('mirror', colour, 6);
      expect(ph.map((x) => x.tier)).toEqual([0, 1, 2, 3, 3, 3]);
      const insts = ph.map((x) => new Set(x.evs.map((e) => e.inst)));
      const bass = colour === 'forest' ? 'pipa' : 'zheng';
      expect([...insts[0]].every((i) => PERC.has(i)), `${colour} phrase 0: drums only`).toBe(true);
      expect(insts[1].has(bass)).toBe(true);
      expect(insts[2].has('pipa')).toBe(true);
      expect(insts[3].has(colour === 'forest' ? 'suona' : 'dizi')).toBe(true);
      // the first phrase opens with the fill: a rising 堂鼓 roll in bar 0, then 钹 + 大锣 on bar 1
      const spb = 60 / ph[0].p.bpm;
      const roll = ph[0].evs.filter((e) => e.key?.startsWith('drum:tang') && e.t >= 2 * spb - 0.02 && e.t < 4 * spb - 0.02);
      expect(roll.length).toBe(8);
      expect(roll[7].gain).toBeGreaterThan(roll[0].gain);
      expect(ph[0].evs.some((e) => e.inst === 'bo' && Math.abs(e.t - 4 * spb) < 0.02)).toBe(true);
      expect(ph[0].evs.some((e) => e.key?.startsWith('gong:daluo') && Math.abs(e.t - 4 * spb) < 0.02)).toBe(true);
      // density climbs with the layers (events per second)
      const rate = ph.map((x) => x.evs.length / x.secs);
      expect(rate[3]).toBeGreaterThan(rate[0] * 1.5);
    }
  });

  it('the wave clock drives the layers, the last 10 s tighten, danger pushes a layer up', async () => {
    const T = await load();
    const p = { index: 5 } as Parameters<typeof T.mirrorTier>[0];
    const at = (left: number, danger = 0) => T.mirrorTier(p, { colour: 'lake', left, total: 60, danger, bossPhase: 0 });
    expect(at(60)).toBe(1); // heard ≈ 7 s in
    expect(at(40)).toBe(3);
    expect(at(16)).toBe(4); // the phrase composed now is heard in the last 10 s
    expect(at(40, 0.8)).toBe(4);
    expect(at(60, 0.8)).toBe(2);
    expect(T.mirrorTier({ index: 0 } as typeof p, { colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0 })).toBe(0);
    // tight: faster, 16th 板, 小锣 on the backbeat, the lead doubled
    const base = await run('mirror', 'lake', 5, (i) => { if (i === 4) T.setMirrorMusic({ left: 40, total: 60 }); });
    const tight = await run('mirror', 'lake', 5, (i) => { if (i === 4) T.setMirrorMusic({ left: 12, total: 60 }); });
    const [b, t] = [base[4], tight[4]];
    expect(b.tier).toBe(3);
    expect(t.tier).toBe(4);
    expect(t.p.bpm).toBeGreaterThan(b.p.bpm);
    expect(t.evs.length / t.secs).toBeGreaterThan((b.evs.length / b.secs) * 1.2);
    expect(t.evs.some((e) => e.key?.startsWith('gong:xiaoluo'))).toBe(true);
    expect(t.evs.some((e) => e.inst === 'suona')).toBe(true);
    // state is clamped and non-finite input ignored
    T.setMirrorMusic({ danger: 7, left: -3, total: Number.NaN });
    expect(T.getMirrorMusic().danger).toBe(1);
    expect(T.getMirrorMusic().left).toBe(0);
    expect(T.getMirrorMusic().total).toBe(60);
  });

  it('a boss opens with a 大鼓 roll into the 大锣, and each phase steps it up', async () => {
    for (const colour of COLOURS) {
      const T = await load();
      const p0 = await run('mirror-boss', colour, 3);
      const first = p0[0], spb = 60 / first.p.bpm;
      expect(first.p.notes[0].beat).toBeGreaterThanOrEqual(4); // the tune waits for the roll
      const roll = first.evs.filter((e) => e.key?.startsWith('drum:big') && e.t < 4 * spb - 0.02);
      expect(roll.length).toBe(8);
      expect(first.evs.some((e) => e.key?.startsWith('gong:daluo') && Math.abs(e.t - 4 * spb) < 0.02)).toBe(true);
      expect(p0.every((x) => x.evs.some((e) => e.inst === 'suona' && e.prio === 0))).toBe(true);
      const p2 = await run('mirror-boss', colour, 3, () => T.setMirrorMusic({ bossPhase: 2 }));
      expect(p2[1].p.bpm).toBeGreaterThan(p0[1].p.bpm);
      expect(p2[1].evs.length / p2[1].secs).toBeGreaterThan(p0[1].evs.length / p0[1].secs);
      expect(p2[1].p.bpm).toBeLessThanOrEqual(152);
    }
  });

  it('the shop keeps a pulse but stays light', async () => {
    for (const colour of COLOURS) {
      const calm = await run('mirror-calm', colour, 8);
      const wave = await run('mirror', colour, 8);
      const rate = (xs: typeof calm) => xs.reduce((a, x) => a + x.evs.length, 0) / xs.reduce((a, x) => a + x.secs, 0);
      expect(rate(calm)).toBeLessThan(rate(wave) * 0.6);
      for (const { evs } of calm) expect(evs.some((e) => e.key?.startsWith('drum:big'))).toBe(true);
    }
  });

  it('stays inside the voice budget: at most 24 sounding at once, melodic layers never dropped', async () => {
    const { runMusicJob } = await import('../src/audio/music-dsp');
    const lens = new Map<string, number>();
    const len = (e: import('../src/audio/music-themes').MusicEvent) => {
      const k = e.key ?? JSON.stringify(e.job).slice(0, 200) + e.t;
      if (!lens.has(k)) lens.set(k, runMusicJob(8000, e.job)[0].length / 8000);
      return lens.get(k)! / (e.rate ?? 1);
    };
    const T = await load();
    for (const [id, colour, set] of [['mirror', 'palace', { left: 12, total: 60 }], ['mirror', 'forest', { left: 12, total: 60 }], ['mirror-boss', 'lake', { bossPhase: 1 }]] as const) {
      const ph = await run(id, colour, 6, () => T.setMirrorMusic(set));
      const evs: { at: number; e: import('../src/audio/music-themes').MusicEvent }[] = [];
      let t = 0;
      for (const x of ph) { for (const e of x.evs) evs.push({ at: t + e.t, e }); t += x.secs; }
      evs.sort((a, b) => a.at - b.at);
      const spans: [number, number][] = [];
      let dropped1 = 0;
      for (const { at, e } of evs) {
        const conc = spans.filter(([s, x]) => s <= at && at < x).length;
        if (e.prio > 0 && conc >= 24 - (e.prio === 2 ? 4 : 0)) { if (e.prio === 1 && e.inst !== 'drum' && e.inst !== 'gong' && e.inst !== 'bo') dropped1++; continue; }
        spans.push([at, at + len(e)]);
      }
      expect(dropped1, `${id} ${colour}`).toBe(0);
    }
  });

  it('the clear cue is a 钹 and a 大鼓', async () => {
    const T = await load();
    const cue = T.mirrorCue('clear');
    expect(cue.map((e) => e.inst).sort()).toEqual(['bo', 'drum']);
    for (const e of cue) { expect(e.t).toBe(0); expect(e.key).toBeTruthy(); expect(e.gain).toBeLessThanOrEqual(1); }
  });
});
