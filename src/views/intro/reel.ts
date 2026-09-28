// 开篇 · the reel: plays the authored score (score.ts) on the music bus, on the shared AudioContext.
//
// The film's clock follows the reel (reel.time(), spec §9.7), so the picture waits for the sound.
// Events are rendered by the music worker RENDER_AHEAD seconds before they sound (the opening's
// renders are made under the title card: `ready`), kept by the reel alone (never in the bus's
// cache, which never evicts) and let go once played; a source node is made only PLAY_AHEAD seconds
// before, like the Conductor (music-player.ts). A render that comes back late joins in mid-sound
// if it is sustained, or is dropped if it is a one-shot, so nothing stale bursts out.
//
// start(from) begins a take at film time `from`: earlier events are skipped, except sustained ones
// still sounding at `from`, which start at the right offset into their buffer (a late reel, a
// hidden-tab resume at the shot's start, a reduced-motion tap to the next still). A new start
// crossfades from the take that was playing. Holds need no pause method: the film suspends the
// shared context (ctx.suspend() / resume()), and the reel's clock, its sources and the sfx all
// freeze together. stop(fade) fades the sound; time() keeps counting from the last start.
//
// The sfx (drip, chime, knock, the stream bed) are the film's to schedule on the sound engine
// (spec §9.7): cuesIn / playCue / BedCue below do it — each cue handed over once, SFX_AHEAD early,
// at its exact audio-clock time.
//
// planWindow and cuesIn are the pure cores the tests pin (tests/music-reel.test.ts).
import { audio } from '../../audio/engine';
import { music, type MusicBusHandle } from '../../audio/music';
import { MAX_VOICES } from '../../audio/music-player';
import type { Inst, MusicEvent } from '../../audio/music-themes';
import type { AmbientKind } from '../../core/types';
import type { ReelEvent, SfxCue } from './score';

/** Seconds ahead of the clock that a source is created (music.ts uses the same). */
export const PLAY_AHEAD = 1.2;
/** The opening rendered under the title card (`ready`): events with t below this. */
export const OPENING = 8;
/** Seconds ahead that renders are asked for while playing. */
export const RENDER_AHEAD = 6;
/**
 * Renders are let go this long after their sound ends (≈ 20 MB of buffers at the busiest moment at
 * 48 kHz). A resume further back renders again: sustained sounds then join a little late, mid-note.
 */
export const KEEP_BEHIND = 3;
/** A sustained sound joins mid-note only with at least this much of it left. */
export const MIN_JOIN = 0.25;
const TICK_MS = 120;

/** Sounds that may join mid-note (strings and winds); percussion never starts in its tail. */
const SUSTAINED = new Set<Inst>(['qin', 'harm', 'zheng', 'pipa', 'xiao', 'dizi', 'erhu', 'suona', 'sheng']);

export interface PlannedEvent {
  /** Index into the events given to planWindow. */
  i: number;
  /** Film time the source starts. */
  at: number;
  /** Seconds into the sound (0 unless it joins mid-note). */
  offset: number;
}

const joinable = (e: MusicEvent, from: number) => {
  const until = (e as ReelEvent).until ?? Infinity;
  return SUSTAINED.has(e.inst) && e.t < from && from < Math.min(e.t + e.dur, until) - MIN_JOIN;
};

/**
 * The events to give a source in the film-time window [from, until), in order. `join`: this is a
 * take's first window, so sustained events already sounding at `from` start at `from`, at an offset.
 * Pure: consecutive windows [a, b), [b, c) … plan every event exactly once.
 */
export function planWindow(events: readonly MusicEvent[], from: number, until: number, join = false): PlannedEvent[] {
  const out: PlannedEvent[] = [];
  events.forEach((e, i) => {
    if (e.t >= from && e.t < until) out.push({ i, at: e.t, offset: 0 });
    else if (join && joinable(e, from)) out.push({ i, at: from, offset: from - e.t });
  });
  return out.sort((a, b) => a.at - b.at || a.i - b.i);
}

export interface Reel {
  /** The opening's renders (t < OPENING) are back. */
  readonly ready: Promise<void>;
  /** Begin at film time `from` (default 0); `fade` ramps the level up from 0 (s). */
  start(from?: number, o?: { fade?: number }): void;
  /** Film seconds on the audio clock since the last start (0 before it). Freezes while the context is suspended. */
  time(): number;
  /** Fade out over `fade` s (default 0.3) and cancel everything not yet sounding. */
  stop(fade?: number): void;
  readonly playing: boolean;
  /**
   * Swap in the other cut's events (the cut is chosen at the click; both cuts share 0–49.2, so the
   * renders made for the opening are kept). Takes effect from the next window.
   */
  setScore(events: readonly MusicEvent[]): void;
}

/** What the reel needs of the music bus (the real one is music-player.ts's MusicBus). */
export type ReelBus = Pick<MusicBusHandle, 'ctx' | 'input' | 'verbIn' | 'echoIn' | 'render' | 'buffer' | 'play' | 'release' | 'concurrent'>;

