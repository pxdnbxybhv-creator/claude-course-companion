// 水月幻镜 · the arena's ambience: what lies on and just above the paper, drawn right after the arena
// and under everything else (render.ts calls drawAmbience once, in its 'arena' layer). Four passes:
//
//   grain      a world-anchored paper-grain tile at screen resolution (the arena base is soft washes
//              painted at ≈ 1 px per u; the grain gives the paper a crisp tooth at any zoom)
//   vignette   a warm paper-edge darkening, baked small per screen shape and stretched
//   shadows    a soft contact shadow under every body (enemies, summons, you), so figures stand on
//              the ground instead of floating on it; airborne bodies leave theirs on the ground
//   motes      per map: 月湖 lotus petals, moon motes and ripples; 墨林 fireflies and falling bamboo
//              leaves; 广寒 moon motes and osmanthus florets
//
// Budgets (GDD §24.3): sprites are baked once (gradients only at bake time); the frame does
// setTransform + drawImage and a few ellipse strokes; motes live in typed arrays made once and move
// analytically from the world clock (nothing is allocated per frame). Low quality keeps only the
// shadows of you, your summons and elites. Under load the engine's frame guard sheds the two
// full-screen passes (grain, vignette: `shed`) before it lowers the resolution, and its degrade step
// drops the motes too. Grain is blitted 1:1 at whole pixels and the vignette only as its four edge
// bands, so neither filters a pixel. Reduced
// motion: motes at half speed and half count, no twinkle. Never vermilion: danger is the enemy's.
import type { MapId } from '../ids';
import { SUMMON_REG } from '../ids';
import type { Camera, Painter, Quality } from '../types';
import { canvas, ctx2d, invertLightness } from './atlas';

/** The world fields the ambience reads (engine/world.ts World satisfies it). */
export interface AmbWorld {
  t: number;
  /** The effects clock and its lead over t (engine/index.ts World.tFx / dFx; missing or stale: t). */
  tFx?: number;
  dFx?: number;
  px: number; py: number;
  leapT: number; leapDur: number;
  lightR: number | null;
  degrade: number;
  quality: Quality;
  settings: { reduceMotion: boolean };
  painter: Painter | null;
  E: { n: number; alive: Uint8Array; hidden: Uint8Array; decoy: Uint8Array; kind: Uint8Array; st: Uint8Array; air: Uint8Array; x: Float32Array; y: Float32Array; r: Float32Array };
  S: { n: number; alive: Uint8Array; kind: Uint8Array; dragon: Uint8Array; x: Float32Array; y: Float32Array; r: Float32Array };
}

/** The effects clock when the engine set it for this draw (tFx − t = dFx, within half a step), else t
 *  (a world drawn by hand): motes and ripples move on every frame at 120–360 Hz (m7). */
function fxT(W: AmbWorld): number {
  const f = W.tFx, d0 = W.dFx;
  if (f === undefined || d0 === undefined || d0 === 0) return W.t;
  const d = f - W.t;
  return d === d0 && Math.abs(d) <= 1 / 120 + 1e-9 ? f : W.t;
}

/** Enemy kinds and states (engine/pools.ts EKind, engine/enemies.ts ST; a test keeps them in step). */
export const AMB_EKIND = { Mon: 0, Elite: 1, Boss: 2, Treasure: 3, Ally: 4, Demon: 5 } as const;
export const AMB_ST = { bloom: 0, under: 5, air: 6 } as const;

/** Budgets by quality. */
const MOTES: Record<Quality, number> = { low: 0, mid: 24, high: 56 };
const RIPPLES: Record<Quality, number> = { low: 0, mid: 3, high: 6 };
const SHADOWS: Record<Quality, number> = { low: 24, mid: 160, high: 400 };
const GRAIN_A: Record<Quality, number> = { low: 0, mid: 0.55, high: 0.75 };
/** The vignette is a second full-screen pass: high only (mid keeps the grain, which a soft arena needs more). */
const VIGNETTE_A: Record<Quality, number> = { low: 0, mid: 0, high: 1 };
/** Shadow alpha (enemies; you and your summons a little stronger). */
const SHADOW_A = 0.3;

