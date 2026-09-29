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
 * Vsync snap (屏幕抖动 / 行走快慢, walk.md R2 with its review): rAF stamps are coarse (Chrome 0.1 ms,
 * Safari 1 ms) and a real "60 Hz" panel runs at 59.94 or 60.02 Hz, so a raw accumulator drifts
 * through the step boundary and runs 0 steps on one frame and 2 on the next (a figure that stops,
 * then jumps). When the display's period (a trimmed mean of the last PERIOD_N intervals) is within
 * SNAP_PERIOD of a half, whole or double step, a frame within SNAP_FRAME of whole vsyncs counts as
 * exactly that: one step a frame at 60 Hz, one every other frame at 120 Hz. The cost: a 59.94 Hz
 * panel runs the game 0.1% slow; a 57 Hz one (5% off) is not snapped.
 */
const SNAP_PERIOD = 0.03;
const SNAP_FRAME = 0.0015;
const PERIOD_N = 8;
const SNAP_TO = [STEP / 2, STEP, STEP * 2] as const;
export function snapStep(dt: number, period = dt): number {
  if (!(dt > 0) || !(period > 0)) return dt;
  for (const P of SNAP_TO) {
    if (Math.abs(period - P) > P * SNAP_PERIOD) continue;
    const k = Math.max(1, Math.round(dt / P));
    return Math.abs(dt - k * P) < SNAP_FRAME ? k * P : dt;
  }
  return dt;
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
/** Re-bake slices: 6 ms a frame while you play, 24 ms behind a pause sheet or between waves. */
const REBAKE_SLICE = 6;
const REBAKE_SLICE_IDLE = 24;

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
  private fpsAcc = 0;
  private fpsN = 0;
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
  /** The display's recent frame intervals (s), for the vsync snap. */
  private per = new Float64Array(PERIOD_N);
  private perN = 0;
  private perI = 0;

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
    const slice = () => (this._paused || this.world.phase !== 'wave' ? REBAKE_SLICE_IDLE : REBAKE_SLICE);
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
    this.last = 0;
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
    this.last = 0;
    this.acc = STEP / 2;
    this.loop();
  }
  /** 破镜重圆 (types.ts Engine.revive): rise, and play on (a pause is lifted). False unless down. */
  revive(): boolean {
    if (this.disposed || this.fatal || !this.world.revive()) return false;
    this._paused = false;
    this.last = 0;
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
  /** Settings apply live; `view` goes through setView (a new camera scale, a background re-bake). */
  setSettings(p: Partial<EngineSettings>): void {
    const { view, ...rest } = p;
    Object.assign(this.deps.settings, rest);
    Object.assign(this.world.settings, rest);
    if (p.dprCap !== undefined) this.resize();
    if (view !== undefined) void this.setView(view);
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

  /** One animation frame: fixed steps, then draw (between the last two steps). */
  frame(now: number): void {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    let dt = this.last ? (now - this.last) / 1000 : STEP;
    // the unclamped frame interval in ms (0 on the first frame after start/resume)
    const interval = this.last ? now - this.last : 0;
    this.last = now;
    if (hidden) return;
    if (interval > 0 && interval < 100) { this.per[this.perI] = interval / 1000; this.perI = (this.perI + 1) % PERIOD_N; if (this.perN < PERIOD_N) this.perN++; }
    dt = snapStep(Math.min(DT_CLAMP, Math.max(0, dt)), this.period());
    const w = this.world;
    this.framing = true;
    try { this.frameIn(w, dt, interval); } finally { this.framing = false; }
  }
  private frameIn(w: World, dt: number, interval: number): void {
    // a notch the guard asked for last frame: applied before this frame steps and draws
    if (this.pendingRes) { const d = this.pendingRes; this.pendingRes = 0; this.stepRes(d); }
    const t0 = performanceNow();
    // hitstop holds the simulation (the frame still draws; the feel clock runs on)
    const frozen = w.hitstopMs > 0 ? Math.min(dt * 1000, w.hitstopMs) : 0;
    if (w.hitstopMs > 0) { w.hitstopMs -= dt * 1000; if (w.hitstopMs > 0) dt = 0; else dt = Math.min(dt, -w.hitstopMs / 1000); }
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
    w.perf.canvasMs = w.perf.canvasMs * 0.95 + (performanceNow() - t1) * 0.05;
    // perf: EMA of simulation ms per step; the draw figure is the whole frame interval (the raster
    // work happens after our canvas calls return, so timing them alone says nothing on a slow phone)
    if (steps) w.perf.lastSim = (t1 - t0) / steps;
    w.perf.simMs = w.perf.simMs * 0.95 + w.perf.lastSim * 0.05;
    this.guard(interval);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { w.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
  }
  /** The display's period (s): the mean of the recent intervals without the longest and the shortest
   *  (a dropped frame or a hiccup), NaN until there are four. */
  private period(): number {
    const n = this.perN;
    if (n < 4) return NaN;
    let sum = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const v = this.per[i]; sum += v; if (v < lo) lo = v; if (v > hi) hi = v; }
    return (sum - lo - hi) / (n - 2);
  }

  /**
   * The frame-time guard (GDD §24.3): when frames arrive more than 20 ms apart (under ~50 fps) for
   * 2 s, give something up, cheapest to lose first: the paper's full-screen overlays (grain,
   * vignette), then a notch of resolution at a time, then particles and player effects (degrade).
   * Recovery runs the other way: effects after 8 s of fast frames, then a notch of resolution (or the
   * overlays, last) after each long fast stretch, a few times a run. It is based on the real interval
   * between animation frames, so a device limited by rasterising trips it too. Intervals over 250 ms
   * (a tab switch, a GC pause, a breakpoint) are ignored.
   */
  private guard(ms: number): void {
    const w = this.world;
    if (ms <= 0 || ms > 250) return;
    w.perf.lastDraw = ms;
    w.perf.drawMs = w.perf.drawMs * 0.95 + ms * 0.05;
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    const s = ms / 1000;
    if (this.frameMs > 20) { this.slowFor += s; this.fastFor = 0; } else { this.fastFor += s; if (this.fastFor > 3) this.slowFor = 0; }
    // slow: first the overlays, then a notch of resolution (every 2 s while still slow), then effects
    if (this.slowFor > 2) {
      if (!w.degrade && this.shedOverlays(true)) this.slowFor = 0;
      else if (!w.degrade && this.canStep(-1)) { this.pendingRes = -1; this.slowFor = 0; }
      else if (!w.degrade) w.degrade = 1;
    }
    // fast again: effects come back first; resolution, then the overlays, only after a long fast stretch
    if (w.degrade && this.fastFor > 8) w.degrade = 0;
    else if (!w.degrade && this.resUps > 0 && this.fastFor > RES_UP_AFTER && (this.resCap !== Infinity || this.overlaysShed())) {
      if (this.resCap !== Infinity ? this.canStep(1) && ((this.pendingRes = 1), true) : this.shedOverlays(false)) this.resUps--;
      this.fastFor = 0;
    }
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
    c.scale += (this.baseScale * zoom - c.scale) * (held ? 0 : dt > 0 ? Math.min(1, dt * 2) : 1);
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
    const lerp = this.ctx !== null && !!w.run && (w.phase === 'wave' || w.phase === 'ending' || w.phase === 'down');
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
