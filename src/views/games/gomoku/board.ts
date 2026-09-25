// The painted 五子棋 board: pale 榧木 (kaya) wood with a quiet grain, an ink grid with nine star
// points, slate-black and clam-shell-white stones with soft shadows, a cinnabar dot on the last
// move, and a cinnabar brush stroke through the winning line.
//
// Everything static (wood + grid + coordinates) is cached per size; stones are cached sprites.
// Per frame: one blit, ≤ 225 sprite blits, and whatever is animating.
import { N, CELLS, BLACK, STAR_POINTS, colOf, rowOf, colorOfMove, idx, type Color } from './engine';
import { makeNoise2, makeRng, clamp } from '../../../core/rng';
import { paintStroke } from '../../../ink/brush';
import { PIGMENTS, type Stroke } from '../../../ink/types';

export interface Geom {
  /** css px edge of the square board canvas */
  size: number;
  dpr: number;
  /** css px from the canvas edge to the outer grid line */
  margin: number;
  /** css px between lines */
  gap: number;
}

export function geom(size: number, dpr: number): Geom {
  const gap = size / (N - 1 + 2 * 0.95);
  return { size, dpr, gap, margin: gap * 0.95 };
}

export function cellXY(g: Geom, i: number): { x: number; y: number } {
  return { x: g.margin + colOf(i) * g.gap, y: g.margin + rowOf(i) * g.gap };
}

/** Nearest intersection to a css-px point, or -1 when off the board (more than half a gap away). */
export function hitTest(g: Geom, px: number, py: number): number {
  const x = Math.round((px - g.margin) / g.gap), y = Math.round((py - g.margin) / g.gap);
  if (x < 0 || y < 0 || x >= N || y >= N) return -1;
  const dx = px - (g.margin + x * g.gap), dy = py - (g.margin + y * g.gap);
  return dx * dx + dy * dy <= (g.gap * 0.62) ** 2 ? idx(x, y) : -1;
}

export interface Ghost {
  cell: number;
  color: Color;
  kind: 'hover' | 'touch' | 'key' | 'hint';
}

export interface DrawState {
  moves: readonly number[];
  /** performance.now() when the last stone was placed (drop animation). */
  dropAt: number;
  ghost: Ghost | null;
  /** a suggested move (提示), drawn as a pale breathing stone */
  hint: Ghost | null;
  /** keyboard cursor (drawn only when the board has keyboard focus) */
  cursor: number;
  showCursor: boolean;
  win: { line: number[]; at: number } | null;
  reduced: boolean;
}

