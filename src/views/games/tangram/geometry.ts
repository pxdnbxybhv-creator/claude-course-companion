// 七巧板 · Tangram — pure geometry: the seven pieces, their transforms, figures drawn as half-cell
// masks, an exact-cover solver that finds one way to lay the pieces into a figure, and a sampled
// (rasterised) coverage test for the player's arrangement.
//
// Units: the small triangle's legs are 1, so the classic square has side 2√2 and area 8. Every
// figure here is drawn on a unit grid whose cells are full, empty, or split along a diagonal; in
// the solver each cell is four quarter-triangles (top, right, bottom, left).

export type Kind = 'L' | 'M' | 'S' | 'Q' | 'P';
export interface Pt { x: number; y: number }

/** Canonical outlines (small-leg units): right angles at the origin, hypotenuse of M horizontal. */
const RAW: Record<Kind, Pt[]> = {
  L: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
  M: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
  S: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
  Q: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  P: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }],
};

export function area(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function centroid(poly: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Each outline centred on its centroid (pieces rotate about their centre). */
export const LOCAL: Record<Kind, Pt[]> = Object.fromEntries(
  (Object.keys(RAW) as Kind[]).map((k) => {
    const c = centroid(RAW[k]);
    return [k, RAW[k].map((p) => ({ x: p.x - c.x, y: p.y - c.y }))];
  }),
) as Record<Kind, Pt[]>;

/** The seven pieces of a set, in a fixed order. */
export const SET: Kind[] = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];

/** A piece on the table: its centre, rotation in 45° steps (clockwise on screen), and mirror. */
export interface Placed { kind: Kind; x: number; y: number; rot: number; flip: boolean }

export function transformPts(pts: Pt[], rot: number, flip: boolean): Pt[] {
  const a = ((((rot % 8) + 8) % 8) * Math.PI) / 4;
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map((p) => {
    const x = flip ? -p.x : p.x;
    return { x: x * c - p.y * s, y: x * s + p.y * c };
  });
}

export function outlineOf(p: Placed): Pt[] {
  return transformPts(LOCAL[p.kind], p.rot, p.flip).map((q) => ({ x: q.x + p.x, y: q.y + p.y }));
}

const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

/** Does this orientation put every vertex on the unit lattice (given one vertex on it)? */
export function onLattice(kind: Kind, rot: number, flip: boolean): boolean {
  const v = transformPts(LOCAL[kind], rot, flip);
  return v.every((p) => near(p.x - v[0].x) && near(p.y - v[0].y));
}

/** Nudge a piece so its corners sit on lattice points, if it is close and its orientation allows. */
export function snap(p: Placed, reach = 0.3): Placed {
  if (!onLattice(p.kind, p.rot, p.flip)) return p;
  const v = outlineOf(p)[0];
  const dx = Math.round(v.x) - v.x, dy = Math.round(v.y) - v.y;
  if (Math.hypot(dx, dy) > reach) return p;
  return { ...p, x: p.x + dx, y: p.y + dy };
}

export function inPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ─── figures: half-cell masks ────────────────────────────────────────────────────────────────

/**
 * A figure drawn row by row: `#` full cell, `.` empty, and half cells split on a diagonal —
 * `A` ◤ upper-left · `B` ◥ upper-right · `C` ◢ lower-right · `D` ◣ lower-left.
 */
export interface Figure {
  id: string;
  zh: string;
  en: string;
  art: string[];
}

/** Quarter order within a cell: 0 top, 1 right, 2 bottom, 3 left. */
const HALF: Record<string, number[]> = { '#': [0, 1, 2, 3], A: [0, 3], B: [0, 1], C: [1, 2], D: [2, 3], '.': [], ' ': [] };

export interface Mask {
  w: number;
  h: number;
  /** 4 bits per cell (bit q = quarter q is inside). */
  cells: Uint8Array;
}

export function maskOf(art: string[]): Mask {
  const h = art.length, w = Math.max(...art.map((r) => r.length));
  const cells = new Uint8Array(w * h);
  art.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const qs = HALF[ch];
      if (!qs) throw new Error(`bad figure char ${ch}`);
      for (const q of qs) cells[y * w + x] |= 1 << q;
    }),
  );
  return { w, h, cells };
}

