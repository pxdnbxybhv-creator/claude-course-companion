// 开篇 · S11 入画 (spec §4 S11): the rabbit's short cut down through the painting — a fall past cloud
// and the temple ridge, the waterfall with peach light leaking through a cleft behind it (桃源, no
// words), a plop into the pool with 兰 in the rocks, a ride on a lotus pad past bamboo, the lotus
// lake and the water town with 菊 at a fence, a weir under a leaning 松 — and the ink-bleed from the
// foam into the viewer's own garden. One long painted strip (a 立轴 read top to bottom); the short
// cut and the governor's step 5 use its river part as a single plate.
import type { Drawing, Stroke } from '../../../ink/types';
import { paintStroke } from '../../../ink/brush';
import { plantDrawing } from '../../../ink/plants';
import { makeRng } from '../../../core/rng';
import { paintPreview } from '../../walk/preview';
import type { Cut } from '../../../app/intro';
import type { World } from './frames';
import { drawLanding, landingMask } from './frames';
import { C, ease, field, layer, mk, paint, release, span, st, type Lay } from './util';
import { drawRabbit, drawEnvelope } from './rabbit';
import { drawRings } from './rings';

export interface CountrySet { canvas: HTMLCanvasElement; steps: (() => void)[]; plate: HTMLCanvasElement | null; top: number; H: number;
  /** The water town's lanterns (plate px), hung at each house's river-side eave. */
  lanterns: { x: number; y: number }[]; dispose(): void }

/** Strip heights in frames: 0–1 sky and ridge · 1–2 waterfall · 2–4.1 the river · 4.1–4.4 the weir. */
const STRIP = 4.4;

export function countryGeo(lay: Lay) {
  const { h } = lay;
  return { pool: 1.58 * h, weir: 4.12 * h, SH: STRIP * h };
}

