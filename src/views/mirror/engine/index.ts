// 水月幻镜 · the engine (API.md §3, GDD §24.3): requestAnimationFrame with a fixed 60 Hz step (≤ 4
// steps a frame, dt clamped to 50 ms and snapped to the display's vsync, paused while hidden), drawn
// between its last two steps (render interpolation), hitstop (boss phases and deaths only), the camera
// (rigid on you with a sticky 36 px lead, a dash guard, the boss fit, a soft edge), the frame-time
// guard, and the engine-error rules of GDD §23 (the first throw drops the offending entity; a second
// within 5 s is fatal). DOM-free apart from its canvas: the UI owns every listener and feeds
// `engine.input`.
import type {
  Camera, CreateEngine, Engine, EngineDeps, EngineInput, EnginePhase, EngineSettings, Painter, RunSave, SkillTarget, WaveResult, WaveSetup,
} from '../types';
import { World } from './world';
import { Renderer } from './render';
import type { HudRect } from './threats';
import { createDebugPainter } from './debugPainter';
import { installDev } from './dev';
import { bakeScale, viewOf, viewScale, type ViewSize } from '../paint/draw';

const STEP = 1 / 60;
/**
 * Vsync snap (屏幕抖动 / 行走快慢, walk.md R2 with its review; m7 for every refresh rate): rAF stamps
 * are coarse (Chrome 0.1 ms, Safari and Firefox 1 ms) and a real "60 Hz" panel runs at 59.94 or
 * 60.02 Hz, so a raw accumulator drifts through the step boundary and runs 0 steps on one frame and 2
 * on the next (a figure that stops, then jumps), and at 144–360 Hz a 1 ms clock is 15–35% of a frame.
 * The display's period (period(): the recent vsync intervals near their lower quartile, averaged) names
 * a nominal rate when it is within SNAP_PERIOD of one (NOMINAL_HZ); a frame within min(SNAP_FRAME,
 * SNAP_FRAC × period) of whole vsyncs then counts as exactly that many nominal periods: one step a frame
 * at 60 Hz, one every other frame at 120 Hz, a steady 5-in-12 at 144 Hz. The cost: a 59.94 Hz panel
 * runs the game 0.1% slow (a 143.86 Hz one 0.1% fast); a rate that is no nominal one (57 Hz) is not
 * snapped. Only whole vsyncs snap: an irregular interval (a hitch) is used as it came.
 */
const SNAP_PERIOD = 0.02;
const SNAP_FRAME = 0.0015;
const SNAP_FRAC = 0.45;
const NOMINAL_HZ = new Float64Array([30, 48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 165, 180, 200, 240, 280, 300, 360, 480, 500]);
/** The vsync intervals kept for period() (32: Safari's 1 ms stamps average to < 1.5% at 360 Hz). */
const PERIOD_N = 32;
/** The nominal period (s) a measured display period is (NaN: none within SNAP_PERIOD). */
export function nominalPeriod(period: number): number {
  if (!(period > 0)) return NaN;
  // (called on every animation frame with the same period for long stretches: the last answer is kept;
  // an indexed loop, so nothing is allocated per frame)
  if (period === nomIn) return nomOut;
  const hz = 1 / period;
  let best = 0, bd = Infinity;
  for (let i = 0; i < NOMINAL_HZ.length; i++) { const n = NOMINAL_HZ[i], d = Math.abs(hz - n) / n; if (d < bd) { bd = d; best = n; } }
  nomIn = period; nomOut = bd <= SNAP_PERIOD ? 1 / best : NaN;
  return nomOut;
}
let nomIn = NaN, nomOut = NaN;
export function snapStep(dt: number, period = dt): number {
  if (!(dt > 0) || !(period > 0)) return dt;
  const P = nominalPeriod(period);
  if (!(P > 0)) return dt;
  const k = Math.max(1, Math.round(dt / P));
  return Math.abs(dt - k * P) < Math.min(SNAP_FRAME, SNAP_FRAC * P) ? k * P : dt;
}
/**
 * The frame cap (帧率, EngineSettings.fps): a vsync callback that comes before the cap's period is
 * skipped (nothing steps, nothing draws; the next one is asked for). The cap presents every k-th vsync,
 * k the whole number of vsyncs nearest its period (capVsyncs): always a steady cadence, never vsyncs
 * shared out unevenly (a 1-1-1-1-1-2 cadence judders 3–6× a steady one). So 60 on 120 Hz is every
 * other vsync, 30 on 144 Hz every 5th (28.8 fps), 60 on 144 Hz every 2nd (72), 60 on 90 Hz every 2nd
 * (45), 120 on 144 or 165 Hz every vsync. A cap at or above the display's rate draws every vsync. Never
 * a timer. CAP_TOL: the half rate's slack (halfMs).
 */
const CAP_TOL = 0.05;
/** The vsyncs a cap of period T (ms) presents on a display of period P (ms): the nearest whole number,
 *  ties (60 on 90 Hz) going to the longer period, the one that keeps within the cap. */
export function capVsyncs(T: number, P: number): number {
  return T > 0 && P > 0 ? Math.max(1, Math.round(T / P + 0.02)) : 1;
}
/** The engine's frame cap from a setting: 30…1000 fps, or 0 (none: every vsync the screen shows). */
export function capOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 10 ? Math.min(1000, Math.round(v)) : 0;
}
/** One window of frame statistics (MirrorEngine.frameStats; the 显示帧率 readout, the settings row). */
export interface FrameStats {
  /** Frames drawn a second over the last window (NaN before the first). */
  fps: number;
  /** Their mean interval (ms). */
  ms: number;
  /** Our own JS time a frame (steps + draw calls, ms): the raster work comes after, so it is a floor. */
  work: number;
  /** The display's refresh rate as measured (MirrorEngine.displayHz). */
  hz: number;
  /** The frame cap in force (fps; 0: none), and whether the guard has fallen back to half rate. */
  cap: number;
  half: boolean;
}

declare module './world' {
  interface World {
    /**
     * The effects clock (engine/index.ts LerpSet, m7 B0): t + (α − ½)·STEP while drawing, t otherwise
     * (headless, a still redraw). At 60 Hz α is ½ on every frame, so it is t exactly; on a faster
     * screen it moves on every frame and leads the drawn bodies by half a step, as t does at 60 Hz.
     * Only drawing reads it (effect ages, poses, pulses): every rule, spawn and sweep reads `t`.
     */
    tFx: number;
    /** tFx − t (s; within ±STEP/2; 0 at 60 Hz and headless): add it to a per-entity sim clock. */
    dFx: number;
  }
}
declare module '../types' {
  interface EngineSettings {
    /** 帧率 (m7): the most frames a second the engine draws (30 · 60 · 120), or 0 / missing: every
     *  frame the screen shows (144, 240, 360 Hz included). Applies live through setSettings. */
    fps?: number;
  }
}

/**
 * Render interpolation (屏幕抖动 RC1): every moving pool's positions before the last simulation step.
 * The draw writes lerp(before, now, α = acc / STEP) in place, draws, and restores the simulation's own
 * values, so the simulation never sees a drawn number (a headless engine never touches them). A body
 * that was not alive at the snapshot, or is another body now (a new generation, or a clock that ran
 * backwards: a slot freed and taken again within one step), or moved farther than LERP_JUMP in one step
 * (a blink, a teleport) is drawn where it is. No allocation per step or frame.
 */
const LERP_JUMP = 48;
/**
 * A packed crowd shivers: separation pushes a body back and forth by 1–3 u a step (about 15 reversals
 * a body a second in a 墨团 pack). Enemies (pool 0) are drawn through a speed-adaptive low-pass (a
 * "one-euro" filter): at rest its time constant is CROWD_TAU (30 ms), so the shiver averages out; the
 * cutoff rises with the body's smoothed speed (CROWD_BETA Hz per u/s), so a body on the move (a charge,
 * a chase) is drawn with almost no lag. Drawing only: hits, contact and aim use the simulation's values.
 */
