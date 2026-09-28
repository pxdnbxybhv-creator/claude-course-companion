// 开篇 · S8 月宫 (spec §4 S8): on the moon. Lead-white ground under a gently curved horizon, indigo
// night beyond, the 桂 tree, the rabbit pounding beside a mortar of whole herbs, 嫦娥's fan rising
// like a second, softer moon — and a crater for every thud. The camera pulls back over a pocked moon.
import type { Stroke } from '../../../ink/types';
import { makeRng } from '../../../core/rng';
import type { World } from './frames';
import { C, ease, field, layer, mk, paint, release, span, st, type Lay } from './util';
import { drawRabbit, drawPestle, drawMortar } from './rabbit';
import { dustPuff } from './moon';

export interface MoonGround { canvas: HTMLCanvasElement; steps: (() => void)[]; plate: HTMLCanvasElement | null; craters: { x: number; y: number; r: number }[]; dispose(): void }

/** The plate is 1.2× the frame (the pull-back to 0.86 must not show its edge). */
const OVER = 1.2;

export function paintGround(lay: Lay): MoonGround {
  const { w, h, P } = lay;
  const W = w * OVER, H = h * OVER;
  const ox = (W - w) / 2, oy = (H - h) / 2;
  const rng = makeRng(0x3009);
  const craters: { x: number; y: number; r: number }[] = [];
  const set: MoonGround = { canvas: mk(1, 1), steps: [], plate: null, craters, dispose() { release(set.plate); } };
  const { c, g } = layer(W, H, lay.dpr * 0.8);
  const hz = (x: number) => oy + h * (P ? 0.52 : 0.55) - Math.sin((x / W) * Math.PI) * h * 0.035;
  set.steps.push(() => {
    const sky = g.createLinearGradient(0, 0, 0, oy + h * 0.55);
    sky.addColorStop(0, '#141b27'); sky.addColorStop(1, '#2d3848');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // a few far stars (earth-lit dust)
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${C.leadRGB},${0.2 + rng() * 0.4})`; g.beginPath(); g.arc(rng() * W, rng() * oy * 2 + rng() * h * 0.4, 0.6 + rng(), 0, Math.PI * 2); g.fill(); }
    g.beginPath();
    g.moveTo(0, H);
    for (let i = 0; i <= 40; i++) { const x = (W * i) / 40; g.lineTo(x, hz(x)); }
    g.lineTo(W, H); g.closePath();
    const gr = g.createLinearGradient(0, oy + h * 0.5, 0, H);
    gr.addColorStop(0, '#e9e4d8'); gr.addColorStop(1, '#f5f1e8');
    g.fillStyle = gr; g.fill();
  });
  set.steps.push(() => {
    // grey mottling, soft
    g.save();
    g.beginPath(); g.moveTo(0, H); for (let i = 0; i <= 40; i++) { const x = (W * i) / 40; g.lineTo(x, hz(x)); } g.lineTo(W, H); g.closePath(); g.clip();
    field(g, 0, oy + h * 0.48, W, H - oy - h * 0.48, 0.15, (x, y, out) => {
      const n = Math.sin(x * 0.013 + Math.sin(y * 0.02) * 2) * Math.cos(y * 0.017 + x * 0.004);
      out[0] = 120; out[1] = 128; out[2] = 142; out[3] = Math.max(0, n) * 0.14;
    });
    g.restore();
    // about nine craters already, and room for the new ones
    for (let i = 0; i < 16; i++) {
      const x = ox + w * (0.05 + rng() * 0.9), y = oy + h * (P ? 0.6 : 0.62) + rng() * h * 0.36, r = 6 + rng() * 16;
      if (i >= 9) { craters.push({ x: x - ox, y: y - oy, r }); continue; }
      crater(g, x, y, r);
    }
    // more pits beyond the frame (the pull-back finds a moon pocked everywhere)
    for (let i = 0; i < 26; i++) {
      const edge = rng() < 0.5;
      const x = edge ? rng() * W : (rng() < 0.5 ? rng() * ox * 1.4 : W - rng() * ox * 1.4);
      const y = hz(x) + 12 + rng() * (H - hz(x) - 12);
      if (x > ox && x < ox + w && y < oy + h) continue;
      crater(g, x, y, 5 + rng() * 14);
    }
  });
  set.steps.push(() => {
    // the 桂 tree on the left: a 重墨 dry trunk, malachite-grey foliage dots, gamboge 桂花
    const S: Stroke[] = [];
    const tx = ox + w * (P ? 0.16 : 0.15), base = oy + h * 1.02, top = oy + h * (P ? 0.18 : 0.14);
    const span_ = w * (P ? 0.3 : 0.18);
    S.push(st('dry', [[tx, base, 26], [tx + 10, oy + h * 0.7, 20], [tx - 6, oy + h * 0.45, 14], [tx + 8, top + h * 0.12, 8]], 0.85, 1, { color: C.ink, dryness: 0.45 }));
    for (let b = 0; b < 5; b++) {
      const y0 = oy + h * (0.36 + b * 0.07), dir = b % 2 ? 1 : -1;
      S.push(st('dry', [[tx + 4, y0, 7], [tx + dir * span_ * 0.4, y0 - 30, 4], [tx + dir * span_ * 0.7, y0 - 50, 1.5]], 0.75, 10 + b, { color: C.ink, dryness: 0.6 }));
    }
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
      const x = tx + Math.cos(a) * span_ * 0.8 * d, y = top + h * 0.14 + Math.sin(a) * h * 0.13 * d;
      S.push(st('dot', [[x, y, 9 + rng() * 9]], 0.35 + rng() * 0.2, 100 + i, { color: i % 5 ? '#5d6e66' : C.malachite }));
    }
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
      S.push(st('dot', [[tx + Math.cos(a) * span_ * 0.75 * d, top + h * 0.14 + Math.sin(a) * h * 0.12 * d, 2.4 + rng() * 1.4]], 0.9, 300 + i, { color: C.gamboge }));
    }
    paint(g, S, lay.dpr * 0.8);
    set.plate = c;
  });
  return set;
}

function crater(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = 'rgba(120,128,142,.13)';
  g.beginPath(); g.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(80,86,96,.4)';
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(x, y, r, r * 0.38, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.5)';
  g.beginPath(); g.ellipse(x, y, r, r * 0.38, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
}

const THUDS = [61.5, 62.5, 64.5];

export function drawS8(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h, P } = W.lay;
  const G = W.ground;
  // the pull-back 1.0 → 0.86 over 63.0–67.1
  const s = 1 - 0.14 * ease.io(span(t, 63.0, 67.1));
  g.save();
  g.translate(w / 2, h * 0.6); g.scale(s, s); g.translate(-w / 2, -h * 0.6);
  if (G?.plate) g.drawImage(G.plate, -w * (OVER - 1) / 2, -h * (OVER - 1) / 2, w * OVER, h * OVER);
  else { g.fillStyle = '#e9e4d8'; g.fillRect(-w, -h, 3 * w, 3 * h); }
  // a new crater ring for every thud
  if (G) G.craters.slice(0, 3).forEach((c, i) => { if (t >= THUDS[i]) crater(g, c.x, c.y, c.r * Math.min(1, 0.4 + 0.6 * span(t, THUDS[i], THUDS[i] + 0.2))); });
  // 嫦娥's fan rises at 61.0, like a second, softer moon
  const fu = ease.out(span(t, 61.0, 62.0));
  if (fu > 0 && W.portrait) {
    const fs = P ? 0.34 * w : 0.24 * h;
    const fx = P ? 0.74 * w : 0.8 * w, fy = (P ? 0.22 : 0.24) * h + (1 - fu) * h * 0.12;
    g.save();
    g.globalAlpha = fu * 0.92;
    const halo = g.createRadialGradient(fx, fy, fs * 0.4, fx, fy, fs * 0.9);
    halo.addColorStop(0, `rgba(${C.leadRGB},.25)`); halo.addColorStop(1, `rgba(${C.leadRGB},0)`);
    g.fillStyle = halo; g.beginPath(); g.arc(fx, fy, fs * 0.9, 0, Math.PI * 2); g.fill();
    g.drawImage(W.portrait, fx - fs / 2, fy - fs / 2, fs, fs);
    g.restore();
  }
  // the rabbit pounding (head toward the earth), the mortar full of whole herbs
  const rs = P ? 70 : 90;
  const rx = w * (P ? 0.6 : 0.5), ry = h * (P ? 0.64 : 0.66) + rs * 0.3;
  const mx = w * (P ? 0.74 : 0.58), my = h * (P ? 0.7 : 0.72);
  // the pestle: up before a thud, down on it; at 63.5 it stays up, caught
  let ang = -0.2;
  for (const th of [...THUDS, 63.5]) {
    if (t >= th - 0.35 && t < th + 0.3) {
      if (th === 63.5) ang = t < th ? -0.2 - 0.9 * ease.out(span(t, th - 0.35, th - 0.1)) : -1.1;
      else ang = t < th ? -0.2 - 0.9 * ease.out(span(t, th - 0.35, th - 0.12)) + 1.1 * ease.in(span(t, th - 0.12, th)) : 0.05 - 0.25 * span(t, th, th + 0.3);
    }
  }
  if (t >= 63.5 && t < 64.15) ang = -1.1;
  drawMortar(g, mx, my, P ? 34 : 44);
  const sq = THUDS.some((th) => t >= th && t < th + 0.12) ? 0.94 : 1;
  drawRabbit(g, 'pound', rs, W.lay.dpr, rx, ry, { sy: sq });
  drawPestle(g, rs, rx - rs * 0.5 + rs * 0.7, ry - rs + rs * 0.75, ang + 0.2);
  for (const th of THUDS) dustPuff(g, mx - (P ? 22 : 28), my - 4, 14, t - th, 8, 0.45, 0);
  g.restore();
}
