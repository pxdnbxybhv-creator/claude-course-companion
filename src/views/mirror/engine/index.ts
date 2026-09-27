// 水月幻镜 · the engine (API.md §3, GDD §24.3): requestAnimationFrame with a fixed 60 Hz step (≤ 4
// steps a frame, dt clamped to 50 ms, paused while hidden), hitstop, the camera (60 px lead, boss
// fit, shake), the frame-time guard, and the engine-error rules of GDD §23 (the first throw drops the
// offending entity; a second within 5 s is fatal). DOM-free apart from its canvas: the UI owns every
// listener and feeds `engine.input`.
import type {
  Camera, CreateEngine, Engine, EngineDeps, EngineInput, EnginePhase, EngineSettings, Painter, RunSave, SkillTarget, WaveResult, WaveSetup,
} from '../types';
import { World } from './world';
import { Renderer } from './render';
import { createDebugPainter } from './debugPainter';
import { installDev } from './dev';
import { viewScale } from '../paint/draw';

const STEP = 1 / 60;
const MAX_STEPS = 4;
const DT_CLAMP = 0.05;
/** Dynamic resolution: the canvas dpr steps down these notches under load before the guard cuts any
 *  effect, and back up after long fast stretches (sprites are baked for the top notch, so a step only
 *  ever draws them smaller). */
export const RES_STEPS = [3, 2.5, 2, 1.5, 1.25, 1] as const;
/** The lowest notch by quality (low may fall to 1; mid and high keep 1.5 and cut effects instead). */
const RES_FLOOR = { low: 1, mid: 1.5, high: 1.5 } as const;
/** Fast seconds before a step back up, and how many step-ups a run allows (hysteresis: a device that
 *  slows again at the higher notch settles one below it). */
