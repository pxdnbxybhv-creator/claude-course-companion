// /lab.html?scene=pp-check[&kind=plum|pine] — contract checks for the plum and pine painters:
// determinism, birth order, box containment, anchor, height, stroke budget, early visibility.
import { plum } from '../../ink/plants/plum';
import { pine } from '../../ink/plants/pine';
import type { Drawing, PlantGenerator } from '../../ink/types';

function check(name: string, gen: PlantGenerator, seed: number, height: number): string[] {
  const kind = name as 'plum' | 'pine';
  const a: Drawing = gen({ kind, seed, height });
  const b: Drawing = gen({ kind, seed, height });
  const errs: string[] = [];
  if (JSON.stringify(a) !== JSON.stringify(b)) errs.push('not deterministic');
  for (let i = 1; i < a.strokes.length; i++) if (a.strokes[i].birth < a.strokes[i - 1].birth) { errs.push('births unsorted'); break; }
  let top = 1e9, minX = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of a.strokes) {
    const poly = s.kind === 'wash' || s.kind === 'fill';
    for (const p of s.pts) {
      const r = poly ? 0 : p.w / 2;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.w)) errs.push('NaN');
      top = Math.min(top, p.y - r); minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r);
    }
    if (s.birth < 0 || s.birth > 1) errs.push('birth out of range');
  }
  if (top < 0 || minX < 0 || maxX > a.width || maxY > a.height) errs.push(`outside box ${minX.toFixed(1)},${top.toFixed(1)}..${maxX.toFixed(1)},${maxY.toFixed(1)} / ${a.width}x${a.height}`);
  const h = a.anchor.y - top;
  if (Math.abs(h - height) > height * 0.03) errs.push(`height ${h.toFixed(1)} vs ${height}`);
  if (a.strokes.length > 400) errs.push(`strokes ${a.strokes.length}`);
  const early = a.strokes.filter((s) => s.birth <= 0.06).length;
  if (early < 2) errs.push(`only ${early} strokes at 0.06`);
  return errs.map((e) => `${name} seed=${seed} h=${height}: ${e}`).concat(errs.length ? [] : [`${name} seed=${seed} h=${height}: ok ${a.strokes.length} strokes, ${a.width}x${a.height}, early=${early}`]);
}

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const kinds = (p.get('kind') ?? 'plum,pine').split(',');
  const lines: string[] = [];
  let bad = 0, maxN = 0;
  for (const k of kinds) {
    const gen = k === 'plum' ? plum : pine;
    for (let seed = 1; seed <= 40; seed++) {
      for (const h of [160, 320, 420]) {
        const r = check(k, gen, seed, h);
        const ok = r.length === 1 && r[0].includes(': ok');
        if (!ok) { bad++; lines.push(...r); r.forEach((x) => console.warn(x)); }
        maxN = Math.max(maxN, Number(/ok (\d+)/.exec(r[0])?.[1] ?? 0));
      }
    }
  }
  lines.unshift(`${bad} failing cases; max strokes ${maxN}`);
  console.warn(lines[0]);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '14px monospace';
  lines.slice(0, 50).forEach((l, i) => ctx.fillText(l, 10, 20 + i * 16));
}
