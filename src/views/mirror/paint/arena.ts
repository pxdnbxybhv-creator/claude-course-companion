// The arena: paper, the map's ground, décor, the obstacles and the bronze mirror rim, painted once
// offscreen (GDD §12, §21). Death stains are stamped into a second, lower-resolution layer so the
// painting keeps building; each wave end washes that layer 8% paler. 倒影 (endless) inverts the
// lightness of everything while keeping its hues: white ink on black paper.
//
// Memory: the base layer is sized to a pixel budget by quality (BUDGET), whatever the arena's size in
// u; the stain layer is 0.6–0.75× its resolution. The obstacles (they block movement and shots, so
// they must read crisply) are painted as their own sprites near sprite resolution at every quality,
// and drawn over the base when in view.
//
// 倒影 inverts only the arena and its rim; beyond the rim the surround stays dark (a void), and the
// camera's fill past the layer matches it, so there is no seam. Turning an already painted arena
// into 倒影 (the endless stage) inverts what is there instead of repainting it.
import { paintStroke } from '../../../ink/brush';
import { fillPaper } from '../../../ink/paper';
import type { Stroke } from '../../../ink/types';
import type { MapId } from '../ids';
import type { ArenaGeom, Camera, Quality, StampKind } from '../types';
import { canvas, ctx2d, invertLightness, renderSpec } from './atlas';
import { B, blob, ell, arcW, h01, rot, rotW, star, type Pt, type Spec } from './kit';
import { CINNABAR, GOLD, INK, MAP_PAL, MOON, rgba, type MapPalette } from './palette';

/** The base layer's pixel budget by quality (≈ 8 / 14 / 18 MB). The washes it holds are soft, so a
 *  base drawn 1.2–2.5× enlarged still reads; what must be crisp (obstacles, the paper's grain) is not
 *  in it: obstacles are sprites, and the grain is laid over at screen resolution (paint/ambient.ts). */
const BUDGET: Record<Quality, number> = { low: 2.0e6, mid: 3.6e6, high: 4.5e6 };
/** The stain layer's resolution relative to the base. */
const STAIN_K: Record<Quality, number> = { low: 0.5, mid: 0.6, high: 0.6 };
const MARGIN = 150;
/** The soft pass's resolution relative to the base, by quality (see paint: low paints one pass). */
const SOFT_K: Record<Quality, number> = { low: 1, mid: 0.6, high: 0.7 };
/** A brush this wide (u) or wider is a broad soft band (the lake's deep rim, the bronze band under
 *  its crisp dark edges): painted with the washes. */
const SOFT_W = 20;
/** The index just past the washes that open ops[from…] (an obstacle's shadow comes first). */
function leadingWashes(ops: B['ops'], from: number): number {
  let i = from;
  while (i < ops.length) { const op = ops[i]; if (op.k !== 'stroke' || op.s.kind !== 'wash') break; i++; }
  return i;
}
/** Whether an arena mark is soft: washes and broad bands (their edges are blurred anyway). */
export function isSoft(op: B['ops'][number]): boolean {
  if (op.k !== 'stroke') return false;
  const st = op.s;
  if (st.kind === 'wash') return true;
  if (st.kind !== 'brush') return false;
  let w = 0;
  for (const p of st.pts) w = Math.max(w, p.w);
  return w >= SOFT_W;
}
/** The bronze rim's width (u), outside the arena's shape. */
const RIM_W = 34;
/** Obstacle sprites: px per u at most, by quality (they are drawn at the camera's scale; memory: the
 *  forest's 14 clumps are ≈ 0.42 M u² of sprite, 7 MB at 2.2 px per u). */
const OBST_K: Record<Quality, number> = { low: 1.6, mid: 2.2, high: 2.6 };
/** 倒影's surround: the map's outside darkened toward the void. */
const VOID = '#08090c';
const VOID_A = 0.55;

interface ObstSprite { img: HTMLCanvasElement; x0: number; y0: number; w: number; h: number }

export class ArenaLayer {
  inverted = false;
  /** The base and the stain layer, each cut into tiles: a frame only touches the tiles in view, so the
   *  textures a frame needs stay a few MB however large the arena is painted. */
  private base: Tiles | null = null;
  private stains: Tiles | null = null;
  /** px per u of the base layer; the stain layer is half. */
  private k = 1;
  private x0 = 0;
  private y0 = 0;
  private geom: ArenaGeom | null = null;
  private stampImgs = new Map<StampKind, HTMLCanvasElement[]>();
  private stampK = 1;
  private seed = 0;
  private obst: ObstSprite[] = [];
  private pal: MapPalette;
  /** ms the last paint took (lab). */
  lastMs = 0;

  /** `sk`: the sprite scale (px per u the painter bakes figures at: the camera's scale). */
  constructor(readonly map: MapId, readonly quality: Quality, readonly dpr: number, readonly sk = dpr) {
    this.pal = MAP_PAL[map];
  }

  /** Bytes held by the layers (base, stains, obstacle sprites). */
  bytes(): number {
    let n = 0;
    for (const c of this.obst) n += c.img.width * c.img.height * 4;
    return n + (this.base?.bytes() ?? 0) + (this.stains?.bytes() ?? 0);
  }
  /** The stain layer's px per u. */
  private get kS(): number { return this.k * STAIN_K[this.quality]; }

