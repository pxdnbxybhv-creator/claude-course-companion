// 水月幻镜 · impact sprites (打击感): the small baked pieces the engine's feel layer throws around —
// ink droplets and spatter streaks, feathers, talisman sparks, jade chips, go-stone chips, impact
// rings and flares, the brush-stroke swipe of a melee swing (5 reveal frames), the death crown, the
// muzzle puff and the moon glint — and the luminous hit marks drawn on the struck body: a four-point
// impact star, a cut (the blade's crescent across the body), a pierce beam (流光 through it), a
// ring of light, an ink shard and a ground splash. Painted once with plain Canvas 2D (gradients only
// here, at bake time), lazily per (shape, tint) into shelf-packed pages; the frame loop only calls
// drawImage. Colours follow the readability grammar: player-side effects are ink, class washes and
// light (white cores in a class-coloured glow with an ink hairline, so they read on pale paper); no
// sprite here is vermilion (danger stays the enemy's colour). Node-safe: without a document every
// lookup is null and the engine falls back to the painter's fx.
import type { Sprite } from '../types';

/** Shapes. */
export const SH = {
  dot: 0, drop: 1, streak: 2, feather: 3, spark: 4, chip: 5, stone: 6, ring: 7, flare: 8, swipe: 9, puff: 10, glint: 11, blot: 12,
  crown: 13, claw: 14, note: 15,
  /** Hit marks (luminous, drawn across the struck body) and the ground splash. */
  star: 16, cut: 17, beam: 18, halo: 19, shard: 20, splat: 21, ember: 22, rake: 23,
} as const;
/** Tints. */
export const TN = {
  ink: 0, azure: 1, indigo: 2, gamboge: 3, green: 4, moon: 5, wine: 6, jade: 7, white: 8, gold: 9, paper: 10, grey: 11, black: 12,
} as const;
const TINT_HEX = ['#1b1916', '#3f7fa6', '#2f4d73', '#d9a520', '#6fa87c', '#eef3f8', '#7a2640', '#5fae8e', '#ffffff', '#e7b547', '#f4efe4', '#6d6a63', '#141414'];
/** The glow of each tint for the luminous marks (star, cut, beam, halo): brighter, never vermilion. */
const GLOW_HEX = ['#5a6272', '#4fb0ec', '#6f8fe8', '#f2b52c', '#5cc98a', '#d8e6f8', '#b95c95', '#36cf9c', '#e6f0ff', '#f6c443', '#f4efe4', '#9a978f', '#3a3a3a'];
/** Light tints get a thin ink hairline so they read on pale paper. */
const LIGHT = new Set<number>([TN.moon, TN.white, TN.paper, TN.gold, TN.gamboge]);
export const SWIPE_FRAMES = 5;

/** World size (u) of each shape: w, h, anchor x, anchor y. */
const SIZE: readonly (readonly [number, number, number, number])[] = [
  [8, 8, 0.5, 0.5], // dot
  [12, 6, 0.4, 0.5], // drop (points +x)
  [32, 6, 0.85, 0.5], // streak (head at +x)
  [14, 6, 0.5, 0.5], // feather
  [14, 14, 0.5, 0.5], // spark
  [8, 6, 0.5, 0.5], // chip
  [8, 8, 0.5, 0.5], // stone
  [64, 64, 0.5, 0.5], // ring
  [32, 32, 0.5, 0.5], // flare
  [236, 236, 0.5, 0.5], // swipe (arc of radius 100 centred on the swinger; baked at half resolution)
  [18, 18, 0.5, 0.5], // puff
  [14, 14, 0.5, 0.5], // glint
  [14, 14, 0.5, 0.5], // blot
  [60, 60, 0.5, 0.5], // crown
  [22, 16, 0.5, 0.5], // claw
  [10, 12, 0.5, 0.5], // note
  [48, 48, 0.5, 0.5], // star (long axis along +x: the blow)
  [64, 16, 0.5, 0.5], // cut (a crescent along +x, drawn across the blow)
  [64, 8, 0.82, 0.5], // beam (head at +x)
  [64, 64, 0.5, 0.5], // halo (a ring of light, radius 28)
  [12, 10, 0.5, 0.5], // shard
  [52, 30, 0.3, 0.5], // splat (a ground splash flung toward +x)
  [28, 4, 0.75, 0.5], // ember (a thin spark of light, head at +x)
  [44, 22, 0.5, 0.5], // rake (three claw scratches of light along x)
];

/** Page size (px). Small on purpose: drawing from a 512²-or-larger extra canvas forces a flush of the
 *  frame's canvas each frame at phone DPR (≈ 20 ms for 30 draws at DPR 2); 256² pages cost nothing. */
const PAGE = 256;
/** Resolution factor per shape (big soft washes need fewer pixels). */
const RES_K: Partial<Record<number, number>> = { [SH.swipe]: 0.45, [SH.ring]: 0.8, [SH.crown]: 0.8, [SH.halo]: 0.9, [SH.splat]: 0.8 };
/** Largest resolution per shape (device px per u): the big swipe stays inside a 256² page. */
const RES_MAX: Partial<Record<number, number>> = { [SH.swipe]: 0.9 };

