// A small still painting of 七巧板 for its card in the games hall: the fish half made — five pieces
// laid on the pale-ink figure, two still waiting beside it.
import { fillPaper } from '../../../ink/paper';
import { FIGURE, FIGURES } from './figures';
import { maskOf, maskTriangles, outlineOf, solveFigure, type Pt } from './geometry';
import { COLORS } from './board';
import { loadSaved } from './store';

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  const dpr = r.width ? canvas.width / r.width : 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fillPaper(ctx, w, h, 37);
  const f = FIGURE.fish;
  const m = maskOf(f.art);
  const u = Math.min((h * 0.62) / m.h, (w * 0.42) / m.w);
  const ox = w * 0.3 - (m.w * u) / 2, oy = (h - m.h * u) / 2 + h * 0.04;
  const path = (pts: Pt[], dx = 0, dy = 0) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(ox + (p.x + dx) * u, oy + (p.y + dy) * u) : ctx.moveTo(ox + (p.x + dx) * u, oy + (p.y + dy) * u)));
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(40,36,30,0.18)';
  for (const tri of maskTriangles(m)) {
    path(tri);
    ctx.fill();
  }
  const sol = solveFigure(f.art) ?? [];
  const kinds = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];
  const used = new Set<number>();
  sol.forEach((s, j) => {
    const i = kinds.findIndex((k, ii) => k === s.kind && !used.has(ii));
    used.add(i);
    // the last two pieces wait off to the right, a little askew
    const away = j >= sol.length - 2;
    const pts = outlineOf(away ? { ...s, rot: s.rot + 1, x: m.w + 1.1 + (j - sol.length + 2) * 1.6, y: 1.6 + (j % 2) * 1.3 } : s);
    path(pts);
    ctx.fillStyle = COLORS[i] ?? '#5a534a';
    ctx.shadowColor = 'rgba(30,20,10,0.2)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,248,232,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

/** e.g. "已拼 5/23 幅". */
export function statLine(lang: 'zh' | 'en'): string | null {
  const n = loadSaved().solved.length;
  if (!n) return null;
  return lang === 'zh' ? `已拼 ${n}/${FIGURES.length} 幅` : `${n} of ${FIGURES.length} figures`;
}
