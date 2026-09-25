// Pure 2D geometry helpers for the world (polylines, splines, distances). No three.js.

export interface Poly {
  x: Float64Array;
  z: Float64Array;
  s: Float64Array;
  length: number;
  closed: boolean;
}

export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Sample a Catmull-Rom spline through `pts` densely (every ~0.25 m). */
export function spline(pts: [number, number][], closed: boolean, step = 0.25): Poly {
  const n = pts.length;
  const xs: number[] = [], zs: number[] = [];
  const segs = closed ? n : n - 1;
  const at = (i: number) => pts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < segs; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      xs.push(catmull(a[0], b[0], c[0], d[0], t));
      zs.push(catmull(a[1], b[1], c[1], d[1], t));
    }
  }
  if (closed) { xs.push(xs[0]); zs.push(zs[0]); } else { xs.push(pts[n - 1][0]); zs.push(pts[n - 1][1]); }
  const s = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), s, length: s[s.length - 1], closed };
}

/** Point and unit tangent at arc length s. */
export function polyAt(p: Poly, s: number): { x: number; z: number; tx: number; tz: number } {
  if (p.closed) s = ((s % p.length) + p.length) % p.length;
  else s = Math.max(0, Math.min(p.length, s));
  let lo = 0, hi = p.s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p.s[m] <= s) lo = m; else hi = m;
  }
  const seg = p.s[hi] - p.s[lo] || 1;
  const t = (s - p.s[lo]) / seg;
  const dx = p.x[hi] - p.x[lo], dz = p.z[hi] - p.z[lo];
  const l = Math.hypot(dx, dz) || 1;
  return { x: p.x[lo] + dx * t, z: p.z[lo] + dz * t, tx: dx / l, tz: dz / l };
}

export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function polyDist(p: Poly, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < p.x.length; i++) {
    const d = segDist(x, z, p.x[i - 1], p.z[i - 1], p.x[i], p.z[i]);
    if (d < best) best = d;
  }
  return best;
}

export function rawPolyDist(pts: [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return best;
}

