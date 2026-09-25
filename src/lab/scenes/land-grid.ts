// /lab.html?scene=land-grid&seed=3&clarity=0.8 — every season × time of day at once (backdrop,
// pond and light; no plants), to judge that it stays "the same place in different weather".
import type { Season, TimeOfDay, SceneEnv } from '../../ink/scene-types';
import { paintBackdrop, paintPond, paintLight } from '../../ink/landscape';
import { Weather } from '../../ink/weather';

const HOURS: Record<TimeOfDay, number> = { dawn: 6.3, day: 11, dusk: 17.6, night: 21.5 };

export default function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
  const tods: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
  const cw = Math.floor(W / 4), ch = Math.floor(H / 4);
  seasons.forEach((season, j) => {
    tods.forEach((tod, i) => {
      const env: SceneEnv = { season, tod, hour: HOURS[tod], moonPhase: Number(p.get('moon') ?? 0.45), termIndex: 0, clarity: Number(p.get('clarity') ?? 0.8), seed: Number(p.get('seed') ?? 3) };
      const bd = paintBackdrop(cw, ch, dpr, env);
      const cell = document.createElement('canvas');
      cell.width = cw * dpr; cell.height = ch * dpr;
      const c = cell.getContext('2d')!;
      c.drawImage(bd.canvas, 0, 0);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintPond(c, { x: 0, y: bd.pondTop, w: cw, h: ch - bd.pondTop, t: 5, source: bd.canvas, mirrorY: bd.pondTop, clarity: env.clarity, dpr, seed: env.seed, tod });
      paintLight(c, cw, ch, env);
      const wx = new Weather(env, cw, ch);
      for (let k = 0; k < 240; k++) wx.step(1 / 30);
      wx.draw(c);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(cell, i * cw * dpr, j * ch * dpr);
    });
  });
}
