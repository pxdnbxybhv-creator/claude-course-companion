// The focus timer's painting (一炷香): a bronze tripod censer (冲天耳三足炉, after the Xuande
// censers) on a small rosewood stand, one incense stick burning in a bed of pale ash, and smoke
// rising from its tip (see smoke.ts).
//
// The scene is TRANSPARENT: draw() paints no background, so put the canvas over paper (a CSS
// background or a paper canvas underneath) and clear it every frame before draw().
//
// Cost: resize() rasterises the censer once through the brush engine (~80–200 ms, cached as a
// device-resolution bitmap; a same-size resize is a no-op). A frame (step + draw) is one blit, a
// handful of stick/ember paths and the smoke (≈1–1.2k particles, ~90 bucketed strokes + one
// quarter-res mist layer): ≈0.6 ms step + ≈2 ms draw at 420×760 @2x in headless Chromium on a
// heavily loaded 4-core box (software GL) — expect well under that on a real device.
//
// Usage per frame:  scene.setProgress(p); scene.step(dt); ctx.clearRect(…); scene.draw(ctx).
// Pointer drags → scene.disturb(x, y, vx, vy). scene.tip() gives the ember position (e.g. to aim
// a "blow" at it). Pausing: setLit(false) — the ember dims over ~1 s and the smoke thins and fades.
import type { Drawing, Stroke, StrokePoint } from './types';
import { PIGMENTS } from './types';
import { rasterize } from './brush';
import { makeRng, makeNoise2, mixSeed, clamp, smoothstep, type Rng } from '../core/rng';
import { SmokePlume } from './smoke';

export interface IncenseScene {
  /** css px size and device pixel ratio. */
  resize(w: number, h: number, dpr: number): void;
  /** 0 = fresh stick, 1 = burnt out. */
  setProgress(p: number): void;
  setLit(lit: boolean): void;
  /** Advance the smoke simulation by dt seconds. */
  step(dt: number): void;
  /** Draw the whole scene (css-px coordinates; the caller has applied dpr scaling). Transparent: no background. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Disturb the smoke — pointer drag or a "blow". (x, y) css px, (dx, dy) velocity px/s. */
  disturb(x: number, y: number, dx: number, dy: number): void;
  /** Where the stick's tip is now (css px) — e.g. to aim a "blow" at it. */
  tip(): { x: number; y: number };
  /** Diagnostics for the lab. */
  stats(): { particles: number; strokes: number; ms?: { build: number; mist: number; blit: number; core: number } };
}

// ---------------------------------------------------------------------------
// Censer display list. Design space: 200 × 190, anchor at the stand's feet (100, 182).

export interface CenserLayout {
  drawing: Drawing;
  /** Where the stick enters the ash, design units. */
  stickBase: { x: number; y: number };
}

type P2 = [number, number];

const sp = (x: number, y: number, w: number): StrokePoint => ({ x, y, w });

/** Catmull-Rom through control points → dense polyline. */
function spline(ctrl: P2[], per = 8): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