const TILE = 256;
/** The vignette's band: it is clear inside the central (1 − 2·band)² rect of the screen. */
const VIG_BAND = 0.2;
const SHW = 64, SHH = 32;
/** Motes are drawn at up to 1.25× (their size jitter): baked that much finer, so none is enlarged. */
const MOTE_SS = 1.25;

/** Mote kinds. */
const enum MK { Petal, Moon, Firefly, Leaf, Osman }
/** What each map scatters (kinds cycle through this list). */
const MAP_MOTES: Record<MapId, readonly MK[]> = {
  lake: [MK.Petal, MK.Moon, MK.Petal, MK.Moon, MK.Petal],
  forest: [MK.Firefly, MK.Firefly, MK.Leaf, MK.Firefly, MK.Firefly],
  palace: [MK.Moon, MK.Osman, MK.Moon, MK.Osman, MK.Moon],
};

const FLYERS = new Set<number>(['zhihe', 'mohe', 'molong'].map((id) => SUMMON_REG.findIndex((s) => s.id === id)).filter((i) => i >= 0));

/** A deterministic 0..1 hash. */
function h01(a: number, b: number): number {
  let x = (Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
const fmod = (a: number, m: number) => a - Math.floor(a / m) * m;

export class Ambience {
  /** Passes switched off (the perf probe and the lab measure each one). */
  static off = { grain: false, vignette: false, shadows: false, motes: false };
  /** EMA of the pass's JS time (ms), for the perf probe. */
  ms = 0;
  /** The full-screen passes (grain, vignette) shed by the engine's frame guard under load: the first
   *  thing it gives up, before any resolution or effect. */
  shed = false;
  private shadow: HTMLCanvasElement | null = null;
  private grain: HTMLCanvasElement | null = null;
  private vig: HTMLCanvasElement | null = null;
  private vigKey = '';
  /** Mote sprites by kind, and their size in u. */
  private spr: (HTMLCanvasElement | null)[] = [];
  private sprU: number[] = [];
  private inverted = false;
  private baked = false;
  // motes: typed arrays made once
  private readonly n: number;
  private readonly mk: Uint8Array;
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly ph: Float32Array;
  private readonly sz: Float32Array;
  // ripples: world-anchored per cycle
  private readonly rn: number;
  private readonly rx: Float32Array;
  private readonly ry: Float32Array;
  private readonly rc: Float64Array;

  constructor(readonly map: MapId, readonly quality: Quality, readonly dpr: number, readonly k: number) {
    this.n = MOTES[quality];
    this.mk = new Uint8Array(this.n);
    this.sx = new Float32Array(this.n); this.sy = new Float32Array(this.n);
    this.vx = new Float32Array(this.n); this.vy = new Float32Array(this.n);
    this.ph = new Float32Array(this.n); this.sz = new Float32Array(this.n);
    const kinds = MAP_MOTES[map] ?? MAP_MOTES.lake;
    for (let i = 0; i < this.n; i++) {
      const kind = kinds[i % kinds.length];
      this.mk[i] = kind;
      this.sx[i] = h01(i, 1); this.sy[i] = h01(i, 2);
      this.ph[i] = h01(i, 3) * Math.PI * 2;
      const r = h01(i, 4);
      this.sz[i] = 0.75 + r * 0.5;
      // drift in u per s (the paper's wind blows from the upper left)
      if (kind === MK.Petal) { this.vx[i] = 7 + r * 8; this.vy[i] = 3 + h01(i, 5) * 5; }
      else if (kind === MK.Moon) { this.vx[i] = (h01(i, 5) - 0.5) * 6; this.vy[i] = -5 - r * 6; }
      else if (kind === MK.Firefly) { this.vx[i] = (h01(i, 5) - 0.5) * 8; this.vy[i] = (h01(i, 6) - 0.5) * 8; }
      else if (kind === MK.Leaf) { this.vx[i] = 8 + r * 8; this.vy[i] = 16 + h01(i, 5) * 12; }
      else { this.vx[i] = 9 + r * 7; this.vy[i] = 11 + h01(i, 5) * 8; }
    }
    this.rn = map === 'lake' ? RIPPLES[quality] : 0;
    this.rx = new Float32Array(this.rn); this.ry = new Float32Array(this.rn); this.rc = new Float64Array(this.rn).fill(-1);
  }

  /** Bake the sprites (behind 研墨, with the arena); `inverted` = 倒影. */
  bake(inverted: boolean): void {
    if (typeof document === 'undefined') return;
    if (this.baked && this.inverted === inverted) return;
    this.inverted = inverted;
    try {
      this.shadow = bakeShadow();
      this.grain = GRAIN_A[this.quality] > 0 ? bakeGrain(this.dpr, inverted, this.map) : null;
      this.spr = []; this.sprU = [];
      if (this.n > 0) for (const kind of [MK.Petal, MK.Moon, MK.Firefly, MK.Leaf, MK.Osman]) {
        const { c, u } = bakeMote(kind, this.k * MOTE_SS, this.map);
        if (c && inverted && kind !== MK.Moon && kind !== MK.Firefly) invertLightness(c);
        this.spr[kind] = c; this.sprU[kind] = u;
      }
      this.vigKey = '';
      this.baked = true;
    } catch (e) {
      console.warn('[mirror ambience]', e);
    }
  }

  /** Bytes held by the baked sprites. */
  bytes(): number {
    let n = 0;
    for (const c of [this.shadow, this.grain, this.vig, ...this.spr]) if (c) n += c.width * c.height * 4;
    return n;
  }

  draw(W: AmbWorld, ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (!this.baked) return;
    const q = W.quality ?? this.quality;
    const calm = !!W.settings.reduceMotion;
    const dark = W.lightR !== null;
    ctx.globalAlpha = 1;
    // grain and vignette belong to the paper: not under the darkness (it hides them), not when slow
    const off = Ambience.off;
    if (!dark && !W.degrade && !this.shed) {
      if (!off.grain) this.drawGrain(ctx, cam, GRAIN_A[q]);
      if (!off.vignette) this.drawVignette(ctx, cam, VIGNETTE_A[q]);
    }
    if (!off.shadows) this.drawShadows(W, ctx, cam, q);
    if (!W.degrade && !dark && !off.motes) {
      this.drawRipples(W, ctx, cam, calm);
      this.drawMotes(W, ctx, cam, calm);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  private drawGrain(ctx: CanvasRenderingContext2D, cam: Camera, a: number): void {
    const img = this.grain;
    if (a <= 0 || !img) return;
    // anchored to the world: the tile's origin follows world (0, 0) on screen. The tiles are blitted
    // 1:1 at whole pixels: a plain copy-blend per pixel, no filtering (a fractional pattern fill costs
    // ≈ 4× as much under CPU raster), so this full-screen pass stays cheap on any phone
    const ox = Math.round(fmod(-cam.x * cam.scale + cam.w / 2, TILE)) - TILE, oy = Math.round(fmod(-cam.y * cam.scale + cam.h / 2, TILE)) - TILE;
    ctx.globalAlpha = a;
    // one fill with the tile as a repeating pattern, its origin moved by the same whole pixels: the same
    // 1:1 copy per pixel as the tiles (no filtering), one call instead of one per tile (66–77)
    const pat = this.pattern(ctx, img);
    if (pat) {
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      ctx.fillStyle = pat;
      ctx.fillRect(-ox, -oy, cam.w, cam.h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let y = oy; y < cam.h; y += TILE) for (let x = ox; x < cam.w; x += TILE) ctx.drawImage(img, x, y);
    }
    ctx.globalAlpha = 1;
  }
  /** The grain as a repeating pattern, made once per target context and tile (null: tiles instead). */
  private pat: CanvasPattern | null = null;
  private patOf: { ctx: CanvasRenderingContext2D | null; img: HTMLCanvasElement | null } = { ctx: null, img: null };
  private pattern(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement): CanvasPattern | null {
    if (this.patOf.ctx !== ctx || this.patOf.img !== img) {
      this.patOf.ctx = ctx; this.patOf.img = img;
      try { this.pat = typeof ctx.createPattern === 'function' ? ctx.createPattern(img, 'repeat') : null; } catch { this.pat = null; }
    }
    return this.pat;
  }

  private drawVignette(ctx: CanvasRenderingContext2D, cam: Camera, a: number): void {
    if (a <= 0) return;
    const key = `${Math.round(cam.w)}x${Math.round(cam.h)}`;
    if (this.vigKey !== key) { this.vig = bakeVignette(cam.w, cam.h, this.inverted); this.vigKey = key; }
    const v = this.vig;
    if (!v) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a;
    // the vignette is clear inside its central rect: draw only the four bands around it (≈ 60% of the
    // screen instead of all of it)
    const f = VIG_BAND, sw = v.width, sh = v.height, W = cam.w, H = cam.h;
    const bw = Math.round(W * f), bh = Math.round(H * f), sbw = sw * f, sbh = sh * f;
    ctx.drawImage(v, 0, 0, sw, sbh, 0, 0, W, bh);
    ctx.drawImage(v, 0, sh - sbh, sw, sbh, 0, H - bh, W, bh);
    ctx.drawImage(v, 0, sbh, sbw, sh - 2 * sbh, 0, bh, bw, H - 2 * bh);
    ctx.drawImage(v, sw - sbw, sbh, sbw, sh - 2 * sbh, W - bw, bh, bw, H - 2 * bh);
    ctx.globalAlpha = 1;
  }

  private drawShadows(W: AmbWorld, ctx: CanvasRenderingContext2D, cam: Camera, q: Quality): void {
    if (!this.shadow || this.inverted) return;
    this.left = SHADOWS[q] >> (W.degrade ? 1 : 0);
    // you: the light is from the upper left, so the shadow leans a little down-right
    const lift = W.leapT > 0 && W.leapDur > 0 ? Math.sin((1 - W.leapT / W.leapDur) * Math.PI) : 0;
    const kl = 1 - 0.35 * lift;
    // every shadow is an upright ellipse: a destination rect under one identity transform, the alpha
    // set only when it changes
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.al = -1;
    this.shadowAt(ctx, cam, W.px + 3, W.py + 17, 17 * kl, 6 * kl, (SHADOW_A + 0.08) * (1 - 0.45 * lift));
    const S = W.S;
    for (let i = 0; i < S.n && this.left > 0; i++) {
      if (!S.alive[i]) continue;
      const r = S.r[i] * (S.dragon[i] ? 1.4 : 1);
      if (FLYERS.has(S.kind[i]) || S.dragon[i]) this.shadowAt(ctx, cam, S.x[i] + 4, S.y[i] + r + 10, r * 0.8, r * 0.28, SHADOW_A * 0.55);
      else this.shadowAt(ctx, cam, S.x[i] + 2, S.y[i] + r * 0.72, r * 1.05, r * 0.38, SHADOW_A);
    }
    const E = W.E;
    const all = q !== 'low';
    for (let i = 0; i < E.n && this.left > 0; i++) {
      if (!E.alive[i] || E.hidden[i] || E.decoy[i]) continue;
      const kind = E.kind[i], st = E.st[i];
      // a true boss casts its own shadow (fx:bossShadow: decoys cast none, which is a tell) — never add one
      if (kind === AMB_EKIND.Boss || st === AMB_ST.bloom || st === AMB_ST.under) continue;
      if (!all && kind === AMB_EKIND.Mon) continue;
      const r = E.r[i];
      if (E.air[i] || st === AMB_ST.air) this.shadowAt(ctx, cam, E.x[i] + 3, E.y[i] + r * 0.72 + 6, r * 0.75, r * 0.26, SHADOW_A * 0.6);
      else this.shadowAt(ctx, cam, E.x[i] + 2, E.y[i] + r * 0.72, r * 1.05, r * 0.36, SHADOW_A);
    }
    ctx.globalAlpha = 1;
  }
  /** Shadows left this frame. */
  private left = 0;
  /** One soft ellipse of half-size rw × rh (u) at world (x, y), culled off screen. */
  private shadowAt(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, rw: number, rh: number, a: number): void {
    const s = cam.scale;
    const px = (x - cam.x) * s + cam.w / 2, py = (y - cam.y) * s + cam.h / 2;
    const ex = rw * s, ey = rh * s;
    if (px < -ex || py < -ey || px > cam.w + ex || py > cam.h + ey) return;
    if (a !== this.al) ctx.globalAlpha = this.al = a;
    ctx.drawImage(this.shadow!, px - ex, py - ey, 2 * ex, 2 * ey);
    this.left--;
  }
  /** The alpha last set by shadowAt this frame (−1: unknown). */
  private al = -1;

  /** The view's world rect grown by a margin, on a span that changes rarely (so motes never jump). */
  private span(cam: Camera): { x0: number; y0: number; w: number; h: number } {
    const M = 40;
    const w = Math.ceil((cam.w / cam.scale + M * 2) / 128) * 128, h = Math.ceil((cam.h / cam.scale + M * 2) / 128) * 128;
    this.sp.x0 = cam.x - w / 2; this.sp.y0 = cam.y - h / 2; this.sp.w = w; this.sp.h = h;
    return this.sp;
  }
  private readonly sp = { x0: 0, y0: 0, w: 1, h: 1 };

  private drawMotes(W: AmbWorld, ctx: CanvasRenderingContext2D, cam: Camera, calm: boolean): void {
    const n = calm ? this.n >> 1 : this.n;
    if (!n) return;
    const { x0, y0, w, h } = this.span(cam);
    const t = fxT(W) * (calm ? 0.5 : 1);
    const s = cam.scale, hw = cam.w / 2, hh = cam.h / 2;
    for (let i = 0; i < n; i++) {
      const kind = this.mk[i];
      const img = this.spr[kind];
      if (!img) continue;
      const ph = this.ph[i];
      // world position: a fixed field drifting with the wind, wrapped around the view
      let bx = this.sx[i] * 2048 + this.vx[i] * t, by = this.sy[i] * 2048 + this.vy[i] * t;
      let ang = 0, kx = this.sz[i], ky = this.sz[i], a = 0.75;
      if (kind === MK.Petal) {
        bx += Math.sin(t * 0.6 + ph) * 8; by += Math.cos(t * 0.45 + ph) * 4;
        ang = ph + t * 0.35;
        a = 0.8;
      } else if (kind === MK.Moon) {
        bx += Math.sin(t * 0.8 + ph) * 6;
        a = calm ? 0.55 : 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.1 + ph));
      } else if (kind === MK.Firefly) {
        bx += Math.sin(t * 0.55 + ph) * 34 + Math.sin(t * 1.7 + ph * 2) * 9;
        by += Math.cos(t * 0.5 + ph * 1.3) * 26 + Math.sin(t * 1.3 + ph) * 8;
        const p = Math.sin(t * 1.25 + ph);
        a = calm ? 0.7 : 0.2 + 0.8 * p * p;
      } else if (kind === MK.Leaf) {
        bx += Math.sin(t * 1.05 + ph) * 16;
        ang = ph + Math.sin(t * 1.6 + ph) * 0.9 + t * 0.2;
        ky *= calm ? 0.8 : 0.35 + 0.65 * Math.abs(Math.cos(t * 2.1 + ph));
        a = 0.6;
      } else {
        // a floret tumbles as it falls: it turns and flickers edge-on
        bx += Math.sin(t * 0.9 + ph) * 7;
        ang = ph + t * 1.1;
        ky *= calm ? 0.85 : 0.45 + 0.55 * Math.abs(Math.cos(t * 2.3 + ph));
        a = 0.85;
      }
      const x = x0 + fmod(bx - x0, w), y = y0 + fmod(by - y0, h);
      const px = (x - cam.x) * s + hw, py = (y - cam.y) * s + hh;
      const u = this.sprU[kind] * this.sz[i];
      if (px < -u * s || py < -u * s || px > cam.w + u * s || py > cam.h + u * s) continue;
      // the sprite is baked at k · MOTE_SS px per u: draw it at cam.scale / that
      const f = s / (this.k * MOTE_SS);
      const c = Math.cos(ang) * f, sn = Math.sin(ang) * f;
      ctx.setTransform(c * kx, sn * kx, -sn * ky, c * ky, px, py);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.globalAlpha = 1;
  }

  /** 月湖: a few rings spreading on the water, each at a new spot every cycle. */
  private drawRipples(W: AmbWorld, ctx: CanvasRenderingContext2D, cam: Camera, calm: boolean): void {
    const n = calm ? this.rn >> 1 : this.rn;
    if (!n) return;
    const P = 3.4;
    const t = fxT(W) * (calm ? 0.5 : 1);
    const s = cam.scale, hw = cam.w / 2, hh = cam.h / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = Math.max(1, 1.1 * cam.dpr);
    for (let i = 0; i < n; i++) {
      const tt = t + (i / n) * P;
      const cyc = Math.floor(tt / P), u = tt / P - cyc;
      if (this.rc[i] !== cyc) {
        // a new spot, anchored in the world where the view is now
        this.rc[i] = cyc;
        const sp = this.span(cam);
        this.rx[i] = sp.x0 + h01(i * 131 + 7, cyc) * sp.w; this.ry[i] = sp.y0 + h01(i * 131 + 9, cyc) * sp.h;
      }
      const px = (this.rx[i] - cam.x) * s + hw, py = (this.ry[i] - cam.y) * s + hh;
      const R = (6 + 34 * (1 - (1 - u) * (1 - u))) * s;
      if (px < -R || py < -R || px > cam.w + R || py > cam.h + R) continue;
      const a = 0.42 * (1 - u) * Math.min(1, u * 6);
      ctx.globalAlpha = a;
      ctx.strokeStyle = this.inverted ? '#c9d3dc' : '#5f7f99';
      ctx.beginPath(); ctx.ellipse(px, py, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(px, py - 1.2 * cam.dpr, R * 0.72, R * 0.3, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** Draw the painter's ambience for this frame (the single call site is render.ts's 'arena' layer). */
export function drawAmbience(W: AmbWorld, ctx: CanvasRenderingContext2D, cam: Camera): void {
  const A = (W.painter as (Painter & { ambience?: Ambience }) | null)?.ambience;
  if (!A) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try { A.draw(W, ctx, cam); } catch (e) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; void e; }
  if (t0) A.ms = A.ms * 0.95 + (performance.now() - t0) * 0.05;
}

// ───────────────────────────────────────────── baked sprites (gradients here only, once)

function bakeShadow(): HTMLCanvasElement {
  const c = canvas(SHW, SHH), g = ctx2d(c);
  g.translate(SHW / 2, SHH / 2);
  g.scale(1, SHH / SHW);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, SHW / 2);
  gr.addColorStop(0, 'rgba(22,20,18,0.85)');
  gr.addColorStop(0.45, 'rgba(22,20,18,0.55)');
  gr.addColorStop(0.8, 'rgba(22,20,18,0.14)');
  gr.addColorStop(1, 'rgba(22,20,18,0)');
  g.fillStyle = gr;
  g.fillRect(-SHW / 2, -SHW / 2, SHW, SHW);
  return c;
}

/** The paper's tooth: specks, a few pale fibres and flecks, at screen resolution (256² px). */
function bakeGrain(dpr: number, inverted: boolean, map: MapId): HTMLCanvasElement {
  const c = canvas(TILE, TILE), g = ctx2d(c);
  let s = 0x2545f491;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const px = Math.max(0.6, Math.min(1.4, dpr * 0.5));
  const ink = map === 'forest' ? '40,44,30' : map === 'palace' ? '34,40,58' : '30,36,48';
  // dark specks (the tooth)
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(${ink},${(0.05 + rnd() * 0.12).toFixed(3)})`;
    const r = px * (0.5 + rnd() * 0.9);
    g.fillRect(rnd() * TILE, rnd() * TILE, r, r);
  }
  // pale flecks (the paper's shine)
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(255,253,246,${(0.12 + rnd() * 0.25).toFixed(3)})`;
    const r = px * (0.6 + rnd() * 1.1);
    g.fillRect(rnd() * TILE, rnd() * TILE, r, r);
  }
  // fibres: short curved hairs, wrapping at the tile's edges so the tile repeats seamlessly
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = rnd() * TILE, y = rnd() * TILE, a = rnd() * Math.PI * 2, L = (6 + rnd() * 16) * px;
    const bend = (rnd() - 0.5) * L * 0.8;
    g.strokeStyle = i % 3 ? `rgba(${ink},${(0.05 + rnd() * 0.06).toFixed(3)})` : `rgba(255,253,246,${(0.2 + rnd() * 0.2).toFixed(3)})`;
    g.lineWidth = px * (0.4 + rnd() * 0.5);
    for (const [dx, dy] of [[0, 0], [-TILE, 0], [0, -TILE], [-TILE, -TILE]]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + Math.cos(a) * L * 0.5 - Math.sin(a) * bend, y + dy + Math.sin(a) * L * 0.5 + Math.cos(a) * bend, x + dx + Math.cos(a) * L, y + dy + Math.sin(a) * L);
      g.stroke();
    }
  }
  if (inverted) invertLightness(c);
  return c;
}

/** A warm paper-edge vignette for a w × h screen, baked ≤ 160 px across (a soft gradient scales up
 *  cleanly). Elliptical, so a portrait phone gets as thin a band at its top and bottom as its sides. */
function bakeVignette(w: number, h: number, inverted: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const k = 160 / Math.max(w, h, 1);
  const cw = Math.max(10, Math.round(w * k)), ch = Math.max(10, Math.round(h * k));
  const c = canvas(cw, ch), g = ctx2d(c);
  g.translate(cw / 2, ch / 2);
  g.scale(1, ch / cw);
  // ρ = the elliptical radius over the corner's: clear up to the central rect's corners (ρ = 1 − 2·band),
  // then a warm darkening toward the paper's edge
  const r = (cw / 2) * Math.SQRT2, r0 = 1 - 2 * VIG_BAND;
  const gr = g.createRadialGradient(0, 0, r * r0, 0, 0, r);
  const col = inverted ? '0,0,0' : '58,40,22';
  gr.addColorStop(0, `rgba(${col},0)`);
  gr.addColorStop(0.35, `rgba(${col},0.08)`);
  gr.addColorStop(1, `rgba(${col},${inverted ? 0.38 : 0.26})`);
  g.fillStyle = gr;
  g.fillRect(-cw, -cw * 2, cw * 2, cw * 4);
  return c;
}

/** One mote sprite at k px per u; returns it and its half-size in u (for culling). */
function bakeMote(kind: MK, k: number, map: MapId): { c: HTMLCanvasElement | null; u: number } {
  const U = kind === MK.Leaf ? 13 : kind === MK.Firefly ? 14 : kind === MK.Petal ? 8 : kind === MK.Osman ? 5 : 6;
  const px = Math.max(8, Math.ceil(U * 2 * k));
  const c = canvas(px, px), g = ctx2d(c);
  g.translate(px / 2, px / 2);
  g.scale(k, k);
  if (kind === MK.Petal) {
    // a lotus petal afloat: pink wash, a paler heart, a darker vein, a thin white rim of wet light
    const gr = g.createLinearGradient(-6, 0, 6, 0);
    gr.addColorStop(0, '#e7a3b3'); gr.addColorStop(0.6, '#f3d6dc'); gr.addColorStop(1, '#fbeef0');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-6.5, 0); g.bezierCurveTo(-3, -4.2, 3.5, -3.6, 6.5, 0); g.bezierCurveTo(3.5, 3.6, -3, 4.2, -6.5, 0); g.fill();
    g.strokeStyle = 'rgba(184,90,110,0.55)'; g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(-5.5, 0); g.quadraticCurveTo(0, -0.6, 5.5, 0); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(-5.8, -0.4); g.bezierCurveTo(-2.8, -3.8, 3.2, -3.2, 6, -0.3); g.stroke();
  } else if (kind === MK.Moon) {
    // a mote of moonlight: a white core in a cool halo
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, U);
    const tint = map === 'palace' ? '201,211,236' : '214,226,238';
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.4, `rgba(${tint},0.45)`); gr.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, U, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(111,142,166,0.35)'; g.lineWidth = 0.35; g.beginPath(); g.arc(0, 0, U * 0.2, 0, Math.PI * 2); g.stroke();
  } else if (kind === MK.Firefly) {
    // 萤: a jade-gold glow with a white-hot core and a soft outer halo, crisp enough to read on pale
    // paper (a faint ink ring gives the glow an edge against the light ground)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, U);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.1, 'rgba(250,255,190,1)');
    gr.addColorStop(0.22, 'rgba(206,232,110,0.85)'); gr.addColorStop(0.45, 'rgba(150,200,90,0.3)'); gr.addColorStop(1, 'rgba(120,176,92,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, U, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(58,84,40,0.35)'; g.lineWidth = 0.4; g.beginPath(); g.arc(0, 0, U * 0.24, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(40,52,30,0.8)'; g.beginPath(); g.ellipse(-2.4, 0.4, 1.4, 0.85, 0.3, 0, Math.PI * 2); g.fill();
  } else if (kind === MK.Leaf) {
    // a falling bamboo leaf: a long blade, dark at the stem, a pale midrib
    const gr = g.createLinearGradient(-12, 0, 12, 0);
    gr.addColorStop(0, '#2f4a36'); gr.addColorStop(0.5, '#4f7a5c'); gr.addColorStop(1, '#8fb89a');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(-4, -3.2, 4, -2.2); g.quadraticCurveTo(9, -1.2, 12, 0); g.quadraticCurveTo(8, 1.4, 3, 2.1); g.quadraticCurveTo(-4, 2.6, -12, 0); g.fill();
    g.strokeStyle = 'rgba(214,230,200,0.6)'; g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(-11, 0); g.lineTo(10.5, -0.1); g.stroke();
  } else {
    // 桂花: four pale cream-gold petals cut apart, open between them — a falling blossom, never a
    // round gold thing (round and golden is money's look: a coin must not have a double)
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate((i * Math.PI) / 2 + 0.3);
      g.fillStyle = i % 2 ? '#f6e3a4' : '#efd07a';
      g.beginPath(); g.moveTo(0, -0.5); g.bezierCurveTo(-1.5, -1.4, -1.3, -3.6, 0, -3.9); g.bezierCurveTo(1.3, -3.6, 1.5, -1.4, 0, -0.5); g.fill();
      g.strokeStyle = 'rgba(176,122,40,0.55)'; g.lineWidth = 0.28; g.stroke();
      g.restore();
    }
    g.fillStyle = '#d9822e'; g.beginPath(); g.arc(0, 0, 0.55, 0, Math.PI * 2); g.fill();
  }
  return { c, u: U };
}
