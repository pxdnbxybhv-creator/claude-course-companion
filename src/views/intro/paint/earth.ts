// 开篇 · S2 (and S9): the land far below, seen from the moon (spec §4 S2). An indigo-ink wash with
// noise, three paler rivers, faint dry ridge contours, fading to 留白 over the bottom 18 %; the
// glints (26 in P, 40 in L, six groups) and the one square glint are drawn per frame at the places
// this layout gives. Also the moon's rim: the arc of the MOON_GATE circle (the limb becomes the rim).
import { MOON_GATE } from '../../../app/intro';
import { makeNoise2, makeRng } from '../../../core/rng';
import { C, field, layer, paint, st, type Lay, type PaintJob } from './util';

export interface Glint { x: number; y: number; r: number; group: number; sharp: boolean; ph: number }
export interface EarthLayout { glints: Glint[]; square: { x: number; y: number }; rivers: [number, number][][] }

/** Where the rivers run and the water glints (css px of the frame, before the 2 % drift). */
export function earthLayout(lay: Lay, seed = 0xea57): EarthLayout {
  const { w, h } = lay;
  const rng = makeRng(seed);
  const rivers: [number, number][][] = [];
  for (let k = 0; k < 3; k++) {
    const pts: [number, number][] = [];
    const x0 = w * (0.15 + 0.3 * k + rng() * 0.1);
    let x = x0;
    for (let i = 0; i <= 14; i++) {
      const y = h * (0.12 + (0.72 * i) / 14);
      x += (rng() - 0.5) * w * 0.09 + Math.sin(i * 0.9 + k) * w * 0.02;
      pts.push([x, y]);
    }
    rivers.push(pts);
  }
  const n = lay.P ? 26 : 40;
  const glints: Glint[] = [];
  for (let i = 0; i < n; i++) {
    const group = i % 6;
    let x: number, y: number;
    if (i % 3 !== 2) {
      const rv = rivers[i % 3];
      const j = 2 + Math.floor(rng() * (rv.length - 4));
      const f = rng();
      x = rv[j][0] + (rv[j + 1][0] - rv[j][0]) * f;
      y = rv[j][1] + (rv[j + 1][1] - rv[j][1]) * f;
    } else {
      x = w * (0.06 + rng() * 0.88);
      y = h * (0.22 + rng() * 0.58);
    }
    glints.push({ x, y, r: 4 + rng() * 4, group, sharp: i % 9 === 4, ph: rng() * 6 });
  }
  const square = lay.P ? { x: w * 0.46, y: h * 0.63 } : { x: w * 0.57, y: h * 0.6 };
  return { glints, square, rivers };
}

/** The land layer, painted at 0.75 × the stage dpr (soft), 4 % taller than the frame for the drift. */
export function paintEarth(lay: Lay, seed = 0xea57): PaintJob {
  const { w } = lay;
  const H = lay.h * 1.04;
  const dpr = lay.dpr * 0.75;
  const { c, g } = layer(w, H, dpr);
  const L = earthLayout(lay, seed);
  const noise = makeNoise2(seed);
  const rng = makeRng(seed ^ 0x55);
  const steps: (() => void)[] = [
    () => {
      g.fillStyle = C.paper;
      g.fillRect(0, 0, w, H);
      field(g, 0, 0, w, H, Math.min(0.5, dpr * 0.35), (x, y, out) => {
        const v = y / H;
        const fade = 1 - Math.max(0, Math.min(1, (v - 0.78) / 0.18));
        const n = 0.8 + 0.3 * noise.fbm(x / 180, y / 140, 3) + 0.1 * noise(x / 30, y / 30);
        out[0] = 30; out[1] = 39; out[2] = 52;
        out[3] = Math.min(0.95, 0.9 * n) * fade * fade;
      });
    },
    () => {
      // ridge contours: faint dry strokes
      const S = [];
      for (let k = 0; k < 7; k++) {
        const y0 = H * (0.2 + k * 0.09) + rng() * 20;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 10; i++) pts.push([w * (-0.05 + i * 0.11), y0 + Math.sin(i * 0.8 + k) * 18 + (rng() - 0.5) * 10, 3 + rng() * 2]);
        S.push(st('dry', pts, 0.22, k * 31 + 7, { color: '#0f141c', dryness: 0.8 }));
      }
      paint(g, S, dpr);
    },
    () => {
      // the rivers: pale threads
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const rv of L.rivers) {
        for (const [lw, a] of [[3, 0.08], [1.4, 0.22]] as [number, number][]) {
          g.strokeStyle = `rgba(${C.leadRGB},${a})`;
          g.lineWidth = lw;
          g.beginPath();
          rv.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
      }
      g.restore();
    },
  ];
  return { canvas: c, steps };
}

