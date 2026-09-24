// /lab.html?scene=brush — a specimen sheet of every stroke kind at several tones.
import type { Stroke, StrokeKind } from '../../ink/types';
import { PIGMENTS } from '../../ink/types';
import { paintStroke } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';

export default function (canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  fillPaper(ctx, W, H);
  const kinds: StrokeKind[] = ['brush', 'dry', 'line', 'wash', 'fill', 'dot'];
  const tones = [0.15, 0.35, 0.6, 0.9];
  const rowH = (H - 20) / kinds.length, colW = W / (tones.length + 1);
  ctx.font = '13px system-ui'; ctx.fillStyle = 'rgba(0,0,0,.5)';
  kinds.forEach((kind, r) => {
    ctx.fillText(kind, 10, 20 + r * rowH + rowH / 2);
    tones.concat([0.8]).forEach((tone, c) => {
      const x0 = 70 + c * colW, y0 = 16 + r * rowH, cx = x0 + colW * 0.4, cy = y0 + rowH / 2;
      const color = c === tones.length ? (kind === 'fill' || kind === 'dot' ? PIGMENTS.rouge : PIGMENTS.indigo) : undefined;
      let pts: Stroke['pts'];
      if (kind === 'wash' || kind === 'fill') {
        pts = Array.from({ length: 24 }, (_, k) => { const a = (k / 24) * Math.PI * 2; const rr = rowH * 0.36 * (1 + 0.25 * Math.sin(a * 3 + r)); return { x: cx + Math.cos(a) * rr * 1.5, y: cy + Math.sin(a) * rr, w: 6 }; });
      } else if (kind === 'dot') {
        pts = [{ x: cx, y: cy, w: 10 + c * 6 }];
      } else {
        const n = 24, len = colW * 0.8, wmax = kind === 'line' ? 2.2 : 18;
        pts = Array.from({ length: n }, (_, k) => { const t = k / (n - 1); return { x: x0 + t * len, y: cy + Math.sin(t * Math.PI * 1.3) * rowH * 0.22, w: wmax * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 0.6 }; });
      }
      paintStroke(ctx, { kind, pts, tone, color, birth: 0, seed: r * 10 + c + 1 });
    });
  });
}