/** A reel on the music engine's bus, or null while music is off or unsupported (the film then runs on its own clock). */
export function createReel(events: readonly MusicEvent[], o: { level?: number } = {}): Reel | null {
  try {
    const a = music.attach();
    return a ? reelOn(a.bus, events, o) : null;
  } catch (e) {
    console.warn('[reel]', e);
    return null;
  }
}

interface Take {
  base: number;
  faders: GainNode[];
  live: Set<AudioBufferSourceNode>;
  /** Film time planned up to (sources exist for everything before it). */
  until: number;
  pending: { e: ReelEvent; at: number; offset: number }[];
  retired: boolean;
}

const sigOf = (e: MusicEvent) => `${e.t.toFixed(4)}|${JSON.stringify(e.job)}`;

/** The reel on any bus (the lab renders offline, the tests use a fake). */
export function reelOn(bus: ReelBus, events: readonly MusicEvent[], o: { level?: number } = {}): Reel {
  const ctx = bus.ctx;
  const level = Math.max(0, Math.min(2, o.level ?? 1));
  let evs: ReelEvent[] = [];
  let sigs: string[] = [];
  const bufs = new Map<string, AudioBuffer>();
  const asked = new Set<string>();
  let take: Take | null = null;
  let lastBase: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let opening = new Set<string>();
  let readyDone: () => void = () => {};
  const ready = new Promise<void>((r) => { readyDone = r; });

  const setScore = (list: readonly MusicEvent[]) => {
    evs = (list as ReelEvent[]).slice().sort((a, b) => a.t - b.t);
    sigs = evs.map(sigOf);
    const keep = new Set(sigs);
    for (const k of [...bufs.keys()]) if (!keep.has(k)) { bufs.delete(k); asked.delete(k); }
  };
  setScore(events);

  const checkReady = () => {
    if (!opening.size) return;
    for (const k of opening) if (!bufs.has(k)) return;
    opening = new Set();
    readyDone();
  };

  const need = (i: number) => {
    const k = sigs[i], e = evs[i];
    if (asked.has(k)) return;
    asked.add(k);
    const done = (b: AudioBuffer) => {
      if (!asked.has(k)) return; // forgotten meanwhile
      bufs.set(k, b);
      checkReady();
      if (take) flush(take);
    };
    try {
      bus.render(e.job, (ch) => done(bus.buffer(ch)));
    } catch (err) {
      console.warn('[reel] render', err);
    }
  };

  const disconnect = (tk: Take) => { for (const g of tk.faders) { try { g.disconnect(); } catch { /* gone */ } } };

  /** Give an event its source on the take, late-joining or dropping it if its moment has passed. */
  const play = (tk: Take, e: ReelEvent, at: number, offset: number, buf: AudioBuffer): boolean => {
    const now = ctx.currentTime;
    let when = tk.base + at, off = offset;
    const cut = e.until !== undefined ? tk.base + e.until : Infinity;
    if (when < now + 0.012) {
      const late = now + 0.012 - when;
      if (SUSTAINED.has(e.inst) ? off + late > Math.min(e.dur, cut - tk.base - e.t) - MIN_JOIN : late > 0.04) return false;
      off += late;
      when = now + 0.012;
    }
    if (when >= cut) return false;
    if (e.prio > 0 && bus.concurrent(when) >= MAX_VOICES - (e.prio === 2 ? 4 : 0)) return false;
    const [dry, wet, echo] = tk.faders;
    let src: AudioBufferSourceNode;
    try {
      src = bus.play(buf, when, {
        gain: e.gain, pan: e.pan, send: e.send, echo: e.echo, rate: e.rate, offset: off * (e.rate ?? 1), dry, wet, echoDest: echo,
      });
      if (cut < Infinity) bus.release(src, cut, e.tau ?? 0.012);
    } catch (err) {
      console.warn('[reel] play', err);
      return false;
    }
    tk.live.add(src);
    const prev = src.onended;
    src.onended = (ev) => {
      if (prev) (prev as (x: Event) => void).call(src, ev);
      tk.live.delete(src);
      if (tk.retired && !tk.live.size) disconnect(tk);
    };
    if (tk.retired) try { src.stop(now + 0.02); } catch { /* ignore */ }
    return true;
  };

  /** Pending events whose render is now back (or whose moment is gone). */
  const flush = (tk: Take) => {
    if (tk.retired || !tk.pending.length) return;
    const now = ctx.currentTime - tk.base;
    tk.pending = tk.pending.filter((p) => {
      const b = bufs.get(sigOf(p.e));
      if (b) { play(tk, p.e, p.at, p.offset, b); return false; }
      const left = Math.min(p.e.dur, (p.e.until ?? Infinity) - p.e.t) - (p.offset + Math.max(0, now - p.at));
      return SUSTAINED.has(p.e.inst) ? left > MIN_JOIN : now - p.at < 0.04;
    });
  };

  const schedule = (tk: Take, list: PlannedEvent[]) => {
    for (const p of list) {
      const e = evs[p.i];
      const b = bufs.get(sigs[p.i]);
      if (b) play(tk, e, p.at, p.offset, b);
      else { tk.pending.push({ e, at: p.at, offset: p.offset }); need(p.i); }
    }
  };

  const tick = () => {
    const tk = take;
    if (!tk) return;
    const t = ctx.currentTime - tk.base;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.t >= t + RENDER_AHEAD) break;
      if (e.t + e.dur > t - 0.5) need(i);
      else if (e.t + e.dur < t - KEEP_BEHIND && asked.has(sigs[i])) { asked.delete(sigs[i]); bufs.delete(sigs[i]); }
    }
    if (t + PLAY_AHEAD > tk.until) {
      schedule(tk, planWindow(evs, tk.until, t + PLAY_AHEAD));
      tk.until = t + PLAY_AHEAD;
    }
    flush(tk);
  };

  const retire = (tk: Take, fade: number) => {
    tk.retired = true;
    tk.pending = [];
    const now = ctx.currentTime;
    for (const g of tk.faders) {
      const p = g.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + fade);
    }
    for (const s of tk.live) try { s.stop(now + fade + 0.02); } catch { /* already stopped */ }
    if (!tk.live.size) disconnect(tk);
  };

  // the opening, rendered under the title card
  for (let i = 0; i < evs.length && evs[i].t < OPENING; i++) opening.add(sigs[i]);
  if (!opening.size) readyDone();
  for (let i = 0; i < evs.length && evs[i].t < OPENING; i++) need(i);

  return {
    ready,
    get playing() { return !!take; },
    time() { return lastBase === null ? 0 : ctx.currentTime - lastBase; },
    setScore,
    start(from = 0, so = {}) {
      const f = Number.isFinite(from) ? Math.max(0, from) : 0;
      const now = ctx.currentTime;
      const fade = Math.max(0, so.fade ?? 0);
      if (take) retire(take, Math.max(0.05, fade));
      const mk = (dest: AudioNode) => {
        const g = ctx.createGain();
        if (fade > 0) { g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(level, now + fade); } else g.gain.value = level;
        g.connect(dest);
        return g;
      };
      const tk: Take = { base: now - f, faders: [mk(bus.input), mk(bus.verbIn), mk(bus.echoIn)], live: new Set(), until: f + PLAY_AHEAD, pending: [], retired: false };
      take = tk;
      lastBase = tk.base;
      schedule(tk, planWindow(evs, f, f + PLAY_AHEAD, true));
      tick();
      if (timer === null) timer = setInterval(tick, TICK_MS);
    },
    stop(fade = 0.3) {
      const tk = take;
      if (!tk) return;
      take = null;
      retire(tk, Math.max(0.01, Number.isFinite(fade) ? fade : 0.3));
      if (timer !== null) { clearInterval(timer); timer = null; }
    },
  };
}