const CROWD_TAU = 0.03, CROWD_BETA = 0.03, CROWD_DTAU = 0.2;
interface LerpPool { x: Float32Array; y: Float32Array; alive: Uint8Array; n: number; gen?: Uint32Array }
interface LerpSrc {
  p: LerpPool;
  /** A radius drawn from the same step (zones: a ring that grows 300 u/s). */
  r?: Float32Array;
  /** A per-body clock: a new body in a reused slot shows as this clock running backwards. */
  clock?: Float32Array | Float64Array;
  /** true: the clock counts up (an age); false: down (a life). */
  up?: boolean;
}
class LerpSet {
  private srcs: LerpSrc[] = [];
  private bx: Float32Array[] = []; private by: Float32Array[] = []; private br: (Float32Array | null)[] = [];
  private ba: Uint8Array[] = []; private bg: (Uint32Array | null)[] = []; private bc: (Float64Array | null)[] = [];
  private sx: Float32Array[] = []; private sy: Float32Array[] = []; private sr: (Float32Array | null)[] = [];
  private sn: Int32Array = new Int32Array(0); private bn: Int32Array = new Int32Array(0);
  /** A snapshot exists (false after start() and revive(): no "before" to draw from). */
  ok = false;
  /** The effects clock runs ahead of t (false for the few frames before the display's period is known:
   *  effects then draw on t, as they always did). */
  fx = true;
  private ppx = 0; private ppy = 0; private spx = 0; private spy = 0; private applied = false;
  /** The crowd filter's state for pool 0: drawn position, smoothed velocity, generation, valid. */
  private qx = new Float32Array(0); private qy = new Float32Array(0); private qvx = new Float32Array(0); private qvy = new Float32Array(0);
  private qg = new Uint32Array(0); private qv = new Uint8Array(0);
  constructor(private list: () => LerpSrc[]) {}
  /** Build the before/saved arrays once (the world's pools are made with it and never replaced). */
  private ensure(): void {
    if (this.srcs.length) return;
    const L = this.list();
    this.srcs = L;
    const F = (n: number) => new Float32Array(n);
    this.bx = L.map((s) => F(s.p.x.length)); this.by = L.map((s) => F(s.p.x.length)); this.br = L.map((s) => (s.r ? F(s.r.length) : null));
    this.ba = L.map((s) => new Uint8Array(s.p.alive.length)); this.bg = L.map((s) => (s.p.gen ? new Uint32Array(s.p.gen.length) : null));
    this.bc = L.map((s) => (s.clock ? new Float64Array(s.clock.length) : null));
    this.sx = L.map((s) => F(s.p.x.length)); this.sy = L.map((s) => F(s.p.x.length)); this.sr = L.map((s) => (s.r ? F(s.r.length) : null));
    this.sn = new Int32Array(L.length); this.bn = new Int32Array(L.length);
    const n0 = L[0].p.x.length;
    this.qx = F(n0); this.qy = F(n0); this.qvx = F(n0); this.qvy = F(n0); this.qg = new Uint32Array(n0); this.qv = new Uint8Array(n0);
    this.ok = false;
  }
  /** Before a step: remember where everything is. */
  snap(w: World): void {
    this.ensure();
    // the first snapshot after start() / revive(): the crowd filter starts again from where bodies are
    if (!this.ok) this.qv.fill(0);
    const S = this.srcs;
    for (let k = 0; k < S.length; k++) {
      const s = S[k], p = s.p, n = p.n, X = p.x, Y = p.y, A = p.alive, G = p.gen, R = s.r, C = s.clock;
      const bx = this.bx[k], by = this.by[k], ba = this.ba[k], bg = this.bg[k], br = this.br[k], bc = this.bc[k];
      this.bn[k] = n;
      for (let i = 0; i < n; i++) {
        ba[i] = A[i];
        if (!A[i]) continue;
        bx[i] = X[i]; by[i] = Y[i];
        if (bg && G) bg[i] = G[i];
        if (br && R) br[i] = R[i];
        if (bc && C) bc[i] = C[i];
      }
    }
    this.ppx = w.px; this.ppy = w.py;
    this.ok = true;
  }
  /** Draw-time: write lerp(before, now, a) in place (restore() puts the simulation's values back);
   *  enemies then go through the crowd filter over the frame's `dt` (s; 0 holds it). */
  apply(w: World, a: number, dt = 0): void {
    this.applied = false;
    if (!this.ok) return;
    const S = this.srcs, J2 = LERP_JUMP * LERP_JUMP;
    for (let k = 0; k < S.length; k++) {
      const s = S[k], p = s.p, n = p.n, X = p.x, Y = p.y, A = p.alive, G = p.gen, R = s.r, C = s.clock, up = !!s.up;
      const bx = this.bx[k], by = this.by[k], ba = this.ba[k], bg = this.bg[k], br = this.br[k], bc = this.bc[k];
      const sx = this.sx[k], sy = this.sy[k], sr = this.sr[k];
      this.sn[k] = n;
      const bn = this.bn[k];
      for (let i = 0; i < n; i++) {
        sx[i] = X[i]; sy[i] = Y[i];
        if (sr && R) sr[i] = R[i];
        // (a slot past the snapshot's loop bound was not there before: drawn where it is)
        if (i >= bn || !A[i] || !ba[i]) continue;
        if (bg && G && bg[i] !== G[i]) continue;
        if (bc && C && (up ? C[i] < bc[i] : C[i] > bc[i])) continue;
        const dx = X[i] - bx[i], dy = Y[i] - by[i];
        if (dx * dx + dy * dy > J2) continue;
        X[i] = bx[i] + dx * a; Y[i] = by[i] + dy * a;
        if (br && R) { const dr = R[i] - br[i]; if (Math.abs(dr) <= LERP_JUMP) R[i] = br[i] + dr * a; }
      }
      if (k === 0) this.crowd(n, X, Y, A, G, dt);
    }
    this.spx = w.px; this.spy = w.py;
    const dx = w.px - this.ppx, dy = w.py - this.ppy;
    if (dx * dx + dy * dy <= 4 * J2) { w.px = this.ppx + dx * a; w.py = this.ppy + dy * a; }
    w.tDraw = w.t - (1 - a) * STEP;
    // the effects clock: exactly t when α is ½ (every frame at 60 Hz: the picture is unchanged there)
    const d = (a - 0.5) * STEP;
    w.tFx = !this.fx || Math.abs(d) < 1e-9 ? w.t : w.t + d;
    w.dFx = w.tFx - w.t;
    this.applied = true;
  }
  /** The crowd filter (see CROWD_TAU) over pool 0's drawn positions, in place. */
  private crowd(n: number, X: Float32Array, Y: Float32Array, A: Uint8Array, G: Uint32Array | undefined, dt: number): void {
    const qx = this.qx, qy = this.qy, qvx = this.qvx, qvy = this.qvy, qg = this.qg, qv = this.qv, J2 = LERP_JUMP * LERP_JUMP;
    const ad = dt > 0 ? 1 - Math.exp(-dt / CROWD_DTAU) : 0;
    for (let i = 0; i < n; i++) {
      if (!A[i]) { qv[i] = 0; continue; }
      const ex = X[i] - qx[i], ey = Y[i] - qy[i];
      if (!qv[i] || (G && qg[i] !== G[i]) || ex * ex + ey * ey > J2) {
        qx[i] = X[i]; qy[i] = Y[i]; qvx[i] = qvy[i] = 0; qg[i] = G ? G[i] : 0; qv[i] = 1;
        continue;
      }
      if (dt > 0) {
        qvx[i] += (ex / dt - qvx[i]) * ad; qvy[i] += (ey / dt - qvy[i]) * ad;
        const cut = 1 / (2 * Math.PI * CROWD_TAU) + CROWD_BETA * Math.hypot(qvx[i], qvy[i]);
        const al = 1 - Math.exp(-dt * 2 * Math.PI * cut);
        qx[i] += ex * al; qy[i] += ey * al;
      }
      X[i] = qx[i]; Y[i] = qy[i];
    }
  }
  restore(w: World): void {
    if (!this.applied) return;
    this.applied = false;
    const S = this.srcs;
    for (let k = 0; k < S.length; k++) {
      const s = S[k], n = this.sn[k], X = s.p.x, Y = s.p.y, R = s.r, sx = this.sx[k], sy = this.sy[k], sr = this.sr[k];
      for (let i = 0; i < n; i++) { X[i] = sx[i]; Y[i] = sy[i]; }
      if (sr && R) for (let i = 0; i < n; i++) R[i] = sr[i];
    }
    w.px = this.spx; w.py = this.spy;
    w.tDraw = w.t;
    w.tFx = w.t; w.dFx = 0;
  }
}
/** A soft clamp to ±m: linear inside m − band, then eased (tanh) into the bound, so a camera that
 *  reaches the arena's edge decelerates over `band` u instead of stopping dead in one frame. */
function softClamp(t: number, m: number, band: number): number {
  if (!Number.isFinite(m)) return t;
  const b = Math.min(band, m), k = m - b, a = Math.abs(t);
  if (a <= k) return t;
  return Math.sign(t) * (k + (b > 0 ? b * Math.tanh((a - k) / b) : 0));
}
/** Unity-style SmoothDamp (critically damped; no overshoot on a target that stops). */
function smoothDamp(cur: number, target: number, vel: { v: number }, smoothTime: number, dt: number): number {
  if (dt <= 0) return cur;
  const omega = 2 / Math.max(1e-4, smoothTime), x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * e;
  let out = target + (change + temp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; vel.v = 0; }
  return out;
}
const MAX_STEPS = 4;
const DT_CLAMP = 0.05;
/** Dynamic resolution: the canvas dpr steps down these notches under load before the guard cuts any
 *  effect, and back up after long fast stretches (sprites are baked for the top notch, so a step only
 *  ever draws them smaller). */
export const RES_STEPS = [3, 2.5, 2, 1.5, 1.25, 1] as const;
/** The lowest notch by quality (low may fall to 1; mid and high keep 1.5 and cut effects instead). */
const RES_FLOOR = { low: 1, mid: 1.5, high: 1.5 } as const;
/** Fast seconds before a step back up, and how many step-ups a run allows (hysteresis: a device that
 *  was slow once steps back up at most once a run — each notch is a visible change of the picture). */
