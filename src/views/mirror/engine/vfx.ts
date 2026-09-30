// 水月幻镜 · the player's light (VFX): shockwaves, crescent slashes, light lances, lightning, beams,
// blooms of light, flung flecks and ground stains — what the player's weapons, 镜技 and summons emit,
// drawn in ink-and-light wuxia style (流光): a near-white core in a saturated class tint with a soft
// halo, crisp vector edges, ink where the class is ink. Monster reactions belong to the feel layer
// (feel.ts); this is the other side: the blow itself.
//   · every pool is a structure of typed arrays with a cap per quality (VFX_CAP), halved under the
//     frame-time guard (W.degrade), which also drops the soft halos; nothing allocates per frame;
//   · entries live on simulation time (W.t): they hold with the hitstop and pause, and a new wave
//     (W.t restarts) clears them; the renderer sweeps the finished ones as it draws; they are drawn
//     at their age on the effects clock (W.t + dFx, m7: t itself at 60 Hz; on a 90–360 Hz screen it
//     moves on every frame), released on W.t;
//   · what the drawing itself spawns takes its random numbers from a stream of its own (drawing()),
//     so the simulation's effects draw the same shapes at every frame rate;
//   · crisp parts are vector paths with flat colours (arc, lineTo, fill, stroke); soft parts are the
//     sprites baked once in paint/vfx.ts; no gradient, shadowBlur, filter or blend mode per frame;
//   · reduced motion: no white flash cores on rings, no re-jagging lightning, no pulsing, short
//     trails (trails.ts);
//   · player-side only and never vermilion: danger stays the enemy's colour.
// Content reaches it through vfxW(w) (a WorldApi is always the World itself); the engine through vfxOf(W).
import type { WeaponId } from '../ids';
import type { AtlasId, Camera, Quality, Sprite, WorldApi } from '../types';
import type { World } from './world';
import { Pool } from './pools';
import { TAU } from './consts';
import { SH, TN } from '../paint/feel';
import { fxDelta } from './feel';
import { RING_EDGE, STAIN, VFX_BODY, VFX_CORE, VFX_EDGE, VFX_HALO, VT, type VfxSprites, isInkTint, vfxSprites } from '../paint/vfx';
import { VIEW_SPAN, viewOf } from '../paint/draw';

const STAIN_CRACK: number = STAIN.crack;

export { VT, STAIN } from '../paint/vfx';

/** Concurrent budgets by quality (the frame guard halves them and drops halos and shot glows). */
export const VFX_CAP = {
  low: { rings: 6, halos: 1, slashes: 6, lances: 6, bolts: 10, beams: 6, flecks: 40, blooms: 8, stains: 8, glows: 0, trails: 12, passes: 2, impacts: 8, impStep: 2, impGlows: 4, sheds: 0 },
  mid: { rings: 12, halos: 2, slashes: 12, lances: 10, bolts: 18, beams: 10, flecks: 90, blooms: 16, stains: 16, glows: 60, trails: 40, passes: 3, impacts: 14, impStep: 4, impGlows: 8, sheds: 5 },
  high: { rings: 20, halos: 4, slashes: 20, lances: 16, bolts: 28, beams: 14, flecks: 160, blooms: 24, stains: 24, glows: 160, trails: 96, passes: 3, impacts: 30, impStep: 6, impGlows: 20, sheds: 10 },
} as const satisfies Record<Quality, Record<string, number>>;
export type VfxCaps = (typeof VFX_CAP)[Quality];

/** Entry flags. */
export const VF = {
  /** Ink look: no light, no white core. */
  ink: 1,
  /** A soft halo band sprite under the ring. */
  halo: 2,
  /** A second, lagging ring. */
  double: 4,
  /** A thin ring (a pulse, a ripple). */
  thin: 8,
  /** A crescent sweeps the other way. */
  flip: 16,
  /** An ink hairline edge (gold-ink glaive). */
  edge: 32,
  /** A lance drawn whole at once, thick at its head (a lunge, a dash line). */
  streak: 64,
  /** Three parallel claw rakes. */
  rake: 128,
  /** A big moment (boss down, 镜技 landing): a wider band and a slower ring. */
  big: 256,
  /** A lance drawn whole as a cut mark (thin at both ends, fullest in the middle) that thins away in
   *  place: a cross-slash's strokes. */
  cut: 512,
} as const;
/** Options of a shockwave. */
export interface ShockOpts {
  life?: number; flags?: number; debris?: number; debrisTint?: number; fleck?: number; stain?: number; stainLife?: number; prio?: number;
}
const NO_OPTS: ShockOpts = {};
/** Bloom kinds. */
export const BK = { glow: 0, column: 1, halo: 2, glyph: 3 } as const;
/** Fleck kinds: an ink chip, a spark of light, a twinkle, a droplet, a jade chip, a go stone, a note
 *  drifting up, a fire ember rising. */
export const FK = { ink: 0, ember: 1, glint: 2, drop: 3, chip: 4, stone: 5, note: 6, flame: 7 } as const;
/** Impact flags: a crit (star-burst, long radial streaks), a kill (a ring and a flash), a heavy blow, a
 *  big body (elite, boss), a go stone's clack, ink (no light). */
export const IF = { crit: 1, kill: 2, heavy: 4, big: 8, clack: 16, ink: 32 } as const;
/** Impact flavours: what flies off a blow besides its sparks (by weapon: WPN_FLAVOR). */
export const FL = {
  blade: 0, heavy: 1, claw: 2, fist: 3, arrow: 4, coin: 5, jade: 6, peach: 7, fire: 8, thunder: 9, wine: 10, ink: 11, moon: 12, go: 13,
  music: 14, skill: 15, plain: 16,
} as const;

/** One pool of timed entries (fields are shared by the kinds; each kind reads what it needs). */
export class FxPool extends Pool {
  readonly x: Float32Array; readonly y: Float32Array; readonly a: Float32Array; readonly b: Float32Array;
  readonly r: Float32Array; readonly w: Float32Array; readonly t0: Float32Array; readonly life: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array;
  readonly tint: Uint8Array; readonly kind: Uint8Array; readonly flags: Uint16Array; readonly seed: Uint32Array;
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.a = F(); this.b = F(); this.r = F(); this.w = F(); this.t0 = F(); this.life = F(); this.vx = F(); this.vy = F();
    this.tint = new Uint8Array(cap); this.kind = new Uint8Array(cap); this.flags = new Uint16Array(cap); this.seed = new Uint32Array(cap);
  }
}

/** A VFX tint's feel-sprite tint (the flecks and glints reuse the feel layer's baked pieces). */
export const TN_OF: readonly number[] = [TN.azure, TN.jade, TN.gold, TN.moon, TN.ink, TN.wine, TN.indigo, TN.green, TN.gamboge, TN.white];

/** The crescent's thickness profile along its sweep (tail 0 → head 1): pointed both ends, fullest near
 *  the head; sampled finely enough that a wide sweep has no visible facets (one vertex per ≈ 5°). */
const NCR_MAX = 72;
const PROF = new Float32Array(NCR_MAX + 1);
/** The lance's width profile (base → tip): swelling, then a sharp point. */
const NLA = 10;
const LPROF = new Float32Array(NLA + 1);
const SPROF = new Float32Array(NLA + 1);
const CPROF = new Float32Array(NLA + 1);
for (let k = 0; k <= NLA; k++) {
  const p = k / NLA;
  LPROF[k] = p < 0.78 ? Math.pow(p / 0.78, 0.55) : Math.pow((1 - p) / 0.22, 0.9);
  SPROF[k] = Math.pow(p, 0.8) * (p < 0.88 ? 1 : (1 - p) / 0.12);
  CPROF[k] = Math.pow(Math.sin(Math.PI * p), 0.75);
}
/** Reduced motion: a ring's radius starts here (× its reach) and only settles outward. */
export const RING_CALM0 = 0.85;
/** Scratch vertices (lightning). */
const BX = new Float32Array(32), BY = new Float32Array(32);

