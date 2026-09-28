// 开篇 · the film's moon (spec §8.1): the disc through the app's own moonPath (landscape.ts), soft
// maria, the rabbit silhouette pounding its medicine (drawn across the whole disc, so it reads even
// at a crescent), the lifted 烘云托月 halo, the dust puff on each strike, and the rippled reflection
// in slices. Everything is drawn per frame from cached bits; nothing here is expensive.
import { moonPath } from '../../../ink/landscape';
import { makeRng } from '../../../core/rng';
import { moonRabbitPath } from './rabbit';
import { C, ctxOf, mk } from './util';

export interface MoonOpts {
  maria?: boolean;
  rabbit?: { pestle?: number; lean?: number; flick?: number; sneeze?: number } | null;
  halo?: boolean | number;
  /** Earthshine on the dark limb (default .16). */
  earth?: number;
  /** Drawn as a reflection (slightly softer, cooler). */
  reflect?: boolean;
  alpha?: number;
}

const mariaCache = new Map<number, HTMLCanvasElement>();

/** Soft maria for a disc of radius r (css px), cached per rounded r at 2× for crispness. */
function mariaOf(r: number): HTMLCanvasElement {
  const R = Math.max(4, Math.round(r));
  const hit = mariaCache.get(R);
  if (hit) return hit;
  const s = 2;
  const c = mk(R * 2 * s, R * 2 * s);
  const g = ctxOf(c);
  g.scale(s, s);
  const rng = makeRng(0x3007);
  const blots: [number, number, number, number][] = [
    [-0.32, -0.28, 0.3, 0.2], [0.1, -0.42, 0.22, 0.14], [0.28, -0.1, 0.26, 0.15], [-0.05, 0.15, 0.2, 0.12],
    [0.34, 0.3, 0.18, 0.12], [-0.4, 0.22, 0.16, 0.1], [0.0, -0.1, 0.12, 0.1],
  ];
  for (const [bx, by, br, a] of blots) {
    for (let i = 0; i < 3; i++) {
      const x = R + (bx + (rng() - 0.5) * 0.12) * R, y = R + (by + (rng() - 0.5) * 0.12) * R, rr = br * R * (0.6 + rng() * 0.5);
      const grd = g.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, `rgba(120,130,146,${a})`);
      grd.addColorStop(1, 'rgba(120,130,146,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  }
  // a few crater pits
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.85;
    const x = R + Math.cos(a) * d, y = R + Math.sin(a) * d, rr = R * (0.025 + rng() * 0.04);
    g.strokeStyle = 'rgba(110,118,132,.22)';
    g.lineWidth = Math.max(0.5, R * 0.012);
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke();
  }
  if (mariaCache.size > 24) mariaCache.delete(mariaCache.keys().next().value as number);
  mariaCache.set(R, c);
  return c;
}

/** The moon at (x, y), radius r (css px), phase 0 new · .5 full. */
export function drawMoon(g: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number, o: MoonOpts = {}): void {
  if (r <= 0.5) return;
  const A = o.alpha ?? 1;
  g.save();
  g.globalAlpha *= A;
  // halo (烘云托月: the wash lifts around it)
  const halo = o.halo === undefined ? 0 : o.halo === true ? 1 : o.halo || 0;
  if (halo > 0) {
    const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const hr = r * 3.2;
    const grd = g.createRadialGradient(x, y, r * 0.9, x, y, hr);
    const k = halo * (0.12 + 0.18 * lit);
    grd.addColorStop(0, `rgba(${C.leadRGB},${k})`);
    grd.addColorStop(0.45, `rgba(${C.leadRGB},${k * 0.35})`);
    grd.addColorStop(1, `rgba(${C.leadRGB},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, hr, 0, Math.PI * 2); g.fill();
  }
  // earthshine disc
  g.fillStyle = `rgba(60,74,94,${o.earth ?? 0.22})`;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = `rgba(${C.leadRGB},0.16)`;
  g.lineWidth = 0.7;
  g.stroke();
  // the lit part
  g.save();
  moonPath(g, x, y, r, phase);
  g.fillStyle = o.reflect ? 'rgba(236,236,230,0.9)' : 'rgba(248,245,237,0.97)';
  g.fill();
  g.clip();
  if (o.maria !== false) g.drawImage(mariaOf(r), x - r, y - r, r * 2, r * 2);
  g.restore();
  // the rabbit, across the whole disc: maria-grey on the lit part, a pale ghost on the dark limb
  if (o.rabbit) {
    const path = moonRabbitPath(x - r * 0.12, y + r * 0.56, r * 1.02, o.rabbit);
    g.save();
    g.beginPath(); g.arc(x, y, r * 0.98, 0, Math.PI * 2); g.clip();
    g.save();
    moonPath(g, x, y, r, phase);
    g.clip();
    g.fillStyle = 'rgba(112,124,142,0.34)';
    g.fill(path);
    g.restore();
    // the dark limb: everything outside the lit path
    g.save();
    // even-odd: the bounding box minus the lit shape
    g.beginPath();
    g.rect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4);
    moonPathInto(g, x, y, r, phase);
    g.clip('evenodd');
    g.fillStyle = `rgba(${C.leadRGB},0.2)`;
    g.fill(path);
    g.restore();
    g.restore();
  }
  g.restore();
}

/** Append the lit shape to the current path (moonPath begins a new path, so it is rebuilt here). */
function moonPathInto(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, phase: number): void {
  const p = ((phase % 1) + 1) % 1;
  const waxing = p < 0.5;
  const k = Math.cos(2 * Math.PI * p);
  const s = waxing ? 1 : -1;
  const rx = Math.max(0.001, r * Math.abs(k));
  const dir = k > 0 ? s : -s;
  g.moveTo(cx, cy - r);
  g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
  if (dir > 0) g.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
  else g.ellipse(cx, cy, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
  g.closePath();
}

/** The dust puff on a strike: `n` lead-white dots leave the disc's lower-left limb and fade over 0.4 s. */
export function dustPuff(g: CanvasRenderingContext2D, x: number, y: number, r: number, since: number, n = 5, dur = 0.4, spread = 1): void {
  if (since < 0 || since > dur) return;
  const u = since / dur;
  const rng = makeRng(0xd057 + n);
  g.save();
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.62 + 0.32 * rng()) * spread + (1 - spread) * rng() * Math.PI * 2;
    const d = r * (0.96 + u * (0.22 + 0.3 * rng()));
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    g.fillStyle = `rgba(${C.leadRGB},${(1 - u) * 0.85})`;
    g.beginPath(); g.arc(px, py, Math.max(0.8, r * 0.035) * (1 + u * 0.6), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/**
 * The moon's reflection: paint it into a small sprite, then lay it down in horizontal slices that
 * sway (a ripple), stretched a little tall, softer below. `clarity` 1 is sharp, lower is murkier.
 */
export function drawMoonReflection(g: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number, t: number, clarity: number,
  o: { rabbit?: MoonOpts['rabbit']; slices?: number; alpha?: number } = {}): void {
  const s = 2;
  const pad = r * 0.4;
  const size = Math.ceil((r + pad) * 2 * s);
  const c = spriteCanvas(size);
  const sg = ctxOf(c);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.clearRect(0, 0, c.width, c.height);
  sg.setTransform(s, 0, 0, s, 0, 0);
  drawMoon(sg, r + pad, r + pad, r, phase, { rabbit: o.rabbit, maria: true, reflect: true, halo: o.rabbit ? 0.5 : 0.15, earth: 0.08 });
  const n = o.slices ?? 24;
  const H = (r + pad) * 2, W = H;
  const sh = H / n;
  const amp = r * (0.03 + (1 - clarity) * 0.12);
  g.save();
  g.globalAlpha *= (o.alpha ?? 1) * (0.35 + 0.55 * clarity);
  for (let i = 0; i < n; i++) {
    const v = i / n;
    const dx = Math.sin(t * 2.1 + i * 0.7) * amp * (0.5 + v);
    g.drawImage(c, 0, i * sh * s, c.width, sh * s + 1, x - W / 2 + dx, y - H / 2 * 1.08 + i * sh * 1.08, W, sh * 1.08 + 0.6);
  }
  g.restore();
}

let sprite: HTMLCanvasElement | null = null;

/** Drop the maria and the reflection sprite (the film's end). */
export function clearMoonCache(): void {
  for (const c of mariaCache.values()) { c.width = 0; c.height = 0; }
  mariaCache.clear();
  if (sprite) { sprite.width = 0; sprite.height = 0; }
  sprite = null;
}
function spriteCanvas(size: number): HTMLCanvasElement {
  if (!sprite || sprite.width < size) sprite = mk(size, size);
  return sprite;
}
