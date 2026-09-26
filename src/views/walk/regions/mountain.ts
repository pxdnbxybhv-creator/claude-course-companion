// 山寺 · the mountain temple — 只在此山中，云深不知处。
// A temple climbing the slope along one axis: the mountain gate between ochre walls, long stone
// stairs flanked by stone lanterns, a courtyard with a great bronze censer breathing smoke, the
// double-eaved main hall, a bell pavilion whose bronze bell hangs free (mesh 'bell', swung by the
// bell mini-game), a slender seven-storey pagoda hung with wind-bells, ancient pines with prayer
// ribbons, and a waterfall pouring from the cliff into the pool where the river begins.
import type * as T from 'three';
import type { RegionModule, WorldCtx } from '../types';
import { ANCHORS, REGION, RIVER, type XZ } from '../map';
import { makeRng } from '../../../core/rng';
import {
  Batch, COL, Hill, TAU, canvas, clamp, footing, glowCanvas, hipRoof, lampPools, lit, mistCards, ngon, particles, pathDist, place, plaqueCanvas,
  polyDist, puffCanvas, rect, rockGeometry, roof, stairs, three, windCards, wind, xform,
} from './hill-kit';
import { segmentDeck, type Clearing, type Deck } from './water-decks';
import { pineTree } from './hill-trees';

const R = REGION.mountain;
const GATE = ANCHORS.templeGate;
const HALL = ANCHORS.templeHall;
const BELL = ANCHORS.bellTower;
const PAGODA = ANCHORS.pagoda;
const FALL = ANCHORS.waterfall;
const POOL = ANCHORS.waterfallPool;

// the temple axis: from the gate up to the hall
const AX = (() => {
  const dx = HALL.x - GATE.x, dz = HALL.z - GATE.z, l = Math.hypot(dx, dz);
  return { dx: dx / l, dz: dz / l, len: l };
})();
/** Facing of buildings on the axis (their fronts look back down toward the gate). */
const FACE = Math.atan2(-AX.dx, -AX.dz);

// ───────────────────────────── textures ─────────────────────────────

