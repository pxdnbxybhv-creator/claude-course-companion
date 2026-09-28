// 水月幻镜 · the battle score (src/audio/music-themes.ts: mirror, mirror-boss) measured the way a
// listener hears it: every layer rendered (8 kHz, the real instruments) and its energy tallied. The
// owner asked for combat music led by the winds, not the 古琴: the 笛/箫/唢呐 carry most of the melodic
// energy in every layer, the plucked strings only keep time, the lead sounds in (nearly) every bar, the
// 笛 sits in a flute's register. And the battle voices themselves: tongued chiff, 笛膜 buzz on loud
// notes only, 花舌, 叠音/打音/颤音, scoops — rendered cleanly.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeRng, mixSeed } from '../src/core/rng';
import { Composer, daySeed } from '../src/audio/music-theory';
import { runMusicJob, renderDrum, renderKit, renderLine, renderPlucks, renderSheng, type LineNote } from '../src/audio/music-dsp';
import { filter, highpass } from '../src/audio/dsp';
import type { MusicEvent } from '../src/audio/music-themes';

// every test starts on the map's first call (the director rotates it wave by wave)
beforeEach(async () => { (await import('../src/audio/music-themes')).setMirrorMusic({ wave: 0 }); });

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
      for (const [left] of TIERS) for (const wave of [0, 1, 2]) {
        T.setMirrorMusic({ colour, left, total: 60, danger: 0, bossPhase: 0, wave });
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
  }, 30_000);

  it('the battle tune drives: dotted rhythms, 吐音 repeated notes, upward 4th/5th leaps outnumber downward ones', async () => {
    const T = await import('../src/audio/music-themes');
    let up = 0, down = 0, dotted = 0, tu = 0, n = 0;
    for (const colour of COLOURS) for (const wave of [0, 1, 2]) {
      T.setMirrorMusic({ colour, left: 30, total: 60, danger: 0, bossPhase: 0, wave });
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
    T.setMirrorMusic({ wave: 0 });
  }, 30_000);
});

describe('the battle voices', () => {
  const sr = 16000;
  const ok = (x: Float32Array, maxPeak = 0.95) => {
    let peak = 0, sum = 0;
    let bad = 0; // one expect per render, not per sample (a per-sample expect made this the slowest test)
    for (const v of x) { if (!Number.isFinite(v)) bad++; peak = Math.max(peak, Math.abs(v)); sum += v; }
    expect(bad).toBe(0);
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
  }, 30_000);

  it('the battle 笛 is breathier and brighter, never stinging; its 笛膜 buzz grows with the breath', () => {
    const hi = (x: Float32Array, f: number) => {
      const y = Float32Array.from(x); filter(y, highpass(44100, f, 0.7)); filter(y, highpass(44100, f, 0.7));
      let a = 0, b = 0; for (let i = 0; i < x.length; i++) { a += y[i] * y[i]; b += x[i] * x[i]; } return a / b;
    };
    const held = (vel: number): LineNote[] => [{ t: 0, dur: 1.5, freq: 587, vel }];
    const gentle = renderLine(44100, 'dizi', held(0.85), 5);
    const loud = renderLine(44100, 'dizi', held(0.85), 5, true);
    expect(hi(loud, 4000)).toBeGreaterThan(hi(gentle, 4000) * 1.5);
    // soft notes stay clean: the high share rises with the velocity
    expect(hi(renderLine(44100, 'dizi', held(1), 5, true), 4000)).toBeGreaterThan(hi(renderLine(44100, 'dizi', held(0.35), 5, true), 4000));
    // its busiest register (E5–A5) does not sting where a phone is loudest: a held A5 at full breath keeps
    // ≤ 20 % of its energy above 4 kHz (it was 31 % with the 4.6 kHz presence peak and a louder 笛膜)
    expect(hi(renderLine(44100, 'dizi', [{ t: 0, dur: 1.5, freq: 880, vel: 1 }], 5, true), 4000)).toBeLessThan(0.2);
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
  }, 30_000);
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
        for (const [di, day] of month.entries()) {
          const states = theme === 'mirror' ? [{ left: 56, total: 60 }, { left: 30, total: 60 }, { left: 12, total: 60 }] : [{ bossPhase: 1 }, { bossPhase: 2 }];
          for (const st of states) {
            T.setMirrorMusic({ colour, danger: 0, bossPhase: 0, left: null, total: null, wave: di % 3, ...st });
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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);
});

// ---------------------------------------------------------------------------
// The band follows the fight (music-player.ts): a boss's new phase re-composes the phrases that have no
// sound yet, the band's beat grid places the cues, and a fight opens without the handover's slow fade.