const INK = '#241c14';
const DROP_MS = 230;
const WIN_MS = 760;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class BoardPainter {
  private ctx: CanvasRenderingContext2D;
  g: Geom = geom(300, 1);
  private base: HTMLCanvasElement | null = null;
  private sprites: { black: HTMLCanvasElement; white: HTMLCanvasElement[]; shadow: HTMLCanvasElement; r: number } | null = null;
  private winLayer: HTMLCanvasElement | null = null;
  private winKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Repaint the static layer on the next resize() (e.g. once fonts have loaded). */
  invalidate() {
    this.base = null;
  }

  resize(size: number, dpr: number) {
    const s = Math.max(120, Math.floor(size));
    if (this.g.size === s && this.g.dpr === dpr && this.base) return;
    this.g = geom(s, dpr);
    this.canvas.width = Math.round(s * dpr);
    this.canvas.height = Math.round(s * dpr);
    this.base = paintBase(this.g);
    this.sprites = makeSprites(this.g);
    this.winLayer = null;
    this.winKey = '';
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

    const last = st.moves.length - 1;
    const r = sp.r;
    const dropT = st.reduced ? 1 : clamp((now - st.dropAt) / DROP_MS, 0, 1);
    if (dropT < 1) animating = true;

    // shadows first (so a stone never shadows onto its neighbour's face)
    for (let i = 0; i <= last; i++) {
      const { x, y } = cellXY(g, st.moves[i]);
      let lift = 0;
      if (i === last && dropT < 1) lift = 1 - easeOut(dropT);
      const off = r * (0.1 + 0.55 * lift);
      ctx.globalAlpha = 1 - 0.55 * lift;
      const s = sp.shadow;
      const w = s.width / dpr;
      ctx.drawImage(s, x - w / 2 + off * 0.7, y - w / 2 + off, w, w);
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i <= last; i++) {
      const cell = st.moves[i];
      const { x, y } = cellXY(g, cell);
      const col = colorOfMove(i);
      const img = col === BLACK ? sp.black : sp.white[cell % sp.white.length];
      let k = 1, a = 1;
      if (i === last && dropT < 1) {
        // falls in from a hair above, lands, and settles by a breath
        const e = easeOut(Math.min(1, dropT / 0.75));
        k = 1.12 - 0.12 * e - 0.015 * Math.sin(Math.PI * clamp((dropT - 0.6) / 0.4, 0, 1));
        a = clamp(dropT / 0.3, 0, 1);
      }
      const w = (img.width / dpr) * k;
      ctx.globalAlpha = a;
      ctx.drawImage(img, x - w / 2, y - w / 2, w, w);
    }
    ctx.globalAlpha = 1;

    // last-move mark
    if (last >= 0) {
      const { x, y } = cellXY(g, st.moves[last]);
      const a = st.reduced ? 1 : clamp((now - st.dropAt - DROP_MS * 0.6) / 200, 0, 1);
      if (a < 1) animating = true;
      ctx.globalAlpha = a;
      ctx.fillStyle = colorOfMove(last) === BLACK ? '#cf4a35' : '#b93a2b';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, r * 0.19), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // hint, then the ghost under the pointer, then the keyboard cursor
    if (st.hint && (!st.ghost || st.ghost.cell !== st.hint.cell)) animating = this.drawGhost(st.hint, st, now) || animating;
    if (st.ghost) this.drawGhost(st.ghost, st, now);
    if (st.showCursor && st.cursor >= 0) {
      const { x, y } = cellXY(g, st.cursor);
      const h = g.gap * 0.5, l = g.gap * 0.2;
      ctx.strokeStyle = '#b93a2b';
      ctx.lineWidth = Math.max(1.5, g.gap * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(x + sx * h, y + sy * (h - l));
        ctx.lineTo(x + sx * h, y + sy * h);
        ctx.lineTo(x + sx * (h - l), y + sy * h);
      }
      ctx.stroke();
    }

    // the winning line: one cinnabar brush stroke
    if (st.win && st.win.line.length >= 2) {
      const p = st.reduced ? 1 : clamp((now - st.win.at) / WIN_MS, 0, 1);
      const key = st.win.line.join(',') + '|' + g.size + '|' + dpr;
      const stroke = winStroke(g, st.win.line);
      if (p >= 1) {
        if (this.winKey !== key) {
          this.winLayer = document.createElement('canvas');
          this.winLayer.width = this.canvas.width;
          this.winLayer.height = this.canvas.height;
          const wc = this.winLayer.getContext('2d')!;
          wc.setTransform(dpr, 0, 0, dpr, 0, 0);
          paintStroke(wc, stroke, { scale: 1 });
          this.winKey = key;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (this.winLayer) ctx.drawImage(this.winLayer, 0, 0);
      } else {
        animating = true;
        paintStroke(ctx, stroke, { scale: 1, progress: 1 - (1 - p) ** 2 });
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return animating;
  }

  private drawGhost(gh: Ghost, st: DrawState, now: number): boolean {
    const { ctx, g } = this;
    const sp = this.sprites!;
    if (gh.cell < 0 || gh.cell >= CELLS) return false;
    const { x, y } = cellXY(g, gh.cell);
    const r = sp.r;
    let animating = false;
    if (gh.kind === 'touch') {
      // the finger hides the stone: show the row and column it will land on
      ctx.strokeStyle = 'rgba(185,58,43,0.55)';
      ctx.lineWidth = Math.max(1, g.gap * 0.06);
      ctx.beginPath();
      ctx.moveTo(g.margin, y);
      ctx.lineTo(g.margin + (N - 1) * g.gap, y);
      ctx.moveTo(x, g.margin);
      ctx.lineTo(x, g.margin + (N - 1) * g.gap);
      ctx.stroke();
    }
    const img = gh.color === BLACK ? sp.black : sp.white[0];
    const w = img.width / g.dpr;
    let a = gh.kind === 'hint' ? 0.4 : gh.kind === 'touch' ? 0.62 : 0.45;
    if (gh.kind === 'hint' && !st.reduced) {
      a = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(now / 480));
      animating = true;
    }
    ctx.globalAlpha = a;
    ctx.drawImage(img, x - w / 2, y - w / 2, w, w);
    ctx.globalAlpha = 1;
    if (gh.kind === 'hint') {
      ctx.strokeStyle = 'rgba(185,58,43,0.8)';
      ctx.lineWidth = Math.max(1, g.gap * 0.055);
      ctx.setLineDash([g.gap * 0.14, g.gap * 0.12]);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return animating;
  }
}

function winStroke(g: Geom, line: number[]): Stroke {
  const a = cellXY(g, line[0]), b = cellXY(g, line[line.length - 1]);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const ext = g.gap * 0.45;
  const x0 = a.x - ux * ext, y0 = a.y - uy * ext;
  const L = len + 2 * ext;
  const rng = makeRng(line[0] * 31 + line.length);
  const bow = g.gap * 0.12 * (rng() < 0.5 ? -1 : 1);
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = bow * Math.sin(Math.PI * t) + g.gap * 0.03 * Math.sin(t * 9 + rng() * 2);
    // 起笔 heavy, a steady body, 收笔 lifting to a dry tip
    const w = g.gap * (t < 0.08 ? 0.4 + t * 1.5 : 0.52 - 0.14 * t - (t > 0.82 ? (t - 0.82) * 2 : 0));
    pts.push({ x: x0 + ux * L * t - uy * off, y: y0 + uy * L * t + ux * off, w: Math.max(g.gap * 0.04, w) });
  }
  return { kind: 'brush', pts, tone: 0.9, color: PIGMENTS.cinnabar, birth: 0, seed: 7 + line[0], wet: 0.35, dryness: 0.55 };
}

// ─── static layers ─────────────────────────────────────────────────────────────────────────────

function paintBase(g: Geom): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const W = Math.round(g.size * g.dpr);
  c.width = c.height = W;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  paintWood(ctx, g.size, 11);
  paintGrid(ctx, g);
  return c;
}

/** Pale kaya wood: a warm gold, fine wavering grain, a few broad soft bands, gentle vignette. */
export function paintWood(ctx: CanvasRenderingContext2D, S: number, seed: number, H = S) {
  const lg = ctx.createLinearGradient(0, 0, S, H);
  lg.addColorStop(0, '#e9cd95');
  lg.addColorStop(0.55, '#e2c083');
  lg.addColorStop(1, '#d7b173');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, S, H);
  const nz = makeNoise2(seed);
  const rng = makeRng(seed * 7 + 1);
  // broad soft bands (growth rings seen edge-on)
  for (let i = 0; i < 9; i++) {
    const y0 = rng() * H;
    const w = H * (0.015 + rng() * 0.05);
    ctx.fillStyle = `rgba(${150 + rng() * 30 | 0},${95 + rng() * 25 | 0},40,${0.035 + rng() * 0.05})`;
    ctx.beginPath();
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const x = (s / steps) * S;
      const y = y0 + nz.fbm(x / S * 1.6, i * 0.7, 2) * H * 0.05;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let s = steps; s >= 0; s--) {
      const x = (s / steps) * S;
      const y = y0 + w + nz.fbm(x / S * 1.6 + 3, i * 0.7, 2) * H * 0.05;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // fine grain lines
  const lines = Math.round(H / 2.6);
  for (let i = 0; i < lines; i++) {
    const y0 = (i / lines) * H + rng() * 2;
    const a = 0.02 + rng() * rng() * 0.09;
    ctx.strokeStyle = `rgba(${120 + rng() * 40 | 0},${75 + rng() * 25 | 0},${30 + rng() * 15 | 0},${a.toFixed(3)})`;
    ctx.lineWidth = 0.35 + rng() * rng() * 1.3;
    ctx.beginPath();
    const steps = 16;
    const x0 = rng() < 0.3 ? rng() * S * 0.5 : -2;
    const x1 = rng() < 0.3 ? S * (0.5 + rng() * 0.5) : S + 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + nz.fbm(x / S * 2.2, y0 / H * 5, 3) * H * 0.035;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  // a few pores
  for (let i = 0; i < S * 0.6; i++) {
    ctx.fillStyle = `rgba(110,70,30,${(0.04 + rng() * 0.08).toFixed(3)})`;
    ctx.fillRect(rng() * S, rng() * H, 0.6 + rng(), 0.4);
  }
  // light from the upper left, a soft vignette toward the edges
  const rg = ctx.createRadialGradient(S * 0.35, H * 0.3, 0, S * 0.5, H * 0.5, Math.max(S, H) * 0.78);
  rg.addColorStop(0, 'rgba(255,245,220,0.16)');
  rg.addColorStop(0.6, 'rgba(255,245,220,0)');
  rg.addColorStop(1, 'rgba(90,55,20,0.16)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, H);
}

function paintGrid(ctx: CanvasRenderingContext2D, g: Geom) {
  const { margin: m, gap } = g;
  const end = m + (N - 1) * gap;
  const px = 1 / g.dpr;
  const lw = Math.max(px, Math.round(Math.max(0.7, gap * 0.042) * g.dpr) / g.dpr);
  const snap = (v: number) => (Math.round(v * g.dpr - 0.5) + 0.5) / g.dpr;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 1; i < N - 1; i++) {
    const v = snap(m + i * gap);
    ctx.moveTo(snap(m), v);
    ctx.lineTo(snap(end), v);
    ctx.moveTo(v, snap(m));
    ctx.lineTo(v, snap(end));
  }
  ctx.stroke();
  ctx.lineWidth = lw * 2.2;
  ctx.globalAlpha = 0.88;
  ctx.strokeRect(snap(m), snap(m), snap(end) - snap(m), snap(end) - snap(m));
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = INK;
  for (const s of STAR_POINTS) {
    const { x, y } = cellXY(g, s);
    ctx.beginPath();
    ctx.arc(snap(x), snap(y), Math.max(1.6, gap * (s === idx(7, 7) ? 0.12 : 0.1)), 0, Math.PI * 2);
    ctx.fill();
  }
  // faint coordinates: A–O along the bottom, 1–15 up the left (as on a printed board)
  const fs = Math.max(7, gap * 0.34);
  ctx.globalAlpha = 0.42;
  ctx.font = `${fs}px 'LXGW WenKai', 'Kaiti SC', 'STKaiti', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++) {
    ctx.fillText(String.fromCharCode(65 + i), m + i * gap, end + m * 0.56);
    ctx.fillText(String(N - i), m * 0.44, m + i * gap);
  }
  ctx.restore();
}

function makeSprites(g: Geom) {
  const r = g.gap * 0.475;
  const dpr = g.dpr;
  const R = Math.ceil((r + 2) * dpr);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = R * 2;
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, x, cx: R / dpr, cy: R / dpr };
  };
  // black: matte slate, a soft broad highlight
  const b = mk();
  {
    const { x, cx, cy } = b;
    const gr = x.createRadialGradient(cx - r * 0.36, cy - r * 0.42, r * 0.05, cx, cy, r);
    gr.addColorStop(0, '#5f5c58');
    gr.addColorStop(0.3, '#34312e');
    gr.addColorStop(0.72, '#191816');
    gr.addColorStop(1, '#0c0b0a');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    const hl = x.createRadialGradient(cx - r * 0.34, cy - r * 0.4, 0, cx - r * 0.34, cy - r * 0.4, r * 0.55);
    hl.addColorStop(0, 'rgba(255,250,240,0.2)');
    hl.addColorStop(1, 'rgba(255,250,240,0)');
    x.fillStyle = hl;
    x.fill();
    // warm bounce light from the board along the lower rim
    x.strokeStyle = 'rgba(240,200,140,0.12)';
    x.lineWidth = r * 0.08;
    x.beginPath();
    x.arc(cx, cy, r * 0.93, Math.PI * 0.15, Math.PI * 0.85);
    x.stroke();
  }
  // white: clam shell — creamy, faint curved growth stripes, a crisp little highlight
  const whites: HTMLCanvasElement[] = [];
  for (let v = 0; v < 5; v++) {
    const w = mk();
    const { x, cx, cy } = w;
    const rng = makeRng(90 + v);
    const gr = x.createRadialGradient(cx - r * 0.3, cy - r * 0.36, r * 0.08, cx, cy, r);
    gr.addColorStop(0, '#fffdf8');
    gr.addColorStop(0.55, '#f2eee3');
    gr.addColorStop(0.86, '#e0d9c9');
    gr.addColorStop(1, '#c8bfad');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    x.save();
    x.clip();
    const ang = rng() * Math.PI;
    const far = r * 3.2;
    const ox = cx + Math.cos(ang) * far, oy = cy + Math.sin(ang) * far;
    for (let k = -6; k <= 6; k++) {
      x.strokeStyle = `rgba(150,138,115,${(0.07 + rng() * 0.07).toFixed(3)})`;
      x.lineWidth = r * (0.03 + rng() * 0.04);
      x.beginPath();
      x.arc(ox, oy, far + k * r * 0.17, ang + Math.PI - 0.45, ang + Math.PI + 0.45);
      x.stroke();
    }
    x.restore();
    const hl = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 0, cx - r * 0.35, cy - r * 0.4, r * 0.4);
    hl.addColorStop(0, 'rgba(255,255,255,0.75)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hl;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(110,98,80,0.35)';
    x.lineWidth = Math.max(0.5, r * 0.04);
    x.beginPath();
    x.arc(cx, cy, r - x.lineWidth / 2, 0, Math.PI * 2);
    x.stroke();
    whites.push(w.c);
  }
  // shadow: a blurred dark disc
  const s = document.createElement('canvas');
  const SR = Math.ceil(r * 1.9 * dpr);
  s.width = s.height = SR * 2;
  {
    const x = s.getContext('2d')!;
    const c = SR;
    const gr = x.createRadialGradient(c, c, r * 0.5 * dpr, c, c, r * 1.35 * dpr);
    gr.addColorStop(0, 'rgba(50,30,10,0.42)');
    gr.addColorStop(0.55, 'rgba(50,30,10,0.2)');
    gr.addColorStop(1, 'rgba(50,30,10,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, s.width, s.height);
  }
  return { black: b.c, white: whites, shadow: s, r };
}
