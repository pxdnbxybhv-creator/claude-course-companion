// /lab.html?scene=cl-stats&kind=lotus — contract checks for the chrysanthemum / lotus painters
// across many seeds: stroke counts, birth order, box containment, determinism, early sprout.
// Results are printed on the canvas and to console.warn (so snap.mjs relays them).
import type { PlantKind } from '../../core/types';
import { GENERATORS } from '../../ink/plants';

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const kinds = (p.get('kind') ?? 'chrysanthemum,lotus').split(',') as PlantKind[];
  const n = Number(p.get('n') ?? 200);
  const lines: string[] = [];
  for (const kind of kinds) {
    for (const height of [160, 320, 420]) {
      let maxS = 0, minS = 1e9, sum = 0, bad = 0, minEarly = 1e9, maxW = 0, minW = 1e9, maxH = 0, minH = 1e9;
      const t0 = performance.now();
      for (let seed = 1; seed <= n; seed++) {
        const d = GENERATORS[kind]({ kind, seed, height });
        const d2 = GENERATORS[kind]({ kind, seed, height });
        if (JSON.stringify(d) !== JSON.stringify(d2)) { bad++; lines.push(`${kind} seed ${seed}: NOT deterministic`); }
        const S = d.strokes.length;
        maxS = Math.max(maxS, S); minS = Math.min(minS, S); sum += S;
        for (let i = 1; i < S; i++) if (d.strokes[i].birth < d.strokes[i - 1].birth) { bad++; lines.push(`${kind} ${seed}: births unsorted`); break; }
        for (const st of d.strokes) {
          for (const q of st.pts) if (q.x < 0 || q.y < 0 || q.x > d.width || q.y > d.height || !Number.isFinite(q.x + q.y + q.w)) { bad++; lines.push(`${kind} ${seed}: point outside box ${q.x.toFixed(1)},${q.y.toFixed(1)} of ${d.width}x${d.height}`); break; }
          if (st.birth < 0 || st.birth > 1 || st.tone < 0 || st.tone > 1) { bad++; lines.push(`${kind} ${seed}: bad birth/tone`); }
        }
        const early = d.strokes.filter((s) => s.birth <= 0.06).length;
        minEarly = Math.min(minEarly, early);
        maxW = Math.max(maxW, d.width / height); minW = Math.min(minW, d.width / height);
        maxH = Math.max(maxH, d.height / height); minH = Math.min(minH, d.height / height);
        if (d.anchor.y < d.height * 0.85) lines.push(`${kind} ${seed}: anchor high ${d.anchor.y.toFixed(0)}/${d.height}`);
      }
      const ms = (performance.now() - t0) / (2 * n);
      lines.push(`${kind} h=${height}: strokes ${minS}..${maxS} avg ${(sum / n).toFixed(0)} · early(≤0.06) min ${minEarly} · w/h ${minW.toFixed(2)}..${maxW.toFixed(2)} · boxH/h ${minH.toFixed(2)}..${maxH.toFixed(2)} · problems ${bad} · gen ${ms.toFixed(2)} ms`);
    }
  }
  if (p.get('perf')) lines.push(...(await perf(kinds)));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000'; ctx.font = '14px monospace';
  lines.slice(0, 60).forEach((l, i) => ctx.fillText(l, 10, 20 + i * 18));
  for (const l of lines) console.warn(l);
}

// Rasterise timing: /lab.html?scene=cl-stats&perf=1
export async function perf(kinds: PlantKind[]): Promise<string[]> {
  const { rasterize } = await import('../../ink/brush');
  const out: string[] = [];
  for (const kind of kinds) {
    const times: number[] = [];
    for (let seed = 1; seed <= 8; seed++) {
      const d = GENERATORS[kind]({ kind, seed, height: 320 });
      const t0 = performance.now();
      rasterize(d, 1, 2);
      times.push(performance.now() - t0);
    }
    out.push(`${kind} rasterize@2: ${times.map((t) => t.toFixed(0)).join(' ')} ms`);
  }
  return out;
}
