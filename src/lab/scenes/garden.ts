// /lab.html?scene=garden&n=6&hour=10&term=15&clarity=0.8
// The garden still (renderGardenStill) with the demo habits — what the scroll export paints.
import { demoState } from '../../app/demo';
import { statsFor } from '../../core/habits';
import { todayKey } from '../../core/date';
import { seasonOfTerm } from '../../core/solarterms';
import { renderGardenStill } from '../../views/garden/scene';
import type { TimeOfDay } from '../../ink/scene-types';

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const today = todayKey();
  const s = demoState(today, 'zh');
  const n = Number(p.get('n') ?? 6);
  const plants = s.habits.slice(0, n).map((h) => ({ habit: h, stats: statsFor(h, s.checkins[h.id] ?? [], today) }));
  const hour = Number(p.get('hour') ?? 10);
  const term = Number(p.get('term') ?? 15);
  const tod: TimeOfDay = hour < 5 || hour >= 19.5 ? 'night' : hour < 7 ? 'dawn' : hour >= 17.5 ? 'dusk' : 'day';
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const t0 = performance.now();
  const still = await renderGardenStill({
    width: Math.round(W), height: Math.round(H), dpr, plants,
    env: { season: seasonOfTerm(term), tod, hour, moonPhase: 0.5, termIndex: term, clarity: Number(p.get('clarity') ?? 0.85), seed: 1127 },
  });
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(still, 0, 0);
  ctx.font = '12px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillText(`renderGardenStill ${plants.length} plants · ${Math.round(performance.now() - t0)} ms`, 10, canvas.height / dpr - 10);
}
