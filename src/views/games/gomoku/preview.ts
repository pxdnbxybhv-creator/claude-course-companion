// A small still painting of the Gomoku game for its card in the games hall: the corner of a kaya
// board with a handful of stones and the cinnabar mark on the last one. Cheap (< 10 ms).
import { paintWood } from './board';
import { loadSaved, statText } from './save';

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  paintWood(ctx, W, 23, H);

  // an off-centre corner of the board: lines run out past the right and bottom edges
  const gap = Math.max(8, Math.min(W / 7.5, H / 5.4));
  const ox = W * 0.1, oy = H * 0.16;
  const lw = Math.max(1, gap * 0.045);
  ctx.strokeStyle = '#241c14';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0; ox + i * gap < W + gap; i++) {
    ctx.moveTo(ox + i * gap, oy);
    ctx.lineTo(ox + i * gap, H + 2);
  }
  for (let j = 0; oy + j * gap < H + gap; j++) {
    ctx.moveTo(ox, oy + j * gap);
    ctx.lineTo(W + 2, oy + j * gap);
  }
  ctx.stroke();
  ctx.lineWidth = lw * 2.2;
  ctx.beginPath();
  ctx.moveTo(W + 2, oy);
  ctx.lineTo(ox, oy);
  ctx.lineTo(ox, H + 2);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#241c14';
  ctx.beginPath();
  ctx.arc(ox + 3 * gap, oy + 3 * gap, Math.max(1.5, gap * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const r = gap * 0.47;
  const stone = (x: number, y: number, black: boolean) => {
    const cx = ox + x * gap, cy = oy + y * gap;
    // soft shadow
    const sg = ctx.createRadialGradient(cx + r * 0.12, cy + r * 0.18, r * 0.4, cx + r * 0.12, cy + r * 0.18, r * 1.3);
    sg.addColorStop(0, 'rgba(50,30,10,0.4)');
    sg.addColorStop(1, 'rgba(50,30,10,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3.2, r * 3.2);
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.06, cx, cy, r);
    if (black) {
      g.addColorStop(0, '#5f5c58');
      g.addColorStop(0.3, '#34312e');
      g.addColorStop(0.72, '#191816');
      g.addColorStop(1, '#0c0b0a');
    } else {
      g.addColorStop(0, '#fffdf8');
      g.addColorStop(0.55, '#f2eee3');
      g.addColorStop(0.86, '#e0d9c9');
      g.addColorStop(1, '#c8bfad');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (!black) {
      ctx.strokeStyle = 'rgba(110,98,80,0.35)';
      ctx.lineWidth = Math.max(0.5, r * 0.04);
      ctx.stroke();
    }
    return { cx, cy };
  };
  // a diagonal three for black, white leaning in to block — kept clear of the card's badge
  stone(1, 1, true);
  stone(2, 1, false);
  stone(2, 2, true);
  stone(1, 2, false);
  stone(3, 1, false);
  const last = stone(3, 3, true);
  stone(0, 3, false);
  ctx.fillStyle = '#cf4a35';
  ctx.beginPath();
  ctx.arc(last.cx, last.cy, Math.max(1.5, r * 0.19), 0, Math.PI * 2);
  ctx.fill();
}

/** "国手 3胜2负" / "Master 3–2"; null before the first finished game against the machine. */
export function statLine(lang: 'zh' | 'en'): string | null {
  try {
    return statText(loadSaved(), lang);
  } catch {
    return null;
  }
}