/** Draw the glints of groups appearing 4.5 … 7.0 s, twinkling; the square glint from 7.0. */
export function drawGlints(g: CanvasRenderingContext2D, L: EarthLayout, t: number, dy: number, alpha = 1): void {
  g.save();
  for (const gl of L.glints) {
    const at = 4.5 + gl.group * 0.5;
    const u = Math.max(0, Math.min(1, (t - at) / 0.4));
    if (u <= 0) continue;
    const tw = 0.75 + 0.25 * Math.sin(t * 3.1 + gl.ph);
    const a = u * tw * alpha;
    const x = gl.x, y = gl.y + dy;
    const rr = gl.r * (gl.sharp ? 0.7 : 1);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr * 1.8);
    grd.addColorStop(0, `rgba(${C.leadRGB},${0.9 * a})`);
    grd.addColorStop(gl.sharp ? 0.25 : 0.4, `rgba(${C.leadRGB},${0.35 * a})`);
    grd.addColorStop(1, `rgba(${C.leadRGB},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rr * 1.8, 0, Math.PI * 2); g.fill();
  }
  const su = Math.max(0, Math.min(1, (t - 7.0) / 0.3));
  if (su > 0) {
    const { x } = L.square;
    const y = L.square.y + dy;
    const s = 9;
    const grd = g.createRadialGradient(x, y, 0, x, y, 26);
    grd.addColorStop(0, `rgba(${C.leadRGB},${0.5 * su * alpha})`);
    grd.addColorStop(1, `rgba(${C.leadRGB},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill();
    // the square itself: feathered (three nested squares), α .9, turned ~4°: a lit pond, not a missing texture
    g.translate(x, y);
    g.rotate(0.07);
    for (const [k, a] of [[1.5, 0.22], [1.2, 0.35], [1, 0.9]] as [number, number][]) {
      const q = s * k;
      g.fillStyle = `rgba(250,248,240,${a * su * alpha})`;
      g.beginPath();
      if (typeof g.roundRect === 'function') g.roundRect(-q / 2, -q / 2, q, q, 1.5 * k); else g.rect(-q / 2, -q / 2, q, q);
      g.fill();
    }
  }
  g.restore();
}

/**
 * The moon's rim: the arc of the MOON_GATE circle (radius S·r centred at (x, rimY − S·r)), a lead-white
 * band with three 淡墨 crater rings, seen at the top of the frame.
 */
export function drawRim(g: CanvasRenderingContext2D, w: number, h: number, alpha = 1): void {
  const rim = MOON_GATE.rim(w, h);
  g.save();
  g.globalAlpha *= alpha;
  const grd = g.createRadialGradient(rim.x, rim.y, rim.r * 0.8, rim.x, rim.y, rim.r);
  grd.addColorStop(0, '#f6f2e8');
  grd.addColorStop(0.92, '#ece6d7');
  grd.addColorStop(1, '#ddd6c5');
  g.fillStyle = grd;
  g.beginPath(); g.arc(rim.x, rim.y, rim.r, 0, Math.PI * 2); g.fill();
  // the limb's soft light on the land below
  const glow = g.createRadialGradient(rim.x, rim.y, rim.r, rim.x, rim.y, rim.r * 1.12);
  glow.addColorStop(0, `rgba(${C.leadRGB},0.28)`);
  glow.addColorStop(1, `rgba(${C.leadRGB},0)`);
  g.fillStyle = glow;
  g.beginPath(); g.arc(rim.x, rim.y, rim.r * 1.12, 0, Math.PI * 2); g.fill();
  // three crater rings near the edge
  g.strokeStyle = 'rgba(110,118,132,.35)';
  g.lineWidth = 1.2;
  const bottom = rim.y + rim.r;
  for (const [fx, dy, rx] of [[0.2, 0.35, 0.09], [0.62, 0.55, 0.06], [0.84, 0.25, 0.045]] as [number, number, number][]) {
    const x = w * fx;
    const yEdge = rim.y + Math.sqrt(Math.max(0, rim.r * rim.r - (x - rim.x) ** 2));
    const y = Math.min(bottom, yEdge) - h * 0.04 * (1 + dy);
    g.beginPath(); g.ellipse(x, y, w * rx, w * rx * 0.32, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(120,128,142,.1)';
    g.fill();
  }
  g.restore();
}
