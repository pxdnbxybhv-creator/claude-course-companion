// 水月幻镜 · the battle score (src/audio/music-themes.ts: mirror, mirror-boss) measured the way a
// listener hears it: every layer rendered (8 kHz, the real instruments) and its energy tallied. The
// owner asked for combat music led by the winds, not the 古琴: the 笛/箫/唢呐 carry most of the melodic
// energy in every layer, the plucked strings only keep time, the lead sounds in (nearly) every bar, the
// 笛 sits in a flute's register. And the battle voices themselves: tongued chiff, 笛膜 buzz on loud
// notes only, 花舌, 叠音/打音/颤音, scoops — rendered cleanly.
import { describe, expect, it } from 'vitest';
import { makeRng, mixSeed } from '../src/core/rng';
import { Composer, daySeed } from '../src/audio/music-theory';
import { runMusicJob, renderDrum, renderKit, renderLine, renderPlucks, renderSheng, type LineNote } from '../src/audio/music-dsp';
import { filter, highpass } from '../src/audio/dsp';
import type { MusicEvent } from '../src/audio/music-themes';

const COLOURS = ['lake', 'forest', 'palace'] as const;
const WINDS = new Set(['dizi', 'xiao', 'suona']);
const PLUCK = new Set(['zheng', 'pipa', 'qin', 'harm']);
const PERC = new Set(['drum', 'wood', 'gong', 'bo', 'temple']);
const SR = 8000;

const energyOf = (() => {
  const memo = new Map<string, number>();
  return (e: MusicEvent) => {
    const k = e.key ?? '';
    let x = k ? memo.get(k) : undefined;
    if (x === undefined) {
      x = 0;
      for (const c of runMusicJob(SR, e.job)) for (let i = 0; i < c.length; i++) x += c[i] * c[i];
      if (k) memo.set(k, x);
    }
    return x * e.gain * e.gain;
  };
})();

/** A tier's phrases (the fill phrase skipped), 3 days × 4 phrases. */
async function tierEvents(colour: (typeof COLOURS)[number], left: number, days = 3, n = 4): Promise<MusicEvent[]> {
  const T = await import('../src/audio/music-themes');
  const out: MusicEvent[] = [];
  for (let d = 0; d < days; d++) {
    T.setMirrorMusic({ colour, left, total: 60, danger: 0, bossPhase: 0 });
    const seed = daySeed('mirror', `2026-09-2${d}`), cs = mixSeed(seed, 1);
    const comp = new Composer(T.THEMES.mirror.style, seed);
    const r = makeRng(mixSeed(cs, 0xa11));
    for (let i = 0; i <= n; i++) {
      const p = comp.next();
      const evs = T.arrange('mirror', p, r, mixSeed(cs, p.index));
      if (i) out.push(...evs);
    }
  }
  return out;
}

function shares(evs: MusicEvent[]) {
  let winds = 0, plucks = 0, mel = 0;
  for (const e of evs) {
    if (PERC.has(e.inst)) continue;
    const x = energyOf(e);
    mel += x;
    if (WINDS.has(e.inst)) winds += x;
    if (PLUCK.has(e.inst)) plucks += x;
  }
  return { winds: winds / mel, plucks: plucks / mel };
}

