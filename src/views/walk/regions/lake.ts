// 荷塘 · the lotus lake: stony banks with reeds and willows, a sturdy wooden dock (fishing, the
// boat), the waterside pavilion 藕香榭 on stilts reached by a zigzag stone bridge, a small island
// with a pine and a scholar's rock, a white moon bridge over the outlet whose arch and reflection
// make a full moon — and lotus everywhere: hundreds of instanced pads, upright leaves, flowers, buds
// and seed pods that sway in travelling gusts (vertex shader), with open lanes left for the boat.
// The season sets the pond: pads in spring, full bloom in summer, pods and browning leaves in
// autumn, broken stems in winter (留得残荷听雨声).
import type * as T from 'three';
import type { RegionModule } from '../types';
import { ANCHORS, LAKE, RIVER, RIVER_LAKE_BREAK } from '../map';
import { Kit, Parts, flatsMesh, fontsReady, packAtlas, canvas, sway, BRUSH_FONT, type Flat } from './water-kit';
import { RIDGE, hipRoof, xfLines } from './water-arch';
import { reedDrawing, willowDrawing } from './water-paint';
import { segmentDeck } from './water-decks';
import { rasterize } from '../../../ink/brush';
import { plantDrawing } from '../../../ink/plants';
import { makeNoise2, makeRng } from '../../../core/rng';

let kit: Kit | null = null;

export const lake: RegionModule = {
  id: 'lake',
  async build(ctx) {
    kit?.dispose();
    kit = new Kit(ctx, 'lake');
    await buildLake(kit);
  },
  dispose() {
    kit?.dispose();
    kit = null;
  },
};

type V3 = [number, number, number];
const TAU = Math.PI * 2;
const lakeQ = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
/** A point on the shore ellipse at angle a, scaled by q. */
const shore = (a: number, q = 1) => ({ x: LAKE.x + Math.cos(a) * LAKE.rx * q, z: LAKE.z + Math.sin(a) * LAKE.rz * q });

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
const polyDist = (x: number, z: number, pts: { x: number; z: number }[]) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  return d;
};

// ── layout (shared by the builders and the lotus lanes)
const DOCK_ROOT = { x: 64.6, z: 31.6 };
const DOCK_DIR = (() => { const dx = LAKE.x - DOCK_ROOT.x, dz = LAKE.z - DOCK_ROOT.z, L = Math.hypot(dx, dz); return { x: dx / L, z: dz / L }; })();
const DOCK_LEN = 10;
const DOCK_END = { x: DOCK_ROOT.x + DOCK_DIR.x * DOCK_LEN, z: DOCK_ROOT.z + DOCK_DIR.z * DOCK_LEN };
const PAV = { x: ANCHORS.waterPavilion.x, z: ANCHORS.waterPavilion.z, h: 3.2 };
const ZIG = [{ x: 128, z: 3 }, { x: 123.6, z: 3 }, { x: 121.6, z: 7.4 }, { x: 119.4, z: 3.8 }, { x: PAV.x + PAV.h, z: 6 }];
/** The net rack stands on the bank west of the dock, along the shore. */
const NET = (() => { const a = 2.62; const p = { x: LAKE.x + Math.cos(a) * LAKE.rx * 1.09, z: LAKE.z + Math.sin(a) * LAKE.rz * 1.09 }; const tx = -Math.sin(a) * LAKE.rx, tz = Math.cos(a) * LAKE.rz, L = Math.hypot(tx, tz); return { ...p, tx: tx / L, tz: tz / L }; })();
const ISLE = { x: ANCHORS.lakeIsland.x, z: ANCHORS.lakeIsland.z, rx: 4.6, rz: 3.8 };
/** The moon bridge over the outlet, a little way down the river. */
const MOON = (() => {
  const a = RIVER[RIVER_LAKE_BREAK], b = RIVER[RIVER_LAKE_BREAK + 1];
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const t = 0.2;
  const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
  const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
  return { x: cx, z: cz, ax: -dz, az: dx, w: a.w + (b.w - a.w) * t };
})();
/** Open water for the boat: dock → island, a ring round the island, island → pavilion, and a loop along the south. */
const LANES: { x: number; z: number }[][] = [
  [DOCK_END, { x: 84, z: 21 }, { x: ISLE.x - 8, z: ISLE.z }],
  Array.from({ length: 13 }, (_, i) => ({ x: ISLE.x + Math.cos((i / 12) * TAU) * 8.4, z: ISLE.z + Math.sin((i / 12) * TAU) * 7.2 })),
  [{ x: ISLE.x + 8.4, z: ISLE.z }, { x: 106, z: 10 }, { x: PAV.x - PAV.h - 1.5, z: PAV.z + 2 }],
  [{ x: ISLE.x, z: ISLE.z + 7.2 }, { x: 92, z: 30 }, { x: 78, z: 30 }, { x: DOCK_END.x, z: DOCK_END.z }],
];

