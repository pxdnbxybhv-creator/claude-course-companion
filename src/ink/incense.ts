// The focus timer's painting (一炷香): a bronze tripod censer (冲天耳三足炉, after the Xuande
// censers) on a small rosewood stand, one incense stick burning in a bed of pale ash, and smoke
// rising from its tip (see smoke.ts).
//
// The scene is TRANSPARENT: draw() paints no background, so put the canvas over paper (a CSS
// background or a paper canvas underneath) and clear it every frame before draw().
//
// Cost: resize() rasterises the censer once through the brush engine (~50–150 ms, cached as a
// device-resolution bitmap). A frame (step + draw) is a blit, a handful of stick/ember paths, and
// the smoke (~100 bucketed strokes + one upscaled mist layer): ~1–2.5 ms at 420×760 @2x.
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
  stats(): { particles: number; strokes: number };
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
  add({ kind: 'wash', pts: poly(ellipsePts(cx + 4, 181, 98, 7, 0, Math.PI * 2, 40), 7), tone: 0.14 });
  const slabTop = ellipsePts(cx, 160, 88, 8.5, 0, Math.PI * 2, 48);
  // front face of the slab: lower half of the top ellipse, pushed down
  const front: P2[] = [
    ...ellipsePts(cx, 160, 88, 8.5, 0, Math.PI, 30),
    ...ellipsePts(cx, 166.5, 86, 8.5, Math.PI, 0, 30),
  ];
  add({ kind: 'wash', pts: poly(front, 1.5), tone: 0.72, color: ink });
  add({ kind: 'wash', pts: poly(slabTop, 1.5), tone: 0.4, color: ochre });
  add({ kind: 'wash', pts: poly(slabTop, 1.5), tone: 0.42, color: ink });
  // feet: cloud-curl feet under the front face
  for (const [fx, dir] of [[cx - 70, -1], [cx + 70, 1], [cx - 24, -1], [cx + 24, 1]] as [number, number][]) {
    const small = Math.abs(fx - cx) < 50;
    const y0 = small ? 174.5 : 172;
    const pts: P2[] = [[fx, y0], [fx + dir * 1.5, y0 + 4], [fx + dir * 4.5, y0 + 7.5], [fx + dir * 8, y0 + 7.5]];
    add({ kind: 'brush', pts: line(spline(pts, 5), taper(small ? 4.5 : 6, 0.1, 0.35)), tone: 0.85, dryness: 0.3 });
  }
  add({ kind: 'line', pts: line(ellipsePts(cx, 160, 88, 8.5, 0.05, Math.PI - 0.05, 30), () => 1.1), tone: 0.55 });

  // --- legs (乳足): back pair first (behind the belly), the front one later ---
  const leg = (x: number, top: number, foot: number, lean: number) => {
    const h = foot - top;
    const outlinePts: P2[] = [
      [x - 10, top], [x - 8.5 + lean * 0.3, top + h * 0.45], [x - 5 + lean, top + h * 0.85], [x - 2.5 + lean, foot],
      [x + 2.5 + lean, foot], [x + 5 + lean, top + h * 0.85], [x + 8.5 + lean * 0.3, top + h * 0.45], [x + 10, top],
    ];
    add({ kind: 'wash', pts: poly(spline(outlinePts, 4), 1), tone: 0.5, color: ochre });
    add({ kind: 'wash', pts: poly(spline(outlinePts.slice(4), 4).concat([[x + 1 + lean * 0.5, top + h * 0.5]]), 1), tone: 0.45, color: ink });
    add({ kind: 'brush', pts: line(spline(outlinePts.slice(4).reverse(), 4).reverse(), taper(2.2, 0.1, 0.4)), tone: 0.8 });
    add({ kind: 'line', pts: line(spline(outlinePts.slice(0, 4), 4), () => 0.9), tone: 0.6 });
  };
  leg(cx - 44, 132, 155, -3);
  leg(cx + 44, 132, 155, 3);

  // --- belly ---
  const prof: P2[] = [[67, 73], [66.5, 78], [70, 85], [78, 94], [84, 104], [85.5, 112], [82.5, 121], [74, 130], [61, 137], [41, 141.5], [20, 143.4], [0, 144]];
  const right = spline(prof, 6).map(([hw, y]) => [cx + hw, y] as P2);
  const left = right.slice().reverse().map(([x, y]) => [2 * cx - x, y] as P2);
  const belly: P2[] = [...right, ...left.slice(1)];
  add({ kind: 'wash', pts: poly(belly, 1.2), tone: 0.55, color: ochre });
  // second bronze layer everywhere but the upper-left highlight
  const hl = (x: number, y: number) => Math.hypot((x - (cx - 38)) / 34, (y - 98) / 14);
  const layer2 = belly.map(([x, y]) => {
    const d = hl(x, y);
    if (d > 1.25) return [x, y] as P2;
    return [x + (x - (cx - 38)) * 0.05, y] as P2;
  });
  add({ kind: 'wash', pts: poly(layer2.filter(([x, y]) => hl(x, y) > 1.05 || x > cx), 1.5), tone: 0.28, color: ochre });
  // shading: the right flank and the underside turn away from the light
  const shade: P2[] = [
    ...spline([[cx + 30, 80], [cx + 58, 88], [cx + 74, 100]], 4),
    ...right.filter(([, y]) => y > 100),
    ...left.filter(([x]) => x < cx && x > cx - 60).slice(0, 8),
    ...spline([[cx - 40, 138], [cx - 10, 132], [cx + 26, 120], [cx + 50, 104], [cx + 44, 90], [cx + 30, 80]], 4),
  ];
  add({ kind: 'wash', pts: poly(shade, 3), tone: 0.34, color: ink });
  const deep: P2[] = [
    ...right.filter(([, y]) => y > 108),
    ...spline([[cx + 30, 142], [cx + 50, 133], [cx + 70, 120], [cx + 78, 108]], 4),
  ];
  add({ kind: 'wash', pts: poly(deep, 2.5), tone: 0.35, color: ink });
  // a warm glow on the lit shoulder (宝光)
  add({ kind: 'wash', pts: poly(ellipsePts(cx - 40, 99, 20, 7, 0, Math.PI * 2, 18), 4), tone: 0.12, color: PIGMENTS.gamboge });
  // patina: a few malachite blooms and dark pits
  for (let i = 0; i < 4; i++) {
    const px = cx + rng.range(-62, 66), py = rng.range(96, 132);
    if (Math.abs(px - cx) > 70 - (py - 96) * 0.4) continue;
    add({ kind: 'wash', pts: poly(ellipsePts(px, py, rng.range(4, 9), rng.range(2, 4), 0, Math.PI * 2, 12), 2.5), tone: 0.2, color: malachite });
  }
  for (let i = 0; i < 7; i++) {
    const px = cx + rng.range(-55, 70), py = rng.range(100, 136);
    add({ kind: 'dot', pts: [sp(px, py, rng.range(1, 2.4))], tone: 0.55 });
  }
  // shoulder band: two fine lines round the front, with a row of cloud-thunder (雷纹) ticks between
  const band = (y0: number, rx: number) => ellipsePts(cx, y0, rx, 8, 0.12, Math.PI - 0.12, 26);
  add({ kind: 'line', pts: line(band(81, 70), () => 0.9), tone: 0.65 });
  add({ kind: 'line', pts: line(band(88.5, 76), () => 0.9), tone: 0.55 });
  for (let i = 0; i < 13; i++) {
    const t = 0.2 + (i / 12) * (Math.PI - 0.4);
    const x = cx + 73 * Math.cos(t), y = 84.8 + 8 * Math.sin(t);
    const s = 1.8 * (0.6 + 0.4 * Math.sin(t));
    add({ kind: 'line', pts: [sp(x - s, y - s * 0.4, 0.8), sp(x + s * 0.6, y - s * 0.4, 0.8), sp(x + s * 0.6, y + s * 0.5, 0.8), sp(x - s * 0.3, y + s * 0.5, 0.7)], tone: 0.5 });
  }
  // contour: the shadow side heavier; the left edge broken once where the light hits it
  const rightC = right.filter(([, y]) => y > 76);
  add({ kind: 'brush', pts: line(rightC, (t) => 1.4 + 2.4 * Math.sin(Math.PI * clamp(t * 1.1, 0, 1))), tone: 0.85, dryness: 0.35 });
  const leftC = left.slice().reverse().filter(([, y]) => y > 76);
  const cut = Math.floor(leftC.length * 0.28);
  add({ kind: 'brush', pts: line(leftC.slice(0, cut), taper(1.6, 0.2, 0.5)), tone: 0.7 });
  add({ kind: 'brush', pts: line(leftC.slice(cut + 3), (t) => 0.8 + 2.0 * Math.sin(Math.PI * t)), tone: 0.78, dryness: 0.3 });

  // front leg
  leg(cx + 2, 139, 163, 0.5);

  // --- ears (冲天耳): upright loops standing on the rim ---
  const ear = (dir: number) => {
    const x0 = cx + dir * 55, x1 = cx + dir * 74;
    const path: P2[] = [
      [x0, 70], [x0 + dir * 0.5, 52], [x0 + dir * 2, 38], [x0 + dir * 5, 31.5], [x0 + dir * 12, 30],
      [x1 + dir * 5, 31.5], [x1 + dir * 7.5, 36], [x1 + dir * 7, 50], [x1 + dir * 3, 66],
    ];
    const pts = spline(path, 4);
    add({ kind: 'brush', pts: line(pts, () => 7), tone: 0.6, color: ochre, dryness: 0 });
    add({ kind: 'brush', pts: line(pts.slice(pts.length * 0.45 | 0), (t) => 2.8 * (1 - 0.5 * t)), tone: 0.45 });
    // outer and inner outlines, offset from the centre line
    const off = (k: number) => pts.map(([x, y], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      return [x + nx * k * dir, y + ny * k * dir] as P2;
    });
    add({ kind: 'line', pts: line(off(-3.6), () => 1.2), tone: 0.8 });
    add({ kind: 'line', pts: line(off(3.4).slice(2, -2), () => 0.9), tone: 0.6 });
  };
  ear(-1);
  ear(1);

  // --- rim, mouth, ash ---
  const mouthY = 68;
  add({ kind: 'wash', pts: poly(ellipsePts(cx, mouthY, 71.5, 12.5, 0, Math.PI * 2, 48), 1), tone: 0.55, color: ochre });
  add({ kind: 'wash', pts: poly(ellipsePts(cx, mouthY + 0.5, 62, 9, 0, Math.PI * 2, 44), 1), tone: 0.82, color: ink });
  // ash bed: fills the near part of the opening, a dark crescent of inner wall shows behind
  const ash: P2[] = [
    ...ellipsePts(cx, mouthY + 0.5, 60.5, 8.2, -0.05, Math.PI + 0.05, 30),
    ...spline([[cx - 60, mouthY - 0.2], [cx - 30, mouthY - 4.2], [cx, mouthY - 5], [cx + 32, mouthY - 4], [cx + 60, mouthY - 0.2]], 5),
  ];
  add({ kind: 'fill', pts: poly(ash, 1.2), tone: 0.92, color: white });
  add({ kind: 'wash', pts: poly(ellipsePts(cx + 16, mouthY + 3.5, 36, 3.5, 0, Math.PI * 2, 20), 2), tone: 0.1, color: ink });
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0.2, Math.PI - 0.2), r = rng.range(0.2, 0.85);
    add({ kind: 'dot', pts: [sp(cx + 58 * r * Math.cos(a), mouthY + 1 + 7 * r * Math.sin(a) - 2, rng.range(0.8, 1.6))], tone: 0.28 });
  }
  // rim edges: front lip heavy (it has thickness), back lip and inner lip fine
  add({ kind: 'brush', pts: line(ellipsePts(cx, mouthY + 0.6, 71.5, 12.5, 0.02, Math.PI - 0.02, 40), (t) => 1.6 + 1.8 * Math.sin(Math.PI * t) * (0.6 + 0.4 * t)), tone: 0.86, dryness: 0.25 });
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY, 71.5, 12.5, Math.PI + 0.03, 2 * Math.PI - 0.03, 40), () => 1.1), tone: 0.7 });
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY + 0.5, 62, 9, 0.1, Math.PI - 0.1, 34), () => 0.9), tone: 0.6 });
  add({ kind: 'line', pts: line(ellipsePts(cx, mouthY + 0.5, 62, 9, Math.PI, 2 * Math.PI, 34), () => 0.8), tone: 0.8 });

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
  let time = 0;
  let ashLen = 2 + rng() * 5;
  let ashBreak = 7 + rng() * 8;
  let lastTipLen = -1;
  const flakes: Flake[] = [];

  const tipLen = () => stickLen * (1 - clamp(progress, 0, 1));
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
      lastTipLen = -1;
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
        ashLen += (lastTipLen - len) * 0.85;
        if (ashLen > ashBreak) breakAsh();
      }
      lastTipLen = len;
      const t = tipPos(len);
      smoke.x = t.x + Math.sin(tilt) * ashLen;
      smoke.y = t.y - Math.max(0.6 * ashLen, 1.5);
      smoke.emitting = burning();
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
        ctx.strokeStyle = '#6a3520';
        ctx.lineWidth = sw;
        ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(t.x, t.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(176,104,62,.55)';
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
      if (burning() && len > 0.5) {
        const fl = 0.78 + 0.16 * nFlick(time * 2.1, 0.5) + 0.08 * nFlick(time * 9.3, 4.1);
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
        cg.addColorStop(0.8, `rgba(255,${Math.round(140 + 60 * fl)},80,1)`);
        cg.addColorStop(1, 'rgba(255,190,110,0.6)');
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

