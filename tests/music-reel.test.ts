// The opening PV's reel (src/views/intro/reel.ts) and the drip (src/audio/voices.ts): the pure
// planner, and the reel on a fake bus and clock — once and in order, joins mid-note at the right
// offset, a start fades in, a stop cancels what has not sounded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicEvent } from '../src/audio/music-themes';
import type { MusicJob } from '../src/audio/music-dsp';
import { BedCue, KEEP_BEHIND, MIN_JOIN, OPENING, PLAY_AHEAD, SFX_AHEAD, cuesIn, planWindow, reelOn, type ReelBus } from '../src/views/intro/reel';
import { buildScore } from '../src/views/intro/score';
import { renderDrip } from '../src/audio/voices';
import { runJob } from '../src/audio/jobs';

const ev = (t: number, inst: MusicEvent['inst'], dur: number, x: Partial<MusicEvent> & { until?: number } = {}): MusicEvent => ({
  t, inst, dur, job: { op: 'wood', seed: Math.round(t * 1000) } as MusicJob, gain: 0.5, pan: 0, send: 0, echo: 0, prio: 0, ...x,
});

describe('planWindow', () => {
  const list = [ev(0, 'sheng', 6.5), ev(0.5, 'xiao', 4), ev(1, 'ling', 3), ev(2.25, 'wood', 0.4), ev(2.25, 'qin', 2), ev(5, 'drum', 0.8), ev(7.3, 'sheng', 3)];

  it('plans every event exactly once, in order, across consecutive windows', () => {
    for (const events of [list, buildScore('full').events, buildScore('short').events]) {
      const seen: number[] = [];
      let prev = -Infinity, from = 0;
      for (let now = 0; now < 95; now += 0.137) {
        const until = now + PLAY_AHEAD;
        if (until <= from) continue;
        for (const p of planWindow(events, from, until)) {
          expect(p.at).toBeGreaterThanOrEqual(from);
          expect(p.at).toBeLessThan(until);
          expect(p.at - now).toBeLessThanOrEqual(PLAY_AHEAD + 1e-9); // never more than PLAY_AHEAD early
          expect(p.at).toBeGreaterThanOrEqual(prev);
          expect(p.offset).toBe(0);
          prev = p.at;
          seen.push(p.i);
        }
        from = until;
      }
      expect(seen.slice().sort((a, b) => a - b)).toEqual(events.map((_, i) => i));
    }
  });

  it('a start skips earlier events, except sustained ones still sounding, which start at their offset', () => {
    const p = planWindow(list, 3, 3 + PLAY_AHEAD, true);
    expect(p).toEqual([
      { i: 0, at: 3, offset: 3 }, // the 笙 pad (0–6.5)
      { i: 1, at: 3, offset: 2.5 }, // the 箫 (0.5–4.5)
      { i: 4, at: 3, offset: 0.75 }, // the 古琴 (2.25–4.25)
    ]);
    // the 铃 (1–4) is percussion: never joined in its tail; the 古琴 (2.25–4.25) has 1.25 s left: joins
    const q = planWindow(list, 2.5, 2.5 + PLAY_AHEAD, true);
    expect(q.map((x) => [x.i, x.offset])).toEqual([[0, 2.5], [1, 2], [4, 0.25]]);
    // with less than MIN_JOIN left a sustained sound is skipped too
    expect(planWindow(list, 4.5 - MIN_JOIN / 2, 5, true).some((x) => x.i === 1)).toBe(false);
    // a sound cut (until) before `from` is not joined
    const cut = [ev(0, 'sheng', 6, { until: 2 })];
    expect(planWindow(cut, 3, 4, true)).toEqual([]);
    // without `join` a window never re-plans what started before it
    expect(planWindow(list, 3, 3 + PLAY_AHEAD)).toEqual([]);
  });

  it('joins the real score mid-note (the 0.5 s pad and the 1.0 s 箫 motif at a late start of 2.0)', () => {
    const s = buildScore('full');
    const p = planWindow(s.events, 2, 2 + PLAY_AHEAD, true);
    const pad = p.find((x) => s.events[x.i].inst === 'sheng' && s.events[x.i].t === 0.5)!;
    const xiao = p.find((x) => s.events[x.i].inst === 'xiao' && s.events[x.i].t === 1)!;
    expect(pad.offset).toBeCloseTo(1.5, 9);
    expect(xiao.offset).toBeCloseTo(1, 9);
    expect(p.every((x) => x.at >= 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------- a fake bus

class Param {
  value: number;
  calls: [string, number, number?][] = [];
  constructor(v: number) { this.value = v; }
  setValueAtTime(v: number, t: number) { this.calls.push(['set', v, t]); this.value = v; }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push(['ramp', v, t]); }
  cancelScheduledValues(t: number) { this.calls.push(['cancel', t]); }
  setTargetAtTime(v: number, t: number) { this.calls.push(['target', v, t]); }
}

interface Src { buf: { duration: number; id: string }; when: number; offset: number; stopAt: number | null; released: number | null; onended: ((e: Event) => void) | null; stop(t: number): void }

function fakeBus(o: { async?: boolean } = {}) {
  const ctx = { currentTime: 0, createGain: () => ({ gain: new Param(1), connect() {}, disconnect() {} }) };
  const plays: Src[] = [];
  const queue: (() => void)[] = [];
  const idOf = (j: MusicJob) => JSON.stringify(j);
  const bus = {
    ctx, input: {}, verbIn: {}, echoIn: {},
    render(job: MusicJob, cb: (c: Float32Array[]) => void) { const f = () => cb([new Float32Array(1)].map(() => Object.assign(new Float32Array(1), { id: idOf(job) }))); if (o.async) queue.push(f); else f(); },
    buffer(ch: Float32Array[]) { return { duration: 3, id: (ch[0] as unknown as { id: string }).id } as unknown as AudioBuffer; },
    play(buf: AudioBuffer, when: number, p: { offset?: number }) {
      const s: Src = { buf: buf as unknown as Src['buf'], when, offset: p.offset ?? 0, stopAt: null, released: null, onended: null, stop(t: number) { this.stopAt = t; } };
      plays.push(s);
      return s as unknown as AudioBufferSourceNode;
    },
    release(src: AudioBufferSourceNode, at: number) { (src as unknown as Src).released = at; },
    concurrent() { return 0; },
  };
  const flushRenders = () => { while (queue.length) queue.shift()!(); };
  return { ctx, bus: bus as unknown as ReelBus, plays, flushRenders, pending: () => queue.length };
}

const jobT = (s: Src) => JSON.parse(s.buf.id).seed / 1000;

describe('the reel', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const list = [ev(0, 'sheng', 6.5), ev(0.5, 'xiao', 4), ev(1, 'ling', 3), ev(2.25, 'wood', 0.4), ev(5, 'drum', 0.8), ev(7.3, 'sheng', 3), ev(9, 'qin', 2), ev(20, 'wood', 0.4)];

  it('is ready once the opening (t < OPENING) is rendered, and renders nothing later before it plays', async () => {
    const f = fakeBus({ async: true });
    const r = reelOn(f.bus, list);
    let ready = false;
    void r.ready.then(() => { ready = true; });
    expect(f.pending()).toBe(list.filter((e) => e.t < OPENING).length);
    await Promise.resolve();
    expect(ready).toBe(false);
    f.flushRenders();
    await Promise.resolve();
    expect(ready).toBe(true);
    expect(r.playing).toBe(false);
    expect(r.time()).toBe(0);
  });

  it('schedules each event once, in order, PLAY_AHEAD before it sounds, as the clock runs', () => {
    const f = fakeBus();
    const r = reelOn(f.bus, list);
    r.start(0);
    expect(r.playing).toBe(true);
    for (let k = 0; k < 250; k++) {
      f.ctx.currentTime += 0.12;
      vi.advanceTimersByTime(120);
      for (const s of f.plays) expect(s.when - f.ctx.currentTime).toBeLessThanOrEqual(PLAY_AHEAD + 0.13);
    }
    expect(f.plays.map(jobT)).toEqual(list.map((e) => e.t));
    expect(f.plays.every((s) => s.offset <= 0.012 + 1e-9)).toBe(true); // (a sound due right now starts 12 ms on)
    expect(r.time()).toBeCloseTo(30, 6);
  });

  it('start(from) skips earlier events but joins sustained ones at the right offset', () => {
    const f = fakeBus();
    f.ctx.currentTime = 10;
    const r = reelOn(f.bus, list);
    r.start(3);
    expect(r.time()).toBe(0 + 3);
    // the pad and the 箫 (the 铃 and the wood are gone), 12 ms on: a source never starts in the past
    const got = f.plays.map((s) => [jobT(s), +(s.when - 10).toFixed(6), +s.offset.toFixed(6)]);
    expect(got).toEqual([[0, 0.012, 3.012], [0.5, 0.012, 2.512]]);
    for (let k = 0; k < 20; k++) { f.ctx.currentTime += 0.12; vi.advanceTimersByTime(120); }
    expect(f.plays.map(jobT)).toEqual([0, 0.5, 5]);
    expect(f.plays[2].when).toBeCloseTo(10 + (5 - 3), 9);
  });

  it('a late render joins a sustained sound mid-note and drops a one-shot', () => {
    const f = fakeBus({ async: true });
    const r = reelOn(f.bus, [ev(0.2, 'sheng', 4), ev(0.3, 'wood', 0.4)]);
    r.start(0);
    expect(f.plays.length).toBe(0);
    f.ctx.currentTime = 1.0; // the renders come back 0.8 s late
    f.flushRenders();
    expect(f.plays.length).toBe(1);
    expect(jobT(f.plays[0])).toBe(0.2);
    expect(f.plays[0].offset).toBeCloseTo(1.0 + 0.012 - 0.2, 9);
  });

  it('start(from, { fade }) ramps the level up from 0 over `fade`', () => {
    const f = fakeBus();
    const made: Param[] = [];
    const mk = f.ctx.createGain;
    f.ctx.createGain = () => { const g = mk(); made.push(g.gain); return g; };
    f.ctx.currentTime = 4;
    const r = reelOn(f.bus, list, { level: 0.8 });
    r.start(12, { fade: 0.3 });
    expect(made.length).toBe(3); // dry, reverb, echo
    for (const p of made) expect(p.calls).toEqual([['set', 0, 4], ['ramp', 0.8, 4.3]]);
    // a restart crossfades: the old take ramps down while the new one ramps up
    r.start(20, { fade: 0.3 });
    for (const p of made.slice(0, 3)) expect(p.calls.slice(-1)).toEqual([['ramp', 0, 4.3]]);
    for (const p of made.slice(3)) expect(p.calls).toEqual([['set', 0, 4], ['ramp', 0.8, 4.3]]);
  });

  it('stop() cancels what has not sounded and nothing new is scheduled after it; time() keeps counting', () => {
    const f = fakeBus();
    const r = reelOn(f.bus, list);
    r.start(4.5);
    const before = f.plays.length;
    expect(before).toBeGreaterThan(0);
    r.stop(0.5);
    expect(r.playing).toBe(false);
    for (const s of f.plays) expect(s.stopAt).toBeCloseTo(0.52, 9);
    f.ctx.currentTime += 10;
    vi.advanceTimersByTime(10000);
    expect(f.plays.length).toBe(before);
    expect(r.time()).toBeCloseTo(14.5, 9);
  });

  it('releases a sound at its `until` (a choke, a hard cut)', () => {
    const f = fakeBus();
    const r = reelOn(f.bus, [ev(0.5, 'bo', 0.12, { until: 0.62 } as Partial<MusicEvent>)]);
    r.start(0);
    expect(f.plays[0].released).toBeCloseTo(0.62, 9);
  });

  it('forgets renders long past (memory) and asks again on a restart', () => {
    const f = fakeBus();
    let renders = 0;
    const orig = f.bus.render;
    (f.bus as { render: typeof orig }).render = (j, cb) => { renders++; orig(j, cb); };
    const r = reelOn(f.bus, [ev(1, 'xiao', 2), ev(40, 'xiao', 2)]);
    expect(renders).toBe(1);
    r.start(0);
    for (let k = 0; k < 40 / 0.12; k++) { f.ctx.currentTime += 0.12; vi.advanceTimersByTime(120); }
    expect(renders).toBe(2);
    expect(KEEP_BEHIND).toBeLessThan(40 - 3);
    r.start(1.5); // back into the first 箫: rendered again, joined at 0.5 s
    expect(renders).toBe(3);
    expect(f.plays[f.plays.length - 1].offset).toBeCloseTo(0.512, 9);
  });

  it('setScore swaps the cut and keeps the renders the cuts share', () => {
    const f = fakeBus();
    let renders = 0;
    const orig = f.bus.render;
    (f.bus as { render: typeof orig }).render = (j, cb) => { renders++; orig(j, cb); };
    const full = buildScore('full'), short = buildScore('short');
    const r = reelOn(f.bus, full.events);
    const n = renders;
    expect(n).toBeGreaterThan(3);
    r.setScore(short.events);
    r.start(0);
    expect(renders).toBe(n); // the opening is identical: nothing rendered again
  });
});

describe('the drip', () => {
  it('is deterministic: equal arguments give the identical sound (0.0 and 67.5)', () => {
    const a = renderDrip(48000, 1), b = renderDrip(48000, 1);
    expect(a).toEqual(b);
    expect(runJob(48000, { op: 'drip', pitch: 1 })[0]).toEqual(a);
    expect(renderDrip(48000, 0.8)).not.toEqual(a);
  });

  it('is short, clean and falls in pitch (1800 → 600 Hz), with a plink 90 ms later', () => {
    const sr = 48000;
    const x = renderDrip(sr, 1);
    expect(x.length / sr).toBeGreaterThan(0.3);
    expect(x.length / sr).toBeLessThan(0.5);
    let peak = 0, nan = 0;
    for (const v of x) { if (!Number.isFinite(v)) nan++; peak = Math.max(peak, Math.abs(v)); }
    expect(nan).toBe(0);
    expect(peak).toBeCloseTo(0.9, 3);
    // zero crossings: fast at the start (≈ 1.5 kHz), slow by 40 ms (≈ 600 Hz)
    const zc = (a: number, b: number) => { let n = 0; for (let i = Math.round(a * sr) + 1; i < Math.round(b * sr); i++) if (x[i - 1] < 0 !== x[i] < 0) n++; return n / 2 / (b - a); };
    expect(zc(0.002, 0.008)).toBeGreaterThan(1200);
    expect(zc(0.05, 0.085)).toBeLessThan(700);
    expect(zc(0.05, 0.085)).toBeGreaterThan(500);
    // energy after 0.3 s is tiny: it never smears into the next beat
    let late = 0, all = 0;
    for (let i = 0; i < x.length; i++) { all += x[i] * x[i]; if (i > 0.3 * sr) late += x[i] * x[i]; }
    expect(late / all).toBeLessThan(0.01);
  });
});

describe('the engine hooks (no Web Audio here: every call is a safe no-op)', () => {
  it('audio.ambient reads back the bed asked for; drip/chime/knock take `at`; prime is safe', async () => {
    const { audio } = await import('../src/audio/engine');
    expect(audio.ambient).toBe('none');
    audio.setAmbient('stream');
    expect(audio.ambient).toBe('stream');
    audio.setAmbient('none');
    expect(() => { audio.drip(); audio.drip(0.85, 0.5, 12); audio.chime(3, 1); audio.knock(2); }).not.toThrow();
    expect(audio.prime()).toBeNull();
  });

  it('music.attach() is null without Web Audio or with music off; prime() is safe', async () => {
    const { music } = await import('../src/audio/music');
    expect(() => music.prime()).not.toThrow();
    expect(music.attach()).toBeNull();
    music.setEnabled(false);
    expect(music.attach()).toBeNull();
    music.setEnabled(true);
  });
});

describe('the sfx cues', () => {
  it('cuesIn hands each cue over once, in order, never the gate\'s tap drip', () => {
    for (const cut of ['full', 'short'] as const) {
      const s = buildScore(cut);
      const got: number[] = [];
      let from = 0;
      for (let now = 0; now < s.end; now += 0.016) {
        const until = now + SFX_AHEAD;
        for (const c of cuesIn(s.sfx, from, until)) got.push(c.t);
        from = Math.max(from, until);
      }
      expect(got).toEqual(s.sfx.filter((c) => !(c.kind === 'drip' && c.by === 'gate')).map((c) => c.t));
      expect(got[0]).toBeGreaterThan(0);
      expect(SFX_AHEAD).toBeGreaterThanOrEqual(0.15);
    }
  });

  it('BedCue borrows the stream and gives the viewer\'s bed back (also from destroy)', async () => {
    const { audio } = await import('../src/audio/engine');
    audio.setAmbient('rain');
    const b = new BedCue();
    b.apply({ t: 45.2, kind: 'ambient', bed: 'stream' });
    expect(audio.ambient).toBe('stream');
    b.apply({ t: 48.2, kind: 'ambient', bed: 'restore' });
    expect(audio.ambient).toBe('rain');
    b.apply({ t: 75.2, kind: 'ambient', bed: 'stream' });
    b.restore(); // the film ended or was skipped mid-stream
    expect(audio.ambient).toBe('rain');
    b.restore();
    expect(audio.ambient).toBe('rain');
    audio.setAmbient('none');
  });
});
