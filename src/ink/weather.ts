// Seasonal particles: spring petals, summer fireflies/rain, autumn leaves & geese, winter snow.
//
// Cheap by construction: ≤ ~80 live particles, each a pre-rendered sprite blitted with one
// transform (rain is a single stroked path). Sprites are painted once per device scale with the
// shared brush engine, so they share the garden's ink and pigments. All randomness is seeded.
import type { SceneEnv } from './scene-types';
import { PIGMENTS } from './types';
import type { StrokePoint } from './types';
import { paintStroke } from './brush';
import { makeRng, makeNoise2, mixSeed, clamp, lerp } from '../core/rng';
import type { Rng, Noise2 } from '../core/rng';

type Kind = 'petal' | 'leaf' | 'snow' | 'firefly';

interface Particle {
  kind: Kind;
  x: number; y: number;
  vx: number; vy: number;
  /** rotation and its speed */
  rot: number; vr: number;
  /** tumble phase (flip about the long axis) and its speed */
  flip: number; vf: number;
  size: number;
  sprite: number;
  /** depth 0 far … 1 near: parallax speed and size */
  z: number;
  phase: number;
  /** burst particles: remaining life in s (−1 = ambient, recycles) */
  life: number;
  maxLife: number;
}

interface Goose { dx: number; dy: number; ph: number }
interface Flock { t0: number; dur: number; dir: 1 | -1; y: number; size: number; birds: Goose[]; slope: number }

const P = (x: number, y: number, w: number): StrokePoint => ({ x, y, w });

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// ---------------------------------------------------------------------------
// sprites (per device scale)

interface Sprite { c: HTMLCanvasElement; w: number; h: number }
const spriteCache = new Map<string, Sprite[]>();

/** Sprite unit: drawn at 24 css px long, scaled per particle. */
const U = 24;

