// /lab.html?scene=landscape&season=autumn&tod=dusk&hour=17.5&moon=0.5&clarity=0.9&seed=3&w=1200&h=700
// The whole garden stack: backdrop → placeholder plants on the ground line → rocks → pond
// reflecting the scene above → light → a few seconds of weather. `perf=1` prints timings;
// `anim=1` keeps animating (for a real browser); `burst=1` fires a celebratory burst.
import type { PlantKind } from '../../core/types';
import type { Season, TimeOfDay, SceneEnv } from '../../ink/scene-types';
import { plantDrawing } from '../../ink/plants';
import { paintDrawing } from '../../ink/brush';
import { paintBackdrop, rockDrawing, paintPond, paintLight } from '../../ink/landscape';
import { Weather } from '../../ink/weather';

const HOURS: Record<TimeOfDay, number> = { dawn: 6.3, day: 11, dusk: 17.6, night: 21.5 };
const KINDS: Record<Season, PlantKind[]> = {
  spring: ['orchid', 'plum', 'bamboo', 'orchid', 'pine'],
  summer: ['bamboo', 'orchid', 'pine', 'bamboo', 'orchid'],
  autumn: ['chrysanthemum', 'bamboo', 'orchid', 'pine', 'chrysanthemum'],
  winter: ['plum', 'bamboo', 'pine', 'plum', 'orchid'],
};

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const dpr = window.devicePixelRatio || 1;
  const W = Number(p.get('w') ?? innerWidth), H = Number(p.get('h') ?? innerHeight);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const season = (p.get('season') ?? 'spring') as Season;
  const tod = (p.get('tod') ?? 'day') as TimeOfDay;
  const env: SceneEnv = {
    season, tod,
    hour: Number(p.get('hour') ?? HOURS[tod]),
    moonPhase: Number(p.get('moon') ?? 0.42),
    termIndex: 0,
    clarity: Number(p.get('clarity') ?? 0.9),
    seed: Number(p.get('seed') ?? 3),
  };
  const nPlants = Number(p.get('plants') ?? (W > 700 ? 5 : 3));
  const perf = p.get('perf') === '1';
  const t0 = performance.now();
  const bd = paintBackdrop(W, H, dpr, env);
  const tBackdrop = performance.now() - t0;

  // the scene above the water: backdrop + plants + rocks, as the garden would composite it
  const scene = document.createElement('canvas');
  scene.width = canvas.width; scene.height = canvas.height;
  const sc = scene.getContext('2d')!;
  sc.drawImage(bd.canvas, 0, 0);
  sc.setTransform(dpr, 0, 0, dpr, 0, 0);
  const kinds = KINDS[season];
  const plantH = (bd.groundY - H * 0.1) * 0.8;
  const t1 = performance.now();
  const slots = Array.from({ length: nPlants }, (_, i) => (i + 0.5) / nPlants);
  slots.forEach((u, i) => {
    const d = plantDrawing({ kind: kinds[i % kinds.length], seed: 11 + i * 7, height: 320 });
    const s = Math.min(plantH / d.height, (W / nPlants) * 0.9 / d.width);
    sc.save();
    sc.translate(u * W - d.anchor.x * s, bd.groundY - d.anchor.y * s);
    sc.scale(s, s);
    paintDrawing(sc, d, 1);
    sc.restore();
  });
  const rocks = W > 700 ? [0.28, 0.72] : [0.52];
  rocks.forEach((u, i) => {
    const size = Math.min(W, H) * (i ? 0.14 : 0.18);
    const r = rockDrawing(env.seed * 13 + i * 5 + Number(p.get('rock') ?? 0), size);
    sc.save();
    sc.translate(u * W - r.anchor.x, bd.groundY + 3 - r.anchor.y);
    paintDrawing(sc, r, 1);
    sc.restore();
  });
  const tPlants = performance.now() - t1;

  const ctx = canvas.getContext('2d')!;
  const weather = new Weather(env, W, H);
  const T = Number(p.get('t') ?? 8);
  for (let k = 0; k < T * 30; k++) weather.step(1 / 30, Number(p.get('wind') ?? 0));
  if (p.get('burst') === '1') {
    weather.burst(W * 0.5, bd.groundY - 80, undefined);
    for (let k = 0; k < 12; k++) weather.step(1 / 30);
  }

  const frame = (t: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scene, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintPond(ctx, { x: 0, y: bd.pondTop, w: W, h: H - bd.pondTop, t, source: scene, mirrorY: bd.pondTop, clarity: env.clarity, dpr, seed: env.seed, tod });
    paintLight(ctx, W, H, env);
    weather.draw(ctx);
  };
  frame(T);

  if (perf) {
    const N = 60;
    let a = performance.now();
    for (let i = 0; i < N; i++) paintPond(ctx, { x: 0, y: bd.pondTop, w: W, h: H - bd.pondTop, t: T + i / 30, source: scene, mirrorY: bd.pondTop, clarity: env.clarity, dpr, seed: env.seed, tod });
    ctx.getImageData(0, 0, 1, 1);
    const tPond = (performance.now() - a) / N;
    a = performance.now();
    for (let i = 0; i < N; i++) paintLight(ctx, W, H, env);
    ctx.getImageData(0, 0, 1, 1);
    const tLight = (performance.now() - a) / N;
    a = performance.now();
    for (let i = 0; i < N; i++) { weather.step(1 / 60); weather.draw(ctx); }
    ctx.getImageData(0, 0, 1, 1);
    const tWeather = (performance.now() - a) / N;
    a = performance.now();
    rockDrawing(99, 120);
    const tRock = performance.now() - a;
    frame(T);
    const msg = `backdrop ${tBackdrop.toFixed(0)}ms · plants ${tPlants.toFixed(0)}ms · pond ${tPond.toFixed(2)}ms · light ${tLight.toFixed(2)}ms · weather ${tWeather.toFixed(2)}ms · rockGen ${tRock.toFixed(1)}ms`;
    console.log(msg);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '12px system-ui';
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillText(msg, 8, H - 8);
  }

  if (p.get('anim') === '1') {
    let last = performance.now();
    const loop = (now: number) => {
      weather.step((now - last) / 1000);
      last = now;
      frame(now / 1000);
      requestAnimationFrame(loop);
    };
    canvas.addEventListener('click', (e) => weather.burst(e.offsetX, e.offsetY));
    requestAnimationFrame(loop);
  }
}
