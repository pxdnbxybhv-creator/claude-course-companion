// Jiangnan architecture kit for the water regions: gable and hip roofs with concave slopes and
// upturned eaves (tile rows drawn as ink lines), horse-head gable walls (马头墙), and whole houses
// with painted façades mapped from the atlas. Everything is built in a local frame and placed with
// one matrix; geometry goes into the caller's Parts collectors (merged per material later).
import type * as T from 'three';
import { Kit, Parts } from './water-kit';
import { CELL, cellUV } from './water-paint';

export const TILE = '#55544f';
export const RIDGE = '#3b3a38';
export const PLINTH = '#9f998d';
export const WOODC = '#5e4030';
export const STONE = '#c9c2b3';

type V3 = [number, number, number];
type UV = [number, number, number, number];

/** Quads with per-face uv rects and a vertex colour, in local coordinates. */
export class Quads {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  quad(a: V3, b: V3, c: V3, d: V3, r: UV, k = 1, tint: V3 = [1, 1, 1]): void {
    // a bottom-left, b bottom-right, c top-right, d top-left (counter-clockwise seen from the front)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const [u0, v0, u1, v1] = r;
    const P: [V3, number, number][] = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [a, u0, v0], [c, u1, v1], [d, u0, v1]];
    for (const [p, u, v] of P) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(u, v);
      this.col.push(tint[0] * k, tint[1] * k, tint[2] * k);
    }
  }
  geometry(kit: Kit): T.BufferGeometry {
    const THREE = kit.T;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Remap a geometry's uv planar-ly from its (x, y) extent into an atlas rect; add a vertex colour. */
export function planarUV(kit: Kit, g: T.BufferGeometry, r: UV, tint: V3 = [1, 1, 1]): T.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  ng.computeBoundingBox();
  const bb = ng.boundingBox!;
  const p = ng.attributes.position;
  const uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  const sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = r[0] + ((p.getX(i) - bb.min.x) / sx) * (r[2] - r[0]);
    uv[i * 2 + 1] = r[1] + ((p.getY(i) - bb.min.y) / sy) * (r[3] - r[1]);
    col.set(tint, i * 3);
  }
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  ng.setAttribute('uv', new kit.T.BufferAttribute(uv, 2));
  ng.setAttribute('color', new kit.T.BufferAttribute(col, 3));
  return ng;
}

function colored(kit: Kit, pos: number[], idx: number[], color: string, jitter: number, seed: number): T.BufferGeometry {
  const THREE = kit.T;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return kit.tint(g, color, jitter, seed);
}

export interface RoofOpts {
  /** Half length along x at the eave (ridge ends for a gable). */
  Lx: number;
  /** Half depth (z) from the ridge to the eave line. */
  D: number;
  eaveY: number;
  ridgeY: number;
  /** Corner upturn at the eave ends (m). */
  lift: number;
  U?: number; V?: number;
  color?: string;
  /** Tile-row spacing (m) for the ink lines. */
  row?: number;
}

