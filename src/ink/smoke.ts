// Incense smoke (香烟袅袅) as *streaklines*: particles are emitted one after another from the tip
// and advected through a slowly evolving flow; consecutive particles are joined into a ribbon.
// That is exactly what real smoke from a point source shows, so the classic look falls out:
// a straight laminar thread → a growing sway → curls and eddies → spreading mist.
//
// Flow: buoyant rise that slows as the smoke cools, plus divergence-free curl noise whose
// strength ramps up with age (the plume goes unstable after rising a while), plus a slow breeze.
// Particles have a little inertia and relax toward the flow; `disturb` kicks them directly and
// leaves a short-lived velocity blob so freshly emitted smoke is pushed too.
//
// Rendering: each ribbon segment gets alpha from mass conservation (stretched segments thin out,
// folds thicken) × diffusion (wider → paler) × age fade. Segments are bucketed by (alpha, width)
// so a frame is ~100 stroke() calls; within one stroke() overlapping joints do not double up.
// A crisp core line is drawn at full resolution; a soft "mist" pass is drawn to a canvas at
// 1/3 css resolution and upscaled with smoothing (cheap blur, Safari-safe).
import { makeNoise2, makeRng, mixSeed, clamp, smoothstep, type Noise2 } from '../core/rng';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  /** Emission time (s, sim clock) — neighbours' Δte / distance gives the ribbon's line density. */
  te: number;
  age: number;
}

interface Strand {
  pts: Particle[];
  /** Opacity of this strand relative to the main thread. */
  gain: number;
  /** Lateral offset at the source, css px. */
  off: number;
  /** Offset into the per-strand noise so parallel strands drift apart once turbulent. */
  salt: number;
  id: number;
}

interface Impulse { x: number; y: number; vx: number; vy: number; age: number }

export interface SmokeStats { particles: number; strokes: number }

const ALPHA_LEVELS = (() => {
  const a: number[] = [];
  for (let v = 0.004; v < 0.6; v *= 1.18) a.push(v);
  return a;
})();
const CORE_W = [0.7, 0.85, 1.0, 1.2, 1.45, 1.75, 2.1, 2.55, 3.1, 3.8, 4.6];
const MIST_W = [1.5, 2.2, 3.2, 4.6, 6.5, 9, 12.5, 17];

function levelOf(levels: number[], v: number): number {
  // levels are sorted ascending; nearest level (small arrays → linear scan is fine)
  let i = 0;
  while (i < levels.length - 1 && v > (levels[i] + levels[i + 1]) * 0.5) i++;
  return i;
}

export interface SmokeOptions {
  /** Length scale, css px per "unit" (1 at a 760 px tall scene). Speeds and widths scale with it. */
  unit?: number;
}

export class SmokePlume {
  /** Source position (css px). Move it as the stick burns down. */
  x = 0;
  y = 0;
  emitting = false;
  time = 0;
  stats: SmokeStats = { particles: 0, strokes: 0 };

  private u = 1;
  private strands: Strand[] = [];
  private imps: Impulse[] = [];
  private agitation = 0;
  private emitAcc = 0;
  private nFlow: Noise2;
  private nFlow2: Noise2;
  private nSlow: Noise2;
  private rng;
  private mist: HTMLCanvasElement | null = null;
  private mctx: CanvasRenderingContext2D | null = null;
  private mistScale = 3;
  private buckets = new Map<number, number[]>();
  private styleCache = new Map<number, string>();

  constructor(seed = 1, o: SmokeOptions = {}) {
    this.u = o.unit ?? 1;
    this.nFlow = makeNoise2(mixSeed(seed, 101));
    this.nFlow2 = makeNoise2(mixSeed(seed, 102));
    this.nSlow = makeNoise2(mixSeed(seed, 103));
    this.rng = makeRng(mixSeed(seed, 104));
    const defs = [
      { gain: 1, off: 0 },
      { gain: 0.5, off: 0.45 },
    ];
    this.strands = defs.map((d, i) => ({ pts: [], gain: d.gain, off: d.off, salt: i * 7.31, id: i }));
  }

  setUnit(u: number) { this.u = u; }

  get particleCount(): number {
    let n = 0;
    for (const s of this.strands) n += s.pts.length;
    return n;
  }

  /** Remove all smoke immediately. */
  clear() {
    for (const s of this.strands) s.pts.length = 0;
    this.imps.length = 0;
  }

  disturb(x: number, y: number, dx: number, dy: number) {
    const u = this.u;
    const sp = Math.hypot(dx, dy);
    if (!(sp > 0)) return;
    // cap absurd pointer velocities
    const k = Math.min(1, (900 * u) / sp);
    dx *= k; dy *= k;
    const R = 46 * u, R2 = R * R;
    for (const s of this.strands) {
      for (const p of s.pts) {
        const ex = p.x - x, ey = p.y - y;
        const d2 = ex * ex + ey * ey;
        if (d2 > R2 * 4) continue;
        const f = Math.exp(-d2 / R2) * 0.55;
        p.vx += dx * f;
        p.vy += dy * f;
      }
    }
    const last = this.imps[this.imps.length - 1];
    if (last && last.age < 0.08 && Math.hypot(last.x - x, last.y - y) < 18 * u) {
      last.x = x; last.y = y;
      last.vx = last.vx * 0.5 + dx * 0.5; last.vy = last.vy * 0.5 + dy * 0.5;
      last.age = 0;
    } else {
      this.imps.push({ x, y, vx: dx, vy: dy, age: 0 });
      if (this.imps.length > 12) this.imps.shift();
    }
    this.agitation = Math.min(1.5, this.agitation + (sp * k) / (1600 * u));
  }