const RES_UP_AFTER = 60;
const RES_UPS = 1;
/** The camera's lead toward where you run: LEAD_PX css px, at most LEAD_U u (a far view must not swing
 *  100+ u ahead and drop the shooters behind you off the screen). It is re-aimed only while you run at
 *  ≥ half speed and held when you stop (the view never swings back), eased over LEAD_SMOOTH s. */
const LEAD_U = 70;
const LEAD_PX = 36;
const LEAD_SMOOTH = 0.3;
/** The camera's target eases into the arena's bounds over this many u (never a dead stop). */
const EDGE_BAND = 80;
/** Dash guard: the camera is rigid on you up to your walking speed; what the target moves beyond that in
 *  a frame (一剑光寒, 拖刀, 轻功, a leap, a pull) becomes a lag that drains at most CATCH × your walk in
 *  all, accelerating and braking at DASH_ACCEL u/s² per u/s of walk, so a dash glides, never whips. */
const CATCH = 2;
const DASH_ACCEL = 1 / 0.06;
/** A boss fight's zoom-out by view: the close view widens most; the far view already shows the field. */
const BOSS_ZOOM: Readonly<Record<ViewSize, number>> = { near: 0.84, mid: 0.92, far: 1 };
/** A painter that can re-bake its atlas at a new sprite scale (paint/index.ts InkPainter.rescale). */
type Rescalable = Painter & { k?: number; rescale?: (pxPerU: number, onProgress?: (done: number, total: number) => void, sliceMs?: number | (() => number)) => Promise<boolean> };
/** Re-bake slices: 6 ms a frame while you play (at most 36% of the frame's period: 3 ms at 120 Hz),
 *  24 ms behind a pause sheet or between waves. */
const REBAKE_SLICE = 6;
const REBAKE_SLICE_MIN = 1.5;
const REBAKE_SLICE_IDLE = 24;
/**
 * The guard's high-rate tier (m7 E): on a screen over 80 Hz (a frame period under HI_TIER_MS) it reaches
 * for up to HI_AIM_HZ. It watches the rate it achieves (a time-weighted average over ≈ 1 s): more than
 * HI_MISS short for 2 s sheds the overlays, then a notch of resolution at a time down to the high
 * floor (hiFloor: 2 on a DPR-3 screen, 1.5 on DPR 2; at most two notches) — never an effect; still
 * more than HI_HALF short at that floor, on a screen of ≥ HI_HALF_HZ, it presents on a steady half rate
 * (halfMs: a whole number of the display's vsyncs — 60 on 120, 240 and 360 Hz, 72 on 144, 82.5 on 165)
 * and gives the notches and overlays back. It never takes a notch when our own JS is most of the frame
 * (HI_JS: resolution cannot help), gives back a notch that did not raise the rate by 5% in 2 s (and
 * takes no more), holds a steady whole-vsync cadence at or above the half rate (already smooth), and on
 * a computer at 不限 never falls to a half rate below the rate it achieves. Back to full rate after
 * HI_RETRY s clean (doubling after each failed try, at most once a minute; a try never sheds); a notch
 * back after RES_UP_AFTER s under HI_CLEAN, HI_UPS times a run.
 */
const HI_TIER_MS = 12.5;
const HI_AIM_HZ = 120;
const HI_MISS = 0.1;
const HI_HALF = 0.2;
const HI_CLEAN = 0.02;
const HI_HALF_HZ = 110;
const HI_RETRY = 30;
const HI_RETRY_MAX = 240;
const HI_RETRY_GAP = 60;
const HI_UPS = 1;
/** The floor tier's threshold (ms): under 50 fps is slow (a cap under 50 fps: 1.2 × its period). */
const FLOOR_MS = 20;
/** Our own JS time a frame (workMs) at or over this share of the period aimed at: JS-bound (a notch of
 *  resolution cannot help; the floor tier cuts effects, the high tier goes to its half rate). */
const HI_JS = 0.85;
/**
 * Paced (paced()): the animation frames come on a tight, steady period (PACE_TIGHT of the ring within
 * max(10%, 1.2 ms) of it), on a rate a display or a browser paces at (a nominal display rate, or a whole
 * number of the known display's vsyncs), and our own JS is under PACED_WORK of it: the browser or the
 * display sets the pace (iOS Low Power Mode and Chrome's Energy Saver: 30; a panel that dropped to 60),
 * not our work, so no frame is "slow" for being on it, and a display that slowed so is re-learned after
 * PACE_S.
 */
const PACED_WORK = 0.4;
const PACE_TIGHT = 0.9;
const PACE_S = 1;
/** A high-tier notch must raise the rate by this much within RES_TRY_S, or it goes back. */
const RES_GAIN = 0.05;
const RES_TRY_S = 2;

class MirrorEngine implements Engine {
  readonly world: World;
  readonly input: EngineInput;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private painter: Painter;
  private renderer: Renderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private _paused = false;
  private disposed = false;
  private fatal = false;
  private lastErr = -1e9;
  private cam: Camera = { x: 0, y: 0, scale: 1, w: 1, h: 1, dpr: 1 };
  private cssW = 1;
  private cssH = 1;
  private arenaKey = '';
  private slowFor = 0;
  private fastFor = 0;
  /** Render interpolation, its alpha (acc / STEP after the frame's steps). */
  private lerp: LerpSet;
  private alpha = 1;
  /** The camera: the sticky lead (now, aimed, its SmoothDamp velocities), the target it followed last
   *  frame, the dash lag and its drain speed. */
  private leadX = 0; private leadY = 0; private leadTX = 0; private leadTY = 0;
  private leadVX = { v: 0 }; private leadVY = { v: 0 };
  private tgtX = 0; private tgtY = 0; private lagX = 0; private lagY = 0; private lagV = 0;
  /** A notch of dynamic resolution the guard asked for, applied at the top of the next frame (never
   *  after a draw, which would present the cleared canvas). */
  private pendingRes: -1 | 0 | 1 = 0;
  /** Inside frame(): a resize there is drawn by the frame itself. */
  private framing = false;
  /** The display's recent vsync intervals (s; every animation frame, drawn or skipped), for the vsync
   *  snap and the cap; a scratch copy to sort; this callback's period(). */
  private per = new Float64Array(PERIOD_N);
  private perS = new Float64Array(PERIOD_N);
  private perN = 0;
  private perI = 0;
  private pNow = NaN;
  /** How many of the ring's intervals the last period() averaged. */
  private perM = 0;
  /** How many of the ring's intervals sit tight on the last period() (paced()). */
  private perT = 0;
  /** The display's period (s): the shortest period() seen from a full-enough ring (a phone that can only
   *  keep 60 on a 120 Hz screen still showed its 120 once, on a light frame), re-learned when frames come
   *  paced slower for PACE_S with our work a small share (the display or the browser slowed: frame()). */
  private dispP = Infinity;
  private paceFor = 0;
  /** Our own JS ms a drawn frame (steps + draw calls), a time-weighted average over ≈ 0.4 s. */
  private workMs = 0;
  /** The drawn frames' cadence: its whole number of vsyncs, and how long (s) it has held. */
  private cadK = 0;
  private cadFor = 0;
  /** The high tier's notch on trial (RES_GAIN): when (the guard's clock; −1: none) and the rate before it;
   *  noRes: a notch did not help, so the tier takes no more this run. */
  private tryAt = -1;
  private tryRate = 0;
  private noRes = false;
  /** A fine pointer (a computer): at 不限 the high tier never falls below the rate it achieves. */
  private fine = false;
  /** The last animation frame's stamp (drawn or skipped), and the cap's credit (ms). */
  private lastCb = 0;
  private credit = 0;
  /** The frame cap (fps; 0: none). */
  private capHz = 0;
  /** The high-rate tier (HI_TIER_MS): its rate average (fps), seconds short, seconds clean, notches and
   *  overlays it took (and the cap before its first notch), half rate, a try back at full rate. */
  private hiRate = 0;
  private hiSlow = 0;
  private hiClean = 0;
  private hiNotches = 0;
  private hiShed = false;
  private hiCap0 = Infinity;
  private hiUps = HI_UPS;
  private half = false;
  private retrying = false;
  private retryFor = 0;
  private retryAfter = HI_RETRY;
  private lastRetry = -Infinity;
  /** Seconds of frames the guard has seen (its clock). */
  private clock = 0;
  /** A resolution cap to apply at the top of the next frame (the high tier giving its notches back). */
  private pendingCap: number | null = null;
  /** The frame-statistics window (1 s) and its last result. */
  private winN = 0; private winMs = 0; private winWork = 0;
  private fst: FrameStats = { fps: NaN, ms: NaN, work: NaN, hz: NaN, cap: 0, half: false };

