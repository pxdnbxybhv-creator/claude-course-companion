// A small still painting of 井字棋 for its card in the games hall: a brushed grid, an ensō and a cross.
import { paintStroke } from '../../../ink/brush';
import { fillPaper } from '../../../ink/paper';
import { crossStrokes, ensoStrokes, gridStrokes } from './paint';
import { loadStats, LEVEL_NAMES } from './store';
import type { Level } from './logic';

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  const dpr = r.width ? canvas.width / r.width : 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fillPaper(ctx, w, h, 31);
  // a small board, a little off-centre, with lots of paper around it
  const S = Math.min(h * 0.94, w * 0.74);
  const ox = Math.max(4, w * 0.44 - S * 0.5), oy = (h - S) / 2;
  ctx.translate(ox, oy);
  for (const st of gridStrokes(S, 11)) paintStroke(ctx, st);
  const m = S * 0.07, cell = (S - 2 * m) / 3;
  const c = (i: number) => ({ x: m + cell * ((i % 3) + 0.5), y: m + cell * (Math.floor(i / 3) + 0.5) });
  for (const st of ensoStrokes(c(4), cell * 0.36, 5)) paintStroke(ctx, st);
  for (const st of crossStrokes(c(8), cell * 0.36, 9)) paintStroke(ctx, st);
  for (const st of crossStrokes(c(0), cell * 0.36, 21)) paintStroke(ctx, st);
}

/** e.g. "难 12胜 30和" — the hardest level you have played against the machine. */
export function statLine(lang: 'zh' | 'en'): string | null {
  const s = loadStats();
  const levels: Level[] = ['hard', 'medium', 'easy'];
  for (const lv of levels) {
    const t = s.ai[lv];
    if (t.w + t.d + t.l > 0) return lang === 'zh' ? `${LEVEL_NAMES[lv].zh} ${t.w}胜 ${t.d}和` : `${LEVEL_NAMES[lv].en} ${t.w}W ${t.d}D`;
  }
  const p = s.pvp;
  if (p.o + p.x + p.d > 0) return lang === 'zh' ? `同桌 ${p.o + p.x + p.d}局` : `${p.o + p.x + p.d} two-player games`;
  return null;
}
