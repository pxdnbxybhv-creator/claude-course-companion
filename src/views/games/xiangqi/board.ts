// The painted 象棋 board: warm boxwood with an ink grid, 楚河 汉界 brushed across the river, the
// palace crosses, the little position marks for cannons and soldiers, and a double frame. Pieces
// are thick wooden discs with an incised ring and a carved character — cinnabar for red, ink for
// black — lifted when chosen, sliding when moved.
//
// Static layers (wood + grid + river + labels) and piece sprites are cached per size and
// orientation; a frame is one blit, ≤ 32 sprite blits and whatever is animating.
import { fileOf, rowOf, sq, sideOf, pieceChar, IN_BOARD, RED, BLACK, type Side } from './engine';
import { makeNoise2, makeRng, clamp } from '../../../core/rng';

/** Horizontal / vertical margins, in grid gaps. */
const MX = 0.72, MY = 0.98;
export const ASPECT = (9 + 2 * MY) / (8 + 2 * MX);

export const PIECE_FONT = "'LXGW WenKai','STKaiti','KaiTi','Kaiti SC','Songti SC',serif";
export const BRUSH_FONT = "'Ma Shan Zheng','LXGW WenKai','STKaiti','KaiTi',serif";
export const PIECE_CHARS = '帅仕相马车炮兵将士象卒';
export const RIVER_CHARS = '楚河汉界';

const INK = '#2a1f15';
const CINNABAR = '#b93a2b';
const RED_CARVE = '#b0301e';
const BLACK_CARVE = '#1d1712';

export interface Geom {
  /** css px */
  w: number;
  h: number;
  dpr: number;
  gap: number;
  /** css px from the canvas edge to the grid's left / top line */
  ox: number;
  oy: number;
  /** black at the bottom */
  flip: boolean;
}

export function geom(width: number, dpr: number, flip: boolean): Geom {
  const gap = width / (8 + 2 * MX);
  return { w: width, h: gap * (9 + 2 * MY), dpr, gap, ox: gap * MX, oy: gap * MY, flip };
}

/** Screen position (css px) of a board square. */
export function pointXY(g: Geom, s: number): { x: number; y: number } {
  let fx = fileOf(s), ry = rowOf(s);
  if (g.flip) {
    fx = 8 - fx;
    ry = 9 - ry;
  }
  return { x: g.ox + fx * g.gap, y: g.oy + ry * g.gap };
}

/** The board square nearest a css-px point, or -1 when off the board. */
export function hitTest(g: Geom, px: number, py: number): number {
  let fx = Math.round((px - g.ox) / g.gap), ry = Math.round((py - g.oy) / g.gap);
  if (fx < 0 || fx > 8 || ry < 0 || ry > 9) return -1;
  const dx = px - (g.ox + fx * g.gap), dy = py - (g.oy + ry * g.gap);
  if (dx * dx + dy * dy > (g.gap * 0.66) ** 2) return -1;
  if (g.flip) {
    fx = 8 - fx;
    ry = 9 - ry;
  }
  return sq(fx, ry);
}

/** Move a square one step on screen (keyboard cursor), staying on the board. */
export function stepOnScreen(g: Geom, s: number, dx: number, dy: number): number {
  const sgn = g.flip ? -1 : 1;
  const x = clamp(fileOf(s) + dx * sgn, 0, 8), y = clamp(rowOf(s) + dy * sgn, 0, 9);
  return sq(x, y);
}

export interface Slide {
  from: number;
  to: number;
  piece: number;
  captured: number;
  at: number;
}

export interface DrawState {
  board: Uint8Array;
  /** the last move, animated if `slide.at` is recent */
  slide: Slide | null;
  lastMove: number;
  selected: number;
  targets: readonly number[];
  /** the general in check (square), or -1 */
  check: number;
  checkAt: number;
  /** the game is over: the check ring (a mated general) stays still instead of pulsing */
  final: boolean;
  hint: number;
  cursor: number;
  showCursor: boolean;
  /** a piece following the mouse */
  drag: { from: number; x: number; y: number } | null;
  /** square under a hovering mouse */
  hover: number;
  reduced: boolean;
}

const SLIDE_MS = 230;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Sprites {
  r: number;
  piece: Map<number, HTMLCanvasElement>;
  shadow: HTMLCanvasElement;
}

