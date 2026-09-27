// 水月幻镜 · impact sprites (打击感): the small baked pieces the engine's feel layer throws around —
// ink droplets and spatter streaks, feathers, talisman sparks, jade chips, go-stone chips, impact
// rings and flares, the brush-stroke swipe of a melee swing (5 reveal frames), the death crown, the
// muzzle puff and the moon glint. Painted once with plain Canvas 2D (gradients only here, at bake
// time), lazily per (shape, tint) into shelf-packed pages; the frame loop only calls drawImage.
// Colours follow the readability grammar: player-side effects are ink and pale class washes; no
// sprite here is vermilion (danger stays the enemy's colour). Node-safe: without a document every
// lookup is null and the engine falls back to the painter's fx.
import type { Sprite } from '../types';

/** Shapes. */
export const SH = {
  dot: 0, drop: 1, streak: 2, feather: 3, spark: 4, chip: 5, stone: 6, ring: 7, flare: 8, swipe: 9, puff: 10, glint: 11, blot: 12,
  crown: 13, claw: 14, note: 15,
} as const;
/** Tints. */
export const TN = {
  ink: 0, azure: 1, indigo: 2, gamboge: 3, green: 4, moon: 5, wine: 6, jade: 7, white: 8, gold: 9, paper: 10, grey: 11, black: 12,
} as const;
const TINT_HEX = ['#1b1916', '#3f7fa6', '#2f4d73', '#d9a520', '#6fa87c', '#eef3f8', '#7a2640', '#5fae8e', '#ffffff', '#e7b547', '#f4efe4', '#6d6a63', '#141414'];
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
];

/** Page size (px). Small on purpose: drawing from a 512²-or-larger extra canvas forces a flush of the
 *  frame's canvas each frame at phone DPR (≈ 20 ms for 30 draws at DPR 2); 256² pages cost nothing. */
const PAGE = 256;
/** Resolution factor per shape (big soft washes need fewer pixels). */
const RES_K: Partial<Record<number, number>> = { [SH.swipe]: 0.45, [SH.ring]: 0.8, [SH.crown]: 0.8 };

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
  /** Device px per world u at bake time. */
  private res: number;

  constructor(dpr: number, pxPerU = 1) {
    this.res = Math.max(1, Math.min(2, dpr)) * pxPerU;
    this.ok = typeof document !== 'undefined';
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
    const r = this.res * (RES_K[shape] ?? 1);
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

/** The combos the engine uses, baked at the wave start (≈ 60 small cells). */
export const WARM: readonly (readonly [number, number])[] = [
  [SH.dot, TN.ink], [SH.drop, TN.ink], [SH.streak, TN.ink], [SH.streak, TN.azure], [SH.streak, TN.indigo], [SH.streak, TN.jade],
  [SH.streak, TN.moon], [SH.streak, TN.gold], [SH.streak, TN.wine], [SH.streak, TN.gamboge], [SH.streak, TN.green],
  [SH.feather, TN.paper], [SH.feather, TN.grey], [SH.spark, TN.gamboge], [SH.spark, TN.gold], [SH.spark, TN.white], [SH.chip, TN.jade],
  [SH.stone, TN.black], [SH.stone, TN.white], [SH.ring, TN.ink], [SH.ring, TN.azure], [SH.ring, TN.gold], [SH.ring, TN.green], [SH.ring, TN.moon],
  [SH.flare, TN.white], [SH.flare, TN.gold], [SH.swipe, TN.azure], [SH.swipe, TN.ink], [SH.swipe, TN.wine], [SH.puff, TN.paper], [SH.puff, TN.grey],
  [SH.glint, TN.moon], [SH.glint, TN.gold], [SH.blot, TN.ink], [SH.blot, TN.indigo], [SH.drop, TN.wine], [SH.dot, TN.wine], [SH.crown, TN.ink],
  [SH.claw, TN.ink], [SH.claw, TN.wine], [SH.note, TN.green], [SH.dot, TN.indigo], [SH.drop, TN.indigo],
];