  step(dt: number) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    // sub-step large frames for stability
    const n = Math.ceil(dt / (1 / 45));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  private substep(dt: number) {
    const u = this.u;
    this.time += dt;
    const t = this.time;
    this.agitation *= Math.exp(-dt / 2.8);
    for (const im of this.imps) im.age += dt;
    while (this.imps.length && this.imps[0].age > 1.6) this.imps.shift();

    // --- emission ---
    const rate = 16; // particles per second per strand (refinement adds more where needed)
    if (this.emitting) {
      this.emitAcc += dt;
      while (this.emitAcc >= 1 / rate) {
        this.emitAcc -= 1 / rate;
        const age = this.emitAcc;
        for (const s of this.strands) {
          s.pts.push({ x: this.x + s.off * u, y: this.y, vx: 0, vy: -30 * u, te: t - age, age });
        }
      }
    } else this.emitAcc = 0;

    // --- flow parameters (shared this substep) ---
    const f = 1 / (58 * u); // eddy scale
    const scroll = 24 * u; // eddies drift up with the smoke
    const lamT = clamp(1.1 + 1.4 * (0.5 + 0.5 * this.nSlow(t * 0.06, 9.1)) - this.agitation * 1.1, 0.3, 3);
    const breeze = 9 * u * this.nSlow(t * 0.11, 1.3) + 3 * u * this.nSlow(t * 0.37, 4.7);
    const turbA = 19 * u * (1 + 0.7 * this.agitation);
    const U0 = 40 * u;
    const eps = 0.08;
    const fade = this.emitting ? 1 : 1.7;
    const life = 14;
    const imps = this.imps;
    const R2 = (40 * u) ** 2;

    for (const s of this.strands) {
      const pts = s.pts;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.age += dt * fade;
        const a = p.age;
        const T = smoothstep(lamT, lamT + 2.6, a);
        // curl of ψ(x, y + scroll·t, t)
        const nx = p.x * f + s.salt * T * 0.35;
        const ny = (p.y + scroll * t) * f;
        const tz = t * 0.045;
        const psi = (X: number, Y: number) =>
          this.nFlow(X + tz, Y) + 0.5 * this.nFlow2(X * 2.1 - tz * 1.7, Y * 2.1 + tz);
        const p0 = psi(nx, ny);
        const dpx = (psi(nx + eps, ny) - p0) / eps;
        const dpy = (psi(nx, ny + eps) - p0) / eps;
        const sway = smoothstep(lamT * 0.4, lamT + 1.2, a);
        let tx = turbA * T * dpy + breeze * sway;
        let ty = -turbA * T * dpx - U0 * (0.55 + 0.45 * Math.exp(-a / 4));
        // faint wobble even in the laminar thread, so it is never ruler-straight
        tx += 1.2 * u * this.nFlow2(t * 0.9 + s.salt, 3.3) * (1 - T);
        for (const im of imps) {
          const ex = p.x - im.x, ey = p.y - im.y;
          const w = Math.exp(-(ex * ex + ey * ey) / R2 - im.age / 0.35);
          if (w > 0.002) { tx += im.vx * w * 0.6; ty += im.vy * w * 0.6; }
        }
        const k = 1 - Math.exp(-dt / (0.1 + 0.25 * T));
        p.vx += (tx - p.vx) * k;
        p.vy += (ty - p.vy) * k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      // retire the oldest (they sit at the start of the array)
      let drop = 0;
      while (drop < pts.length && (pts[drop].age > life || pts[drop].y < -60 * u)) drop++;
      if (drop) pts.splice(0, drop);
      this.refine(pts);
    }
  }

