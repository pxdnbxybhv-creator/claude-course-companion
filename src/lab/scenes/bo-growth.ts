// /lab.html?scene=bo-growth&kinds=bamboo,orchid&seeds=1-20&height=300
// Growth choreography check: for every seed, the number of visible strokes must strictly
// increase at every check-in n = 1…21 (growth = growthFor(n)), so each check-in shows a change.
// Failures are listed on the canvas and reported with console.error (snap.mjs prints them).
import type { PlantKind } from '../../core/types';
import { GENERATORS } from '../../ink/plants';
import { growthFor } from '../../core/habits';

function parseSeeds(v: string): number[] {
  const m = /^(\d+)-(\d+)$/.exec(v);
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
  return v.split(',').filter(Boolean).map(Number);
}

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const kinds = (p.get('kinds') ?? 'bamboo,orchid').split(',') as PlantKind[];
  const seeds = parseSeeds(p.get('seeds') ?? '1-20');
  const height = Number(p.get('height') ?? 300);
  const N = Number(p.get('n') ?? 21);
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f1e9d8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '13px monospace';
  let y = 22;
  const line = (s: string, bad = false) => {
    ctx.fillStyle = bad ? '#b93a2b' : '#222';
    ctx.fillText(s, 12, y);
    y += 18;
  };
  for (const kind of kinds) {
    const fails: string[] = [];
    const avg = new Array(N + 1).fill(0);
    for (const seed of seeds) {
      const d = GENERATORS[kind]({ kind, seed, height });
      const counts: number[] = [];
      for (let n = 0; n <= N; n++) {
        const g = growthFor(n);
        counts.push(d.strokes.filter((s) => s.birth <= g).length);
        avg[n] += counts[n] / seeds.length;
      }
      for (let n = 1; n <= N; n++) if (counts[n] <= counts[n - 1]) fails.push(`seed ${seed}: n=${n - 1}→${n} stays at ${counts[n]}`);
      if (counts[0] < 3) fails.push(`seed ${seed}: only ${counts[0]} strokes at n=0`);
    }
    line(`${kind}: ${fails.length ? 'FAIL' : 'ok'} · avg visible strokes by check-in: ${avg.map((a) => a.toFixed(0)).join(' ')}`, fails.length > 0);
    for (const f of fails.slice(0, 12)) {
      line(`  ${f}`, true);
      console.error(`[bo-growth] ${kind} ${f}`);
    }
  }
}
