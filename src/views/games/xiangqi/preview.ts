// A small still painting of the Xiangqi game for its card in the games hall: a strip of boxwood
// board across the river — 楚河 brushed in the water, a soldier just across with the cinnabar
// last-move marks, a cannon and a horse eyeing each other. Cheap (< 15 ms).
import { paintBoxwood, paintPiece, boardFontsReady, BRUSH_FONT } from './board';
import { RED_BIT, BLACK_BIT, CANNON, KNIGHT, PAWN, ROOK } from './engine';
import { loadSaved, statText } from './save';

const waiting = new WeakSet<HTMLCanvasElement>();

export function paintPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  paintBoxwood(ctx, W, H, 31);

  const gap = Math.max(10, H / 4.1);
  const cy = H * 0.52; // the river's middle
  const ox = gap * 0.55;
  const cols = Math.ceil((W - ox) / gap) + 1;
  const rowY = (k: number) => cy + (k < 0 ? k + 0.5 : k - 0.5) * gap; // k = ±1 banks, ±2 next rows
  const colX = (i: number) => ox + i * gap;
  const lw = Math.max(1, gap * 0.035);
  ctx.strokeStyle = '#2a1f15';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (const k of [-2, -1, 1, 2]) {
    ctx.moveTo(colX(0), rowY(k));
    ctx.lineTo(W + 2, rowY(k));
  }
  for (let i = 0; i < cols; i++) {
    const x = colX(i);
    ctx.moveTo(x, -2);
    ctx.lineTo(x, rowY(-1));
    ctx.moveTo(x, rowY(1));
    ctx.lineTo(x, H + 2);
  }
  ctx.stroke();
  // the left edge of the field runs through the river
  ctx.lineWidth = lw * 1.8;
  ctx.beginPath();
  ctx.moveTo(colX(0), -2);
  ctx.lineTo(colX(0), H + 2);
  ctx.stroke();

  // 楚河 in the water
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#2a1f15';
  ctx.font = `${gap * 0.6}px ${BRUSH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚', colX(0.5), cy);
  ctx.fillText('河', colX(1.5), cy);
  ctx.globalAlpha = 1;

  const r = gap * 0.455;
  const put = (p: number, i: number, k: number) => {
    const x = colX(i), y = rowY(k);
    const sh = ctx.createRadialGradient(x + r * 0.08, y + r * 0.14, r * 0.5, x + r * 0.08, y + r * 0.14, r * 1.3);
    sh.addColorStop(0, 'rgba(55,32,10,0.42)');
    sh.addColorStop(1, 'rgba(55,32,10,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(x - r * 1.5, y - r * 1.5, r * 3.2, r * 3.2);
    const img = paintPiece(p, r, 1);
    ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
    return { x, y };
  };
  put(BLACK_BIT | KNIGHT, 2, -2);
  put(RED_BIT | CANNON, 1, 2);
  if (colX(5) + gap * 0.5 < W) put(BLACK_BIT | ROOK, 5, 2);
  const s = put(RED_BIT | PAWN, 3, -1);
  // last-move marks round the soldier that has just crossed
  const h = r * 1.12, l = r * 0.34;
  ctx.strokeStyle = '#b93a2b';
  ctx.lineWidth = Math.max(1.2, gap * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(s.x + sx * h, s.y + sy * (h - l));
    ctx.lineTo(s.x + sx * h, s.y + sy * h);
    ctx.lineTo(s.x + sx * (h - l), s.y + sy * h);
  }
  ctx.stroke();
  // and a faint ring where it came from
  ctx.strokeStyle = 'rgba(42,31,21,0.4)';
  ctx.lineWidth = Math.max(1, gap * 0.03);
  ctx.setLineDash([gap * 0.07, gap * 0.07]);
  ctx.beginPath();
  ctx.arc(s.x, rowY(1), r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // the carved characters use web fonts: paint once more when they have arrived
  if (!waiting.has(canvas) && typeof document !== 'undefined' && document.fonts && !document.fonts.check(`20px 'LXGW WenKai'`, '炮马兵车')) {
    waiting.add(canvas);
    boardFontsReady().then(() => {
      if (canvas.isConnected && canvas.width === W && canvas.height === H) paintPreview(canvas);
    });
  }
}

/** "国手 3胜2负" / "Master 3–2"; null before the first finished game against the machine. */
export function statLine(lang: 'zh' | 'en'): string | null {
  try {
    return statText(loadSaved(), lang);
  } catch {
    return null;
  }
}
