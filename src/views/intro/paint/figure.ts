// 开篇 · the 点景 figure (「有个人」: faceless, six strokes, spec §4 S4) in three poses — standing,
// bending over the sprout, seated reading — and the brush tip that writes 「半亩」 on the slip (S3).
// Drawn with canvas paths per frame: at 22–28 px they cost nothing and stay crisp under the camera.
import { C } from './util';

export type FigurePose = 'stand' | 'bend' | 'read';

/**
 * The figure with its feet at (x, y), `px` tall. `bend` 0..1 blends standing into bending over.
 * Ink-grey robe wash, a darker sash, a head dot, a topknot; no face.
 */
export function drawFigure(g: CanvasRenderingContext2D, x: number, y: number, px: number, pose: FigurePose, o: { bend?: number; alpha?: number; flip?: boolean } = {}): void {
  const k = px / 22;
  const b = pose === 'bend' ? (o.bend ?? 1) : 0;
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y);
  g.scale((o.flip ? -1 : 1) * k, k);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (pose === 'read') {
    // seated at a low table, bent over a book
    g.fillStyle = 'rgba(52,58,66,.55)';
    g.beginPath(); g.moveTo(-7, 0); g.quadraticCurveTo(-8, -8, -3, -12); g.quadraticCurveTo(2, -13, 5, -9); g.quadraticCurveTo(8, -3, 8, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(27,25,22,.75)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-7, 0); g.quadraticCurveTo(-8, -8, -3, -12); g.stroke();
    g.fillStyle = 'rgba(27,25,22,.85)';
    g.beginPath(); g.arc(4.5, -12.5, 2.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(3.6, -15.2, 1.1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(27,25,22,.6)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(3, -7); g.lineTo(8.5, -3.5); g.stroke();
    g.restore();
    return;
  }
  const lean = b * 0.75;
  const hx = Math.sin(lean) * 14, hy = -Math.cos(lean) * 14 - 4;
  // robe: a wash from the shoulders to the feet
  g.fillStyle = 'rgba(52,58,66,.5)';
  g.beginPath();
  g.moveTo(-4.5, 0);
  g.quadraticCurveTo(-5 + hx * 0.2, -9, hx * 0.72 - 3, hy * 0.72 + 2);
  g.lineTo(hx * 0.72 + 3, hy * 0.72 + 3);
  g.quadraticCurveTo(5 + hx * 0.3, -8, 5, 0);
  g.closePath();
  g.fill();
  // the back line, a sleeve reaching down when bending, the sash
  g.strokeStyle = 'rgba(27,25,22,.8)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-4.5, 0); g.quadraticCurveTo(-5 + hx * 0.2, -9, hx * 0.72 - 3, hy * 0.72 + 2); g.stroke();
  g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(hx * 0.7, hy * 0.7 + 3); g.quadraticCurveTo(hx * 0.9 + 3, hy * 0.4 + 4, hx * 0.6 + 4 + b * 5, -6 + b * 5); g.stroke();
  g.strokeStyle = 'rgba(27,25,22,.55)';
  g.beginPath(); g.moveTo(-4 + hx * 0.1, -8); g.lineTo(4 + hx * 0.15, -8.5); g.stroke();
  // head and topknot
  g.fillStyle = 'rgba(27,25,22,.88)';
  g.beginPath(); g.arc(hx, hy, 2.8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(hx - 0.8 * Math.cos(lean), hy - 3 * Math.cos(lean) - 0.6, 1.2, 0, Math.PI * 2); g.fill();
  g.restore();
}

/**
 * The brush tip that writes on the slip: a tapered tuft of hairs and the end of a bamboo shaft,
 * 淡墨, no hand. (x, y) is the tip; it leans toward the lower right, where the writer sits.
 */
export function drawBrushTip(g: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1): void {
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  g.rotate(-0.62);
  const k = size / 60;
  g.scale(k, k);
  // the tuft
  g.fillStyle = 'rgba(27,25,22,.82)';
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(-4.5, 8, -4, 20);
  g.lineTo(4, 20);
  g.quadraticCurveTo(4.5, 8, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(27,25,22,.35)'; g.lineWidth = 0.5;
  for (const dx of [-2.4, -0.8, 0.8, 2.4]) { g.beginPath(); g.moveTo(dx * 0.3, 3); g.quadraticCurveTo(dx, 10, dx * 1.1, 19); g.stroke(); }
  // ferrule and shaft (bamboo, with a node)
  g.fillStyle = '#6b5a45';
  g.fillRect(-4.2, 20, 8.4, 5);
  const grd = g.createLinearGradient(-4, 0, 4, 0);
  grd.addColorStop(0, '#b89c6e'); grd.addColorStop(0.5, '#d6c29a'); grd.addColorStop(1, '#a88c5e');
  g.fillStyle = grd;
  g.fillRect(-3.6, 25, 7.2, 70);
  g.strokeStyle = 'rgba(27,25,22,.45)'; g.lineWidth = 0.8;
  g.strokeRect(-3.6, 25, 7.2, 70);
  g.beginPath(); g.moveTo(-3.8, 58); g.lineTo(3.8, 58); g.stroke();
  g.restore();
}

/** The slip (题签): a narrow paper strip with a hairline border. */
export function drawSlip(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, alpha = 1): void {
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = 'rgba(0,0,0,.08)';
  g.fillRect(x0 + 1.5, y0 + 2, x1 - x0, y1 - y0);
  g.fillStyle = C.slip;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.strokeStyle = 'rgba(27,25,22,.4)';
  g.lineWidth = 0.7;
  g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  g.strokeStyle = 'rgba(27,25,22,.18)';
  g.strokeRect(x0 + 2.5, y0 + 2.5, x1 - x0 - 5, y1 - y0 - 5);
  g.restore();
}