function spriteSet(kind: Kind | 'burst', res: number, color?: string): Sprite[] {
  res = clamp(Math.round(res * 2) / 2, 1, 4);
  const key = `${kind}|${res}|${color ?? ''}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const rng = makeRng(mixSeed(0x5eed, kind.length * 131 + Math.round(res * 10)));
  const out: Sprite[] = [];
  const make = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const c = makeCanvas(w * res, h * res);
    const cc = c.getContext('2d')!;
    cc.scale(res, res);
    draw(cc);
    out.push({ c, w, h });
  };
  if (kind === 'petal' || kind === 'burst') {
    const cols = color ? [color, color, color] : [PIGMENTS.rouge, PIGMENTS.rouge, '#c9587a'];
    for (let i = 0; i < 6; i++) {
      const col = cols[i % cols.length];
      const tone = [0.8, 0.55, 0.42][i % 3];
      make(U, U, (c) => {
        // a rounded petal with a notched tip, base at the left
        const pts: StrokePoint[] = [];
        const n = 22;
        const L = U * 0.42, W = U * rng.range(0.28, 0.36);
        const notch = rng.range(0.06, 0.14);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          let r = 1;
          if (ca > 0) r -= notch * Math.exp(-((sa / 0.22) ** 2)) * ca;
          const x = U / 2 + ca * L * r * (ca < 0 ? 0.75 : 1);
          const y = U / 2 + sa * W * (0.8 + 0.2 * ca) * r;
          pts.push(P(x, y, 1));
        }
        paintStroke(c, { kind: 'fill', tone, color: col, birth: 0, seed: rng.int(1, 1e9), pts });
        // a deeper blush at the base
        paintStroke(c, { kind: 'dot', tone: tone * 0.6, color: col, birth: 0, seed: rng.int(1, 1e9), pts: [P(U / 2 - L * 0.45, U / 2, W * 0.9)] });
      });
    }
  } else if (kind === 'leaf') {
    const cols = [PIGMENTS.ochre, PIGMENTS.gamboge, PIGMENTS.ochre, PIGMENTS.vermilion, '#8a5a2e'];
    for (let i = 0; i < 6; i++) {
      const col = cols[i % cols.length];
      make(U, U, (c) => {
        const pts: StrokePoint[] = [];
        const n = 20;
        const L = U * 0.44, W = U * rng.range(0.16, 0.24);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          // pointed at the tip (right), rounded at the base
          const taper = ca > 0 ? Math.pow(1 - ca, 0.7) * 0.9 + 0.1 : 1;
          pts.push(P(U / 2 + ca * L, U / 2 + sa * W * taper + ca * W * 0.15, 1));
        }
        paintStroke(c, { kind: 'fill', tone: rng.range(0.6, 0.85), color: col, birth: 0, seed: rng.int(1, 1e9), pts });
        paintStroke(c, { kind: 'line', tone: 0.45, birth: 0, seed: rng.int(1, 1e9), pts: [P(U / 2 - L - 2.5, U / 2 + 0.6, 0.6), P(U / 2 - L * 0.2, U / 2 + 0.2, 0.55), P(U / 2 + L * 0.8, U / 2 - 0.3, 0.2)] });
      });
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < 3; i++) {
      make(U, U, (c) => {
        const r = U * 0.3;
        // faint grey rim so the flake reads on paper, soft white body
        const g1 = c.createRadialGradient(U / 2, U / 2 + 0.6, r * 0.6, U / 2, U / 2 + 0.6, r * 1.15);
        g1.addColorStop(0, 'rgba(60,68,82,0.32)');
        g1.addColorStop(1, 'rgba(70,78,92,0)');
        c.fillStyle = g1;
        c.fillRect(0, 0, U, U);
        const g = c.createRadialGradient(U / 2, U / 2, 0, U / 2, U / 2, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.55 + i * 0.1, 'rgba(253,252,248,0.95)');
        g.addColorStop(1, 'rgba(250,248,242,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(U / 2, U / 2, r, 0, Math.PI * 2); c.fill();
      });
    }
  } else {
    // firefly: warm pale core and a wide soft halo
    make(U, U, (c) => {
      const g = c.createRadialGradient(U / 2, U / 2, 0, U / 2, U / 2, U / 2);
      g.addColorStop(0, 'rgba(250,250,215,1)');
      g.addColorStop(0.12, 'rgba(236,236,150,0.95)');
      g.addColorStop(0.3, 'rgba(210,205,90,0.35)');
      g.addColorStop(1, 'rgba(200,190,80,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, U, U);
    });
  }
  spriteCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------

export class Weather {
  private rng: Rng;
  private noise: Noise2;
  private ps: Particle[] = [];
  private bursts: Particle[] = [];
  private burstColors: (string | undefined)[] = [];
  private t = 0;
  private windNow = 0;
  private flock: Flock | null = null;
  private nextFlock = 0;
  private rainy: boolean;
  private rainLevel = 0;
  private rainSeed = 0;
  private burstN = 0;
  /** Maximum live particles (ambient + bursts). */
  readonly max = 80;

  constructor(public env: SceneEnv, public w: number, public h: number) {
    this.rng = makeRng(mixSeed(env.seed, 0xa7e1));
    this.noise = makeNoise2(mixSeed(env.seed, 0x3a1));
    this.rainy = env.season === 'summer' && env.tod !== 'night' && this.rng.chance(0.5);
    this.populate();
  }

  /** Swap the scene (season/time) — re-seeds the ambient particles. */
  setEnv(env: SceneEnv): void {
    const changed = env.season !== this.env.season || env.tod !== this.env.tod || env.seed !== this.env.seed;
    this.env = env;
    if (changed) {
      this.rng = makeRng(mixSeed(env.seed, 0xa7e1));
      this.rainy = env.season === 'summer' && env.tod !== 'night' && this.rng.chance(0.5);
      this.populate();
    }
  }

  resize(w: number, h: number): void {
    const sx = w / (this.w || 1), sy = h / (this.h || 1);
    for (const p of this.ps) { p.x *= sx; p.y *= sy; }
    this.w = w; this.h = h;
    this.populate(true);
  }

  private ambientCount(): number {
    const area = clamp((this.w * this.h) / (900 * 600), 0.35, 1.4);
    switch (this.env.season) {
      case 'spring': return Math.round(22 * area);
      case 'summer': return this.env.tod === 'dusk' || this.env.tod === 'night' ? Math.round(18 * area) : 0;
      case 'autumn': return Math.round(13 * area);
      default: return Math.round(60 * area);
    }
  }

  private kind(): Kind | null {
    switch (this.env.season) {
      case 'spring': return 'petal';
      case 'summer': return this.env.tod === 'dusk' || this.env.tod === 'night' ? 'firefly' : null;
      case 'autumn': return 'leaf';
      default: return 'snow';
    }
  }

  private populate(keep = false): void {
    const n = Math.min(this.ambientCount(), this.max - 14);
    const k = this.kind();
    if (!keep) this.ps = [];
    if (!k) { this.ps = []; return; }
    this.ps = this.ps.filter((p) => p.kind === k).slice(0, n);
    while (this.ps.length < n) this.ps.push(this.spawn(k, true));
  }

  private spawn(kind: Kind, anywhere: boolean): Particle {
    const r = this.rng;
    const { w, h } = this;
    const z = r();
    const p: Particle = { kind, x: 0, y: 0, vx: 0, vy: 0, rot: r() * Math.PI * 2, vr: r.range(-1.5, 1.5), flip: r() * Math.PI * 2, vf: r.range(1.5, 4), size: 1, sprite: r.int(0, 5), z, phase: r() * 100, life: -1, maxLife: -1 };
    if (kind === 'firefly') {
      // fireflies keep low: among the plants, over the grass and the water's edge
      p.x = r() * w;
      p.y = lerp(h * 0.35, h * 0.9, r() ** 0.7);
      p.size = lerp(7, 13, z);
      return p;
    }
    // falling things enter from the top (or the upwind edge once the wind blows)
    const wind = this.windNow;
    if (anywhere) { p.x = r() * w; p.y = r() * h; }
    else if (Math.abs(wind) > 0.35 && r() < 0.5) { p.x = wind > 0 ? -20 : w + 20; p.y = r() * h * 0.7; }
    else { p.x = r.range(-0.1, 1.1) * w; p.y = -20 - r() * 40; }
    if (kind === 'snow') {
      p.size = lerp(3, 8.5, z * z);
      p.vy = lerp(12, 34, z);
    } else if (kind === 'petal') {
      p.size = lerp(6, 11, z);
      p.vy = lerp(14, 26, z);
    } else {
      p.size = lerp(8, 14, z);
      p.vy = lerp(20, 36, z);
    }
    return p;
  }

  /** dt in seconds; wind −1..1 (pointer / tilt can push it). */
  step(dt: number, wind = 0): void {
    dt = clamp(dt, 0, 0.1);
    if (dt <= 0) return;
    this.t += dt;
    const t = this.t;
    // a slow, gusting breeze under whatever the user adds
    const breeze = 0.25 * this.noise(t * 0.05, 1.3) + 0.12 * Math.sin(t * 0.21);
    const target = clamp(breeze + wind, -1.5, 1.5);
    this.windNow += (target - this.windNow) * Math.min(1, dt * 1.2);
    const W = this.windNow;
    const { w, h } = this;

    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      if (p.kind === 'firefly') {
        // wander on smooth noise, drift a little with the wind
        const n1 = this.noise(p.phase + t * 0.13, 0.5), n2 = this.noise(0.5, p.phase + t * 0.13);
        p.vx += (n1 * 26 + W * 8 - p.vx) * dt * 1.5;
        p.vy += (n2 * 16 - p.vy) * dt * 1.5;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < h * 0.3) p.vy += 10 * dt;
        if (p.y > h * 0.95) p.vy -= 10 * dt;
        if (p.x < -20) p.x = w + 10; else if (p.x > w + 20) p.x = -10;
        continue;
      }
      const flutter = p.kind === 'snow' ? 0.4 : 1;
      const sway = this.noise(p.phase + t * 0.3, p.z * 3) * (p.kind === 'snow' ? 10 : 22) * flutter;
      const tvx = W * lerp(25, 60, p.z) + sway;
      p.vx += (tvx - p.vx) * dt * 1.6;
      const lift = p.kind === 'snow' ? 0 : Math.sin(p.flip) * 6; // tumbling petals/leaves glide
      p.x += p.vx * dt;
      p.y += (p.vy + lift) * dt;
      p.rot += p.vr * dt * (1 + Math.abs(W));
      p.flip += p.vf * dt;
      if (p.y > h + 24 || p.x < -60 || p.x > w + 60) this.ps[i] = this.spawn(p.kind, false);
    }

    // bursts: thrown up, then drift down with drag
    for (const p of this.bursts) {
      p.life -= dt;
      p.vx += (W * 30 - p.vx) * dt * 1.3;
      p.vy += 70 * dt;
      p.vy *= 1 - dt * 1.4;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vf * dt;
    }
    if (this.bursts.length) {
      const keep: Particle[] = [], cols: (string | undefined)[] = [];
      this.bursts.forEach((p, i) => { if (p.life > 0) { keep.push(p); cols.push(this.burstColors[i]); } });
      this.bursts = keep; this.burstColors = cols;
    }

    // summer showers come and go
    if (this.rainy) {
      const want = clamp((this.noise(t / 50, 9.3) + 0.15) * 2.2, 0, 1);
      this.rainLevel += (want - this.rainLevel) * Math.min(1, dt * 0.5);
      this.rainSeed += dt;
    }

    // autumn geese: one skein every ~45–90 s, the first one soon
    if (this.env.season === 'autumn' && this.env.tod !== 'night') {
      if (!this.flock && t >= this.nextFlock) this.flock = this.makeFlock();
      if (this.flock && t > this.flock.t0 + this.flock.dur) {
        this.flock = null;
        this.nextFlock = t + this.rng.range(45, 90);
      }
    }
  }

  private makeFlock(): Flock {
    const r = this.rng;
    const n = r.pick([5, 7, 7, 9]);
    const birds: Goose[] = [{ dx: 0, dy: 0, ph: r() * 6 }];
    const gap = r.range(9, 13);
    const spread = r.range(0.45, 0.6);
    for (let i = 1; i < n; i++) {
      const arm = i % 2 ? 1 : -1;
      const k = Math.ceil(i / 2);
      // a V, a little ragged; sometimes one arm longer (人 rather than V)
      birds.push({ dx: -k * gap + r.gauss() * 1.4, dy: arm * k * gap * spread + r.gauss() * 1.2, ph: r() * 6 });
    }
    return { t0: this.t, dur: r.range(28, 40), dir: r.chance(0.5) ? 1 : -1, y: this.h * r.range(0.08, 0.24), size: r.range(3.2, 4.6) * clamp(this.h / 600, 0.8, 1.3), birds, slope: r.range(-0.05, 0.02) };
  }

  /** Draw onto a css-px-scaled context. */
  draw(ctx: CanvasRenderingContext2D): void {
    const m = ctx.getTransform();
    const res = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    ctx.save();
    ctx.imageSmoothingEnabled = true;

    if (this.rainy && this.rainLevel > 0.03) this.drawRain(ctx);
    if (this.flock) this.drawFlock(ctx, this.flock);

    const k = this.kind();
    if (k && this.ps.length) {
      const sprites = spriteSet(k, res * 0.6);
      if (k === 'firefly') {
        for (const p of this.ps) {
          // slow blink: long glow, a short dark rest
          const b = Math.max(0, Math.sin(this.t * 0.9 + p.phase * 7));
          const a = 0.15 + 0.85 * b * b;
          ctx.globalAlpha = a * (this.env.tod === 'dusk' ? 0.8 : 1);
          const s = p.size * (0.8 + 0.3 * b);
          ctx.drawImage(sprites[0].c, p.x - s, p.y - s, s * 2, s * 2);
        }
      } else {
        for (const p of this.ps) this.drawFlake(ctx, m, p, sprites);
      }
    }
    if (this.bursts.length) {
      for (let i = 0; i < this.bursts.length; i++) {
        const p = this.bursts[i];
        const sprites = spriteSet('burst', res * 0.6, this.burstColors[i]);
        this.drawFlake(ctx, m, p, sprites, clamp(p.life / 0.6, 0, 1) * clamp((p.maxLife - p.life) / 0.12, 0, 1));
      }
    }
    ctx.restore();
  }

  private drawFlake(ctx: CanvasRenderingContext2D, m: DOMMatrix, p: Particle, sprites: Sprite[], alpha = 1): void {
    const sp = sprites[p.sprite % sprites.length];
    const s = p.size / U;
    if (p.kind === 'snow') {
      ctx.setTransform(m);
      ctx.globalAlpha = alpha * lerp(0.75, 1, p.z);
      const d = p.size;
      ctx.drawImage(sp.c, p.x - d / 2, p.y - d / 2, d, d);
      return;
    }
    // tumbling: squash across the short axis as the petal/leaf turns over
    const flip = Math.cos(p.flip);
    const sy = s * (0.25 + 0.75 * Math.abs(flip));
    const c = Math.cos(p.rot), si = Math.sin(p.rot);
    ctx.setTransform(m.a * c * s + m.c * si * s, m.b * c * s + m.d * si * s, -m.a * si * sy + m.c * c * sy, -m.b * si * sy + m.d * c * sy, m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f);
    ctx.globalAlpha = alpha * (flip < 0 ? 0.8 : 1) * lerp(0.8, 1, p.z);
    ctx.drawImage(sp.c, -U / 2, -U / 2, U, U);
    ctx.setTransform(m);
  }

  private drawRain(ctx: CanvasRenderingContext2D): void {
    const n = Math.round(70 * this.rainLevel * clamp((this.w * this.h) / (900 * 600), 0.4, 1));
    const W = this.windNow;
    const t = this.rainSeed;
    ctx.strokeStyle = 'rgba(40,46,56,0.2)';
    ctx.lineWidth = 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const h1 = mixSeed(i, 71) / 4294967296, h2 = mixSeed(i, 72) / 4294967296, h3 = mixSeed(i, 73) / 4294967296;
      const speed = lerp(380, 520, h3);
      const len = lerp(10, 22, h3);
      const span = this.h + 40;
      const y = ((h1 * span + t * speed) % span) - 20;
      const slant = 0.12 + W * 0.25;
      const x = ((h2 * (this.w + 80) + y * slant) % (this.w + 80)) - 40;
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * slant, y + len);
    }
    ctx.stroke();
  }

  private drawFlock(ctx: CanvasRenderingContext2D, f: Flock): void {
    const u = (this.t - f.t0) / f.dur;
    const lead = f.dir > 0 ? lerp(-0.12, 1.12, u) * this.w : lerp(1.12, -0.12, u) * this.w;
    const y0 = f.y + f.slope * (lead - this.w / 2);
    const fade = Math.min(1, u * 8, (1 - u) * 8);
    ctx.strokeStyle = PIGMENTS.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.62 * fade;
    ctx.lineWidth = Math.max(0.7, f.size * 0.22);
    ctx.beginPath();
    for (const b of f.birds) {
      const x = lead + b.dx * f.dir;
      const y = y0 + b.dy + Math.sin(this.t * 0.6 + b.ph) * 0.8;
      // a tiny ink tick: two wings meeting at the body, flapping slowly
      const flap = Math.sin(this.t * 3.4 + b.ph);
      const s = f.size;
      const wy = -flap * s * 0.45;
      ctx.moveTo(x - s * f.dir * 0.2 - s, y + wy);
      ctx.quadraticCurveTo(x - s * 0.5, y + wy * 0.4 - s * 0.15, x, y + s * 0.12);
      ctx.quadraticCurveTo(x + s * 0.5, y + wy * 0.4 - s * 0.15, x + s * 0.95, y + wy * 0.9);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** A small celebratory burst at (x, y) — e.g. petals when a habit is done. */
  burst(x: number, y: number, color?: string): void {
    const r = makeRng(mixSeed(this.env.seed, 0xb0057 + this.burstN++));
    const n = r.int(8, 14);
    const col = color ?? (this.env.season === 'autumn' ? PIGMENTS.gamboge : PIGMENTS.rouge);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + r.gauss() * 0.55;
      const sp = r.range(55, 150);
      const life = r.range(1.7, 2.7);
      this.bursts.push({
        kind: 'petal', x: x + r.gauss() * 3, y: y + r.gauss() * 3,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: r() * Math.PI * 2, vr: r.range(-4, 4), flip: r() * 6, vf: r.range(3, 7),
        size: r.range(6, 10), sprite: r.int(0, 5), z: 0.8, phase: r() * 10, life, maxLife: life,
      });
      this.burstColors.push(col);
    }
    // stay within the particle budget: drop the oldest burst petals first
    const room = this.max - this.ps.length;
    if (this.bursts.length > room) {
      const drop = this.bursts.length - Math.max(0, room);
      this.bursts.splice(0, drop);
      this.burstColors.splice(0, drop);
    }
  }
}
