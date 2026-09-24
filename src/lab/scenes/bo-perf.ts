// /lab.html?scene=bo-perf&kinds=bamboo,orchid&seeds=1,2,3,4,5&height=320&scale=2
// Times generation and rasterisation of full-grown plants (bamboo / orchid bench).
import type { PlantKind } from '../../core/types';
import { GENERATORS } from '../../ink/plants';
import { rasterize } from '../../ink/brush';

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const kinds = (p.get('kinds') ?? 'bamboo,orchid').split(',') as PlantKind[];
  const seeds = (p.get('seeds') ?? '1,2,3,4,5').split(',').map(Number);
  const height = Number(p.get('height') ?? 320);
  const scale = Number(p.get('scale') ?? 2);
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f1e9d8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222';
  ctx.font = '14px monospace';
  let y = 24;
  for (const kind of kinds) {
    const gens: number[] = [], rasts: number[] = [], counts: number[] = [];
    for (const seed of seeds) {
      const t0 = performance.now();
      const d = GENERATORS[kind]({ kind, seed, height });
      const t1 = performance.now();
      rasterize(d, 1, scale);
      const t2 = performance.now();
      gens.push(t1 - t0); rasts.push(t2 - t1); counts.push(d.strokes.length);
    }
    const f = (a: number[]) => `avg ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} max ${Math.max(...a).toFixed(1)}`;
    const line = `${kind}: strokes ${Math.min(...counts)}-${Math.max(...counts)} · generate ms ${f(gens)} · rasterize@${scale} ms ${f(rasts)}`;
    console.log(line);
    ctx.fillText(line, 16, y);
    y += 22;
  }
}
