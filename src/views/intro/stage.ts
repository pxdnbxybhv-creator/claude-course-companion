// 开篇 · the stage (spec §8.3–§8.5, §9.7): the pixel budget, the layers under the keep rule, the
// deadline paint queue (≤ 6 ms a frame, earliest deadline first, splittable paints split into
// steps), the film clock slewed to the reel, and the governor that only lowers the rendering tier.
//
// Layers are painted from their `from` time and released at the end of the last shot that draws
// them (shots.ts LAYERS), so a hidden-tab resume at a shot's start always finds them alive.
import type { Cut, Tier } from '../../app/intro';
import { CUTS, layoutFor } from './shots';
import { makeLay, release, type Lay, type PaintJob } from './paint/util';

export { layoutFor };

// ---------------------------------------------------------------------------------------------- pixel budget

const isIOS = (): boolean => {
  try {
    const n = navigator as Navigator & { maxTouchPoints?: number };
    return /iP(hone|od|ad)/.test(n.userAgent) || (/Macintosh/.test(n.userAgent) && (n.maxTouchPoints ?? 0) > 1);
  } catch {
    return false;
  }
};

/** The PV canvas dpr: clamp(min(devicePixelRatio, 2, √(PX / (w·h))), 1, 2) (spec §8.3). */
export function budgetDpr(w: number, h: number, tier: Tier, deviceDpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1, ios = isIOS()): number {
  const PX = tier === 'low' ? 1.2e6 : ios ? 2.0e6 : 3.2e6;
  return Math.max(1, Math.min(2, deviceDpr, Math.sqrt(PX / Math.max(1, w * h))));
}

export function makeStageLay(w: number, h: number, dpr: number): Lay {
  const { cls, mix } = layoutFor(w, h);
  return makeLay(w, h, dpr, cls, mix);
}

// ---------------------------------------------------------------------------------------------- the paint queue

export interface Job {
  id: string;
  /** Earliest film time it may start (memory follows the keep rule). */
  paintFrom: number;
  /** Film time by which it must be done, or the director holds. */
  neededBy: number;
  make: () => PaintJob | Promise<PaintJob>;
  job: PaintJob | null;
  i: number;
  done: boolean;
  failed: boolean;
  pending: boolean;
  onDone?: (j: PaintJob) => void;
}

export class PaintQueue {
  jobs: Job[] = [];
  /** Wall ms spent painting (for the lab's perf line). */
  spent = 0;

  add(id: string, paintFrom: number, neededBy: number, make: Job['make'], onDone?: (j: PaintJob) => void): Job {
    const old = this.jobs.find((j) => j.id === id);
    if (old) return old;
    const j: Job = { id, paintFrom, neededBy, make, job: null, i: 0, done: false, failed: false, pending: false, onDone };
    this.jobs.push(j);
    return j;
  }

  get(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  isDone(id: string): boolean {
    return !!this.get(id)?.done;
  }

  /** Run steps (earliest deadline first) until `budgetMs` is spent. Returns ms used. */
  pump(t: number, budgetMs: number): number {
    const t0 = performance.now();
    const open = this.jobs.filter((j) => !j.done && !j.failed && !j.pending && j.paintFrom <= t).sort((a, b) => a.neededBy - b.neededBy);
    for (const j of open) {
      if (performance.now() - t0 >= budgetMs) break;
      if (!this.step(j, () => performance.now() - t0 < budgetMs)) continue;
    }
    const used = performance.now() - t0;
    this.spent += used;
    return used;
  }

  /** Everything needed by `t` (and startable), synchronously (the lab, and a resume). */
  finishUntil(t: number): Promise<void> {
    const run = async () => {
      for (let guard = 0; guard < 50; guard++) {
        const open = this.jobs.filter((j) => !j.done && !j.failed && j.paintFrom <= t && j.neededBy <= t + 1e-9).sort((a, b) => a.neededBy - b.neededBy);
        if (!open.length) return;
        for (const j of open) {
          if (j.pending) { await new Promise((r) => setTimeout(r, 10)); continue; }
          this.step(j, () => true);
        }
      }
    };
    return run();
  }

  private step(j: Job, more: () => boolean): boolean {
    try {
      if (!j.job) {
        const m = j.make();
        if (m instanceof Promise) {
          j.pending = true;
          m.then((pj) => { j.job = pj; j.pending = false; }, (e) => { console.warn('[intro] paint', j.id, e); j.pending = false; j.failed = true; });
          return false;
        }
        j.job = m;
      }
      const pj = j.job;
      while (j.i < pj.steps.length) {
        pj.steps[j.i++]();
        if (!more()) break;
      }
      if (j.i >= pj.steps.length) {
        j.done = true;
        j.onDone?.(pj);
      }
      return true;
    } catch (e) {
      console.warn('[intro] paint', j.id, e);
      j.failed = true;
      return false;
    }
  }

  /** Jobs that should be done by t and are not. */
  late(t: number): Job[] {
    return this.jobs.filter((j) => !j.done && !j.failed && j.neededBy <= t);
  }

  /** Give up on a job (the hold cap): its shot plays its fallback. */
  abandon(j: Job): void {
    j.failed = true;
  }
}

// ---------------------------------------------------------------------------------------------- layers

/** Canvases by layer id; released at the end of the last shot that draws them. */
export class Layers {
  private m = new Map<string, HTMLCanvasElement[]>();
  constructor(private cut: Cut) {}