export function paintCountry(lay: Lay, cut: Cut): CountrySet {
  const { w, h, P } = lay;
  const dpr = lay.dpr * 0.6;
  const G = countryGeo(lay);
  const top = cut === 'full' ? 0 : 1.5 * h; // the short cut's single plate starts at the pool
  const SH = G.SH - top;
  const { c, g } = layer(w, SH, dpr);
  g.translate(0, -top);
  const rng = makeRng(0xc0a7);
  const set: CountrySet = { canvas: c, steps: [], plate: null, top, H: SH, lanterns: [], dispose() { release(set.plate); } };
  const river = (y: number) => w * 0.5 + Math.sin(y / h * 2.3) * w * 0.08;
  const rw = (y: number) => w * (P ? 0.46 : 0.3) * (0.9 + 0.2 * Math.sin(y / h * 1.7));
  // a plant, painted in six stroke slices (one paint step each: no single step holds the main thread long)
  const plant = (kind: 'orchid' | 'bamboo' | 'lotus' | 'chrysanthemum' | 'pine', x: number, y: number, ht: number, seed: number, flip = false) => {
    let d: Drawing | null = null;
    const N = 6;
    return Array.from({ length: N }, (_, i) => () => {
      if (!d) d = plantDrawing({ kind, seed, height: Math.round(ht) });
      const n = d.strokes.length, a = Math.floor((n * i) / N), b = Math.floor((n * (i + 1)) / N);
      g.save();
      g.translate(x, y);
      if (flip) g.scale(-1, 1);
      g.translate(-d.anchor.x, -d.anchor.y);
      for (let k = a; k < b; k++) if (d.strokes[k].birth <= 1) paintStroke(g, d.strokes[k], { scale: 1 });
      g.restore();
    });
  };
  set.steps.push(() => {
    // paper, the sky at the top, the river's water all the way down
    g.fillStyle = C.paper; g.fillRect(0, top, w, SH);
    if (top === 0) {
      const sky = g.createLinearGradient(0, 0, 0, h * 1.1);
      sky.addColorStop(0, '#9aa3ad'); sky.addColorStop(1, 'rgba(241,233,216,0)');
      g.fillStyle = sky; g.fillRect(0, 0, w, h * 1.1);
    }
    field(g, 0, Math.max(top, G.pool - h * 0.1), w, G.SH - Math.max(top, G.pool - h * 0.1), 0.08, (x, y, out) => {
      const d = Math.abs(x - river(y)) / (rw(y) / 2);
      out[0] = 61; out[1] = 90; out[2] = 115;
      const y0 = Math.max(top, G.pool - h * 0.1);
      out[3] = d < 1 ? 0.22 * (1 - d * d) ** 2 * Math.min(1, (y - y0) / (h * 0.14)) : 0;
    });
  });
  if (top === 0) {
    set.steps.push(() => {
      // cloud wisps, then the temple ridge with its pagoda (a crop of the walk's own preview)
      const S: Stroke[] = [];
      for (let i = 0; i < 3; i++) {
        const y = h * (0.15 + i * 0.22), x = w * (0.1 + rng() * 0.4);
        S.push(st('wash', [[x, y, 10], [x + w * 0.5, y - 12, 0], [x + w * 0.7, y + 6, 0], [x + w * 0.2, y + 18, 0]], 0.12, 400 + i, { color: '#ffffff' }));
      }
      paint(g, S, dpr);
      const pv = mk(Math.round(w * 1.4), Math.round(w * 0.7));
      paintPreview(pv);
      // the ridge and pagoda only (below the preview's sky and its disc), feathered to nothing at every edge
      // and multiplied into the strip, so its own paper vanishes into ours
      const cw = Math.round(pv.width * 0.7), ch = Math.round(pv.height * 0.42);
      const crop = mk(cw, ch);
      const cg = crop.getContext('2d')!;
      cg.drawImage(pv, pv.width * 0.3, pv.height * 0.36, cw, ch, 0, 0, cw, ch);
      cg.globalCompositeOperation = 'destination-in';
      cg.save();
      cg.translate(cw / 2, ch / 2); cg.scale(1, ch / cw);
      const fe = cg.createRadialGradient(0, 0, cw * 0.18, 0, 0, cw * 0.5);
      fe.addColorStop(0, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)');
      cg.fillStyle = fe; cg.fillRect(-cw / 2, -cw / 2, cw, cw);
      cg.restore();
      release(pv);
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.9;
      g.drawImage(crop, w * 0.3, h * 0.56, w * 0.9, w * 0.9 * (ch / cw));
      g.restore();
      release(crop);
    });
    set.steps.push(() => {
      // the waterfall: a cliff of dry strokes on the left 60 %, the thin fall, rocks round the cleft
      const S: Stroke[] = [];
      const y0 = h * 1.02, y1 = G.pool;
      for (let i = 0; i < 12; i++) {
        const x = w * (0.02 + rng() * 0.42), ya = y0 + rng() * h * 0.2;
        S.push(st('dry', [[x, ya, 14], [x + 20, ya + h * 0.25, 10], [x + 6, y1 - 20, 6]], 0.6, 500 + i, { color: C.ink, dryness: 0.55 }));
      }
      S.push(st('wash', [[0, y0, 20], [w * 0.44, y0 + 10, 0], [w * 0.46, y1, 0], [0, y1 + 20, 0]], 0.3, 520, { color: '#4a4a44' }));
      S.push(st('wash', [[w * 0.56, y0 + h * 0.1, 20], [w, y0, 0], [w, y1, 0], [w * 0.58, y1 - 10, 0]], 0.34, 521, { color: '#4a4a44' }));
      for (let i = 0; i < 6; i++) { const x = w * (0.6 + rng() * 0.35), y = y0 + h * (0.1 + rng() * 0.4); S.push(st('dry', [[x, y, 10], [x + 30, y + 50, 6]], 0.55, 530 + i, { color: C.ink, dryness: 0.6 })); }
      paint(g, S, dpr);
      // the fall at x 46 %: paper-white streaks
      g.strokeStyle = 'rgba(250,248,240,.9)';
      for (let i = 0; i < 6; i++) { g.lineWidth = 1 + rng() * 2; const x = w * 0.46 + (rng() - 0.5) * 12; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rng() - 0.5) * 6, y1); g.stroke(); }
    });
  }
  // the banks: 兰 in the rocks by the pool, bamboo, the lotus lake, the water town with 菊 at a fence, the pine over the weir
  const yB = (f: number) => h * f;
  const Lx = (y: number) => river(y) - rw(y) / 2, Rx = (y: number) => river(y) + rw(y) / 2;
  set.steps.push(...plant('orchid', Lx(yB(1.7)) - 8, yB(1.7), h * 0.14, 3));
  set.steps.push(...plant('bamboo', Rx(yB(2.25)) + w * 0.06, yB(2.35), h * 0.4, 5, true));
  set.steps.push(...plant('bamboo', Lx(yB(2.3)) - w * 0.05, yB(2.42), h * 0.34, 6));
  set.steps.push(...plant('lotus', river(yB(2.75)) - w * 0.12, yB(2.78), h * 0.16, 7));
  set.steps.push(...plant('lotus', river(yB(2.85)) + w * 0.12, yB(2.9), h * 0.14, 8));
  set.steps.push(() => {
    // the water town, in the brush: each house sits on a painted bank line, plastered walls (a pale fill with
    // 淡墨 edges), a dark-tiled roof with lifted eaves, a door and a small window; widths and heights vary
    const S: Stroke[] = [];
    const r = makeRng(0x70a);
    for (let i = 0; i < 5; i++) {
      const left = i % 2 === 0;
      const y = yB(3.05 + i * 0.12);
      const bw = w * (0.18 + r() * 0.12), hh = h * (0.05 + r() * 0.03);
      const x0 = left ? Lx(y) - bw - w * (0.01 + r() * 0.04) : Rx(y) + w * (0.01 + r() * 0.04), x1 = x0 + bw;
      const rise = hh * (0.35 + r() * 0.15);
      set.lanterns.push({ x: left ? x1 - bw * 0.04 : x0 + bw * 0.04, y: y - hh + 7 });
      // the bank under it (a dry stroke with stone steps down to the water)
      S.push(st('dry', [[x0 - bw * 0.25, y + 3, 4], [(x0 + x1) / 2, y + 5, 5], [x1 + bw * 0.25, y + 2, 3]], 0.55, 640 + i, { color: '#5a554b', dryness: 0.6 }));
      // walls: an opaque plaster base, then the brush's fill for grain
      g.fillStyle = '#f4efe4';
      g.fillRect(x0, y - hh, bw, hh);
      S.push(st('fill', [[x0, y - hh, 1], [x1, y - hh, 0], [x1, y, 0], [x0, y, 0]], 0.25, 610 + i, { color: '#e6dfcf' }));
      S.push(st('line', [[x0, y - hh * 1.02, 1.1], [x0 - 0.5, y, 0.9]], 0.55, 620 + i));
      S.push(st('line', [[x1, y - hh * 1.02, 1.1], [x1 + 0.5, y, 0.9]], 0.5, 625 + i));
      S.push(st('line', [[x0 - 2, y, 1.2], [x1 + 2, y + 0.5, 1]], 0.5, 630 + i));
      // the roof: a dark wash with the eaves lifted at both ends, a ridge line
      S.push(st('wash', [[x0 - bw * 0.1, y - hh + 1, 3], [x0 + bw * 0.08, y - hh - rise * 0.2, 0], [x0 + bw * 0.2, y - hh - rise, 0], [x1 - bw * 0.2, y - hh - rise, 0], [x1 - bw * 0.08, y - hh - rise * 0.2, 0], [x1 + bw * 0.1, y - hh + 1, 0]], 0.8, 600 + i, { color: '#2a2a2e' }));
      S.push(st('line', [[x0 + bw * 0.16, y - hh - rise, 1.6], [x1 - bw * 0.16, y - hh - rise - 0.5, 1.4]], 0.8, 650 + i));
      // the door (an arched dark fill) and a lattice window
      const dx = x0 + bw * (0.22 + r() * 0.4), dw = bw * 0.13;
      S.push(st('fill', [[dx, y, 1], [dx, y - hh * 0.5, 0], [dx + dw * 0.5, y - hh * 0.6, 0], [dx + dw, y - hh * 0.5, 0], [dx + dw, y, 0]], 0.8, 660 + i, { color: '#2b2722' }));
      const wx = dx > (x0 + x1) / 2 ? x0 + bw * 0.12 : x1 - bw * 0.26, wy = y - hh * 0.72;
      S.push(st('line', [[wx, wy, 0.9], [wx + bw * 0.14, wy, 0.9]], 0.5, 670 + i));
      S.push(st('line', [[wx, wy + hh * 0.22, 0.9], [wx + bw * 0.14, wy + hh * 0.22, 0.9]], 0.5, 675 + i));
      S.push(st('line', [[wx + bw * 0.07, wy, 0.8], [wx + bw * 0.07, wy + hh * 0.22, 0.8]], 0.45, 680 + i));
    }
    paint(g, S, dpr);
    // the bridge the rabbit passes under
    const by = yB(3.3), bx = river(by);
    g.strokeStyle = 'rgba(27,25,22,.75)'; g.lineWidth = 2.2;
    g.beginPath(); g.ellipse(bx, by + h * 0.02, rw(by) * 0.62, h * 0.05, 0, Math.PI, 0); g.stroke();
    paint(g, [
      st('dry', [[bx - rw(by) * 0.72, by - h * 0.028, 5], [bx, by - h * 0.036, 6], [bx + rw(by) * 0.72, by - h * 0.028, 5]], 0.45, 690, { color: '#6d685c', dryness: 0.6 }),
      st('line', [[bx - rw(by) * 0.7, by - h * 0.04, 1], [bx, by - h * 0.047, 1.1], [bx + rw(by) * 0.7, by - h * 0.04, 1]], 0.5, 691),
    ], dpr);
    // the fence along the right bank
    g.strokeStyle = 'rgba(80,70,50,.7)'; g.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) { const y = yB(3.45 + i * 0.012), x = Rx(y) + 8 + i * 7; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 22); g.stroke(); }
  });
  set.steps.push(...plant('chrysanthemum', Rx(yB(3.52)) + w * 0.12, yB(3.55), h * 0.13, 9, true));
  set.steps.push(...plant('chrysanthemum', Rx(yB(3.6)) + w * 0.24, yB(3.62), h * 0.11, 10));
  set.steps.push(() => {
    // the weir: a low band of dry-brushed stones across the river's width only, with the spill below it
    const y = G.weir;
    const x0 = Lx(y) - w * 0.04, x1 = Rx(y) + w * 0.04;
    const S: Stroke[] = [];
    S.push(st('dry', [[x0, y + h * 0.012, 9], [(x0 + x1) / 2, y + h * 0.018, 11], [x1, y + h * 0.01, 8]], 0.55, 700, { color: '#6d685c', dryness: 0.65 }));
    S.push(st('dry', [[x0 + 6, y + h * 0.026, 5], [x1 - 6, y + h * 0.028, 5]], 0.4, 701, { color: '#3b3730', dryness: 0.75 }));
    for (let i = 0; i < 8; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / 8;
      S.push(st('line', [[x, y + h * 0.006, 1.1], [x + 2, y + h * 0.026, 0.8]], 0.35, 710 + i));
    }
    paint(g, S, dpr);
    const spill = g.createLinearGradient(0, y + h * 0.03, 0, y + h * 0.07);
    spill.addColorStop(0, 'rgba(250,248,240,.8)'); spill.addColorStop(1, 'rgba(250,248,240,0)');
    g.fillStyle = spill; g.fillRect(x0 + 4, y + h * 0.03, x1 - x0 - 8, h * 0.04);
  });
  set.steps.push(...plant('pine', Rx(G.weir) + w * 0.02, G.weir + h * 0.02, h * 0.34, 12, true));
  set.steps.push(() => { set.plate = c; });
  return set;
}