/** Deterministic little hash for bake-time wobble. */
function h01(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class FeelSprites {
  private pages: HTMLCanvasElement[] = [];
  private g: CanvasRenderingContext2D | null = null;
  private cur: HTMLCanvasElement | null = null;
  private px = 0; private py = 0; private rowH = 0;
  private cache = new Map<number, Sprite | null>();
  readonly ok: boolean;
  /** Device px per world u at bake time (the camera's scale, so a mark is drawn about 1:1). */
  readonly res: number;

  constructor(res: number) {
    this.res = Math.max(0.85, Math.min(3.4, Number.isFinite(res) ? res : 1));
    this.ok = typeof document !== 'undefined';
  }

  /** Let the pages go (a new resolution replaces this set). */
  dispose(): void {
    for (const c of this.pages) { c.width = 1; c.height = 1; }
    this.pages = []; this.g = null; this.cur = null; this.cache.clear(); this.inks = new WeakMap();
    this.shardMap = new WeakMap(); this.solidOf.clear(); this.shardN = 0;
  }

  /** Shard sets by body sprite and grid (index g). */
  private shardMap = new WeakMap<Sprite, (Shards | null)[]>();
  /** Which pieces of an atlas id's g × g grid carry some of the body (bit q), once its shards are baked. */
  private solidOf = new Map<string, number>();
  /** Shard sets baked so far (a run meets a few dozen bodies; past the cap, deaths cut plain pieces). */
  private shardN = 0;
  /** The shards already baked for this sprite and grid (no bake: the frame loop's lookup). */
  shardsOf(src: Sprite, g: number): Shards | null {
    return this.shardMap.get(src)?.[g] ?? null;
  }
  /** The solid pieces of an atlas id's g × g grid (bit q), 0 while unknown. */
  solid(id: string, g: number): number {
    return this.solidOf.get(id + '#' + g) ?? 0;
  }
  /**
   * The body sprite broken into g × g irregular shards — a jittered grid whose cuts wander — each piece
   * carrying its bit of the body with a white-hot rim along the break, plus a white twin of every piece
   * (from the painter's flash twin) for a death's first frames. Baked on first sight of the body (it
   * shares the ink twins' budget of 2 bakes a frame): undefined = not yet, try again; null = can't.
   * One small canvas per set, at most 200 px across a body (a boss's 360; pieces fly and fade in 0.3–0.5 s).
   */
  shards(src: Sprite, g: number, white: Sprite | null, id: string): Shards | null | undefined {
    let row = this.shardMap.get(src);
    const hit = row?.[g];
    if (hit !== undefined) return hit;
    if (!this.ok) return null;
    if (this.shardN >= SHARD_SETS) { if (!row) { row = []; this.shardMap.set(src, row); } row[g] = null; return null; }
    if (this.inkBakes >= 2) return undefined;
    this.inkBakes++;
    let out: Shards | null = null;
    try { out = bakeShards(src, g, white, this.pages); } catch { out = null; }
    if (!row) { row = []; this.shardMap.set(src, row); }
    row[g] = out;
    if (out) { this.shardN++; this.solidOf.set(id + '#' + g, out.solid); }
    return out;
  }

  /** Ink twins of body sprites (the tint a struck body takes after its flash), by the painter's sprite. */
  private inks = new WeakMap<Sprite, Sprite | null>();
  /** Ink twins baked this frame (a crowd's first blows never bake all at once). */
  private inkBakes = 0;
  /** The frame loop calls this once a frame: the ink-twin bake budget refills. */
  frame(): void { this.inkBakes = 0; }
  /**
   * The ink twin of a body sprite: its silhouette (paper halo included) filled with ink, drawn over the
   * body at a low alpha after the white flash — the blow's bruise, fading. Baked on first use (≤ 2 a
   * frame; null until then) into a small canvas of its own: writing into a page the frame has already
   * drawn from would make the browser flush the frame mid-way. In the frame loop it is a plain
   * source-over drawImage (no blend modes: an advanced blend copies the frame on many phones).
   */
  ink(src: Sprite): Sprite | null {
    const hit = this.inks.get(src);
    if (hit !== undefined) return hit;
    if (!this.ok || this.inkBakes >= 2) return null;
    this.inkBakes++;
    let out: Sprite | null = null;
    try {
      const pw = Math.max(1, Math.ceil(src.sw)), ph = Math.max(1, Math.ceil(src.sh));
      const c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      const g = c.getContext('2d');
      if (g) {
        g.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, 0, 0, src.sw, src.sh);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = 'rgb(20,18,16)';
        g.fillRect(0, 0, pw, ph);
        this.pages.push(c);
        out = { img: c, sx: 0, sy: 0, sw: src.sw, sh: src.sh, w: src.w, h: src.h, ax: src.ax, ay: src.ay };
      }
    } catch { out = null; }
    this.inks.set(src, out);
    return out;
  }

  /** The sprite for (shape, tint, frame); baked on first use. */
  get(shape: number, tint: number, frame = 0): Sprite | null {
    const key = (shape * 16 + tint) * 8 + frame;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    let s: Sprite | null = null;
    if (this.ok) { try { s = this.bake(shape, tint, frame); } catch { s = null; } }
    this.cache.set(key, s);
    return s;
  }

  /** Bake a list up front (behind the wave start) so the first hits never paint. */
  warm(list: readonly (readonly [number, number])[]): void {
    for (const [s, t] of list) {
      if (s === SH.swipe) for (let f = 0; f < SWIPE_FRAMES; f++) this.get(s, t, f);
      else this.get(s, t);
    }
  }

  private place(w: number, h: number): { g: CanvasRenderingContext2D; x: number; y: number; img: HTMLCanvasElement } {
    if (w > PAGE || h > PAGE) {
      // a piece bigger than a page (a swipe at DPR 3) gets a canvas of its own; the shelf carries on
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (!g) throw new Error('2d');
      this.pages.push(c);
      return { g, x: 0, y: 0, img: c };
    }
    if (!this.g || this.px + w > PAGE) { this.px = 0; this.py += this.rowH + 1; this.rowH = 0; }
    if (!this.g || this.py + h > PAGE) {
      const c = document.createElement('canvas');
      c.width = PAGE; c.height = PAGE;
      const g = c.getContext('2d');
      if (!g) throw new Error('2d');
      this.pages.push(c); this.g = g; this.cur = c; this.px = 0; this.py = 0; this.rowH = 0;
    }
    const at = { g: this.g, x: this.px, y: this.py, img: this.cur! };
    this.px += w + 1;
    this.rowH = Math.max(this.rowH, h);
    return at;
  }

  private bake(shape: number, tint: number, frame: number): Sprite | null {
    const [w, h, ax, ay] = SIZE[shape] ?? SIZE[0];
    const r = Math.min(RES_MAX[shape] ?? 9, this.res * (RES_K[shape] ?? 1));
    const pw = Math.ceil(w * r) + 2, ph = Math.ceil(h * r) + 2;
    const at = this.place(pw, ph);
    const g = at.g;
    g.save();
    g.beginPath(); g.rect(at.x, at.y, pw, ph); g.clip();
    // paint in world units about the anchor
    g.translate(at.x + 1 + ax * w * r, at.y + 1 + ay * h * r);
    g.scale(r, r);
    const col = TINT_HEX[tint] ?? TINT_HEX[0];
    const edge = LIGHT.has(tint) ? 'rgba(27,25,22,0.55)' : null;
    PAINT[shape]?.(g, col, edge, frame, tint);
    g.restore();
    return { img: at.img, sx: at.x, sy: at.y, sw: pw, sh: ph, w: pw / r, h: ph / r, ax: (1 + ax * w * r) / pw, ay: (1 + ay * h * r) / ph };
  }
}