function h01(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class Vfx {
  q: Quality;
  caps: VfxCaps;
  rings!: FxPool; slashes!: FxPool; lances!: FxPool; bolts!: FxPool; beams!: FxPool; flecks!: FxPool; blooms!: FxPool; stains!: FxPool;
  /** Impacts: where a blow meets a body (a hot white core, a halo in the weapon's light, sparks). */
  impacts!: FxPool;
  /** The step whose impacts are counted, and how many it made (a crowd under a fast weapon). */
  private impT = -1;
  private impN = 0;
  sprites: VfxSprites;
  /** Simulation time seen last (a smaller one means a new wave). */
  private lastT = 0;
  private seedN = 0x9e3779b9;
  /** Counts (dev, tests). */
  readonly st = { rings: 0, slashes: 0, lances: 0, bolts: 0, beams: 0, flecks: 0, blooms: 0, stains: 0, impacts: 0, dropped: 0 };

  constructor(private W: World) {
    this.q = W.quality;
    this.caps = VFX_CAP[this.q] ?? VFX_CAP.mid;
    this.build();
    this.sprites = vfxSprites(this.q);
  }

  private pools: FxPool[] = [];
  private build(): void {
    const c = this.caps;
    this.rings = new FxPool(c.rings); this.slashes = new FxPool(c.slashes); this.lances = new FxPool(c.lances); this.bolts = new FxPool(c.bolts);
    this.beams = new FxPool(c.beams); this.flecks = new FxPool(c.flecks); this.blooms = new FxPool(c.blooms); this.stains = new FxPool(c.stains);
    this.impacts = new FxPool(c.impacts);
    this.pools = [this.rings, this.slashes, this.lances, this.bolts, this.beams, this.flecks, this.blooms, this.stains, this.impacts];
  }
  private all(): readonly FxPool[] { return this.pools; }

  /** Follow the world: a new quality rebuilds the pools and sprites; a new wave clears them. */
  sync(): void {
    const W = this.W;
    if (W.quality !== this.q) {
      this.q = W.quality;
      this.caps = VFX_CAP[this.q] ?? VFX_CAP.mid;
      this.build();
      this.sprites = vfxSprites(this.q);
    }
    if (W.t < this.lastT - 0.25) this.clear();
    this.lastT = W.t;
  }
  clear(): void { for (const p of this.all()) p.clear(); }
  get calm(): boolean { return !!this.W.settings.reduceMotion; }
  /** Live entries of every kind. */
  count(): number { const P = this.pools; let n = 0; for (let k = 0; k < P.length; k++) n += P[k].count; return n; }

  /** A slot in pool P (prio 2 takes the oldest when full); −1 when the budget says no. */
  private take(P: FxPool, prio: number): number {
    const W = this.W;
    this.sync();
    const lim = W.degrade ? Math.max(1, P.cap >> 1) : P.cap;
    if (P.count >= lim) this.sweep(P);
    if (P.count >= lim) {
      if (prio < 2) { this.st.dropped++; return -1; }
      let old = -1, ot = Infinity;
      for (let i = 0; i < P.n; i++) if (P.alive[i] && P.t0[i] < ot) { ot = P.t0[i]; old = i; }
      if (old < 0) return -1;
      P.release(old);
    }
    const i = P.take();
    if (i < 0) return -1;
    P.t0[i] = W.t; P.flags[i] = 0; P.kind[i] = 0; P.seed[i] = this.seed(); P.vx[i] = 0; P.vy[i] = 0; P.a[i] = 0; P.b[i] = 0; P.w[i] = 1;
    return i;
  }
  /** Release the finished entries of P. */
  sweep(P: FxPool): void {
    const t = this.W.t;
    for (let i = 0; i < P.n; i++) if (P.alive[i] && (t - P.t0[i] >= P.life[i] || t < P.t0[i] - 0.25)) P.release(i);
    P.trim();
  }
  private seed(): number { let x = this.seedN; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seedN = x >>> 0; return this.seedN; }
  /** The renderer's own random stream, swapped in while a frame is drawn (drawing(true)): motes shed off
   *  shots, pickup pings and legacy fx taken over never take numbers from the simulation's effects. */
  private seedR = 0x85ebca6b;
  private inDraw = false;
  drawing(on: boolean): void {
    if (on === this.inDraw) return;
    this.inDraw = on;
    const s = this.seedN; this.seedN = this.seedR; this.seedR = s;
  }
  /** The clocks a draw reads (clocks()): the simulation's (releases) and the effects clock (ages). */
  private ts = 0;
  private tf = 0;
  private clocks(): void { const W = this.W; this.ts = W.t; this.tf = W.t + fxDelta(W); }
  /** An entry's drawn age (s) on the effects clock; one the simulation has begun never draws before its
   *  start (a blow struck in this frame's steps shows at 0, as at 60 Hz). */
  private age(t0: number): number { const a = this.tf - t0; return a < 0 && this.ts >= t0 ? 0 : a; }
  private rnd(): number { return this.seed() / 4294967296; }
  /** A cosmetic random in [0, 1) (the renderer's jitter; never the simulation's streams). */
  rnd01(): number { return this.rnd(); }

  // ───────────────────────────────────────────────────── emitters

  /**
   * A shockwave at (x, y) out to radius r: a soft halo band, a trailing tint band, a bright leading
   * edge and (VF.double) a second ring behind it; `debris` flecks thrown outward; a ground stain.
   */
  shock(x: number, y: number, r: number, tint: number, o: ShockOpts = NO_OPTS): number {
    const P = this.rings;
    const i = this.take(P, o.prio ?? 1);
    if (i < 0) return -1;
    const ink = isInkTint(tint);
    P.x[i] = x; P.y[i] = y; P.r[i] = Math.max(8, r); P.tint[i] = tint;
    P.life[i] = o.life ?? (r > 150 ? 0.45 : 0.34);
    P.flags[i] = (o.flags ?? (VF.double | VF.halo)) | (ink ? VF.ink : 0);
    this.st.rings++;
    // the pressure wind: flecks thrown outward (half on low, under the frame guard and with reduced motion)
    let n = o.debris ?? Math.min(12, 4 + Math.round(r / 22));
    if (this.q === 'low' || this.W.degrade || this.calm) n >>= 1;
    if (n > 0) this.debris(x, y, r, o.debrisTint ?? tint, n, o.fleck ?? -1);
    // the ground mark stays local to the blow (a crack across the whole ring reads as a web)
    if ((o.stain ?? -1) >= 0) this.stain(x, y, Math.min(r * 0.55, o.stain === STAIN_CRACK ? 64 : 84), o.stain!, o.stainLife ?? 1.6);
    return i;
  }
  /** A thin ring (a pulse of sound, a ripple, a ping): no band, no debris. */
  ring(x: number, y: number, r: number, tint: number, life = 0.35, flags: number = VF.thin): number {
    const P = this.rings;
    const i = this.take(P, 0);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.r[i] = Math.max(6, r); P.tint[i] = tint; P.life[i] = life; P.flags[i] = flags | (isInkTint(tint) ? VF.ink : 0);
    this.st.rings++;
    return i;
  }
  /** Flecks thrown outward from a blow: ink chips for ink, sparks of light for the rest. */
  debris(x: number, y: number, r: number, tint: number, n: number, kind = -1): void {
    const ink = isInkTint(tint);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + this.rnd() * 0.5;
      const v = r * (2.6 + 2.2 * this.rnd());
      // a blow: every other fleck a spark of the tint, the rest ink chips flung by the pressure wind (ink
      // on paper under the light); glints and drops (a level, moonlight, water, wine) stay all light
      const kd = kind === FK.glint || kind === FK.drop ? kind : kind >= 0 ? (k & 1 ? kind : FK.ink) : ink ? FK.ink : (k & 1 ? FK.ember : FK.ink);
      const tn = kd === FK.ink ? VT.ink : tint;
      this.fleck(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, Math.cos(a) * v, Math.sin(a) * v, kd, tn, 0.3 + 0.2 * this.rnd(), kd === FK.ink ? 0.8 + 0.5 * this.rnd() : 1);
    }
  }
  /** One fleck (analytic flight with drag). */
  fleck(x: number, y: number, vx: number, vy: number, kind: number, tint: number, life: number, size = 1): number {
    const P = this.flecks;
    const i = this.take(P, 0);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.kind[i] = kind; P.tint[i] = tint; P.life[i] = life; P.r[i] = size;
    this.st.flecks++;
    return i;
  }
  /** Rising glints (level-up, the elixir, moonlight): n sparkles drifting up around (x, y) within r. */
  motes(x: number, y: number, r: number, n: number, tint: number, life = 0.7): void {
    if (this.calm) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
      const a = this.rnd() * TAU, d = r * Math.sqrt(this.rnd());
      this.fleck(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, (this.rnd() - 0.5) * 30, -60 - 80 * this.rnd(), FK.glint, tint, life * (0.7 + 0.5 * this.rnd()), 0.8 + 0.5 * this.rnd());
    }
  }
  /**
   * A crescent slash from a swinger at (x, y) toward `dir`: radius r (its reach), an arc of `deg`,
   * revealed head-first over 0.06 s and fading while its tail catches up; a light core, a halo, a
   * trailing smear; VF.rake draws three claw rakes, VF.edge an ink rim (gold-ink glaive).
   */
  slash(x: number, y: number, dir: number, r: number, deg: number, tint: number, flags = 0, life = 0.2, prio = 1): number {
    const P = this.slashes;
    const i = this.take(P, prio);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.a[i] = dir; P.r[i] = Math.max(16, r); P.b[i] = Math.max(20, Math.min(360, deg)); P.tint[i] = tint; P.life[i] = life;
    P.flags[i] = flags | (isInkTint(tint) ? VF.ink : 0);
    P.w[i] = Math.max(8, Math.min(34, r * 0.21));
    this.st.slashes++;
    return i;
  }
  /** A lance of light from (x, y) along `dir` for `len`, `w` wide (a thrust): it shoots out, then thins away. */
  lance(x: number, y: number, dir: number, len: number, w: number, tint: number, life = 0.16, flags = 0, prio = 1): number {
    const P = this.lances;
    const i = this.take(P, prio);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.a[i] = dir; P.b[i] = Math.max(8, len); P.w[i] = Math.max(2, w); P.tint[i] = tint; P.life[i] = life;
    P.flags[i] = flags | (isInkTint(tint) ? VF.ink : 0);
    this.st.lances++;
    return i;
  }
  /** A streak from (x0, y0) to (x1, y1), thick at its head (a lunge, a dash's cut, a sword's path). */
  streak(x0: number, y0: number, x1: number, y1: number, w: number, tint: number, life = 0.22, prio = 1): number {
    const dx = x1 - x0, dy = y1 - y0;
    return this.lance(x0, y0, Math.atan2(dy, dx), Math.hypot(dx, dy), w, tint, life, VF.streak, prio);
  }
  /** Lightning from (x0, y0) to (x1, y1): a jagged vector bolt with a fork, re-jagged once at 50 ms. */
  bolt(x0: number, y0: number, x1: number, y1: number, tint: number, life = 0.18, w = 1, prio = 0): number {
    const P = this.bolts;
    const i = this.take(P, prio);
    if (i < 0) return -1;
    P.x[i] = x0; P.y[i] = y0; P.a[i] = x1; P.b[i] = y1; P.tint[i] = tint; P.life[i] = life; P.w[i] = w;
    this.st.bolts++;
    return i;
  }
  /** A beam of light from (x, y) along `dir` for `len`, `w` wide. */
  beam(x: number, y: number, dir: number, len: number, w: number, tint: number, life = 0.18): number {
    const P = this.beams;
    const i = this.take(P, 1);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.a[i] = dir; P.b[i] = len; P.w[i] = w; P.tint[i] = tint; P.life[i] = life;
    this.st.beams++;
    return i;
  }
  /** A bloom of light: a glow, a column of light, a soft halo, or the 镇 glyph slamming down (BK). */
  bloom(x: number, y: number, r: number, tint: number, life: number, kind: number = BK.glow, a0 = 1, prio = 1): number {
    const P = this.blooms;
    const i = this.take(P, prio);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.r[i] = r; P.tint[i] = tint; P.life[i] = life; P.kind[i] = kind; P.w[i] = a0;
    this.st.blooms++;
    return i;
  }
  /** A stain on the ground (STAIN): it lands, holds, then dries away over `life`. */
  stain(x: number, y: number, r: number, kind: number, life = 1.6): number {
    const P = this.stains;
    const i = this.take(P, 0);
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.r[i] = r; P.kind[i] = kind; P.life[i] = life; P.a[i] = this.rnd() * TAU;
    this.st.stains++;
    return i;
  }

  /**
   * Where a blow meets a body (x, y): a hot white core, a halo in the weapon's light that swells and
   * fades, sparks of that light flung out along the blow (`ang`; a crit's and a kill's all round), and
   * what flies off by flavour (FL: embers rise off a talisman's fire, arcs crackle off 雷符, wine and ink
   * splash, moonlight glints, jade chips, go stones clack). A crit adds a star-burst and long radial
   * streaks (IF.crit); a kill a ring and a flash (IF.kill). `r` is the body's radius. Budgeted per step
   * (a fast weapon in a crowd keeps a few a step; crits and kills get twice the room) and by the pool;
   * reduced motion keeps a gentle halo, no sparks, no flash.
   */
  impact(x: number, y: number, ang: number, r: number, tint: number, flav: number, flags = 0): number {
    const W = this.W;
    this.sync();
    if (W.t !== this.impT) { this.impT = W.t; this.impN = 0; }
    const special = (flags & (IF.crit | IF.kill | IF.big)) !== 0;
    const lim = this.caps.impStep * (W.degrade ? 0.5 : 1) * (special ? 2 : 1);
    if (this.impN >= lim) { this.st.dropped++; return -1; }
    const P = this.impacts;
    const i = this.take(P, flags & IF.big ? 2 : special ? 1 : 0);
    if (i < 0) return -1;
    this.impN++;
    // a wider view draws everything smaller: the blow's light grows back part of the way (impactViewK)
    r *= impactViewK(W.settings.view);
    P.x[i] = x; P.y[i] = y; P.a[i] = ang; P.r[i] = Math.max(8, Math.min(80, r)); P.tint[i] = tint; P.kind[i] = flav;
    P.flags[i] = flags | (isInkTint(tint) ? IF.ink : 0);
    P.life[i] = flags & IF.kill ? (flags & IF.big ? 0.42 : 0.3) : flags & IF.crit ? 0.26 : flags & IF.heavy ? 0.2 : 0.16;
    this.st.impacts++;
    // what flies off by flavour (half on low, under the frame guard and with reduced motion)
    let n = flags & IF.kill ? 4 : flags & IF.crit ? 3 : flags & IF.heavy ? 3 : 2;
    if (flags & IF.big) n += 2;
    if (this.q === 'low' || W.degrade || this.calm) n = Math.max(1, n >> 1);
    const R = P.r[i];
    for (let k = 0; k < n; k++) {
      // mostly along the blow (out of the far side), a kill's all round
      const a = flags & IF.kill ? (k / n) * TAU + this.rnd() * 0.8 : ang + (this.rnd() - 0.5) * 1.8;
      const c = Math.cos(a), s = Math.sin(a);
      const v = R * (5 + 5 * this.rnd());
      const x0 = x + c * R * 0.3, y0 = y + s * R * 0.3;
      switch (flav) {
        case FL.fire: case FL.peach:
          // embers lifting off the burnt paper
          this.fleck(x0, y0, c * v * 0.45, s * v * 0.3 - 40, FK.flame, k & 1 ? VT.gold : VT.gamboge, 0.42 + 0.2 * this.rnd(), 0.9 + 0.4 * this.rnd());
          break;
        case FL.thunder:
          if (k < 2 && !this.calm) {
            // arcs crackle off the struck body (reduced motion: no flicker of lightning, a glint)
            const L = R * (1.2 + 0.9 * this.rnd());
            this.bolt(x + c * R * 0.4, y + s * R * 0.4, x + c * (R * 0.4 + L), y + s * (R * 0.4 + L), VT.gold, 0.1, 0.5, 0);
          } else this.fleck(x0, y0, c * v, s * v, FK.glint, VT.gold, 0.22, 0.7);
          break;
        case FL.wine: case FL.fist:
          this.fleck(x0, y0, c * v, s * v - 30, FK.drop, VT.wine, 0.3 + 0.12 * this.rnd(), 0.9 + 0.5 * this.rnd());
          break;
        case FL.ink: case FL.claw:
          this.fleck(x0, y0, c * v, s * v, FK.ink, k === 0 ? VT.ink : VT.indigo, 0.3 + 0.15 * this.rnd(), 0.8 + 0.6 * this.rnd());
          break;
        case FL.moon: case FL.arrow:
          this.fleck(x0, y0, c * v * 0.6, s * v * 0.6 - 20, FK.glint, VT.moon, 0.3 + 0.15 * this.rnd(), 0.75 + 0.4 * this.rnd());
          break;
        case FL.coin: case FL.skill:
          this.fleck(x0, y0, c * v * 0.7, s * v * 0.7, FK.glint, VT.gold, 0.28 + 0.12 * this.rnd(), 0.8 + 0.4 * this.rnd());
          break;
        case FL.jade:
          this.fleck(x0, y0, c * v, s * v, FK.chip, VT.jade, 0.3 + 0.12 * this.rnd(), 0.9 + 0.4 * this.rnd());
          break;
        case FL.go:
          this.fleck(x0, y0, c * v * 0.8, s * v * 0.8, FK.stone, k & 1 ? VT.ink : VT.white, 0.32, 0.8 + 0.3 * this.rnd());
          break;
        case FL.music:
          this.fleck(x0, y0, c * v * 0.25, s * v * 0.2 - 50, k & 1 ? FK.glint : FK.note, VT.green, 0.5 + 0.2 * this.rnd(), 0.9);
          break;
        case FL.heavy:
          this.fleck(x0, y0, c * v, s * v, k & 1 ? FK.ember : FK.ink, k & 1 ? tint : VT.ink, 0.26 + 0.12 * this.rnd(), 1 + 0.4 * this.rnd());
          break;
        default:
          // steel: white-hot sparks off the blade
          this.fleck(x0, y0, c * v * 1.2, s * v * 1.2, FK.ember, k & 1 ? VT.white : tint, 0.14 + 0.08 * this.rnd(), 0.9);
      }
    }
    return i;
  }

  /** Is there an entry standing in for a legacy fx `name`, aged between a and b (0..1)? (QA harness.)
   *  A shockwave is a full ring (not a thin pulse or ping, nor the 琴's music ring); a pulse is a thin
   *  one or a music-green ring (the 琴's pulse is a full shockwave of sound). */
  probe(name: string, a = 0, b = 1): boolean {
    const ring = name === 'shockRing' || name === 'levelRing' || name === 'dustPuff' ? 1 : name === 'pulseRing' ? 2 : 0;
    const list = ring ? [this.rings]
      : name === 'swordStreak' ? [this.lances, this.slashes] : name === 'slashArc' ? [this.slashes]
        : name === 'boltChain' || name === 'lightningStrike' ? [this.bolts] : name === 'beamRay' ? [this.beams] : [];
    const t = this.W.t;
    for (const Q of list) for (let i = 0; i < Q.n; i++) {
      if (!Q.alive[i]) continue;
      const pulse = (Q.flags[i] & VF.thin) !== 0 || (ring !== 0 && Q.tint[i] === VT.green);
      if (ring === 1 && pulse) continue;
      if (ring === 2 && !pulse) continue;
      const u = (t - Q.t0[i]) / Q.life[i];
      if (u >= a && u <= b) return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────── drawing

  /** Ground stains (under the bodies). */
  drawGround(ctx: CanvasRenderingContext2D, cam: Camera): void {
    this.sync();
    this.clocks();
    const P = this.stains, S = this.sprites;
    if (!P.count) return;
    const pa = this.W.degrade ? 0.6 : 1;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const u = this.age(P.t0[i]) / P.life[i];
      if (u >= 1) continue;
      const s = S.stain(P.kind[i]);
      if (!s || !onScreen(cam, P.x[i], P.y[i], P.r[i])) continue;
      const al = (u < 0.06 ? u / 0.06 : 1 - Math.pow((u - 0.06) / 0.94, 2)) * pa;
      rot(ctx, cam, s, P.x[i], P.y[i], P.a[i], P.r[i] / 32, P.r[i] / 32, al);
    }
    ctx.globalAlpha = 1;
  }

  /** Columns of light (level-up, the elixir, 嫦娥 rising, a boss breaking): behind the figures, drawn
   *  with the player's layer before the player, so the light rises behind her instead of washing her out. */
  drawUnder(ctx: CanvasRenderingContext2D, cam: Camera, spr: (id: AtlasId) => Sprite | null): void {
    this.sync();
    this.clocks();
    if (!this.blooms.count) return;
    this.drawBlooms(ctx, cam, spr, this.W.degrade ? 0.65 : 1, true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** Everything else (the effects layer: under both kinds of shot). `spr` looks up the painter's sprites. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, feel: { get(shape: number, tint: number, frame?: number): Sprite | null } | null, spr: (id: AtlasId) => Sprite | null): void {
    this.sync();
    if (!this.count()) return;
    this.clocks();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pa = this.W.degrade ? 0.65 : 1;
    this.drawBlooms(ctx, cam, spr, pa, false);
    this.drawRings(ctx, cam, pa);
    this.drawBeams(ctx, cam, pa);
    this.drawBolts(ctx, cam, pa);
    this.drawSlashes(ctx, cam, feel, pa);
    this.drawLances(ctx, cam, feel, pa);
    this.drawImpacts(ctx, cam, pa);
    this.drawFlecks(ctx, cam, feel, pa);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  }

  private drawBlooms(ctx: CanvasRenderingContext2D, cam: Camera, spr: (id: AtlasId) => Sprite | null, pa: number, under: boolean): void {
    const P = this.blooms, S = this.sprites, calm = this.calm;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const u = this.age(P.t0[i]) / P.life[i];
      if (u >= 1) continue;
      const k = P.kind[i];
      if ((k === BK.column) !== under) continue;
      if (u < 0 || !onScreen(cam, P.x[i], P.y[i], P.r[i] * 1.5)) continue;
      const tint = P.tint[i];
      // reduced motion: a quick pop of light is only a gentle glow
      const a0 = P.w[i] * pa * (calm && k === BK.glow && P.life[i] < 0.3 ? 0.55 : 1);
      if (k === BK.glow) {
        const s = S.glow(tint);
        if (!s) continue;
        const e = 1 - (1 - u) * (1 - u);
        const sz = (P.r[i] / 16) * (calm ? 1 : 0.55 + 0.55 * e);
        rot(ctx, cam, s, P.x[i], P.y[i], 0, sz, sz, a0 * Math.pow(1 - u, 1.3));
      } else if (k === BK.column) {
        const s = S.column(tint) ?? S.column(VT.moon);
        if (!s) continue;
        const al = a0 * (u < 0.18 ? u / 0.18 : 1 - (u - 0.18) / 0.82);
        const sz = P.r[i] / 64;
        const wx = calm ? 1 : 0.8 + 0.4 * Math.min(1, u * 3);
        rot(ctx, cam, s, P.x[i], P.y[i], 0, sz * wx, sz, al);
      } else if (k === BK.halo) {
        const s = S.ring(tint);
        if (!s) continue;
        const e = calm ? 1 : 1 - Math.pow(1 - u, 3);
        const sz = (P.r[i] * (0.3 + 0.7 * e)) / (32 * RING_EDGE);
        rot(ctx, cam, s, P.x[i], P.y[i], 0, sz, sz, a0 * (1 - u));
      } else {
        // the 镇 glyph slams down onto the zone's own 镇: a short drop from a little above its size that
        // lands registered and darkens it (a long, large bloom ghosts as a second, misregistered glyph)
        const s = spr('fx:zhenGlyph' as AtlasId);
        if (!s) continue;
        const e = Math.min(1, u / 0.18);
        const sz = (P.r[i] / 32) * (calm ? 1 : 1 + 0.22 * (1 - e) * (1 - e));
        const al = a0 * (u < 0.18 ? 0.5 + 0.5 * e : 1 - (u - 0.18) / 0.82);
        rot(ctx, cam, s, P.x[i], P.y[i], 0, sz, sz, al);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawRings(ctx: CanvasRenderingContext2D, cam: Camera, pa: number): void {
    const P = this.rings;
    if (!P.count) return;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const u = this.age(P.t0[i]) / P.life[i];
      if (u >= 1) continue;
      if (u < 0) continue;
      this.ringAt(ctx, cam, P.x[i], P.y[i], P.r[i], u, P.tint[i], P.flags[i], pa);
    }
    ctx.globalAlpha = 1;
  }
  /** Soft halo bands left this frame (large soft fills are the costly part). */
  private halosLeft = 0;
  /** Soft impact glows (halo and white core) left this frame: past them an impact is its vectors only. */
  private impGlowsLeft = 0;
  /** Reset the frame's halo budgets (the renderer calls this before drawing legacy rings). */
  frameStart(): void {
    this.halosLeft = this.W.degrade ? 0 : this.caps.halos;
    this.impGlowsLeft = this.W.degrade ? this.caps.impGlows >> 1 : this.caps.impGlows;
  }

  /**
   * One shockwave ring at progress u (0..1) out to r: the soft band (sprite, budgeted), a trailing band,
   * the leading edge (light: a tint body, a white core, an ink hairline outside; ink: an ink edge) and
   * (VF.double) a second ring lagging behind. Also used for the legacy ring fx (render.ts).
   */
  ringAt(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, r: number, u: number, tint: number, fl: number, pa: number): void {
    const calm = this.calm, S = this.sprites;
    const d = cam.dpr || 1;
    const ink = (fl & VF.ink) !== 0, thin = (fl & VF.thin) !== 0;
    const e = 1 - Math.pow(1 - u, 3);
    // reduced motion: the ring stands near its reach and fades in place (no sweep across the screen),
    // eased in and at 60% (no pop of light)
    const R = r * (calm ? RING_CALM0 + (1 - RING_CALM0) * e : 0.12 + 0.88 * e);
    if (calm) pa *= 0.6 * (u < 0.1 ? 0.4 + 6 * u : 1);
    if (!onScreen(cam, x, y, R + 20)) return;
    const fade = 1 - u;
    if ((fl & VF.halo) && this.halosLeft > 0) {
      const s = S.ring(tint);
      if (s) {
        this.halosLeft--;
        const sz = R / (32 * RING_EDGE);
        rot(ctx, cam, s, x, y, 0, sz, sz, pa * fade * (ink ? 0.7 : 0.75));
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = (x - cam.x) * cam.scale + cam.w / 2, sy = (y - cam.y) * cam.scale + cam.h / 2;
    const Rs = R * cam.scale;
    const big = (fl & VF.big) !== 0;
    const edgeW = Math.max(1.3 * d, Math.min((big ? 5.5 : 3.6) * d, r * 0.026 * cam.scale)) * (thin ? 0.6 : 1) * (1 - 0.45 * u);
    if (!thin) {
      const band = Math.max(2 * d, Math.min(r * (big ? 0.12 : 0.08), 16) * cam.scale * (0.45 + 0.55 * fade));
      stroke(ctx, sx, sy, Math.max(0.5, Rs - band * 0.6), band, ink ? VFX_EDGE : VFX_BODY[tint], pa * fade * (ink ? 0.22 : 0.3));
    }
    if (ink) {
      stroke(ctx, sx, sy, Rs, edgeW * 1.3, VFX_EDGE, pa * Math.pow(fade, 0.7) * 0.8);
    } else {
      stroke(ctx, sx, sy, Rs, edgeW * 1.85, VFX_BODY[tint], pa * fade * 0.8);
      stroke(ctx, sx, sy, Rs, edgeW * (calm ? 0.9 : 0.85), calm ? VFX_HALO[tint] : VFX_CORE[tint], pa * Math.min(1, fade * 1.4));
      stroke(ctx, sx, sy, Rs + edgeW * 1.4, 0.8 * d, VFX_EDGE, pa * fade * 0.28);
    }
    if (fl & VF.double) {
      const u2 = (u - 0.16) / 0.84;
      if (u2 > 0) {
        const e2 = 1 - Math.pow(1 - u2, 3);
        const R2 = r * (calm ? RING_CALM0 + (1 - RING_CALM0) * e2 : 0.1 + 0.9 * e2) * 0.8 * cam.scale;
        stroke(ctx, sx, sy, R2, edgeW * 1.1, ink ? VFX_EDGE : VFX_BODY[tint], pa * (1 - u2) * (ink ? 0.5 : 0.65));
        if (!ink && !calm) stroke(ctx, sx, sy, R2, edgeW * 0.4, VFX_CORE[tint], pa * (1 - u2) * 0.8);
      }
    }
  }

  private drawSlashes(ctx: CanvasRenderingContext2D, cam: Camera, feel: { get(shape: number, tint: number, frame?: number): Sprite | null } | null, pa: number): void {
    const P = this.slashes, q = this.q, calm = this.calm;
    if (!P.count) return;
    const d = cam.dpr || 1;
    const star = feel ? feel.get(SH.star, TN.white) : null;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const u = this.age(P.t0[i]) / P.life[i];
      if (u >= 1) continue;
      if (u < 0 || !onScreen(cam, P.x[i], P.y[i], P.r[i] + 30)) continue;
      const fl = P.flags[i], tint = P.tint[i];
      const sg = fl & VF.flip ? -1 : 1;
      const deg = P.b[i];
      const span = (deg >= 300 ? TAU : (deg * Math.PI) / 180) * sg;
      const a0 = P.a[i] - span / 2;
      // reduced motion: the crescent opens at once and fades where it stands (no sweep round the screen)
      const head = calm ? Math.min(1, u / 0.1) : Math.min(1, u / 0.32);
      const tail = calm ? 0 : Math.pow(Math.max(0, (u - 0.22) / 0.78), 1.2) * 0.98;
      if (head - tail < 0.02) continue;
      const aH = a0 + span * head, aT = a0 + span * tail;
      const fade = pa * (calm ? 0.75 : 1) * (u < 0.4 ? 1 : 1 - (u - 0.4) / 0.6);
      const sx = (P.x[i] - cam.x) * cam.scale + cam.w / 2, sy = (P.y[i] - cam.y) * cam.scale + cam.h / 2;
      const R = P.r[i] * 0.78 * cam.scale;
      const th = P.w[i] * cam.scale * (0.7 + 0.3 * head);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (fl & VF.rake) {
        // three claw rakes of wet ink with a pale hairline (猫爪)
        for (let k = 0; k < 3; k++) {
          const Rk = R - k * th * 0.55;
          crescent(ctx, sx, sy, Rk, aT, aH, th * 0.3, 0);
          fill(ctx, VFX_BODY[tint], fade * (k === 1 ? 0.95 : 0.8));
          if (!(fl & VF.ink)) { crescent(ctx, sx, sy, Rk - th * 0.04, aT, aH, th * 0.1, 0); fill(ctx, VFX_CORE[tint], fade * 0.9); }
        }
        continue;
      }
      if (fl & VF.ink) {
        // an ink crescent: a wet dark body, a dry lighter hairline inside it (飞白)
        crescent(ctx, sx, sy, R, aT, aH, th * 1.05, 1.2 * d);
        fill(ctx, VFX_EDGE, fade * 0.18);
        crescent(ctx, sx, sy, R, aT, aH, th, 0);
        fill(ctx, VFX_BODY[tint], fade * 0.88);
        crescent(ctx, sx, sy, R - th * 0.35, aT, aH, th * 0.08, 0);
        fill(ctx, '#f4efe4', fade * 0.55);
        continue;
      }
      // halo, two afterimages lagging behind the head (the smear), the body, the white core, a bright
      // hairline along the cutting edge
      crescent(ctx, sx, sy, R, aT, aH, th * 1.5 + 3.5 * d, 3.5 * d + th * 0.3);
      fill(ctx, VFX_HALO[tint], fade * 0.4);
      if (!calm) {
        const ghosts = q === 'low' ? 1 : 2;
        for (let gk = ghosts; gk >= 1; gk--) {
          const back = 0.2 * gk * sg;
          crescent(ctx, sx, sy, R * (1 - 0.025 * gk), aT - back, aH - back, th * (0.9 - 0.12 * gk), 0);
          fill(ctx, VFX_BODY[tint], fade * (gk === 1 ? 0.32 : 0.16));
        }
      }
      crescent(ctx, sx, sy, R, aT, aH, th, th * 0.06);
      fill(ctx, VFX_BODY[tint], fade * 0.92);
      if (fl & VF.edge) {
        crescent(ctx, sx, sy, R + th * 0.06, aT, aH, th * 0.16, 0.9 * d);
        fill(ctx, VFX_EDGE, fade * 0.7);
      }
      crescent(ctx, sx, sy, R - th * 0.06, aT, aH, th * 0.42, th * 0.04);
      fill(ctx, VFX_CORE[tint], fade);
      crescent(ctx, sx, sy, R + th * 0.02, aT, aH, th * 0.1, 0);
      fill(ctx, '#ffffff', fade * 0.9);
      // the light gathered at the leading tip: a soft bloom and a glint
      if (!calm && u < 0.55) {
        const hx = P.x[i] + Math.cos(aH) * P.r[i] * 0.74, hy = P.y[i] + Math.sin(aH) * P.r[i] * 0.74;
        const g = this.sprites.glow(tint);
        if (g) rot(ctx, cam, g, hx, hy, 0, (P.w[i] * 1.6) / 16, (P.w[i] * 1.6) / 16, fade * 0.8 * (1 - u * 1.5));
        if (star) rot(ctx, cam, star, hx, hy, aH, 0.5, 0.5, fade * (1 - u * 1.6));
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawLances(ctx: CanvasRenderingContext2D, cam: Camera, feel: { get(shape: number, tint: number, frame?: number): Sprite | null } | null, pa: number): void {
    const P = this.lances, calm = this.calm;
    if (!P.count) return;
    const d = cam.dpr || 1;
    const star = feel ? feel.get(SH.star, TN.white) : null;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const u = this.age(P.t0[i]) / P.life[i];
      if (u >= 1) continue;
      if (u < 0) continue;
      const fl = P.flags[i], tint = P.tint[i];
      const cutK = (fl & VF.cut) !== 0;
      const streakK = (fl & VF.streak) !== 0 || cutK;
      const ext = streakK ? 1 : Math.min(1, u / 0.22);
      const x = P.x[i], y = P.y[i], dir = P.a[i];
      const len = P.b[i];
      const mx = x + Math.cos(dir) * len * 0.5, my = y + Math.sin(dir) * len * 0.5;
      if (!onScreen(cam, mx, my, len * 0.5 + 20)) continue;
      const fade = pa * (u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7);
      const c = Math.cos(dir), s = Math.sin(dir);
      const sx = (x - cam.x) * cam.scale + cam.w / 2, sy = (y - cam.y) * cam.scale + cam.h / 2;
      ctx.setTransform(c, s, -s, c, sx, sy);
      // a streak's tail catches up with its head as it fades
      const L = len * ext * cam.scale;
      const x0 = cutK ? 0 : streakK ? L * Math.min(0.85, u * 0.9) : Math.min(L * 0.1, 12 * cam.scale);
      const hw = (P.w[i] * cam.scale * 0.5) * (cutK ? 1 - 0.7 * u : 1 - 0.45 * u);
      const prof = cutK ? CPROF : streakK ? SPROF : LPROF;
      if (fl & VF.ink) {
        lancePath(ctx, x0, L, hw * 1.25 + d, prof); fill(ctx, VFX_EDGE, fade * 0.16);
        lancePath(ctx, x0, L, hw, prof); fill(ctx, VFX_BODY[tint], fade * 0.85);
        lancePath(ctx, x0, L, hw * 0.18, prof); fill(ctx, '#f4efe4', fade * 0.4);
      } else {
        lancePath(ctx, x0, L, hw * 2.1 + 2 * d, prof); fill(ctx, VFX_HALO[tint], fade * 0.3);
        lancePath(ctx, x0, L, hw, prof); fill(ctx, VFX_BODY[tint], fade * 0.88);
        lancePath(ctx, x0, L, Math.max(0.7 * d, hw * 0.34), prof); fill(ctx, VFX_CORE[tint], fade);
        if (!streakK && !calm) {
          // speed lines alongside the thrust
          ctx.lineWidth = Math.max(1, 1.1 * d);
          ctx.strokeStyle = VFX_BODY[tint];
          ctx.globalAlpha = fade * 0.5;
          ctx.beginPath();
          const off = hw * 2.2 + 3 * d;
          ctx.moveTo(L * 0.18, off); ctx.lineTo(L * 0.62, off);
          ctx.moveTo(L * 0.3, -off); ctx.lineTo(L * 0.78, -off);
          ctx.moveTo(L * 0.05, off * 1.7); ctx.lineTo(L * 0.4, off * 1.7);
          ctx.stroke();
        }
      }
      if (star && !calm && !(fl & VF.ink) && u < 0.45) {
        const hx = x + c * len * (cutK ? 0.5 : ext), hy = y + s * len * (cutK ? 0.5 : ext);
        const g = cutK ? null : this.sprites.glow(tint);
        if (g) rot(ctx, cam, g, hx, hy, 0, (P.w[i] * 1.4) / 16, (P.w[i] * 1.4) / 16, fade * 0.8 * (1 - u * 2));
        rot(ctx, cam, star, hx, hy, dir, 0.44, 0.44, fade * (1 - u * 2));
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The impacts (impact()): the weapon's halo swelling and fading, the hot white core, a kill's ring,
   * a crit's star-burst (a go stone's small clack star), then the sparks as short vector streaks —
   * two strokes per impact (the tint, then the white core), no sprite per spark.
   */
  private drawImpacts(ctx: CanvasRenderingContext2D, cam: Camera, pa: number): void {
    const P = this.impacts, S = this.sprites, calm = this.calm;
    if (!P.count) return;
    const d = cam.dpr || 1, k0 = cam.scale;
    const white = S.glow(VT.white);
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const u = this.age(P.t0[i]) / P.life[i];
      if (u >= 1) continue;
      if (u < 0) continue;
      const x = P.x[i], y = P.y[i], r = P.r[i], fl = P.flags[i], tint = P.tint[i], ang = P.a[i];
      if (!onScreen(cam, x, y, r * 4)) continue;
      const ink = (fl & IF.ink) !== 0, kill = (fl & IF.kill) !== 0, crit = (fl & IF.crit) !== 0, heavy = (fl & IF.heavy) !== 0;
      const big = (fl & IF.big) !== 0 ? 1.35 : 1;
      const e = 1 - (1 - u) * (1 - u);
      // 1 · the halo in the weapon's light (reduced motion: a gentle glow that does not pop)
      const Rh = r * (kill ? 2.5 : crit ? 2.2 : heavy ? 1.9 : 1.55) * big;
      // (soft glows are budgeted per frame, in pool order: past the budget an impact is its vectors only)
      const soft = this.impGlowsLeft > 0;
      if (soft) this.impGlowsLeft--;
      const g = soft ? S.glow(tint) : null;
      if (g) {
        const sz = (Rh / 16) * (calm ? 0.9 : 0.6 + 0.5 * e);
        rot(ctx, cam, g, x, y, 0, sz, sz, pa * (calm ? 0.5 : 0.95) * Math.pow(1 - u, 1.25));
      }
      // 2 · the hot white core (ink has none), a kill's a larger flash
      if (soft && !ink && white) {
        const sz = ((Rh * (kill ? 0.66 : crit ? 0.56 : 0.46)) / 16) * (calm ? 0.8 : 1.2 - 0.5 * u);
        rot(ctx, cam, white, x, y, 0, sz, sz, pa * (calm ? 0.35 : 1) * (1 - u) * (1 - u));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = (x - cam.x) * k0 + cam.w / 2, sy = (y - cam.y) * k0 + cam.h / 2;
      // 3 · a kill's ring of light breaking outward
      if (kill) {
        const R = r * (calm ? 1.9 : 0.7 + 1.9 * (1 - Math.pow(1 - u, 3))) * big * k0;
        const w = Math.max(1.2 * d, Math.min(5 * d, r * 0.16 * k0)) * (1 - 0.6 * u);
        if (ink) stroke(ctx, sx, sy, R, w * 1.3, VFX_EDGE, pa * (1 - u) * 0.7);
        else {
          stroke(ctx, sx, sy, R, w * 1.9, VFX_BODY[tint], pa * (1 - u) * (calm ? 0.45 : 0.75));
          stroke(ctx, sx, sy, R, w * 0.7, VFX_CORE[tint], pa * (1 - u) * (calm ? 0.5 : 1));
        }
      }
      // 4 · a crit's star-burst (gold with a white heart), a go stone's small clack star
      if (crit || (fl & IF.clack)) {
        const grow = calm ? 0.85 : u < 0.22 ? 0.45 + 2.5 * u : 1 - 0.3 * ((u - 0.22) / 0.78);
        const L = r * (crit ? 2.0 : 1.05) * big * grow * k0;
        const rays = crit ? 8 : 4;
        const a0 = ang + (calm ? 0 : u * 0.5);
        starPath(ctx, sx, sy, L, rays, a0, 0.14);
        fill(ctx, crit ? VFX_BODY[VT.gold] : VFX_EDGE, pa * (calm ? 0.55 : 0.95) * (1 - Math.pow(u, 1.6)));
        starPath(ctx, sx, sy, L * 0.62, rays, a0, 0.12);
        fill(ctx, crit ? VFX_CORE[VT.gold] : '#ffffff', pa * (calm ? 0.6 : 1) * (1 - Math.pow(u, 1.4)));
      }
      // 5 · the sparks: short streaks of the weapon's light flung out (none with reduced motion)
      if (calm) continue;
      const n = (kill ? 9 : crit ? 8 : heavy ? 6 : 4) + (big > 1 ? 3 : 0);
      const all = kill || crit;
      const seed = P.seed[i];
      const reach = r * (kill ? 2.4 : crit ? 2.1 : heavy ? 1.9 : 1.6) * big;
      const len0 = r * (crit ? 1.15 : kill ? 0.95 : heavy ? 0.9 : 0.8) * big;
      const ek = 1 - Math.pow(1 - u, 2.2), tail = Math.pow(1 - u, 0.8);
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 1 && ink) break;
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const h = h01(seed, k), sp = 0.55 + 0.65 * h01(seed, k + 31);
          const a = all ? ang + (k / n) * TAU + (h - 0.5) * 0.55 : k === n - 1 ? ang + Math.PI + (h - 0.5) * 1.2 : ang + (h - 0.5) * 1.9;
          const c = Math.cos(a), s = Math.sin(a);
          const r0 = (r * 0.25 + reach * sp * ek) * k0, r1 = r0 + len0 * sp * tail * k0 * (crit && k % 2 === 0 ? 1.5 : 1);
          ctx.moveTo(sx + c * r0, sy + s * r0);
          ctx.lineTo(sx + c * r1, sy + s * r1);
        }
        if (pass === 0) {
          ctx.lineWidth = Math.max(1.3 * d, (heavy || kill ? 3.5 : 3) * d * (1 - 0.5 * u));
          ctx.strokeStyle = ink ? VFX_EDGE : VFX_BODY[tint];
          ctx.globalAlpha = Math.min(1, pa * (1 - u) * (ink ? 0.8 : 0.95));
        } else {
          ctx.lineWidth = Math.max(0.8 * d, 1.3 * d * (1 - 0.4 * u));
          ctx.strokeStyle = VFX_CORE[tint];
          ctx.globalAlpha = Math.min(1, pa * (1 - u * u));
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBolts(ctx: CanvasRenderingContext2D, cam: Camera, pa: number): void {
    const P = this.bolts, calm = this.calm, S = this.sprites;
    if (!P.count) return;
    const d = cam.dpr || 1;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const age = this.age(P.t0[i]), u = age / P.life[i];
      if (u >= 1) continue;
      if (u < 0) continue;
      const x0 = P.x[i], y0 = P.y[i], x1 = P.a[i], y1 = P.b[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (!onScreen(cam, (x0 + x1) / 2, (y0 + y1) / 2, len / 2 + 30)) continue;
      const tint = P.tint[i];
      const fade = pa * (1 - u * u);
      const seed = P.seed[i] + (calm ? 0 : Math.floor(age / 0.05));
      const n = Math.max(3, Math.min(20, Math.round(len / 16)));
      const amp = Math.min(16, len * 0.14) * cam.scale;
      const ux = len > 0 ? (x1 - x0) / len : 1, uy = len > 0 ? (y1 - y0) / len : 0;
      const sx0 = (x0 - cam.x) * cam.scale + cam.w / 2, sy0 = (y0 - cam.y) * cam.scale + cam.h / 2;
      const Ls = len * cam.scale;
      for (let k = 0; k <= n; k++) {
        const p = k / n, o = k === 0 || k === n ? 0 : (h01(seed, k) - 0.5) * 2 * amp;
        BX[k] = sx0 + ux * Ls * p - uy * o;
        BY[k] = sy0 + uy * Ls * p + ux * o;
      }
      // a fork off the middle
      const fk = n >> 1, fa = Math.atan2(uy, ux) + (h01(seed, 99) < 0.5 ? -0.7 : 0.7);
      const fl = Ls * 0.22;
      const fx1 = BX[fk] + Math.cos(fa) * fl * 0.5 + (h01(seed, 98) - 0.5) * amp, fy1 = BY[fk] + Math.sin(fa) * fl * 0.5 + (h01(seed, 97) - 0.5) * amp;
      const fx2 = BX[fk] + Math.cos(fa) * fl, fy2 = BY[fk] + Math.sin(fa) * fl;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const w = P.w[i];
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath();
        ctx.moveTo(BX[0], BY[0]);
        for (let k = 1; k <= n; k++) ctx.lineTo(BX[k], BY[k]);
        ctx.moveTo(BX[fk], BY[fk]); ctx.lineTo(fx1, fy1); ctx.lineTo(fx2, fy2);
        if (pass === 0) { ctx.lineWidth = 7 * d * w; ctx.strokeStyle = VFX_HALO[tint]; ctx.globalAlpha = fade * 0.4; }
        else if (pass === 1) { ctx.lineWidth = 3 * d * w; ctx.strokeStyle = VFX_BODY[tint]; ctx.globalAlpha = fade * 0.95; }
        else { ctx.lineWidth = 1.2 * d * w; ctx.strokeStyle = VFX_CORE[tint]; ctx.globalAlpha = fade; }
        ctx.stroke();
      }
      const g = S.glow(tint);
      if (g) {
        rot(ctx, cam, g, x1, y1, 0, 0.9 * w, 0.9 * w, fade * 0.9);
        rot(ctx, cam, g, x0, y0, 0, 0.55 * w, 0.55 * w, fade * 0.6);
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  }

  private drawBeams(ctx: CanvasRenderingContext2D, cam: Camera, pa: number): void {
    const P = this.beams, S = this.sprites, calm = this.calm;
    if (!P.count) return;
    const d = cam.dpr || 1;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const age = this.age(P.t0[i]), u = age / P.life[i];
      if (u >= 1) continue;
      if (u < 0) continue;
      const x = P.x[i], y = P.y[i], dir = P.a[i], len = P.b[i], tint = P.tint[i];
      const c = Math.cos(dir), s = Math.sin(dir);
      if (!onScreen(cam, x + c * len / 2, y + s * len / 2, len / 2 + 30)) continue;
      const fade = pa * (1 - u);
      const sx = (x - cam.x) * cam.scale + cam.w / 2, sy = (y - cam.y) * cam.scale + cam.h / 2;
      const L = len * cam.scale, hw = P.w[i] * cam.scale * 0.5 * (1 - 0.55 * u);
      ctx.setTransform(c, s, -s, c, sx, sy);
      ctx.fillStyle = VFX_HALO[tint]; ctx.globalAlpha = fade * 0.32; ctx.fillRect(0, -hw * 2.2 - 2 * d, L, (hw * 2.2 + 2 * d) * 2);
      ctx.fillStyle = VFX_BODY[tint]; ctx.globalAlpha = fade * 0.75; ctx.fillRect(0, -hw, L, hw * 2);
      ctx.fillStyle = VFX_CORE[tint]; ctx.globalAlpha = fade; ctx.fillRect(0, -Math.max(0.6 * d, hw * 0.34), L, Math.max(1.2 * d, hw * 0.68));
      ctx.fillStyle = VFX_EDGE; ctx.globalAlpha = fade * 0.25;
      ctx.fillRect(0, -hw * 2.2 - 2.8 * d, L, 0.8 * d); ctx.fillRect(0, hw * 2.2 + 2 * d, L, 0.8 * d);
      const g = S.glow(tint);
      if (g) {
        rot(ctx, cam, g, x, y, 0, 0.8, 0.8, fade);
        rot(ctx, cam, g, x + c * len, y + s * len, 0, 1.1, 1.1, fade);
        if (!calm) for (let k = 0; k < 2; k++) {
          const p = ((age * 1400 + k * len * 0.5) % len);
          rot(ctx, cam, g, x + c * p, y + s * p, 0, 0.45, 0.45, fade * 0.9);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFlecks(ctx: CanvasRenderingContext2D, cam: Camera, feel: { get(shape: number, tint: number, frame?: number): Sprite | null } | null, pa: number): void {
    const P = this.flecks;
    if (!P.count || !feel) { if (P.count) this.sweep(P); return; }
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      if (this.ts - P.t0[i] >= P.life[i]) { P.release(i); continue; }
      const age = this.age(P.t0[i]), u = age / P.life[i];
      if (u >= 1) continue;
      if (u < 0) continue;
      const k = P.kind[i];
      const drag = k === FK.glint ? 1.5 : k === FK.flame ? 2.5 : k === FK.note ? 2 : 6;
      const f = (1 - Math.exp(-drag * age)) / drag, ev = Math.exp(-drag * age);
      // embers rise off the fire, notes drift up
      const lift = k === FK.flame ? 60 * age * age * 2.2 : 0;
      const x = P.x[i] + P.vx[i] * f, y = P.y[i] + P.vy[i] * f - lift;
      if (!onScreen(cam, x, y, 16)) continue;
      const tn = TN_OF[P.tint[i]] ?? TN.ink;
      const sz = P.r[i];
      if (k === FK.flame) {
        const s = feel.get(SH.ember, tn);
        const vy = P.vy[i] * ev - 264 * age;
        if (s) rot(ctx, cam, s, x, y, Math.atan2(vy, P.vx[i] * ev), sz * (0.75 + 0.3 * Math.sin(age * 30 + (P.seed[i] & 7))), sz, pa * (u < 0.2 ? 1 : (1 - u) / 0.8));
        continue;
      }
      if (k === FK.chip || k === FK.stone || k === FK.note) {
        const s = feel.get(k === FK.chip ? SH.chip : k === FK.stone ? SH.stone : SH.note, k === FK.stone ? (P.tint[i] === VT.white ? TN.white : TN.black) : tn);
        const spin = k === FK.note ? Math.sin(age * 6 + (P.seed[i] & 7)) * 0.4 : age * 14 + (P.seed[i] & 7);
        if (s) rot(ctx, cam, s, x, y, spin, sz, sz, pa * (u < 0.5 ? 1 : (1 - u) / 0.5));
        continue;
      }
      if (k === FK.glint) {
        const s = feel.get(SH.glint, tn);
        if (s) rot(ctx, cam, s, x, y, age * 5 + (P.seed[i] & 7), sz * (1 - 0.4 * u), sz * (1 - 0.4 * u), pa * (u < 0.3 ? 1 : (1 - u) / 0.7));
      } else if (k === FK.ember) {
        const s = feel.get(SH.ember, tn);
        const fvx = P.vx[i], fvy = P.vy[i], sp = Math.sqrt(fvx * fvx + fvy * fvy) * ev;
        if (s) rot(ctx, cam, s, x, y, Math.atan2(P.vy[i], P.vx[i]), sz * (0.45 + Math.min(0.9, sp / 320)), sz, pa * (1 - u));
      } else {
        const s = feel.get(k === FK.drop ? SH.drop : SH.dot, tn);
        const fvx = P.vx[i], fvy = P.vy[i], sp = Math.sqrt(fvx * fvx + fvy * fvy) * ev;
        // the pressure wind: a fast chip is a streak along its flight, settling into a dot
        const kx = k === FK.drop ? sz * (1 + Math.min(1.4, sp / 260)) : sz * (1 - 0.35 * u) * (1 + Math.min(1.8, sp / 170));
        if (s) rot(ctx, cam, s, x, y, Math.atan2(P.vy[i], P.vx[i]), kx, sz * (1 - 0.35 * u), pa * (1 - u * u) * 0.95);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ───────────────────────────────────────────────────── path helpers (screen space, no allocation)

function onScreen(cam: Camera, x: number, y: number, r: number): boolean {
  const sx = (x - cam.x) * cam.scale + cam.w / 2, sy = (y - cam.y) * cam.scale + cam.h / 2, rr = r * cam.scale;
  return sx + rr >= 0 && sy + rr >= 0 && sx - rr <= cam.w && sy - rr <= cam.h;
}
/** A sprite about its anchor, rotated, scaled kx along and ky across (world size × cam). */
function rot(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, ang: number, kx: number, ky: number, a: number): void {
  if (a <= 0.01) return;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  const c = Math.cos(ang) * cam.scale, n = Math.sin(ang) * cam.scale;
  ctx.setTransform(c * kx, n * kx, -n * ky, c * ky, px, py);
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
}
function stroke(ctx: CanvasRenderingContext2D, sx: number, sy: number, R: number, w: number, col: string, a: number): void {
  if (a <= 0.01 || R <= 0) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(sx, sy, R, 0, TAU);
  ctx.stroke();
}
function fill(ctx: CanvasRenderingContext2D, col: string, a: number): void {
  if (a <= 0.01) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = col;
  ctx.fill();
}
/** A crescent about (cx, cy): the arc of radius R from aT to aH, thInner inward and thOuter outward at its fullest. */
function crescent(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, aT: number, aH: number, thIn: number, thOut: number): void {
  const n = Math.max(12, Math.min(NCR_MAX, Math.ceil(Math.abs(aH - aT) / 0.09)));
  if (n !== profN) { for (let k = 0; k <= n; k++) PROF[k] = Math.sin(Math.PI * Math.pow(k / n, 1.6)); profN = n; }
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = aT + (aH - aT) * (k / n), rr = R + thOut * PROF[k];
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let k = n; k >= 0; k--) {
    const a = aT + (aH - aT) * (k / n), rr = Math.max(0, R - thIn * PROF[k]);
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}
let profN = -1;
/** A star of `rays` points about (cx, cy): the rays alternate long and half-long (a 4-ray star: all
 *  long), `inner` × L between them, the first ray along a0. */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, L: number, rays: number, a0: number, inner: number): void {
  ctx.beginPath();
  const m = rays * 2;
  for (let k = 0; k < m; k++) {
    const a = a0 + (k / m) * TAU;
    const rr = k & 1 ? L * inner : rays > 4 && (k >> 1) & 1 ? L * 0.5 : L;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
/** A lance along +x from x0 to L (the current transform is the lance's frame), half-width hw by profile. */
function lancePath(ctx: CanvasRenderingContext2D, x0: number, L: number, hw: number, prof: Float32Array): void {
  ctx.beginPath();
  const n = prof.length - 1;
  for (let k = 0; k <= n; k++) { const x = x0 + (L - x0) * (k / n); if (k === 0) ctx.moveTo(x, -hw * prof[k]); else ctx.lineTo(x, -hw * prof[k]); }
  for (let k = n; k >= 0; k--) ctx.lineTo(x0 + (L - x0) * (k / n), hw * prof[k]);
  ctx.closePath();
}

// ───────────────────────────────────────────────────── access

const STORE = new WeakMap<object, Vfx>();
/** The world's VFX (made on first use). */
export function vfxOf(W: World): Vfx {
  let v = STORE.get(W);
  if (!v) { v = new Vfx(W); STORE.set(W, v); }
  return v;
}
/** Content's door (a WorldApi is always the World itself). */
export const vfxW = (w: WorldApi): Vfx => vfxOf(w as unknown as World);

/** The slash tint of a feel class: blades azure, heavy arms gold (with an ink rim), claws ink, fists and wine wine. */
export function slashTint(fc: number): number {
  switch (fc) {
    case 1: return VT.gold; // heavy: 偃月, 花锄, 捣药杵 (gold-ink)
    case 2: return VT.ink; // claw
    case 3: case 7: return VT.wine; // fist, wine
    case 8: return VT.indigo; // ink brush
    case 9: return VT.jade; // flying
    case 4: case 12: case 14: return VT.moon; // arrows, moon, generic
    case 6: return VT.gamboge; // talismans
    case 10: return VT.white; // go
    case 11: return VT.green; // music
    case 13: return VT.gold; // the 镜技
    default: return VT.azure; // blades, darts
  }
}
/** The slash flags of a feel class (a glaive's ink rim, a claw's three rakes). */
export function slashFlags(fc: number): number {
  return fc === 1 ? VF.edge : fc === 2 ? VF.rake : 0;
}

/**
 * 流光 per weapon: the light of its trails, glows, slashes and blows (never vermilion). 仙剑 are jade,
 * steel blades azure, glaives gold-ink, claws ink, fists and wine wine, talismans gamboge and gold,
 * music green, moon moon-white, ink indigo, go ink.
 */
export const WPN_TINT: Readonly<Record<WeaponId, number>> = {
  qingfeng: VT.azure, longquan: VT.azure, yanyue: VT.gold, hoe: VT.gold, pestle: VT.jade, claw: VT.ink, drunkfist: VT.wine,
  dart: VT.azure, coindart: VT.gold, sunbow: VT.gold, repeater: VT.azure, rod: VT.azure,
  qingping: VT.jade, casket: VT.jade, peach: VT.gamboge, seven: VT.jade,
  thunder: VT.gold, fire: VT.gamboge, gourd: VT.wine, qin: VT.green, flute: VT.green,
  brush: VT.indigo, inkstone: VT.ink, crane: VT.moon, gobowl: VT.ink, moonwheel: VT.moon, moonmirror: VT.moon,
};
/**
 * The impacts' size by view (EngineSettings.view): √(VIEW_SPAN / near's), at most 1.3 — 1 at 'near'
 * (the close view the impacts were tuned at), 1.26 at 'mid', 1.3 at 'far'. The halo, the core, the
 * streaks' and sparks' reach and a kill's ring all follow the impact's radius. Cosmetic only: the
 * simulation never reads it.
 */
export function impactViewK(view: unknown): number {
  return Math.min(1.3, Math.sqrt(VIEW_SPAN[viewOf(view)] / VIEW_SPAN.near));
}

/** What flies off a blow, per weapon (impact()): steel sparks, a glaive's ink chips and gold sparks,
 *  claw and brush ink, wine drops, arrow and moon glints, gilt glints, jade chips, peach and fire embers,
 *  thunder arcs, go stones, notes. */
export const WPN_FLAVOR: Readonly<Record<WeaponId, number>> = {
  qingfeng: FL.blade, longquan: FL.blade, yanyue: FL.heavy, hoe: FL.heavy, pestle: FL.jade, claw: FL.claw, drunkfist: FL.fist,
  dart: FL.blade, coindart: FL.coin, sunbow: FL.arrow, repeater: FL.arrow, rod: FL.arrow,
  qingping: FL.jade, casket: FL.jade, peach: FL.peach, seven: FL.jade,
  thunder: FL.thunder, fire: FL.fire, gourd: FL.wine, qin: FL.music, flute: FL.music,
  brush: FL.ink, inkstone: FL.ink, crane: FL.moon, gobowl: FL.go, moonwheel: FL.moon, moonmirror: FL.moon,
};
/** A feel class's flavour (a blow with no weapon slot: summons, skills, items). */
export function flavorOfClass(fc: number): number {
  switch (fc) {
    case 1: return FL.heavy; case 2: return FL.claw; case 3: return FL.fist; case 4: return FL.arrow; case 5: return FL.blade;
    case 6: return FL.fire; case 7: return FL.wine; case 8: return FL.ink; case 9: return FL.jade; case 10: return FL.go;
    case 11: return FL.music; case 12: return FL.moon; case 13: return FL.skill; case 14: return FL.plain;
    default: return FL.blade;
  }
}
/** A weapon slot's flavour (by its id; a missing id falls back to its feel class). */
export function flavorOfWeapon(id: string | undefined, fc: number): number {
  const f = id ? (WPN_FLAVOR as Record<string, number>)[id] : undefined;
  return f ?? flavorOfClass(fc);
}
/** A weapon slot's light (by its id; a missing id falls back to its feel class). */
export function tintOfWeapon(id: string | undefined, fc: number): number {
  const t = id ? (WPN_TINT as Record<string, number>)[id] : undefined;
  return t ?? slashTint(fc);
}