/** The camera: the plate y at the top of the frame, and where the rabbit is (frame px). */
function camAt(W: World, t: number, single: boolean): { y: number; rabbit: { x: number; y: number; pose: 'stretch' | 'ride'; s: number } } {
  const { w, h, P } = W.lay;
  const G = countryGeo(W.lay);
  const rs = P ? 52 : 64;
  if (single) {
    // the short cut (59.5–64.3) or the governor's step 5: down the river on the pad, then the landing
    const t0 = W.cut === 'short' ? 59.5 : 74.4;
    const t1 = W.cut === 'short' ? 63.2 : 78.4;
    const y = h * 1.5 + (G.weir - h * 0.7 - h * 1.5) * ease.io(span(t, t0, t1));
    return { y, rabbit: { x: w * 0.5, y: h * 0.52, pose: 'ride', s: rs } };
  }
  if (t < 75.2) return { y: h * ease.in(span(t, 74.4, 75.2)), rabbit: { x: w * (P ? 0.5 : 0.46), y: h * (P ? 0.34 : 0.38) + h * 0.05 * Math.sin(t * 5), pose: 'stretch', s: rs } };
  if (t < 76.0) {
    const y = h + h * 0.2 * span(t, 75.2, 76.0);
    const fall = ease.in(span(t, 75.6, 76.0));
    return { y, rabbit: { x: w * 0.5, y: h * 0.34 + (G.pool - y - h * 0.34) * fall, pose: 'stretch', s: rs } };
  }
  const y = h * 1.2 + (G.weir - h * 0.7 - h * 1.2) * ease.io(span(t, 76.2, 79.2));
  return { y, rabbit: { x: w * 0.5, y: h * 0.52, pose: 'ride', s: rs } };
}