async function buildLake(k: Kit): Promise<void> {
  const { ctx } = k;
  const THREE = k.T;
  const gy = (x: number, z: number) => ctx.groundY(x, z);
  const WY = ctx.waterAt(LAKE.x, LAKE.z) ?? LAKE.waterY;
  const season = ctx.env.season;

  const solidMat = k.toon('#ffffff', { vertexColors: true });
  const roofMat = k.toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
  const lineMat = k.lineMat(0.7);
  const tileLineMat = k.lineMat(0.42, '#141312');
  const solid = new Parts(k), roofs = new Parts(k);
  const lanternGeos: T.BufferGeometry[] = [];
  const lanternAt: V3[] = [];
  const flats: Flat[] = [];

  const lantern = (x: number, y: number, z: number, s = 1) => {
    const g = new THREE.SphereGeometry(0.2 * s, 10, 7);
    g.scale(1, 1.25, 1);
    lanternGeos.push(k.tint(k.xf(g, x, y, z), '#b8473a', 0.04));
    solid.add(k.cyl(0.09 * s, 0.09 * s, 0.06, 8, '#2b2724', x, y + 0.26 * s, z), false);
    solid.add(k.cyl(0.09 * s, 0.09 * s, 0.06, 8, '#2b2724', x, y - 0.26 * s, z), false);
    solid.add(k.cyl(0.01, 0.01, 0.4, 3, '#2b2724', x, y + 0.48 * s, z), false);
    lanternAt.push([x, y, z]);
  };

  // ───────────── the dock
  {
    const u = DOCK_DIR, p = { x: -u.z, z: u.x };
    const ry = Math.atan2(u.x, u.z);
    const dy = Math.max(gy(DOCK_ROOT.x, DOCK_ROOT.z) + 0.1, WY + 0.5);
    const at = (s: number, q = 0) => ({ x: DOCK_ROOT.x + u.x * s + p.x * q, z: DOCK_ROOT.z + u.z * s + p.z * q });
    const HW = 1.1;
    // planks across the dock, then the wider end (a T for mooring)
    for (let s = -0.6, i = 0; s < DOCK_LEN - 1.8; s += 0.3, i++) {
      const c = at(s + 0.13);
      solid.add(k.box(HW * 2 - (i % 5 === 2 ? 0.14 : 0), 0.07, 0.26, i % 3 ? '#8a6a4a' : '#7b5c40', c.x, dy - 0.035, c.z, ry, 0.12), 25);
    }
    for (let s = DOCK_LEN - 1.8, i = 0; s < DOCK_LEN + 0.2; s += 0.3, i++) {
      const c = at(s + 0.13);
      solid.add(k.box(4.0, 0.07, 0.26, i % 2 ? '#8a6a4a' : '#7d5e42', c.x, dy - 0.035, c.z, ry, 0.12), 25);
    }
    // stringers and posts
    for (const q of [-0.8, 0.8]) {
      const a = at(-0.4, q), b = at(DOCK_LEN, q);
      solid.add(k.beam({ x: a.x, y: dy - 0.16, z: a.z }, { x: b.x, y: dy - 0.16, z: b.z }, 0.16, '#5b4331'), false);
    }
    const postAt = (s: number, q: number, up = 0) => {
      const c = at(s, q);
      const bottom = WY - 1.1, top = dy + up;
      solid.add(k.cyl(0.11, 0.12, top - bottom, 7, '#5a4230', c.x, (top + bottom) / 2, c.z), 30);
      solid.add(k.cyl(0.125, 0.125, 0.12, 7, '#3f4a40', c.x, WY + 0.02, c.z), false); // wet line
      if (up > 0) k.collider({ x: c.x, z: c.z, r: 0.16, h: up });
    };
    for (let s = 1.2; s < DOCK_LEN - 2; s += 2.1) { postAt(s, -HW + 0.05); postAt(s, HW - 0.05); }
    postAt(DOCK_LEN - 1.7, -2.0, 0.55); postAt(DOCK_LEN - 1.7, 2.0, 0.55);
    postAt(DOCK_LEN + 0.1, -2.0, 0.7); postAt(DOCK_LEN + 0.1, 2.0, 0.7);
    // a rope coil, a wicker fish basket (鱼篓), a bamboo hat, and a lantern post at the end
    const rc = at(DOCK_LEN - 0.5, 1.4);
    solid.add(k.tint(k.xf(new THREE.TorusGeometry(0.2, 0.05, 5, 12).rotateX(Math.PI / 2), rc.x, dy + 0.05, rc.z), '#9b8660', 0.1), false);
    solid.add(k.tint(k.xf(new THREE.TorusGeometry(0.15, 0.045, 5, 12).rotateX(Math.PI / 2), rc.x, dy + 0.12, rc.z), '#9b8660', 0.1), false);
    const fb = at(DOCK_LEN - 1.2, -1.3);
    const basket = new THREE.LatheGeometry([[0.05, 0], [0.2, 0.05], [0.24, 0.18], [0.16, 0.34], [0.09, 0.42], [0.11, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
    solid.add(k.tint(k.xf(basket, fb.x, dy, fb.z), '#b09060', 0.12), 35);
    const hat = at(DOCK_LEN - 2.6, -0.5);
    solid.add(k.tint(k.xf(new THREE.ConeGeometry(0.34, 0.16, 12), hat.x, dy + 0.08, hat.z, 0, 0.18, 0), '#c7ae78', 0.08), 35);
    const lp = at(DOCK_LEN + 0.1, 2.0);
    solid.add(k.box(0.07, 0.07, 0.7, '#5a4230', lp.x + u.x * 0.3, dy + 0.66, lp.z + u.z * 0.3, ry), false);
    lantern(lp.x + u.x * 0.6, dy + 0.35, lp.z + u.z * 0.6, 0.9);
    // walkable
    k.deck(segmentDeck('lake-dock', at(-0.8), at(DOCK_LEN + 0.2), HW, dy));
    k.deck(segmentDeck('lake-dock-end', at(DOCK_LEN - 0.8, -2.0), at(DOCK_LEN - 0.8, 2.0), 1.0, dy));
  }

  // ───────────── 藕香榭: the waterside pavilion on stilts, and the zigzag stone bridge to it
  const plaqueTex = await (async () => {
    await fontsReady('藕香榭');
    const c = canvas(256, 80);
    const g = c.getContext('2d')!;
    g.fillStyle = '#3b2a20'; g.fillRect(0, 0, 256, 80);
    g.strokeStyle = '#8c6a3e'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 68);
    g.fillStyle = '#e8d9b0'; g.font = `54px ${BRUSH_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('藕香榭', 128, 44);
    return k.canvasTex(c);
  })();
  const PY = WY + 0.78;
  {
    const { x: px, z: pz, h } = PAV;
    // stone piers and the platform
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) solid.add(k.box(0.55, PY - (WY - 1.2), 0.55, '#a39d90', px + a * (h - 0.4), (PY + WY - 1.2) / 2 - 0.1, pz + b * (h - 0.4), 0, 0.06), 25);
    solid.add(k.box(h * 2 + 0.3, 0.24, h * 2 + 0.3, '#c9c2b2', px, PY - 0.12, pz, 0, 0.04), 25);
    solid.add(k.box(h * 2 - 0.2, 0.03, h * 2 - 0.2, '#8f6e50', px, PY + 0.015, pz, 0, 0.04), false);
    // columns
    const cols: [number, number][] = [];
    for (const t of [-1, -1 / 3, 1 / 3, 1]) { cols.push([t * (h - 0.25), -(h - 0.25)], [t * (h - 0.25), h - 0.25]); }
    for (const t of [-1 / 3, 1 / 3]) { cols.push([-(h - 0.25), t * (h - 0.25)], [h - 0.25, t * (h - 0.25)]); }
    const CH = 2.85;
    for (const [a, b] of cols) {
      solid.add(k.cyl(0.11, 0.12, CH, 8, '#7b3f31', px + a, PY + CH / 2, pz + b), 30);
      solid.add(k.cyl(0.17, 0.19, 0.14, 8, '#a49e91', px + a, PY + 0.07, pz + b), false);
      k.collider({ x: px + a, z: pz + b, r: 0.16, h: CH });
    }
    // architrave and hanging fretwork (挂落) on all four sides
    const H2 = h - 0.25;
    for (const [ax, az, bx, bz] of [[-H2, -H2, H2, -H2], [H2, -H2, H2, H2], [H2, H2, -H2, H2], [-H2, H2, -H2, -H2]]) {
      solid.add(k.beam({ x: px + ax, y: PY + CH - 0.05, z: pz + az }, { x: px + bx, y: PY + CH - 0.05, z: pz + bz }, 0.2, '#5b3d2e'), 30);
      solid.add(k.beam({ x: px + ax, y: PY + CH - 0.34, z: pz + az }, { x: px + bx, y: PY + CH - 0.34, z: pz + bz }, 0.05, '#5b3d2e'), false);
      const n = 12;
      for (let i = 1; i < n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        solid.add(k.box(0.035, 0.26, 0.035, '#5b3d2e', px + x, PY + CH - 0.2, pz + z), false);
      }
    }
    // 美人靠: benches with outward-leaning backrests on three sides (open to the east, where the bridge lands)
    const sides: [number, number, number, number, number][] = [[-H2, -H2, H2, -H2, -1], [-H2, H2, H2, H2, 1], [-H2, -H2, -H2, H2, -1]];
    for (const [ax, az, bx, bz, s] of sides) {
      const alongX = az === bz;
      const len = alongX ? bx - ax : bz - az;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const ry = alongX ? 0 : Math.PI / 2;
      solid.add(k.box(len - 0.2, 0.07, 0.4, '#6b4632', px + mx, PY + 0.45, pz + mz, ry), 30);
      solid.add(k.box(len - 0.2, 0.4, 0.05, '#5b3d2e', px + mx, PY + 0.24, pz + mz, ry), 30);
      // backrest: tilted panel with balusters (lines come from the edges)
      const off = 0.2 * s;
      const bx2 = alongX ? mx : mx + off, bz2 = alongX ? mz + off : mz;
      solid.add(k.box(len - 0.2, 0.05, 0.05, '#5b3d2e', px + bx2 + (alongX ? 0 : 0.18 * s), PY + 0.95, pz + bz2 + (alongX ? 0.18 * s : 0), ry), 30);
      const nb = Math.round(len / 0.22);
      for (let i = 0; i <= nb; i++) {
        const t = -0.5 + i / nb;
        const x0 = alongX ? mx + t * (len - 0.3) : mx + off * 0.5;
        const z0 = alongX ? mz + off * 0.5 : mz + t * (len - 0.3);
        const dx = alongX ? 0 : 0.18 * s, dz = alongX ? 0.18 * s : 0;
        solid.add(k.beam({ x: px + x0, y: PY + 0.48, z: pz + z0 }, { x: px + x0 + dx, y: PY + 0.95, z: pz + z0 + dz }, 0.03, '#5b3d2e'), false);
      }
      k.fence(px + ax, pz + az, px + bx, pz + bz, 0.22, 1.0);
    }
    // a stone table and two drum stools, a qin on the table
    solid.add(k.cyl(0.45, 0.32, 0.74, 10, '#b3ad9f', px - 0.6, PY + 0.37, pz), 30);
    for (const s of [-1, 1]) solid.add(k.cyl(0.18, 0.16, 0.42, 9, '#aaa496', px - 0.6, PY + 0.21, pz + s * 0.85), 30);
    solid.add(k.box(1.1, 0.05, 0.2, '#4a3226', px - 0.6, PY + 0.77, pz, 0.2), 30);
    k.collider({ x: px - 0.6, z: pz, r: 0.6, h: 0.8 });
    // the roof: a hipped roof with deep flying corners (嫩戗发戗)
    const eaveY = PY + CH + 0.08;
    const rf = hipRoof(k, { a: h + 0.9, b: h + 0.9, r: 1.3, eaveY, ridgeY: eaveY + 2.1, lift: 0.75, U: 10, V: 8 }, 71);
    rf.geo.translate(px, 0, pz);
    roofs.add(rf.geo, false);
    const m = new THREE.Matrix4().makeTranslation(px, 0, pz);
    roofs.lines(xfLines(k, rf.lines, m));
    solid.add(k.box(2.8, 0.26, 0.28, RIDGE, px, eaveY + 2.18, pz), 30);
    for (const s of [-1, 1]) solid.add(k.box(0.46, 0.2, 0.2, RIDGE, px + s * 1.5, eaveY + 2.36, pz, 0, 0, 0, s * 0.75), 30);
    // plaque over the east opening, lanterns at the east corners
    const plaque = new THREE.Mesh(k.own(new THREE.PlaneGeometry(1.4, 0.44)), k.own(new THREE.MeshBasicMaterial({ map: plaqueTex })));
    plaque.position.set(px + h - 0.1, PY + CH - 0.62, pz);
    plaque.rotation.y = Math.PI / 2;
    plaque.name = 'lake-plaque';
    k.add(plaque);
    for (const s of [-1, 1]) lantern(px + h - 0.1, PY + CH - 0.7, pz + s * (h - 0.45), 1.1);
    k.deck(segmentDeck('lake-pavilion', { x: px - h, z: pz }, { x: px + h, z: pz }, h, PY));
    k.occluder({ x: px, z: pz, r: 1.2, y0: PY + 1, y1: eaveY + 2 });

    // the zigzag bridge: flat stone slabs on piers, low posts and rails
    const zy = WY + 0.5;
    for (let i = 1; i < ZIG.length; i++) {
      const a = ZIG[i - 1], b = ZIG[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ry = Math.atan2(b.x - a.x, b.z - a.z);
      const ya = i === 1 ? Math.max(zy, gy(a.x, a.z) + 0.05) : zy;
      const yb = i === ZIG.length - 1 ? PY : zy;
      const slabs = Math.max(2, Math.round(len / 1.1));
      for (let j = 0; j < slabs; j++) {
        const t0 = j / slabs, t1 = (j + 1) / slabs;
        const x = a.x + (b.x - a.x) * (t0 + t1) / 2, z = a.z + (b.z - a.z) * (t0 + t1) / 2;
        const y = ya + (yb - ya) * (t0 + t1) / 2;
        solid.add(k.box(1.6, 0.2, len / slabs - 0.03, j % 2 ? '#c6bfaf' : '#bcb5a5', x, y - 0.1, z, ry, 0.05, Math.atan2(yb - ya, len) * -1), 25);
      }
      // piers under both ends
      for (const p of [a, b]) {
        const y = p === a ? ya : yb;
        solid.add(k.box(1.3, y - (WY - 1.1), 0.5, '#a39d90', p.x, (y + WY - 1.1) / 2 - 0.2, p.z, ry, 0.05), 25);
      }
      // low railing: posts and a rail on both sides
      const px2 = Math.cos(ry) * 0.72, pz2 = -Math.sin(ry) * 0.72;
      for (const s of [-1, 1]) {
        const n = Math.max(2, Math.round(len / 1.2));
        for (let j = 0; j <= n; j++) {
          const t = 0.08 + (0.84 * j) / n;
          const x = a.x + (b.x - a.x) * t + s * px2, z = a.z + (b.z - a.z) * t + s * pz2;
          solid.add(k.box(0.14, 0.5, 0.14, '#c9c2b3', x, ya + (yb - ya) * t + 0.25, z, ry), 30);
        }
        const t0 = 0.08, t1 = 0.92;
        solid.add(k.beam(
          { x: a.x + (b.x - a.x) * t0 + s * px2, y: ya + (yb - ya) * t0 + 0.42, z: a.z + (b.z - a.z) * t0 + s * pz2 },
          { x: a.x + (b.x - a.x) * t1 + s * px2, y: ya + (yb - ya) * t1 + 0.42, z: a.z + (b.z - a.z) * t1 + s * pz2 }, 0.1, '#d2cbbb'), 30);
      }
      const ext = 0.8 / len;
      k.deck(segmentDeck(`lake-zigzag-${i}`, { x: a.x - (b.x - a.x) * ext, z: a.z - (b.z - a.z) * ext }, { x: b.x + (b.x - a.x) * ext, z: b.z + (b.z - a.z) * ext }, 0.8, (s) => ya + (yb - ya) * Math.max(0, Math.min(1, (s + len / 2 + 0.8) / (len + 1.6)))));
    }
  }

  // ───────────── the moon bridge (玉带桥) over the outlet
  {
    const { x: bx, z: bz, ax, az, w } = findChannel(ctx, MOON);
    const wy = ctx.waterAt(bx, bz) ?? WY;
    const L = w + 3.6, W = 2.5, R = Math.min(3.3, w - 0.4);
    const endA = { x: bx - ax * L, z: bz - az * L }, endB = { x: bx + ax * L, z: bz + az * L };
    const yEnd = Math.max(gy(endA.x, endA.z), gy(endB.x, endB.z), wy + 0.4) + 0.05;
    const yc = wy;
    const crest = yc + R + 0.55;
    const deckY = (s: number) => yEnd + (crest - yEnd) * Math.pow(Math.max(0, 1 - (s / L) * (s / L)), 2.2);
    const ry = Math.atan2(ax, az);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, 0, bz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    const MARBLE = '#e8e3d6';
    const shape = new THREE.Shape();
    const N = 56;
    for (let i = 0; i <= N; i++) { const s = -L + (2 * L * i) / N; if (i === 0) shape.moveTo(s, deckY(s)); else shape.lineTo(s, deckY(s)); }
    shape.lineTo(L, wy - 1.3);
    shape.lineTo(-L, wy - 1.3);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(R, wy - 1.2);
    hole.lineTo(R, yc);
    hole.absarc(0, yc, R, 0, Math.PI, false);
    hole.lineTo(-R, wy - 1.2);
    hole.closePath();
    shape.holes.push(hole);
    const body = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 32 });
    body.translate(0, 0, -W / 2);
    body.rotateY(-Math.PI / 2);
    solid.add(k.tint(body, MARBLE, 0.04, 8).applyMatrix4(m), 25);
    for (const s of [1, -1]) {
      const ring = new THREE.RingGeometry(R, R + 0.34, 30, 1, 0, Math.PI);
      ring.translate(0, yc, 0);
      ring.rotateY(s * Math.PI / 2);
      ring.translate(s * (W / 2 + 0.012), 0, 0);
      solid.add(k.tint(ring, '#d3cdbf', 0.05, 6).applyMatrix4(m), 20);
      solid.add(k.box(0.05, 0.42, 0.3, '#c9c2b3', s * (W / 2 + 0.03), yc + R + 0.18, 0).applyMatrix4(m), 30);
    }
    for (let s = -L + 0.3; s <= L - 0.3; s += 0.34) {
      solid.add(k.box(W - 0.4, 0.12, 0.36, Math.round(s / 0.34) % 2 ? '#e2ddd0' : '#d8d2c4', 0, deckY(s) + 0.02, s, 0, 0.03).applyMatrix4(m), 25);
    }
    const posts: number[] = [];
    for (let s = -L + 0.35; s <= L - 0.3; s += 0.95) posts.push(s);
    for (const side of [1, -1]) {
      const x = side * (W / 2 - 0.1);
      for (const s of posts) {
        solid.add(k.box(0.16, 0.72, 0.16, MARBLE, x, deckY(s) + 0.36, s).applyMatrix4(m), 30);
        solid.add(k.tint(k.xf(new THREE.SphereGeometry(0.1, 8, 6), x, deckY(s) + 0.78, s), MARBLE, 0.03).applyMatrix4(m), false);
      }
      for (let i = 1; i < posts.length; i++) {
        const s0 = posts[i - 1], s1 = posts[i];
        const y0 = deckY(s0) + 0.34, y1 = deckY(s1) + 0.34;
        const len = Math.hypot(s1 - s0, y1 - y0);
        solid.add(k.box(0.09, 0.4, len, '#f0ebe0', x, (y0 + y1) / 2, (s0 + s1) / 2, 0, 0.03, -Math.atan2(y1 - y0, s1 - s0)).applyMatrix4(m), 30);
      }
      for (const e of [-1, 1]) {
        const s = e * (L - 0.05);
        solid.add(k.box(0.22, 0.5, 0.7, '#ddd7ca', x, deckY(s) + 0.25, s).applyMatrix4(m), 30);
      }
      const a = new THREE.Vector3(x, 0, -L).applyMatrix4(m), b = new THREE.Vector3(x, 0, L).applyMatrix4(m);
      k.fence(a.x, a.z, b.x, b.z, 0.18, 1.1);
    }
    k.deck(segmentDeck('lake-moon-bridge', endA, endB, W / 2 - 0.2, (s) => deckY(s) + 0.08));
  }

  // ───────────── the island: a mound, rocks round its rim, a pine and a scholar's rock
  const rockSpots: { x: number; z: number; s: number; h: number; y: number }[] = [];
  {
    const { x: ix, z: iz, rx, rz } = ISLE;
    const noise = makeNoise2(606);
    const g = new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const top = new THREE.Color('#b8b394'), rim = new THREE.Color('#8f8a7d'), moss = new THREE.Color('#7e8c6c');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = noise(x * 1.7 + 3, z * 1.7);
      const r = 1 + 0.12 * n;
      p.setXYZ(i, x * rx * r, WY - 0.3 + y * (1.6 + 0.4 * n), z * rz * r);
      const c = rim.clone().lerp(top, Math.min(1, y * 1.4)).lerp(moss, Math.max(0, n) * 0.5 * y);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ng = g.toNonIndexed();
    g.dispose();
    ng.computeVertexNormals();
    ng.translate(ix, 0, iz);
    solid.add(ng, 40);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3;
      rockSpots.push({ x: ix + Math.cos(a) * rx * 1.02, z: iz + Math.sin(a) * rz * 1.02, s: 0.55 + ((i * 7) % 5) * 0.12, h: 0.7, y: WY });
    }
    // a tall Taihu rock beside the pine
    const tr = taihuRock(k, 1313, 1.3, 2.6);
    tr.translate(ix + 1.6, WY + 0.9, iz - 0.6);
    solid.add(tr, 50);
    // a tiny stone lantern
    const lx = ix - 1.4, lz = iz + 1.2, ly = WY + 1.05;
    solid.add(k.cyl(0.18, 0.2, 0.12, 6, '#a6a092', lx, ly + 0.06, lz), 30);
    solid.add(k.cyl(0.05, 0.06, 0.4, 6, '#b1ab9e', lx, ly + 0.32, lz), 30);
    solid.add(k.box(0.24, 0.2, 0.24, '#b8b2a5', lx, ly + 0.62, lz), 30);
    solid.add(k.cyl(0.02, 0.26, 0.18, 6, '#8f8a80', lx, ly + 0.81, lz), 30);
    lanternAt.push([lx, ly + 0.62, lz]);
  }

  // ───────────── the shore: stones and reeds, with gaps at the dock, bridges and the river mouths
  const inlet = RIVER[RIVER_LAKE_BREAK - 1], outlet = RIVER[RIVER_LAKE_BREAK];
  const clearOf = (x: number, z: number, r: number) =>
    Math.hypot(x - DOCK_ROOT.x, z - DOCK_ROOT.z) > r + 3 &&
    polyDist(x, z, ZIG) > r + 1.2 &&
    Math.hypot(x - inlet.x, z - inlet.z) > r + inlet.w + 1 &&
    Math.hypot(x - outlet.x, z - outlet.z) > r + outlet.w + 2 &&
    Math.hypot(x - MOON.x, z - MOON.z) > r + 7 &&
    Math.hypot(x - NET.x, z - NET.z) > r + 2.5;
  {
    const rng = makeRng(8181);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU + rng.range(-0.03, 0.03);
      const q = rng.range(0.98, 1.06);
      const p = shore(a, q);
      if (!clearOf(p.x, p.z, 1)) continue;
      const s = rng.range(0.45, 1.15);
      rockSpots.push({ x: p.x, z: p.z, s, h: rng.range(0.5, 0.9), y: Math.max(WY - 0.1, gy(p.x, p.z) - 0.1) });
      if (s > 0.8 && q > 1.0) k.collider({ x: p.x, z: p.z, r: s * 0.8, h: 0.6 });
    }
  }
  {
    const rg = rockGeometry(k, 77);
    const im = new THREE.InstancedMesh(rg, solidMat, rockSpots.length);
    const ol = new THREE.InstancedMesh(rg, k.outline(0.035), rockSpots.length);
    const rng = makeRng(99);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    rockSpots.forEach((r, i) => {
      e.set(rng.range(-0.15, 0.15), rng() * TAU, rng.range(-0.15, 0.15));
      mm.compose(new THREE.Vector3(r.x, r.y, r.z), q.setFromEuler(e), new THREE.Vector3(r.s * rng.range(0.9, 1.4), r.s * r.h, r.s));
      im.setMatrixAt(i, mm);
      ol.setMatrixAt(i, mm);
    });
    im.name = 'lake-rocks';
    ol.name = 'lake-rocks-outline';
    im.computeBoundingSphere(); ol.computeBoundingSphere();
    k.add(im); k.add(ol);
  }

  // ───────────── painted flats: reeds at the water's edge, willows on the banks, the island pine
  {
    const rd = reedDrawing(919);
    const rc = rasterize(rd, 1, Math.min(128 / rd.width, 256 / rd.height));
    const wd = willowDrawing(2929, -1);
    const wc = rasterize(wd, 1, 256 / wd.width);
    const pd = plantDrawing({ kind: 'pine', seed: 5150, height: 380 });
    const pc = rasterize(pd, 1, Math.min(256 / pd.width, 256 / pd.height));
    const pk = packAtlas([{ c: wc, slot: [0, 0, 256, 512] }, { c: pc, slot: [256, 0, 256, 256] }, { c: rc, slot: [256, 256, 128, 256] }]);
    const tex = k.canvasTex(pk.canvas);
    const [wuv, puv, ruv] = pk.uv;
    const flip = (uv: [number, number, number, number]): [number, number, number, number] => [uv[2], uv[1], uv[0], uv[3]];
    const rng = makeRng(4040);
    // reed clumps round the shore, a few on the island
    const clumps: { x: number; z: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * TAU;
      const p = shore(a, rng.range(0.94, 1.02));
      if (!clearOf(p.x, p.z, 1.5)) continue;
      clumps.push(p);
    }
    for (const a of [0.8, 2.6, 4.4]) clumps.push({ x: ISLE.x + Math.cos(a) * ISLE.rx * 0.95, z: ISLE.z + Math.sin(a) * ISLE.rz * 0.95 });
    for (const c of clumps) {
      const n = rng.int(2, 4);
      for (let j = 0; j < n; j++) {
        const x = c.x + rng.range(-0.9, 0.9), z = c.z + rng.range(-0.9, 0.9);
        const hgt = rng.range(1.3, 2.1);
        flats.push({ x, y: Math.max(WY - 0.05, gy(x, z) - 0.05), z, w: hgt * (rd.width / rd.height), h: hgt, ax: rd.anchor.x / rd.width, uv: rng() < 0.5 ? ruv : flip(ruv), sway: 0.12 });
      }
    }
    // willows leaning over the water
    for (const [a, hgt, mirror] of [[3.45, 8.8, false], [1.95, 8.2, true], [0.72, 9, false], [5.2, 8, true]] as [number, number, boolean][]) {
      const p = shore(a, 1.13);
      if (!clearOf(p.x, p.z, 1)) continue;
      flats.push({ x: p.x, y: gy(p.x, p.z) - 0.1, z: p.z, w: hgt * 0.5, h: hgt, ax: mirror ? 1 - wd.anchor.x / wd.width : wd.anchor.x / wd.width, uv: mirror ? flip(wuv) : wuv, sway: 0.3 });
      k.collider({ x: p.x, z: p.z, r: 0.35, h: 3 });
    }
    // the island's pine
    flats.push({ x: ISLE.x - 0.4, y: WY + 0.95, z: ISLE.z + 0.2, w: 6.4 * (pd.width / pd.height), h: 6.4, ax: pd.anchor.x / pd.width, uv: puv, sway: 0.05 });
    k.add(flatsMesh(k, tex, flats, 'lake-flats'));
  }

  // ───────────── a fisherman's net drying on bamboo poles by the dock (晒网)
  {
    const a = { x: NET.x - NET.tx * 1.7, z: NET.z - NET.tz * 1.7 }, b = { x: NET.x + NET.tx * 1.7, z: NET.z + NET.tz * 1.7 };
    const ya = gy(a.x, a.z), yb = gy(b.x, b.z);
    for (const [p, y] of [[a, ya], [b, yb]] as [{ x: number; z: number }, number][]) {
      solid.add(k.cyl(0.04, 0.05, 2.5, 5, '#a08a5a', p.x, y + 1.2, p.z, 0.08), 30);
      k.collider({ x: p.x, z: p.z, r: 0.12, h: 2.4 });
    }
    solid.add(k.beam({ x: a.x, y: ya + 2.25, z: a.z }, { x: b.x, y: yb + 2.25, z: b.z }, 0.05, '#a08a5a', true), false);
    const nc = canvas(128, 128);
    const g = nc.getContext('2d')!;
    g.strokeStyle = 'rgba(40,36,30,0.85)';
    g.lineWidth = 1.4;
    for (let i = -128; i <= 256; i += 12) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke();
    }
    const tex = k.canvasTex(nc, { repeat: true });
    tex.repeat.set(3, 2);
    const net = new THREE.PlaneGeometry(3.3, 1.9, 10, 6);
    const p = net.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 1.65, v = (p.getY(i) + 0.95) / 1.9;
      p.setZ(i, 0.12 * Math.sin(u * 5 + v * 3) * (1 - v));
      p.setY(i, p.getY(i) - 0.35 * (1 - u * u) * (1 - v * 0.3));
    }
    net.computeVertexNormals();
    net.translate(0, 2.25 - 0.95, 0);
    net.rotateY(Math.atan2(NET.tx, NET.tz) - Math.PI / 2);
    net.translate(NET.x, (ya + yb) / 2, NET.z);
    const mat = sway(k.own(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.3, side: THREE.DoubleSide, color: '#e8e0cc' })), k.time, 0.05, 'y', 'net');
    const mesh = new THREE.Mesh(k.own(net), mat);
    mesh.name = 'lake-net';
    k.add(mesh);
    for (let i = 0; i < 6; i++) {
      const t = -1.4 + i * 0.56;
      solid.add(k.tint(k.xf(new THREE.SphereGeometry(0.06, 6, 4), NET.x + NET.tx * t, (ya + yb) / 2 + 2.2, NET.z + NET.tz * t), '#c9a256', 0.1), false);
    }
    k.clearing({ cx: NET.x, cz: NET.z, ax: NET.tx, az: NET.tz, hl: 2.2, hw: 0.8 });
  }
  k.clearing({ cx: DOCK_ROOT.x - DOCK_DIR.x, cz: DOCK_ROOT.z - DOCK_DIR.z, ax: DOCK_DIR.x, az: DOCK_DIR.z, hl: 2.5, hw: 2.2 });

  // ───────────── lotus
  buildLotus(k, WY, season);

  // ───────────── merge, add, night
  const s = solid.mesh(solidMat, 'lake-solid');
  const se = solid.edges(lineMat, 'lake-ink');
  const r = roofs.mesh(roofMat, 'lake-roofs');
  const rl = roofs.edges(tileLineMat, 'lake-tiles');
  for (const o of [s, se, r, rl]) if (o) k.add(o);
  const lanternMat = k.toon('#ffffff', { vertexColors: true, emissive: '#000000' });
  if (lanternGeos.length) {
    const lp = new Parts(k);
    lp.addAll(lanternGeos, false);
    const lm = lp.mesh(lanternMat, 'lake-lanterns');
    if (lm) k.add(lm);
  }
  const gc = canvas(64, 64);
  const g2 = gc.getContext('2d')!;
  const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grd;
  g2.fillRect(0, 0, 64, 64);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(lanternAt.flat(), 3));
  const glowMat = k.own(new THREE.PointsMaterial({ map: k.canvasTex(gc), color: '#ffc47a', size: 2.8, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const glows = new THREE.Points(k.own(pg), glowMat);
  glows.name = 'lake-glows';
  glows.visible = false;
  k.add(glows);
  const lamp = new THREE.PointLight('#ffb870', 0, 10, 1.6);
  lamp.position.set(PAV.x, PY + 2.2, PAV.z);
  k.add(lamp);
  let night = ctx.sky.isNight() ? 1 : 0;
  k.frame((dt, t) => {
    night += ((ctx.sky.isNight() ? 1 : 0) - night) * Math.min(1, dt * 1.5);
    const flick = 0.9 + 0.1 * Math.sin(t * 6.7) * Math.sin(t * 3.3 + 0.7);
    lanternMat.emissive.setRGB(0.6 * night * flick, 0.22 * night * flick, 0.08 * night);
    glowMat.opacity = 0.6 * night;
    glows.visible = night > 0.02;
    lamp.intensity = 5 * night * flick;
    lamp.visible = night > 0.02;
  });
}

/**
 * Where the river really runs near a guess (the core smooths the map's polyline): scan across the
 * flow with ctx.waterAt, re-aim along the channel, and return its centre, crossing axis and half width.
 */
function findChannel(ctx: { waterAt(x: number, z: number): number | null }, g: { x: number; z: number; ax: number; az: number; w: number }): { x: number; z: number; ax: number; az: number; w: number } {
  const scan = (x: number, z: number, ax: number, az: number): { c: number; w: number } | null => {
    const R = 12, st = 0.2;
    let best: { c: number; w: number } | null = null;
    let s0: number | null = null;
    for (let s = -R; s <= R + st; s += st) {
      const wet = s <= R && ctx.waterAt(x + ax * s, z + az * s) !== null;
      if (wet && s0 === null) s0 = s;
      if (!wet && s0 !== null) {
        const c = (s0 + s - st) / 2, w = (s - st - s0) / 2;
        if (!best || Math.abs(c) < Math.abs(best.c)) best = { c, w };
        s0 = null;
      }
    }
    return best;
  };
  const a = scan(g.x, g.z, g.ax, g.az);
  if (!a || a.w < 1.5) return g;
  const cx = g.x + g.ax * a.c, cz = g.z + g.az * a.c;
  // the flow direction: centres of two scans a few metres up and down stream
  const fx = -g.az, fz = g.ax;
  const up = scan(cx + fx * 3, cz + fz * 3, g.ax, g.az), dn = scan(cx - fx * 3, cz - fz * 3, g.ax, g.az);
  let ax = g.ax, az = g.az;
  if (up && dn) {
    const ux = cx + fx * 3 + g.ax * up.c, uz = cz + fz * 3 + g.az * up.c;
    const dx = cx - fx * 3 + g.ax * dn.c, dz = cz - fz * 3 + g.az * dn.c;
    const tx = ux - dx, tz = uz - dz, L = Math.hypot(tx, tz) || 1;
    ax = tz / L; az = -tx / L;
    if (ax * g.ax + az * g.az < 0) { ax = -ax; az = -az; }
  }
  const b = scan(cx, cz, ax, az);
  if (!b) return { x: cx, z: cz, ax, az, w: a.w };
  return { x: cx + ax * b.c, z: cz + az * b.c, ax, az, w: Math.max(2, b.w) };
}

// ─────────────────────────────── rocks ───────────────────────────────

function rockGeometry(k: Kit, seed: number): T.BufferGeometry {
  const THREE = k.T;
  const g = new THREE.IcosahedronGeometry(1, 1);
  const n = makeNoise2(seed);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = new THREE.Color('#b3ad9f'), dark = new THREE.Color('#5d5a53'), moss = new THREE.Color('#6f7d5f');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = 1 + 0.28 * n(x * 1.4 + 2, y * 1.6 + z);
    x *= r; y = (y * r + 0.35) * 0.8; z *= r;
    p.setXYZ(i, x, Math.max(-0.3, y), z);
    const c = base.clone().lerp(dark, Math.max(0, 0.45 - y * 0.5)).lerp(moss, y > 0.6 ? 0.35 : 0);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return k.own(g);
}

/** A tall, waisted, holed Taihu stone. */
function taihuRock(k: Kit, seed: number, w: number, h: number): T.BufferGeometry {
  const THREE = k.T;
  const g = new THREE.IcosahedronGeometry(1, 3);
  const n = makeNoise2(seed);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = new THREE.Color('#bdb7aa'), dark = new THREE.Color('#57544e');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const big = n(x * 1.3 + z * 0.8 + 3.1, y * 1.6 - 1.7), fine = n(x * 3.7 - z * 2.1, y * 3.3 + z * 1.9 + 5);
    const r = 1 + 0.3 * big + 0.12 * fine;
    x *= r; y *= r; z *= r;
    const yy = (y + 1) / 2;
    const waist = 1 - 0.3 * Math.sin(yy * Math.PI * 1.1);
    p.setXYZ(i, x * w * 0.5 * waist + yy * yy * w * 0.15, yy * h - h * 0.1, z * w * 0.42 * waist);
    const c = base.clone().lerp(dark, Math.min(1, Math.max(0, -big * 1.3 - fine * 0.5 + 0.1) * 1.2 + (1 - yy) * 0.12));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ─────────────────────────────── lotus ───────────────────────────────

/** The painted top of a lotus leaf: a malachite-ink wash with radial veins and a darker rim. */
function leafCanvas(seed: number): HTMLCanvasElement {
  const S = 256, c = canvas(S, S);
  const g = c.getContext('2d')!;
  const r = makeRng(seed);
  const cx = S / 2, cy = S / 2, R = S / 2 - 2;
  const grd = g.createRadialGradient(cx, cy, 4, cx, cy, R);
  grd.addColorStop(0, '#9fb28f');
  grd.addColorStop(0.18, '#6f8c68');
  grd.addColorStop(0.75, '#4f6c52');
  grd.addColorStop(1, '#3a4d3c');
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  // blotches of wetter ink, as in 没骨 lotus leaves
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, d = r.range(0.25, 0.85) * R, rr = r.range(14, 40);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const bg = g.createRadialGradient(x, y, 0, x, y, rr);
    bg.addColorStop(0, `rgba(30,40,32,${r.range(0.12, 0.28)})`);
    bg.addColorStop(1, 'rgba(30,40,32,0)');
    g.fillStyle = bg;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // radial veins
  g.lineCap = 'round';
  const nv = 19;
  for (let i = 0; i < nv; i++) {
    const a = (i / nv) * TAU + r.range(-0.05, 0.05);
    g.strokeStyle = `rgba(215,225,200,${r.range(0.35, 0.55)})`;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
    const bend = r.range(-0.08, 0.08);
    g.quadraticCurveTo(cx + Math.cos(a + bend) * R * 0.55, cy + Math.sin(a + bend) * R * 0.55, cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
    g.stroke();
    // forks near the rim
    g.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7);
      g.lineTo(cx + Math.cos(a + s * 0.09) * (R - 6), cy + Math.sin(a + s * 0.09) * (R - 6));
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(220,226,196,0.8)';
  g.beginPath(); g.arc(cx, cy, 7, 0, TAU); g.fill();
  // ink rim
  g.strokeStyle = 'rgba(24,30,24,0.75)';
  g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, R - 2, 0, TAU); g.stroke();
  return c;
}

/** A floating pad: a disc with the notch, rims turned up slightly. uv = planar. */
function padGeometry(k: Kit): T.BufferGeometry {
  const THREE = k.T;
  const N = 12, notch = 0.34;
  const pos: number[] = [0, 0, 0], uv: number[] = [0.5, 0.5], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = notch / 2 + (i / N) * (TAU - notch);
    const r = 1 + 0.04 * Math.sin(a * 5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x * 0.55, 0.012, z * 0.55, x, 0.035, z);
    uv.push(0.5 + x * 0.275, 0.5 - z * 0.275, 0.5 + x * 0.5, 0.5 - z * 0.5);
  }
  for (let i = 0; i < N; i++) {
    const a = 1 + i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(0, c, a, a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return k.own(g);
}

/** An upright leaf: a shallow cup with a wavy rim, centred at the origin (the stem is separate). */
function cupGeometry(k: Kit): T.BufferGeometry {
  const THREE = k.T;
  const N = 13, rings = [0, 0.4, 1];
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j < rings.length; j++) {
    const r = rings[j];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const wave = j === rings.length - 1 ? 0.07 * Math.sin(a * 5) + 0.03 * Math.sin(a * 9) : 0;
      const droop = j === rings.length - 1 ? -0.08 * Math.max(0, Math.cos(a - 1)) : 0;
      pos.push(Math.cos(a) * r, 0.34 * r * r + wave + droop, Math.sin(a) * r);
      uv.push(0.5 + Math.cos(a) * r * 0.5, 0.5 - Math.sin(a) * r * 0.5);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return k.own(g);
}

/** A lotus flower: two whorls of cupped petals, white at the base to rouge at the tips, a gamboge heart. */
function flowerGeometry(k: Kit, open: number): T.BufferGeometry {
  const THREE = k.T;
  const parts: T.BufferGeometry[] = [];
  const base = new THREE.Color('#f6f1e6'), tip = new THREE.Color('#dc8f9d');
  const petal = (a: number, len: number, wid: number, tilt: number, y0: number) => {
    // a diamond petal cupped along its spine: base, two shoulders, a raised mid-ridge, tip
    const pts: V3[] = [[0, 0, 0], [-wid, len * 0.45, 0.06], [0, len * 0.5, -0.05], [wid, len * 0.45, 0.06], [0, len, 0.02]];
    const tri = [0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3];
    const pos: number[] = [], col: number[] = [];
    for (const i of tri) {
      const [x, y, z] = pts[i];
      pos.push(x, y, z);
      const c = base.clone().lerp(tip, Math.pow(y / len, 1.6));
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.rotateX(-tilt);
    g.rotateY(-a + Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
  };
  for (let i = 0; i < 8; i++) parts.push(petal((i / 8) * TAU, 0.32, 0.12, 0.25 + 0.75 * open, 0));
  for (let i = 0; i < 6; i++) parts.push(petal((i / 6) * TAU + 0.4, 0.27, 0.1, 0.12 + 0.35 * open, 0.02));
  const heart = k.tint(new THREE.CylinderGeometry(0.07, 0.045, 0.07, 6).translate(0, 0.07, 0), '#c9b44f', 0.05);
  parts.push(heart);
  const stamens = k.tint(new THREE.CylinderGeometry(0.1, 0.08, 0.04, 7, 1, true).translate(0, 0.06, 0), '#d9a62e', 0.1);
  parts.push(stamens);
  const P = new Parts(k);
  P.addAll(parts.map((g) => (g.attributes.color ? g : k.tint(g, '#ffffff'))), false);
  return P.geometry()!;
}

function budGeometry(k: Kit): T.BufferGeometry {
  const THREE = k.T;
  const pts = [[0, 0], [0.07, 0.03], [0.1, 0.1], [0.085, 0.2], [0.04, 0.28], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 8);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = new THREE.Color('#e9e1cf'), tip = new THREE.Color('#c96b7c');
  for (let i = 0; i < p.count; i++) { const c = base.clone().lerp(tip, Math.pow(p.getY(i) / 0.32, 1.4)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ng = g.toNonIndexed();
  g.dispose();
  ng.deleteAttribute('uv');
  ng.computeVertexNormals();
  return k.own(ng);
}

function podGeometry(k: Kit): T.BufferGeometry {
  const THREE = k.T;
  const g = new THREE.CylinderGeometry(0.13, 0.05, 0.13, 10);
  g.translate(0, 0.065, 0);
  const t = k.tint(g, '#8f9a62', 0.08, 3);
  // seed holes: little dark discs on the flat top
  const holes: T.BufferGeometry[] = [t];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, r = i === 0 ? 0 : 0.075;
    holes.push(k.tint(new THREE.CircleGeometry(0.018, 5).rotateX(-Math.PI / 2).translate(Math.cos(a) * r, 0.131, Math.sin(a) * r), '#3d3a26'));
  }
  const P = new Parts(k);
  P.addAll(holes, false);
  return P.geometry()!;
}

/** World-space sway for everything standing in the water: displacement grows with height above it. */
function lotusSway<M extends T.Material>(m: M, time: { value: number }, waterY: number, amp: number, key: string, float = false): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = mvPosition.xyz;
        #endif
        float hgt = max(0.0, mvPosition.y - (${waterY.toFixed(3)}));
        float ph = dot(ip.xz, vec2(0.21, 0.12));
        float gust = 0.55 + 0.45 * sin(uTime * 0.37 - ip.x * 0.05);
        float sw = (sin(uTime * 1.25 - ph) + 0.35 * sin(uTime * 2.9 - ph * 1.7 + ip.z)) * gust;
        mvPosition.x += sw * ${amp.toFixed(4)} * hgt * hgt;
        mvPosition.z += sw * ${(amp * 0.55).toFixed(4)} * hgt * hgt;
        ${float ? 'mvPosition.y += sin(uTime * 0.9 + ph * 3.0) * 0.012;' : ''}
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => `wk-lotus-${key}`;
  return m;
}

function buildLotus(k: Kit, WY: number, season: string): void {
  const THREE = k.T;
  const rng = makeRng(2468);
  const noise = makeNoise2(1357);
  const summer = season === 'summer', autumn = season === 'autumn', winter = season === 'winter', spring = season === 'spring';

  /** How thickly lotus grows here (0..1): beds from noise, rich near the pavilion, island and south shore; lanes kept open. */
  const density = (x: number, z: number): number => {
    const q = lakeQ(x, z);
    if (q > 0.95) return 0;
    let d = 0.5 + 0.6 * noise.fbm(x * 0.05, z * 0.05, 3);
    d += 0.5 * Math.max(0, 1 - Math.hypot(x - PAV.x, z - PAV.z) / 12);
    const di = Math.hypot((x - ISLE.x) / ISLE.rx, (z - ISLE.z) / ISLE.rz);
    if (di < 1.15) return 0;
    d += 0.35 * Math.max(0, 1 - Math.abs(di - 1.5) / 0.5);
    d += 0.3 * Math.max(0, (q - 0.65) / 0.3);
    if (q < 0.4 && di > 2.2) d -= 0.35;
    for (const lane of LANES) if (polyDist(x, z, lane) < 2.4) return 0;
    if (Math.hypot(x - DOCK_END.x, z - DOCK_END.z) < 4.5 || polyDist(x, z, [ZIG[0], ZIG[1], ZIG[2], ZIG[3], ZIG[4]]) < 1.4) return 0;
    if (Math.abs(x - PAV.x) < PAV.h + 0.6 && Math.abs(z - PAV.z) < PAV.h + 0.6) return 0;
    if (polyDist(x, z, [DOCK_ROOT, DOCK_END]) < 2.4) return 0;
    return Math.max(0, Math.min(1, d - 0.35));
  };
  // clump centres by rejection sampling inside the ellipse
  const clumps: { x: number; z: number; d: number }[] = [];
  for (let i = 0; i < 3200 && clumps.length < 185; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng());
    const x = LAKE.x + Math.cos(a) * LAKE.rx * rr, z = LAKE.z + Math.sin(a) * LAKE.rz * rr;
    const d = density(x, z);
    if (d > 0 && rng() < d) clumps.push({ x, z, d });
  }
  type Inst = { x: number; y: number; z: number; s: number; ry: number; tilt: number; tiltDir: number; c: T.Color };
  const pads: Inst[] = [], leaves: Inst[] = [], flowers: Inst[] = [], buds: Inst[] = [], pods: Inst[] = [], stems: { x: number; z: number; top: V3; w: number; bent: boolean }[] = [];
  const green = new THREE.Color('#ffffff');
  const leafTint = () => {
    if (autumn) return new THREE.Color().setHSL(0.12 + rng() * 0.08, 0.35, 0.55 + rng() * 0.12);
    if (winter) return new THREE.Color().setHSL(0.08 + rng() * 0.04, 0.25, 0.42 + rng() * 0.1);
    return green.clone().multiplyScalar(0.85 + rng() * 0.25).lerp(new THREE.Color('#d8d2a0'), rng() < 0.12 ? 0.35 : 0);
  };
  const nPadK = spring ? 1.6 : winter ? 0.3 : 1;
  const nLeafK = spring ? 0.35 : winter ? 0.35 : autumn ? 0.8 : 1;
  for (const cl of clumps) {
    const n = Math.round((2 + cl.d * 5) * nPadK);
    for (let i = 0; i < n; i++) {
      const x = cl.x + rng.gauss() * 1.6, z = cl.z + rng.gauss() * 1.6;
      if (density(x, z) <= 0) continue;
      pads.push({ x, y: WY + 0.005 + rng() * 0.01, z, s: rng.range(0.28, 0.62), ry: rng() * TAU, tilt: 0, tiltDir: 0, c: leafTint() });
    }
    const m = Math.round((1 + cl.d * 3.2) * nLeafK);
    for (let i = 0; i < m; i++) {
      const x = cl.x + rng.gauss() * 1.4, z = cl.z + rng.gauss() * 1.4;
      if (density(x, z) <= 0) continue;
      const hgt = winter ? rng.range(0.2, 0.7) : rng.range(0.45, 1.55);
      const tilt = winter ? rng.range(0.8, 1.6) : rng.range(0.05, 0.55), tiltDir = rng() * TAU;
      const s = winter ? rng.range(0.2, 0.4) : rng.range(0.32, 0.7);
      const top: V3 = [x + Math.cos(tiltDir) * Math.sin(tilt) * 0.3, WY + hgt, z + Math.sin(tiltDir) * Math.sin(tilt) * 0.3];
      leaves.push({ x: top[0], y: top[1], z: top[2], s, ry: rng() * TAU, tilt, tiltDir, c: leafTint() });
      stems.push({ x, z, top, w: 0.018, bent: winter });
    }
    // flowers, buds, pods by season
    const nf = summer ? (rng() < 0.75 ? rng.int(1, 2) : 0) : 0;
    const nb = summer ? (rng() < 0.4 ? 1 : 0) : spring ? (rng() < 0.2 ? 1 : 0) : 0;
    const np = autumn ? rng.int(1, 2) : winter ? (rng() < 0.5 ? 1 : 0) : summer ? (rng() < 0.2 ? 1 : 0) : 0;
    const place = (arr: Inst[], lo: number, hi: number, tintFn: () => T.Color, droop = 0) => {
      const x = cl.x + rng.gauss() * 1.1, z = cl.z + rng.gauss() * 1.1;
      if (density(x, z) <= 0) return;
      const hgt = rng.range(lo, hi);
      const tilt = droop ? rng.range(droop * 0.5, droop) : rng.range(0, 0.25), tiltDir = rng() * TAU;
      const top: V3 = [x + Math.cos(tiltDir) * Math.sin(tilt) * 0.2, WY + hgt, z + Math.sin(tiltDir) * Math.sin(tilt) * 0.2];
      arr.push({ x: top[0], y: top[1], z: top[2], s: rng.range(0.85, 1.25), ry: rng() * TAU, tilt, tiltDir, c: tintFn() });
      stems.push({ x, z, top, w: 0.014, bent: false });
    };
    for (let i = 0; i < nf; i++) place(flowers, 0.7, 1.6, () => (rng() < 0.3 ? new THREE.Color('#ffffff') : new THREE.Color(1, 0.86, 0.9)));
    for (let i = 0; i < nb; i++) place(buds, 0.8, 1.7, () => new THREE.Color('#ffffff'));
    for (let i = 0; i < np; i++) place(pods, 0.5, 1.3, () => (winter || autumn ? new THREE.Color().setHSL(0.1, 0.3, 0.45 + rng() * 0.15) : new THREE.Color('#ffffff')), winter ? 1.2 : autumn ? 0.5 : 0);
  }

  // textures & materials
  const leafTex = k.canvasTex(leafCanvas(31));
  const mk = (map: T.Texture | null, key: string, amp: number, float = false, side: T.Side = THREE.DoubleSide) =>
    lotusSway(k.toon('#ffffff', { vertexColors: !map, side, ...(map ? { map } : {}) }), k.time, WY, amp, key, float);
  const padMat = mk(leafTex, 'pad', 0, true, THREE.FrontSide);
  const leafMat = mk(leafTex, 'leaf', 0.045);
  const flowerMat = mk(null, 'flower', 0.045);
  const stemMat = mk(null, 'stem', 0.045, false, THREE.FrontSide);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const instanced = (geo: T.BufferGeometry, mat: T.Material, list: Inst[], name: string, sy = 1) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      // tilt toward tiltDir, then spin about the stem
      q.setFromEuler(e.set(0, p.ry, 0));
      const qt = new THREE.Quaternion().setFromAxisAngle(v.set(Math.sin(p.tiltDir), 0, -Math.cos(p.tiltDir)), p.tilt);
      q.premultiply(qt);
      m4.compose(v.set(p.x, p.y, p.z), q, sc.set(p.s, p.s * sy, p.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, p.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = name;
    k.add(im);
  };
  instanced(padGeometry(k), padMat, pads, 'lotus-pads');
  instanced(cupGeometry(k), leafMat, leaves, 'lotus-leaves');
  instanced(flowerGeometry(k, 0.7), flowerMat, flowers, 'lotus-flowers');
  instanced(budGeometry(k), flowerMat, buds, 'lotus-buds');
  instanced(podGeometry(k), flowerMat, pods, 'lotus-pods');
  // stems: unit cylinders from the water to each head (bent over in winter)
  if (stems.length) {
    const sg = k.tint(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0), '#6d7a4e', 0.08);
    const im = new THREE.InstancedMesh(k.own(sg), stemMat, stems.length);
    const up = new THREE.Vector3(0, 1, 0);
    stems.forEach((s, i) => {
      const base = v.set(s.x, WY - 0.3, s.z).clone();
      const dir = new THREE.Vector3(s.top[0], s.top[1], s.top[2]).sub(base);
      const L = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      m4.compose(base, q, sc.set(s.w, L, s.w));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, s.bent ? new THREE.Color('#9a8a66') : new THREE.Color('#ffffff'));
    });
    im.computeBoundingSphere();
    im.name = 'lotus-stems';
    k.add(im);
  }
}