  set(id: string, ...cs: HTMLCanvasElement[]): void {
    const cur = this.m.get(id) ?? [];
    this.m.set(id, [...cur, ...cs]);
  }

  /** Release every layer whose keep window has ended by t. */
  releaseUntil(t: number): string[] {
    const gone: string[] = [];
    for (const l of CUTS[this.cut].layers) {
      if (t >= l.until && this.m.has(l.id)) {
        for (const c of this.m.get(l.id)!) release(c);
        this.m.delete(l.id);
        gone.push(l.id);
      }
    }
    return gone;
  }

  releaseAll(): void {
    for (const cs of this.m.values()) for (const c of cs) release(c);
    this.m.clear();
  }

  /** Live canvas memory, MB (the lab's ?mem=1). */
  mb(): number {
    let px = 0;
    for (const cs of this.m.values()) for (const c of cs) px += c.width * c.height;
    return (px * 4) / 1e6;
  }
}

// ---------------------------------------------------------------------------------------------- the clock

/** A pausable perf clock with the click as origin. */
export class PerfClock {
  private base: number;
  private pausedAt: number | null = null;
  constructor(tapAt: number) { this.base = tapAt; }
  now(): number {
    const n = this.pausedAt ?? performance.now();
    return (n - this.base) / 1000;
  }
  pause(): void { if (this.pausedAt === null) this.pausedAt = performance.now(); }
  resume(): void {
    if (this.pausedAt === null) return;
    this.base += performance.now() - this.pausedAt;
    this.pausedAt = null;
  }
  set(t: number): void {
    const n = this.pausedAt ?? performance.now();
    this.base = n - t * 1000;
  }
  get paused(): boolean { return this.pausedAt !== null; }
}

/**
 * The film clock: follows its source (the reel minus the A/V lag, or the perf clock) but slews by at
 * most 20 ms a frame when the two drift apart; jumps when they are far apart (a seek, a resume).
 */
export class FilmClock {
  t = 0;
  private lastWall = 0;
  step(source: number, wallMs: number, running: boolean): number {
    const dt = this.lastWall ? Math.min(0.1, (wallMs - this.lastWall) / 1000) : 0;
    this.lastWall = wallMs;
    if (!running) return this.t;
    const pred = this.t + dt;
    const d = source - pred;
    this.t = Math.abs(d) > 0.25 ? source : pred + Math.max(-0.02, Math.min(0.02, d));
    return this.t;
  }
  jump(t: number): void { this.t = t; }
}

// ---------------------------------------------------------------------------------------------- the governor

export interface RenderFlags {
  /** 1: no reflection slices · 2: Weather off · 3: flip-book 8ths · 4: mirror fallback · 5: S11 single plate · 6: dpr × 0.8. */
  level: number;
  reflections: boolean;
  weather: boolean;
  flip16: boolean;
  mirrorSprites: boolean;
  countryDrift: boolean;
  dprScale: number;
}

export function flagsFor(level: number, tier: Tier): RenderFlags {
  const low = tier === 'low';
  return {
    level,
    reflections: !low && level < 1,
    weather: !low && level < 2,
    flip16: !low && level < 3,
    mirrorSprites: level < 4,
    countryDrift: level < 5,
    dprScale: level >= 6 ? 0.8 : 1,
  };
}

/** Steps rendering down one level when the frame time's moving average stays over 24 ms for 1 s (at most one step per 2 s, never back up). */
export class Governor {
  level = 0;
  private avg = 16;
  private overSince: number | null = null;
  private lastStep = -1e9;
  constructor(private max = 6) {}
  frame(ms: number, wall: number): boolean {
    this.avg += (ms - this.avg) * 0.1;
    if (this.avg > 24) {
      if (this.overSince === null) this.overSince = wall;
      if (wall - this.overSince >= 1000 && wall - this.lastStep >= 2000 && this.level < this.max) {
        this.level++;
        this.lastStep = wall;
        this.overSince = null;
        return true;
      }
    } else this.overSince = null;
    return false;
  }
}