export type LabelLang = 'zh' | 'en';

export class BoardPainter {
  private ctx: CanvasRenderingContext2D;
  g: Geom = geom(360, 1, false);
  private lang: LabelLang = 'zh';
  private base: HTMLCanvasElement | null = null;
  private sprites: Sprites | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Repaint cached layers on the next resize() (fonts arrived). */
  invalidate() {
    this.base = null;
    this.sprites = null;
  }

  /** Size the canvas; the file numbers are painted for `lang` (Chinese numerals or WXF digits). */
  resize(width: number, dpr: number, flip: boolean, lang: LabelLang = this.lang) {
    const w = Math.max(160, Math.floor(width));
    const sameSize = this.g.w === w && this.g.dpr === dpr;
    if (sameSize && this.g.flip === flip && this.lang === lang && this.base && this.sprites) return;
    this.g = geom(w, dpr, flip);
    this.lang = lang;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.g.h * dpr);
    this.base = paintBase(this.g, lang);
    if (!sameSize || !this.sprites) this.sprites = makeSprites(this.g.gap, dpr);
  }

  /** Draws one frame; returns true while something is still animating. */
  draw(st: DrawState, now: number): boolean {
    const { ctx, g } = this;
    const sp = this.sprites;
    if (!this.base || !sp) return false;
    const dpr = g.dpr;
    let animating = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = sp.r;

    // last move: where it came from (a faint ring)
    const slide = st.slide;
    const slideT = !slide || st.reduced ? 1 : clamp((now - slide.at) / SLIDE_MS, 0, 1);
    if (slideT < 1) animating = true;
    if (st.lastMove) {
      const { x, y } = pointXY(g, st.lastMove & 255);
      ctx.save();
      ctx.strokeStyle = 'rgba(42,31,21,0.42)';
      ctx.lineWidth = Math.max(1, g.gap * 0.03);
      ctx.setLineDash([g.gap * 0.07, g.gap * 0.07]);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const sliding = slide && slideT < 1 ? slide : null;
    const dragFrom = st.drag ? st.drag.from : -1;
    // shadows, then pieces
    const list: number[] = [];
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 9; x++) {
        const s = sq(x, y);
        if (!st.board[s]) continue;
        if (sliding && s === sliding.to) continue;
        if (s === dragFrom) continue;
        list.push(s);
      }
    const lifted = st.selected >= 0 && !st.drag ? st.selected : -1;
    for (const s of list) {
      const { x, y } = pointXY(g, s);
      const lift = s === lifted ? 1 : 0;
      this.shadow(x, y, lift, 1);
    }
    // a piece being captured fades under the arriving one
    if (sliding && sliding.captured) {
      const { x, y } = pointXY(g, sliding.to);
      const a = 1 - clamp((slideT - 0.55) / 0.45, 0, 1);
      this.shadow(x, y, 0, a);
      this.piece(sliding.captured, x, y, 1, a);
    }
    for (const s of list) {
      const { x, y } = pointXY(g, s);
      if (s === lifted) this.piece(st.board[s], x, y - r * 0.08, 1.05, 1);
      else this.piece(st.board[s], x, y, 1, 1);
    }

    // last move: where it landed (cinnabar corner marks)
    if (st.lastMove && !sliding) {
      const { x, y } = pointXY(g, st.lastMove >> 8);
      corners(ctx, x, y, r * 1.12, r * 0.34, Math.max(1.4, g.gap * 0.045), CINNABAR, 0.9);
    }

    // legal targets: ink dots on empty points, a cinnabar ring round a capturable piece
    for (const t of st.targets) {
      const { x, y } = pointXY(g, t);
      const hot = t === st.hover || (st.drag && hitTest(g, st.drag.x, st.drag.y) === t);
      if (st.board[t]) {
        ctx.strokeStyle = CINNABAR;
        ctx.globalAlpha = hot ? 1 : 0.85;
        ctx.lineWidth = Math.max(1.5, g.gap * (hot ? 0.07 : 0.05));
        ctx.beginPath();
        ctx.arc(x, y, r * 1.06, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = hot ? 'rgba(185,58,43,0.85)' : 'rgba(34,26,18,0.62)';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.5, g.gap * (hot ? 0.14 : 0.1)), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the moving piece, above everything else on the board
    if (sliding) {
      const a = pointXY(g, sliding.from), b = pointXY(g, sliding.to);
      const e = easeOut(slideT);
      const lift = Math.sin(Math.PI * Math.min(1, slideT * 1.1));
      const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
      this.shadow(x, y, lift, 1);
      this.piece(sliding.piece, x, y - r * 0.1 * lift, 1 + 0.06 * lift, 1);
    }

    // the chosen piece: a soft halo ring
    if (lifted >= 0 && st.board[lifted]) {
      const { x, y } = pointXY(g, lifted);
      ctx.strokeStyle = 'rgba(185,58,43,0.75)';
      ctx.lineWidth = Math.max(1.5, g.gap * 0.05);
      ctx.beginPath();
      ctx.arc(x, y - r * 0.08, r * 1.1, 0, Math.PI * 2);
      ctx.stroke();
    }

    // the general in check: a pulsing cinnabar ring (still once the game is over — nothing is
    // happening, so nothing should keep the page repainting)
    if (st.check >= 0 && st.board[st.check]) {
      const { x, y } = pointXY(g, st.check);
      const still = st.reduced || st.final;
      const pulse = still ? 0.8 : 0.55 + 0.35 * (0.5 + 0.5 * Math.sin((now - st.checkAt) / 260));
      if (!still) animating = true;
      ctx.strokeStyle = CINNABAR;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = Math.max(2, g.gap * 0.07);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // a hint: dashed brush path from the piece to its square
    if (st.hint) {
      const a = pointXY(g, st.hint & 255), b = pointXY(g, st.hint >> 8);
      const breath = st.reduced ? 0.8 : 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(now / 420));
      if (!st.reduced) animating = true;
      ctx.save();
      ctx.globalAlpha = breath;
      ctx.strokeStyle = CINNABAR;
      ctx.lineWidth = Math.max(1.5, g.gap * 0.06);
      ctx.lineCap = 'round';
      ctx.setLineDash([g.gap * 0.12, g.gap * 0.1]);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * 1.08, 0, Math.PI * 2);
      ctx.stroke();
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(a.x + ux * r * 1.1, a.y + uy * r * 1.1);
      ctx.lineTo(b.x - ux * r * 0.5, b.y - uy * r * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      // arrow head
      const hx = b.x - ux * r * 0.3, hy = b.y - uy * r * 0.3, hs = r * 0.42;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ux * hs - uy * hs * 0.6, hy - uy * hs + ux * hs * 0.6);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ux * hs + uy * hs * 0.6, hy - uy * hs - ux * hs * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    // the dragged piece follows the pointer
    if (st.drag && st.board[st.drag.from]) {
      this.shadow(st.drag.x, st.drag.y, 1, 1);
      this.piece(st.board[st.drag.from], st.drag.x, st.drag.y - r * 0.12, 1.08, 1);
    }

    // keyboard cursor
    if (st.showCursor && st.cursor >= 0 && IN_BOARD[st.cursor]) {
      const { x, y } = pointXY(g, st.cursor);
      corners(ctx, x, y, g.gap * 0.5, g.gap * 0.18, Math.max(1.5, g.gap * 0.06), CINNABAR, 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return animating;
  }

  private shadow(x: number, y: number, lift: number, alpha: number) {
    const sp = this.sprites!;
    const s = sp.shadow;
    const w = s.width / this.g.dpr;
    const off = sp.r * (0.1 + 0.22 * lift);
    this.ctx.globalAlpha = alpha * (1 - 0.35 * lift);
    this.ctx.drawImage(s, x - w / 2 + off * 0.6, y - w / 2 + off, w, w);
    this.ctx.globalAlpha = 1;
  }

  private piece(p: number, x: number, y: number, k: number, alpha: number) {
    const img = this.sprites!.piece.get(p);
    if (!img) return;
    const w = (img.width / this.g.dpr) * k;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, x - w / 2, y - w / 2, w, w);
    this.ctx.globalAlpha = 1;
  }
}

function corners(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, l: number, lw: number, color: string, alpha: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(x + sx * h, y + sy * (h - l));
    ctx.lineTo(x + sx * h, y + sy * h);
    ctx.lineTo(x + sx * (h - l), y + sy * h);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── static layers ─────────────────────────────────────────────────────────────────────────────

function paintBase(g: Geom, lang: LabelLang): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(g.w * g.dpr);
  c.height = Math.round(g.h * g.dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  paintBoxwood(ctx, g.w, g.h, 29);
  paintGrid(ctx, g, lang);
  return c;
}

/** Warm boxwood (黄杨): honey-gold, a slow straight grain running down the board, a soft vignette. */
export function paintBoxwood(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const lg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  lg.addColorStop(0, '#eed3a0');
  lg.addColorStop(0.5, '#e7c68c');
  lg.addColorStop(1, '#dcb679');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  const nz = makeNoise2(seed);
  const rng = makeRng(seed * 13 + 5);
  // broad soft bands
  for (let i = 0; i < 7; i++) {
    const x0 = rng() * W;
    const w = W * (0.02 + rng() * 0.06);
    ctx.fillStyle = `rgba(${150 + rng() * 30 | 0},${98 + rng() * 25 | 0},42,${(0.03 + rng() * 0.045).toFixed(3)})`;
    ctx.beginPath();
    const steps = 26;
    for (let s = 0; s <= steps; s++) {
      const y = (s / steps) * H;
      const x = x0 + nz.fbm(i * 0.7, (y / H) * 1.4, 2) * W * 0.05;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let s = steps; s >= 0; s--) {
      const y = (s / steps) * H;
      ctx.lineTo(x0 + w + nz.fbm(i * 0.7 + 3, (y / H) * 1.4, 2) * W * 0.05, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // fine grain lines
  const lines = Math.round(W / 2.4);
  for (let i = 0; i < lines; i++) {
    const x0 = (i / lines) * W + rng() * 2;
    const a = 0.018 + rng() * rng() * 0.08;
    ctx.strokeStyle = `rgba(${125 + rng() * 40 | 0},${80 + rng() * 25 | 0},${32 + rng() * 15 | 0},${a.toFixed(3)})`;
    ctx.lineWidth = 0.35 + rng() * rng() * 1.2;
    ctx.beginPath();
    const steps = 18;
    const y0 = rng() < 0.3 ? rng() * H * 0.5 : -2;
    const y1 = rng() < 0.3 ? H * (0.5 + rng() * 0.5) : H + 2;
    for (let s = 0; s <= steps; s++) {
      const y = y0 + ((y1 - y0) * s) / steps;
      const x = x0 + nz.fbm((x0 / W) * 5, (y / H) * 2, 3) * W * 0.03;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < W * 0.5; i++) {
    ctx.fillStyle = `rgba(110,70,30,${(0.04 + rng() * 0.07).toFixed(3)})`;
    ctx.fillRect(rng() * W, rng() * H, 0.4, 0.6 + rng());
  }
  const rg = ctx.createRadialGradient(W * 0.38, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
  rg.addColorStop(0, 'rgba(255,246,222,0.16)');
  rg.addColorStop(0.62, 'rgba(255,246,222,0)');
  rg.addColorStop(1, 'rgba(95,58,22,0.18)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function paintGrid(ctx: CanvasRenderingContext2D, g: Geom, lang: LabelLang) {
  const { ox, oy, gap } = g;
  const px = 1 / g.dpr;
  const snap = (v: number) => (Math.round(v * g.dpr - 0.5) + 0.5) / g.dpr;
  const lw = Math.max(px, Math.round(Math.max(0.7, gap * 0.034) * g.dpr) / g.dpr);
  const X = (i: number) => snap(ox + i * gap);
  const Y = (j: number) => snap(oy + j * gap);
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineCap = 'square';
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let j = 1; j < 9; j++) {
    ctx.moveTo(X(0), Y(j));
    ctx.lineTo(X(8), Y(j));
  }
  for (let i = 1; i < 8; i++) {
    // inner files stop at the river
    ctx.moveTo(X(i), Y(0));
    ctx.lineTo(X(i), Y(4));
    ctx.moveTo(X(i), Y(5));
    ctx.lineTo(X(i), Y(9));
  }
  // the palaces
  ctx.moveTo(X(3), Y(0)); ctx.lineTo(X(5), Y(2));
  ctx.moveTo(X(5), Y(0)); ctx.lineTo(X(3), Y(2));
  ctx.moveTo(X(3), Y(7)); ctx.lineTo(X(5), Y(9));
  ctx.moveTo(X(5), Y(7)); ctx.lineTo(X(3), Y(9));
  ctx.stroke();
  // the border of the field and an outer frame
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = lw * 1.8;
  ctx.strokeRect(X(0), Y(0), X(8) - X(0), Y(9) - Y(0));
  const f = gap * 0.56;
  ctx.lineWidth = lw * 2.6;
  ctx.strokeRect(snap(ox - f), snap(oy - f), X(8) - X(0) + 2 * f, Y(9) - Y(0) + 2 * f);
  ctx.lineWidth = lw * 0.8;
  ctx.globalAlpha = 0.6;
  const f2 = f + gap * 0.09;
  ctx.strokeRect(snap(ox - f2), snap(oy - f2), X(8) - X(0) + 2 * f2, Y(9) - Y(0) + 2 * f2);

  // position marks for the cannons and soldiers
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = lw;
  const d = gap * 0.09, l = gap * 0.2;
  const mark = (i: number, j: number) => {
    const x = ox + i * gap, y = oy + j * gap;
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      if ((i === 0 && sx < 0) || (i === 8 && sx > 0)) continue;
      for (const sy of [-1, 1]) {
        ctx.moveTo(x + sx * (d + l), y + sy * d);
        ctx.lineTo(x + sx * d, y + sy * d);
        ctx.lineTo(x + sx * d, y + sy * (d + l));
      }
    }
    ctx.stroke();
  };
  for (const j of [2, 7]) for (const i of [1, 7]) mark(i, j);
  for (const j of [3, 6]) for (const i of [0, 2, 4, 6, 8]) mark(i, j);

  // 楚河 汉界, brushed across the river, upright for whoever sits at the bottom
  const ry = oy + 4.5 * gap;
  const fs = gap * 0.62;
  ctx.globalAlpha = 0.74;
  ctx.fillStyle = INK;
  ctx.font = `${fs}px ${BRUSH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words: [string, number][] = [['楚', 1.35], ['河', 2.55], ['汉', 5.45], ['界', 6.65]];
  for (const [ch, i] of words) ctx.fillText(ch, ox + i * gap, ry + fs * 0.04);

  // file numbers, each side counting from its own right: red's 九…一 (in English 9…1, as in WXF
  // diagrams, so "C2.5" in the record can be read off the board) and black's 1…9
  const lfs = Math.max(8, gap * 0.28);
  ctx.globalAlpha = 0.5;
  ctx.font = `${lfs}px ${PIECE_FONT}`;
  const bottom: Side = g.flip ? BLACK : RED;
  const top: Side = bottom === RED ? BLACK : RED;
  const label = (side: Side, x: number) => (side === BLACK ? String(x + 1) : lang === 'en' ? String(9 - x) : CN[8 - x]);
  const yb = oy + 9 * gap + (gap * MY + f2) / 2;
  const yt = oy - (gap * MY + f2) / 2;
  for (let sx = 0; sx < 9; sx++) {
    const x = g.flip ? 8 - sx : sx;
    ctx.fillText(label(bottom, x), ox + sx * gap, yb);
    ctx.fillText(label(top, x), ox + sx * gap, yt);
  }
  ctx.restore();
}

// ─── pieces ────────────────────────────────────────────────────────────────────────────────────

function makeSprites(gap: number, dpr: number): Sprites {
  const r = gap * 0.455;
  const piece = new Map<number, HTMLCanvasElement>();
  for (const side of [8, 16])
    for (let t = 1; t <= 7; t++) piece.set(side | t, paintPiece(side | t, r, dpr));
  // shadow: a blurred dark disc
  const s = document.createElement('canvas');
  const SR = Math.ceil(r * 1.8 * dpr);
  s.width = s.height = SR * 2;
  const x = s.getContext('2d')!;
  const gr = x.createRadialGradient(SR, SR, r * 0.55 * dpr, SR, SR, r * 1.32 * dpr);
  gr.addColorStop(0, 'rgba(55,32,10,0.45)');
  gr.addColorStop(0.55, 'rgba(55,32,10,0.2)');
  gr.addColorStop(1, 'rgba(55,32,10,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, s.width, s.height);
  return { r, piece, shadow: s };
}

/** One wooden disc: a darker rim for its thickness, a pale face, an incised ring, a carved character. */
export function paintPiece(p: number, r: number, dpr: number): HTMLCanvasElement {
  const R = Math.ceil((r * 1.08 + 2) * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const x = c.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = R / dpr, cy = R / dpr;
  const red = sideOf(p) === RED;
  const ink = red ? RED_CARVE : BLACK_CARVE;
  const rng = makeRng(p * 7919);

  // the disc's edge (its thickness shows below the face)
  const edge = x.createLinearGradient(0, cy - r, 0, cy + r);
  edge.addColorStop(0, '#c99a5c');
  edge.addColorStop(1, '#8a5a2b');
  x.fillStyle = edge;
  x.beginPath();
  x.arc(cx, cy + r * 0.05, r, 0, Math.PI * 2);
  x.fill();

  // the face
  const fr = r * 0.94;
  const fy = cy - r * 0.02;
  const face = x.createRadialGradient(cx - fr * 0.35, fy - fr * 0.42, fr * 0.05, cx, fy, fr);
  face.addColorStop(0, '#fcf0d2');
  face.addColorStop(0.55, '#f1dcac');
  face.addColorStop(0.9, '#e4c486');
  face.addColorStop(1, '#d4ad6b');
  x.fillStyle = face;
  x.beginPath();
  x.arc(cx, fy, fr, 0, Math.PI * 2);
  x.fill();

  // end grain: faint rings from an off-centre heart
  x.save();
  x.clip();
  const hx = cx + (rng() - 0.5) * fr * 1.6, hy = fy + (rng() - 0.5) * fr * 1.6;
  for (let k = 1; k < 16; k++) {
    x.strokeStyle = `rgba(150,100,45,${(0.035 + rng() * 0.05).toFixed(3)})`;
    x.lineWidth = r * (0.015 + rng() * 0.03);
    x.beginPath();
    x.ellipse(hx, hy, k * fr * 0.16 * (0.9 + rng() * 0.2), k * fr * 0.15, rng() * 0.4, 0, Math.PI * 2);
    x.stroke();
  }
  x.restore();

  // the incised ring: a dark groove, lit on its lower lip
  const rr = fr * 0.8;
  x.lineWidth = Math.max(0.8, r * 0.055);
  x.strokeStyle = 'rgba(255,248,228,0.75)';
  x.beginPath();
  x.arc(cx + 0.25, fy + 0.45, rr, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = ink;
  x.globalAlpha = 0.85;
  x.beginPath();
  x.arc(cx, fy, rr, 0, Math.PI * 2);
  x.stroke();
  x.globalAlpha = 1;

  // the carved character
  const ch = pieceChar(p);
  const fs = r * 1.1;
  x.font = `${fs}px ${PIECE_FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const ty = fy + fs * 0.035;
  x.fillStyle = 'rgba(255,248,228,0.85)';
  x.fillText(ch, cx + 0.35, ty + 0.6);
  x.fillStyle = 'rgba(60,35,10,0.35)';
  x.fillText(ch, cx - 0.35, ty - 0.45);
  x.fillStyle = ink;
  x.strokeStyle = ink;
  x.lineWidth = Math.max(0.4, r * 0.035);
  x.lineJoin = 'round';
  x.strokeText(ch, cx, ty);
  x.fillText(ch, cx, ty);

  // gloss
  const hl = x.createRadialGradient(cx - fr * 0.38, fy - fr * 0.45, 0, cx - fr * 0.38, fy - fr * 0.45, fr * 0.75);
  hl.addColorStop(0, 'rgba(255,252,240,0.32)');
  hl.addColorStop(1, 'rgba(255,252,240,0)');
  x.fillStyle = hl;
  x.beginPath();
  x.arc(cx, fy, fr, 0, Math.PI * 2);
  x.fill();
  // a crisp lip where the face meets the edge
  x.strokeStyle = 'rgba(110,70,30,0.45)';
  x.lineWidth = Math.max(0.5, r * 0.03);
  x.beginPath();
  x.arc(cx, fy, fr, 0, Math.PI * 2);
  x.stroke();
  return c;
}

/** Load the faces the board paints with (resolves when loaded, failed, or unsupported). */
export function boardFontsReady(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return Promise.resolve();
  return Promise.all([
    fonts.load(`40px 'LXGW WenKai'`, PIECE_CHARS + '一二三四五六七八九').catch(() => []),
    fonts.load(`40px 'Ma Shan Zheng'`, RIVER_CHARS + '将').catch(() => []),
  ]).then(() => undefined);
}