export function maskArea(m: Mask): number {
  let n = 0;
  for (const c of m.cells) for (let q = 0; q < 4; q++) if (c & (1 << q)) n++;
  return n / 4;
}

/** Which quarter of its cell a point (in cell-local 0..1 coords) falls in. */
function quarterAt(fx: number, fy: number): number {
  const a = fy < fx, b = fy < 1 - fx;
  return a && b ? 0 : a ? 1 : b ? 3 : 2;
}

/** Is a point (figure coords) inside the mask? */
export function maskHas(m: Mask, x: number, y: number): boolean {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
  const c = m.cells[cy * m.w + cx];
  return !!c && !!(c & (1 << quarterAt(x - cx, y - cy)));
}

/** Quarter-triangles of a mask as polygons (for painting the silhouette as one path). */
export function maskTriangles(m: Mask): Pt[][] {
  const out: Pt[][] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const c = m.cells[y * m.w + x];
      if (!c) continue;
      const tl = { x, y }, tr = { x: x + 1, y }, br = { x: x + 1, y: y + 1 }, bl = { x, y: y + 1 }, o = { x: x + 0.5, y: y + 0.5 };
      if (c === 15) { out.push([tl, tr, br, bl]); continue; }
      // halves become one triangle each, so the path has fewer seams
      if (c === 9) { out.push([tl, tr, bl]); continue; }
      if (c === 3) { out.push([tl, tr, br]); continue; }
      if (c === 6) { out.push([tr, br, bl]); continue; }
      if (c === 12) { out.push([tl, br, bl]); continue; }
      const q: Pt[][] = [[tl, tr, o], [tr, br, o], [br, bl, o], [bl, tl, o]];
      for (let k = 0; k < 4; k++) if (c & (1 << k)) out.push(q[k]);
    }
  return out;
}

// ─── solver ──────────────────────────────────────────────────────────────────────────────────

/** A piece laid into a figure (figure coordinates). */
export interface Slot { kind: Kind; x: number; y: number; rot: number; flip: boolean }

interface Option { slot: Slot; quarters: number[] }

/** Every lattice placement of `kind` inside a mask. */
function options(kind: Kind, m: Mask): Option[] {
  const out: Option[] = [];
  const seen = new Set<string>();
  for (let rot = 0; rot < 8; rot++)
    for (const flip of [false, true]) {
      if (!onLattice(kind, rot, flip)) continue;
      const v = transformPts(LOCAL[kind], rot, flip);
      // translate so vertex 0 lands on integer (ix, iy)
      for (let iy = -2; iy <= m.h + 2; iy++)
        for (let ix = -2; ix <= m.w + 2; ix++) {
          const cx = ix - v[0].x, cy = iy - v[0].y;
          const poly = v.map((p) => ({ x: p.x + cx, y: p.y + cy }));
          const minX = Math.min(...poly.map((p) => p.x)), minY = Math.min(...poly.map((p) => p.y));
          const maxX = Math.max(...poly.map((p) => p.x)), maxY = Math.max(...poly.map((p) => p.y));
          if (minX < -1e-6 || minY < -1e-6 || maxX > m.w + 1e-6 || maxY > m.h + 1e-6) continue;
          const qs: number[] = [];
          let ok = true;
          for (let y = Math.floor(minY + 1e-6); y < Math.ceil(maxY - 1e-6) && ok; y++)
            for (let x = Math.floor(minX + 1e-6); x < Math.ceil(maxX - 1e-6) && ok; x++)
              for (let q = 0; q < 4; q++) {
                const [qx, qy] = q === 0 ? [0.5, 1 / 6] : q === 1 ? [5 / 6, 0.5] : q === 2 ? [0.5, 5 / 6] : [1 / 6, 0.5];
                if (!inPoly(poly, x + qx, y + qy)) continue;
                if (!(m.cells[y * m.w + x] & (1 << q))) { ok = false; break; }
                qs.push((y * m.w + x) * 4 + q);
              }
          if (!ok || !qs.length) continue;
          const key = qs.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ slot: { kind, x: cx, y: cy, rot, flip }, quarters: qs });
        }
    }
  return out;
}

