// /lab.html?scene=land-rocks&seed=1&size=140 — a sheet of rocks (太湖石 and boulders) by seed.
import { rockDrawing } from '../../ink/landscape';
import { paintDrawing } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  fillPaper(ctx, W, H);
  const seed0 = Number(p.get('seed') ?? 1);
  const size = Number(p.get('size') ?? 140);
  const cols = Math.max(1, Math.floor(W / (size * 1.25))), rows = Math.max(1, Math.floor(H / (size * 1.5)));
  ctx.font = '11px system-ui';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const sd = seed0 + j * cols + i;
      const d = rockDrawing(sd, size);
      const cx = (i + 0.5) * (W / cols), gy = (j + 0.9) * (H / rows);
      ctx.save();
      ctx.translate(cx - d.anchor.x, gy - d.anchor.y);
      paintDrawing(ctx, d, 1);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillText(`seed ${sd}`, cx - 20, gy + 14);
    }
  }
}