export function censerDrawing(seed = 1): CenserLayout {
  const rng: Rng = makeRng(mixSeed(seed, 0xce2));
  const S: Stroke[] = [];
  let birth = 0;
  const add = (st: Omit<Stroke, 'birth' | 'seed'>) => {
    S.push({ ...st, birth: (birth += 0.001), seed: Math.floor(rng() * 1e9) });
  };
  const poly = (pts: P2[], soft = 2): StrokePoint[] => pts.map(([x, y], i) => sp(x, y, i === 0 ? soft : 0));
  /** A brush line along `pts` with width profile w(t), t ∈ 0..1. */
  const line = (pts: P2[], w: (t: number) => number): StrokePoint[] =>
    pts.map(([x, y], i) => sp(x, y, w(i / Math.max(1, pts.length - 1))));
  const taper = (wMax: number, a = 0.12, b = 0.2) => (t: number) =>
    wMax * Math.min(1, smoothstep(0, a, t) * 0.7 + 0.3) * (1 - 0.75 * smoothstep(1 - b, 1, t));

  const cx = 100;
  const { ink, ochre, malachite, white } = PIGMENTS;

  // --- ground shadow & stand (红木座) ---
  add({ kind: 'wash', pts: poly(ellipsePts(cx + 5, 180.5, 94, 6.5, 0, Math.PI * 2, 40), 8), tone: 0.13 });
  const slabTop = ellipsePts(cx, 161, 80, 7.5, 0, Math.PI * 2, 48);
  const front: P2[] = [
    ...ellipsePts(cx, 161, 80, 7.5, 0, Math.PI, 30),
    ...ellipsePts(cx, 166.5, 79, 7.5, Math.PI, 0, 30),
  ];
  const waist: P2[] = [
    ...ellipsePts(cx, 166, 73, 7, 0.1, Math.PI - 0.1, 26),
    ...ellipsePts(cx, 169, 72, 7, Math.PI - 0.1, 0.1, 26),
  ];
  add({ kind: 'wash', pts: poly(waist, 1), tone: 0.7, color: ink });
  add({ kind: 'wash', pts: poly(front, 1.2), tone: 0.6, color: ochre });
  add({ kind: 'wash', pts: poly(front, 1.2), tone: 0.82, color: ink });
  add({ kind: 'wash', pts: poly(slabTop, 1.5), tone: 0.7, color: ochre });
  add({ kind: 'wash', pts: poly(slabTop, 1.5), tone: 0.55, color: ink });
  // the censer's own shadow on the stand top
  add({ kind: 'wash', pts: poly(ellipsePts(cx + 6, 160, 58, 4.5, 0, Math.PI * 2, 30), 4), tone: 0.35, color: ink });
  // bracket feet at both ends, hooking inward (卷足)
  for (const dir of [-1, 1]) {
    const fx = cx + dir * 68;
    const pts: P2[] = [[fx + dir * 3, 170], [fx + dir * 3.5, 174], [fx + dir * 1.5, 177.5], [fx - dir * 3, 178.6], [fx - dir * 6, 177.4]];
    add({ kind: 'brush', pts: line(spline(pts, 5), taper(5.2, 0.05, 0.45)), tone: 0.88, dryness: 0.25 });
  }
  add({ kind: 'line', pts: line(ellipsePts(cx, 161.3, 80, 7.5, 0.06, Math.PI - 0.06, 30), () => 1), tone: 0.45 });

  // --- legs (乳足): back pair first (behind the belly), the front one later ---
  const leg = (x: number, top: number, foot: number, lean: number, w: number) => {
    const h = foot - top;
    const o: P2[] = [
      [x - w * 0.5, top], [x - w * 0.47, top + h * 0.42], [x - w * 0.3 + lean, top + h * 0.8], [x - w * 0.13 + lean, foot],
      [x + w * 0.13 + lean, foot], [x + w * 0.3 + lean, top + h * 0.8], [x + w * 0.47, top + h * 0.42], [x + w * 0.5, top],
    ];
    add({ kind: 'wash', pts: poly(spline(o, 4), 1), tone: 0.7, color: ochre });
    add({ kind: 'wash', pts: poly(spline(o, 4), 1), tone: 0.22, color: ink });
    const half: P2[] = [[x + lean * 0.3, top], [x + lean * 0.6, top + h * 0.5], ...o.slice(4, 7)];
    add({ kind: 'wash', pts: poly(half.concat([[x + w * 0.5, top]]), 1.2), tone: 0.45, color: ink });
    add({ kind: 'brush', pts: line(spline(o.slice(3, 8).reverse(), 4).reverse(), taper(2.4, 0.1, 0.35)), tone: 0.85 });
    add({ kind: 'line', pts: line(spline(o.slice(0, 5), 4), () => 1), tone: 0.65 });
  };
  leg(cx - 50, 136, 157.5, -2.5, 19);
  leg(cx + 50, 136, 157.5, 2.5, 19);
  leg(cx + 3, 141, 164.5, 0.5, 21);

  // --- belly ---
  const prof: P2[] = [[67, 73], [66.5, 78], [70, 85], [78, 94], [84, 104], [85.5, 112], [82.5, 121], [74, 130], [61, 137], [41, 141.5], [20, 143.4], [0, 144]];
  const right = spline(prof, 6).map(([hw, y]) => [cx + hw, y] as P2);
  const left = right.slice().reverse().map(([x, y]) => [2 * cx - x, y] as P2);
  const belly: P2[] = [...right, ...left.slice(1)];
  add({ kind: 'wash', pts: poly(belly, 1.2), tone: 0.72, color: ochre });
  // form shadow: crescents that hug the contour — the right flank, then the underside
  const crescent = (side: P2[], depth: (t: number) => number, dirX: number, dirY: number): P2[] => {
    const inner = side.map(([x, y], i) => {
      const t = i / (side.length - 1);
      return [x + dirX * depth(t), y + dirY * depth(t)] as P2;
    });
    return [...side, ...inner.reverse()];
  };
  const flank = right.filter(([, y]) => y > 77 && y < 142);
  add({ kind: 'wash', pts: poly(belly.filter(([x, y]) => y > 76 || x > cx), 2), tone: 0.16, color: ink });
  add({ kind: 'wash', pts: poly(crescent(flank, (t) => 52 * Math.sin(Math.PI * t) ** 0.8, -1, 0.2), 6), tone: 0.34, color: ink });
  add({ kind: 'wash', pts: poly(crescent(flank, (t) => 22 * Math.sin(Math.PI * t) ** 0.7, -1, 0.1), 3), tone: 0.36, color: ink });
  const under = belly.filter(([, y]) => y > 118);
  add({ kind: 'wash', pts: poly(crescent(under, (t) => 14 * Math.sin(Math.PI * t) ** 0.6, 0, -1), 1.2), tone: 0.36, color: ink });
  add({ kind: 'wash', pts: poly(crescent(left.slice().reverse().filter(([, y]) => y > 92 && y < 136), (t) => 6 * Math.sin(Math.PI * t), 1, 0), 3), tone: 0.14, color: ink });
  // metallic sheen: a pale glint on the lit shoulder
  add({ kind: 'wash', pts: poly(ellipsePts(cx - 46, 99, 15, 4.6, -0.35, Math.PI * 2 - 0.35, 18), 7), tone: 0.34, color: white });
  // a warm glow on the lit shoulder (宝光)
  add({ kind: 'wash', pts: poly(ellipsePts(cx - 40, 101, 22, 8, -0.3, Math.PI * 2 - 0.3, 18), 8), tone: 0.14, color: PIGMENTS.gamboge });
  // patina: a few malachite blooms and dark pits
  for (let i = 0; i < 4; i++) {
    const px = cx + rng.range(-40, 66), py = rng.range(106, 134);
    if (Math.abs(px - cx) > 70 - (py - 106) * 0.8) continue;
    add({ kind: 'wash', pts: poly(ellipsePts(px, py, rng.range(4, 8), rng.range(1.8, 3.5), 0, Math.PI * 2, 12), 2.5), tone: 0.22, color: malachite });
  }
  for (let i = 0; i < 7; i++) {
    const px = cx + rng.range(-50, 70), py = rng.range(102, 136);
    if (Math.abs(px - cx) > 78 - (py - 102) * 0.9) continue;
    add({ kind: 'dot', pts: [sp(px, py, rng.range(1, 2.2))], tone: 0.6 });
  }
  // shoulder band: two fine lines round the front, with a row of cloud-thunder (雷纹) ticks between
  const band = (y0: number, rx: number) => ellipsePts(cx, y0, rx, 8, 0.12, Math.PI - 0.12, 26);
  add({ kind: 'line', pts: line(band(81, 70), () => 0.9), tone: 0.7 });
  add({ kind: 'line', pts: line(band(88.5, 76), () => 0.9), tone: 0.6 });
  for (let i = 0; i < 13; i++) {
    const t = 0.2 + (i / 12) * (Math.PI - 0.4);
    const x = cx + 73 * Math.cos(t), y = 84.8 + 8 * Math.sin(t);
    const s = 1.8 * (0.6 + 0.4 * Math.sin(t));
    add({ kind: 'line', pts: [sp(x - s, y - s * 0.4, 0.8), sp(x + s * 0.6, y - s * 0.4, 0.8), sp(x + s * 0.6, y + s * 0.5, 0.8), sp(x - s * 0.3, y + s * 0.5, 0.7)], tone: 0.55 });
  }
  // contour: the shadow side heavier; the left edge broken once where the light hits it
  const rightC = right.filter(([, y]) => y > 76);
  const rc = Math.floor(rightC.length * 0.42);
  // two strokes that overlap at the widest point: shoulder → belly, belly → foot
  add({ kind: 'brush', pts: line(rightC.slice(0, rc + 2), (t) => 0.9 + 2.2 * Math.sin(Math.PI * (0.15 + 0.7 * t))), tone: 0.84, dryness: 0.3 });
  add({ kind: 'brush', pts: line(rightC.slice(rc - 1).map(([x, y]) => [x + 0.4, y] as P2), (t) => 3.2 * Math.sin(Math.PI * (0.12 + 0.8 * t)) + 0.4), tone: 0.88, dryness: 0.45 });
  const leftC = left.slice().reverse().filter(([, y]) => y > 76);
  const cut = Math.floor(leftC.length * 0.28);
  add({ kind: 'brush', pts: line(leftC.slice(0, cut), taper(1.6, 0.2, 0.5)), tone: 0.7 });
  add({ kind: 'brush', pts: line(leftC.slice(cut + 3), (t) => 0.8 + 2.0 * Math.sin(Math.PI * t)), tone: 0.8, dryness: 0.3 });


  // --- ears (冲天耳): upright loops standing on the rim ---
  const ear = (d: number) => {
    const x0 = cx + d * 57, x1 = cx + d * 70;
    const path: P2[] = [
      [x0, 71], [x0 + d * 0.4, 56], [x0 + d * 1.4, 46], [x0 + d * 4, 41], [x0 + d * 8, 39.3],
      [x1 + d * 1, 39.8], [x1 + d * 4, 43], [x1 + d * 5, 52], [x1 + d * 3, 70],
    ];
    const pts = spline(path, 4);
    add({ kind: 'brush', pts: line(pts, () => 7.5), tone: 0.7, color: ochre, dryness: 0 });
    add({ kind: 'brush', pts: line(pts.slice(pts.length * 0.5 | 0), (t) => 3.4 * (1 - 0.4 * t)), tone: 0.5 });
    // outer and inner outlines, offset from the centre line
    const off = (k: number) => pts.map(([x, y], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      return [x + nx * k * d, y + ny * k * d] as P2;
    });
    add({ kind: 'brush', pts: line(off(-3.9), (t) => 0.7 + 1.1 * Math.sin(Math.PI * t) * (d > 0 ? 1 : 0.7)), tone: 0.78 });
    add({ kind: 'line', pts: line(off(3.8).slice(2, -2), () => 0.9), tone: 0.5 });
    // glint along the lit side of the loop
    add({ kind: 'line', pts: line(off(-1.4).slice(2, pts.length * 0.45 | 0), () => 1.2), tone: 0.7, color: white });
  };
  ear(-1);
  ear(1);

  // --- rim, mouth, ash ---
  const mouthY = 68;
  add({ kind: 'wash', pts: poly(ellipsePts(cx, mouthY, 71.5, 12.5, 0, Math.PI * 2, 48), 1), tone: 0.7, color: ochre });
  add({ kind: 'wash', pts: poly(ellipsePts(cx + 20, mouthY + 4, 52, 8.5, 0, Math.PI * 2, 30), 3), tone: 0.2, color: ink });
  add({ kind: 'wash', pts: poly(ellipsePts(cx, mouthY + 0.5, 62, 9, 0, Math.PI * 2, 44), 1), tone: 0.82, color: ink });
  // ash bed: fills the near part of the opening, a dark crescent of inner wall shows behind
  const ash: P2[] = [
    ...ellipsePts(cx, mouthY + 0.5, 60.5, 8.2, -0.05, Math.PI + 0.05, 30),
    ...spline([[cx - 60, mouthY - 0.2], [cx - 30, mouthY - 4.2], [cx, mouthY - 5], [cx + 32, mouthY - 4], [cx + 60, mouthY - 0.2]], 5),
  ];
  add({ kind: 'fill', pts: poly(ash, 1.2), tone: 0.86, color: white });
  add({ kind: 'wash', pts: poly(ellipsePts(cx + 18, mouthY + 2.5, 40, 4, 0, Math.PI * 2, 20), 2), tone: 0.14, color: ink });
  add({ kind: 'wash', pts: poly(ellipsePts(cx, mouthY - 2.5, 52, 2.2, 0, Math.PI * 2, 20), 1.5), tone: 0.1, color: ink });
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0.2, Math.PI - 0.2), r = rng.range(0.2, 0.85);
    add({ kind: 'dot', pts: [sp(cx + 58 * r * Math.cos(a), mouthY + 1 + 7 * r * Math.sin(a) - 2, rng.range(0.8, 1.6))], tone: 0.28 });
  }
  // rim edges: front lip heavy (it has thickness), back lip and inner lip fine
  add({ kind: 'brush', pts: line(ellipsePts(cx, mouthY + 0.6, 71.5, 12.5, 0.02, Math.PI - 0.02, 40), (t) => 1.6 + 1.8 * Math.sin(Math.PI * t) * (0.6 + 0.4 * t)), tone: 0.86, dryness: 0.25 });
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY, 71.5, 12.5, Math.PI + 0.03, 2 * Math.PI - 0.03, 40), () => 1.1), tone: 0.7 });
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY + 0.5, 62, 9, 0.1, Math.PI - 0.1, 34), () => 0.9), tone: 0.6 });
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY + 0.5, 62, 9, Math.PI, 2 * Math.PI, 34), () => 0.8), tone: 0.8 });
  // light catching the top of the front lip
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY + 0.8, 67, 10.8, 0.45, Math.PI - 0.25, 30), () => 1.3), tone: 0.75, color: white });

  return {
    drawing: { width: 200, height: 190, anchor: { x: 100, y: 182 }, strokes: S },
    stickBase: { x: cx + 3, y: mouthY + 1.5 },
  };
}

