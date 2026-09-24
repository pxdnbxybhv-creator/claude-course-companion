// /lab.html?scene=paper[&seed=7][&mode=sheet|seams|grain]
// sheet — a full sheet of xuan with a few strokes on it (the paper must never compete with ink)
// seams — the raw tile repeated 3×3 with faint guides at the tile edges, to check it is seamless
// grain — the ink-grain masks (fine / wash / punch) as they sit in ink, magnified
import { fillPaper, makePaperTile, inkGrainTile, deviceScale, PAPER_BASE } from '../../ink/paper';
import { paintStroke } from '../../ink/brush';
import type { StrokePoint } from '../../ink/types';

function curve(x0: number, y0: number, x1: number, y1: number, bend: number, w: (t: number) => number, n = 14): StrokePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * bend, w: w(t) };
  });
}

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const seed = Number(p.get('seed') ?? 7);
  const mode = p.get('mode') ?? 'sheet';
  const t0 = performance.now();
  if (mode === 'seams') {
    const tile = makePaperTile(256, seed, deviceScale(ctx));
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) ctx.drawImage(tile, i * 256, j * 256, 256, 256);
    ctx.strokeStyle = 'rgba(200,40,40,.35)';
    ctx.setLineDash([2, 6]);
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * 256, 0); ctx.lineTo(i * 256, 8); ctx.moveTo(i * 256, H - 8); ctx.lineTo(i * 256, H); ctx.stroke(); }
    for (let j = 1; j < 3; j++) { ctx.beginPath(); ctx.moveTo(0, j * 256); ctx.lineTo(8, j * 256); ctx.moveTo(W - 8, j * 256); ctx.lineTo(W, j * 256); ctx.stroke(); }
  } else if (mode === 'grain') {
    ctx.fillStyle = PAPER_BASE;
    ctx.fillRect(0, 0, W, H);
    (['fine', 'wash', 'punch'] as const).forEach((v, k) => {
      const g = inkGrainTile(v);
      // show as ink with the mask punched out, magnified ×1.5
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      x.fillStyle = '#1b1916';
      x.fillRect(0, 0, 256, 256);
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(g, 0, 0);
      ctx.globalAlpha = v === 'wash' ? 0.45 : 0.85;
      ctx.drawImage(c, 20 + k * 400, 40, 384, 384);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.font = '13px system-ui';
      ctx.fillText(v, 20 + k * 400, 30);
    });
  } else {
    fillPaper(ctx, W, H, seed);
    const ms = performance.now() - t0;
    // a quiet test: a wash, a pale stroke, a dark stroke, dry brush, a dot — paper stays behind
    paintStroke(ctx, { kind: 'wash', tone: 0.14, birth: 0, seed: 3, wet: 0.9, pts: [{ x: 120, y: 560, w: 14 }, { x: 380, y: 470, w: 14 }, { x: 640, y: 520, w: 14 }, { x: 700, y: 610, w: 14 }, { x: 300, y: 640, w: 14 }] });
    paintStroke(ctx, { kind: 'brush', tone: 0.3, birth: 0, seed: 4, pts: curve(760, 180, 1100, 260, 40, (t) => 22 * Math.sin(Math.PI * (0.1 + 0.8 * t)) ** 0.6) });
    paintStroke(ctx, { kind: 'brush', tone: 0.92, birth: 0, seed: 5, pts: curve(760, 330, 1120, 380, -30, (t) => 16 * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 0.7) });
    paintStroke(ctx, { kind: 'dry', tone: 0.8, birth: 0, seed: 6, pts: curve(760, 470, 1120, 520, 20, (t) => 30 - 12 * t) });
    paintStroke(ctx, { kind: 'dot', tone: 0.95, birth: 0, seed: 7, pts: [{ x: 820, y: 600, w: 9 }] });
    paintStroke(ctx, { kind: 'dot', tone: 0.95, birth: 0, seed: 8, pts: [{ x: 842, y: 608, w: 5 }] });
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.font = '11px system-ui';
    ctx.fillText(`fillPaper ${W}×${H} @${dpr}x: ${ms.toFixed(1)} ms (first call builds the tile)`, 12, H - 10);
    const t1 = performance.now();
    const probe = document.createElement('canvas');
    probe.width = canvas.width; probe.height = canvas.height;
    const pctx = probe.getContext('2d')!;
    pctx.scale(dpr, dpr);
    fillPaper(pctx, W, H, seed);
    ctx.fillText(`cached: ${(performance.now() - t1).toFixed(1)} ms`, 12, H - 26);
  }
}