  paint(geom: ArenaGeom, seed: number, inverted: boolean): void {
    const t0 = performance.now();
    if (inverted && !this.inverted && this.base && this.geom === geom && this.seed === seed) {
      // the endless stage: invert what is painted (base, stains, obstacles) — no repaint
      this.inverted = true;
      this.base.each((c, tx, ty) => invertLayer(c, geom, this.k, this.x0 + (tx - TB) / this.k, this.y0 + (ty - TB) / this.k, this.pal));
      this.stains?.each((c) => invertLightness(c));
      for (const o of this.obst) invertLightness(o.img);
      this.bakeStamps(true);
      this.lastMs = performance.now() - t0;
      return;
    }
    this.geom = geom;
    this.seed = seed;
    this.inverted = inverted;
    const x0 = geom.minX - MARGIN, y0 = geom.minY - MARGIN, x1 = geom.maxX + MARGIN, y1 = geom.maxY + MARGIN;
    const W = x1 - x0, H = y1 - y0;
    this.k = Math.min(Math.max(1, this.sk), Math.sqrt(BUDGET[this.quality] / (W * H)));
    this.x0 = x0; this.y0 = y0;
    const k = this.k;
    const pw = Math.ceil(W * k), ph = Math.ceil(H * k);
    // painted whole, then cut into tiles (the whole canvas is freed)
    const big = canvas(pw, ph);
    const g = ctx2d(big);
    const P = this.pal;
    // Two passes. The soft pass (the paper, washes, broad bands: everything whose edge is blurred
    // anyway) is painted opaque at SOFT_K of the layer's resolution — a fraction of the pixels, and
    // they are most of the arena's paint time — then laid in smoothed; the crisp pass (lines, dots,
    // fills, the rim's edges and motifs) is painted over it at full resolution. The paper's crisp tooth
    // comes from the screen-resolution grain overlay (paint/ambient.ts) on mid and high; low paints
    // one pass at full resolution. (Washes must be painted onto the opaque paper, not a clear layer:
    // at their low alphas a clear layer's 8-bit premultiplied colour bleaches them.)
    const sk = SOFT_K[this.quality];
    const two = sk < 1;
    const soft = two ? canvas(Math.ceil(pw * sk) + 2, Math.ceil(ph * sk) + 2) : big;
    const kk = two ? k * sk : k;
    const sg = ctx2d(soft);
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = 'source-over';
    sg.fillStyle = P.outside;
    sg.fillRect(0, 0, soft.width, soft.height);
    const pass = (gg: CanvasRenderingContext2D, kp: number, ops: B['ops']) => {
      for (const op of ops) {
        gg.setTransform(kp, 0, 0, kp, -x0 * kp, -y0 * kp);
        if (op.k === 'stroke') paintStroke(gg, op.s); else { gg.save(); try { op.f(gg); } finally { gg.restore(); } }
      }
    };
    const clipTo = (gg: CanvasRenderingContext2D, kp: number, band: boolean) => {
      gg.save();
      gg.setTransform(kp, 0, 0, kp, -x0 * kp, -y0 * kp);
      if (band) { shapePath(gg, geom, RIM_W + 1); shapePath(gg, geom, -1, true); gg.clip('evenodd'); } else { shapePath(gg, geom, 0); gg.clip(); }
    };
    /** Paint a B: its soft marks on the soft pass now, its crisp marks later on the crisp pass (in the
     *  same clip). */
    const crispLater: { ops: B['ops']; clip: 0 | 1 | 2 }[] = [];
    const strokes = (b: B, clip: 0 | 1 | 2 = 0) => {
      const softOps = two ? b.ops.filter(isSoft) : b.ops;
      if (softOps.length) {
        if (clip) clipTo(sg, kk, clip === 2);
        pass(sg, kk, softOps);
        if (clip) sg.restore();
      }
      if (two) { const crisp = b.ops.filter((op) => !isSoft(op)); if (crisp.length) crispLater.push({ ops: crisp, clip }); }
    };

    // the void / surround
    const out = new B(seed ^ 0x51);
    surround(out, this.map, geom, P, seed);
    strokes(out);
    // paper inside the shape
    clipTo(sg, kk, false);
    sg.setTransform(kk, 0, 0, kk, 0, 0);
    fillPaper(sg, W, H, 11 + (seed % 7));
    sg.restore();
    const bg = new B(seed);
    ground(bg, this.map, geom, P, seed);
    strokes(bg, 1);
    this.obst = [];
    const ks = Math.min(OBST_K[this.quality], Math.max(1, this.sk));
    if (ks > k * 1.15) {
      // crisp obstacles: each its own sprite; the soft shadow wash under it (its leading washes) is
      // painted into the base with the ground's soft marks instead
      const shade = new B(seed ^ 0x7b);
      for (const o of geom.obstacles) {
        const from = shade.ops.length;
        obstacle(shade, o, P, seed);
        shade.ops.length = leadingWashes(shade.ops, from);
      }
      strokes(shade, 1);
      for (const o of geom.obstacles) {
        const R = o.r * 1.35 + 12;
        const spec: Spec = { box: [o.x - R, o.y - R, o.x + R, o.y + R], halo: 'none', paint: (b) => { const from = b.ops.length; obstacle(b, o, P, seed); b.ops.splice(from, leadingWashes(b.ops, from) - from); } };
        try {
          const p = renderSpec(spec, 0, { k: ks, seed: seed ^ 0x77, halo: 0, flash: false });
          if (inverted) invertLightness(p.img);
          // the spec's anchor (0, 0) is the world origin: the canvas's corner sits at −anchor × size
          this.obst.push({ img: p.img, x0: -p.ax * p.w, y0: -p.ay * p.h, w: p.w, h: p.h });
        } catch (e) { console.warn('[mirror paint] obstacle', e); }
      }
    }
    if (!this.obst.length) {
      const ob = new B(seed ^ 0x77);
      for (const o of geom.obstacles) obstacle(ob, o, P, seed);
      strokes(ob, 1);
    }
    const rim = new B(seed ^ 0x99), deco = new B(seed ^ 0x9b);
    rimOf(rim, deco, this.map, geom, P);
    // a polygon's rim: one stroke per edge, clipped to the band so the corners are mitred (the brush's
    // ends would otherwise stick out past each corner)
    strokes(rim, geom.shape.kind === 'circle' ? 0 : 2);
    strokes(deco);
    if (two) {
      // the soft pass laid in, then the crisp marks over it
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(soft, 0, 0, soft.width / sk, soft.height / sk);
      for (const c of crispLater) {
        if (c.clip) clipTo(g, k, c.clip === 2);
        pass(g, k, c.ops);
        if (c.clip) g.restore();
      }
      soft.width = soft.height = 1;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (inverted) invertLayer(big, geom, k, x0, y0, P);
    feather(g, pw, ph, k, inverted ? voidOf(P) : P.outside);
    this.base?.dispose();
    this.base = Tiles.from(big);
    big.width = big.height = 1;
    // the stain layer
    const sw = Math.ceil(W * this.kS), sh = Math.ceil(H * this.kS);
    this.stains?.dispose();
    this.stains = new Tiles(sw, sh);
    this.bakeStamps(inverted);
    this.lastMs = performance.now() - t0;
  }

  private bakeStamps(inverted: boolean) {
    this.stampImgs.clear();
    const k = Math.max(0.6, this.kS) * 1.5;
    this.stampK = k;
    const mk = (spec: Spec, n: number) => Array.from({ length: n }, (_, v) => {
      const p = renderSpec(spec, v, { k, seed: 101 + v * 31, halo: 0, flash: false });
      if (inverted) invertLightness(p.img);
      return p.img;
    });
    for (const [kind, spec] of Object.entries(STAMPS) as [StampKind, Spec][]) this.stampImgs.set(kind, mk(spec, spec.n ?? 1));
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.inverted ? voidOf(this.pal) : this.pal.outside;
    ctx.fillRect(0, 0, cam.w, cam.h);
    const base = this.base;
    if (!base) return;
    const s = cam.scale, k = this.k;
    // the camera's world rect
    const wx0 = cam.x - cam.w / 2 / s, wy0 = cam.y - cam.h / 2 / s;
    const wx1 = cam.x + cam.w / 2 / s, wy1 = cam.y + cam.h / 2 / s;
    const lx0 = Math.max(this.x0, wx0), ly0 = Math.max(this.y0, wy0);
    const lx1 = Math.min(this.x0 + base.w / k, wx1), ly1 = Math.min(this.y0 + base.h / k, wy1);
    if (lx1 <= lx0 || ly1 <= ly0) return;
    // world → screen: sx = (wx − wx0) · s; a layer's px p ↔ world x0 + p / k
    base.draw(ctx, (lx0 - this.x0) * k, (ly0 - this.y0) * k, (lx1 - this.x0) * k, (ly1 - this.y0) * k, s / k, (this.x0 - wx0) * s, (this.y0 - wy0) * s);
    const st = this.stains;
    const ks = this.kS;
    if (st) st.draw(ctx, (lx0 - this.x0) * ks, (ly0 - this.y0) * ks, (lx1 - this.x0) * ks, (ly1 - this.y0) * ks, s / ks, (this.x0 - wx0) * s, (this.y0 - wy0) * s);
    for (const o of this.obst) {
      if (o.x0 > wx1 || o.y0 > wy1 || o.x0 + o.w < wx0 || o.y0 + o.h < wy0) continue;
      ctx.drawImage(o.img, (o.x0 - wx0) * s, (o.y0 - wy0) * s, o.w * s, o.h * s);
    }
  }

  stamp(kind: StampKind, x: number, y: number, r: number, seed: number, _tint?: string): void {
    const st = this.stains, imgs = this.stampImgs.get(kind);
    if (!st || !imgs || !imgs.length) return;
    const img = imgs[(seed >>> 0) % imgs.length];
    const k = this.kS;
    const a = ((seed >>> 3) % 628) / 100;
    // the stamp spec is a ±20 u disc painted at stampK px per u: scale so that its radius is r
    const scale = (r * k) / (20 * this.stampK);
    const c = Math.cos(a) * scale, n = Math.sin(a) * scale;
    const px = (x - this.x0) * k, py = (y - this.y0) * k, R = (Math.max(img.width, img.height) / 2) * scale * 1.42;
    st.over(px - R, py - R, px + R, py + R, (g, ox, oy) => {
      g.setTransform(c, n, -n, c, px - ox, py - oy);
      g.globalAlpha = kind === 'coinRing' ? 0.9 : 0.75;
      g.drawImage(img, -img.width / 2, -img.height / 2);
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  wash(f: number): void {
    const st = this.stains;
    if (!st) return;
    const fill = `rgba(0,0,0,${Math.max(0, Math.min(1, f))})`;
    st.each((c) => {
      const g = ctx2d(c);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = fill;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-over';
    });
  }

  /** The arena's current ink (base + stains), cropped to the arena and scaled into w × h. */
  image(w: number, h: number): HTMLCanvasElement {
    const out = canvas(w, h);
    const base = this.base, geom = this.geom;
    if (!base || !geom) return out;
    const g = ctx2d(out);
    const k = this.k;
    const sx = (geom.minX - this.x0 - 20) * k, sy = (geom.minY - this.y0 - 20) * k;
    const sw = (geom.maxX - geom.minX + 40) * k, sh = (geom.maxY - geom.minY + 40) * k;
    const fit = Math.max(w / sw, h / sh);
    const cw = w / fit, ch = h / fit;
    const cx = sx + (sw - cw) / 2, cy = sy + (sh - ch) / 2;
    base.draw(g, Math.max(0, cx), Math.max(0, cy), Math.min(base.w, cx + cw), Math.min(base.h, cy + ch), w / cw, -cx * (w / cw), -cy * (h / ch));
    const f0 = STAIN_K[this.quality];
    if (this.stains) this.stains.draw(g, Math.max(0, cx * f0), Math.max(0, cy * f0), Math.min(this.stains.w, (cx + cw) * f0), Math.min(this.stains.h, (cy + ch) * f0), w / (cw * f0), -cx * (w / cw), -cy * (h / ch));
    // obstacles: layer px → out px
    const f = w / cw;
    for (const o of this.obst) g.drawImage(o.img, ((o.x0 - this.x0) * k - cx) * f, ((o.y0 - this.y0) * k - cy) * f, o.w * k * f, o.h * k * f);
    return out;
  }

  dispose(): void {
    for (const o of this.obst) { o.img.width = 1; o.img.height = 1; }
    this.base?.dispose();
    this.stains?.dispose();
    this.obst = [];
    this.base = this.stains = null;
    this.stampImgs.clear();
  }
}

/** Tile size (px) of the arena's layers, and the border each tile repeats from its neighbours (so
 *  bilinear sampling at a tile's edge sees the real neighbouring pixels: no seams). */
const TILE = 256;
const TB = 2;

/** A large canvas cut into TILE² tiles (each with a TB border). */
class Tiles {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: HTMLCanvasElement[] = [];
  constructor(readonly w: number, readonly h: number) {
    this.cols = Math.max(1, Math.ceil(w / TILE));
    this.rows = Math.max(1, Math.ceil(h / TILE));
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const tw = Math.min(TILE, w - i * TILE), th = Math.min(TILE, h - j * TILE);
      this.tiles.push(canvas(tw + TB * 2, th + TB * 2));
    }
  }
  /** Cut a painted canvas into tiles. */
  static from(src: HTMLCanvasElement): Tiles {
    const t = new Tiles(src.width, src.height);
    t.each((c, tx, ty) => ctx2d(c).drawImage(src, -(tx - TB), -(ty - TB)));
    return t;
  }
  /** Each tile with its layer-px origin (tx, ty) of its interior (the canvas's (TB, TB)). */
  each(f: (c: HTMLCanvasElement, tx: number, ty: number) => void): void {
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) f(this.tiles[j * this.cols + i], i * TILE, j * TILE);
  }
  /** Each tile whose canvas (border included) meets the layer-px rect; g draws in layer px − (ox, oy). */
  over(x0: number, y0: number, x1: number, y1: number, f: (g: CanvasRenderingContext2D, ox: number, oy: number) => void): void {
    const i0 = Math.max(0, Math.floor((x0 - TB) / TILE)), i1 = Math.min(this.cols - 1, Math.floor((x1 + TB) / TILE));
    const j0 = Math.max(0, Math.floor((y0 - TB) / TILE)), j1 = Math.min(this.rows - 1, Math.floor((y1 + TB) / TILE));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(ctx2d(this.tiles[j * this.cols + i]), i * TILE - TB, j * TILE - TB);
  }
  /**
   * Draw the layer-px rect [x0, x1) × [y0, y1) at screen = ox + p · f (the same f on both axes): only
   * the tiles it meets, each clipped to it. Tile edges land on whole screen pixels (the source is
   * adjusted to match), so neighbouring tiles meet without a seam.
   */
  draw(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, f: number, ox: number, oy: number): void {
    const i0 = Math.max(0, Math.floor(x0 / TILE)), i1 = Math.min(this.cols - 1, Math.floor((x1 - 1e-6) / TILE));
    const j0 = Math.max(0, Math.floor(y0 / TILE)), j1 = Math.min(this.rows - 1, Math.floor((y1 - 1e-6) / TILE));
    for (let j = j0; j <= j1; j++) {
      const ty = j * TILE;
      const dy0 = Math.round(oy + Math.max(y0, ty) * f), dy1 = Math.round(oy + Math.min(y1, ty + TILE, this.h) * f);
      if (dy1 <= dy0) continue;
      for (let i = i0; i <= i1; i++) {
        const tx = i * TILE;
        const dx0 = Math.round(ox + Math.max(x0, tx) * f), dx1 = Math.round(ox + Math.min(x1, tx + TILE, this.w) * f);
        if (dx1 <= dx0) continue;
        // the source rect that maps onto the whole-pixel destination rect (tile canvas px)
        const sx = (dx0 - ox) / f - tx + TB, sy = (dy0 - oy) / f - ty + TB;
        ctx.drawImage(this.tiles[j * this.cols + i], sx, sy, (dx1 - dx0) / f, (dy1 - dy0) / f, dx0, dy0, dx1 - dx0, dy1 - dy0);
      }
    }
  }
  bytes(): number {
    let n = 0;
    for (const c of this.tiles) n += c.width * c.height * 4;
    return n;
  }
  dispose(): void {
    for (const c of this.tiles) { c.width = 1; c.height = 1; }
    this.tiles.length = 0;
  }
}

// ───────────────────────────────────────────── shapes

function octagon(r: number): Pt[] {
  return Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return [Math.cos(a) * r, Math.sin(a) * r] as Pt; });
}
/** The arena's outline grown by `grow` u; `append` adds it to the current path (for a band). */
function shapePath(g: CanvasRenderingContext2D, geom: ArenaGeom, grow: number, append = false) {
  const s = geom.shape;
  if (!append) g.beginPath();
  else if (s.kind === 'circle') g.moveTo(s.r + grow, 0);
  if (s.kind === 'circle') g.arc(0, 0, s.r + grow, 0, Math.PI * 2);
  else if (s.kind === 'rect') g.rect(-s.w / 2 - grow, -s.h / 2 - grow, s.w + grow * 2, s.h + grow * 2);
  else { const p = octagon(s.r + grow); g.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); }
}
/** A point in the arena by (u, v) in 0..1² (for scattering décor), or null outside. */
function inside(geom: ArenaGeom, x: number, y: number, pad = 0): boolean {
  const s = geom.shape;
  if (s.kind === 'circle') return Math.hypot(x, y) < s.r - pad;
  if (s.kind === 'rect') return Math.abs(x) < s.w / 2 - pad && Math.abs(y) < s.h / 2 - pad;
  const r = (s.r - pad) * Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; if (x * Math.cos(a) + y * Math.sin(a) > r) return false; }
  return true;
}
function clear(geom: ArenaGeom, x: number, y: number, pad: number): boolean {
  for (const o of geom.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + pad) return false;
  return true;
}