/** Shard sets one FeelSprites keeps (a mob's ≈ 0.1–0.3 MB: its pieces twice, at ≤ SHARD_PX across; a
 *  boss's, broken on a 4 × 4 grid and seen big, up to BOSS_SHARD_PX). */
const SHARD_SETS = 36;
const SHARD_PX = 200;
const BOSS_SHARD_PX = 360;

/** A body sprite broken into g × g irregular pieces (FeelSprites.shards). */
export interface Shards {
  img: HTMLCanvasElement;
  g: number;
  /** Per piece q, 8 numbers: sx, sy, sw, sh of the plain piece in img (px; its white twin sits `wy`
   *  lower), the piece's centroid in the body (u from the sprite's anchor, unmirrored), and the top-left
   *  of its box from that centroid (u). */
  r: Float32Array;
  /** The white pieces' row offset in img (px; 0 when there are none). */
  wy: number;
  /** World u per px of img. */
  upx: number;
  /** Which pieces carry some of the body (bit q). */
  solid: number;
}

/** Bake one shard set (see FeelSprites.shards). */
function bakeShards(src: Sprite, g: number, white: Sprite | null, pages: HTMLCanvasElement[]): Shards | null {
  if (g < 1 || g > 5 || !(src.sw > 1) || !(src.sh > 1)) return null;
  const b = Math.min(1, (g >= 4 ? BOSS_SHARD_PX : SHARD_PX) / Math.max(src.sw, src.sh));
  const pw = src.sw * b, ph = src.sh * b;
  const upx = src.w / pw;
  const cw = pw / g, ch = ph / g, N = g + 1;
  const seed = (Math.round(src.sw) * 131 + Math.round(src.sh) * 7 + g) | 0;
  // the grid's points wander (±22% of a cell; points on the border slide along it)
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    gx[j * N + i] = i * cw + (i > 0 && i < g ? (h01(seed + i, j * 7 + 1) - 0.5) * 0.44 * cw : 0);
    gy[j * N + i] = j * ch + (j > 0 && j < g ? (h01(seed + i * 3 + 5, j + 11) - 0.5) * 0.44 * ch : 0);
  }
  // every inner cut bends at its middle (the same bend for the two pieces it parts, so they fit)
  const hMid = (i: number, j: number, o: number[]): void => {
    const x = (gx[j * N + i] + gx[j * N + i + 1]) / 2, y = (gy[j * N + i] + gy[j * N + i + 1]) / 2;
    o.push(x, y + (j > 0 && j < g ? (h01(seed + 17 * i + 3, 101 + j) - 0.5) * 0.4 * ch : 0));
  };
  const vMid = (i: number, j: number, o: number[]): void => {
    const x = (gx[j * N + i] + gx[(j + 1) * N + i]) / 2, y = (gy[j * N + i] + gy[(j + 1) * N + i]) / 2;
    o.push(x + (i > 0 && i < g ? (h01(seed + 29 * i + 7, 211 + j) - 0.5) * 0.4 * cw : 0), y);
  };
  const polys: number[][] = [];
  const box = new Float32Array(g * g * 4);
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const p: number[] = [];
    p.push(gx[j * N + i], gy[j * N + i]); hMid(i, j, p);
    p.push(gx[j * N + i + 1], gy[j * N + i + 1]); vMid(i + 1, j, p);
    p.push(gx[(j + 1) * N + i + 1], gy[(j + 1) * N + i + 1]); hMid(i, j + 1, p);
    p.push(gx[(j + 1) * N + i], gy[(j + 1) * N + i]); vMid(i, j, p);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); }
    const q = j * g + i;
    box[q * 4] = Math.floor(x0) - 2; box[q * 4 + 1] = Math.floor(y0) - 2;
    box[q * 4 + 2] = Math.ceil(x1) - Math.floor(x0) + 4; box[q * 4 + 3] = Math.ceil(y1) - Math.floor(y0) + 4;
    polys.push(p);
  }
  // shelf-pack the pieces' boxes
  const n = g * g, r = new Float32Array(n * 8);
  const maxW = Math.ceil(pw * 1.5) + 8;
  let cx = 0, cy = 0, rowH = 0, W = 0;
  for (let q = 0; q < n; q++) {
    const bw = box[q * 4 + 2], bh = box[q * 4 + 3];
    if (cx > 0 && cx + bw > maxW) { cx = 0; cy += rowH + 1; rowH = 0; }
    r[q * 8] = cx; r[q * 8 + 1] = cy; r[q * 8 + 2] = bw; r[q * 8 + 3] = bh;
    cx += bw + 1; rowH = Math.max(rowH, bh); W = Math.max(W, cx);
  }
  const H = cy + rowH;
  const wy = white ? H + 1 : 0;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(W)); c.height = Math.max(1, Math.ceil(white ? H * 2 + 1 : H));
  const g2 = c.getContext('2d');
  if (!g2) return null;
  const path = (p: number[]): void => {
    g2.beginPath();
    g2.moveTo(p[0], p[1]);
    for (let k = 2; k < p.length; k += 2) g2.lineTo(p[k], p[k + 1]);
    g2.closePath();
  };
  for (let q = 0; q < n; q++) {
    const p = polys[q];
    const bx = box[q * 4], by = box[q * 4 + 1];
    let mx = 0, my = 0;
    for (let k = 0; k < p.length; k += 2) { mx += p[k]; my += p[k + 1]; }
    mx /= p.length / 2; my /= p.length / 2;
    r[q * 8 + 4] = (mx - src.ax * pw) * upx; r[q * 8 + 5] = (my - src.ay * ph) * upx;
    r[q * 8 + 6] = (bx - mx) * upx; r[q * 8 + 7] = (by - my) * upx;
    for (let pass = 0; pass < (white ? 2 : 1); pass++) {
      const s = pass ? white! : src;
      g2.save();
      g2.translate(r[q * 8] - bx, r[q * 8 + 1] - by + (pass ? wy : 0));
      path(p); g2.clip();
      g2.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, pw, ph);
      if (!pass) {
        // the break: a white-hot rim along the cut, added as light (it glows on the ink and vanishes into
        // the pale paper halo), then trimmed back to the piece's own alpha
        g2.globalCompositeOperation = 'lighter';
        path(p);
        g2.lineJoin = 'round';
        g2.strokeStyle = 'rgba(255,236,196,0.45)'; g2.lineWidth = 5 / upx; g2.stroke();
        g2.strokeStyle = 'rgba(255,252,240,0.9)'; g2.lineWidth = 2 / upx; g2.stroke();
        g2.globalCompositeOperation = 'destination-in';
        g2.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, pw, ph);
      }
      g2.restore();
    }
  }
  // which pieces carry some of the body (a coarse look at the sprite's alpha)
  let solid = (1 << n) - 1;
  try {
    const m = 4 * g;
    const t = document.createElement('canvas');
    t.width = m; t.height = m;
    const tg = t.getContext('2d');
    if (tg) {
      tg.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, 0, 0, m, m);
      const d = tg.getImageData(0, 0, m, m).data;
      solid = 0;
      for (let q = 0; q < n; q++) {
        const i = q % g, j = (q / g) | 0;
        let a = 0;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) a += d[((j * 4 + y) * m + i * 4 + x) * 4 + 3];
        if (a / 16 > 40) solid |= 1 << q;
      }
      if (!solid) solid = (1 << n) - 1;
    }
  } catch { /* keep every piece */ }
  pages.push(c);
  return { img: c, g, r, wy, upx, solid };
}

