// A small still painting of 贪吃蛇 for its card in the games hall: a snake curling toward a blossom.
import { fillPaper } from '../../../ink/paper';
import { paintSnake, smoothSpine, sprite } from './paint';
import { loadStats } from './store';

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const r = canvas.getBoundingClientRect();
  const dpr = r.width ? W / r.width : 1;
  const w = W / dpr, h = H / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fillPaper(ctx, w, h, 23);
  const cell = Math.max(9, Math.min(15, h / 8));
  // a lazy S along the card, its head lifting toward the blossom
  const raw: { x: number; y: number }[] = [];
  const n = 60;
  const hx = w * 0.5, hy = h * 0.56, tx = w * 0.05, ty = h * 0.7;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 = head
    const x = hx + (tx - hx) * t;
    const y = hy + (ty - hy) * t + Math.sin(t * Math.PI * 2.2 + 0.4) * h * 0.14 * Math.min(1, t * 3);
    raw.push({ x, y: y - (1 - Math.min(1, t * 6)) * h * 0.06 });
  }
  const spine = smoothSpine(raw, 1.5);
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const l = layer.getContext('2d')!;
  l.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintSnake(l, spine, { cell, travel: 40 * cell, time: 0, sway: 0.6, breathe: 0, tongue: 0.9 }, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the blossom just ahead of the snout
  const head = spine[0], next = spine[Math.min(spine.length - 1, 6)];
  const dx = head.x - next.x, dy = head.y - next.y, d = Math.hypot(dx, dy) || 1;
  const bs = cell * 1.5;
  const bx = head.x + (dx / d) * cell * 1.2 + cell * 0.9, by = head.y + (dy / d) * cell * 1.2 - cell * 0.9;
  ctx.drawImage(sprite('blossom', bs, dpr, 1), bx - bs / 2, by - bs / 2, bs, bs);
}

/** One short line for the hall card: the best score, or null before the first game. */
export function statLine(lang: 'zh' | 'en'): string | null {
  const s = loadStats();
  const best = Math.max(s.best.walls, s.best.wrap);
  if (!best && !s.games) return null;
  return lang === 'zh' ? `最佳 ${best}` : `Best ${best}`;
}