export function drawS11(g: CanvasRenderingContext2D, W: World, t: number, single: boolean): void {
  const { w, h, P } = W.lay;
  const S = W.country;
  const G = countryGeo(W.lay);
  const cam = camAt(W, t, single);
  g.fillStyle = C.paper;
  g.fillRect(0, 0, w, h);
  if (S?.plate) {
    const sy = Math.max(0, cam.y - S.top);
    const sc = S.plate.height / S.H;
    g.drawImage(S.plate, 0, sy * sc, S.plate.width, Math.min(h, S.H - sy) * sc, 0, Math.max(0, S.top - cam.y), w, Math.min(h, S.H - sy));
  }
  const toFrame = (py: number) => py - cam.y;
  if (!single) {
    // the peach-and-green light through the slit behind the fall (75.2–76.0, never above α .35); one petal slips out
    const glow = t < 75.6 ? 0.35 * span(t, 75.2, 75.6) : 0.35 * (1 - span(t, 75.6, 76.0));
    if (glow > 0) {
      const cx = w * (P ? 0.54 : 0.69), cy = toFrame(h * 1.35);
      const R = h * 0.26;
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, R);
      grd.addColorStop(0, `rgba(236,146,128,${glow})`); grd.addColorStop(0.3, `rgba(232,162,138,${glow * 0.8})`);
      grd.addColorStop(0.62, `rgba(168,202,140,${glow * 0.4})`); grd.addColorStop(1, 'rgba(168,202,140,0)');
      g.fillStyle = grd; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      // the slit itself: a warm sliver of light between the rock masses
      const sl = g.createLinearGradient(0, cy - h * 0.13, 0, cy + h * 0.13);
      sl.addColorStop(0, 'rgba(255,232,210,0)'); sl.addColorStop(0.5, `rgba(255,232,210,${Math.min(0.9, glow * 2.4)})`); sl.addColorStop(1, 'rgba(255,232,210,0)');
      g.fillStyle = sl;
      g.fillRect(cx - w * 0.014, cy - h * 0.13, w * 0.028, h * 0.26);
    }
    if (t >= 75.6 && t < 77.5) {
      const u = span(t, 75.6, 77.5);
      g.fillStyle = `rgba(184,58,75,${0.9 * (1 - u)})`;
      g.beginPath(); g.ellipse(w * 0.54 - u * w * 0.1 + Math.sin(u * 9) * 10, toFrame(h * 1.35) + u * h * 0.5, 4, 2.4, u * 6, 0, Math.PI * 2); g.fill();
    }
    // the plop (76.0)
    drawRings(g, w * 0.5, h * 0.58, w * 0.14, t - 76.0, { color: '250,248,240' });
  }
  // lanterns glow in the water town (铃 at 77.5, 77.8, 78.1)
  for (let i = 0; i < (S?.lanterns.length ?? 0); i++) {
    const L = S!.lanterns[i];
    const fx = L.x, fy = toFrame(L.y);
    if (fy < -30 || fy > h + 30) continue;
    const lit = 0.6 + 0.4 * Math.sin(t * 3 + i);
    const grd = g.createRadialGradient(fx, fy, 0, fx, fy, 26);
    grd.addColorStop(0, `rgba(217,166,46,${0.6 * lit})`); grd.addColorStop(1, 'rgba(217,166,46,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(fx, fy, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(27,25,22,.5)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(fx, fy - 9); g.lineTo(fx, fy - 5); g.stroke();
    g.fillStyle = C.cinnabar; g.beginPath(); g.ellipse(fx, fy, 3.6, 5, 0, 0, Math.PI * 2); g.fill();
  }
  // the weir's foam
  const wf = toFrame(G.weir + h * 0.035);
  if (wf > -10 && wf < h + 10) {
    const r = makeRng(0xf0a);
    const fx0 = w * 0.5 + Math.sin(G.weir / h * 2.3) * w * 0.08, fw = w * (P ? 0.46 : 0.3) * (0.9 + 0.2 * Math.sin(G.weir / h * 1.7)) + w * 0.06;
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(250,248,240,${0.5 + 0.4 * Math.sin(t * 6 + i)})`; g.beginPath(); g.arc(fx0 + (r() - 0.5) * fw, wf + r() * 10, 1 + r() * 2, 0, Math.PI * 2); g.fill(); }
  }
  // the rabbit (with the letter in its mouth), riding its lotus pad after the plop
  const R = cam.rabbit;
  const bob = Math.sin(t * 2.4) * 2;
  if (R.pose === 'ride' && (single || t >= 76.0)) {
    g.fillStyle = '#5f8a6e';
    g.beginPath(); g.ellipse(R.x, R.y + 4 + bob, R.s * 0.75, R.s * 0.22, 0, 0.25, Math.PI * 2 - 0.05); g.lineTo(R.x, R.y + 4 + bob); g.fill();
    g.strokeStyle = 'rgba(27,25,22,.4)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(R.x, R.y + 4 + bob, R.s * 0.75, R.s * 0.22, 0, 0.25, Math.PI * 2 - 0.05); g.stroke();
    drawRabbit(g, 'ride', R.s, W.lay.dpr, R.x, R.y + bob, {});
    drawEnvelope(g, R.x + R.s * 0.16, R.y - R.s * 0.52 + bob, R.s * 0.46, -0.1, W.sealMoon);
  } else if (!(t >= 75.95 && t < 76.2)) {
    const fs = R.s * 1.45;
    drawRabbit(g, 'stretch', fs, W.lay.dpr, R.x, R.y, { rot: 1.35, uy: 50 });
    drawEnvelope(g, R.x + fs * 0.05, R.y + fs * 0.42, fs * 0.4, 1.5, W.sealMoon);
  }
  // 78.4–79.5 (short: 63.2–64.3): the ink-bleed from the foam into the viewer's garden, inside its frame
  const b0 = single && W.cut === 'short' ? 63.2 : 78.4;
  const u = ease.out(span(t, b0, b0 + 1.1));
  if (u > 0) {
    const top = W.garden?.rect.y ?? h * 0.12;
    const a = ease.out(span(t, b0, b0 + 0.4));
    if (top > 0 && a > 0) {
      const fade = g.createLinearGradient(0, 0, 0, top + 12);
      fade.addColorStop(0, W.dark ? C.mount : C.paper); fade.addColorStop(0.9, W.dark ? C.mount : C.paper); fade.addColorStop(1, 'rgba(241,233,216,0)');
      g.save(); g.globalAlpha = a; g.fillStyle = fade; g.fillRect(0, 0, w, top + 12); g.restore();
    }
    const m = landingMask(W, w * 0.5, h * (single ? 0.6 : 0.72), u);
    drawLanding(g, W, m);
  }
}

export { mk };