// ───────────────────────────────────────────── ground and décor per map

function ground(b: B, map: MapId, geom: ArenaGeom, P: MapPalette, seed: number) {
  const { minX, minY, maxX, maxY } = geom;
  const W = maxX - minX, H = maxY - minY;
  const rnd = (i: number) => h01(seed, i);
  // broad washes of the ground colour
  for (let i = 0; i < 9; i++) {
    const x = minX + rnd(i) * W, y = minY + rnd(i + 50) * H;
    b.wash(P.ground, blob(x, y, 160 + rnd(i + 90) * 200, 110 + rnd(i + 130) * 150, seed + i, 0.22, 16), map === 'palace' ? 0.07 : map === 'lake' ? 0.08 : 0.1, 30);
  }
  if (map === 'lake') {
    // the water's skin: one pale indigo wash over everything, deeper toward the rim
    const R = geom.shape.kind === 'circle' ? geom.shape.r : 760;
    b.wash(P.ground, ell(0, 0, R * 1.02, R * 1.02, 0, Math.PI * 2, 40), 0.1, 40);
    b.brush(arcW(0, 0, R - 40, R - 40, 0, Math.PI * 2, 90, 90, 48), 0.07, P.ground);
    // the moon's reflection, silver on the water
    b.wash('#ffffff', blob(W * 0.12, -H * 0.18, 130, 120, seed + 3, 0.05, 20), 0.7, 24);
    b.wash('#ffffff', blob(W * 0.12, -H * 0.18, 80, 76, seed + 4, 0.04, 20), 0.6, 14);
    for (let i = 0; i < 5; i++) b.line([[W * 0.12 - 90 + i * 10, -H * 0.18 + 120 + i * 14], [W * 0.12 + 90 - i * 12, -H * 0.18 + 120 + i * 14]], 1.4, 0.25, '#c9d3dc');
    // ripple strokes
    for (let i = 0; i < 26; i++) {
      const x = minX + rnd(i + 200) * W, y = minY + rnd(i + 300) * H;
      if (!inside(geom, x, y, 30) || !clear(geom, x, y, 30)) continue;
      const w = 40 + rnd(i + 400) * 80;
      b.brush([[x - w, y, 0.6], [x, y + 3, 2.2], [x + w, y, 0.4]], 0.18 + rnd(i) * 0.12, P.ink);
    }
    // small floating leaves and fallen petals (décor, too small to be mistaken for pads)
    for (let i = 0; i < 16; i++) {
      const x = minX + rnd(i + 500) * W, y = minY + rnd(i + 600) * H;
      if (!inside(geom, x, y, 40) || !clear(geom, x, y, 50)) continue;
      if (i % 3 === 0) b.fill(P.a2, rot(ell(x, y, 7, 3.6, 0, Math.PI * 2, 8), rnd(i) * 6, x, y), 0.45, 0.5);
      else b.wash(P.a1, ell(x, y, 14, 11, 0, Math.PI * 2, 12), 0.25, 3);
    }
  } else if (map === 'forest') {
    // moss dots 苔点 and fallen bamboo leaves
    for (let i = 0; i < 90; i++) {
      const x = minX + rnd(i + 700) * W, y = minY + rnd(i + 800) * H;
      if (!inside(geom, x, y, 10)) continue;
      if (i % 3) b.dot(x, y, 4 + rnd(i) * 6, 0.35 + rnd(i + 1) * 0.3, i % 2 ? P.a1 : P.ink);
      else b.brush(rotW([[-9, 0, 0.3], [-2, 0, 3], [9, 0, 0.2]], rnd(i + 3) * 6).map(([px, py, w]) => [px + x, py + y, w] as [number, number, number]), 0.35, P.ink);
    }
    // two faint paths of earth
    b.wash('#8a7a5a', [[minX, -60], [-W * 0.2, -20], [0, 30], [W * 0.25, 10], [maxX, 60], [maxX, 130], [W * 0.25, 90], [0, 110], [-W * 0.2, 60], [minX, 30]], 0.12, 30);
  } else {
    // a cold moon-white floor
    b.wash('#dfe7f0', octagon(geom.shape.kind === 'octagon' ? geom.shape.r : 820), 0.35, 30);
    // jade floor tiles and cloud scrolls
    const T = 120;
    for (let x = Math.floor(minX / T) * T; x < maxX; x += T) b.line([[x, minY], [x, maxY]], 1.2, 0.2, P.ground);
    for (let y = Math.floor(minY / T) * T; y < maxY; y += T) b.line([[minX, y], [maxX, y]], 1.2, 0.2, P.ground);
    for (let i = 0; i < 10; i++) {
      const x = minX + rnd(i + 900) * W, y = minY + rnd(i + 950) * H;
      if (!inside(geom, x, y, 80) || !clear(geom, x, y, 60)) continue;
      b.brush(arcW(x, y, 22, 16, Math.PI * 0.2, Math.PI * 1.8, 1, 3, 10), 0.18, P.ground);
      b.brush(arcW(x + 30, y + 4, 14, 10, Math.PI * 1.2, Math.PI * 2.8, 2, 0.6, 8), 0.16, P.ground);
    }
    // fallen osmanthus
    for (let i = 0; i < 40; i++) {
      const a = rnd(i + 1000) * Math.PI * 2, r = 110 + rnd(i + 1100) * 260;
      b.dot(Math.cos(a) * r, Math.sin(a) * r, 3 + rnd(i) * 3, 0.55, GOLD);
    }
  }
}