describe('水月幻镜 · the band follows the fight', () => {
  /** A context that records nothing but the fade time constants; a worker that never answers (nothing sounds). */
  function fakeBus(P: typeof import('../src/audio/music-player')) {
    const tcs: number[] = [];
    const param = () => ({ value: 1, setValueAtTime() {}, setTargetAtTime(_v: number, _t: number, tc: number) { tcs.push(tc); }, cancelScheduledValues() {} });
    const node = () => ({ connect: (d: unknown) => d, disconnect() {}, start() {}, stop() {}, gain: param(), playbackRate: param(), pan: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), delayTime: param(), frequency: param(), Q: param() });
    const ctx: Record<string, unknown> = {
      currentTime: 0, sampleRate: 8000, state: 'running', destination: node(),
      createBuffer: (ch: number, len: number, rate: number) => { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { duration: len / rate, numberOfChannels: ch, length: len, getChannelData: (i: number) => d[i] }; },
    };
    for (const k of ['createGain', 'createDynamicsCompressor', 'createWaveShaper', 'createConvolver', 'createChannelMerger', 'createDelay', 'createBiquadFilter', 'createBufferSource', 'createStereoPanner']) ctx[k] = node;
    const worker = { postMessage() {}, terminate() {}, onmessage: null, onerror: null } as unknown as Worker;
    return { bus: new P.MusicBus(ctx as unknown as BaseAudioContext, { worker }), ctx: ctx as { currentTime: number }, tcs };
  }

  /** A context whose worker answers at once (buffers as long as the job's notes), recording each source's
   *  start, stop and length and every quick fade (a cut's 12 ms release). */
  function liveBus(P: typeof import('../src/audio/music-player')) {
    const srcs: { start: number; stop: number | null; len: number }[] = [];
    const fades: number[] = [];
    const param = () => ({ value: 1, setValueAtTime() {}, setTargetAtTime(v: number, t: number, tc: number) { if (v === 0 && tc === 0.012) fades.push(t); }, cancelScheduledValues() {} });
    const node = () => ({ connect: (d: unknown) => d, disconnect() {}, start() {}, stop() {}, gain: param(), playbackRate: param(), pan: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), delayTime: param(), frequency: param(), Q: param() });
    const ctx: Record<string, unknown> = {
      currentTime: 0, sampleRate: 1000, state: 'running', destination: node(),
      createBuffer: (ch: number, len: number, rate: number) => { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { duration: len / rate, numberOfChannels: ch, length: len, getChannelData: (i: number) => d[i] }; },
      createBufferSource: () => {
        const rec = { start: NaN, stop: null as number | null, len: 0 };
        srcs.push(rec);
        return { ...node(), buffer: null as { duration: number } | null, onended: null, start(t: number) { rec.start = t; rec.len = this.buffer?.duration ?? 0; }, stop(t: number) { rec.stop = t; } };
      },
    };
    for (const k of ['createGain', 'createDynamicsCompressor', 'createWaveShaper', 'createConvolver', 'createChannelMerger', 'createDelay', 'createBiquadFilter', 'createStereoPanner']) ctx[k] = node;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secs = (j: any): number => j.op === 'line' || j.op === 'pluck' ? Math.max(...j.notes.map((n: { t: number; dur?: number }) => n.t + (n.dur ?? 1))) + 0.5
      : j.op === 'kit' ? Math.max(...j.hits.map((h: { t: number }) => h.t)) + 1 : j.op === 'sheng' ? j.dur + 0.5 : 1.5;
    const worker = {
      terminate() {}, onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null,
      postMessage(m: { id: number; job: unknown }) { this.onmessage?.({ data: { id: m.id, chans: [new Float32Array(Math.ceil(secs(m.job) * 1000))] } }); },
    };
    return { bus: new P.MusicBus(ctx as unknown as BaseAudioContext, { worker: worker as unknown as Worker }), ctx: ctx as { currentTime: number }, srcs, fades };
  }

  it('a boss\'s new phase cuts the band over at its next bar line: what rings past it fades, the rest is composed again', async () => {
    const T = await import('../src/audio/music-themes');
    const P = await import('../src/audio/music-player');
    T.setMirrorMusic({ colour: 'forest', left: null, total: null, danger: 0, bossPhase: 0 });
    const { bus, ctx, srcs, fades } = liveBus(P);
    const c = new P.Conductor(bus, 'mirror-boss', 0.45, daySeed('mirror-boss', '2026-09-27'), 0, { fadeIn: 0.7, record: true });
    const run = (to: number, from = 0) => { for (let t = from; t <= to + 1e-9; t += 0.25) { ctx.currentTime = t; c.tick(t + 4.5, t + 1.2); } };
    run(0);
    const p0 = c.phrases[0];
    // a moment inside the second phrase (the first is 20 beats: the roll, then four bars), ticking as music.ts does
    const now = Math.round((p0.next + 1.0) * 4) / 4;
    run(now);
    const x = c.phrases[1];
    expect(x.start).toBeLessThan(now);
    const oldNext = x.next, bpm0 = x.phrase.bpm, role = c.phrases[2]?.phrase.role;
    const made = srcs.length;
    T.setMirrorMusic({ bossPhase: 1 });
    const at = P.bandCut()!;
    // on the first bar line past the sources already made
    const bar = 240 / bpm0;
    expect(at).toBeGreaterThan(now + 1.2);
    expect(at - (now + 1.2)).toBeLessThanOrEqual(bar + 0.03);
    expect(Math.abs((at - x.start) / bar - Math.round((at - x.start) / bar))).toBeLessThan(1e-6);
    expect(at).toBeLessThan(oldNext);
    expect(x.next).toBe(at);
    expect(x.cut).toBe(at);
    // what rings past the bar fades out there (12 ms) and stops once silent; nothing new was made
    expect(srcs.length).toBe(made);
    const ringing = srcs.filter((r) => r.start >= x.start - 1e-6 && r.start < at && r.start + r.len > at + 0.1);
    expect(ringing.length).toBeGreaterThan(0);
    for (const r of ringing) { expect(r.stop).not.toBeNull(); expect(r.stop!).toBeLessThanOrEqual(at + 0.09); }
    expect(fades.filter((t) => t === at).length).toBe(ringing.length);
    // the next phrase starts on the bar (composed now, or at the next tick when the bar was past the
    // horizon), the next in the 起承转合, in phase 1's tempo and layers
    c.tick(now + 4.5, now + 1.2);
    const y = c.phrases[2];
    expect(y.start).toBe(at);
    if (role) expect(y.phrase.role).toBe(role);
    expect(y.phrase.bpm).toBeGreaterThan(bpm0);
    expect(c.events.some((e) => e.at >= at && e.ev.key?.startsWith('sheng:stab'))).toBe(true);
    // nothing of the cut phrase is left to start after the bar
    expect(c.events.filter((e) => e.at >= at - 1e-6).every((e) => e.at >= y.start - 1e-6)).toBe(true);
    // the band's grid runs on from the cut; the tick does not re-compose it again (the epoch is in step)
    for (let i = 1; i < c.phrases.length; i++) expect(c.phrases[i].start).toBeCloseTo(c.phrases[i - 1].next, 9);
    const snap = c.phrases.slice();
    c.tick(now + 4.5, now + 1.2);
    expect(c.phrases.every((p, i) => p === snap[i])).toBe(true);
    // a source of the cut phrase made later (a late render) is released at the bar too
    run(Math.ceil(at * 4) / 4 + 0.5, now + 0.25);
    expect(srcs.slice(made).every((r) => r.start >= at - 1e-6)).toBe(true); // everything new belongs to the new phrases
    const g = P.bandBeat(0.03)!;
    const k = (ctx.currentTime + g.wait - at) / (60 / y.phrase.bpm);
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6); // the cues follow the new grid
    c.finish(at + 6, 0.5);
    expect(P.bandCut()).toBeNull(); // a band handing over is not cut
    // a theme without an epoch (the garden's) is never cut
    const q = new P.Conductor(liveBus(P).bus, 'garden', 0.45, 1, 0);
    q.tick(4.5, 1.2);
    expect(q.cut()).toBeNull();
    q.finish(5, 0.5);
    T.setMirrorMusic({ bossPhase: 0 });
  }, 30_000);

  it('a new boss phase re-composes the phrases not yet sounding: the band steps up at the next phrase, in time', async () => {
    const T = await import('../src/audio/music-themes');
    const P = await import('../src/audio/music-player');
    T.setMirrorMusic({ colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0 });
    const { bus, ctx } = fakeBus(P);
    const c = new P.Conductor(bus, 'mirror-boss', 0.45, daySeed('mirror-boss', '2026-09-27'), 0, { fadeIn: 0.7, record: true });
    const stabs = (from: number) => c.events.filter((e) => e.at >= from - 1e-6 && e.ev.key?.startsWith('sheng:stab')).length;
    c.tick(4.5, 1.2);
    ctx.currentTime = 6; c.tick(10.5, 7.2);
    expect(c.phrases.length).toBe(2);
    const [p0, p1] = c.phrases;
    expect(p1.start).toBeGreaterThan(7.2); // composed, nothing of it sounding yet
    const before0 = c.events.filter((e) => e.at < p1.start).length;
    expect(stabs(p1.start)).toBe(0); // phase 0: no 笙 stabs
    const bpm0 = p1.phrase.bpm;
    T.setMirrorMusic({ bossPhase: 1 }); // the boss changes phase at 6 s
    c.tick(10.5, 7.2);
    expect(c.phrases.length).toBe(2);
    expect(c.phrases[0]).toBe(p0); // what is sounding is left alone
    expect(c.events.filter((e) => e.at < p1.start).length).toBe(before0);
    const q1 = c.phrases[1];
    expect(q1).not.toBe(p1);
    expect(q1.start).toBe(p1.start); // on the grid: the new phrase starts where the old one would have
    expect(q1.phrase.role).toBe(p1.phrase.role); // the same place in the 起承转合
    expect(q1.phrase.bpm).toBeGreaterThan(bpm0); // phase 1: +3 bpm
    expect(stabs(q1.start)).toBeGreaterThan(0); // …and its layers (笙 stabs, the 笛 over the 唢呐)
    expect(c.events.some((e) => e.at >= q1.start && e.ev.inst === 'dizi' && e.ev.gain === 0.42)).toBe(true);
    // the next phrases follow the new one without a gap
    ctx.currentTime = 12; c.tick(16.5, 13.2);
    for (let i = 1; i < c.phrases.length; i++) expect(c.phrases[i].start).toBeCloseTo(c.phrases[i - 1].next, 9);
    // a phase rising again once the next phrase is already sounding: only the phrases after it change
    const sounding = c.phrases.filter((x) => x.start < 13.2).length;
    T.setMirrorMusic({ bossPhase: 2 });
    c.tick(16.5, 13.2);
    expect(c.phrases.slice(0, sounding).every((x, i) => x === c.phrases[i])).toBe(true);
    c.finish(20, 0.5);
    T.setMirrorMusic({ bossPhase: 0 });
  }, 30_000);

  it('the band\'s beat grid: the next beat after any moment, in the tempo of the phrase it falls in (bandBeat)', async () => {
    const T = await import('../src/audio/music-themes');
    const P = await import('../src/audio/music-player');
    T.setMirrorMusic({ colour: 'forest', left: 40, total: 60, danger: 0, bossPhase: 0 });
    const { bus, ctx } = fakeBus(P);
    const c = new P.Conductor(bus, 'mirror', 0.45, daySeed('mirror', '2026-09-27'), 0, { fadeIn: 0.7 });
    c.tick(20, 1.2);
    const ph = c.phrases;
    expect(ph.length).toBeGreaterThanOrEqual(2);
    for (let t = 0.5; t < ph[ph.length - 1].next - 0.5; t += 0.137) {
      const b = c.beatAt(t)!;
      const x = [...ph].reverse().find((p) => p.start <= b.at + 1e-9)!;
      const spb = 60 / x.phrase.bpm;
      expect(b.at).toBeGreaterThanOrEqual(t - 1e-9);
      expect(b.at - t).toBeLessThan(spb + 1e-9);
      const k = (b.at - x.start) / spb;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6); // on a beat of its phrase
      expect(b.bpm).toBe(x.phrase.bpm);
    }
    // the live band answers bandBeat (the director's cues): now + wait is a beat ≥ 30 ms ahead
    ctx.currentTime = 3.21;
    const g = P.bandBeat(0.03)!;
    expect(g.wait).toBeGreaterThanOrEqual(0.03);
    expect(g.wait).toBeLessThan(60 / g.bpm + 0.03);
    expect(3.21 + g.wait).toBeCloseTo(c.beatAt(3.24)!.at, 9);
    c.finish(4, 0.5);
    expect(P.bandBeat()).toBeNull(); // a finished band has no beat
  }, 30_000);

  it('a fight opens on its first drum stroke (a 50 ms fade-in); the shop keeps the handover\'s 0.7 s', async () => {
    const T = await import('../src/audio/music-themes');
    const P = await import('../src/audio/music-player');
    T.setMirrorMusic({ colour: 'lake', left: null, total: null, danger: 0, bossPhase: 0 });
    for (const [id, tc] of [['mirror', 0.05], ['mirror-boss', 0.05], ['mirror-calm', 0.7], ['garden', 0.7]] as const) {
      const { bus, tcs } = fakeBus(P);
      tcs.splice(0);
      const c = new P.Conductor(bus, id, 0.45, 1, 0, { fadeIn: 0.7 });
      expect(tcs, id).toEqual([tc, tc, tc]);
      c.finish(1, 0.5);
    }
  }, 30_000);
});