/** A two-slope roof (悬山 / 硬山): concave slopes, eave corners turned up. Local: ridge along x. */
export function gableRoof(kit: Kit, o: RoofOpts, seed = 1): { geo: T.BufferGeometry; lines: number[] } {
  const U = o.U ?? 10, V = o.V ?? 6;
  const pos: number[] = [], idx: number[] = [], lines: number[] = [];
  const at = (u: number, v: number, s: number): V3 => {
    const e = Math.abs(u);
    const lift = o.lift * Math.pow(e, 4) * v * v + (o.lift > 0 ? 0.06 * Math.pow(e, 3) : 0);
    const y = o.ridgeY - (o.ridgeY - o.eaveY) * (1 - Math.pow(1 - v, 1.5)) + lift;
    return [u * o.Lx * (1 + 0.05 * (o.lift > 0 ? 1 : 0) * v * Math.pow(e, 3)), y, s * o.D * v];
  };
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) pos.push(...at(-1 + (2 * i) / U, j / V, s));
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
      const a = base + j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
      if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    // fascia: a thin board down from the eave edge
    const fb = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const p = at(-1 + (2 * i) / U, 1, s);
      pos.push(p[0], p[1], p[2], p[0], p[1] - 0.12, p[2] - s * 0.02);
    }
    for (let i = 0; i < U; i++) {
      const a = fb + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (s > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
    // ink: tile rows down the slope, the eave and verge lines
    const rows = Math.max(4, Math.round((o.Lx * 2) / (o.row ?? 0.32)));
    for (let k = 0; k <= rows; k++) {
      const u = -1 + (2 * k) / rows;
      for (let j = 0; j < V; j++) {
        const p = at(u, j / V, s), q = at(u, (j + 1) / V, s);
        lines.push(p[0], p[1] + 0.025, p[2], q[0], q[1] + 0.025, q[2]);
      }
    }
    for (let i = 0; i < U; i++) {
      const p = at(-1 + (2 * i) / U, 1, s), q = at(-1 + (2 * (i + 1)) / U, 1, s);
      lines.push(p[0], p[1] - 0.12, p[2], q[0], q[1] - 0.12, q[2]);
    }
  }
  return { geo: colored(kit, pos, idx, o.color ?? TILE, 0.12, seed), lines };
}

/** A hip roof (庑殿 / 歇山 look) over a rectangle a×b with a ridge of half length r; corners flare up. */
export function hipRoof(kit: Kit, o: { a: number; b: number; r: number; eaveY: number; ridgeY: number; lift: number; U?: number; V?: number; color?: string }, seed = 2): { geo: T.BufferGeometry; lines: number[] } {
  const U = o.U ?? 8, V = o.V ?? 7;
  const pos: number[] = [], idx: number[] = [], lines: number[] = [];
  // side k: 0 front (+z), 1 right (+x), 2 back, 3 left. Param t in −1..1 along the side.
  const at = (k: number, t: number, v: number): V3 => {
    const f = 1 - Math.pow(1 - v, 1.55);
    const ax = o.a + (o.r - o.a) * v, bz = o.b * (1 - v);
    const e = Math.abs(t);
    const flare = 1 + 0.1 * Math.pow(e, 3) * (1 - v);
    const y = o.eaveY + (o.ridgeY - o.eaveY) * f + o.lift * Math.pow(e, 3.2) * Math.pow(1 - v, 2);
    let x: number, z: number;
    if (k === 0) { x = t * ax; z = bz; } else if (k === 2) { x = -t * ax; z = -bz; } else if (k === 1) { x = ax; z = -t * bz; } else { x = -ax; z = t * bz; }
    return [x * flare, y, z * flare];
  };
  for (let k = 0; k < 4; k++) {
    const base = pos.length / 3;
    for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) pos.push(...at(k, -1 + (2 * i) / U, j / V));
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
      const a = base + j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const fb = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const p = at(k, -1 + (2 * i) / U, 0);
      pos.push(p[0], p[1], p[2], p[0], p[1] - 0.12, p[2]);
    }
    for (let i = 0; i < U; i++) { const a = fb + i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
    const rows = k % 2 === 0 ? Math.round((o.a * 2) / 0.3) : Math.round((o.b * 2) / 0.3);
    for (let q = 1; q < rows; q++) {
      const t = -1 + (2 * q) / rows;
      for (let j = 0; j < V; j++) {
        const p = at(k, t, j / V), r = at(k, t, (j + 1) / V);
        lines.push(p[0], p[1] + 0.025, p[2], r[0], r[1] + 0.025, r[2]);
      }
    }
    for (let j = 0; j < V; j++) { // hips
      const p = at(k, 1, j / V), r = at(k, 1, (j + 1) / V);
      lines.push(p[0], p[1] + 0.04, p[2], r[0], r[1] + 0.04, r[2]);
    }
    for (let i = 0; i < U; i++) {
      const p = at(k, -1 + (2 * i) / U, 0), r = at(k, -1 + (2 * (i + 1)) / U, 0);
      lines.push(p[0], p[1] - 0.12, p[2], r[0], r[1] - 0.12, r[2]);
    }
  }
  return { geo: colored(kit, pos, idx, o.color ?? TILE, 0.1, seed), lines };
}