function obstacle(b: B, o: ArenaGeom['obstacles'][number], P: MapPalette, seed: number) {
  const { x, y, r } = o;
  const s = seed ^ Math.round(x * 7 + y * 13);
  if (o.kind === 'lotus') {
    // a lotus pad from above: a round leaf with its notch, veins from the centre, a darker rim
    const notch = h01(s, 1) * Math.PI * 2;
    const pts: Pt[] = [];
    for (let i = 0; i <= 26; i++) { const a = notch + 0.18 + (i / 26) * (Math.PI * 2 - 0.36); const k = 1 + 0.04 * Math.sin(a * 5 + s); pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
    pts.push([x, y]);
    b.wash(INK, ell(x + 6, y + 8, r * 1.04, r * 0.98, 0, Math.PI * 2, 20), 0.18, 8);
    b.fill('#5f8a6e', pts, 0.82, 1.2);
    b.wash('#3e6a50', blob(x - r * 0.2, y - r * 0.1, r * 0.6, r * 0.5, s, 0.2), 0.35, 5);
    for (let i = 0; i < 9; i++) { const a = notch + 0.4 + (i / 9) * (Math.PI * 2 - 0.8); b.line([[x, y], [x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9]], 0.9, 0.35, '#2f4a3a'); }
    b.brush(pts.slice(0, -1).map(([px, py]) => [px, py, 2.2] as [number, number, number]), 0.55, '#2f4a3a');
    b.dot(x, y, 6, 0.7, '#2f4a3a');
    if (h01(s, 2) < 0.5) {
      // a lotus flower resting on the pad
      const fx = x + Math.cos(notch + 2.4) * r * 0.45, fy = y + Math.sin(notch + 2.4) * r * 0.45;
      for (let i = 0; i < 8; i++) b.fill(i % 2 ? '#f3d6dc' : '#e7a3b3', rot(ell(fx + 9, fy, 9, 4.6, 0, Math.PI * 2, 10), (i / 8) * Math.PI * 2, fx, fy), 0.9, 0.5);
      b.disc(fx, fy, 4, GOLD);
    }
  } else if (o.kind === 'bamboo') {
    // a clump from above: culm cross-sections and leaves radiating in 个 strokes
    b.wash(P.ink, blob(x + 5, y + 6, r * 1.05, r, s, 0.18), 0.28, 10);
    const n = 5 + Math.round(r / 12);
    for (let i = 0; i < n; i++) {
      const a = h01(s, i + 10) * Math.PI * 2, d = Math.sqrt(h01(s, i + 30)) * r * 0.55;
      const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d, cr = 6 + h01(s, i + 50) * 5;
      b.disc(cx, cy, cr, '#1f2a20'); b.ring(cx, cy, cr * 0.72, 1.2, '#4f6a4f', 0.9);
    }
    // leaves in 个 sprays: three blades from one point, a few sprays leaning out of the clump
    const sprays = 5 + Math.round(r / 20);
    for (let i = 0; i < sprays; i++) {
      const a = (i / sprays) * Math.PI * 2 + h01(s, i + 70) * 0.8;
      const bx = x + Math.cos(a) * r * 0.55, by = y + Math.sin(a) * r * 0.55;
      for (let j = -1; j <= 1; j++) {
        const l = r * (0.45 + h01(s, i * 3 + j + 90) * 0.3), aa = a + j * 0.42;
        b.brush(rotW([[0, 0, 0.6], [l * 0.35, 0, 7], [l, 0, 0.4]], aa).map(([px, py, w]) => [px + bx, py + by, w] as [number, number, number]), 0.82, j ? '#1a2419' : '#2f4a36');
      }
    }
  } else {
    // the great osmanthus from above: a trunk, a dark canopy, gold blossom
    b.wash(INK, blob(x + 10, y + 12, r * 1.2, r * 1.1, s, 0.15), 0.25, 12);
    for (let i = 0; i < 26; i++) {
      const a = h01(s, i + 5) * Math.PI * 2, d = Math.sqrt(h01(s, i + 25)) * r * 0.85;
      b.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.35 + h01(s, i + 45) * 0.25), 0.75, i % 2 ? '#1f3a2a' : '#2f4a36');
    }
    for (let i = 0; i < 60; i++) {
      const a = h01(s, i + 105) * Math.PI * 2, d = Math.sqrt(h01(s, i + 205)) * r;
      b.disc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + h01(s, i + 305) * 1.6, i % 4 ? GOLD : '#f0d060');
    }
    b.dot(x, y, 22, 0.9, '#4a3526');
  }
}

