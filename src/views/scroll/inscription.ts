// Brushed text on the painting: fonts, vertical (竖排) columns set right-to-left, seals.
import { makeRng, type Rng } from '../../core/rng';
import { makeSeal } from '../../ink/seal';
import { grainPattern } from '../../ink/paper';
import type { Inscription } from './text';

export interface Fonts {
  brush: string;
  text: string;
  latin: string;
}

function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export function fontStacks(): Fonts {
  return {
    brush: cssVar('--font-brush', "'Ma Shan Zheng', 'KaiTi', serif"),
    text: cssVar('--font-text', "'LXGW WenKai', 'KaiTi', serif"),
    latin: cssVar('--font-latin', "'Cormorant Garamond', Georgia, serif"),
  };
}

const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Make sure the faces we paint with are loaded for these characters (canvas never triggers a
 * web-font download by itself). Gives up quietly after a few seconds — fallbacks are fine.
 */
export async function ensureFonts(text: string, f: Fonts = fontStacks()): Promise<void> {
  const fs = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fs?.load) return;
  const first = (stack: string) => stack.split(',')[0].trim();
  const jobs = [
    fs.load(`48px ${first(f.brush)}`, text),
    fs.load(`32px ${first(f.text)}`, text),
    fs.load(`italic 28px ${first(f.latin)}`, 'Half-Acre 2026'),
    fs.load(`28px ${first(f.latin)}`, 'Half-Acre 2026'),
  ].map((p) => p.catch(() => []));
  await Promise.race([Promise.all(jobs).then(() => fs.ready), timeout(4000)]);
}

export const INK = '#1b1916';

/**
 * Paint one character as if brushed: ink sits in the paper grain, each glyph a hair different in
 * weight, tilt and size.
 */