  /** Keep the ribbon smooth where it stretches, and thin where it bunches up. */
  private refine(pts: Particle[]) {
    const u = this.u;
    let inserts = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const maxSeg = (5 + a.age * 1.3) * u;
      if (d > maxSeg && inserts < 60 && Math.abs(a.te - b.te) > 1e-3) {
        pts.splice(i, 0, {
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
          vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2,
          te: (a.te + b.te) / 2, age: (a.age + b.age) / 2,
        });
        inserts++;
      } else if (d < 1.6 * u && a.age > 0.6 && i > 1 && i < pts.length - 1) {
        pts.splice(i, 1);
      }
    }
  }

  private style(rgb: string, a: number): string {
    const key = (rgb.length << 20) + Math.round(a * 100000);
    let s = this.styleCache.get(key);
    if (!s) { s = `rgba(${rgb},${a.toFixed(4)})`; this.styleCache.set(key, s); }
    return s;
  }

  /**
   * Draw the smoke on `ctx` in css px (caller has applied the dpr transform). `W`/`H` are the
   * css size (used for the mist buffer).
   */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, dpr = 1) {
    const u = this.u;
    const ms = this.mistScale;
    const mw = Math.max(1, Math.ceil(W / ms)), mh = Math.max(1, Math.ceil(H / ms));
    if (!this.mist) {
      this.mist = document.createElement('canvas');
      this.mctx = this.mist.getContext('2d')!;
    }
    if (this.mist.width !== mw || this.mist.height !== mh) { this.mist.width = mw; this.mist.height = mh; }
    const mctx = this.mctx!;

    const buckets = this.buckets;
    for (const arr of buckets.values()) arr.length = 0;
    // run continuity: last particle id pushed into each bucket
    const lastEnd = new Map<number, number>();

    const U0 = 44 * u;
    const w0 = 0.95 * u;
    const NA = ALPHA_LEVELS.length;
    let particles = 0;

    const push = (key: number, x0: number, y0: number, x1: number, y1: number, startId: number, endId: number) => {
      let arr = buckets.get(key);
      if (!arr) { arr = []; buckets.set(key, arr); }
      if (lastEnd.get(key) !== startId) arr.push(0, x0, y0);
      arr.push(1, x1, y1);
      lastEnd.set(key, endId);
    };

    for (const s of this.strands) {
      const pts = s.pts;
      particles += pts.length;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y) + 1e-3;
        const age = (a.age + b.age) * 0.5;
        const dte = Math.abs(a.te - b.te);
        // line density relative to the fresh laminar thread (mass conservation along the ribbon)
        const rho = clamp((U0 * 0.75 * dte) / L, 0.08, 2.2);
        const T = smoothstep(1.2, 4, age);
        const w = w0 + (1.3 + 2.6 * T) * age * u;
        const puff = 0.72 + 0.28 * this.nSlow(a.te * 0.55, 3.7 + s.salt);
        const fadeIn = smoothstep(0, 0.14, age);
        const life = Math.exp(-age / 3.4) * smoothstep(11, 7, age);
        const base = s.gain * puff * fadeIn * life * Math.pow(rho, 0.75) * Math.pow(w0 / w, 0.45);
        const id0 = s.id * 1e6 + i - 1, id1 = s.id * 1e6 + i;
        // core: crisp thread, fades out as the smoke diffuses
        const ca = 0.5 * base * (1 - 0.85 * T);
        if (ca > ALPHA_LEVELS[0] * 0.7 && w < 6 * u) {
          const ai = levelOf(ALPHA_LEVELS, ca), wi = levelOf(CORE_W, Math.min(w, 4.6));
          push(ai * 64 + wi, a.x, a.y, b.x, b.y, id0, id1);
        }
        // mist: wider, softer, lingers
        const ma = 0.3 * base * (0.35 + 0.65 * T);
        if (ma > ALPHA_LEVELS[0] * 0.7) {
          const mwid = (w * 1.9 + 2.5 * u) / ms;
          const ai = levelOf(ALPHA_LEVELS, ma), wi = levelOf(MIST_W, mwid);
          push(100000 + ai * 64 + wi, a.x / ms, a.y / ms, b.x / ms, b.y / ms, id0, id1);
        }
      }
    }

    // mist pass (low-res, then upscaled with smoothing)
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mw, mh);
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    let strokes = 0;
    const MIST_RGB = '74,80,88', CORE_RGB = '48,50,56';
    for (const [key, arr] of buckets) {
      if (!arr.length || key < 100000) continue;
      const k = key - 100000;
      const ai = Math.floor(k / 64), wi = k % 64;
      mctx.strokeStyle = this.style(MIST_RGB, ALPHA_LEVELS[ai]);
      mctx.lineWidth = MIST_W[wi];
      mctx.beginPath();
      for (let j = 0; j < arr.length; j += 3) {
        if (arr[j]) mctx.lineTo(arr[j + 1], arr[j + 2]); else mctx.moveTo(arr[j + 1], arr[j + 2]);
      }
      mctx.stroke();
      strokes++;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.mist, 0, 0, mw * ms, mh * ms);
    // core pass
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const minW = 0.75 / Math.max(1, dpr);
    for (const [key, arr] of buckets) {
      if (!arr.length || key >= 100000) continue;
      const ai = Math.floor(key / 64), wi = key % 64;
      let wpx = CORE_W[wi], al = ALPHA_LEVELS[ai];
      // sub-pixel lines: keep coverage by trading width for alpha
      if (wpx < minW) { al *= wpx / minW; wpx = minW; }
      ctx.strokeStyle = this.style(CORE_RGB, Math.min(0.85, al));
      ctx.lineWidth = wpx;
      ctx.beginPath();
      for (let j = 0; j < arr.length; j += 3) {
        if (arr[j]) ctx.lineTo(arr[j + 1], arr[j + 2]); else ctx.moveTo(arr[j + 1], arr[j + 2]);
      }
      ctx.stroke();
      strokes++;
    }
    ctx.restore();
    void NA;
    this.stats = { particles, strokes };
  }
}