/** Beyond the arena: water for the lake, dark grove for the forest, the void for the palace. */
function surround(b: B, map: MapId, geom: ArenaGeom, P: MapPalette, seed: number) {
  const { minX, minY, maxX, maxY } = geom;
  if (map === 'palace') {
    for (let i = 0; i < 70; i++) {
      const x = minX - MARGIN + h01(seed, i + 1400) * (maxX - minX + MARGIN * 2), y = minY - MARGIN + h01(seed, i + 1500) * (maxY - minY + MARGIN * 2);
      if (inside(geom, x, y, -60)) continue;
      b.disc(x, y, 0.8 + h01(seed, i) * 1.6, i % 5 ? '#c9d3dc' : '#f0d060', 0.4 + h01(seed, i + 3) * 0.5);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const R = Math.max(maxX - minX, maxY - minY) * 0.62;
      b.wash(map === 'lake' ? '#3a4a5a' : '#2f3a2c', blob(Math.cos(a) * R, Math.sin(a) * R, 220, 160, seed + i, 0.2), 0.3, 30);
    }
  }
}

/** The bronze mirror rim (海兽葡萄镜 / 规矩镜 / 透光镜) around the shape. */
function rimOf(b: B, deco: B, map: MapId, geom: ArenaGeom, P: MapPalette) {
  const s = geom.shape;
  const w = RIM_W;
  const bronze = P.rim, dark = '#3a2c1c', light = map === 'palace' ? '#eef2f6' : '#d6b87a';
  // a circle is one smooth stroke; a polygon is one straight stroke per edge (the brush smooths
  // corners), run long past each corner — paint() clips them to the band, which mitres the joints
  const ring = (pts: Pt[], width: number, color: string, tone: number) => {
    if (s.kind === 'circle') { b.brush([...pts, pts[0], pts[1]].map(([x, y]) => [x, y, width] as [number, number, number]), tone, color); return; }
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const L = Math.hypot(bx - ax, by - ay), ex = ((bx - ax) / L) * (width + 6), ey = ((by - ay) / L) * (width + 6);
      b.brush([[ax - ex, ay - ey, width], [(ax + bx) / 2, (ay + by) / 2, width], [bx + ex, by + ey, width]], tone, color);
    }
  };
  const shapePts = (grow: number): Pt[] => {
    if (s.kind === 'circle') return ell(0, 0, s.r + grow, s.r + grow, 0, Math.PI * 2, 72);
    if (s.kind === 'octagon') return octagon(s.r + grow);
    const hw = s.w / 2 + grow, hh = s.h / 2 + grow;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  };
  ring(shapePts(w / 2), w, bronze, 0.92);
  ring(shapePts(2), 3, dark, 0.8);
  ring(shapePts(w - 2), 4, dark, 0.7);
  ring(shapePts(w * 0.45), 1.6, light, 0.8);
  // motifs along the rim
  const pts = shapePts(w / 2);
  const per: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 60));
    for (let j = 0; j < n; j++) per.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  {
    const b = deco;
  per.forEach(([x, y], i) => {
    if (map === 'lake') {
      // grape clusters and little sea beasts: dots in threes, a curl between
      if (i % 2) for (const [dx, dy] of [[0, 0], [5, 3], [-5, 3], [0, 6]] as Pt[]) b.disc(x + dx, y + dy - 3, 2.4, dark, 0.8);
      else b.brush(arcW(x, y, 7, 5, 0, Math.PI * 1.5, 1.6, 0.6, 8), 0.8, dark);
    } else if (map === 'forest') {
      // TLV marks
      const m = i % 3;
      if (m === 0) b.line([[x - 6, y], [x + 6, y], [x, y], [x, y + 8]], 1.6, 0.85, dark);
      else if (m === 1) b.line([[x - 5, y - 5], [x - 5, y + 5], [x + 5, y + 5]], 1.6, 0.85, dark);
      else b.line([[x - 6, y - 5], [x, y + 5], [x + 6, y - 5]], 1.6, 0.85, dark);
    } else if (i % 2 === 0) b.fill(MOON, star(x, y, 5, 2, 4), 0.7, 0.3);
  });
  if (map === 'palace') {
    // cinnabar pillars at the octagon's corners
    for (const [x, y] of octagon((s.kind === 'octagon' ? s.r : 800) + w + 22)) { b.disc(x, y, 18, CINNABAR); b.ring(x, y, 18, 3, '#7a2418', 0.9); b.disc(x - 5, y - 5, 4, '#e8765e', 0.8); }
  }
  }
}