// ---------------------------------------------------------------------------
// The scene

interface Flake { x: number; y: number; vx: number; vy: number; rot: number; vr: number; len: number; w: number; rest: number; floor: number }

export function createIncenseScene(seed = 1): IncenseScene {
  const rng = makeRng(mixSeed(seed, 0x1ce5));
  const nFlick = makeNoise2(mixSeed(seed, 0xf1a));
  const layout = censerDrawing(seed);
  const smoke = new SmokePlume(seed);

  let W = 0, H = 0, DPR = 1;
  let k = 1; // design units → css px
  let ox = 0, oy = 0; // css px of the design origin
  let bitmap: HTMLCanvasElement | null = null;
  let baseX = 0, baseY = 0, stickLen = 0;
  const tilt = (rng() - 0.5) * 0.035; // radians, a stick is never quite plumb
  let progress = 0, lit = false;
  let glow = 0; // eased ember brightness 0..1
  let time = 0;
  let ashLen = 2 + rng() * 5;
  let ashBreak = 7 + rng() * 8;
  let lastTipLen = -1;
  const flakes: Flake[] = [];

  // a short stub always stays standing in the ash
  const stub = () => 3.2 * (k / 1.2);
  const tipLen = () => stub() + (stickLen - stub()) * (1 - clamp(progress, 0, 1));
  const tipPos = (len: number) => ({ x: baseX + Math.sin(tilt) * len, y: baseY - Math.cos(tilt) * len });
  const burning = () => lit && progress < 0.999;

  function breakAsh(push = 0) {
    if (ashLen < 1.2) return;
    const t = tipPos(tipLen());
    const u = k / 1.2;
    const floor = baseY + rng.range(-1, 3) * u;
    const main: Flake = {
      x: t.x, y: t.y - ashLen * 0.5, vx: rng.range(-6, 6) + push, vy: rng.range(-4, 2),
      rot: tilt, vr: rng.range(-4, 4), len: ashLen, w: 2.1 * u, rest: 0, floor,
    };
    flakes.push(main);
    const crumbs = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < crumbs; i++) {
      flakes.push({
        x: t.x + rng.range(-1, 1), y: t.y - rng() * ashLen, vx: rng.range(-12, 12) + push * 1.3, vy: rng.range(-8, 0),
        rot: rng() * 3, vr: rng.range(-8, 8), len: rng.range(0.8, 1.8) * u, w: rng.range(0.8, 1.4) * u, rest: 0,
        floor: floor + rng.range(-1, 1.5),
      });
    }
    while (flakes.length > 24) flakes.shift();
    ashLen = 0;
    ashBreak = (6 + rng() * 9) * u;
  }

  const scene: IncenseScene = {
    resize(w, h, dpr) {
      if (w === W && h === H && dpr === DPR && bitmap) return;
      const hadLayout = !!bitmap;
      const oldTip = hadLayout ? tipPos(tipLen()) : null;
      W = w; H = h; DPR = dpr;
      const d = layout.drawing;
      k = Math.min((W * 0.6) / d.width, (H * 0.3) / d.height);
      ox = W / 2 - d.anchor.x * k;
      oy = H * 0.935 - d.anchor.y * k;
      bitmap = rasterize(d, 1, k * dpr);
      baseX = ox + layout.stickBase.x * k;
      baseY = oy + layout.stickBase.y * k;
      stickLen = Math.min(H * 0.46, baseY - H * 0.14);
      smoke.setUnit(Math.max(0.6, Math.min(W, H * 0.62) / 470));
      if (!hadLayout) ashLen = (3 + rng() * 5) * (k / 1.2);
      lastTipLen = -1;
      if (oldTip) {
        // keep the smoke (and falling ash) attached to the tip across re-layouts
        const nt = tipPos(tipLen());
        smoke.translate(nt.x - oldTip.x, nt.y - oldTip.y);
        for (const f of flakes) { f.x += nt.x - oldTip.x; f.y += nt.y - oldTip.y; f.floor += nt.y - oldTip.y; }
      }
    },
    setProgress(p) { progress = clamp(p, 0, 1); },
    setLit(v) { lit = v; },
    tip() {
      const t = tipPos(tipLen());
      return { x: t.x, y: t.y - (burning() ? ashLen : 0) };
    },
    stats: () => smoke.stats,
    step(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.25);
      time += dt;
      const len = tipLen();
      if (lastTipLen >= 0 && len < lastTipLen && burning()) {
        const d = lastTipLen - len;
        // a big jump (the view was away for a while): the ash has long since fallen
        if (d > 14 * (k / 1.2)) ashLen = (2 + rng() * 5) * (k / 1.2);
        else {
          ashLen += d * 0.85;
          if (ashLen > ashBreak) breakAsh();
        }
      }
      lastTipLen = len;
      const t = tipPos(len);
      smoke.x = t.x + Math.sin(tilt) * ashLen;
      smoke.y = t.y - Math.max(0.6 * ashLen, 1.5);
      glow += ((burning() ? 1 : 0) - glow) * (1 - Math.exp(-dt / (burning() ? 0.5 : 1.1)));
      if (glow < 0.004) glow = 0;
      smoke.emitting = glow > 0.12;
      smoke.strength = clamp((glow - 0.12) / 0.88, 0, 1) ** 0.7;
      smoke.step(dt);
      for (const f of flakes) {
        if (f.rest > 0) { f.rest += dt; continue; }
        f.vy += 260 * dt;
        f.vx *= Math.exp(-dt * 2.2);
        f.vy *= Math.exp(-dt * 0.8);
        f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
        if (f.y >= f.floor) { f.y = f.floor; f.rest = 1e-6; f.rot = Math.PI / 2 + (f.rot % 0.4); }
      }
      for (let i = flakes.length - 1; i >= 0; i--) if (flakes[i].rest > 1.8) flakes.splice(i, 1);
    },
    disturb(x, y, dx, dy) {
      smoke.disturb(x, y, dx, dy);
      // a strong gust right at the tip knocks the ash off
      const t = scene.tip();
      if (burning() && Math.hypot(x - t.x, y - t.y) < 30 && Math.hypot(dx, dy) > 500 && ashLen > 3) breakAsh(dx * 0.05);
    },
    draw(ctx) {
      if (!bitmap) return;
      ctx.drawImage(bitmap, ox, oy, bitmap.width / DPR, bitmap.height / DPR);
      const u = k / 1.2;
      const len = tipLen();
      const t = tipPos(len);
      const sw = 2.3 * u;
      ctx.save();
      ctx.lineCap = 'butt';
      if (len > 0.5) {
        // stick body: dark ochre with a faint lit edge on the left
        ctx.strokeStyle = '#5c3222';
        ctx.lineWidth = sw;
        ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(t.x, t.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(168,112,72,.5)';
        ctx.lineWidth = sw * 0.32;
        const ex = -sw * 0.28;
        ctx.beginPath(); ctx.moveTo(baseX + ex, baseY); ctx.lineTo(t.x + ex, t.y + 3 * u); ctx.stroke();
        // where it stands in the ash: a small darker collar
        ctx.fillStyle = 'rgba(40,34,30,.35)';
        ctx.beginPath(); ctx.ellipse(baseX, baseY + 0.4 * u, 3.2 * u, 1.1 * u, 0, 0, Math.PI * 2); ctx.fill();
      }
      const burnt = progress > 0.002;
      if (burnt && len > 0.5) {
        // charred band below the tip
        const ch = Math.min(len, 5 * u);
        const g = ctx.createLinearGradient(t.x, t.y + ch, t.x, t.y);
        g.addColorStop(0, 'rgba(40,24,18,0)');
        g.addColorStop(1, 'rgba(30,20,16,.95)');
        ctx.strokeStyle = g;
        ctx.lineWidth = sw * 1.02;
        ctx.beginPath(); ctx.moveTo(t.x, t.y + ch); ctx.lineTo(t.x, t.y); ctx.stroke();
        // ash column above the tip, a touch fatter and paler toward its end
        if (ashLen > 0.3) {
          const top = { x: t.x + Math.sin(tilt) * ashLen + 0.25 * u, y: t.y - ashLen };
          const ag = ctx.createLinearGradient(t.x, t.y, top.x, top.y);
          ag.addColorStop(0, '#6f6863');
          ag.addColorStop(0.35, '#a8a19a');
          ag.addColorStop(1, '#cbc5bc');
          ctx.strokeStyle = ag;
          ctx.lineWidth = sw * 1.12;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(top.x, top.y); ctx.stroke();
          ctx.lineCap = 'butt';
        }
      }
      if (glow > 0 && len > 0.5) {
        const fl = glow * (0.78 + 0.16 * nFlick(time * 2.1, 0.5) + 0.08 * nFlick(time * 9.3, 4.1));
        const gy = t.y - 0.6 * u;
        const R = 13 * u * (0.9 + 0.2 * fl);
        const g = ctx.createRadialGradient(t.x, gy, 0, t.x, gy, R);
        g.addColorStop(0, `rgba(255,150,70,${(0.42 * fl).toFixed(3)})`);
        g.addColorStop(0.25, `rgba(236,96,48,${(0.16 * fl).toFixed(3)})`);
        g.addColorStop(1, 'rgba(210,70,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(t.x, gy, R, 0, Math.PI * 2); ctx.fill();
        // the coal itself
        const cg = ctx.createLinearGradient(t.x, t.y + 3 * u, t.x, t.y - 1.2 * u);
        cg.addColorStop(0, 'rgba(160,40,20,0)');
        cg.addColorStop(0.45, `rgba(214,70,34,${(0.9 * fl).toFixed(3)})`);
        cg.addColorStop(0.8, `rgba(255,${Math.round(120 + 80 * fl)},80,${Math.min(1, 1.15 * fl).toFixed(3)})`);
        cg.addColorStop(1, `rgba(255,190,110,${(0.6 * fl).toFixed(3)})`);
        ctx.strokeStyle = cg;
        ctx.lineWidth = sw * 1.08;
        ctx.beginPath(); ctx.moveTo(t.x, t.y + 3 * u); ctx.lineTo(t.x, t.y - 1.2 * u); ctx.stroke();
      }
      // falling ash
      for (const f of flakes) {
        const a = f.rest > 0 ? clamp(1 - f.rest / 1.8, 0, 1) : 1;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.fillStyle = `rgba(150,144,136,${(0.9 * a).toFixed(3)})`;
        ctx.fillRect(-f.w / 2, -f.len / 2, f.w, f.len);
        ctx.restore();
      }
      ctx.restore();
      smoke.draw(ctx, W, H, DPR);
    },
  };
  return scene;
}