/** Falling water: soft vertical streaks, tiling vertically. */
function streakCanvas(seed: number): HTMLCanvasElement {
  const W = 128, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(seed);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, w = 1 + r() * 4;
    const a = 0.15 + r() * 0.5;
    const ph = r() * TAU, fr = 1 + Math.floor(r() * 3);
    for (let y = 0; y < H; y += 4) {
      const k = 0.5 + 0.5 * Math.sin((y / H) * TAU * fr + ph);
      g.fillStyle = `rgba(255,255,255,${(a * (0.3 + 0.7 * k)).toFixed(3)})`;
      g.fillRect(x, y, w, 4);
    }
  }
  // edges fade
  const img = g.getImageData(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    const e = Math.min(1, Math.min(x, W - 1 - x) / (W * 0.18));
    for (let y = 0; y < H; y++) img.data[(y * W + x) * 4 + 3] *= e;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Foam at the foot of the fall: broken rings of white. */
function foamCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const r = makeRng(61);
  for (let i = 0; i < 140; i++) {
    const a = r() * TAU, d = S * (0.08 + Math.pow(r(), 0.7) * 0.4);
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const rr = 3 + r() * 10 * (1 - d / (S * 0.5));
    g.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.5) * (1 - d / (S * 0.5))})`;
    g.beginPath(); g.ellipse(x, y, rr * 1.8, rr, a + Math.PI / 2, 0, TAU); g.fill();
  }
  return c;
}

/** A prayer ribbon: a long red strip with a small wooden tag at its end. */
function ribbonCanvas(): HTMLCanvasElement {
  const W = 32, H = 128;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8453a';
  g.beginPath();
  g.moveTo(W * 0.3, 0); g.lineTo(W * 0.7, 0); g.lineTo(W * 0.62, H * 0.78); g.lineTo(W * 0.38, H * 0.78); g.closePath();
  g.fill();
  g.fillStyle = '#9a6b45';
  g.fillRect(W * 0.18, H * 0.76, W * 0.64, H * 0.22);
  g.strokeStyle = 'rgba(40,30,20,0.8)';
  g.lineWidth = 1;
  g.strokeRect(W * 0.18, H * 0.76, W * 0.64, H * 0.22);
  return c;
}

function tuftCanvas(): HTMLCanvasElement {
  const W = 128, H = 96;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(59);
  g.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.7;
    const len = 30 + r() * 60;
    const x0 = W / 2 + (r() - 0.5) * 24;
    const bend = (r() - 0.5) * 0.8;
    for (let s = 0; s < 8; s++) {
      const t0 = s / 8, t1 = (s + 1) / 8;
      const pt = (t: number) => [x0 + Math.cos(a + bend * t * t) * len * t, H - 2 + Math.sin(a + bend * t * t) * len * t];
      const [ax, ay] = pt(t0), [bx, by] = pt(t1);
      g.strokeStyle = `rgba(46,52,42,${0.72 - t0 * 0.4})`;
      g.lineWidth = 3 * (1 - t0) + 0.5;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  return c;
}

// ───────────────────────────── build ─────────────────────────────

let hill: Hill | null = null;

function build(ctx: WorldCtx): void {
  hill?.dispose();
  const h = (hill = new Hill(ctx, 'mountain'));
  const THREE = three();
  const rng = makeRng(0x5e1);
  const b = new Batch();
  const glowPts: T.Vector3[] = [];
  const glowSize: number[] = [];
  const addGlow = (p: T.Vector3, s: number) => { glowPts.push(p); glowSize.push(s); };
  const redLanterns: T.Vector3[] = [];

  /** A local frame: (lx, lz) → world, for a building at (x, z) facing ry. */
  const frame = (x: number, z: number, ry: number) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    return (lx: number, lz: number): XZ => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  };
  const column = (p: XZ, y0: number, hgt: number, r = 0.16, col = COL.lacquer) => {
    b.add(place(new THREE.CylinderGeometry(r, r * 1.08, hgt, 8), p.x, y0 + hgt / 2, p.z), col, { rim: true });
    b.add(place(new THREE.CylinderGeometry(r * 1.6, r * 1.8, 0.18, 8), p.x, y0 + 0.09, p.z), COL.stoneMid, { edge: 40 });
  };
  /** A wall panel between two local points, from y0 up hgt, thickness th. */
  const panel = (F: (lx: number, lz: number) => XZ, ry: number, lx0: number, lz0: number, lx1: number, lz1: number, y0: number, hgt: number, th: number, color: string, o: { edge?: number } = {}) => {
    const a = F(lx0, lz0), c = F(lx1, lz1);
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const dir = Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2;
    b.add(place(new THREE.BoxGeometry(len, hgt, th), (a.x + c.x) / 2, y0 + hgt / 2, (a.z + c.z) / 2, dir), color, { edge: o.edge ?? 30, jitter: 0.04 });
    void ry;
  };
  /** Lattice (格扇) lines over a door panel. */
  const lattice = (F: (lx: number, lz: number) => XZ, lx0: number, lx1: number, lz: number, y0: number, hgt: number, cols = 4) => {
    const segs: number[] = [];
    const n = Math.max(2, Math.round((lx1 - lx0) / 0.18));
    for (let i = 0; i <= n; i++) {
      const p = F(lx0 + ((lx1 - lx0) * i) / n, lz);
      segs.push(p.x, y0 + hgt * 0.38, p.z, p.x, y0 + hgt * 0.95, p.z);
    }
    for (let j = 0; j <= 6; j++) {
      const yy = y0 + hgt * (0.38 + (0.57 * j) / 6);
      const a = F(lx0, lz), c = F(lx1, lz);
      segs.push(a.x, yy, a.z, c.x, yy, c.z);
    }
    for (let k = 0; k <= cols; k++) {
      const p = F(lx0 + ((lx1 - lx0) * k) / cols, lz);
      segs.push(p.x, y0, p.z, p.x, y0 + hgt, p.z);
    }
    b.segs(segs);
  };
  const plaque = (text: string, p: XZ, y: number, ry: number, w: number, hgt: number, o: { vertical?: boolean; bg?: string; fg?: string } = {}) => {
    const cw = o.vertical ? 96 : 320, ch = o.vertical ? 320 : 110;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), h.own(new THREE.MeshLambertMaterial({ map: h.tex(plaqueCanvas(text, { w: cw, h: ch, vertical: o.vertical, bg: o.bg ?? '#26394a', fg: o.fg ?? '#d9b86a', frame: '#b08a4a' })) })));
    m.position.set(p.x, y, p.z);
    m.rotation.y = ry;
    m.name = `mountain:plaque:${text}`;
    h.add(m);
  };

  // ── levels ─────────────────────────────────────────────────────────
  // The precinct climbs in three terraces along the axis (gate-local lz runs from the gate toward
  // the front; the hall sits at lz = −AX.len): the gate and its forecourt on the ground, the paved
  // courtyard raised a storey of stairs (≈1.6 m), the hall on its own tall base (≈1.5 m more).
  const G = frame(GATE.x, GATE.z, FACE);
  const C_GATE = 2.0; // the gate's half depth
  const HL = -AX.len; // the hall's centre, gate-local lz
  const gateY = h.y(GATE.x, GATE.z);
  const COURT = { lx: 9, z0: -8.0, z1: -19.6 }; // terrace body (reaches under the hall's base)
  const HALLBASE = { lx: 7.4, hd: 5.1 };
  let groundHi = gateY;
  for (const [lx, lz] of [[-9, -8], [9, -8], [-9, -19.6], [9, -19.6], [0, -14], [-7.4, -29.3], [7.4, -29.3]]) {
    const p = G(lx, lz);
    groundHi = Math.max(groundHi, h.y(p.x, p.z));
  }
  const courtTop = groundHi + 1.6;
  const hallTop = courtTop + 1.5;
  const decks: Deck[] = [];
  const rects: Clearing[] = [];
  /** An oriented rectangle (for decks, clearings, tuft tests) in a frame at (x, z) facing ry. */
  const orect = (x: number, z: number, ry: number, hl: number, hw: number): Clearing => ({ cx: x, cz: z, ax: Math.cos(ry), az: -Math.sin(ry), hl, hw });
  const gRect = (lx0: number, lx1: number, lz0: number, lz1: number): Clearing => {
    const c = G((lx0 + lx1) / 2, (lz0 + lz1) / 2);
    return orect(c.x, c.z, FACE, Math.abs(lx1 - lx0) / 2, Math.abs(lz1 - lz0) / 2);
  };
  /** A walkable run from a to b (world), rising linearly from ya to yb. */
  const ramp = (id: string, a: XZ, c: XZ, hw: number, ya: number, yb: number) => {
    const L = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    decks.push(segmentDeck(`mountain:${id}`, a, c, hw, (s) => ya + ((yb - ya) * (s + L / 2)) / L));
  };
  /** Small colliders every `step` m along a line (walls, rails, cheeks). */
  const colLine = (a: XZ, c: XZ, r: number, hgt: number, step = 0.5) => {
    const L = Math.hypot(c.x - a.x, c.z - a.z);
    const n = Math.max(1, Math.round(L / step));
    for (let i = 0; i <= n; i++) h.collide({ x: a.x + ((c.x - a.x) * i) / n, z: a.z + ((c.z - a.z) * i) / n, r, h: hgt });
  };
  /** Stone courses (ink lines) on a vertical face from a to b (world), between y0 and y1. */
  const courses = (a: XZ, c: XZ, y0: number, y1: number, seed: number) => {
    const r = makeRng(seed);
    const segs: number[] = [];
    const L = Math.hypot(c.x - a.x, c.z - a.z);
    const rows = Math.max(1, Math.round((y1 - y0) / 0.55));
    for (let k = 1; k < rows; k++) {
      const y = y0 + ((y1 - y0) * k) / rows;
      segs.push(a.x, y, a.z, c.x, y, c.z);
    }
    for (let k = 0; k < rows; k++) {
      const ya = y0 + ((y1 - y0) * k) / rows, yb = y0 + ((y1 - y0) * (k + 1)) / rows;
      for (let u = (k % 2) * 0.6 + r() * 0.3; u < L; u += 1.1 + r() * 0.4) {
        const t = u / L;
        const x = a.x + (c.x - a.x) * t, z = a.z + (c.z - a.z) * t;
        segs.push(x, ya, z, x, yb, z);
      }
    }
    b.segs(segs);
  };
  /** A stone balustrade (栏杆) along local points of frame F at height y, with colliders. */
  const rail = (F: (lx: number, lz: number) => XZ, pts: [number, number][], y: number) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [cx, cz] = pts[i];
      const L = Math.hypot(cx - ax, cz - az);
      const n = Math.max(1, Math.round(L / 1.3));
      const A = F(ax, az), C = F(cx, cz);
      const dir = Math.atan2(C.x - A.x, C.z - A.z) + Math.PI / 2;
      for (let k = 0; k <= n; k++) {
        if (k === 0 && i > 1) continue;
        const p = F(ax + ((cx - ax) * k) / n, az + ((cz - az) * k) / n);
        b.add(place(new THREE.BoxGeometry(0.2, 0.8, 0.2), p.x, y + 0.4, p.z, dir), COL.stone, { edge: 40 });
        b.add(place(new THREE.BoxGeometry(0.24, 0.1, 0.24), p.x, y + 0.84, p.z, dir), COL.stoneMid);
        if (k < n) {
          const q = F(ax + ((cx - ax) * (k + 0.5)) / n, az + ((cz - az) * (k + 0.5)) / n);
          const sl = L / n - 0.2;
          b.add(place(new THREE.BoxGeometry(sl, 0.12, 0.12), q.x, y + 0.66, q.z, dir), COL.stone, { edge: 40 });
          b.add(place(new THREE.BoxGeometry(sl, 0.36, 0.06), q.x, y + 0.3, q.z, dir), COL.stoneMid, { edge: 40 });
        }
      }
      colLine(A, C, 0.2, 1);
    }
  };
  /** A flight of stone stairs from local (lx, lz0) at y0 to (lx, lz1) at y1 in frame F, with a deck and cheek colliders. */
  const flight = (id: string, F: (lx: number, lz: number) => XZ, lx: number, lz0: number, lz1: number, y0: number, y1: number, width: number, seed: number, alongX = false) => {
    const pa = alongX ? F(lz0, lx) : F(lx, lz0), pc = alongX ? F(lz1, lx) : F(lx, lz1);
    stairs(b, h, new THREE.Vector3(pa.x, y0, pa.z), new THREE.Vector3(pc.x, y1, pc.z), width, { rise: 0.155, seed });
    ramp(id, pa, pc, width / 2 + 0.05, y0, y1);
    const L = Math.hypot(pc.x - pa.x, pc.z - pa.z), ux = (pc.x - pa.x) / L, uz = (pc.z - pa.z) / L;
    for (const s of [-1, 1]) {
      const ox = -uz * s * (width / 2 + 0.16), oz = ux * s * (width / 2 + 0.16);
      colLine({ x: pa.x + ox, z: pa.z + oz }, { x: pc.x + ox, z: pc.z + oz }, 0.2, 1);
    }
    rects.push({ cx: (pa.x + pc.x) / 2, cz: (pa.z + pc.z) / 2, ax: ux, az: uz, hl: L / 2, hw: width / 2 + 0.35 });
  };
  const WALL_UMBER = '#7b6552', DOOR = '#6d5a4a', DOOR_DARK = '#3a2e28';
  /** A stone lion (石狮) seated on a plinth at p, looking out from the gate: s = +1 the lion with his
   *  ball (east), −1 the lioness with her cub (west). */
  const lion = (p: XZ, s: number) => {
    const L = frame(p.x, p.z, FACE);
    const gy = h.y(p.x, p.z);
    const stone = '#baae97', dark = '#938874';
    footing(b, h, p.x, p.z, 0.6, 0.72, FACE, gy + 0.2, COL.stoneMid);
    footing(b, h, p.x, p.z, 0.46, 0.6, FACE, gy + 0.74, stone);
    const y0 = gy + 0.74;
    const at = (lx: number, y: number, lz: number, g: T.BufferGeometry, col: string, o: { hull?: boolean; edge?: number } = {}) => {
      const q = L(lx, lz);
      b.add(place(g, q.x, y0 + y, q.z, FACE), col, o);
    };
    at(0, 0.3, -0.2, new THREE.SphereGeometry(0.34, 8, 6).scale(1.05, 0.85, 1.15), stone, { hull: true }); // haunches
    at(0, 0.62, 0.05, new THREE.SphereGeometry(0.28, 8, 6).scale(1, 1.35, 0.9), stone, { hull: true }); // chest
    for (const k of [-1, 1]) at(k * 0.15, 0.28, 0.3, new THREE.CylinderGeometry(0.075, 0.09, 0.56, 6), stone, { edge: 40 });
    at(0, 1.0, 0.08, new THREE.IcosahedronGeometry(0.35, 0), dark, { hull: true }); // curled mane
    at(0, 1.02, 0.24, new THREE.SphereGeometry(0.24, 8, 6), stone, { hull: true }); // head
    at(0, 0.95, 0.46, new THREE.BoxGeometry(0.22, 0.15, 0.14), stone, { edge: 40 }); // muzzle
    for (const k of [-1, 1]) at(k * 0.1, 1.1, 0.43, new THREE.SphereGeometry(0.035, 5, 4), COL.ink);
    at(0, 0.55, -0.52, new THREE.SphereGeometry(0.12, 6, 5).scale(1, 1.6, 1), dark, { hull: true }); // tail
    // a paw on the embroidered ball, or on the cub
    at(s * 0.2, 0.13, 0.36, new THREE.SphereGeometry(0.13, 8, 6), s > 0 ? dark : stone, { hull: true });
    if (s < 0) at(-0.2, 0.3, 0.34, new THREE.SphereGeometry(0.08, 6, 5), stone);
    h.collide({ x: p.x, z: p.z, r: 0.75, h: 2 });
    rects.push(orect(p.x, p.z, FACE, 0.8, 0.9));
  };

  // ── 山门: the mountain gate between ochre walls ──────────────────────
  {
    const F = G;
    const top = gateY + 0.2;
    const A = 4.2, C = C_GATE;
    footing(b, h, GATE.x, GATE.z, A + 0.3, C + 0.3, FACE, top, COL.stone);
    // a low step before and behind the open middle bay
    for (const s of [-1, 1]) {
      const p = F(0, s * (C + 0.55));
      footing(b, h, p.x, p.z, 1.5, 0.25, FACE, gateY + 0.1, COL.stoneMid);
    }
    decks.push(segmentDeck('mountain:gate', F(0, C + 0.85), F(0, -C - 0.85), 1.25, (s) => gateY + 0.2 * clamp((C + 0.85 - Math.abs(s)) / 0.6, 0, 1)));
    rects.push(gRect(-A - 0.3, A + 0.3, -C - 0.9, C + 0.9));
    const colH = 3.9;
    for (const lx of [-A + 0.3, -1.4, 1.4, A - 0.3]) for (const lz of [-C + 0.3, C - 0.3]) {
      const p = F(lx, lz);
      column(p, top, colH, 0.17);
      h.collide({ x: p.x, z: p.z, r: 0.25, h: colH });
    }
    // side bays walled, round windows painted dark
    for (const s of [-1, 1]) {
      panel(F, FACE, s * 1.55, 0, s * (A - 0.45), 0, top, colH - 0.5, 0.35, WALL_UMBER);
      const w = F(s * (A / 2 + 0.7), 0.19);
      const win = new THREE.CircleGeometry(0.62, 20);
      place(win, w.x, top + 2.0, w.z, FACE);
      b.add(win, '#2e2622');
      const w2 = F(s * (A / 2 + 0.7), -0.19);
      b.add(place(new THREE.CircleGeometry(0.62, 20), w2.x, top + 2.0, w2.z, FACE + Math.PI), '#2e2622');
      const bars: number[] = [];
      for (let k = -2; k <= 2; k++) {
        const pa = F(s * (A / 2 + 0.7) + k * 0.2, 0.2);
        const hh = Math.sqrt(Math.max(0, 0.62 * 0.62 - (k * 0.2) ** 2));
        bars.push(pa.x, top + 2.0 - hh, pa.z, pa.x, top + 2.0 + hh, pa.z);
      }
      b.segs(bars);
      colLine(F(s * 1.6, 0), F(s * (A - 0.2), 0), 0.3, colH);
    }
    // the central doors stand open against the walls
    for (const s of [-1, 1]) {
      const p = F(s * 1.3, -0.35);
      b.add(place(new THREE.BoxGeometry(0.08, 3.1, 1.2), p.x, top + 1.55, p.z, FACE), DOOR, { edge: 30 });
      // door studs
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const q = F(s * 1.25, -0.75 + j * 0.35);
        b.add(place(new THREE.SphereGeometry(0.035, 5, 4), q.x, top + 0.8 + i * 0.45, q.z), '#c39a4a');
      }
    }
    const beamY = top + colH;
    b.add(place(new THREE.BoxGeometry(A * 2, 0.34, C * 2), GATE.x, beamY + 0.1, GATE.z, FACE), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.3, 0.3, C * 2 + 0.3), GATE.x, beamY + 0.42, GATE.z, FACE), '#41554e', { edge: 30 });
    hipRoof(b, GATE.x, GATE.z, FACE, A + 1.4, C + 1.3, beamY + 0.55, 2.0, { curl: 0.5, flare: 0.35 });
    // the name board hangs below the painted band, clear of it
    plaque('云深寺', F(0, C + 0.19), beamY - 0.2, FACE, 1.8, 0.62);
    // red lanterns under the eave
    for (const s of [-1, 1]) {
      const p = F(s * 1.0, C + 0.5);
      redLanterns.push(new THREE.Vector3(p.x, beamY - 0.55, p.z));
    }
    h.occlude({ x: GATE.x, z: GATE.z, r: 2.5, y0: top, y1: beamY + 2.6 });

    // a paved walk out in front of the gate (the front plaza), stone lions either side (山门石狮)
    {
      const prng = makeRng(91);
      for (let lz = C + 1.3; lz < 9; lz += 1.1) for (const lx of [-1.05, 0, 1.05]) {
        const p = F(lx + prng.range(-0.04, 0.04), lz);
        b.add(place(new THREE.BoxGeometry(1.0, 0.12, 1.0), p.x, h.y(p.x, p.z) + 0.02, p.z, FACE + prng.range(-0.03, 0.03)), new THREE.Color(COL.stoneWarm).multiplyScalar(prng.range(0.9, 1.04)), { edge: 50 });
      }
      rects.push(gRect(-1.6, 1.6, C + 0.9, 9));
      for (const s of [-1, 1]) lion(F(s * 3.0, 3.6), s);
    }

    // ochre walls running out from the gate and back to the courtyard terrace. The east return
    // is open where the path up from the lake arrives (a side way in: 角门).
    const wallRun: [number, number][][] = [
      [[-A - 0.6, 0], [-9.6, 0], [-9.6, -7.9]],
      [[A + 0.6, 0], [9.6, 0], [9.6, -1.3]],
      [[9.6, -4.7], [9.6, -7.9]],
    ];
    for (const run of wallRun) {
      for (let i = 1; i < run.length; i++) {
        const [ax, az] = run[i - 1], [cx, cz] = run[i];
        const len = Math.hypot(cx - ax, cz - az);
        const n = Math.max(1, Math.ceil(len / 1.6));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const p0 = F(ax + (cx - ax) * t0, az + (cz - az) * t0), p1 = F(ax + (cx - ax) * t1, az + (cz - az) * t1);
          const mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2;
          if (ctx.waterAt(mx, mz) !== null) continue;
          const wy = h.y(mx, mz);
          const sl = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.02;
          const dir = Math.atan2(p1.x - p0.x, p1.z - p0.z) + Math.PI / 2;
          b.add(place(new THREE.BoxGeometry(sl, 3.2, 0.5), mx, wy + 0.95, mz, dir), COL.templeWall, { edge: 30, jitter: 0.05 });
          b.add(place(new THREE.BoxGeometry(sl, 0.45, 0.52), mx, wy - 0.4, mz, dir), '#8e7d64', { edge: 30 });
          b.add(place(new THREE.BoxGeometry(sl + 0.04, 0.16, 0.9), mx, wy + 2.62, mz, dir), COL.tile, { edge: 30 });
          b.add(place(new THREE.BoxGeometry(sl + 0.04, 0.12, 0.2), mx, wy + 2.76, mz, dir), COL.tileDark);
        }
        colLine(F(ax, az), F(cx, cz), 0.35, 2.6);
      }
    }
    // piers either side of the side way, and at the wall ends
    for (const [lx, lz] of [[9.6, -1.3], [9.6, -4.7], [-9.6, 0], [9.6, 0]] as [number, number][]) {
      const p = F(lx, lz);
      const wy = h.y(p.x, p.z);
      b.add(place(new THREE.BoxGeometry(0.8, 3.3, 0.8), p.x, wy + 1.0, p.z, FACE), COL.templeWall, { edge: 30, jitter: 0.04 });
      b.add(place(new THREE.BoxGeometry(1.05, 0.2, 1.05), p.x, wy + 2.74, p.z, FACE), COL.tile, { edge: 30 });
      b.add(place(new THREE.ConeGeometry(0.62, 0.4, 4), p.x, wy + 3.04, p.z, FACE + Math.PI / 4), COL.tileDark, { edge: 30 });
      h.collide({ x: p.x, z: p.z, r: 0.55, h: 3 });
    }
  }

  // ── the stairs up to the courtyard, stone lanterns at the foot and the top ────
  flight('stairs', G, 0, -C_GATE - 2.2, COURT.z0, gateY, courtTop, 4.2, 21);
  rects.push(gRect(-9.6, 9.6, -C_GATE - 0.9, -C_GATE - 2.2));
  const stoneLantern = (p: XZ, y: number) => {
    b.add(place(new THREE.CylinderGeometry(0.26, 0.3, 0.18, 6), p.x, y + 0.09, p.z), '#aa9f89', { edge: 40 });
    b.add(place(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8), p.x, y + 0.5, p.z), '#b6aa94', { rim: true });
    b.add(place(new THREE.BoxGeometry(0.34, 0.3, 0.34), p.x, y + 1.0, p.z), '#bdb19a', { edge: 40 });
    b.add(place(new THREE.BoxGeometry(0.35, 0.14, 0.35), p.x, y + 1.0, p.z), '#4a4540');
    b.add(place(new THREE.ConeGeometry(0.38, 0.28, 6), p.x, y + 1.29, p.z), '#938978', { edge: 40 });
    b.add(place(new THREE.SphereGeometry(0.07, 8, 6), p.x, y + 1.46, p.z), '#938978');
    addGlow(new THREE.Vector3(p.x, y + 1.0, p.z), 1.5);
    h.collide({ x: p.x, z: p.z, r: 0.3, h: 1.5 });
  };
  for (const s of [-1, 1]) {
    const p = G(s * 3.2, -C_GATE - 3.0);
    stoneLantern(p, h.y(p.x, p.z));
    stoneLantern(G(s * 3.4, COURT.z0 - 1.2), courtTop);
  }

  // ── the courtyard terrace and the great censer ─────────────────────────
  {
    const F = G;
    const zc = (COURT.z0 + COURT.z1) / 2, hd = (COURT.z0 - COURT.z1) / 2;
    const cc = F(0, zc);
    footing(b, h, cc.x, cc.z, COURT.lx, hd, FACE, courtTop - 0.12, COL.stone, { jitter: 0.03 });
    b.add(place(new THREE.BoxGeometry(COURT.lx * 2 + 0.3, 0.2, hd * 2 + 0.3), cc.x, courtTop - 0.2, cc.z, FACE), COL.stoneMid, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(COURT.lx * 2 + 0.24, 0.32, hd * 2 + 0.24), cc.x, groundHi + 0.02, cc.z, FACE), COL.stoneDark, { edge: 30 });
    // masonry courses on the three faces you see
    const cy0 = groundHi + 0.18, cy1 = courtTop - 0.3;
    courses(F(-COURT.lx - 0.01, COURT.z0 + 0.01), F(-2.45, COURT.z0 + 0.01), cy0, cy1, 1);
    courses(F(2.45, COURT.z0 + 0.01), F(COURT.lx + 0.01, COURT.z0 + 0.01), cy0, cy1, 2);
    for (const s of [-1, 1]) {
      courses(F(s * (COURT.lx + 0.01), COURT.z0), F(s * (COURT.lx + 0.01), -10.4), cy0, cy1, 3 + s);
      courses(F(s * (COURT.lx + 0.01), -13.6), F(s * (COURT.lx + 0.01), COURT.z1), cy0, cy1, 5 + s);
    }
    // paving
    const cell = 1.5;
    const prng = makeRng(77);
    for (let i = -COURT.lx + cell / 2; i < COURT.lx; i += cell) {
      for (let j = COURT.z0 - cell / 2; j > -AX.len + HALLBASE.hd; j -= cell) {
        const p = F(i, j);
        const col = new THREE.Color(COL.stoneWarm).multiplyScalar(prng.range(0.9, 1.04));
        b.add(place(new THREE.BoxGeometry(cell - 0.04, 0.14, cell - 0.04), p.x, courtTop - 0.07, p.z, FACE + prng.range(-0.01, 0.01)), col, { edge: 40 });
      }
    }
    decks.push(segmentDeck('mountain:court', F(0, COURT.z0), F(0, COURT.z1), COURT.lx, courtTop));
    rects.push(gRect(-COURT.lx - 0.3, COURT.lx + 0.3, COURT.z0 + 0.3, COURT.z1));
    // balustrades round the edges: open for the front stairs and the side stairs
    rail(F, [[-COURT.lx + 0.2, COURT.z0 - 0.2], [-2.5, COURT.z0 - 0.2]], courtTop);
    rail(F, [[2.5, COURT.z0 - 0.2], [COURT.lx - 0.2, COURT.z0 - 0.2]], courtTop);
    for (const s of [-1, 1]) {
      rail(F, [[s * (COURT.lx - 0.2), COURT.z0 - 0.2], [s * (COURT.lx - 0.2), -10.35]], courtTop);
      rail(F, [[s * (COURT.lx - 0.2), -13.65], [s * (COURT.lx - 0.2), COURT.z1 + 0.15], [s * (HALLBASE.lx + 0.05), COURT.z1 + 0.15]], courtTop);
      // side stairs down to the ground: the ridge path arrives at the west one
      const foot = F(s * (COURT.lx + 4.4), -12);
      flight(s < 0 ? 'stairs-w' : 'stairs-e', F, -12, s * (COURT.lx + 4.4), s * COURT.lx, h.y(foot.x, foot.z), courtTop, 2.4, 30 + s, true);
    }
    // the censer (香炉): a bronze 鼎 on three legs, with a little roofed lid
    const cp = F(0, -11.9);
    const cy = courtTop;
    const prof: T.Vector2[] = [
      [0.0, 0.0], [0.5, 0.0], [0.72, 0.1], [0.82, 0.35], [0.8, 0.62], [0.9, 0.7], [0.92, 0.78], [0.78, 0.8], [0.7, 0.78],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(prof, 16);
    place(body, cp.x, cy + 0.55, cp.z);
    b.add(body, COL.bronze, { hull: true });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + FACE;
      b.add(place(new THREE.CylinderGeometry(0.1, 0.07, 0.62, 6), cp.x + Math.cos(a) * 0.5, cy + 0.31, cp.z + Math.sin(a) * 0.5, 0, 1, 1, 1, Math.sin(a) * 0.15, -Math.cos(a) * 0.15), COL.bronzeDark, { rim: true });
    }
    for (const s of [-1, 1]) {
      const e = F(s * 0.95, -11.9);
      b.add(place(new THREE.TorusGeometry(0.16, 0.045, 5, 10, Math.PI), e.x, cy + 1.36, e.z, FACE + Math.PI / 2), COL.bronzeDark, { rim: true });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.add(place(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), cp.x + Math.cos(a) * 0.42, cy + 1.6, cp.z + Math.sin(a) * 0.42), COL.bronzeDark);
    }
    roof(b, ngon(6, 0.8).map(([x, z]) => [cp.x + x, cp.z + z]), ngon(6, 0.001).map(([x, z]) => [cp.x + x, cp.z + z]), cy + 1.85, cy + 2.35, { curl: 0.12, flare: 0.08, color: COL.bronze, under: COL.bronzeDark, U: 4, V: 3 });
    b.add(place(new THREE.SphereGeometry(0.09, 8, 6), cp.x, cy + 2.42, cp.z), COL.bronzeDark);
    h.collide({ x: cp.x, z: cp.z, r: 1.0, h: 2.4 });
    const smokeAt = new THREE.Vector3(cp.x, cy + 1.45, cp.z);
    const smoke = particles(h, {
      count: 70, at: [smokeAt], spread: [0.3, 0.05, 0.3], vel: [0.08, 0.5, 0.04], velJitter: [0.06, 0.1, 0.06], life: 9, size: 0.9, grow: 3.4,
      color: '#92897b', opacity: 0.3, tex: h.tex(puffCanvas(64, 5)), wobble: 0.6, seed: 12,
    });
    smoke.name = 'mountain:incense-smoke';
    h.add(smoke);
    const smokeMat = smoke.material as T.PointsMaterial;
    let puff = 0;
    h.frame((dt) => {
      puff = Math.max(0, puff - dt * 0.15);
      smokeMat.opacity = 0.28 + puff * 0.35;
      smokeMat.color.set('#ffffff').multiply(h.paper);
    });
    h.interact({
      id: 'mountain:incense', position: new THREE.Vector3(cp.x, cy, cp.z), radius: 2.6,
      labelZh: '香炉', labelEn: 'The censer', actionZh: '上香', actionEn: 'Offer incense',
      act: () => {
        ctx.player.emote('bow');
        puff = 1;
        ctx.audio.knock();
        ctx.hud.toast('一炷清香，心随烟上。', 'A stick of incense; the heart rises with the smoke.');
      },
    });
    // stairs from the courtyard up to the hall's base
    flight('stairs-hall', F, 0, HL + HALLBASE.hd + 3.5, HL + HALLBASE.hd, courtTop, hallTop, 3.6, 23);
  }

  // ── 大雄宝殿: the main hall, double-eaved ───────────────────────────
  {
    const F = frame(HALL.x, HALL.z, FACE);
    const A = 6.6, C = 4.2;
    footing(b, h, HALL.x, HALL.z, HALLBASE.lx, HALLBASE.hd, FACE, hallTop, COL.stone);
    b.add(place(new THREE.BoxGeometry(HALLBASE.lx * 2 + 0.2, 0.16, HALLBASE.hd * 2 + 0.2), HALL.x, hallTop - 0.06, HALL.z, FACE), COL.stoneMid, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(HALLBASE.lx * 2 + 0.16, 0.26, HALLBASE.hd * 2 + 0.16), HALL.x, hallTop - 0.55, HALL.z, FACE), COL.stoneDark, { edge: 30 });
    courses(F(-HALLBASE.lx - 0.01, HALLBASE.hd + 0.01), F(-2.2, HALLBASE.hd + 0.01), courtTop, hallTop - 0.7, 11);
    courses(F(2.2, HALLBASE.hd + 0.01), F(HALLBASE.lx + 0.01, HALLBASE.hd + 0.01), courtTop, hallTop - 0.7, 12);
    for (const s of [-1, 1]) courses(F(s * (HALLBASE.lx + 0.01), HALLBASE.hd - 0.6), F(s * (HALLBASE.lx + 0.01), -HALLBASE.hd), groundHi + 0.1, hallTop - 0.7, 13 + s);
    decks.push(segmentDeck('mountain:hall', F(0, HALLBASE.hd), F(0, -HALLBASE.hd), HALLBASE.lx, hallTop));
    rects.push(orect(HALL.x, HALL.z, FACE, HALLBASE.lx + 0.3, HALLBASE.hd + 0.3));
    // a railing along the porch's front and ends, open at the stairs
    for (const s of [-1, 1]) rail(F, [[s * 2.15, HALLBASE.hd - 0.2], [s * (HALLBASE.lx - 0.2), HALLBASE.hd - 0.2], [s * (HALLBASE.lx - 0.2), C - 1.75]], hallTop);
    const colH = 4.3;
    const xs = [-A, -A * 0.6, -A * 0.2, A * 0.2, A * 0.6, A];
    // porch columns in front (lacquered), wall columns behind (weathered umber)
    for (const lx of xs) {
      const p = F(lx, C);
      column(p, hallTop, colH, 0.2);
      h.collide({ x: p.x, z: p.z, r: 0.28, h: colH });
    }
    const wallZ = C - 1.6;
    for (const lx of xs) column(F(lx, -C), hallTop, colH, 0.2, WALL_UMBER);
    for (const lz of [wallZ, 0, -C]) { column(F(-A, lz), hallTop, colH, 0.2, WALL_UMBER); column(F(A, lz), hallTop, colH, 0.2, WALL_UMBER); }
    // walls: back and sides solid, the front a row of lattice doors
    panel(F, FACE, -A, -C, A, -C, hallTop, colH - 0.3, 0.4, WALL_UMBER);
    panel(F, FACE, -A, -C, -A, wallZ, hallTop, colH - 0.3, 0.4, WALL_UMBER);
    panel(F, FACE, A, -C, A, wallZ, hallTop, colH - 0.3, 0.4, WALL_UMBER);
    for (let i = 0; i < xs.length - 1; i++) {
      const l0 = xs[i] + 0.22, l1 = xs[i + 1] - 0.22;
      panel(F, FACE, l0, wallZ, l1, wallZ, hallTop, colH - 0.6, 0.12, i === 2 ? DOOR_DARK : DOOR);
      lattice(F, l0, l1, wallZ + 0.07, hallTop + 0.1, colH - 0.8, 4);
    }
    // colliders along every wall face and the door line (the player stops ~0.3 m short of them)
    colLine(F(-A, -C), F(A, -C), 0.3, colH, 0.55);
    for (const s of [-1, 1]) colLine(F(s * A, -C), F(s * A, wallZ), 0.3, colH, 0.55);
    colLine(F(-A, wallZ), F(A, wallZ), 0.3, colH, 0.55);
    for (const lx of [-3.3, 0, 3.3]) h.collide({ x: F(lx, -0.8).x, z: F(lx, -0.8).z, r: 2.2, h: colH });
    // dark interior glimpse through the open middle door, a golden glow of the altar at night
    const inner = F(0, wallZ - 1.2);
    addGlow(new THREE.Vector3(inner.x, hallTop + 1.6, inner.z), 3.5);
    // beams, bracket sets (斗拱) and the lower eave
    const beamY = hallTop + colH;
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.5, 0.42, C * 2 + 0.5), HALL.x, beamY + 0.05, HALL.z, FACE), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.9, 0.36, C * 2 + 0.9), HALL.x, beamY + 0.44, HALL.z, FACE), '#41554e', { edge: 30 });
    for (let i = 0; i <= 16; i++) {
      const lx = -A + (i / 16) * A * 2;
      for (const lz of [C + 0.46, -C - 0.46]) {
        const p = F(lx, lz);
        b.add(place(new THREE.BoxGeometry(0.3, 0.2, 0.3), p.x, beamY + 0.5, p.z, FACE), '#b08d55');
      }
    }
    const e1 = beamY + 0.62;
    const outer1 = xform(rect(A + 2.2, C + 2.1), HALL.x, HALL.z, FACE);
    const inner1 = xform(rect(A - 0.5, C - 0.5), HALL.x, HALL.z, FACE);
    roof(b, outer1, inner1, e1, e1 + 1.35, { curl: 0.6, flare: 0.5, U: 12, V: 6 });
    // upper storey (a clerestory band) and the upper hip roof
    const dY = e1 + 1.1;
    b.add(place(new THREE.BoxGeometry((A - 0.55) * 2, 1.5, (C - 0.55) * 2), HALL.x, dY + 0.75, HALL.z, FACE), WALL_UMBER, { edge: 30 });
    const win: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const p = F(-A + 0.6 + (i / 20) * (A - 0.6) * 2, C - 0.53);
      win.push(p.x, dY + 0.25, p.z, p.x, dY + 1.25, p.z);
    }
    b.segs(win);
    b.add(place(new THREE.BoxGeometry((A - 0.3) * 2, 0.3, (C - 0.3) * 2), HALL.x, dY + 1.62, HALL.z, FACE), '#41554e', { edge: 30 });
    hipRoof(b, HALL.x, HALL.z, FACE, A + 1.3, C + 1.2, dY + 1.78, 3.1, { curl: 0.65, flare: 0.5 });
    const pf = F(0, C - 0.52);
    plaque('大雄宝殿', pf, dY + 0.78, FACE, 2.6, 0.9);
    for (let i = -2; i <= 2; i++) {
      const p = F(i * 2.6, -0.6);
      h.occlude({ x: p.x, z: p.z, r: 2.4, y0: hallTop, y1: dY + 4.5 });
    }
    // red lanterns under the front eave
    for (const lx of [-A * 0.4, A * 0.4]) {
      const p = F(lx, C + 0.6);
      redLanterns.push(new THREE.Vector3(p.x, beamY - 0.7, p.z));
    }
  }

  // ── the bell pavilion: a big bronze bell hanging free (the bell mini-game hangs the striker log) ──
  let bellMesh: T.Mesh;
  {
    const ry = Math.atan2(HALL.x - BELL.x, HALL.z - BELL.z) - Math.PI / 2; // side faces the courtyard
    const F = frame(BELL.x, BELL.z, ry);
    const gy = h.y(BELL.x, BELL.z);
    const top = gy + 0.3;
    const HB = 3.2;
    footing(b, h, BELL.x, BELL.z, HB, HB, ry, top, COL.stone);
    // a step in the middle of every side, and walkable ramps up them
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const p = F(Math.cos(a) * (HB + 0.3), Math.sin(a) * (HB + 0.3));
      footing(b, h, p.x, p.z, 0.3, 0.9, ry + a, gy + 0.15, COL.stoneMid);
    }
    for (const a of [0, Math.PI / 2]) {
      const p0 = F(Math.cos(a) * (HB + 0.7), Math.sin(a) * (HB + 0.7)), p1 = F(-Math.cos(a) * (HB + 0.7), -Math.sin(a) * (HB + 0.7));
      decks.push(segmentDeck(`mountain:bell${a ? 'z' : 'x'}`, p0, p1, 0.9, (s) => gy + 0.3 * clamp((HB + 0.7 - Math.abs(s)) / 0.7, 0, 1)));
    }
    decks.push(segmentDeck('mountain:bell', F(-HB, 0), F(HB, 0), HB, top));
    rects.push(orect(BELL.x, BELL.z, ry, HB + 0.8, HB + 0.8));
    const colH = 5.0;
    for (const [lx, lz] of [[-2.7, -2.7], [2.7, -2.7], [2.7, 2.7], [-2.7, 2.7]]) {
      const p = F(lx, lz);
      column(p, top, colH, 0.2, WALL_UMBER);
      h.collide({ x: p.x, z: p.z, r: 0.3, h: colH });
    }
    const beamY = top + colH;
    // the bell beam, across the middle
    b.add(place(new THREE.BoxGeometry(5.8, 0.34, 0.3), BELL.x, beamY - 0.55, BELL.z, ry), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(5.8, 0.34, 0.3), BELL.x, beamY - 0.55, BELL.z, ry + Math.PI / 2), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(5.9, 0.4, 5.9), BELL.x, beamY + 0.05, BELL.z, ry), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(6.2, 0.3, 6.2), BELL.x, beamY + 0.38, BELL.z, ry), '#41554e', { edge: 30 });
    // double roof: a skirt, a short drum, a pyramidal top (攒尖)
    const e1 = beamY + 0.5;
    roof(b, xform(rect(4.2, 4.2), BELL.x, BELL.z, ry), xform(rect(2.3, 2.3), BELL.x, BELL.z, ry), e1, e1 + 0.95, { curl: 0.5, flare: 0.4 });
    b.add(place(new THREE.BoxGeometry(4.5, 1.0, 4.5), BELL.x, e1 + 1.25, BELL.z, ry), WALL_UMBER, { edge: 30 });
    const e2 = e1 + 1.75;
    roof(b, xform(rect(3.3, 3.3), BELL.x, BELL.z, ry), xform(rect(0.001, 0.001), BELL.x, BELL.z, ry), e2, e2 + 2.1, { curl: 0.5, flare: 0.35 });
    b.add(place(new THREE.SphereGeometry(0.22, 10, 8), BELL.x, e2 + 2.2, BELL.z), '#3c3c3e', { hull: true });
    b.add(place(new THREE.ConeGeometry(0.09, 0.5, 8), BELL.x, e2 + 2.55, BELL.z), '#3c3c3e');
    // the 钟 board hangs below the beam box, in front of its face
    plaque('钟', F(0, 3.02), beamY - 0.62, ry, 0.8, 0.8, { bg: '#26394a' });
    h.occlude({ x: BELL.x, z: BELL.z, r: 3, y0: beamY - 0.3, y1: e2 + 2.3 });

    // the bell (梵钟): lathe body with raised bands, a 蒲牢 loop on top. Origin = the hanging point.
    const Hb = 2.0;
    const prof = [
      [0.0, 0.0], [0.38, 0.0], [0.55, -0.05], [0.64, -0.2], [0.66, -0.6], [0.67, -1.2], [0.7, -1.6], [0.78, -1.88], [0.8, -Hb], [0.72, -Hb + 0.02],
    ].map(([r, y]) => new THREE.Vector2(r, y - 0.35));
    let bg: T.BufferGeometry = new THREE.LatheGeometry(prof, 22);
    bg = tintGeo(THREE, bg, '#596047');
    const parts: T.BufferGeometry[] = [bg];
    for (const [y, r] of [[-0.25, 0.63], [-0.95, 0.68], [-1.5, 0.7], [-1.9, 0.8]] as [number, number][]) {
      parts.push(tintGeo(THREE, place(new THREE.TorusGeometry(r + 0.015, 0.03, 4, 24).rotateX(Math.PI / 2), 0, y - 0.35, 0), '#3b4236'));
    }
    // four panels of raised studs (乳钉) as dark bands of dots
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const aa = a + (c - 1) * 0.16;
        parts.push(tintGeo(THREE, place(new THREE.SphereGeometry(0.035, 5, 4), Math.cos(aa) * 0.675, -0.5 - r * 0.14 - 0.35, Math.sin(aa) * 0.675), '#3b4236'));
      }
    }
    // the striking boss (撞座), a lotus disc on the striker side
    parts.push(tintGeo(THREE, place(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12).rotateZ(Math.PI / 2), 0.69, -1.35 - 0.35, 0), '#3b4236'));
    parts.push(tintGeo(THREE, place(new THREE.TorusGeometry(0.2, 0.06, 6, 12), 0, 0.05, 0), '#3b4236'));
    bellMesh = new THREE.Mesh(mergeColored(THREE, parts), h.toon('#ffffff', { vc: true, rim: 0.55, side: THREE.DoubleSide }));
    bellMesh.name = 'bell';
    bellMesh.userData.role = 'bell';
    bellMesh.userData.strikeDir = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)); // the striker swings along this
    const hang = new THREE.Vector3(BELL.x, beamY - 0.72, BELL.z);
    bellMesh.position.copy(hang);
    bellMesh.rotation.y = ry;
    h.add(bellMesh);
    h.collide({ x: BELL.x, z: BELL.z, r: 0.85, h: 3 });
    // The striker log itself belongs to the bell mini-game (features/minigames/bell.ts), which hangs
    // it toward the hall at ≈ bell radius + 0.95 m from a pivot 1.5 m above the strike point. We only
    // hang the timber it swings from, under the cross beam, where its ropes meet it.
    {
      const radius = 0.8, bottom = hang.y - 0.35 - Hb, centreY = (bottom + hang.y + 0.31) / 2;
      const pivotY = bottom + (centreY - bottom) * 0.55 + 1.5;
      const restD = radius + 0.95;
      bellMesh.userData.strikerRestD = restD; // the bell mini-game hangs its log from here
      const q = F(restD, 0);
      b.add(place(new THREE.BoxGeometry(1.5, 0.16, 0.16), q.x, pivotY + 0.08, q.z, ry), COL.wood, { edge: 30 });
      for (const u of [-0.6, 0.6]) {
        const r2 = F(restD + u, 0);
        const y0 = pivotY + 0.16, y1 = beamY - 0.72;
        if (y1 > y0 + 0.02) b.add(place(new THREE.CylinderGeometry(0.03, 0.03, y1 - y0, 5), r2.x, (y0 + y1) / 2, r2.z), '#3b2a21');
      }
    }
    h.group.userData.bell = bellMesh;
  }

  // ── the pagoda: seven storeys, octagonal, wind-bells at every corner ────
  const windBells: { p: T.Vector3; ph: number }[] = [];
  let pagodaTop = 0;
  // built apart and flagged as a landmark, so it still rises over the ridge from the other places
  const pb = new Batch();
  {
    const { x, z } = PAGODA;
    const g0 = h.span(x, z, 3.2).hi + 0.2;
    const lo = h.span(x, z, 4.6).lo - 0.6;
    pb.add(place(new THREE.CylinderGeometry(4.2, 4.4, g0 - lo, 8, 1, false, Math.PI / 8), x, (g0 + lo) / 2, z), COL.stone, { edge: 30, jitter: 0.04 });
    pb.add(place(new THREE.CylinderGeometry(3.3, 3.5, 0.7, 8, 1, false, Math.PI / 8), x, g0 + 0.35, z), COL.stoneMid, { edge: 30 });
    let y = g0 + 0.7;
    const storeys = 7;
    for (let s = 0; s < storeys; s++) {
      const k = s / (storeys - 1);
      const r = 2.55 - 1.05 * k;
      const hs = s === 0 ? 3.6 : 2.55 - 0.5 * k;
      pb.add(place(new THREE.CylinderGeometry(r, r * 1.02, hs, 8, 1, false, Math.PI / 8), x, y + hs / 2, z), '#ecdec3', { edge: 30, jitter: 0.03 });
      // corner posts (ink lines down the real corners, which sit at odd multiples of π/8) and a door
      // on alternate faces, set just proud of the face
      const segs: number[] = [];
      for (const [cx, cz] of ngon(8, r * 1.012, Math.PI / 8)) segs.push(x + cx, y, z + cz, x + cx, y + hs, z + cz);
      pb.segs(segs);
      const apo = r * Math.cos(Math.PI / 8);
      for (let i = 0; i < 8; i += 2) {
        const a = ((i + (s % 2)) / 8) * TAU;
        const fx = x + Math.cos(a) * (apo + 0.05), fz = z + Math.sin(a) * (apo + 0.05);
        const dh = Math.min(hs * 0.62, 2.2);
        pb.add(place(new THREE.BoxGeometry(r * 0.4, dh, 0.08), fx, y + hs * 0.08 + dh / 2, fz, Math.atan2(Math.cos(a), Math.sin(a))), s === 0 && i === 0 ? '#2e2622' : '#6d5a4a', { edge: 30 });
      }
      // brackets band, then the eave
      y += hs;
      pb.add(place(new THREE.CylinderGeometry(r + 0.25, r, 0.3, 8, 1, false, Math.PI / 8), x, y + 0.15, z), '#41554e', { edge: 30 });
      const eo = r + 1.35 - 0.3 * k;
      const eaveY = y + 0.25;
      // the eave's corners over the body's corners, a wind-bell under each flying corner
      roof(pb, ngon(8, eo / Math.cos(Math.PI / 8), Math.PI / 8).map(([a, c]) => [x + a, z + c]), ngon(8, (r * 0.92) / Math.cos(Math.PI / 8), Math.PI / 8).map(([a, c]) => [x + a, z + c]), eaveY, eaveY + 0.75, { curl: 0.42, flare: 0.3, U: 6, V: 4 });
      for (const [cx, cz] of ngon(8, (eo + 0.3) / Math.cos(Math.PI / 8), Math.PI / 8)) windBells.push({ p: new THREE.Vector3(x + cx, eaveY + 0.3, z + cz), ph: rng() * TAU });
      y = eaveY + 0.55;
    }
    // the spire (塔刹): a lotus base, stacked rings, a vase and a pearl
    pb.add(place(new THREE.CylinderGeometry(0.9, 1.3, 0.8, 8, 1, false, Math.PI / 8), x, y + 0.2, z), COL.tile, { edge: 30 });
    pb.add(place(new THREE.SphereGeometry(0.62, 10, 6, 0, TAU, 0, Math.PI / 2), x, y + 0.6, z), '#5e5a4f', { hull: true });
    pb.add(place(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), x, y + 2.7, z), COL.bronzeDark, { rim: true });
    for (let i = 0; i < 7; i++) pb.add(place(new THREE.TorusGeometry(0.36 - i * 0.03, 0.06, 5, 12).rotateX(Math.PI / 2), x, y + 1.4 + i * 0.32, z), COL.bronze, { rim: true });
    pb.add(place(new THREE.SphereGeometry(0.28, 10, 8), x, y + 4.0, z, 0, 1, 1.3, 1), COL.bronze, { hull: true });
    pb.add(place(new THREE.SphereGeometry(0.16, 10, 8), x, y + 4.55, z), '#b08d55', { hull: true });
    pagodaTop = y + 4.8;
    h.collide({ x, z, r: 4.2, h: pagodaTop - g0 });
    h.occlude({ x, z, r: 2.4, y0: g0, y1: pagodaTop });
  }
  for (const o of pb.build(h, 'mountain:pagoda', { outline: 0.04, lineOpacity: 0.66, rim: 0.6 })) o.userData.landmark = true;

  // ── the waterfall ───────────────────────────────────────────────────
  // The stream crosses the terrace in a stone-lined runnel from behind the pagoda and pours over the
  // terrace's own edge, down a face of stacked slab rock (斧劈皴) whose tops lie flush with the
  // terrace, into the pool where the river begins.
  const waterY = ctx.waterAt(POOL.x, POOL.z) ?? h.y(POOL.x, POOL.z) - 0.25;
  const terraceY = h.y(FALL.x, FALL.z - 9);
  /** Where the terrace breaks off above the pool, along x (found in the ground, it curves round the pool). */
  const edgeAt = (x: number): number => {
    for (let z = POOL.z - 2; z > POOL.z - 18; z -= 0.25) if (h.y(x, z) > terraceY - 0.4) return z;
    return POOL.z - 8;
  };
  const edgeZ = edgeAt(FALL.x);
  const lipY = terraceY - 0.06;
  const lip = { x: FALL.x, z: edgeZ + 0.55 };
  const foot = { x: FALL.x, z: edgeZ + 5.4 };
  // the runnel's course, from behind the pagoda round to the lip
  const runnel = wind([
    { x: PAGODA.x + 4.5, z: PAGODA.z - 5.5 }, { x: PAGODA.x + 6, z: PAGODA.z + 2 }, { x: PAGODA.x + 3.5, z: PAGODA.z + 9 },
    { x: FALL.x + 1.2, z: edgeZ - 4 }, { x: lip.x, z: lip.z },
  ], 0.8);
  {
    // the face: layers of slab rock standing out in front of the ground's own drop, the lower ones
    // further out, following the edge round the pool; the top layer is the rim rock the water leaves
    const lr = makeRng(4101);
    const yb = waterY - 0.7;
    const top0 = terraceY - 0.08;
    const layers = Math.max(3, Math.round((top0 - yb) / 1.2));
    const lh = (top0 - yb) / layers;
    for (let k = 0; k < layers; k++) {
      const y0 = yb + k * lh;
      const out = (1 - k / (layers - 1)) * 1.2;
      let xx = FALL.x - 7.5 + lr() * 0.6;
      while (xx < FALL.x + 7.5) {
        const w = 1.6 + lr() * 2.0;
        const cx = Math.min(xx + w / 2, FALL.x + 7.5);
        // the notch the water has worn: the middle stands back a little
        const notch = Math.abs(cx - FALL.x) < 1.3 && k < layers - 1 ? -0.3 : 0;
        const front = edgeAt(cx) + 0.5 + out + notch + (k === layers - 1 ? lr.range(-0.1, 0.15) : lr.range(-0.25, 0.25));
        const depth = 3.0 + lr() * 1.2;
        const top = k === layers - 1 ? top0 : y0 + lh * lr.range(0.94, 1.1);
        const bot = y0 - 0.3;
        const g = new THREE.BoxGeometry(w + 0.1, top - bot, depth);
        const tilt = k === layers - 1 ? 0 : 1;
        const ry = lr.range(-0.06, 0.06) + Math.atan2(edgeAt(cx + 1) - edgeAt(cx - 1), 2) * -1;
        place(g, cx, (top + bot) / 2, front - depth / 2, ry, 1, 1, 1, lr.range(-0.03, 0.03) * tilt, lr.range(-0.04, 0.04) * tilt);
        const tone = new THREE.Color(k % 2 ? '#aba18b' : '#9f9581').multiplyScalar(lr.range(0.88, 1.05)).lerp(new THREE.Color('#625b4e'), (1 - k / layers) * 0.35);
        b.add(g, tone, { edge: 25, jitter: 0.05, seed: 4100 + k });
        xx += w;
      }
    }
    h.occlude({ x: FALL.x, z: edgeZ + 0.5, r: 5, y0: yb, y1: terraceY });
    // a curb of low stones along the edge either side of the lip, so no one walks off the cliff
    for (const s of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const x = FALL.x + s * (1.4 + i * 0.85), z = edgeAt(x) - 0.35;
        const g = rockGeometry(4300 + i + (s > 0 ? 10 : 0), 0.9 + lr() * 0.4, 0.38 + lr() * 0.2, { base: '#aea48e', dark: '#5a5448', lean: 0.05, flat: 0.4 });
        g.rotateY(lr() * TAU);
        g.translate(x, terraceY - 0.05, z);
        b.colored(g, { hull: true });
        h.collide({ x, z, r: 0.45, h: 1 });
        h.collide({ x: x + s * 0.42, z: edgeAt(x + s * 0.42) - 0.35, r: 0.4, h: 1 });
      }
    }
    // the runnel: a pale water strip between two low curbs of stone
    {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      let v = 0;
      for (let i = 0; i < runnel.length; i++) {
        const p = runnel[i], q = runnel[Math.min(runnel.length - 1, i + 1)], o = runnel[Math.max(0, i - 1)];
        const tx = q.x - o.x, tz = q.z - o.z, tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl;
        if (i > 0) v += Math.hypot(p.x - runnel[i - 1].x, p.z - runnel[i - 1].z);
        const y = Math.max(h.y(p.x, p.z), lipY) + 0.05;
        for (const s of [-1, 1]) { pos.push(p.x + nx * s * 0.45, y, p.z + nz * s * 0.45); uv.push(s < 0 ? 0 : 1, v / 3); }
        if (i < runnel.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        if (i % 2 === 0 && i < runnel.length - 1) {
          for (const s of [-1, 1]) {
            const cx = p.x + nx * s * 0.62, cz = p.z + nz * s * 0.62;
            b.add(place(new THREE.BoxGeometry(0.28, 0.22, 1.5), cx, h.y(cx, cz) + 0.06, cz, Math.atan2(tx, tz) + lr.range(-0.08, 0.08)), new THREE.Color(COL.stoneMid).multiplyScalar(lr.range(0.85, 1.02)), { edge: 40 });
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const tex = h.tex(streakCanvas(73), { repeat: true });
      const m = h.own(new THREE.MeshBasicMaterial({ map: tex, color: '#bcc3b5', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      const mesh = new THREE.Mesh(g, m);
      mesh.name = 'mountain:runnel';
      mesh.renderOrder = 2;
      h.add(mesh);
      const base = new THREE.Color('#bcc3b5');
      h.frame((dt) => {
        if (!h.reduced) tex.offset.y = (tex.offset.y - dt * 0.5) % 1;
        m.color.copy(base).multiply(h.paper);
      });
      for (let i = 0; i < runnel.length; i += 3) rects.push(orect(runnel[i].x, runnel[i].z, 0, 1.2, 1.2));
    }
    // rocks round the pool, leaving the river's way out open
    const out = RIVER[1];
    const outA = Math.atan2(out.z - POOL.z, out.x - POOL.x);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.2;
      if (Math.abs(Math.atan2(Math.sin(a - outA), Math.cos(a - outA))) < 0.55) continue;
      const d = 4.4 + rng() * 0.8;
      const x = POOL.x + Math.cos(a) * d, z = POOL.z + Math.sin(a) * d;
      if (z < edgeAt(x) + 2.2) continue;
      const s = 0.8 + rng() * 0.9;
      const g = rockGeometry(4200 + i, s * 1.6, s * 1.0, { base: '#b2aa94', dark: '#4a4843', lean: 0.1 });
      g.rotateY(rng() * TAU);
      g.translate(x, Math.min(h.y(x, z), waterY) - 0.35, z);
      b.colored(g, { hull: true });
      h.collide({ x, z, r: s * 0.7, h: s });
    }
    // our own pool surface if the core has no water here
    if (ctx.waterAt(POOL.x, POOL.z) === null) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28).rotateX(-Math.PI / 2), h.own(new THREE.MeshLambertMaterial({ color: '#9ca99d', transparent: true, opacity: 0.88 })));
      pool.position.set(POOL.x, waterY, POOL.z);
      pool.name = 'mountain:pool';
      h.add(pool);
    }
  }
  {
    // the falling water: a ribbon that leaves the lip, arcs out, and drops into the pool
    const topW = 1.2, botW = 2.6;
    const ribbon = (width0: number, width1: number, push: number): T.BufferGeometry => {
      const N = 14;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const drop = lipY - waterY;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y = lipY - drop * t;
        // a parabola out from the lip, then straight down
        const zz = lip.z + push * Math.sqrt(t) * 1.6 + (foot.z - lip.z - 1.6) * t * t;
        const w = width0 + (width1 - width0) * Math.pow(t, 1.4);
        for (const s of [-1, 1]) {
          pos.push(lip.x + s * w / 2 + Math.sin(t * 5) * 0.08, y, zz);
          uv.push(s < 0 ? 0 : 1, (1 - t) * drop / 4);
        }
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const mk = (seed: number, color: string, opacity: number, w0: number, w1: number, push: number, speed: number, order: number) => {
      const tex = h.tex(streakCanvas(seed), { repeat: true });
      const m = h.own(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      const mesh = new THREE.Mesh(ribbon(w0, w1, push), m);
      mesh.renderOrder = order;
      mesh.name = 'mountain:waterfall';
      h.add(mesh);
      const base = new THREE.Color(color);
      h.frame((dt) => {
        if (!h.reduced) tex.offset.y = (tex.offset.y + dt * speed) % 1;
        m.color.copy(base).multiply(h.paper);
      });
    };
    // a pale body behind, bright streaks in front
    const body = new THREE.Mesh(ribbon(topW * 0.95, botW * 0.9, 0.95), h.own(new THREE.MeshBasicMaterial({ color: '#ced1c2', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })));
    body.renderOrder = 3;
    h.add(body);
    lit(h, body.material as T.MeshBasicMaterial, '#ced1c2');
    mk(71, '#ffffff', 0.95, topW, botW, 1.0, 1.4, 4);
    mk(72, '#f4f2e1', 0.75, topW * 1.08, botW * 1.12, 1.05, 2.1, 5);
    // foam where it lands, spray and mist
    const foamTex = h.tex(foamCanvas());
    const foam = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24).rotateX(-Math.PI / 2), h.own(new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0.85 })));
    foam.position.set(foot.x, waterY + 0.05, foot.z - 0.6);
    foam.renderOrder = 2;
    foam.name = 'mountain:foam';
    h.add(foam);
    h.frame((_dt, t) => {
      if (!h.reduced) foam.rotation.y = t * 0.08;
      (foam.material as T.MeshBasicMaterial).color.copy(h.paper);
    });
    const puffT = h.tex(puffCanvas(64, 9));
    const spray = particles(h, {
      count: 120, at: [new THREE.Vector3(foot.x, waterY + 0.2, foot.z - 0.8)], spread: [1.3, 0.2, 0.6], vel: [0, 0.9, 0.35], velJitter: [0.8, 0.5, 0.6], gravity: 0.6,
      life: 2.6, size: 0.9, grow: 2.2, color: '#ffffff', opacity: 0.55, tex: puffT, seed: 31,
    });
    spray.name = 'mountain:spray';
    h.add(spray);
    const mist = mistCards(h, [
      { p: new THREE.Vector3(foot.x, waterY + 1.4, foot.z), w: 9, h: 4 },
      { p: new THREE.Vector3(foot.x - 2.5, waterY + 2.6, foot.z - 1), w: 8, h: 5 },
      { p: new THREE.Vector3(foot.x + 2.8, waterY + 2.2, foot.z - 0.5), w: 8, h: 4.5 },
      { p: new THREE.Vector3(foot.x, waterY + 4.5, foot.z - 1.5), w: 10, h: 6 },
    ], { tex: h.tex(puffCanvas(128, 19)), color: '#ffffff', opacity: 0.5, drift: 0.12 });
    mist.name = 'mountain:fall-mist';
    h.add(mist);
    h.frame(() => { (mist.material as T.MeshBasicMaterial).color.copy(h.paper); });
  }

  // ── ancient pines, one hung with prayer ribbons ─────────────────────────
  // nothing grows on what is built: the terraces, stairs, platforms, walls (tested as rectangles)
  rects.push(gRect(-9.9, -4.5, -0.35, 0.35), gRect(4.5, 9.9, -0.35, 0.35), gRect(-9.9, -9.3, 0.3, -8), gRect(9.3, 9.9, 0.3, -8));
  const built = (x: number, z: number, m: number) => rects.some((c) => {
    const dx = x - c.cx, dz = z - c.cz;
    return Math.abs(dx * c.ax + dz * c.az) <= c.hl + m && Math.abs(-dx * c.az + dz * c.ax) <= c.hw + m;
  });
  const lakeEnd: XZ[] = [{ x: 46, z: -92 }, { x: 38, z: -93 }]; // the core grades the lake path on to here
  const clearOf = (x: number, z: number, pad = 0) =>
    pathDist(x, z) > 2.6 + pad &&
    polyDist(lakeEnd, x, z) > 2.6 + pad &&
    !built(x, z, Math.max(0.4, 2 + pad)) &&
    Math.hypot(x - PAGODA.x, z - PAGODA.z) > Math.max(4.9, 6 + pad) &&
    Math.hypot(x - FALL.x, z - (edgeZ + 3)) > Math.max(8.5, 9 + pad) &&
    polyDist(runnel, x, z) > Math.max(0.9, 1.6 + pad) &&
    distToSeg(x, z, G(0, 9), G(0, -AX.len)) > Math.max(1.8, 4 + pad) &&
    ctx.waterAt(x, z) === null;
  const gp = (lx: number, lz: number, s: number): [number, number, number] => { const p = G(lx, lz); return [p.x, p.z, s]; };
  const pineSpots: [number, number, number][] = [
    gp(-7.5, 6.5, 1.1), gp(13.5, 3, 1.0), gp(-12.5, -15.5, 1.15),
    [HALL.x + 12, HALL.z + 4, 1.0], [HALL.x - 4, HALL.z - 12, 1.2],
    [PAGODA.x + 7, PAGODA.z + 5, 0.95], [BELL.x - 7, BELL.z + 4, 1.0], [BELL.x + 2, BELL.z - 8, 1.1],
  ];
  for (let tries = 0; tries < 400 && pineSpots.length < 16; tries++) {
    const a = rng() * TAU, d = 10 + rng() * (R.radius - 6);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (!clearOf(x, z, 1)) continue;
    if (pineSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 8)) continue;
    pineSpots.push([x, z, 0.85 + rng() * 0.4]);
  }
  let ribbonTree: { tips: T.Vector3[]; x: number; z: number; y: number } | null = null;
  pineSpots.forEach(([x, z, s], i) => {
    if (!clearOf(x, z, -1)) return;
    const y = h.y(x, z);
    const p = pineTree(rng, x, y, z, s, { leanDir: Math.atan2(z - R.center.z, x - R.center.x) + (rng() - 0.5), lean: 0.2 + rng() * 0.3 });
    for (const g of p.trunk) b.colored(g, { hull: true, rim: true });
    for (const g of p.pads) b.colored(g, { hull: true });
    h.collide({ x, z, r: 0.5 * s, h: p.height });
    h.occlude({ x, z, r: 0.5, y0: y, y1: y + p.height });
    if (i === 2) ribbonTree = { tips: p.tips, x, z, y };
  });

  // stone rubble and grass
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU, d = 6 + rng() * (R.radius - 4);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (!clearOf(x, z, -1.5)) continue;
    const s = 0.6 + rng() * 1.2;
    const g = rockGeometry(4400 + i, s * 1.5, s * 0.9, { base: '#b8ad95', dark: '#504a40' });
    g.rotateY(rng() * TAU);
    g.translate(x, h.y(x, z) - 0.1, z);
    b.colored(g, { hull: true });
    h.collide({ x, z, r: s * 0.6, h: s });
  }

  b.build(h, 'mountain', { outline: 0.04, lineOpacity: 0.66, rim: 0.6 });

  // ── ribbons ─────────────────────────────────────────────────────────
  if (ribbonTree) {
    const rt = ribbonTree as { tips: T.Vector3[]; x: number; z: number; y: number };
    const ribbonMat = windCards(h, h.tex(ribbonCanvas()), { amp: 0.35, baseY: rt.y + 2, span: 4, alphaTest: 0.4, key: 'ribbon' });
    const spots: T.Vector3[] = [];
    for (const tip of rt.tips) {
      const base = new THREE.Vector3(rt.x, tip.y, rt.z);
      for (let k = 0; k < 7; k++) {
        const p = base.clone().lerp(tip, 0.3 + rng() * 0.65);
        if (p.y - rt.y > 7) continue;
        spots.push(p.add(new THREE.Vector3(0, -0.45, 0)));
      }
    }
    const geo = new THREE.PlaneGeometry(0.16, 0.8);
    const ribbons = new THREE.InstancedMesh(geo, ribbonMat, Math.max(1, spots.length));
    ribbons.count = spots.length;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(1, 1, 1);
    spots.forEach((p, i) => {
      e.set(0, rng() * TAU, (rng() - 0.5) * 0.2);
      q.setFromEuler(e);
      s3.set(1, 0.8 + rng() * 0.6, 1);
      ribbons.setMatrixAt(i, m4.compose(p, q, s3));
    });
    ribbons.instanceMatrix.needsUpdate = true;
    ribbons.computeBoundingSphere();
    ribbons.name = 'mountain:ribbons';
    h.add(ribbons);
    lit(h, ribbonMat);
    // a red cord tied round the trunk
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 16).rotateX(Math.PI / 2), h.toon(COL.cinnabar));
    cord.position.set(rt.x, rt.y + 1.4, rt.z);
    h.add(cord);
  }

  // ── wind-bells on the pagoda: tiny bronze bells swinging on the breeze ───
  {
    const bg = new THREE.ConeGeometry(0.1, 0.22, 6).translate(0, -0.2, 0);
    const clap = new THREE.BoxGeometry(0.08, 0.1, 0.01).translate(0, -0.38, 0);
    const merged = mergeColored(THREE, [tintGeo(THREE, bg, COL.bronze), tintGeo(THREE, clap, '#8b3e2f')]);
    const bells = new THREE.InstancedMesh(merged, h.toon('#ffffff', { vc: true, rim: 0.4 }), windBells.length);
    bells.name = 'mountain:wind-bells';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    const place1 = (t: number) => {
      windBells.forEach((wb, i) => {
        const gust = h.reduced ? 0 : 0.18 * Math.sin(t * 1.3 + wb.ph) + 0.08 * Math.sin(t * 3.1 + wb.ph * 2);
        e.set(gust, 0, gust * 0.6);
        q.setFromEuler(e);
        bells.setMatrixAt(i, m4.compose(wb.p, q, one));
      });
      bells.instanceMatrix.needsUpdate = true;
    };
    place1(0);
    bells.computeBoundingSphere();
    h.add(bells);
    let acc = 0;
    h.frame((dt, t) => {
      acc += dt;
      if (acc < 1 / 30 || !bells.visible || !h.group.parent?.visible) return;
      acc = 0;
      place1(t);
    });
  }

  // ── lights: red lanterns, and glows that come on at night ──────────────
  {
    // the four red lanterns: one merged, vertex-coloured shape drawn as a single instanced mesh
    const lanGeo = mergeColored(THREE, [
      tintGeo(THREE, new THREE.SphereGeometry(0.28, 12, 9).scale(1, 1.25, 1), '#b0473a'),
      tintGeo(THREE, new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10).translate(0, 0.34, 0), '#2b2724'),
      tintGeo(THREE, new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10).translate(0, -0.34, 0), '#2b2724'),
      tintGeo(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4).translate(0, 0.53, 0), '#2b2724'),
    ]);
    const lanMat = h.toon('#ffffff', { vc: true, emissive: '#000000' });
    const lanterns = new THREE.InstancedMesh(lanGeo, lanMat, Math.max(1, redLanterns.length));
    lanterns.count = redLanterns.length;
    lanterns.name = 'mountain:lanterns';
    const lm4 = new THREE.Matrix4(), lq = new THREE.Quaternion(), le = new THREE.Euler(), lone = new THREE.Vector3(1, 1, 1), lp = new THREE.Vector3();
    const swayLanterns = (t: number) => {
      redLanterns.forEach((p, i) => {
        const a = h.reduced ? 0 : Math.sin(t * 0.8 + i * 1.7) * 0.04;
        le.set(0, 0, a);
        lq.setFromEuler(le);
        // swing about the cord's top
        lp.set(p.x + Math.sin(a) * 0.68, p.y + 0.68 - Math.cos(a) * 0.68, p.z);
        lanterns.setMatrixAt(i, lm4.compose(lp, lq, lone));
      });
      lanterns.instanceMatrix.needsUpdate = true;
    };
    swayLanterns(0);
    lanterns.computeBoundingSphere();
    h.add(lanterns);
    for (const p of redLanterns) addGlow(p.clone(), 3);
    lampPools(h, redLanterns, 'mountain:pools');
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPts.flatMap((p) => [p.x, p.y, p.z]), 3));
    gg.setAttribute('aSize', new THREE.Float32BufferAttribute(glowSize, 1));
    const gm = h.own(new THREE.PointsMaterial({ size: 1, map: h.tex(glowCanvas(64)), color: '#ffcf8a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, opacity: 0 }));
    gm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    gm.customProgramCacheKey = () => 'hill-glow';
    const glows = new THREE.Points(gg, gm);
    glows.name = 'mountain:glows';
    glows.renderOrder = 6;
    h.add(glows);
    h.frame((_dt, t) => {
      const n = h.night;
      const flick = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
      gm.opacity = 0.6 * n * flick;
      glows.visible = n > 0.02;
      lanMat.emissive.setRGB(0.55 * n * flick, 0.2 * n * flick, 0.08 * n);
      if (lanterns.visible && h.group.parent?.visible !== false) swayLanterns(t);
    });
  }

  // ── grass tufts and a band of cloud below the temple ───────────────────
  {
    const mat = windCards(h, h.tex(tuftCanvas()), { amp: 0.1, baseY: R.elevation - 20, span: 22, alphaTest: 0.35, key: 'mtn-tuft' });
    const spots: [number, number][] = [];
    for (let i = 0; i < 1200 && spots.length < 260; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * (R.radius + 4);
      const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
      if (!clearOf(x, z, -2.2)) continue;
      spots.push([x, z]);
    }
    const q0 = new THREE.PlaneGeometry(0.6, 0.45).translate(0, 0.22, 0);
    const q1 = q0.clone().rotateY(Math.PI / 2);
    const geo = mergeUV(THREE, [q0, q1]);
    const tufts = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const s = 0.7 + rng() * 0.8;
      e.set(0, rng() * TAU, 0); q.setFromEuler(e);
      p3.set(x, h.y(x, z) - 0.02, z); s3.set(s, s, s);
      tufts.setMatrixAt(i, m4.compose(p3, q, s3));
    });
    tufts.instanceMatrix.needsUpdate = true;
    tufts.computeBoundingSphere();
    tufts.name = 'mountain:tufts';
    h.add(tufts);
    lit(h, mat);
    const clouds: { p: T.Vector3; w: number; h: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rng() * 0.3, d = R.radius * (0.85 + rng() * 0.4);
      const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
      clouds.push({ p: new THREE.Vector3(x, h.y(x, z) + 1 + rng() * 2, z), w: 18 + rng() * 12, h: 4 + rng() * 3 });
    }
    // a veil drifting across the pagoda's middle storeys (塔隐云中)
    clouds.push({ p: new THREE.Vector3(PAGODA.x + 3, pagodaTop - 9, PAGODA.z + 3), w: 12, h: 3.2 });
    const cloud = mistCards(h, clouds, { tex: h.tex(puffCanvas(128, 27)), color: '#faeed7', opacity: 0.6, drift: 0.4 });
    cloud.name = 'mountain:clouds';
    h.add(cloud);
    h.frame(() => { (cloud.material as T.MeshBasicMaterial).color.set('#faeed7').multiply(h.paper); });
  }
  // the walkable terraces, stairs and platforms, and the built-over ground (registered last, so every
  // height sampled above is the bare ground's)
  for (const d of decks) h.deck(d);
  for (const r of rects) h.clearing(r);
}

// ───────────────────────────── helpers ─────────────────────────────

function distToSeg(x: number, z: number, a: XZ, b: XZ): number {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

function tintGeo(THREE: WorldCtx['THREE'], geo: T.BufferGeometry, color: string): T.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function mergeColored(THREE: WorldCtx['THREE'], list: T.BufferGeometry[]): T.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const g of list) {
    pos.push(...Array.from(g.attributes.position.array));
    nor.push(...Array.from(g.attributes.normal.array));
    col.push(...Array.from(g.attributes.color.array));
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function mergeUV(THREE: WorldCtx['THREE'], list: T.BufferGeometry[]): T.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of list) {
    pos.push(...Array.from(g.attributes.position.array));
    uv.push(...Array.from(g.attributes.uv.array));
    idx.push(...Array.from(g.index!.array, (i) => i + off));
    off += g.attributes.position.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const mountainRegion: RegionModule = {
  id: 'mountain',
  build,
  dispose() {
    hill?.dispose();
    hill = null;
  },
};