// ---------------------------------------------------------------------------------------------- sfx cues

/** How far ahead of film time the sfx cues are handed to the sound engine (≥ 0.15 s, spec §9.7). */
export const SFX_AHEAD = 0.25;

/**
 * The sfx cues to hand over in the film-time window [from, until), in order; the tap's drip
 * (`by: 'gate'`) is the gate's own call and never repeated. Pure: consecutive windows give each once.
 */
export function cuesIn(sfx: readonly SfxCue[], from: number, until: number): SfxCue[] {
  return sfx.filter((c) => c.t >= from && c.t < until && !(c.kind === 'drip' && c.by === 'gate'));
}

/**
 * Play a drip, chime or knock cue on the sound engine at audio-clock time `at` (= ctx.currentTime +
 * cue.t − the film's audio-clock time: on the reel, `audio.context.currentTime + c.t − reel.time()`).
 * Bed cues are not timed sounds: see BedCue.
 */
export function playCue(c: SfxCue, at: number): void {
  if (c.kind === 'drip') audio.drip(c.pitch, c.gain, at);
  else if (c.kind === 'chime') audio.chime(c.streak, at);
  else if (c.kind === 'knock') audio.knock(at);
}

/**
 * The stream bed the film borrows (45.2–48.2 and 75.2–76.4): `apply` a bed cue when its film time
 * comes; `restore()` in the film's destroy() puts the viewer's own bed back if a stream is still on.
 */
export class BedCue {
  private prev: AmbientKind | null = null;
  apply(c: SfxCue): void {
    if (c.kind !== 'ambient') return;
    if (c.bed === 'stream') {
      if (this.prev === null) this.prev = audio.ambient;
      audio.setAmbient('stream');
    } else this.restore();
  }
  restore(): void {
    if (this.prev === null) return;
    audio.setAmbient(this.prev);
    this.prev = null;
  }
}