/** 倒影: lightness inverted, hues kept (difference with white, then the original's hue) — inside the
 *  rim only. Beyond it the surround is darkened toward the void rather than turned pale. */
function invertLayer(c: HTMLCanvasElement, geom: ArenaGeom, k: number, x0: number, y0: number, P: MapPalette) {
  const g = ctx2d(c);
  const copy = canvas(c.width, c.height);
  ctx2d(copy).drawImage(c, 0, 0);
  const toL = () => g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  g.save();
  toL(); shapePath(g, geom, RIM_W + 3); g.clip();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'difference';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'hue';
  g.drawImage(copy, 0, 0);
  g.restore();
  // the surround: the map's dark, pressed further toward the void
  g.save();
  toL(); g.beginPath(); g.rect(x0, y0, c.width / k, c.height / k); shapePath(g, geom, RIM_W + 3, true); g.clip('evenodd');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = hexA(VOID, VOID_A);
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
  copy.width = copy.height = 1;
  void P;
}

/** The camera's fill beyond the layer in 倒影: pal.outside under the void's veil. */
function voidOf(P: MapPalette): string {
  const a = rgbOf(P.outside), b = rgbOf(VOID);
  return `rgb(${a.map((v, i) => Math.round(v * (1 - VOID_A) + b[i] * VOID_A)).join(',')})`;
}
function rgbOf(c: string): [number, number, number] {
  if (c.startsWith('#')) { const n = parseInt(c.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = c.match(/[\d.]+/g) ?? ['0', '0', '0'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
function hexA(hex: string, a: number): string {
  return `rgba(${rgbOf(hex).join(',')},${a})`;
}

/** Fade the layer's outer 60 u into the camera's fill colour, so its edge never shows. */
function feather(g: CanvasRenderingContext2D, pw: number, ph: number, k: number, color: string) {
  const d = Math.min(60 * k, pw / 4, ph / 4);
  const rgb = rgbOf(color).join(',');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  const side = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  };
  side(0, 0, d, 0, 0, 0, d, ph);
  side(pw, 0, pw - d, 0, pw - d, 0, d, ph);
  side(0, 0, 0, d, 0, 0, pw, d);
  side(0, ph, 0, ph - d, 0, ph - d, pw, d);
}

// ───────────────────────────────────────────── stamps (±20 u discs)

const STAMPS: Record<StampKind, Spec> = {
  splat: { box: [-22, -22, 22, 22], n: 3, halo: 'none', paint: (b, v) => { b.wash(INK, blob(0, 0, 14, 12, 11 + v * 13, 0.3), 0.55, 3); b.wash(INK, blob(2, -1, 7, 6, 17 + v * 5, 0.25), 0.4, 2); for (let i = 0; i < 6; i++) { const a = h01(v + 21, i) * Math.PI * 2, r = 13 + h01(v + 31, i) * 7; b.dot(Math.cos(a) * r, Math.sin(a) * r, 1.4 + h01(v + 41, i) * 2.6, 0.6, INK); } } },
  burn: { box: [-22, -22, 22, 22], n: 2, halo: 'none', paint: (b, v) => { b.wash('#3a2418', blob(0, 0, 15, 13, 5 + v, 0.35), 0.5, 3); b.wash('#8e3a22', blob(0, 0, 8, 7, 9 + v, 0.3), 0.25, 2); } },
  ink: { box: [-22, -22, 22, 22], n: 2, halo: 'none', paint: (b, v) => { b.wash('#3d5a73', blob(0, 0, 16, 14, 3 + v * 7, 0.25), 0.4, 4); } },
  petal: { box: [-22, -22, 22, 22], n: 2, halo: 'none', paint: (b, v) => { for (let i = 0; i < 7; i++) { const a = h01(v + 3, i) * Math.PI * 2, r = h01(v + 5, i) * 16; b.fill(i % 2 ? '#e7a3b3' : GOLD, rot(ell(Math.cos(a) * r, Math.sin(a) * r, 3, 1.8, 0, Math.PI * 2, 8), a, Math.cos(a) * r, Math.sin(a) * r), 0.7, 0.3); } } },
  coinRing: { box: [-22, -22, 22, 22], n: 1, halo: 'none', paint: (b) => { b.brush(arcW(0, 0, 17, 17, 0, Math.PI * 2, 1.4, 1.4, 28), 0.7, GOLD); } },
};
void rgba; void (null as unknown as Stroke);