/** Transform a flat position list (line segments) by a matrix. */
export function xfLines(kit: Kit, pos: number[], m: T.Matrix4): number[] {
  const v = new kit.T.Vector3();
  const out = new Array<number>(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
}

export interface Collectors {
  walls: Parts;   // atlas-textured toon
  solid: Parts;   // vertex-coloured toon
  roofs: Parts;   // vertex-coloured toon, double-sided
}

export type Front = 'shop' | 'home' | 'tea' | 'wall';

export interface HouseSpec {
  x: number; z: number; ry: number;
  w: number; d: number;
  floors: 1 | 2;
  gable: 'horse' | 'plain';
  front: Front;
  /** Signboard index (water-paint SIGNS) hung beside the door. */
  sign?: number;
  seed: number;
  /** Extra: a pent eave along the front between floors. */
  pent?: boolean;
}

export interface HouseOut {
  matrix: T.Matrix4;
  y0: number;
  eaveH: number;
  ridgeY: number;
}

const FLOOR = 2.9;

/** One Jiangnan house: whitewashed walls, black tiles, painted doors and windows, horse-head or plain gables. */
export function buildHouse(kit: Kit, c: Collectors, h: HouseSpec, y0: number, signUVs?: (k: number) => UV): HouseOut {
  const THREE = kit.T;
  const r = (k: number) => { const s = Math.sin(h.seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, y0, h.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.ry), new THREE.Vector3(1, 1, 1));
  const { w, d } = h;
  const hw = w / 2, hd = d / 2;
  const eaveH = h.floors === 2 ? FLOOR * 2 - 0.1 : FLOOR + 0.25;
  const rise = hd * (0.62 + r(1) * 0.1);
  const ridgeY = eaveH + rise;
  const ov = 0.55;
  const tintK = 0.95 + r(2) * 0.05;
  const warm: V3 = [1, 0.985 + r(3) * 0.015, 0.96 + r(4) * 0.03];

  // --- façades
  const q = new Quads();
  const floorTops = h.floors === 2 ? [FLOOR, eaveH] : [eaveH];
  const face = (zSign: number, style: Front) => {
    const n = Math.max(1, Math.round(w / 2.5));
    const bw = w / n;
    const z = zSign * hd;
    for (let f = 0; f < floorTops.length; f++) {
      const yb = f === 0 ? 0 : floorTops[f - 1], yt = floorTops[f];
      for (let i = 0; i < n; i++) {
        const mid = i === Math.floor(n / 2);
        let cell: number;
        if (f === 0) {
          if (style === 'shop') cell = mid || n <= 2 ? CELL.shop : r(10 + i) < 0.5 ? CELL.shop : CELL.wallWin;
          else if (style === 'tea') cell = CELL.tea;
          else if (style === 'home') cell = mid ? CELL.door : r(20 + i) < 0.6 ? CELL.wallWin : CELL.wall;
          else cell = r(30 + i) < 0.3 ? CELL.wallWin : CELL.wall;
        } else {
          if (style === 'shop' || style === 'tea') cell = r(40 + i) < 0.75 ? CELL.lattice : CELL.upperWin;
          else cell = r(50 + i) < 0.55 ? CELL.upperWin : CELL.wall;
        }
        const x0 = -hw + i * bw, x1 = x0 + bw;
        if (zSign > 0) q.quad([x0, yb, z], [x1, yb, z], [x1, yt, z], [x0, yt, z], cellUV(cell), tintK, warm);
        else q.quad([x1, yb, z], [x0, yb, z], [x0, yt, z], [x1, yt, z], cellUV(cell), tintK, warm);
      }
    }
  };
  face(1, h.front);
  face(-1, 'wall');

  // --- gable ends
  const roofY = (v: number) => ridgeY - (ridgeY - (eaveH - 0.14)) * (1 - Math.pow(1 - v, 1.5));
  const D = hd + ov;
  if (h.gable === 'plain') {
    for (const s of [1, -1]) {
      const x = s * hw;
      // wall below the eave as quads, then the gable triangle following the concave roof
      const zs = [-hd, hd];
      if (s > 0) q.quad([x, 0, zs[1]], [x, 0, zs[0]], [x, eaveH, zs[0]], [x, eaveH, zs[1]], cellUV(r(60 + s) < 0.5 ? CELL.wallWin : CELL.wall), tintK, warm);
      else q.quad([x, 0, zs[0]], [x, 0, zs[1]], [x, eaveH, zs[1]], [x, eaveH, zs[0]], cellUV(CELL.wall), tintK, warm);
      const shape = new THREE.Shape();
      shape.moveTo(-hd, eaveH);
      shape.lineTo(hd, eaveH);
      const N = 8;
      for (let i = 0; i <= N; i++) {
        const zz = hd - (2 * hd * i) / N;
        shape.lineTo(zz, roofY(Math.abs(zz) / D) - 0.06);
      }
      shape.closePath();
      const sg = planarUV(kit, new THREE.ShapeGeometry(shape), cellUV(CELL.wall, [0, 0, 1, 0.5]), [tintK * warm[0], tintK * warm[1], tintK * warm[2]]);
      sg.rotateY(s * Math.PI / 2);
      sg.translate(x, 0, 0);
      c.walls.add(sg.applyMatrix4(m), 30);
    }
  } else {
    // 马头墙: stepped gable walls rising above the roof, each step capped with tiles, ends upturned
    const D0 = D + 0.1;
    const n = h.floors === 2 ? 3 : 2;
    const bounds: number[] = [];
    for (let k = 0; k < n; k++) bounds.push(D0 * (1 - k / n));
    const lv: number[] = [];
    for (let k = 0; k < n; k++) {
      const inner = k === n - 1 ? 0 : bounds[k + 1];
      lv.push(Math.max(roofY(inner / D) + 0.5, (k > 0 ? lv[k - 1] + 0.55 : eaveH + 0.5)));
    }
    const shape = new THREE.Shape();
    shape.moveTo(-D0, -0.05);
    shape.lineTo(D0, -0.05);
    for (let k = 0; k < n; k++) {
      shape.lineTo(bounds[k], lv[k]);
      if (k < n - 1) shape.lineTo(bounds[k + 1], lv[k]);
    }
    for (let k = n - 1; k >= 0; k--) {
      if (k < n - 1) shape.lineTo(-bounds[k + 1], lv[k]);
      shape.lineTo(-bounds[k], lv[k]);
    }
    shape.closePath();
    const T0 = 0.3;
    for (const s of [1, -1]) {
      const eg = new THREE.ExtrudeGeometry(shape, { depth: T0, bevelEnabled: false });
      eg.deleteAttribute('uv');
      const g = planarUV(kit, eg, cellUV(CELL.wall), [tintK * warm[0], tintK * warm[1], tintK * warm[2]]);
      g.translate(0, 0, -T0 / 2);
      g.rotateY(Math.PI / 2);
      g.translate(s * (hw - T0 / 2 + 0.02), 0, 0);
      c.walls.add(g.applyMatrix4(m), 30);
      // copings and upturned heads
      for (let k = 0; k < n; k++) {
        const z0 = k === n - 1 ? -bounds[k] : bounds[k + 1], z1 = bounds[k];
        const segs: [number, number][] = k === n - 1 ? [[z0, z1]] : [[z0, z1], [-z1, -z0]];
        for (const [a, b] of segs) {
          const len = b - a + 0.3, mz = (a + b) / 2;
          const x = s * (hw - T0 / 2 + 0.02);
          c.solid.add(kit.box(0.62, 0.1, len, RIDGE, x, lv[k] + 0.05, mz).applyMatrix4(m), 30);
          c.solid.add(kit.box(0.2, 0.12, len, '#2f2e2c', x, lv[k] + 0.16, mz).applyMatrix4(m), 30);
          if (k < n - 1) {
            const endZ = Math.sign(a + b) * (Math.abs(a + b) / 2 + (b - a) / 2 + 0.1);
            c.solid.add(kit.box(0.5, 0.16, 0.55, '#2f2e2c', x, lv[k] + 0.24, endZ, 0, 0, -Math.sign(endZ) * 0.45, 0).applyMatrix4(m), 30);
          }
        }
      }
    }
  }
  c.walls.add(q.geometry(kit).applyMatrix4(m), 30);

  // --- plinth
  c.solid.add(kit.box(w + 0.14, 1.4, d + 0.14, PLINTH, 0, -0.42, 0, 0, 0.05).applyMatrix4(m), 30);

  // --- roof
  const Lx = h.gable === 'plain' ? hw + 0.45 : hw - 0.08;
  const roof = gableRoof(kit, { Lx, D, eaveY: eaveH - 0.14, ridgeY, lift: h.gable === 'plain' ? 0.32 : 0, U: 10, V: 6 }, h.seed);
  c.roofs.add(roof.geo.applyMatrix4(m), false);
  c.roofs.lines(xfLines(kit, roof.lines, m));
  // ridge, curled ends on plain gables
  c.solid.add(kit.box(Lx * 2 + 0.1, 0.26, 0.3, RIDGE, 0, ridgeY + 0.08, 0).applyMatrix4(m), 30);
  if (h.gable === 'plain') {
    for (const s of [1, -1]) {
      c.solid.add(kit.box(0.6, 0.22, 0.26, RIDGE, s * (Lx + 0.12), ridgeY + 0.26, 0, 0, 0, 0, s * 0.55).applyMatrix4(m), 30);
    }
  }

  // --- pent eave between the floors (腰檐)
  if (h.floors === 2 && (h.pent ?? h.front !== 'wall')) {
    const pl = h.gable === 'plain' ? hw + 0.2 : hw - 0.1;
    const pr = gableRoof(kit, { Lx: pl, D: 0.8, eaveY: FLOOR - 0.28, ridgeY: FLOOR + 0.12, lift: 0.1, U: 6, V: 2 }, h.seed + 7);
    // keep only the front half (the back half is inside the wall): shift so the ridge sits on the wall
    pr.geo.translate(0, 0, hd);
    c.roofs.add(pr.geo.applyMatrix4(m), false);
    c.roofs.lines(xfLines(kit, pr.lines.map((v, i) => (i % 3 === 2 ? v + hd : v)), m));
  }

  // --- a signboard beside the door
  if (h.sign !== undefined && signUVs) {
    const sq = new Quads();
    const sx = -hw + 0.55, z = hd + 0.06, yb = 1.1, sw = 0.55, sh = 1.1;
    sq.quad([sx - sw / 2, yb, z], [sx + sw / 2, yb, z], [sx + sw / 2, yb + sh, z], [sx - sw / 2, yb + sh, z], signUVs(h.sign));
    c.walls.add(sq.geometry(kit).applyMatrix4(m), 20);
  }
  return { matrix: m, y0, eaveH, ridgeY };
}

/** Colliders (and camera occluders) covering a rotated rectangle. */
export function rectColliders(kit: Kit, x: number, z: number, ry: number, w: number, d: number, h: number, y0: number, occlude = true): void {
  const c = Math.cos(ry), s = Math.sin(ry);
  const toW = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  const long = w >= d;
  const L = long ? w : d, S = long ? d : w;
  const rad = S / 2;
  const n = Math.max(1, Math.ceil((L - S) / (rad * 0.9)) + 1);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -((L - S) / 2) + ((L - S) * i) / (n - 1);
    const p = long ? toW(t, 0) : toW(0, t);
    kit.collider({ x: p.x, z: p.z, r: rad, h });
    if (occlude) kit.occluder({ x: p.x, z: p.z, r: rad * 0.9, y0, y1: y0 + h });
  }
  // corners
  const cr = Math.min(0.8, S * 0.2);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = toW(sx * (w / 2 - cr), sz * (d / 2 - cr));
    kit.collider({ x: p.x, z: p.z, r: cr, h });
  }
}