describe('水月幻镜 · the battle score, measured', () => {
  // left (s, of a 60 s wave) → tier 0 … 4 at compose time
  const TIERS: [number, number][] = [[62, 0], [55, 1], [43, 2], [30, 3], [12, 4]];

  it('the winds carry ≥ 45 % of the melodic energy in every layer; the plucked strings ≤ 25 %', async () => {
    const T = await import('../src/audio/music-themes');
    for (const colour of COLOURS) {
      for (const [left, tier] of TIERS) {
        T.setMirrorMusic({ colour, left, total: 60, danger: 0, bossPhase: 0 });
        expect(T.mirrorTier({ index: 3 } as never)).toBe(tier);
        const s = shares(await tierEvents(colour, left));
        expect(s.winds, `${colour} tier ${tier} winds`).toBeGreaterThanOrEqual(0.45);
        expect(s.plucks, `${colour} tier ${tier} plucks`).toBeLessThanOrEqual(0.25);
      }
    }
  }, 60_000);

  it('the bosses: the 唢呐 leads, the winds still carry the tune', async () => {
    const T = await import('../src/audio/music-themes');
    for (const colour of COLOURS) {
      for (const step of [0, 2]) {
        T.setMirrorMusic({ colour, left: null, total: null, danger: 0, bossPhase: step });
        const seed = daySeed('mirror-boss', '2026-09-27');
        const comp = new Composer(T.THEMES['mirror-boss'].style, seed);
        const r = makeRng(5);
        const evs: MusicEvent[] = [];
        for (let i = 0; i < 5; i++) { const p = comp.next(); const e = T.arrange('mirror-boss', p, r, i); if (i) evs.push(...e); }
        const s = shares(evs);
        expect(s.winds, `boss ${colour} ${step}`).toBeGreaterThanOrEqual(0.45);
        expect(s.plucks, `boss ${colour} ${step}`).toBeLessThanOrEqual(0.25);
        let suona = 0, other = 0;
        for (const e of evs) if (WINDS.has(e.inst)) (e.inst === 'suona' ? (suona += energyOf(e)) : (other += energyOf(e)));
        if (step === 0) expect(suona, `boss ${colour}: the 唢呐 is the loudest wind`).toBeGreaterThan(other * 0.6);
      }
    }
  }, 60_000);

  it('the 笛 plays in a flute\'s register (median ≥ A4, top ≤ E6) and the lead is there in ≥ 90 % of bars', async () => {
    const T = await import('../src/audio/music-themes');
    for (const colour of COLOURS) {
      const midis: number[] = [];
      let bars = 0, withLead = 0;
      for (const [left] of TIERS) {
        T.setMirrorMusic({ colour, left, total: 60, danger: 0, bossPhase: 0 });
        const seed = daySeed('mirror', '2026-09-23');
        const comp = new Composer(T.THEMES.mirror.style, seed, 1);
        const r = makeRng(9);
        for (let i = 0; i < 6; i++) {
          const p = comp.next();
          const evs = T.arrange('mirror', p, r, i);
          const spb = 60 / p.bpm;
          const spans: [number, number][] = [];
          for (const e of evs) {
            if (e.job.op !== 'line' || !WINDS.has(e.inst) || e.prio !== 0) continue;
            for (const n of e.job.notes) {
              spans.push([e.t + n.t, e.t + n.t + n.dur]);
              if (e.inst === 'dizi') midis.push(69 + 12 * Math.log2(n.freq / 440));
            }
          }
          for (let b = p.index === 0 ? 1 : 0; b < p.beats / 4; b++) {
            bars++;
            if (spans.some(([s, x]) => s < (b + 1) * 4 * spb && x > b * 4 * spb)) withLead++;
          }
        }
      }
      midis.sort((a, b) => a - b);
      expect(midis[midis.length >> 1], `${colour} median`).toBeGreaterThanOrEqual(69);
      expect(midis[midis.length - 1], `${colour} top`).toBeLessThanOrEqual(88.01);
      expect(midis[0], `${colour} bottom`).toBeGreaterThanOrEqual(66.99);
      expect(withLead / bars, colour).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('the battle tune drives: dotted rhythms, 吐音 repeated notes, upward 4th/5th leaps outnumber downward ones', async () => {
    const T = await import('../src/audio/music-themes');
    let up = 0, down = 0, dotted = 0, tu = 0, n = 0;
    for (const colour of COLOURS) {
      T.setMirrorMusic({ colour, left: 30, total: 60, danger: 0, bossPhase: 0 });
      const comp = new Composer(T.THEMES.mirror.style, daySeed('mirror', '2026-09-24'));
      const r = makeRng(2);
      for (let i = 0; i < 12; i++) {
        const p = comp.next();
        T.arrange('mirror', p, r, i);
        const ns = p.notes as import('../src/audio/music-themes').BattleNote[];
        ns.forEach((x, k) => {
          n++;
          if (x.dur === 0.75) dotted++;
          if (x.tu) tu++;
          const prev = ns[k - 1];
          if (prev && prev.v === x.v) { if (x.deg - prev.deg >= 2) up++; if (prev.deg - x.deg >= 2) down++; }
        });
      }
    }
    expect(up).toBeGreaterThan(down);
    expect(dotted / n).toBeGreaterThan(0.04);
    expect(tu / n).toBeGreaterThan(0.12);
  });
});

describe('the battle voices', () => {
  const sr = 16000;
  const ok = (x: Float32Array, maxPeak = 0.95) => {
    let peak = 0, sum = 0;
    for (const v of x) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); sum += v; }
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThan(maxPeak);
    expect(Math.abs(sum / x.length)).toBeLessThan(0.01);
  };
  const phrase: LineNote[] = [
    { t: 0, dur: 0.07, freq: 587, vel: 0.9, tongue: true },
    { t: 0.11, dur: 0.07, freq: 587, vel: 0.75, tongue: true },
    { t: 0.22, dur: 0.16, freq: 587, vel: 0.9, tongue: true },
    { t: 0.44, dur: 0.6, freq: 880, vel: 1, grace: 988, graceLen: 0.032, scoop: 60 },
    { t: 1.08, dur: 0.3, freq: 784, vel: 0.8, slide: true },
    { t: 1.4, dur: 0.9, freq: 698, vel: 0.9, tap: { at: 0.4, freq: 587 } },
    { t: 2.35, dur: 0.8, freq: 587, vel: 0.9, trill: 698 },
    { t: 3.2, dur: 1.4, freq: 880, vel: 1, flutter: 0.75 },
  ];

  it('every wind and the 二胡 render the articulations cleanly, gentle and loud', () => {
    for (const inst of ['dizi', 'xiao', 'suona', 'erhu'] as const) for (const loud of [false, true]) {
      const x = renderLine(sr, inst, phrase.map((n) => ({ ...n, freq: inst === 'dizi' ? n.freq : n.freq / 2 })), 4, loud);
      ok(x);
      expect(x.length / sr).toBeGreaterThan(4.6);
    }
    // the gentle voices (the garden themes) are untouched by the battle presets
    const plain: LineNote[] = [{ t: 0, dur: 0.6, freq: 440, vel: 0.7 }, { t: 0.6, dur: 0.4, freq: 494, vel: 0.6, slide: true }];
    expect(Array.from(renderLine(sr, 'dizi', plain, 3))).toEqual(Array.from(renderLine(sr, 'dizi', plain, 3, false)));
    expect(Array.from(renderLine(sr, 'dizi', plain, 3, true))).not.toEqual(Array.from(renderLine(sr, 'dizi', plain, 3)));
  });

  it('the battle 笛 is breathier and brighter; its 笛膜 buzz grows with the breath', () => {
    const hi = (x: Float32Array, f: number) => {
      const y = Float32Array.from(x); filter(y, highpass(44100, f, 0.7)); filter(y, highpass(44100, f, 0.7));
      let a = 0, b = 0; for (let i = 0; i < x.length; i++) { a += y[i] * y[i]; b += x[i] * x[i]; } return a / b;
    };
    const held = (vel: number): LineNote[] => [{ t: 0, dur: 1.5, freq: 587, vel }];
    const gentle = renderLine(44100, 'dizi', held(0.85), 5);
    const loud = renderLine(44100, 'dizi', held(0.85), 5, true);
    expect(hi(loud, 4000)).toBeGreaterThan(hi(gentle, 4000) * 1.8);
    // soft notes stay clean: the high share rises with the velocity
    expect(hi(renderLine(44100, 'dizi', held(1), 5, true), 4000)).toBeGreaterThan(hi(renderLine(44100, 'dizi', held(0.35), 5, true), 4000));
  });

  it('the kit, the hard drums, the 笙 stab and the battle plucks', () => {
    const [L, R] = renderKit(sr, [
      { t: 0, kind: 'big', gain: 0.6, pan: -0.1, v: 1 }, { t: 0.2, kind: 'tang', gain: 0.4, pan: 0.2, v: 2 },
      { t: 0.3, kind: 'rim', gain: 0.2, pan: 0.3, v: 1 }, { t: 0.4, kind: 'bang', gain: 0.12, pan: 0.45, v: 3, rate: 1.85 },
      { t: 0.5, kind: 'xiaoluo', gain: 0.1, pan: 0.4, v: 1 }, { t: 0.6, kind: 'bo', gain: 0.2, pan: 0.3, v: 2 }, { t: 0.7, kind: 'wood', gain: 0.1, pan: 0, v: 1 },
    ], true);
    ok(L, 1.2); ok(R, 1.2);
    expect(L.length / sr).toBeGreaterThan(1.5);
    const e300 = (x: Float32Array) => { const y = Float32Array.from(x); filter(y, highpass(sr, 300, 0.7)); filter(y, highpass(sr, 300, 0.7)); let a = 0, b = 0; for (let i = 0; i < x.length; i++) { a += y[i] * y[i]; b += x[i] * x[i]; } return a / b; };
    for (const k of ['big', 'tang'] as const) {
      ok(renderDrum(sr, k, 1, true));
      expect(e300(renderDrum(sr, k, 1, true)), k).toBeGreaterThan(e300(renderDrum(sr, k, 1)) * 3); // a phone hears the knock
    }
    const [sl, sr2] = renderSheng(sr, [294, 440, 587], 0.26, 0.8, 7, 0.2, true);
    ok(sl); ok(sr2);
    for (const inst of ['pipa', 'zheng'] as const) {
      const [pl] = renderPlucks(sr, inst, [{ t: 0, freq: 294, vel: 0.8 }, { t: 0.2, freq: 440, vel: 0.7, trem: 0.3 }], 3, true);
      ok(pl, 1.2);
    }
  });
});

// The fix round (QA of the battle score): the 笛 never shrieks, a phone hears the war drums, the shop
// between waves is sung by the winds, the tight 唢呐 doubles an octave below, the boss keeps its 箫,
// and the cues run in the band's tempo.
describe('水月幻镜 · the battle score, second pass', () => {
  const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);
  const month = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);

  it('the 笛 never climbs past E6 — wave leads and answers, boss lines — over a month of days', async () => {
    const T = await import('../src/audio/music-themes');
    for (const theme of ['mirror', 'mirror-boss'] as const) {
      for (const colour of COLOURS) {
        const ms: number[] = [];
        for (const day of month) {
          const states = theme === 'mirror' ? [{ left: 56, total: 60 }, { left: 30, total: 60 }, { left: 12, total: 60 }] : [{ bossPhase: 1 }, { bossPhase: 2 }];
          for (const st of states) {
            T.setMirrorMusic({ colour, danger: 0, bossPhase: 0, left: null, total: null, ...st });
            const seed = daySeed(theme, day), cs = mixSeed(seed, 1);
            const comp = new Composer(T.THEMES[theme].style, seed);
            const r = makeRng(mixSeed(cs, 0xa11));
            for (let i = 0; i < 6; i++) {
              const p = comp.next();
              for (const e of T.arrange(theme, p, r, mixSeed(cs, p.index))) {
                if (e.inst === 'dizi' && e.job.op === 'line') for (const n of e.job.notes) ms.push(midiOf(n.freq));
              }
            }
          }
        }
        ms.sort((a, b) => a - b);
        expect(ms[ms.length - 1], `${theme} ${colour} top`).toBeLessThanOrEqual(T.DIZI_TOP + 0.01);
        // the boss 笛 sings a 4th over the 唢呐 (median G5–C6; it was C6–D6 an octave above), not in its top octave
        if (theme === 'mirror-boss') expect(ms[ms.length >> 1], `${theme} ${colour} median`).toBeLessThanOrEqual(84);
      }
    }
  }, 60_000);

  it('the loud 笛\'s top notes are nearly pure: H3 and H4 ≥ 6 dB under the fundamental, centroid ≤ 2.8 kHz', () => {
    const sr = 44100, N = 16384;
    const fft = (re: Float64Array, im: Float64Array) => {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const a = i + k, b = a + len / 2, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
            re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
            const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
          }
        }
      }
    };
    for (const m of [86, 88, 89, 91, 93]) {
      const f0 = 440 * Math.pow(2, (m - 69) / 12);
      const x = renderLine(sr, 'dizi', [{ t: 0, dur: 1.2, freq: f0, vel: 1, vib: 0 }], 7, true);
      const re = new Float64Array(N), im = new Float64Array(N), s0 = Math.round(0.32 * sr);
      for (let i = 0; i < N; i++) re[i] = (x[s0 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      fft(re, im);
      const df = sr / N, pw = (k: number) => re[k] * re[k] + im[k] * im[k];
      const band = (f: number) => { let e = 0; for (let k = Math.round((f * 0.96) / df); k <= Math.round((f * 1.04) / df); k++) e += pw(k); return e; };
      const db = (h: number) => 10 * Math.log10(band(h * f0) / band(f0));
      let all = 0, cen = 0;
      for (let k = Math.round(20 / df); k < N / 2; k++) { all += pw(k); cen += pw(k) * k * df; }
      expect(db(3), `MIDI ${m} H3`).toBeLessThanOrEqual(-6);
      expect(db(4), `MIDI ${m} H4`).toBeLessThanOrEqual(-6);
      expect(cen / all, `MIDI ${m} centroid`).toBeLessThanOrEqual(2800);
    }
  });

  it('a phone hears the war drums: the hard kit carries ≥ 7 % of the phone-weighted energy of every layer', async () => {
    const T = await import('../src/audio/music-themes');
    const { peaking } = await import('../src/audio/dsp');
    const phone = (() => {
      const memo = new Map<string, number>();
      return (e: MusicEvent) => {
        const k = e.key ?? '';
        let x = k ? memo.get(k) : undefined;
        if (x === undefined) {
          x = 0;
          for (const ch of runMusicJob(SR, e.job)) {
            const y = Float32Array.from(ch);
            filter(y, highpass(SR, 280, 0.7)); filter(y, highpass(SR, 280, 0.7)); filter(y, peaking(SR, 3000, 0.8, 4));
            for (let i = 0; i < y.length; i++) x += y[i] * y[i];
          }
          if (k) memo.set(k, x);
        }
        return x * e.gain * e.gain;
      };
    })();
    for (const colour of COLOURS) {
      for (const [left] of [[55], [30], [12]]) {
        T.setMirrorMusic({ colour, left, total: 60, danger: 0, bossPhase: 0 });
        let kit = 0, all = 0;
        for (const e of await tierEvents(colour, left, 2, 4)) { const x = phone(e); all += x; if (e.job.op === 'kit') kit += x; }
        expect(kit / all, `${colour} left ${left}`).toBeGreaterThanOrEqual(0.07);
      }
    }
  }, 60_000);

  it('the lake shop is sung by the 箫 and the 笛: the plucked strings ≤ 40 % of its energy, the 古琴 only in the close', async () => {
    const T = await import('../src/audio/music-themes');
    let plucks = 0, all = 0;
    const roles = new Map<string, Set<string>>();
    for (const day of ['2026-09-20', '2026-09-21', '2026-09-22']) {
      T.setMirrorMusic({ colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0 });
      const seed = daySeed('mirror-calm', day), cs = mixSeed(seed, 1);
      const comp = new Composer(T.THEMES['mirror-calm'].style, seed);
      const r = makeRng(mixSeed(cs, 0xa11));
      for (let i = 0; i < 8; i++) {
        const p = comp.next();
        for (const e of T.arrange('mirror-calm', p, r, mixSeed(cs, p.index))) {
          const x = energyOf(e);
          all += x;
          if (PLUCK.has(e.inst)) plucks += x;
          if (e.prio === 0) (roles.get(p.role) ?? roles.set(p.role, new Set()).get(p.role)!).add(e.inst);
        }
      }
    }
    expect(plucks / all).toBeLessThanOrEqual(0.4);
    expect(roles.get('qi')?.has('xiao')).toBe(true);
    expect(roles.get('zhuan')?.has('dizi')).toBe(true);
    for (const role of ['qi', 'cheng', 'zhuan']) expect(roles.get(role)?.has('qin'), role).toBe(false);
  });

  it('tight, the 唢呐 doubles the 笛 exactly an octave below (never in unison)', async () => {
    const T = await import('../src/audio/music-themes');
    const iv = new Map<number, number>();
    for (const colour of COLOURS) for (const day of ['2026-09-21', '2026-09-23', '2026-09-25']) {
      T.setMirrorMusic({ colour, left: 12, total: 60, danger: 0, bossPhase: 0 });
      const seed = daySeed('mirror', day), cs = mixSeed(seed, 1);
      const comp = new Composer(T.THEMES.mirror.style, seed);
      const r = makeRng(mixSeed(cs, 0xa11));
      for (let i = 0; i < 5; i++) {
        const p = comp.next();
        const evs = T.arrange('mirror', p, r, mixSeed(cs, p.index));
        const dz = evs.find((e) => e.inst === 'dizi' && e.prio === 0)!;
        const dn = dz.notes!.map((n) => ({ t: dz.t + n.t, m: Math.round(n.midi) }));
        for (const s of evs.filter((e) => e.inst === 'suona' && e.prio === 1)) for (const n of s.notes!) {
          const d = dn.find((x) => Math.abs(x.t - (s.t + n.t)) < 0.01);
          if (d) iv.set(Math.round(n.midi) - d.m, (iv.get(Math.round(n.midi) - d.m) ?? 0) + 1);
        }
      }
    }
    expect([...iv.keys()]).toEqual([-12]);
    expect(iv.get(-12)!).toBeGreaterThan(100);
  });

  it('every boss phase keeps the low 箫 under the 唢呐; the forest\'s 唢呐 answers from the first layer', async () => {
    const T = await import('../src/audio/music-themes');
    for (const colour of COLOURS) for (const step of [0, 1, 2]) {
      T.setMirrorMusic({ colour, left: null, total: null, danger: 0, bossPhase: step });
      const comp = new Composer(T.THEMES['mirror-boss'].style, daySeed('mirror-boss', '2026-09-27'));
      const r = makeRng(5);
      let xiao = 0;
      for (let i = 0; i < 5; i++) { const p = comp.next(); for (const e of T.arrange('mirror-boss', p, r, i)) if (e.inst === 'xiao' && i) xiao++; }
      expect(xiao, `${colour} step ${step}`).toBeGreaterThanOrEqual(4);
    }
    T.setMirrorMusic({ colour: 'forest', left: 55, total: 60, danger: 0, bossPhase: 0 });
    const evs = await tierEvents('forest', 55, 2, 4);
    expect(evs.some((e) => e.inst === 'suona')).toBe(true);
  });

  it('the cues run in the band\'s 16ths and land their accent on the next beat, on the battle drums', async () => {
    const T = await import('../src/audio/music-themes');
    for (const bpm of [132, 140, 152]) {
      const spb = 60 / bpm;
      const danger = T.mirrorCue('danger', 1, bpm);
      const roll = danger.filter((e) => e.key?.startsWith('drum:tang')).map((e) => e.t);
      expect(roll.length).toBe(4);
      roll.forEach((t, k) => expect(t).toBeCloseTo((k * spb) / 4, 5));
      const big = danger.find((e) => e.key?.startsWith('drum:big'))!;
      expect(big.t).toBeCloseTo(spb, 5);
      for (const e of danger) if (e.job.op === 'drum') expect(e.job.hard).toBe(true);
      const phase = T.mirrorCue('phase', 1, bpm);
      const call = phase.find((e) => e.inst === 'suona')!;
      expect(call.job.op === 'line' && call.t + call.job.notes[1].t).toBeCloseTo(spb, 5);
    }
  });
});
