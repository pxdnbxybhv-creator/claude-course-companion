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
    if (!cur.length && chars.length > max) {
      // split an over-long phrase into even parts rather than leaving an orphan
      const parts = Math.ceil(chars.length / max);
      const per = Math.ceil(chars.length / parts);
      while (chars.length > per) {
        cols.push(chars.slice(0, per));
        chars = chars.slice(per);
      }
    }
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

export interface InscriptionPlan {
  S: number;
  s: number;
  leadP: number;
  leadS: number;
  colW: number;
  colWs: number;
  poemCols: (string | null)[][];
  colophon: (string | null)[][];
  sealSize: number;
  /** Block extent (seals included). */
  width: number;
  height: number;
}

/**
 * Lay out a 题款 for a column height limit: the poem in large running-script columns (one verse a
 * column; two short verses may share), then the colophon — date, record, signature — in smaller kai,
 * indented one character, with room for the name seal under the signature.
 */
export function planInscription(ins: Inscription, maxH: number, S: number, allowBreak = false): InscriptionPlan {
  const s = Math.round(S * 0.58);
  const leadP = 1.08, leadS = 1.14;
  // a verse is never broken (up to 9 characters); longer lines are split evenly
  const longestVerse = Math.max(0, ...ins.verses.map((v) => Array.from(v).length));
  const maxP = Math.max(4, Math.min(10, Math.max(Math.floor(maxH / (S * leadP)), Math.min(9, longestVerse))));
  // colophon phrases are never broken mid-phrase if they can be kept whole (up to 13 characters)
  const longest = Math.max(0, ...[...ins.date, ...ins.record].map((p) => Array.from(p).length));
  const maxS = Math.max(allowBreak ? 8 : 6, Math.floor((maxH - S * 1.05) / (s * leadS)), allowBreak ? 0 : Math.min(13, longest));
  const poemCols = packColumns(ins.verses, maxP, false);
  const colW = S * 1.34;
  const colWs = s * 1.62;
  const colophon = packColumns([...ins.date, ...ins.record], maxS);
  const signCells = Array.from(ins.sign);
  const sealSize = Math.round(s * 1.9);
  const last = colophon[colophon.length - 1] ?? [];
  const sealCells = sealSize / (s * leadS) + 0.4;
  if (last.length && cellsLen(last) + 1 + signCells.length + sealCells <= maxS) last.push(null, null, ...signCells);
  else colophon.push(signCells);
  const width = poemCols.length * colW + S * 0.2 + colophon.length * colWs + S * 0.5;
  const poemH = Math.max(...poemCols.map(cellsLen), 0) * S * leadP;
  const colH = Math.max(...colophon.map(cellsLen), 0) * s * leadS + S * 1.05;
  const lastH = cellsLen(colophon[colophon.length - 1] ?? []) * s * leadS + S * 1.05 + s * 0.35 + sealSize;
  return { S, s, leadP, leadS, colW, colWs, poemCols, colophon, sealSize, width, height: Math.max(poemH, colH, lastH) };
}

/**
 * Paint a planned inscription with its right edge at `right`; the name seal (白文) goes under the
 * signature and the leisure seal (朱文, oval 引首章) at the head of the first column.
 */
export function drawInscription(ctx: CanvasRenderingContext2D, ins: Inscription, plan: InscriptionPlan, right: number, top: number, fonts: Fonts, seed: number): void {
  const rng = makeRng(seed);
  const { S, s, leadP, leadS, colW, colWs, sealSize } = plan;
  let x = right - colW / 2;
  for (const col of plan.poemCols) {
    drawColumn(ctx, col, x, top, S, leadP, fonts.brush, rng);
    x -= colW;
  }
  x += colW / 2 - S * 0.2 - colWs / 2;
  let signBottom = top;
  let signX = x;
  plan.colophon.forEach((col, i) => {
    const end = drawColumn(ctx, col, x, top + S * 1.05, s, leadS, fonts.text, rng, INK, 0.86);
    if (i === plan.colophon.length - 1) { signBottom = end; signX = x; }
    x -= colWs;
  });
  const nameSeal = makeSeal(ins.seal, { size: sealSize, dpr: 1, style: 'bai', seed: seed + 1 });
  pressSeal(ctx, { canvas: nameSeal, x: signX, y: signBottom + s * 0.35 + sealSize / 2, size: sealSize, rot: rng.gauss() * 0.02 });
  const lz = Math.round(S * 1.25);
  const leisure = makeSeal(ins.leisure, { size: lz, dpr: 1, style: 'zhu', shape: 'oval', seed: seed + 2 });
  pressSeal(ctx, { canvas: leisure, x: right + lz * 0.26, y: top + lz * 0.22, size: lz, rot: rng.gauss() * 0.02 });
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