const RES_UP_AFTER = 20;
const RES_UPS = 3;

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
    this.input = {
      move: (x, y) => { const m = Math.hypot(x, y); const k = m > 1 ? 1 / m : 1; w.moveX = x * k; w.moveY = y * k; },
      aim: (x, y) => { w.aimX = x; w.aimY = y; },
      cursor: (sx, sy) => { w.cursorX = sx; w.cursorY = sy; w.cursorT = 0; },
    };
    this.resize();
    installDev(this);
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
    this._paused = false;
    this.acc = 0;
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
    this.acc = 0;
    this.loop();
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
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    this.cam.w = pw; this.cam.h = ph; this.cam.dpr = dpr;
    // the shorter side shows ≈ 440 u (a phone sees ~440 × 950 u, a desktop ~950 × 590 u); the painter
    // bakes its sprites from the same viewScale (paint/index.ts bakeScale), so they are drawn ≤ 1:1
    this.baseScale = viewScale(w, h) * dpr;
    this.cam.scale = this.baseScale;
    if (this._paused || this.world.phase !== 'wave') this.drawFrame();
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
  setSettings(p: Partial<EngineSettings>): void {
    Object.assign(this.deps.settings, p);
    Object.assign(this.world.settings, p);
    if (p.dprCap !== undefined) this.resize();
  }
  snapshot(w: number, h: number): HTMLCanvasElement | null {
    if (!this.arenaKey) return null;
    try { return this.painter.arenaImage(w, h); } catch { return null; }
  }

  // ─────────────────────────────────────────────── the loop

  private loop(): void {
    if (this.raf || this.disposed || this._paused || this.fatal) return;
    // no animation frames (node tests): the caller drives stepN()
    if (typeof requestAnimationFrame !== 'function') return;
    const raf = requestAnimationFrame;
    const tick = (now: number) => {
      this.raf = 0;
      if (this.disposed || this._paused || this.fatal) return;
      this.frame(now);
      const ph = this.world.phase;
      if (!this._paused && !this.fatal && (ph === 'wave' || ph === 'ending')) this.raf = raf(tick);
      else this.drawFrame();
    };
    this.raf = raf(tick);
  }
  private stop(): void {
    if (!this.raf) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** One animation frame: fixed steps, then draw. */
  frame(now: number): void {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    let dt = this.last ? (now - this.last) / 1000 : STEP;
    // the unclamped frame interval in ms (0 on the first frame after start/resume)
    const interval = this.last ? now - this.last : 0;
    this.last = now;
    if (hidden) return;
    dt = Math.min(DT_CLAMP, Math.max(0, dt));
    const w = this.world;
    const t0 = performanceNow();
    // hitstop holds the simulation (the frame still draws; the camera and the feel clock run on)
    const frozen = w.hitstopMs > 0 ? Math.min(dt * 1000, w.hitstopMs) : 0;
    if (w.hitstopMs > 0) { w.hitstopMs -= dt * 1000; if (w.hitstopMs > 0) dt = 0; else dt = Math.min(dt, -w.hitstopMs / 1000); }
    const real = Math.min(DT_CLAMP * 1000, interval > 0 ? interval : STEP * 1000);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.acc -= STEP;
      steps++;
      if (!this.safeStep()) return;
      if (w.pauseRequest) { w.pauseRequest = false; this.pause(); break; }
      if (w.phase !== 'wave' && w.phase !== 'ending') break;
    }
    if (this.acc > STEP * MAX_STEPS) this.acc = 0;
    const t1 = performanceNow();
    try { w.feel.frame(real, frozen); } catch { /* cosmetic */ }
    this.drawFrame(dt);
    w.perf.canvasMs = w.perf.canvasMs * 0.95 + (performanceNow() - t1) * 0.05;
    // perf: EMA of simulation ms per step; the draw figure is the whole frame interval (the raster
    // work happens after our canvas calls return, so timing them alone says nothing on a slow phone)
    if (steps) w.perf.lastSim = (t1 - t0) / steps;
    w.perf.simMs = w.perf.simMs * 0.95 + w.perf.lastSim * 0.05;
    this.guard(interval);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { w.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
  }

  /**
   * The frame-time guard (GDD §24.3): when frames arrive more than 20 ms apart (under ~50 fps) for
   * 2 s, drop particles and fade player effects; recover after 8 s of fast frames. It is based on
   * the real interval between animation frames, so a device limited by rasterising trips it too.
   * Intervals over 250 ms (a tab switch, a GC pause, a breakpoint) are ignored.
   */
  private guard(ms: number): void {
    const w = this.world;
    if (ms <= 0 || ms > 250) return;
    w.perf.lastDraw = ms;
    w.perf.drawMs = w.perf.drawMs * 0.95 + ms * 0.05;
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    const s = ms / 1000;
    if (this.frameMs > 20) { this.slowFor += s; this.fastFor = 0; } else { this.fastFor += s; if (this.fastFor > 3) this.slowFor = 0; }
    // slow: first a notch of resolution (every 2 s while still slow), then effects
    if (this.slowFor > 2) {
      if (!w.degrade && this.stepRes(-1)) this.slowFor = 0;
      else if (!w.degrade) w.degrade = 1;
    }
    // fast again: effects come back first; resolution only after a long fast stretch, a few times a run
    if (w.degrade && this.fastFor > 8) w.degrade = 0;
    else if (!w.degrade && this.resCap !== Infinity && this.resUps > 0 && this.fastFor > RES_UP_AFTER) {
      if (this.stepRes(1)) this.resUps--;
      this.fastFor = 0;
    }
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

  private drawFrame(dt = 0): void {
    const ctx = this.ctx;
    const w = this.world;
    if (!ctx || !w.run) return;
    const c = this.cam;
    // lead 60 px in the direction you move; fit the boss arena during bosses
    const lead = 60 * c.dpr / c.scale;
    const tx = w.px + w.pvx / Math.max(1, w.moveSpd) * lead, ty = w.py + w.pvy / Math.max(1, w.moveSpd) * lead;
    const k = dt > 0 ? Math.min(1, dt * 6) : 1;
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    const zoom = w.bossH.length && w.phase === 'wave' ? 0.84 : 1;
    const target = this.baseScale * zoom;
    c.scale += (target - c.scale) * (dt > 0 ? Math.min(1, dt * 2) : 1);
    // keep the arena's edge from drifting far into view
    const A = w.arena;
    if (A) {
      const hw = c.w / 2 / c.scale, hh = c.h / 2 / c.scale;
      const mx = Math.max(0, (A.maxX - A.minX) / 2 + 120 - hw), my = Math.max(0, (A.maxY - A.minY) / 2 + 120 - hh);
      c.x = Math.max(-mx, Math.min(mx, c.x)); c.y = Math.max(-my, Math.min(my, c.y));
    }
    // 打击感: trauma shake and directional kicks (CSS px → world), a zoom punch on big impacts;
    // the feel layer zeroes them under reduced motion (and shake / kicks with the shake setting off)
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
export { World } from './world';