type Paint = (g: CanvasRenderingContext2D, col: string, edge: string | null, frame: number, tint: number) => void;

function blobPath(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number, wob: number, n = 12): void {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (h01(seed, i % n) - 0.5) * wob;
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
function outline(g: CanvasRenderingContext2D, edge: string | null, w = 0.6): void {
  if (!edge) return;
  g.strokeStyle = edge; g.lineWidth = w; g.stroke();
}

const PAINT: Paint[] = [];
PAINT[SH.dot] = (g, col, edge) => {
  blobPath(g, 0, 0, 3.4, 3.2, 3, 0.25);
  g.fillStyle = col; g.fill(); outline(g, edge);
};
PAINT[SH.drop] = (g, col, edge) => {
  // head at +x, a thin tail to −x
  g.beginPath();
  g.moveTo(-4.5, 0);
  g.quadraticCurveTo(0, -2.4, 3.2, -2.3);
  g.arc(3.4, 0, 2.3, -Math.PI / 2, Math.PI / 2);
  g.quadraticCurveTo(0, 2.4, -4.5, 0);
  g.closePath();
  g.fillStyle = col; g.fill(); outline(g, edge);
};
PAINT[SH.streak] = (g, col, edge) => {
  // a tapered dry-brush streak: solid head, broken 飞白 hairs toward the tail
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-27, 0);
  g.quadraticCurveTo(-8, -2.6, 3.5, -2.4);
  g.quadraticCurveTo(5.4, 0, 3.5, 2.4);
  g.quadraticCurveTo(-8, 2.6, -27, 0);
  g.closePath();
  g.globalAlpha = 0.9; g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(244,239,228,0.55)';
  g.lineWidth = 0.45;
  for (let k = 0; k < 3; k++) { const y = -1.2 + k * 1.2; g.beginPath(); g.moveTo(-24 + k * 3, y * 0.6); g.lineTo(-6 - k * 4, y); g.stroke(); }
  outline(g, edge, 0.4);
};
PAINT[SH.feather] = (g, col, edge) => {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-6.5, 0);
  g.quadraticCurveTo(-1, -3, 6, -0.6);
  g.lineTo(6, 0.6);
  g.quadraticCurveTo(-1, 3, -6.5, 0);
  g.closePath();
  g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(27,25,22,0.8)'; g.lineWidth = 0.5;
  g.beginPath(); g.moveTo(-6.8, 0); g.lineTo(6.5, 0); g.stroke();
  for (let k = 0; k < 4; k++) { const x = -4 + k * 2.4; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 1.4, -2); g.moveTo(x, 0); g.lineTo(x - 1.4, 2); g.stroke(); }
  outline(g, edge, 0.3);
};
PAINT[SH.spark] = (g, col, edge) => {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, rr = i % 2 === 0 ? 6.6 : 1.5;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = col; g.fill(); outline(g, edge, 0.5);
  g.beginPath(); g.arc(0, 0, 1.3, 0, Math.PI * 2); g.fillStyle = '#fffaf0'; g.fill();
};
PAINT[SH.chip] = (g, col, edge) => {
  g.beginPath(); g.moveTo(-3.6, -1); g.lineTo(-0.5, -2.8); g.lineTo(3.6, -0.6); g.lineTo(1.2, 2.6); g.lineTo(-2.8, 1.8); g.closePath();
  g.fillStyle = col; g.fill(); outline(g, edge ?? 'rgba(27,25,22,0.5)', 0.45);
  g.beginPath(); g.moveTo(-1.6, -1.2); g.lineTo(0.8, -1.9); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.6; g.stroke();
};
PAINT[SH.stone] = (g, col, _edge, _f, tint) => {
  g.beginPath(); g.ellipse(0, 0, 3.6, 3.1, 0, 0, Math.PI * 2);
  g.fillStyle = col; g.fill();
  g.strokeStyle = tint === TN.black ? 'rgba(244,239,228,0.5)' : 'rgba(27,25,22,0.6)'; g.lineWidth = 0.5; g.stroke();
  g.beginPath(); g.ellipse(-1.1, -1.1, 1.1, 0.7, -0.6, 0, Math.PI * 2);
  g.fillStyle = tint === TN.black ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)'; g.fill();
};
PAINT[SH.ring] = (g, col, edge) => {
  // a brushed ring: thicker on one side, a dry gap
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.arc(0, 0, 28.5 + k * 0.9, 0.25 + k * 0.4, Math.PI * 2 - 0.2 + k * 0.1);
    g.strokeStyle = col; g.globalAlpha = k === 0 ? 0.95 : 0.45; g.lineWidth = k === 0 ? 2.6 : 1.1; g.stroke();
  }
  g.globalAlpha = 1;
  if (edge) { g.beginPath(); g.arc(0, 0, 30.8, 0, Math.PI * 2); g.strokeStyle = edge; g.lineWidth = 0.4; g.stroke(); }
};
PAINT[SH.flare] = (g, col) => {
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 15.5);
  gr.addColorStop(0, col); gr.addColorStop(0.35, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.globalAlpha = 0.95;
  g.beginPath(); g.arc(0, 0, 15.5, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
};
PAINT[SH.swipe] = (g, col, _edge, frame) => {
  // a brush crescent swung counter-clockwise → clockwise about the origin, ±62° around +x.
  // Frames 0–3 reveal it (the head leads, thick and wet); frame 4 is the dry follow-through.
  const R = 100, A0 = -1.08, A1 = 1.08;
  const reveal = [0.34, 0.62, 0.86, 1, 1][frame] ?? 1;
  const dry = frame === 4;
  const a1 = A0 + (A1 - A0) * reveal;
  const N = 28;
  for (let pass = 0; pass < (dry ? 2 : 3); pass++) {
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = A0 + (a1 - A0) * u;
      // thickness swells toward the head
      const th = (dry ? 5 : 9) * (0.25 + 0.75 * Math.pow(u, 0.8)) * (1 - pass * 0.3);
      const rr = R + (pass - 1) * 4 + Math.sin(u * 9 + pass) * 0.8;
      const x = Math.cos(a) * (rr + th), y = Math.sin(a) * (rr + th);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N, a = A0 + (a1 - A0) * u;
      const th = (dry ? 3.5 : 6.5) * (0.25 + 0.75 * Math.pow(u, 0.8)) * (1 - pass * 0.3);
      const rr = R + (pass - 1) * 4;
      g.lineTo(Math.cos(a) * (rr - th), Math.sin(a) * (rr - th));
    }
    g.closePath();
    g.fillStyle = col;
    g.globalAlpha = dry ? 0.35 - pass * 0.1 : pass === 1 ? 0.85 : 0.35;
    g.fill();
  }
  g.globalAlpha = 1;
  // 飞白: paper-coloured hairs through the stroke
  g.strokeStyle = 'rgba(244,239,228,0.6)'; g.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.arc(0, 0, R - 3 + k * 3, A0 + 0.15 + k * 0.12, A0 + (a1 - A0) * (0.7 - k * 0.12));
    g.stroke();
  }
  if (!dry) {
    // the wet head
    g.beginPath(); g.arc(Math.cos(a1) * (R + 1), Math.sin(a1) * (R + 1), 6, 0, Math.PI * 2);
    g.fillStyle = col; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
  }
};
PAINT[SH.puff] = (g, col) => {
  const gr = g.createRadialGradient(0, 0, 1, 0, 0, 8.5);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(244,239,228,0)');
  g.fillStyle = gr;
  blobPath(g, 0, 0, 8.4, 7.6, 11, 0.3);
  g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
};
PAINT[SH.glint] = (g, col, edge) => {
  g.strokeStyle = edge ?? 'rgba(27,25,22,0.4)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-6.4, 0); g.lineTo(6.4, 0); g.moveTo(0, -6.4); g.lineTo(0, 6.4); g.stroke();
  g.strokeStyle = col; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.moveTo(0, -6); g.lineTo(0, 6); g.stroke();
  g.beginPath(); g.moveTo(-3, -3); g.lineTo(3, 3); g.moveTo(3, -3); g.lineTo(-3, 3); g.lineWidth = 0.5; g.stroke();
  g.beginPath(); g.arc(0, 0, 1.5, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
};
PAINT[SH.blot] = (g, col, edge) => {
  blobPath(g, 0, 0, 5.2, 4.6, 7, 0.55, 14);
  g.fillStyle = col; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1; outline(g, edge);
  for (let i = 0; i < 3; i++) { const a = h01(9, i) * 6.28, rr = 5.6 + h01(10, i) * 1.2; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.7 + h01(11, i) * 0.6, 0, 6.29); g.fill(); }
};
PAINT[SH.crown] = (g, col) => {
  // the death splash: a wet ring breaking into radial spikes and flung dots
  g.fillStyle = col;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + h01(21, i) * 0.3;
    const r0 = 13, r1 = 20 + h01(22, i) * 9;
    const wd = 0.13 + h01(23, i) * 0.08;
    g.beginPath();
    g.moveTo(Math.cos(a - wd) * r0, Math.sin(a - wd) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.lineTo(Math.cos(a + wd) * r0, Math.sin(a + wd) * r0);
    g.closePath();
    g.globalAlpha = 0.8; g.fill();
    if (h01(24, i) > 0.4) { const rr = r1 + 2 + h01(25, i) * 5; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1 + h01(26, i) * 1.3, 0, 6.29); g.fill(); }
  }
  g.globalAlpha = 0.55;
  g.beginPath(); g.arc(0, 0, 13.5, 0, Math.PI * 2); g.lineWidth = 3.2; g.strokeStyle = col; g.stroke();
  g.globalAlpha = 1;
};
PAINT[SH.claw] = (g, col, edge) => {
  g.strokeStyle = col; g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    const y = (k - 1) * 4.6;
    g.moveTo(-9, y + 3); g.quadraticCurveTo(0, y - 1.2, 9.5, y - 3);
    g.lineWidth = 1.9 - Math.abs(k - 1) * 0.4; g.stroke();
  }
  if (edge) outline(g, edge, 0.3);
};
PAINT[SH.note] = (g, col, edge) => {
  g.fillStyle = col;
  g.beginPath(); g.ellipse(-1.2, 3, 2.4, 1.7, -0.4, 0, Math.PI * 2); g.fill(); outline(g, edge, 0.4);
  g.fillRect(0.9, -4.6, 0.9, 7.8);
  g.beginPath(); g.moveTo(1.8, -4.6); g.quadraticCurveTo(4.6, -3.4, 3.8, -0.8); g.lineWidth = 0.9; g.strokeStyle = col; g.stroke();
};


