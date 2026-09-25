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
  Batch, COL, Hill, TAU, canvas, clamp, glowCanvas, hipRoof, lit, mistCards, ngon, particles, pathDist, place, plaqueCanvas,
  puffCanvas, rect, rockGeometry, roof, stairs, three, windCards, xform,
} from './hill-kit';
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
const onAxis = (t: number): XZ => ({ x: GATE.x + AX.dx * t, z: GATE.z + AX.dz * t });

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
  const gateY = h.y(GATE.x, GATE.z);
  const courtC = onAxis(AX.len - 9.5);
  // the courtyard is paved in slabs that follow the slope (the walker stays on the stone);
  // its front edge sets where the long stairs arrive
  const courtFront = onAxis(AX.len - 14.2);
  const courtTop = h.y(courtFront.x, courtFront.z) + 0.12;
  const porch = onAxis(AX.len - 5.4);
  const hallTop = h.y(porch.x, porch.z) + 0.45;

  // ── 山门: the mountain gate between ochre walls ──────────────────────
  {
    const F = frame(GATE.x, GATE.z, FACE);
    const top = gateY + 0.25;
    const lo = h.span(GATE.x, GATE.z, 4.5).lo - 0.5;
    const A = 4.2, C = 2.0;
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.6, top - lo, C * 2 + 0.6), GATE.x, (top + lo) / 2, GATE.z, FACE), COL.stone, { edge: 30, jitter: 0.04 });
    const colH = 3.9;
    for (const lx of [-A + 0.3, -1.4, 1.4, A - 0.3]) for (const lz of [-C + 0.3, C - 0.3]) {
      const p = F(lx, lz);
      column(p, top, colH, 0.17);
      h.collide({ x: p.x, z: p.z, r: 0.25, h: colH });
    }
    // side bays walled, round windows painted dark
    for (const s of [-1, 1]) {
      panel(F, FACE, s * 1.55, 0, s * (A - 0.45), 0, top, colH - 0.5, 0.35, '#6f4638');
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
      h.collide({ x: F(s * 2.8, 0).x, z: F(s * 2.8, 0).z, r: 1.3, h: colH });
    }
    // the central doors stand open against the walls
    for (const s of [-1, 1]) {
      const p = F(s * 1.3, -0.35);
      b.add(place(new THREE.BoxGeometry(0.08, 3.1, 1.2), p.x, top + 1.55, p.z, FACE), '#6a4034', { edge: 30 });
      // door studs
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const q = F(s * 1.25, -0.75 + j * 0.35);
        b.add(place(new THREE.SphereGeometry(0.035, 5, 4), q.x, top + 0.8 + i * 0.45, q.z), '#c39a4a');
      }
    }
    const beamY = top + colH;
    b.add(place(new THREE.BoxGeometry(A * 2, 0.34, C * 2), GATE.x, beamY + 0.1, GATE.z, FACE), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.3, 0.3, C * 2 + 0.3), GATE.x, beamY + 0.42, GATE.z, FACE), '#3f5553', { edge: 30 });
    hipRoof(b, GATE.x, GATE.z, FACE, A + 1.4, C + 1.3, beamY + 0.55, 2.0, { curl: 0.5, flare: 0.35 });
    const pf = F(0, C + 0.02);
    plaque('云深寺', pf, beamY + 0.12, FACE, 1.8, 0.62);
    // red lanterns under the eave
    for (const s of [-1, 1]) {
      const p = F(s * 1.0, C + 0.5);
      redLanterns.push(new THREE.Vector3(p.x, beamY - 0.55, p.z));
    }
    h.occlude({ x: GATE.x, z: GATE.z, r: 2.5, y0: top, y1: beamY + 2.6 });
    // ochre temple walls running out from the gate and back up the slope
    const wallRun: [number, number][][] = [
      [[-A - 0.3, 0], [-A - 6.5, 0], [-A - 6.5, -6]],
      [[A + 0.3, 0], [A + 6.5, 0], [A + 6.5, -6]],
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
          if (pathDist(mx, mz) < 2.2 || ctx.waterAt(mx, mz) !== null) continue;
          const wy = h.y(mx, mz);
          const sl = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.02;
          const dir = Math.atan2(p1.x - p0.x, p1.z - p0.z) + Math.PI / 2;
          b.add(place(new THREE.BoxGeometry(sl, 3.2, 0.5), mx, wy + 0.95, mz, dir), COL.templeWall, { edge: 30, jitter: 0.05 });
          b.add(place(new THREE.BoxGeometry(sl, 0.45, 0.52), mx, wy - 0.4, mz, dir), '#8e7d64', { edge: 30 });
          b.add(place(new THREE.BoxGeometry(sl + 0.04, 0.16, 0.9), mx, wy + 2.62, mz, dir), COL.tile, { edge: 30 });
          b.add(place(new THREE.BoxGeometry(sl + 0.04, 0.12, 0.2), mx, wy + 2.76, mz, dir), COL.tileDark);
          h.collide({ x: mx, z: mz, r: 0.9, h: 2.6 });
        }
      }
    }
  }

  // ── the long stairs, with stone lanterns ─────────────────────────────
  const s0 = onAxis(2.6), s1 = onAxis(AX.len - 14.2);
  const a3 = new THREE.Vector3(s0.x, gateY + 0.22, s0.z);
  const c3 = new THREE.Vector3(s1.x, courtTop, s1.z);
  stairs(b, h, a3, c3, 3.2, { rise: 0.16, seed: 21 });
  for (const t of [0.15, 0.5, 0.85]) {
    for (const s of [-1, 1]) {
      const p = { x: a3.x + (c3.x - a3.x) * t + Math.cos(FACE) * s * 2.6, z: a3.z + (c3.z - a3.z) * t - Math.sin(FACE) * s * 2.6 };
      const y = h.y(p.x, p.z);
      b.add(place(new THREE.CylinderGeometry(0.26, 0.3, 0.18, 6), p.x, y + 0.09, p.z), '#a6a092', { edge: 40 });
      b.add(place(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8), p.x, y + 0.5, p.z), '#b1ab9e', { rim: true });
      b.add(place(new THREE.BoxGeometry(0.34, 0.3, 0.34), p.x, y + 1.0, p.z), '#b8b2a5', { edge: 40 });
      b.add(place(new THREE.BoxGeometry(0.35, 0.14, 0.35), p.x, y + 1.0, p.z), '#4a4540');
      b.add(place(new THREE.ConeGeometry(0.38, 0.28, 6), p.x, y + 1.29, p.z), '#8f8a80', { edge: 40 });
      b.add(place(new THREE.SphereGeometry(0.07, 8, 6), p.x, y + 1.46, p.z), '#8f8a80');
      addGlow(new THREE.Vector3(p.x, y + 1.0, p.z), 1.5);
      h.collide({ x: p.x, z: p.z, r: 0.3, h: 1.5 });
    }
  }

  // ── the courtyard and the great censer ───────────────────────────────
  {
    const F = frame(courtC.x, courtC.z, FACE);
    const hw = 8.5, hd = 5.8, cell = 1.42;
    const prng = makeRng(77);
    for (let i = -hw + cell / 2; i < hw; i += cell) {
      for (let j = -hd + cell / 2; j < hd; j += cell) {
        const p = F(i, j);
        const gy = h.y(p.x, p.z);
        const top = gy + 0.1;
        const col = new THREE.Color(COL.stoneWarm).multiplyScalar(prng.range(0.9, 1.04));
        b.add(place(new THREE.BoxGeometry(cell - 0.03, 0.9, cell - 0.03), p.x, top - 0.45, p.z, FACE), col, { edge: 40 });
      }
    }
    // balustrade along the front edge, open in the middle for the stairs
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const lx = s * (2.2 + k * 1.3);
        const p = F(lx, hd - 0.2);
        const by = h.y(p.x, p.z) + 0.1;
        b.add(place(new THREE.BoxGeometry(0.18, 0.75, 0.18), p.x, by + 0.37, p.z, FACE), COL.stone, { edge: 40 });
        if (k < 4) {
          const q = F(lx + s * 0.65, hd - 0.2);
          const qy = h.y(q.x, q.z) + 0.1;
          b.add(place(new THREE.BoxGeometry(1.15, 0.12, 0.12), q.x, qy + 0.62, q.z, FACE), COL.stone, { edge: 40 });
          b.add(place(new THREE.BoxGeometry(1.15, 0.35, 0.06), q.x, qy + 0.3, q.z, FACE), COL.stoneMid, { edge: 40 });
        }
      }
    }
    // the censer (香炉): a bronze 鼎 on three legs, with a little roofed lid
    const cp = F(0, 0.8);
    const cy = h.y(cp.x, cp.z) + 0.1;
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
      const e = F(s * 0.95, 0.8);
      b.add(place(new THREE.TorusGeometry(0.16, 0.045, 5, 10, Math.PI), e.x, cy + 1.36, e.z, FACE + Math.PI / 2), COL.bronzeDark, { rim: true });
    }
    // lid: a small hexagonal roof on posts
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
      color: '#8e8a84', opacity: 0.3, tex: h.tex(puffCanvas(64, 5)), wobble: 0.6, seed: 12,
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
    // stairs from the courtyard up to the hall platform
    const hs0 = onAxis(AX.len - 7.2), hs1 = onAxis(AX.len - 5.4);
    stairs(b, h, new THREE.Vector3(hs0.x, h.y(hs0.x, hs0.z) + 0.1, hs0.z), new THREE.Vector3(hs1.x, hallTop, hs1.z), 3.4, { rise: 0.15, seed: 23, cheeks: false });
  }

  // ── 大雄宝殿: the main hall, double-eaved ───────────────────────────
  {
    const F = frame(HALL.x, HALL.z, FACE);
    const A = 6.6, C = 4.2;
    const lo = h.span(HALL.x, HALL.z, 7.5).lo - 0.6;
    b.add(place(new THREE.BoxGeometry(A * 2 + 1.6, hallTop - lo, C * 2 + 1.8), HALL.x, (hallTop + lo) / 2, HALL.z, FACE), COL.stone, { edge: 30, jitter: 0.04 });
    b.add(place(new THREE.BoxGeometry(A * 2 + 1.7, 0.12, C * 2 + 1.9), HALL.x, hallTop - 0.04, HALL.z, FACE), COL.stoneMid, { edge: 30 });
    const colH = 4.3;
    const xs = [-A, -A * 0.6, -A * 0.2, A * 0.2, A * 0.6, A];
    // porch columns in front, wall columns behind
    for (const lx of xs) {
      const p = F(lx, C);
      column(p, hallTop, colH, 0.2);
      h.collide({ x: p.x, z: p.z, r: 0.28, h: colH });
    }
    const wallZ = C - 1.6;
    for (const lx of xs) column(F(lx, -C), hallTop, colH, 0.2);
    for (const lz of [wallZ, 0, -C]) { column(F(-A, lz), hallTop, colH, 0.2); column(F(A, lz), hallTop, colH, 0.2); }
    // walls: back and sides solid, the front a row of lattice doors
    panel(F, FACE, -A, -C, A, -C, hallTop, colH - 0.3, 0.4, '#6f4638');
    panel(F, FACE, -A, -C, -A, wallZ, hallTop, colH - 0.3, 0.4, '#6f4638');
    panel(F, FACE, A, -C, A, wallZ, hallTop, colH - 0.3, 0.4, '#6f4638');
    for (let i = 0; i < xs.length - 1; i++) {
      const l0 = xs[i] + 0.22, l1 = xs[i + 1] - 0.22;
      panel(F, FACE, l0, wallZ, l1, wallZ, hallTop, colH - 0.6, 0.12, i === 2 ? '#3a2a24' : '#6a4034');
      lattice(F, l0, l1, wallZ + 0.07, hallTop + 0.1, colH - 0.8, 4);
    }
    // dark interior glimpse through the open middle door, a golden glow of the altar at night
    const inner = F(0, wallZ - 1.2);
    addGlow(new THREE.Vector3(inner.x, hallTop + 1.6, inner.z), 3.5);
    // beams, bracket sets (斗拱) and the lower eave
    const beamY = hallTop + colH;
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.5, 0.42, C * 2 + 0.5), HALL.x, beamY + 0.05, HALL.z, FACE), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(A * 2 + 0.9, 0.36, C * 2 + 0.9), HALL.x, beamY + 0.44, HALL.z, FACE), '#3f5553', { edge: 30 });
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
    b.add(place(new THREE.BoxGeometry((A - 0.55) * 2, 1.5, (C - 0.55) * 2), HALL.x, dY + 0.75, HALL.z, FACE), '#6f4638', { edge: 30 });
    const win: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const p = F(-A + 0.6 + (i / 20) * (A - 0.6) * 2, C - 0.53);
      win.push(p.x, dY + 0.25, p.z, p.x, dY + 1.25, p.z);
    }
    b.segs(win);
    b.add(place(new THREE.BoxGeometry((A - 0.3) * 2, 0.3, (C - 0.3) * 2), HALL.x, dY + 1.62, HALL.z, FACE), '#3f5553', { edge: 30 });
    hipRoof(b, HALL.x, HALL.z, FACE, A + 1.3, C + 1.2, dY + 1.78, 3.1, { curl: 0.65, flare: 0.5 });
    const pf = F(0, C - 0.52);
    plaque('大雄宝殿', pf, dY + 0.78, FACE, 2.6, 0.9);
    // collider & occluder covering the hall
    for (let i = -2; i <= 2; i++) {
      const p = F(i * 2.6, -0.6);
      h.collide({ x: p.x, z: p.z, r: 2.6, h: colH });
      h.occlude({ x: p.x, z: p.z, r: 2.4, y0: hallTop, y1: dY + 4.5 });
    }
    // red lanterns under the front eave
    for (const lx of [-A * 0.4, A * 0.4]) {
      const p = F(lx, C + 0.6);
      redLanterns.push(new THREE.Vector3(p.x, beamY - 0.7, p.z));
    }
  }

  // ── the bell pavilion: a big bronze bell hanging free, a striker log beside it ──
  let bellMesh: T.Mesh, striker: T.Mesh;
  {
    const ry = Math.atan2(HALL.x - BELL.x, HALL.z - BELL.z) - Math.PI / 2; // side faces the courtyard
    const F = frame(BELL.x, BELL.z, ry);
    const top = h.y(BELL.x, BELL.z) + 0.22;
    const lo = h.span(BELL.x, BELL.z, 3.4).lo - 0.6;
    b.add(place(new THREE.BoxGeometry(6.4, top - lo, 6.4), BELL.x, (top + lo) / 2, BELL.z, ry), COL.stone, { edge: 30, jitter: 0.04 });
    const colH = 5.0;
    for (const [lx, lz] of [[-2.7, -2.7], [2.7, -2.7], [2.7, 2.7], [-2.7, 2.7]]) {
      const p = F(lx, lz);
      column(p, top, colH, 0.2);
      h.collide({ x: p.x, z: p.z, r: 0.3, h: colH });
    }
    const beamY = top + colH;
    // the bell beam, across the middle
    b.add(place(new THREE.BoxGeometry(5.8, 0.34, 0.3), BELL.x, beamY - 0.55, BELL.z, ry), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(5.8, 0.34, 0.3), BELL.x, beamY - 0.55, BELL.z, ry + Math.PI / 2), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(5.9, 0.4, 5.9), BELL.x, beamY + 0.05, BELL.z, ry), COL.wood, { edge: 30 });
    b.add(place(new THREE.BoxGeometry(6.2, 0.3, 6.2), BELL.x, beamY + 0.38, BELL.z, ry), '#3f5553', { edge: 30 });
    // double roof: a skirt, a short drum, a pyramidal top (攒尖)
    const e1 = beamY + 0.5;
    roof(b, xform(rect(4.2, 4.2), BELL.x, BELL.z, ry), xform(rect(2.3, 2.3), BELL.x, BELL.z, ry), e1, e1 + 0.95, { curl: 0.5, flare: 0.4 });
    b.add(place(new THREE.BoxGeometry(4.5, 1.0, 4.5), BELL.x, e1 + 1.25, BELL.z, ry), '#6f4638', { edge: 30 });
    const e2 = e1 + 1.75;
    roof(b, xform(rect(3.3, 3.3), BELL.x, BELL.z, ry), xform(rect(0.001, 0.001), BELL.x, BELL.z, ry), e2, e2 + 2.1, { curl: 0.5, flare: 0.35 });
    b.add(place(new THREE.SphereGeometry(0.22, 10, 8), BELL.x, e2 + 2.2, BELL.z), '#3c3c3e', { hull: true });
    b.add(place(new THREE.ConeGeometry(0.09, 0.5, 8), BELL.x, e2 + 2.55, BELL.z), '#3c3c3e');
    const pf = F(0, 2.72);
    plaque('钟', pf, beamY - 0.15, ry, 0.9, 0.9, { bg: '#26394a' });
    h.occlude({ x: BELL.x, z: BELL.z, r: 3, y0: beamY - 0.3, y1: e2 + 2.3 });

    // the bell (梵钟): lathe body with raised bands, a 蒲牢 loop on top. Origin = the hanging point.
    const Hb = 2.0;
    const prof = [
      [0.0, 0.0], [0.38, 0.0], [0.55, -0.05], [0.64, -0.2], [0.66, -0.6], [0.67, -1.2], [0.7, -1.6], [0.78, -1.88], [0.8, -Hb], [0.72, -Hb + 0.02],
    ].map(([r, y]) => new THREE.Vector2(r, y - 0.35));
    let bg: T.BufferGeometry = new THREE.LatheGeometry(prof, 22);
    bg = tintGeo(THREE, bg, '#56604c');
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

    // the striker (撞木): a log hung on two ropes, pointing at the bell's boss. Origin = its pivot.
    const sy = hang.y - 0.35 - 1.35; // boss height
    const pivotY = beamY - 0.72;
    const sGeo: T.BufferGeometry[] = [];
    const logLen = 1.9, gap = 0.78, mid = gap + logLen / 2;
    // local x runs from the pivot (above the log's middle) toward the far end; -x points at the bell
    sGeo.push(tintGeo(THREE, place(new THREE.CylinderGeometry(0.13, 0.13, logLen, 8).rotateZ(Math.PI / 2), 0, sy - pivotY, 0), '#6d5039'));
    sGeo.push(tintGeo(THREE, place(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 8).rotateZ(Math.PI / 2), gap + 0.05 - mid, sy - pivotY, 0), '#2c2019'));
    for (const u of [0.35, 1.5]) {
      sGeo.push(tintGeo(THREE, place(new THREE.CylinderGeometry(0.018, 0.018, pivotY - sy, 4), gap + u - mid, (sy - pivotY) / 2, 0), '#8a6f4e'));
    }
    striker = new THREE.Mesh(mergeColored(THREE, sGeo), h.toon('#ffffff', { vc: true, rim: 0.5 }));
    striker.name = 'bellStriker';
    striker.userData.role = 'bell-striker';
    const sp = F(mid, 0);
    striker.position.set(sp.x, pivotY, sp.z);
    striker.userData.swing = 'rotation.z'; // a pendulum on its ropes: negative z-rotation swings the log's head into the bell
    striker.rotation.y = ry;
    h.add(striker);
    b.add(place(new THREE.BoxGeometry(2.0, 0.16, 0.16), F(gap + 0.95, 0).x, pivotY + 0.08, F(gap + 0.95, 0).z, ry), COL.wood);
    h.group.userData.bell = bellMesh;
    h.group.userData.bellStriker = striker;
  }

  // ── the pagoda: seven storeys, octagonal, wind-bells at every corner ────
  const windBells: { p: T.Vector3; ph: number }[] = [];
  let pagodaTop = 0;
  {
    const { x, z } = PAGODA;
    const g0 = h.span(x, z, 3.2).hi + 0.2;
    const lo = h.span(x, z, 4.6).lo - 0.6;
    b.add(place(new THREE.CylinderGeometry(4.2, 4.4, g0 - lo, 8, 1, false, Math.PI / 8), x, (g0 + lo) / 2, z), COL.stone, { edge: 30, jitter: 0.04 });
    b.add(place(new THREE.CylinderGeometry(3.3, 3.5, 0.7, 8, 1, false, Math.PI / 8), x, g0 + 0.35, z), COL.stoneMid, { edge: 30 });
    let y = g0 + 0.7;
    const storeys = 7;
    for (let s = 0; s < storeys; s++) {
      const k = s / (storeys - 1);
      const r = 2.55 - 1.05 * k;
      const hs = s === 0 ? 3.6 : 2.55 - 0.5 * k;
      b.add(place(new THREE.CylinderGeometry(r, r * 1.02, hs, 8, 1, false, Math.PI / 8), x, y + hs / 2, z), '#e6dfd1', { edge: 30, jitter: 0.03 });
      // corner posts and a door on alternate faces
      const segs: number[] = [];
      const cs = ngon(8, r * 1.02 / Math.cos(Math.PI / 8) * Math.cos(Math.PI / 8), -Math.PI / 8 + Math.PI / 2);
      for (let i = 0; i < 8; i++) {
        const cc = ngon(8, r / Math.cos(Math.PI / 8), 0)[i];
        segs.push(x + cc[0], y, z + cc[1], x + cc[0], y + hs, z + cc[1]);
      }
      b.segs(segs);
      void cs;
      for (let i = 0; i < 8; i += 2) {
        const a = ((i + (s % 2)) / 8) * TAU + Math.PI / 8 - Math.PI / 8;
        const fx = x + Math.cos(a) * (r * 0.99), fz = z + Math.sin(a) * (r * 0.99);
        const dh = Math.min(hs * 0.62, 2.2);
        b.add(place(new THREE.BoxGeometry(r * 0.42, dh, 0.1), fx, y + hs * 0.08 + dh / 2, fz, Math.atan2(Math.cos(a), Math.sin(a)) + 0 * Math.PI), s === 0 && i === 0 ? '#2e2622' : '#6a4034', { edge: 30 });
      }
      // brackets band, then the eave
      y += hs;
      b.add(place(new THREE.CylinderGeometry(r + 0.25, r, 0.3, 8, 1, false, Math.PI / 8), x, y + 0.15, z), '#3f5553', { edge: 30 });
      const eo = r + 1.35 - 0.3 * k;
      const eaveY = y + 0.25;
      roof(b, ngon(8, eo / Math.cos(Math.PI / 8), 0).map(([a, c]) => [x + a, z + c]), ngon(8, (r * 0.92) / Math.cos(Math.PI / 8), 0).map(([a, c]) => [x + a, z + c]), eaveY, eaveY + 0.75, { curl: 0.42, flare: 0.3, U: 6, V: 4 });
      for (const [cx, cz] of ngon(8, (eo + 0.3) / Math.cos(Math.PI / 8), 0)) windBells.push({ p: new THREE.Vector3(x + cx, eaveY + 0.3, z + cz), ph: rng() * TAU });
      y = eaveY + 0.55;
    }
    // the spire (塔刹): a lotus base, stacked rings, a vase and a pearl
    b.add(place(new THREE.CylinderGeometry(0.9, 1.3, 0.8, 8, 1, false, Math.PI / 8), x, y + 0.2, z), COL.tile, { edge: 30 });
    b.add(place(new THREE.SphereGeometry(0.62, 10, 6, 0, TAU, 0, Math.PI / 2), x, y + 0.6, z), '#5b5a55', { hull: true });
    b.add(place(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), x, y + 2.7, z), COL.bronzeDark, { rim: true });
    for (let i = 0; i < 7; i++) b.add(place(new THREE.TorusGeometry(0.36 - i * 0.03, 0.06, 5, 12).rotateX(Math.PI / 2), x, y + 1.4 + i * 0.32, z), COL.bronze, { rim: true });
    b.add(place(new THREE.SphereGeometry(0.28, 10, 8), x, y + 4.0, z, 0, 1, 1.3, 1), COL.bronze, { hull: true });
    b.add(place(new THREE.SphereGeometry(0.16, 10, 8), x, y + 4.55, z), '#b08d55', { hull: true });
    pagodaTop = y + 4.8;
    h.collide({ x, z, r: 4.2, h: pagodaTop - g0 });
    h.occlude({ x, z, r: 2.4, y0: g0, y1: pagodaTop });
  }

  // ── the waterfall ───────────────────────────────────────────────────
  const waterY = ctx.waterAt(POOL.x, POOL.z) ?? h.y(POOL.x, POOL.z) - 0.25;
  const foot = { x: FALL.x, z: FALL.z + 3.4 };
  const lipY = Math.max(h.y(FALL.x, FALL.z - 3) + 6, waterY + 9.5);
  const lip = { x: FALL.x, z: FALL.z - 0.4 };
  {
    // the cliff: a back wall of rock rising above the lip, two flanks, a ledge the water leaves from
    const cliff: [number, number, number, number, number, number][] = [
      // x, z, width, height, seed, baseY-offset
      [FALL.x, FALL.z - 3.2, 11, lipY - waterY + 5, 4101, -1],
      [FALL.x - 5.6, FALL.z - 1.6, 5.5, lipY - waterY + 1.5, 4102, -1],
      [FALL.x + 5.8, FALL.z - 1.8, 6, lipY - waterY + 0.5, 4103, -1],
      [FALL.x - 7.5, FALL.z - 4.5, 7, lipY - waterY - 2, 4104, -1],
      [FALL.x + 8, FALL.z - 4, 7, lipY - waterY - 3, 4105, -1],
    ];
    for (const [cx, cz, w, hh, seed] of cliff) {
      const base = Math.min(waterY - 0.8, h.y(cx, cz) - 1);
      const g = rockGeometry(seed, w, hh, { base: '#a9a496', dark: '#403e39', lean: 0.08, detail: 1 });
      g.rotateY(rng() * 0.6 - 0.3);
      g.translate(cx, base, cz);
      b.colored(g, { hull: true });
      h.collide({ x: cx, z: cz, r: w * 0.42, h: hh });
      h.occlude({ x: cx, z: cz, r: w * 0.35, y0: base, y1: base + hh });
    }
    // the ledge (a flat slab of rock jutting out at the lip)
    const ledge = rockGeometry(4110, 4.2, 1.2, { base: '#a39e90', dark: '#45423d', lean: 0 });
    ledge.translate(lip.x, lipY - 0.9, lip.z - 0.7);
    b.colored(ledge, { hull: true });
    // rocks round the pool, leaving the river's way out open
    const out = RIVER[1];
    const outA = Math.atan2(out.z - POOL.z, out.x - POOL.x);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.2;
      if (Math.abs(Math.atan2(Math.sin(a - outA), Math.cos(a - outA))) < 0.55) continue;
      const d = 4.4 + rng() * 0.8;
      const x = POOL.x + Math.cos(a) * d, z = POOL.z + Math.sin(a) * d;
      if (z < FALL.z - 1) continue;
      const s = 0.8 + rng() * 0.9;
      const g = rockGeometry(4200 + i, s * 1.6, s * 1.0, { base: '#aeab9e', dark: '#4a4843', lean: 0.1 });
      g.rotateY(rng() * TAU);
      g.translate(x, Math.min(h.y(x, z), waterY) - 0.35, z);
      b.colored(g, { hull: true });
      h.collide({ x, z, r: s * 0.7, h: s });
    }
    // our own pool surface if the core has no water here
    if (ctx.waterAt(POOL.x, POOL.z) === null) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28).rotateX(-Math.PI / 2), h.own(new THREE.MeshLambertMaterial({ color: '#98aaa8', transparent: true, opacity: 0.88 })));
      pool.position.set(POOL.x, waterY, POOL.z);
      pool.name = 'mountain:pool';
      h.add(pool);
    }
  }
  {
    // the falling water: a ribbon that leaves the lip, arcs out, and drops into the pool
    const topW = 1.9, botW = 3.0;
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
      const m = h.own(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
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
    const body = new THREE.Mesh(ribbon(topW * 0.95, botW * 0.9, 0.95), h.own(new THREE.MeshBasicMaterial({ color: '#c9d2cf', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })));
    body.renderOrder = 3;
    h.add(body);
    lit(h, body.material as T.MeshBasicMaterial, '#c9d2cf');
    mk(71, '#ffffff', 0.95, topW, botW, 1.0, 1.4, 4);
    mk(72, '#eef3f1', 0.75, topW * 1.08, botW * 1.12, 1.05, 2.1, 5);
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
  const clearOf = (x: number, z: number, pad = 0) =>
    pathDist(x, z) > 2.6 + pad &&
    Math.hypot(x - GATE.x, z - GATE.z) > 7 + pad &&
    Math.hypot(x - HALL.x, z - HALL.z) > 10 + pad &&
    Math.hypot(x - courtC.x, z - courtC.z) > 9.5 + pad &&
    Math.hypot(x - BELL.x, z - BELL.z) > 5.5 + pad &&
    Math.hypot(x - PAGODA.x, z - PAGODA.z) > 6 + pad &&
    Math.hypot(x - FALL.x, z - (FALL.z + 1)) > 9 + pad &&
    distToSeg(x, z, GATE, onAxis(AX.len)) > 4 + pad &&
    ctx.waterAt(x, z) === null;
  const pineSpots: [number, number, number][] = [
    [GATE.x - 8, GATE.z + 3.5, 1.1], [GATE.x + 11, GATE.z - 2, 1.0],
    [courtC.x - 12, courtC.z + 2, 1.15], [HALL.x + 12, HALL.z + 4, 1.0], [HALL.x - 4, HALL.z - 12, 1.2],
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
    const g = rockGeometry(4400 + i, s * 1.5, s * 0.9, { base: '#b3ae9f', dark: '#4d4a44' });
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
    const lanMat = h.toon('#b0473a', { emissive: '#000000' });
    const capMat = h.toon('#2b2724');
    const lg = new THREE.SphereGeometry(0.28, 12, 9);
    const cg = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10);
    const lanterns: T.Object3D[] = [];
    for (const p of redLanterns) {
      const g = new THREE.Group();
      g.position.copy(p);
      const body = new THREE.Mesh(lg, lanMat); body.scale.set(1, 1.25, 1);
      const t1 = new THREE.Mesh(cg, capMat); t1.position.y = 0.34;
      const t2 = new THREE.Mesh(cg, capMat); t2.position.y = -0.34;
      g.add(body, t1, t2);
      h.add(g);
      lanterns.push(g);
      addGlow(p.clone(), 3);
    }
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
      lanterns.forEach((l, i) => { l.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.04; });
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
    const cloud = mistCards(h, clouds, { tex: h.tex(puffCanvas(128, 27)), color: '#f4efe6', opacity: 0.6, drift: 0.4 });
    cloud.name = 'mountain:clouds';
    h.add(cloud);
    h.frame(() => { (cloud.material as T.MeshBasicMaterial).color.set('#f4efe6').multiply(h.paper); });
  }
  void clamp;
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