function inkChar(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, font: string, rng: Rng, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x + rng.gauss() * size * 0.012, y + rng.gauss() * size * 0.01);
  ctx.rotate(rng.gauss() * 0.018);
  const k = 1 + rng.gauss() * 0.025;
  ctx.font = `${Math.round(size * k)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha * (0.9 + rng() * 0.1);
  ctx.fillStyle = color;
  ctx.fillText(ch, 0, 0);
  // a second, grain-modulated pass: thin spots where the paper fibres resisted the brush
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = grainPattern(ctx, color, 'fine');
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

/** Draw characters top-to-bottom centred on x, starting at y (top of first cell). `null` = half gap. */
export function drawColumn(ctx: CanvasRenderingContext2D, cells: (string | null)[], x: number, y: number, size: number, lead: number, font: string, rng: Rng, color = INK, alpha = 0.92): number {
  let cy = y;
  for (const c of cells) {
    if (c === null) { cy += size * lead * 0.5; continue; }
    inkChar(ctx, c, x, cy + size * 0.5, size, font, rng, color, alpha);
    cy += size * lead;
  }
  return cy;
}

const cellsLen = (cells: (string | null)[]) => cells.reduce((a, c) => a + (c === null ? 0.5 : 1), 0);

/** Pack phrases into columns of at most `max` cells, breaking between phrases where possible. */
export function packColumns(phrases: string[], max: number, gap = true): (string | null)[][] {
  const cols: (string | null)[][] = [];
  let cur: (string | null)[] = [];
  for (const ph of phrases) {
    let chars = Array.from(ph);
    const need = chars.length + (cur.length && gap ? 0.5 : 0);
    if (cur.length && cellsLen(cur) + need > max) {
      cols.push(cur);
      cur = [];
    }
    if (cur.length && gap) cur.push(null);
    while (cellsLen(cur) + chars.length > max) {
      const room = Math.max(1, Math.floor(max - cellsLen(cur)));
      cur.push(...chars.slice(0, room));
      chars = chars.slice(room);
      cols.push(cur);
      cur = [];
    }
    cur.push(...chars);
  }
  if (cur.length) cols.push(cur);
  return cols;
}

export interface SealPlacement {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  size: number;
  rot: number;
}

/** Press a seal: multiply so the paper shows through the paste. (x, y) is the seal's centre. */
export function pressSeal(ctx: CanvasRenderingContext2D, s: SealPlacement): void {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.94;
  ctx.drawImage(s.canvas, -s.size / 2, -s.size / 2, s.size, s.size);
  ctx.restore();
}

export interface InscriptionBox {
  /** Right edge of the text block (columns grow leftwards from here). */
  right: number;
  top: number;
  /** Tallest a column may be. */
  maxH: number;
  /** Poem glyph size; colophon is ~0.6 of it. */
  size: number;
  /** Place the block on the left instead (columns still read right-to-left). */
  align?: 'right' | 'left';
  left?: number;
}

/**
 * Set a full 题款: the poem in large running-script columns, then the colophon (date, record,
 * signature) in smaller kai, indented one character; the name seal under the signature and the
 * leisure seal (引首章) at the head of the first column. Returns the block's left edge.
 */
export function drawInscription(ctx: CanvasRenderingContext2D, ins: Inscription, box: InscriptionBox, fonts: Fonts, seed: number): { left: number; bottom: number } {
  const rng = makeRng(seed);
  const S = box.size;
  const s = Math.round(S * 0.58);
  const leadP = 1.08, leadS = 1.14;
  const maxP = Math.max(4, Math.min(10, Math.floor(box.maxH / (S * leadP))));
  const maxS = Math.max(6, Math.floor((box.maxH - S) / (s * leadS)));
  const poemCols = packColumns(ins.verses, maxP, false);
  // one verse per column reads best; two short (5-char) verses may share one
  const colW = S * 1.34;
  const colWs = s * 1.62;
  const colophon = packColumns([...ins.date, ...ins.record], maxS);
  // signature goes at the foot of the last column if it fits (with seal room), else its own column
  const signCells = Array.from(ins.sign);
  const sealSize = Math.round(s * 1.9);
  const last = colophon[colophon.length - 1] ?? [];
  const sealCells = sealSize / (s * leadS) + 0.4;
  if (last.length && cellsLen(last) + 1 + signCells.length + sealCells <= maxS) last.push(null, null, ...signCells);
  else colophon.push(signCells);

  const width = poemCols.length * colW + S * 0.2 + colophon.length * colWs;
  const right = box.align === 'left' ? (box.left ?? 0) + width : box.right;

  let x = right - colW / 2;
  const poemFont = fonts.brush;
  for (const col of poemCols) {
    drawColumn(ctx, col, x, box.top, S, leadP, poemFont, rng);
    x -= colW;
  }
  x += colW / 2 - S * 0.2 - colWs / 2;
  let signBottom = box.top;
  let signX = x;
  colophon.forEach((col, i) => {
    const y = box.top + S * 1.05;
    const end = drawColumn(ctx, col, x, y, s, leadS, fonts.text, rng, INK, 0.86);
    if (i === colophon.length - 1) { signBottom = end; signX = x; }
    x -= colWs;
  });
  const left = x + colWs / 2 - s * 0.6;

  // name seal (白文) just under the signature
  const nameSeal = makeSeal(ins.seal, { size: sealSize, dpr: 1, style: 'bai', seed: seed + 1 });
  pressSeal(ctx, { canvas: nameSeal, x: signX, y: signBottom + s * 0.35 + sealSize / 2, size: sealSize, rot: rng.gauss() * 0.02 });
  // leisure seal (朱文, oval) at the head of the first column, in the margin to its right
  const lz = Math.round(S * 1.05);
  const leisure = makeSeal(ins.leisure, { size: lz, dpr: 1, style: 'zhu', shape: 'oval', seed: seed + 2 });
  pressSeal(ctx, { canvas: leisure, x: right + lz * 0.34, y: box.top + lz * 0.3, size: lz, rot: rng.gauss() * 0.02 });
  return { left, bottom: Math.max(signBottom + sealSize, box.top + maxP * S * leadP) };
}

/** Plain horizontal text with brushed ink (used for titles and small labels on posters). */
export function inkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, font: string, seed: number, o: { align?: CanvasTextAlign; color?: string; alpha?: number; spacing?: number } = {}): number {
  const rng = makeRng(seed);
  const chars = Array.from(text);
  const spacing = o.spacing ?? 0;
  ctx.save();
  ctx.font = `${size}px ${font}`;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  ctx.restore();
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' || o.align === 'end' ? x - total : x;
  chars.forEach((c, i) => {
    inkChar(ctx, c, cx + widths[i] / 2, y, size, font, rng, o.color ?? INK, o.alpha ?? 0.92);
    cx += widths[i] + spacing;
  });
  return total;
}