const solveCache = new Map<string, Slot[] | null>();

/** One way to lay the seven pieces into the figure, or null. Deterministic and memoised. */
export function solveFigure(art: string[]): Slot[] | null {
  const key = art.join('/');
  if (solveCache.has(key)) return solveCache.get(key)!;
  const m = maskOf(art);
  const total = m.cells.length * 4;
  const want = new Uint8Array(total);
  let need = 0;
  for (let i = 0; i < m.cells.length; i++) for (let q = 0; q < 4; q++) if (m.cells[i] & (1 << q)) { want[i * 4 + q] = 1; need++; }
  let res: Slot[] | null = null;
  if (need === 32) {
    const kinds: Kind[] = ['L', 'M', 'S', 'Q', 'P'];
    const left: Record<Kind, number> = { L: 2, M: 1, S: 2, Q: 1, P: 1 };
    const byQuarter: Record<Kind, Option[][]> = {} as Record<Kind, Option[][]>;
    for (const k of kinds) {
      byQuarter[k] = Array.from({ length: total }, () => []);
      for (const o of options(k, m)) for (const q of o.quarters) byQuarter[k][q].push(o);
    }
    const used = new Uint8Array(total);
    const chosen: Slot[] = [];
    let nodes = 0;
    const rec = (): boolean => {
      if (++nodes > 200000) return false;
      let q = -1;
      for (let i = 0; i < total; i++) if (want[i] && !used[i]) { q = i; break; }
      if (q < 0) return chosen.length === 7;
      for (const k of kinds) {
        if (!left[k]) continue;
        for (const o of byQuarter[k][q]) {
          if (o.quarters.some((x) => used[x])) continue;
          for (const x of o.quarters) used[x] = 1;
          left[k]--;
          chosen.push(o.slot);
          if (rec()) return true;
          chosen.pop();
          left[k]++;
          for (const x of o.quarters) used[x] = 0;
        }
      }
      return false;
    };
    if (rec()) res = chosen.slice();
  }
  solveCache.set(key, res);
  return res;
}

// ─── coverage (the win test) ────────────────────────────────────────────────────────────────

/**
 * Rasterise at `res` samples per unit: how much of the figure (placed with its top-left at `off`)
 * the pieces cover, and how much piece area lies outside it (both 0..1 of the figure's area).
 */
export function coverage(m: Mask, off: Pt, pieces: Placed[], res = 12): { covered: number; outside: number } {
  const polys = pieces.map(outlineOf);
  let inT = 0, cov = 0;
  const step = 1 / res;
  // sample off-centre so no sample sits exactly on a 45° edge
  const jx = step * 0.37, jy = step * 0.61;
  for (let y = jy; y < m.h; y += step)
    for (let x = jx; x < m.w; x += step) {
      if (!maskHas(m, x, y)) continue;
      inT++;
      const wx = x + off.x, wy = y + off.y;
      if (polys.some((p) => inPoly(p, wx, wy))) cov++;
    }
  let out = 0;
  for (const poly of polys) {
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const x0 = Math.floor(Math.min(...xs) * res) / res, y0 = Math.floor(Math.min(...ys) * res) / res;
    const x1 = Math.max(...xs), y1 = Math.max(...ys);
    for (let y = y0 + jy; y < y1; y += step)
      for (let x = x0 + jx; x < x1; x += step) if (inPoly(poly, x, y) && !maskHas(m, x - off.x, y - off.y)) out++;
  }
  return { covered: inT ? cov / inT : 0, outside: inT ? out / inT : 1 };
}

export const SOLVED = (c: { covered: number; outside: number }) => c.covered >= 0.985 && c.outside <= 0.015;
