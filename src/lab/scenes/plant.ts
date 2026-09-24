// /lab.html?scene=plant&kind=plum&seed=1&height=320&growth=0.15,0.4,0.7,1&vigor=1
// Paints one plant at several growth levels side by side on paper, with a ground line.
import type { PlantKind } from '../../core/types';
import { plantDrawing } from '../../ink/plants';
import { paintDrawing } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const kind = (p.get('kind') ?? 'bamboo') as PlantKind;
  const seed = Number(p.get('seed') ?? 1);
  const height = Number(p.get('height') ?? 320);
  const vigor = Number(p.get('vigor') ?? 1);
  const growths = (p.get('growth') ?? '0.15,0.4,0.7,1').split(',').map(Number);
  const seeds = (p.get('seeds') ?? '').split(',').filter(Boolean).map(Number);
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  fillPaper(ctx, W, H);
  const cells = seeds.length ? seeds.map((s) => ({ seed: s, g: growths[growths.length - 1] })) : growths.map((g) => ({ seed, g }));
  const cw = W / cells.length;
  const ground = H - 40;
  ctx.font = '13px system-ui';
  cells.forEach(({ seed: sd, g }, i) => {
    const d = plantDrawing({ kind, seed: sd, height });
    const s = Math.min(1, (cw * 0.92) / d.width, (ground - 20) / d.height);
    ctx.save();
    ctx.translate(i * cw + cw / 2 - d.anchor.x * s, ground - d.anchor.y * s);
    ctx.scale(s, s);
    paintDrawing(ctx, d, g, { vigor });
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillText(`${kind} seed=${sd} growth=${g} strokes=${d.strokes.filter((st) => st.birth <= g).length}/${d.strokes.length}`, i * cw + 8, H - 14);
  });
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); ctx.stroke();
}