// ── the luminous hit marks: a class-coloured glow, a white core, an ink hairline between them

/** `#rrggbb` → `rgba(r,g,b,a)`. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const HAIR = 'rgba(20,18,16,0.6)';
/** A tapered sliver along x from −L to +L (bowed by `bow` toward −y), half-width `th` at its middle. */
function sliver(g: CanvasRenderingContext2D, L: number, bow: number, th: number, head = 0): void {
  const N = 22;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    // the thickest point leans toward the head (+x) when `head` > 0
    const k = Math.pow(Math.max(0, 1 - u * u), 0.75) * (1 + head * u);
    const y = -bow * (1 - u * u) - th * k;
    if (i === 0) g.moveTo(u * L, y); else g.lineTo(u * L, y);
  }
  for (let i = N; i >= 0; i--) {
    const u = -1 + (2 * i) / N;
    const k = Math.pow(Math.max(0, 1 - u * u), 0.75) * (1 + head * u);
    g.lineTo(u * L, -bow * (1 - u * u) + th * k * 0.7);
  }
  g.closePath();
}
PAINT[SH.star] = (g, _col, _edge, _f, tint) => {
  const glow = GLOW_HEX[tint] ?? GLOW_HEX[TN.white];
  // the soft glow, longer along the blow
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 22);
  gr.addColorStop(0, rgba(glow, 0.8)); gr.addColorStop(0.3, rgba(glow, 0.42)); gr.addColorStop(1, rgba(glow, 0));
  g.save(); g.scale(1, 0.7); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill(); g.restore();
  // the four points (concave sides), long along x; a thinner cross at 45°
  const star = (a: number, b: number, w: number) => {
    g.beginPath();
    g.moveTo(a, 0); g.quadraticCurveTo(w, w, 0, b); g.quadraticCurveTo(-w, w, -a, 0);
    g.quadraticCurveTo(-w, -w, 0, -b); g.quadraticCurveTo(w, -w, a, 0); g.closePath();
  };
  g.save(); g.rotate(Math.PI / 4); star(9, 9, 1.1); g.fillStyle = rgba(glow, 0.85); g.fill(); g.restore();
  star(22, 8.5, 2.2);
  g.lineJoin = 'round'; g.strokeStyle = HAIR; g.lineWidth = 1; g.stroke();
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, 20);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.28, '#ffffff'); sg.addColorStop(0.62, glow); sg.addColorStop(1, glow);
  g.fillStyle = sg; g.fill();
  g.beginPath(); g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
};
PAINT[SH.cut] = (g, _col, _edge, _f, tint) => {
  const glow = GLOW_HEX[tint] ?? GLOW_HEX[TN.white];
  // the glow band, the ink hairline, the white edge of the blade's path
  sliver(g, 31, 3.2, 6.2); g.fillStyle = rgba(glow, 0.42); g.fill();
  sliver(g, 30, 3.2, 2.9); g.fillStyle = glow; g.fill(); g.strokeStyle = HAIR; g.lineWidth = 0.7; g.stroke();
  sliver(g, 27, 3.2, 1.25); g.fillStyle = '#ffffff'; g.fill();
};
PAINT[SH.beam] = (g, _col, _edge, _f, tint) => {
  const glow = GLOW_HEX[tint] ?? GLOW_HEX[TN.white];
  // a straight light-lance (流光): bright at its head (+x), fading to nothing behind
  const lin = (a: number) => {
    const gr = g.createLinearGradient(-31.5, 0, 31.5, 0);
    gr.addColorStop(0, rgba(glow, 0)); gr.addColorStop(0.55, rgba(glow, a * 0.6)); gr.addColorStop(0.9, rgba(glow, a)); gr.addColorStop(1, rgba(glow, a));
    return gr;
  };
  g.save(); g.translate(-20, 0);
  sliver(g, 31.5, 0, 2.8, 0.6); g.fillStyle = lin(0.5); g.fill();
  sliver(g, 30.5, 0, 1.3, 0.65); g.fillStyle = lin(1); g.fill();
  const core = g.createLinearGradient(-28, 0, 28, 0);
  core.addColorStop(0, 'rgba(255,255,255,0)'); core.addColorStop(0.6, 'rgba(255,255,255,0.7)'); core.addColorStop(1, '#ffffff');
  sliver(g, 28, 0, 0.6, 0.7); g.fillStyle = core; g.fill();
  g.restore();
  // an ink hairline under the bright head only (the tail stays pure light)
  g.beginPath(); g.moveTo(-6, -1.9); g.lineTo(9.8, -0.5); g.moveTo(-6, 1.9); g.lineTo(9.8, 0.5);
  g.strokeStyle = 'rgba(20,18,16,0.35)'; g.lineWidth = 0.4; g.stroke();
  g.beginPath(); g.arc(8.4, 0, 1.3, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
};
PAINT[SH.halo] = (g, _col, _edge, _f, tint) => {
  const glow = GLOW_HEX[tint] ?? GLOW_HEX[TN.white];
  // a thin bright band (not a disc: a ring of light, not a bubble)
  const gr = g.createRadialGradient(0, 0, 22, 0, 0, 31.5);
  gr.addColorStop(0, rgba(glow, 0)); gr.addColorStop(0.5, rgba(glow, 0.8)); gr.addColorStop(0.68, 'rgba(255,255,255,0.98)');
  gr.addColorStop(0.8, rgba(glow, 0.85)); gr.addColorStop(1, rgba(glow, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 31.5, 0, Math.PI * 2); g.fill();
  // an ink hairline just outside the bright band: the ring reads on pale paper
  g.beginPath(); g.arc(0, 0, 29.4, 0, Math.PI * 2); g.strokeStyle = 'rgba(20,18,16,0.32)'; g.lineWidth = 0.6; g.stroke();
};
PAINT[SH.ember] = (g, _col, _edge, _f, tint) => {
  const glow = GLOW_HEX[tint] ?? GLOW_HEX[TN.white];
  g.save(); g.translate(-7, 0);
  sliver(g, 14, 0, 1.6, 0.7); g.fillStyle = rgba(glow, 0.9); g.fill(); g.strokeStyle = 'rgba(20,18,16,0.45)'; g.lineWidth = 0.35; g.stroke();
  sliver(g, 12.5, 0, 0.6, 0.7); g.fillStyle = '#ffffff'; g.fill();
  g.restore();
};
PAINT[SH.rake] = (g, _col, _edge, _f, tint) => {
  const glow = GLOW_HEX[tint] ?? GLOW_HEX[TN.white];
  // three scratches, raked slightly apart and askew
  for (let k = 0; k < 3; k++) {
    g.save(); g.translate((k - 1) * 2.5, (k - 1) * 6.2); g.rotate(-0.12 + k * 0.06);
    const L = 19 - Math.abs(k - 1) * 3;
    sliver(g, L, 1.6, 2.4); g.fillStyle = rgba(glow, 0.45); g.fill();
    sliver(g, L - 1, 1.6, 1.05); g.fillStyle = glow; g.fill(); g.strokeStyle = HAIR; g.lineWidth = 0.45; g.stroke();
    sliver(g, L - 3, 1.6, 0.45); g.fillStyle = '#ffffff'; g.fill();
    g.restore();
  }
};
PAINT[SH.shard] = (g, col) => {
  g.beginPath(); g.moveTo(-5.4, -1.8); g.lineTo(-0.8, -4.4); g.lineTo(5.6, -1.2); g.lineTo(2.2, 4.2); g.lineTo(-4.2, 3.2); g.closePath();
  g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(244,239,228,0.55)'; g.lineWidth = 0.5; g.stroke();
};
PAINT[SH.splat] = (g, col) => {
  // a wet blot where the blow landed, droplets and streaks flung on along +x
  g.fillStyle = col;
  blobPath(g, 0, 0, 7.4, 6.2, 31, 0.5, 16); g.globalAlpha = 0.88; g.fill();
  for (let i = 0; i < 7; i++) {
    const a = (h01(32, i) - 0.5) * 1.3, d = 9 + h01(33, i) * 25, rr = Math.max(0.7, 2.9 - d * 0.075) * (0.7 + h01(34, i) * 0.6);
    g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, Math.PI * 2); g.globalAlpha = 0.82; g.fill();
  }
  for (let i = 0; i < 3; i++) {
    const a = (h01(35, i) - 0.5) * 0.9, L = 14 + h01(36, i) * 14, w = 1.5 - i * 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    g.beginPath(); g.moveTo(c * 5 - s * w, s * 5 + c * w); g.lineTo(c * (5 + L), s * (5 + L)); g.lineTo(c * 5 + s * w, s * 5 - c * w); g.closePath();
    g.globalAlpha = 0.8; g.fill();
  }
  g.globalAlpha = 1;
};

/** The combos the engine uses, baked at the wave start (≈ 60 small cells). */
export const WARM: readonly (readonly [number, number])[] = [
  [SH.dot, TN.ink], [SH.drop, TN.ink], [SH.streak, TN.ink], [SH.streak, TN.azure], [SH.streak, TN.indigo], [SH.streak, TN.jade],
  [SH.streak, TN.moon], [SH.streak, TN.gold], [SH.streak, TN.wine], [SH.streak, TN.gamboge], [SH.streak, TN.green],
  [SH.feather, TN.paper], [SH.feather, TN.grey], [SH.spark, TN.gamboge], [SH.spark, TN.gold], [SH.spark, TN.white], [SH.chip, TN.jade],
  [SH.stone, TN.black], [SH.stone, TN.white], [SH.ring, TN.ink], [SH.ring, TN.azure], [SH.ring, TN.gold], [SH.ring, TN.green], [SH.ring, TN.moon],
  [SH.flare, TN.white], [SH.flare, TN.gold], [SH.swipe, TN.azure], [SH.swipe, TN.ink], [SH.swipe, TN.wine], [SH.puff, TN.paper], [SH.puff, TN.grey],
  [SH.glint, TN.moon], [SH.glint, TN.gold], [SH.blot, TN.ink], [SH.blot, TN.indigo], [SH.drop, TN.wine], [SH.dot, TN.wine], [SH.crown, TN.ink],
  [SH.claw, TN.ink], [SH.claw, TN.wine], [SH.note, TN.green], [SH.dot, TN.indigo], [SH.drop, TN.indigo],
  // the hit marks
  [SH.star, TN.azure], [SH.star, TN.jade], [SH.star, TN.gold], [SH.star, TN.gamboge], [SH.star, TN.indigo], [SH.star, TN.moon],
  [SH.star, TN.white], [SH.star, TN.wine], [SH.star, TN.green],
  [SH.cut, TN.azure], [SH.cut, TN.white], [SH.cut, TN.gold], [SH.cut, TN.wine], [SH.beam, TN.jade], [SH.beam, TN.azure], [SH.beam, TN.gold],
  [SH.beam, TN.moon], [SH.halo, TN.azure], [SH.halo, TN.gold], [SH.halo, TN.white], [SH.halo, TN.jade], [SH.halo, TN.wine],
  [SH.halo, TN.indigo], [SH.halo, TN.moon], [SH.halo, TN.green], [SH.splat, TN.ink], [SH.splat, TN.indigo], [SH.splat, TN.wine], [SH.shard, TN.ink],
  [SH.ember, TN.azure], [SH.ember, TN.jade], [SH.ember, TN.gold], [SH.ember, TN.gamboge], [SH.ember, TN.moon], [SH.ember, TN.white],
  [SH.ember, TN.indigo], [SH.ember, TN.green], [SH.rake, TN.white], [SH.rake, TN.moon],
  // the marks in the light of the weapon that struck, and what flies off a blow (engine/vfx.ts impact)
  [SH.cut, TN.jade], [SH.cut, TN.gamboge], [SH.cut, TN.moon], [SH.cut, TN.indigo], [SH.cut, TN.green],
  [SH.beam, TN.gamboge], [SH.beam, TN.wine], [SH.beam, TN.green], [SH.beam, TN.indigo], [SH.halo, TN.gamboge],
  [SH.ember, TN.wine], [SH.glint, TN.white], [SH.glint, TN.green], [SH.glint, TN.jade], [SH.rake, TN.azure],
];