  constructor(canvas: HTMLCanvasElement, run: RunSave, private deps: EngineDeps) {
    this.canvas = canvas;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null; } catch { ctx = null; }
    this.ctx = ctx;
    this.painter = deps.painter ?? createDebugPainter(run.map, deps.settings.quality, deps.settings.dprCap);
    // The UI paints the arena behind 研墨 before it builds the engine (API.md §4), so the first wave
    // does not paint it again; the engine repaints only when 倒影 turns on (wave 31).
    if (deps.painter) this.arenaKey = arenaKeyOf(run.map, run.seed, run.wave >= 30);
    this.renderer = new Renderer(this.painter);
    this.world = new World({ painter: this.painter, audio: deps.audio, content: deps.content, hooks: deps.hooks, settings: { ...deps.settings } });
    const w = this.world;
    w.tFx = w.t; w.dFx = 0;
    this.capHz = capOf(deps.settings.fps);
    try { this.fine = typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches; } catch { this.fine = false; }
    const F = w.feel;
    // everything the simulation moves and the renderer draws: enemies, your shots, enemy shots, drops,
    // summons, the world's particles, zones (radius too), damage numbers, the feel sparks and fragments
    this.lerp = new LerpSet(() => [
      { p: w.E }, { p: w.PS, clock: w.PS.life }, { p: w.ES, clock: w.ES.life }, { p: w.D, clock: w.D.age, up: true }, { p: w.S, clock: w.S.life },
      { p: w.P, clock: w.P.life }, { p: w.Z, r: w.Z.r }, { p: w.N, clock: w.N.age, up: true }, { p: F.sp, clock: F.sp.life }, { p: F.fr, clock: F.fr.life },
    ]);
    this.input = {
      move: (x, y) => { const m = Math.hypot(x, y); const k = m > 1 ? 1 / m : 1; w.moveX = x * k; w.moveY = y * k; },
      aim: (x, y) => { w.aimX = x; w.aimY = y; },
      cursor: (sx, sy) => { w.cursorX = sx; w.cursorY = sy; w.cursorT = 0; },
    };
    this.resize();
    // a painter baked for another view (or none given one) is re-baked when it would be drawn enlarged
    if (typeof document !== 'undefined') void this.ensureBake(true);
    installDev(this);
  }

  /** The view size in use (settings.view; 'mid' when unset). */
  get view(): ViewSize { return viewOf(this.deps.settings.view); }
  /** Whether sprites are being re-baked for a new view (the old ones draw meanwhile). */
  get baking(): boolean { return this.bakingN > 0; }
  private bakingN = 0;
  /**
   * Change the view size live: the camera takes the new scale at once (one resize; the picture under a
   * pause sheet redraws), and the painter re-bakes its sprites for it in the background (≈ 6 ms a
   * frame in play, 24 ms while paused; the old sprites draw until the new set is swapped in whole).
   * Resolves true once re-baked, false when no re-bake was needed. Same as setSettings({ view }).
   */
  setView(view: ViewSize): Promise<boolean> {
    const v = viewOf(view);
    if (this.view !== v) {
      this.deps.settings.view = v;
      this.world.settings.view = v;
      this.resize();
    }
    return this.ensureBake(false);
  }
  private rebake: Promise<boolean> = Promise.resolve(false);
  /**
   * Re-bake the painter's sprites for the view when its scale is off: by > 8% either way after a view
   * change (`upOnly` false), or (at construction) only when sprites would be drawn > 15% enlarged.
   * A window resize never re-bakes (it only changes the camera).
   */
  private ensureBake(upOnly: boolean): Promise<boolean> {
    const P = this.painter as Rescalable;
    if (this.disposed || typeof P.rescale !== 'function' || typeof P.k !== 'number' || !(P.k > 0)) return Promise.resolve(false);
    const target = this.bakeTarget();
    const off = (target - P.k) / P.k;
    if (upOnly ? off < 0.15 : Math.abs(off) < 0.08) return this.bakingN ? this.rebake : Promise.resolve(false);
    this.bakingN++;
    const slice = () => (this._paused || this.world.phase !== 'wave' ? REBAKE_SLICE_IDLE : Math.max(REBAKE_SLICE_MIN, Math.min(REBAKE_SLICE, 0.36 * this.frameMsTarget())));
    const p = P.rescale(target, undefined, slice).then((ok) => {
      // the new sprites under a pause sheet or the wave's end: redraw the still picture
      if (ok && !this.disposed && (this._paused || this.world.phase !== 'wave')) this.drawFrame(0, true);
      return ok;
    }, (e) => { console.warn('[mirror engine] rebake', e); return false; });
    p.then(() => { this.bakingN--; }, () => { this.bakingN--; });
    this.rebake = p;
    return p;
  }
  /** The sprite scale this screen and view want (as ui/Run.tsx spriteScale: a desktop window may grow,
   *  so with a fine pointer it bakes for a short side of at least 600 css px). */
  private bakeTarget(): number {
    let w = this.cssW, h = this.cssH;
    let fine = false;
    try { fine = typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches; } catch { fine = false; }
    if (fine) { w = Math.max(w, 600); h = Math.max(h, 600); }
    return bakeScale(w, h, this.dprTop(), this.deps.settings.quality, this.view);
  }
  /** The top canvas dpr (the settings' cap, no dynamic notch): what sprites are baked for. */
  private dprTop(): number {
    const dprRaw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.max(1, Math.min(dprRaw, this.deps.settings.dprCap || 2));
  }

  get phase(): EnginePhase {
    if (this.disposed) return 'disposed';
    if (this.fatal) return 'dead';
    return this.world.phase;
  }
  get paused(): boolean { return this._paused; }
  /** The last won wave's result, kept in case the UI's waveEnd handler failed (null until one is won). */
  get lastResult(): WaveResult | null { return this.world.lastResult; }

  start(run: RunSave, setup: WaveSetup): void {
    if (this.disposed) return;
    this.fatal = false;
    this.world.begin(run, setup);
    // the arena layer: painted once per map and seed; 倒影 from wave 31
    const inverted = setup.wave > 30;
    const key = arenaKeyOf(run.map, run.seed, inverted);
    if (key !== this.arenaKey) {
      try { this.painter.paintArena(this.world.arena, run.seed, inverted); } catch (e) { console.warn('[mirror engine] arena', e); }
      this.arenaKey = key;
    }
    this.cam.x = this.world.px; this.cam.y = this.world.py;
    this.leadX = this.leadY = this.leadTX = this.leadTY = 0; this.leadVX.v = this.leadVY.v = 0;
    this.tgtX = this.world.px; this.tgtY = this.world.py; this.lagX = this.lagY = this.lagV = 0;
    this.lerp.ok = false;
    this._paused = false;
    // half a step in: the accumulator's phase sits mid-step, far from the boundary where clock jitter
    // decides between 0 and 2 steps
    this.acc = STEP / 2;
    this.last = 0; this.lastCb = 0; this.credit = 0; this.phased = false;
    this.loop();
  }

  pause(): void {
    if (this._paused) return;
    this._paused = true;
    // held movement is kept: the simulation does not step while paused, and a key or finger still
    // held when the boss card or the pause sheet closes must keep moving you (the UI clears its held
    // keys on blur and sends move(0, 0) on release)
  }
  resume(): void {
    if (!this._paused || this.disposed) return;
    this._paused = false;
    // the accumulator is kept: the still picture was drawn at its α, and the first frame goes on from
    // there by one vsync (frame()), not a jump of 1–1.75 steps
    this.last = 0; this.lastCb = 0; this.credit = 0; this.phased = false;
    this.loop();
  }
  /** 破镜重圆 (types.ts Engine.revive): rise, and play on (a pause is lifted). False unless down. */
  revive(): boolean {
    if (this.disposed || this.fatal || !this.world.revive()) return false;
    this._paused = false;
    this.last = 0; this.lastCb = 0; this.credit = 0; this.phased = false;
    this.acc = STEP / 2;
    // the blast throws the bodies near you far: no "before" to draw them from
    this.lerp.ok = false;
    this.loop();
    return true;
  }
  /** Decline the revive (types.ts Engine.giveUp): hooks.death, phase 'dead'. */
  giveUp(): void {
    if (this.disposed || this.world.phase !== 'down') return;
    this.world.giveUp();
    if (!this.raf) this.drawFrame(0, true);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    try { this.painter.dispose(); } catch { /* ignore */ }
    const g = globalThis as unknown as { __mirror?: { engine?: unknown } };
    if (g.__mirror?.engine === this) delete g.__mirror;
  }

  resize(): void {
    const c = this.canvas;
    let w = 0, h = 0;
    try { const r = c.getBoundingClientRect(); w = r.width; h = r.height; } catch { /* not in a document */ }
    if (!w || !h) { w = c.clientWidth || c.width || 1; h = c.clientHeight || c.height || 1; }
    const dpr = this.dprNow();
    this.cssW = w; this.cssH = h;
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    // assigning the canvas's size clears its bitmap
    let realloc = false;
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; realloc = true; }
    this.cam.w = pw; this.cam.h = ph; this.cam.dpr = dpr;
    // the shorter side shows the view's span (paint/draw.ts VIEW_SPAN: 440 / 700 / 820 u); the painter
    // bakes its sprites from the same viewScale (bakeScale), so they are drawn ≤ 1:1. The zoom on top of
    // it (a boss fight's, easing in or out) is kept: a notch or a resize never snaps it
    const z = this.baseScale > 0 ? this.cam.scale / this.baseScale : 1;
    this.baseScale = viewScale(w, h, this.view) * dpr;
    this.cam.scale = this.baseScale * (Number.isFinite(z) && z > 0 ? z : 1);
    // a cleared canvas is redrawn now, whoever resized it (the guard's notch, the UI's ResizeObserver,
    // which runs after the frame's draw): held, so the camera stays; inside a frame, its own draw follows
    if (realloc && this.world.run && !this.disposed && !this.framing) this.drawFrame(0, true);
    else if (!this.framing && (this._paused || this.world.phase !== 'wave')) this.drawFrame();
  }
  private baseScale = 1;
  /** The dynamic-resolution ceiling on the canvas dpr (Infinity: the settings' cap alone). */
  private resCap = Infinity;
  private resUps = RES_UPS;
  /** The canvas dpr now: the device's, within the settings' cap and the dynamic notch. */
  private dprNow(): number {
    const dprRaw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.max(1, Math.min(dprRaw, this.deps.settings.dprCap || 2, this.resCap));
  }
  /** The canvas dpr the engine is drawing at (dev, perf probe). */
  get resolution(): number { return this.cam.dpr; }
  /**
   * One notch of dynamic resolution: dir −1 steps the canvas dpr down (false when already at the
   * quality's floor), +1 back up toward the cap. One resize: a canvas reallocation (≈ 1–3 ms).
   */
  /** Whether a notch that way exists (the guard asks before it queues one). */
  private canStep(dir: -1 | 1): boolean {
    const cur = this.cam.dpr;
    const dprRaw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const top = Math.max(1, Math.min(dprRaw, this.deps.settings.dprCap || 2));
    if (dir < 0) {
      const floor = Math.min(top, RES_FLOOR[this.deps.settings.quality] ?? 1.5);
      return RES_STEPS.some((d) => d < cur - 0.01 && d >= floor - 0.001);
    }
    return this.resCap !== Infinity && cur < top - 0.01;
  }
  private stepRes(dir: -1 | 1): boolean {
    const cur = this.cam.dpr;
    const dprRaw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const top = Math.max(1, Math.min(dprRaw, this.deps.settings.dprCap || 2));
    if (dir < 0) {
      const floor = Math.min(top, RES_FLOOR[this.deps.settings.quality] ?? 1.5);
      const next = RES_STEPS.find((d) => d < cur - 0.01 && d >= floor - 0.001);
      if (next === undefined) return false;
      this.resCap = next;
    } else {
      if (this.resCap === Infinity || cur >= top - 0.01) { this.resCap = Infinity; return false; }
      const up = [...RES_STEPS].reverse().find((d) => d > cur + 0.01);
      this.resCap = up === undefined || up >= top - 0.01 ? Infinity : up;
    }
    this.resize();
    return true;
  }

  skill(t?: SkillTarget): void {
    const w = this.world;
    if (this._paused || w.phase !== 'wave') return;
    if (!t || t.kind === 'auto') { w.castSkill(null, null); return; }
    if (t.kind === 'screen') {
      const p = this.screenToWorld(t.sx, t.sy);
      const dx = p.x - w.px, dy = p.y - w.py, d = Math.hypot(dx, dy) || 1;
      w.castSkill(p, { x: dx / d, y: dy / d });
      return;
    }
    const d = Math.hypot(t.x, t.y) || 1;
    const reach = w.skillDef?.reach ?? 200;
    w.castSkill({ x: w.px + (t.x / d) * reach, y: w.py + (t.y / d) * reach }, { x: t.x / d, y: t.y / d });
  }
  skillPreview(t: SkillTarget | null): void {
    const w = this.world;
    if (!t) { w.skillPreview = null; return; }
    if (t.kind === 'screen') { w.skillPreview = this.screenToWorld(t.sx, t.sy); return; }
    if (t.kind === 'dir') {
      const d = Math.hypot(t.x, t.y) || 1, reach = w.skillDef?.reach ?? 200;
      w.skillPreview = { x: w.px + (t.x / d) * reach, y: w.py + (t.y / d) * reach };
      return;
    }
    w.skillPreview = null;
  }
  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const c = this.cam;
    return { x: (sx * c.dpr - c.w / 2) / c.scale + c.x, y: (sy * c.dpr - c.h / 2) / c.scale + c.y };
  }
  /**
   * The rectangles the UI's HUD covers, in css px from the canvas's top-left (negative x / y: from the
   * right / bottom edge), so the off-screen chevrons never sit under it and a threat under it counts as
   * unseen (engine/threats.ts). null: the default for today's HUD (threats.ts HUD_DEFAULT: the top 68
   * px, the 镇 button's 104 × 108 corner); []: none. Call it on mount and whenever the HUD's layout
   * changes (a resize, the skill button shown or hidden); at most 8 rectangles, applied from the next
   * frame. No allocation per frame.
   */
  setHudRects(rects: readonly HudRect[] | null): void {
    this.renderer.threats.setHud(rects);
  }
  /** Settings apply live; `view` goes through setView (a new camera scale, a background re-bake); `fps`
   *  sets the frame cap from the next animation frame. */
  setSettings(p: Partial<EngineSettings>): void {
    const { view, ...rest } = p;
    Object.assign(this.deps.settings, rest);
    Object.assign(this.world.settings, rest);
    if (p.dprCap !== undefined) this.resize();
    if (view !== undefined) void this.setView(view);
    if ('fps' in p) {
      const cap = capOf(p.fps);
      if (cap !== this.capHz) {
        this.capHz = cap;
        this.credit = 0;
        // a new aim: the high tier starts over (what it took is given back; a tier it no longer applies
        // to would never give it back)
        this.hiReset(true);
      }
    }
  }
  snapshot(w: number, h: number): HTMLCanvasElement | null {
    if (!this.arenaKey) return null;
    try { return this.painter.arenaImage(w, h); } catch { return null; }
  }

  // ─────────────────────────────────────────────── the loop

  /** Frames run: in play, and while the fall of 'down' animates — even under a pause (the UI's dialog
   *  may pause on `downed`; the world is frozen while down anyway, only the fall's clock runs). */
  private running(): boolean {
    if (this.disposed || this.fatal) return false;
    if (this.world.downAnimating) return true;
    const ph = this.world.phase;
    return !this._paused && (ph === 'wave' || ph === 'ending');
  }
  private loop(): void {
    if (this.raf || this.disposed || this.fatal) return;
    if (this._paused && !this.world.downAnimating) return;
    // no animation frames (node tests): the caller drives stepN()
    if (typeof requestAnimationFrame !== 'function') return;
    const raf = requestAnimationFrame;
    const tick = (now: number) => {
      this.raf = 0;
      if (this.disposed || this.fatal || (this._paused && !this.world.downAnimating)) return;
      this.frame(now);
      // one loop only: a hook that answered inside this frame (a synchronous revive(), a resume) has
      // already scheduled the next frame
      if (this.raf) return;
      // (down: until the fall has settled, then its last frame holds — see engine/down.ts)
      if (this.running()) this.raf = raf(tick);
      // the last picture under a pause, the boss card or the wave's end: the camera stays put (a dt = 0
      // redraw would close its follow lag in one jump as the card comes up)
      else if (!this.disposed) this.drawFrame(0, true);
    };
    this.raf = raf(tick);
  }
  private stop(): void {
    if (!this.raf) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * One animation frame (a vsync): its interval feeds the display's period; the frame cap may skip it
   * (nothing steps or draws); otherwise fixed steps, then draw (between the last two steps).
   */
  frame(now: number): void {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    // this vsync's interval (ms; 0 on the first callback after start/resume), drawn or not
    const cb = this.lastCb ? now - this.lastCb : 0;
    this.lastCb = now;
    if (hidden) { this.last = now; return; }
    if (cb > 0 && cb < 100) { this.per[this.perI] = cb / 1000; this.perI = (this.perI + 1) % PERIOD_N; if (this.perN < PERIOD_N) this.perN++; }
    this.pNow = this.period();
    // (a steady period: at least 16 of the ring's intervals agree on it)
    if (this.perM >= 16) {
      if (this.pNow < this.dispP) this.setDisp(this.pNow);
      // frames paced slower than the display we knew, our own work a small share of them: the display or
      // the browser slowed (a panel that fell to 60, Low Power Mode's 30), not us — re-learned
      else if (this.pNow > 1.25 * this.dispP && this.paced()) { this.paceFor += cb / 1000; if (this.paceFor >= PACE_S) this.setDisp(this.pNow); }
      else this.paceFor = 0;
    }
    if (this.last && !this.due(cb)) return;
    // the first frame after start / resume / revive moves one vsync (a step until the display is known)
    let dt = this.last ? (now - this.last) / 1000 : this.pNow > 0 ? Math.min(STEP, this.pNow) : STEP;
    // the unclamped interval since the last drawn frame, in ms (0 on the first frame after start/resume)
    const interval = this.last ? now - this.last : 0;
    this.last = now;
    dt = snapStep(Math.min(DT_CLAMP, Math.max(0, dt)), this.pNow);
    if (!this.phased) this.phase0(dt);
    const w = this.world;
    this.framing = true;
    try { this.frameIn(w, dt, interval); } finally { this.framing = false; }
  }
  /**
   * The accumulator's phase, once the snap first locks after start / resume / revive: the few raw
   * frames before the display's period is known leave it up to a clock tick off half a step; on a
   * rate whose vsyncs divide the step (60, 120, 180, 240, 300, 360 Hz) it is put back on the lattice
   * the start's half step makes (≤ half a vsync of game time, once), so at 60 Hz every frame draws at
   * α = ½ exactly (the effects clock is then `t` itself) and the step boundary is as far as it can be.
   */
  private phase0(dt: number): void {
    const P = nominalPeriod(this.pNow);
    if (!(P > 0) || !(dt > 0)) return;
    const k = Math.round(dt / P);
    if (k < 1 || k * P !== dt) return; // not snapped yet
    this.phased = true;
    const m = STEP / P;
    if (Math.abs(m - Math.round(m)) > 1e-9) return;
    // the nearest lattice point (never wrapped: a whole step of game time is never lost or added)
    const L = STEP / 2, j = Math.round((this.acc - L) / P);
    let a = L + j * P;
    if (a < 0) a += P;
    if (Math.abs(a - this.acc) > 1e-12) this.acc = a;
  }
  /** The accumulator's phase has been set since the last start / resume / revive (phase0). */
  private phased = false;
  /** The cap: whether this vsync (cb ms after the last) is drawn — every k-th (capVsyncs), steadily. */
  private due(cb: number): boolean {
    const T = this.capMs();
    const P = this.vsyncMs();
    const k = capVsyncs(T, P);
    if (k <= 1) { this.credit = 0; return true; }
    const Te = k * P;
    this.credit += cb;
    if (this.credit < Te - P / 2) return false;
    // (re-locked to the vsyncs: what is left over is only the clock's jitter)
    this.credit = Math.max(-P / 4, Math.min(P / 4, this.credit - Te));
    return true;
  }
  /** The period the cap asks for (ms; 0: every vsync): the setting's, or the guard's half rate. */
  private capMs(): number {
    const u = this.capHz > 0 ? 1000 / this.capHz : 0;
    return this.half ? Math.max(u, this.halfMs()) : u;
  }
  /** The period the cap presents at (ms; 0: none): its whole vsyncs (due(); 60 on 90 Hz: 22.2), or its
   *  own period when it draws every vsync (frames slower than that are the device's). */
  private capEffMs(): number {
    const T = this.capMs(), P = this.vsyncMs(), k = capVsyncs(T, P);
    return k > 1 ? k * P : T;
  }
  /** The display's vsync (ms) the cap counts in: the display's period once known (the recent period of
   *  animation frames says how slow we were, not the screen), else the recent one. */
  private vsyncMs(): number {
    return Number.isFinite(this.dispP) ? this.dispMs() : this.pNow * 1000;
  }
  /** The display's period (ms): its nominal rate's when it names one (the fastest period seen is a
   *  noisy minimum: Safari's 1 ms stamps at 360 Hz), else as measured. */
  private dispMs(): number {
    const N = nominalPeriod(this.dispP);
    return (N > 0 ? N : this.dispP) * 1000;
  }
  /** The high tier's half rate (ms): a whole number of the display's vsyncs, at least two, the most
   *  that fit twice the aim's period (60 on 120 / 240 / 360 Hz, 72 on 144 Hz, 82.5 on 165 Hz). */
  private halfMs(): number {
    const aim = this.aimMs(), P = this.dispMs();
    if (!(P > 0) || !Number.isFinite(P)) return 2 * aim;
    return Math.max(2, Math.floor((2 * aim) / P + CAP_TOL)) * P;
  }
  /** A new display period (s); a real change (> 10%) starts the high tier's measures afresh. */
  private setDisp(p: number): void {
    const big = !Number.isFinite(this.dispP) || Math.abs(p - this.dispP) > 0.1 * this.dispP;
    this.dispP = p;
    this.paceFor = 0;
    if (big) { this.hiRate = 0; this.hiSlow = 0; this.hiClean = 0; this.cadK = 0; this.cadFor = 0; }
  }
  /** The browser or the display sets the pace (PACED_WORK): a tight, steady period of animation frames
   *  with our own JS a small share of it. */
  private paced(): boolean {
    const P = this.pNow * 1000;
    if (!(this.perN >= 24 && this.perT >= PACE_TIGHT * this.perN && P > 0 && this.workMs < PACED_WORK * P)) return false;
    // (on a rate a browser or a panel paces at: a display's own (30, 48, 60, 72 …), or a whole number of
    // the known display's vsyncs; a steady 25 or 22 fps is a slow device)
    if (nominalPeriod(this.pNow) > 0) return true;
    if (!Number.isFinite(this.dispP)) return false;
    const V = this.dispMs(), k = Math.round(P / V);
    return k >= 2 && Math.abs(P - k * V) <= 0.1 * V;
  }
  /** The period the high tier aims to hold (ms): the cap's, the display's, and never under 1/HI_AIM_HZ. */
  private aimMs(): number {
    return Math.max(this.capHz > 0 ? 1000 / this.capHz : 0, Number.isFinite(this.dispP) ? this.dispP * 1000 : 0, 1000 / HI_AIM_HZ);
  }
  /** The period frames are meant to come at now (ms): the cap's, or the display's (1/60 until known). */
  private frameMsTarget(): number {
    const P = this.pNow > 0 ? this.pNow * 1000 : 1000 / 60;
    return Math.max(this.capEffMs(), P);
  }
  private frameIn(w: World, dt: number, interval: number): void {
    // a notch the guard asked for last frame: applied before this frame steps and draws
    if (this.pendingCap !== null) { this.resCap = this.pendingCap; this.pendingCap = null; this.pendingRes = 0; this.resize(); }
    if (this.pendingRes) { const d = this.pendingRes; this.pendingRes = 0; this.stepRes(d); }
    const t0 = performanceNow();
    // hitstop holds the simulation (the frame still draws; the feel clock runs on)
    const frozen = w.hitstopMs > 0 ? Math.min(dt * 1000, w.hitstopMs) : 0;
    if (w.hitstopMs > 0) {
      w.hitstopMs -= dt * 1000;
      if (w.hitstopMs > 0) dt = 0;
      else {
        dt = Math.min(dt, -w.hitstopMs / 1000);
        // a stop that ends mid-frame leaves the accumulator off its lattice: phase0() puts it back on the
        // next frame (≤ half a vsync of game time, once), so at 60 Hz α is ½ again and the effects clock is t
        this.phased = false;
      }
    }
    const real = Math.min(DT_CLAMP * 1000, interval > 0 ? interval : STEP * 1000);
    this.acc += dt;
    let steps = 0;
    const draws = this.ctx !== null;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.acc -= STEP;
      steps++;
      if (draws) this.lerp.snap(w);
      if (!this.safeStep()) return;
      if (w.pauseRequest) { w.pauseRequest = false; this.pause(); break; }
      if (w.phase !== 'wave' && w.phase !== 'ending' && w.phase !== 'down') break;
    }
    if (this.acc > STEP * MAX_STEPS) this.acc = 0;
    // during a hitstop acc does not move, so α (and the picture) holds
    this.alpha = Math.max(0, Math.min(1, this.acc / STEP));
    const t1 = performanceNow();
    try { w.feel.frame(real, frozen); } catch { /* cosmetic */ }
    // held only while the world is fully frozen: the frame a stop releases has advanced the world (and
    // the drawn picture), so the camera moves with it that same frame
    this.drawFrame(dt, frozen > 0 && dt === 0);
    const t2 = performanceNow();
    w.perf.canvasMs = w.perf.canvasMs * 0.95 + (t2 - t1) * 0.05;
    // our own JS a drawn frame, over time (≈ 0.4 s): paced() and the guard's JS-bound test
    const wk = t2 - t0;
    this.workMs = this.workMs > 0 ? this.workMs + (wk - this.workMs) * (1 - Math.exp(-Math.max(1, real) / 400)) : wk;
    // perf: EMA of simulation ms per step; the draw figure is the whole frame interval (the raster
    // work happens after our canvas calls return, so timing them alone says nothing on a slow phone)
    if (steps) w.perf.lastSim = (t1 - t0) / steps;
    w.perf.simMs = w.perf.simMs * 0.95 + w.perf.lastSim * 0.05;
    this.guard(interval);
    // frames drawn over wall time (a stop's frames count: they are drawn), in 1 s windows
    if (interval > 0 && interval <= 250) {
      this.winN++; this.winMs += interval; this.winWork += t2 - t0;
      if (this.winMs >= 1000) {
        const f = this.fst;
        f.fps = (this.winN * 1000) / this.winMs; f.ms = this.winMs / this.winN; f.work = this.winWork / this.winN;
        f.hz = this.displayHz; f.cap = this.capHz; f.half = this.half;
        w.fps = f.fps;
        this.winN = 0; this.winMs = 0; this.winWork = 0;
      }
    }
  }
  /** The display's period (s): the mean of the recent vsync intervals within [0.5, 1.6] × their lower
   *  quartile (a dropped frame, a hiccup or a stray short one is left out; Safari's 1 ms stamps average
   *  out over the ring), NaN until there are four. */
  private period(): number {
    const n = this.perN;
    if (n < 4) return NaN;
    const s = this.perS;
    for (let i = 0; i < n; i++) {
      const v = this.per[i];
      let j = i;
      while (j > 0 && s[j - 1] > v) { s[j] = s[j - 1]; j--; }
      s[j] = v;
    }
    const q = s[n >> 2], lo = 0.5 * q, hi = 1.6 * q;
    let sum = 0, m = 0;
    for (let i = 0; i < n; i++) { const v = s[i]; if (v >= lo && v <= hi) { sum += v; m++; } }
    this.perM = m;
    if (!m) { this.perT = 0; return NaN; }
    // (how many sit tight on it: within max(10%, 1.2 ms), Safari's 1 ms stamps included — paced())
    const mean = sum / m, tol = Math.max(0.1 * mean, 0.0012);
    let tight = 0;
    for (let i = 0; i < n; i++) if (Math.abs(s[i] - mean) <= tol) tight++;
    this.perT = tight;
    return mean;
  }
  /** The display's refresh rate (Hz) as measured: the fastest steady rate of animation frames seen, or
   *  the slower one the browser or the display has paced them at since (paced(): Safari on iOS gives 60
   *  unless its 60 fps preference is off, 30 in Low Power Mode); NaN until known. */
  get displayHz(): number { return Number.isFinite(this.dispP) ? 1 / this.dispP : NaN; }
  /** The last 1 s window of frames (the 显示帧率 readout): fps, ms a frame, our JS ms a frame, the
   *  display's Hz, the cap, the half rate. A live object: copy what you keep. */
  get frameStats(): Readonly<FrameStats> { return this.fst; }

  /**
   * The frame-time guard (GDD §24.3), two tiers.
   *
   * The floor tier: when frames arrive more than 20 ms apart (under ~50 fps; with a cap under 50 fps,
   * 1.2 × the period it presents at; frames the browser or the display paces (paced(): Low Power
   * Mode's 30) are never slow for that) for 2 s, give something up, cheapest to lose first: the paper's
   * full-screen overlays (grain, vignette), then a notch of resolution at a time, then particles and
   * player effects (degrade). A JS-bound frame (HI_JS) skips straight to the effects (resolution cannot
   * help it). Recovery
   * runs the other way: effects after 8 s of fast frames, then a notch of resolution (or the overlays,
   * last) after each long fast stretch, a few times a run.
   *
   * The high-rate tier (HI_TIER_MS, hiGuard): on a screen over 80 Hz it reaches for up to 120 fps with
   * the overlays and at most two notches, never an effect, and falls back to a steady half rate.
   *
   * Both read the real interval between drawn frames, so a device limited by rasterising trips them
   * too; the average is over time (≈ 150 ms), so a hitch weighs the same at 60 and at 240 Hz. Intervals
   * over 250 ms (a tab switch, a GC pause, a breakpoint) are ignored.
   */
  private guard(ms: number): void {
    const w = this.world;
    if (ms <= 0 || ms > 250) return;
    w.perf.lastDraw = ms;
    w.perf.drawMs = w.perf.drawMs * 0.95 + ms * 0.05;
    this.frameMs += (ms - this.frameMs) * (1 - Math.exp(-ms / 150));
    const s = ms / 1000;
    this.clock += s;
    // (the pace the browser or the display sets is never slow: 1.2 × it)
    const floorMs = Math.max(FLOOR_MS, 1.2 * this.capEffMs(), this.paced() ? 1.2 * this.pNow * 1000 : 0);
    const slow = this.frameMs > floorMs;
    if (slow) { this.slowFor += s; this.fastFor = 0; } else { this.fastFor += s; if (this.fastFor > 3) this.slowFor = 0; }
    // the high tier's notch on trial: kept when it raised the rate, else given back (and no more this run)
    if (this.tryAt >= 0 && !this.pendingRes && this.pendingCap === null && this.clock - this.tryAt >= RES_TRY_S) {
      const helped = this.hiRate >= (1 + RES_GAIN) * this.tryRate;
      this.tryAt = -1;
      if (!helped) { this.noRes = true; if (this.hiNotches > 0) { this.hiNotches--; this.pendingRes = 1; } }
    }
    // slow: first the overlays, then a notch of resolution (every 2 s while still slow), then effects;
    // JS-bound (our own work is most of the frame): straight to the effects, which is what cuts it
    if (this.slowFor > 2) {
      const js = this.workMs >= HI_JS * floorMs;
      if (!w.degrade && !js && this.shedOverlays(true)) this.slowFor = 0;
      else if (!w.degrade && !js && this.canStep(-1)) { this.pendingRes = -1; this.slowFor = 0; }
      else if (!w.degrade) w.degrade = 1;
    }
    // fast again: effects come back first; resolution, then the overlays, only after a long fast stretch
    if (w.degrade && this.fastFor > 8) w.degrade = 0;
    else if (!w.degrade && this.resUps > 0 && this.fastFor > RES_UP_AFTER && (this.resCap !== Infinity || this.overlaysShed())) {
      if (this.resCap !== Infinity ? this.canStep(1) && ((this.pendingRes = 1), true) : this.shedOverlays(false)) this.resUps--;
      this.fastFor = 0;
    }
    this.hiGuard(ms, s, slow || w.degrade > 0);
  }
  /** The high-rate tier (see HI_TIER_MS); `floor`: the floor tier is at work (this one stands by). */
  private hiGuard(ms: number, s: number, floor: boolean): void {
    // (the display must be known: its fastest period, from a full-enough ring)
    if (!Number.isFinite(this.dispP)) return;
    const aim = this.aimMs();
    if (!(aim < HI_TIER_MS)) { if (this.half || this.hiNotches || this.hiShed) this.hiReset(true); return; }
    const T = this.half ? this.halfMs() : aim;
    // the rate achieved: frames over time (each frame weighs its interval), ≈ 1 s
    if (!(this.hiRate > 0)) this.hiRate = 1000 / T;
    this.hiRate += (1000 / ms - this.hiRate) * (1 - Math.exp(-ms / 1000));
    const miss = Math.max(0, 1 - (this.hiRate * T) / 1000);
    // the drawn frames' cadence: the same whole number (≥ 2) of vsyncs frame after frame is steady
    const P = this.dispMs(), k = Math.round(ms / P);
    if (k >= 2 && Math.abs(ms - k * P) <= 0.15 * P && k === this.cadK) this.cadFor += s;
    else { this.cadK = k; this.cadFor = 0; }
    if (floor || this.bakingN > 0 || this.pendingRes || this.pendingCap !== null) { this.hiSlow = 0; this.hiClean = 0; return; }
    // frames paced slower than the display we knew, not by us: the display is being re-learned (frame())
    if (this.pNow * 1000 > 1.25 * P && this.paced()) { this.hiSlow = 0; this.hiClean = 0; return; }
    if (this.half) {
      // a steady half rate: back to full after a clean stretch (at most once a minute)
      this.hiClean = miss < HI_CLEAN ? this.hiClean + s : 0;
      if (this.hiClean > this.retryAfter && this.clock - this.lastRetry >= HI_RETRY_GAP) {
        this.half = false; this.retrying = true; this.retryFor = 0; this.lastRetry = this.clock;
        this.hiSlow = 0; this.hiClean = 0; this.credit = 0; this.hiRate = 1000 / aim;
      }
      return;
    }
    if (miss > HI_MISS) { this.hiSlow += s; this.hiClean = 0; } else { this.hiSlow = 0; this.hiClean = miss < HI_CLEAN ? this.hiClean + s : 0; }
    if (this.retrying) {
      // a try at full rate sheds nothing: it holds, or it goes back to half and waits longer next time
      this.retryFor += s;
      if (this.hiSlow > 2 && miss > HI_HALF) { this.goHalf(); this.retryAfter = Math.min(HI_RETRY_MAX, this.retryAfter * 2); return; }
      if (this.retryFor > 5 && miss <= HI_MISS) { this.retrying = false; this.retryAfter = HI_RETRY; }
      // neither: a mild shortfall after 10 s goes back to the usual rules (overlays, notches, half)
      else if (this.retryFor > 10) { this.retrying = false; this.hiSlow = 0; }
      return;
    }
    if (this.hiSlow > 2) {
      this.hiSlow = 0;
      const halfHz = 1000 / this.halfMs();
      // already a steady whole-vsync cadence at or above the half rate: smooth as it is, held
      if (this.cadFor > 1 && 1000 / (this.cadK * P) >= 0.95 * halfHz) return;
      // the half rate: on a screen fast enough for it, and (at 不限 on a computer) never below the rate
      // achieved
      const halve = miss > HI_HALF && 1000 / aim >= HI_HALF_HZ && (!(this.capHz === 0 && this.fine) || this.hiRate < (1 + RES_GAIN) * halfHz);
      // JS-bound: resolution cannot help (nor the overlays): the half rate, or hold
      if (this.workMs >= HI_JS * aim) { if (halve) this.goHalf(); return; }
      if (!this.overlaysShed() && this.shedOverlays(true)) this.hiShed = true;
      else if (!this.noRes && this.canStepHi()) { if (!this.hiNotches) this.hiCap0 = this.resCap; this.hiNotches++; this.pendingRes = -1; this.tryStep(); }
      else if (halve) this.goHalf();
      return;
    }
    // clean for a long stretch: a notch back (its own budget)
    if (this.hiNotches > 0 && this.hiUps > 0 && this.hiClean > RES_UP_AFTER && this.canStep(1)) {
      this.hiNotches--; this.hiUps--; this.hiClean = 0; this.pendingRes = 1;
    }
  }
  /** Present on the half rate (halfMs: a steady whole-vsync cadence), giving back what the tier took. */
  private goHalf(): void {
    this.half = true; this.retrying = false; this.credit = 0; this.tryAt = -1;
    this.hiSlow = 0; this.hiClean = 0; this.hiRate = 1000 / this.halfMs();
    this.giveBack();
  }
  /** The high tier's notch just queued goes on trial (RES_GAIN). */
  private tryStep(): void {
    this.tryAt = this.clock; this.tryRate = this.hiRate;
  }
  /** Give back the high tier's notches and overlays. */
  private giveBack(): void {
    if (this.hiNotches) { this.pendingCap = this.hiCap0; this.hiNotches = 0; }
    if (this.hiShed) { this.shedOverlays(false); this.hiShed = false; }
  }
  /** The high tier from the start (a new cap): full rate; `back`: give back what it took. */
  private hiReset(back: boolean): void {
    if (back) this.giveBack();
    this.tryAt = -1;
    this.half = false; this.retrying = false; this.hiSlow = 0; this.hiClean = 0; this.retryAfter = HI_RETRY;
    this.hiRate = 1000 / this.aimMs();
  }
  /** Whether the high tier may take a notch: at most two, never under hiFloor. */
  private canStepHi(): boolean {
    if (this.hiNotches >= 2) return false;
    const cur = this.cam.dpr, top = this.dprTop();
    const floor = Math.max(RES_FLOOR[this.deps.settings.quality] ?? 1.5, top >= 2.75 ? 2 : top >= 1.75 ? 1.5 : top);
    return RES_STEPS.some((d) => d < cur - 0.01 && d >= floor - 0.001);
  }
  /** The painter's ambience overlays (paint/ambient.ts), when it has them. */
  private ambience(): { shed: boolean } | null {
    const a = (this.painter as Painter & { ambience?: { shed: boolean } }).ambience;
    return a && typeof a === 'object' && 'shed' in a ? a : null;
  }
  private overlaysShed(): boolean { return !!this.ambience()?.shed; }
  /** Shed (true) or restore (false) the full-screen overlays; false when there was nothing to change. */
  private shedOverlays(on: boolean): boolean {
    const a = this.ambience();
    if (!a || a.shed === on || (on && this.deps.settings.quality === 'low')) return false;
    a.shed = on;
    return true;
  }
  private frameMs = 16.7;

  /** One step inside the error rules; false when the run must stop. */
  private safeStep(): boolean {
    const w = this.world;
    try {
      w.step(STEP);
      return true;
    } catch (e) {
      const now = performanceNow();
      const fatal = now - this.lastErr < 5000;
      this.lastErr = now;
      if (fatal) {
        this.fatal = true;
        this.stop();
        console.error('[mirror engine] fatal', e);
        try { this.deps.hooks.error(e, true); } catch { /* the UI's */ }
        return false;
      }
      console.warn('[mirror engine] recovered', e);
      try { w.recover(); } catch { /* best effort */ }
      try { this.deps.hooks.error(e, false); } catch { /* the UI's */ }
      return true;
    }
  }

  // ─────────────────────────────────────────────── camera and drawing

  /**
   * The camera (屏幕抖动 RC2): rigid on the drawn (interpolated) you plus a sticky lead toward where you
   * run (held when you stop, so the view never swings back), the target eased into the arena's bounds
   * over EDGE_BAND u (never a dead stop), the boss fit. Motion beyond your walk (a dash, a leap, a pull)
   * glides (the dash guard). dt = 0 moves nothing but re-fits (a resize, a still redraw); `held` (the
   * world fully frozen) keeps the camera exactly where it is.
   */
  private follow(dt: number, held: boolean): void {
    const w = this.world;
    if (!w.run) return;
    const c = this.cam;
    const zoom = w.bossH.length && (w.phase === 'wave' || w.phase === 'down') ? BOSS_ZOOM[this.view] : 1;
    // the boss zoom eases at the same pace at every rate (dt · 2 a step at 60 Hz, as it always was)
    c.scale += (this.baseScale * zoom - c.scale) * (held ? 0 : dt > 0 ? (dt === STEP ? dt * 2 : 1 - Math.pow(1 - 2 * STEP, dt / STEP)) : 1);
    const A = w.arena, hw = c.w / 2 / c.scale, hh = c.h / 2 / c.scale;
    const mx = A ? Math.max(0, (A.maxX - A.minX) / 2 + 120 - hw) : Infinity;
    const my = A ? Math.max(0, (A.maxY - A.minY) / 2 + 120 - hh) : Infinity;
    if (!held) {
      // the sticky lead: re-aimed only while you run at ≥ half speed; a stop (or going down) keeps it
      const L = Math.min(LEAD_U, (LEAD_PX * c.dpr) / Math.max(1e-6, this.baseScale));
      const sp = Math.hypot(w.pvx, w.pvy);
      if (sp > 0.5 * Math.max(1, w.moveSpd)) { this.leadTX = (w.pvx / sp) * L; this.leadTY = (w.pvy / sp) * L; }
      if (dt > 0) { this.leadX = smoothDamp(this.leadX, this.leadTX, this.leadVX, LEAD_SMOOTH, dt); this.leadY = smoothDamp(this.leadY, this.leadTY, this.leadVY, LEAD_SMOOTH, dt); }
      const tx = softClamp(w.px + this.leadX, mx, EDGE_BAND), ty = softClamp(w.py + this.leadY, my, EDGE_BAND);
      if (dt > 0) {
        // the dash guard: the target's move beyond a walk this frame is left as lag, which drains
        const walk = Math.max(1, w.moveSpd) * dt;
        const mvx = tx - this.tgtX, mvy = ty - this.tgtY, mv = Math.hypot(mvx, mvy);
        if (mv > walk * 1.02) { const k = (mv - walk) / mv; this.lagX += mvx * k; this.lagY += mvy * k; }
        const lag = Math.hypot(this.lagX, this.lagY);
        if (lag > 1e-4) {
          const acc = DASH_ACCEL * CATCH * Math.max(1, w.moveSpd);
          const cap = Math.max(0, CATCH * Math.max(1, w.moveSpd) - Math.min(mv, walk) / dt);
          const v = Math.min(cap, this.lagV + acc * dt, Math.sqrt(2 * acc * lag));
          const nl = Math.max(0, lag - v * dt);
          this.lagV = nl > 0 ? v : 0;
          this.lagX *= nl / lag; this.lagY *= nl / lag;
        } else { this.lagX = this.lagY = 0; this.lagV = 0; }
      }
      this.tgtX = tx; this.tgtY = ty;
      c.x = tx - this.lagX; c.y = ty - this.lagY;
    }
    // (after a zoom-out the bounds shrink)
    if (A) { c.x = Math.max(-mx, Math.min(mx, c.x)); c.y = Math.max(-my, Math.min(my, c.y)); }
  }
  /** The camera as it follows (tests, the dev probe): a copy, so nobody moves it by accident. */
  get camera(): Readonly<Camera> { return { ...this.cam }; }

  /** Draw the frame: the pools and you between the last two steps (drawing only; restored after). */
  private drawFrame(dt = 0, held = false): void {
    const w = this.world;
    w.tDraw = w.t;
    w.tFx = w.t; w.dFx = 0;
    const lerp = this.ctx !== null && !!w.run && (w.phase === 'wave' || w.phase === 'ending' || w.phase === 'down');
    this.lerp.fx = this.phased || this.perN >= 8;
    if (lerp) this.lerp.apply(w, this.alpha, held ? 0 : dt);
    try { this.drawNow(dt, held); } finally { if (lerp) this.lerp.restore(w); }
  }
  private drawNow(dt: number, held: boolean): void {
    this.follow(dt, held);
    const ctx = this.ctx;
    const w = this.world;
    if (!ctx || !w.run) return;
    const c = this.cam;
    // the feel layer's camera offsets and zoom are 0 since round 5 (屏幕抖动 RC4); kept in the maths so
    // the contract's fields still mean what they say
    const F = w.feel;
    const zp = 1 + F.zoom;
    const sx = (F.offX * c.dpr) / (c.scale * zp), sy = (F.offY * c.dpr) / (c.scale * zp);
    c.x += sx; c.y += sy; c.scale *= zp;
    w.cam = c;
    try { this.renderer.draw(w, ctx, c); } catch (e) { console.warn('[mirror engine] draw', e); }
    c.x -= sx; c.y -= sy; c.scale /= zp;
  }

  // ─────────────────────────────────────────────── dev and tests

  /** Step the simulation n times without the loop (tests, the perf probe). */
  stepN(n: number): void {
    for (let i = 0; i < n; i++) {
      if (!this.safeStep()) break;
      if (this.world.pauseRequest) { this.world.pauseRequest = false; this.pause(); break; }
    }
  }
  get size(): { w: number; h: number } { return { w: this.cssW, h: this.cssH }; }
}

const arenaKeyOf = (map: string, seed: number, inverted: boolean) => `${map}|${seed}|${inverted}`;

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export const createEngine: CreateEngine = (canvas, run, deps) => new MirrorEngine(canvas, run, deps);
export type { MirrorEngine };
export type { HudRect } from './threats';
export { World } from './world';
