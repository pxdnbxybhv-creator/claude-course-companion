// 梅岭 · Plum Ridge — 疏影横斜水清浅，暗香浮动月黄昏。(林逋《山园小梅》)
// A hillside of old plum trees in bloom (modeled gnarled trunks, blossoms as points, petals
// drifting down), stone steps up to a double-eaved hexagonal pavilion on the summit (its centre
// kept clear for the poet), a stone bench under the trees, scholar's rocks, a stele with the poem,
// three pines for the 岁寒三友, and snow on the ground in winter.
import type * as T from 'three';
import type { RegionModule, WorldCtx } from '../types';
import { ANCHORS, REGION, type XZ } from '../map';
import { makeNoise2, makeRng } from '../../../core/rng';
import { rasterize } from '../../../ink/brush';
import {
  Batch, COL, Hill, Painter, TAU, canvas, clamp, glowCanvas, lit, mistCards, ngon, particles, pathDist, place, plaqueCanvas,
  polyDist, puffCanvas, rockGeometry, roof, steleCanvas, stepPath, steppingStones, three, wind, windCards,
} from './hill-kit';
import { blossomCanvas, pineTree, plumTree } from './hill-trees';

const R = REGION.plum;
const SUMMIT = ANCHORS.plumSummit;
const BENCH = ANCHORS.plumBench;
const PAV_R = 3.5; // platform radius
const STELE = { x: -69.4, z: -69.2 };

const toEast = (() => {
  const dx = -60 - SUMMIT.x, dz = -80 - SUMMIT.z, l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
/** How far the hexagonal platform (corners on ±x) reaches from its centre in direction (dx, dz). */
const hexReach = (dx: number, dz: number) => {
  const a = Math.atan2(dz, dx);
  const off = ((((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3))) - Math.PI / 6; // from the nearest side's normal (sides face 30° + k·60°)
  return (PAV_R * Math.cos(Math.PI / 6)) / Math.cos(off);
};
// both flights start just inside the platform's edge, so the last slab meets the paving without a gap
const UP_STEPS: XZ[] = wind([{ x: -72, z: -65.2 }, { x: -71.2, z: -68 }, { x: -72.2, z: -70.6 }, { x: SUMMIT.x, z: SUMMIT.z + hexReach(0, 1) - 0.05 }], 0.5);
const EAST_STEPS: XZ[] = wind([
  { x: SUMMIT.x + toEast.x * (hexReach(toEast.x, toEast.z) - 0.05), z: SUMMIT.z + toEast.z * (hexReach(toEast.x, toEast.z) - 0.05) },
  { x: -65, z: -79.2 }, { x: -60.5, z: -80.2 },
], 0.5);
const BENCH_TRAIL: XZ[] = wind([{ x: -71, z: -64.5 }, { x: -67, z: -62.4 }, { x: BENCH.x - 1.2, z: BENCH.z - 0.2 }], 0.6);

function snowCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const r = makeRng(12);
  for (let i = 0; i < 14; i++) {
    const x = S * (0.2 + r() * 0.6), y = S * (0.2 + r() * 0.6), rr = S * (0.1 + r() * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(250,250,252,0.95)');
    grd.addColorStop(0.7, 'rgba(250,250,252,0.7)');
    grd.addColorStop(1, 'rgba(250,250,252,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  return c;
}

function petalsCanvas(): HTMLCanvasElement {
  const S = 256;
  const rng = makeRng(88);
  const p = new Painter(rng);
  const cols = ['#b83a4b', '#d98c96', '#efc3c6', '#f4efe4'];
  for (let i = 0; i < 38; i++) {
    const x = S * (0.08 + rng() * 0.84), y = S * (0.08 + rng() * 0.84);
    p.add('dot', [[x, y, 5 + rng() * 5]], 0.55 + rng() * 0.35, { color: cols[Math.floor(rng() * cols.length)] });
  }
  return rasterize(p.drawing(S, S, 0, 0), 1, 1);
}

function tuftCanvas(): HTMLCanvasElement {
  const W = 128, H = 96;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(31);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const len = 30 + r() * 60;
    const x0 = W / 2 + (r() - 0.5) * 24;
    const bend = (r() - 0.5) * 0.8;
    for (let s = 0; s < 8; s++) {
      const t0 = s / 8, t1 = (s + 1) / 8;
      const pt = (t: number) => [x0 + Math.cos(a + bend * t * t) * len * t, H - 2 + Math.sin(a + bend * t * t) * len * t];
      const [ax, ay] = pt(t0), [bx, by] = pt(t1);
      g.strokeStyle = `rgba(58,54,44,${0.7 - t0 * 0.4})`;
      g.lineWidth = 3 * (1 - t0) + 0.5;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  return c;
}

let hill: Hill | null = null;

function build(ctx: WorldCtx): void {
  hill?.dispose();
  const h = (hill = new Hill(ctx, 'plum'));
  const THREE = three();
  const rng = makeRng(0x3e1);
  const noise = makeNoise2(81);
  const b = new Batch();
  const winter = ctx.env.season === 'winter';

  const stepDist = (x: number, z: number) => Math.min(polyDist(UP_STEPS, x, z), polyDist(EAST_STEPS, x, z), polyDist(BENCH_TRAIL, x, z));
  const blocked = (x: number, z: number, pad = 0) =>
    Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < PAV_R + 2.5 + pad ||
    Math.hypot(x - BENCH.x, z - BENCH.z) < 2.2 + pad ||
    Math.hypot(x - STELE.x, z - STELE.z) < 1.8 + pad ||
    pathDist(x, z) < 2.4 + pad || stepDist(x, z) < 1.9 + pad ||
    ctx.waterAt(x, z) !== null;

  // ── the pavilion 暗香亭: double eaves, six columns, 美人靠 benches, centre clear ─────
  const gy = h.y(SUMMIT.x, SUMMIT.z);
  const top = Math.max(gy + 0.2, h.span(SUMMIT.x, SUMMIT.z, PAV_R * 0.6).hi + 0.12);
  {
    const { x, z } = SUMMIT;
    const lo = h.span(x, z, PAV_R).lo - 0.6;
    b.add(place(new THREE.CylinderGeometry(PAV_R, PAV_R + 0.12, top - lo, 6, 1, false, Math.PI / 2), x, (top + lo) / 2, z), COL.stone, { edge: 30, jitter: 0.05 });
    b.add(place(new THREE.CylinderGeometry(PAV_R + 0.02, PAV_R + 0.02, 0.1, 6, 1, false, Math.PI / 2), x, top - 0.02, z), COL.stoneMid, { edge: 30 });
    // paving lines on the platform
    const pave: number[] = [];
    const corners = ngon(6, PAV_R - 0.05);
    for (const rr of [1.2, 2.3]) {
      const cs = ngon(6, rr);
      for (let i = 0; i < 6; i++) pave.push(x + cs[i][0], top + 0.035, z + cs[i][1], x + cs[(i + 1) % 6][0], top + 0.035, z + cs[(i + 1) % 6][1]);
    }
    for (let i = 0; i < 6; i++) pave.push(x + corners[i][0] * 0.35, top + 0.035, z + corners[i][1] * 0.35, x + corners[i][0], top + 0.035, z + corners[i][1]);
    b.segs(pave);
    const colR = 2.85, colH = 2.7;
    const cols = ngon(6, colR);
    const openDirs = [Math.PI / 2, Math.atan2(toEast.z, toEast.x)];
    for (let i = 0; i < 6; i++) {
      const [cx, cz] = cols[i];
      b.add(place(new THREE.CylinderGeometry(0.12, 0.13, colH, 8), x + cx, top + colH / 2, z + cz), COL.lacquer, { rim: true });
      b.add(place(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 8), x + cx, top + 0.08, z + cz), COL.stoneMid, { edge: 40 });
      h.collide({ x: x + cx, z: z + cz, r: 0.22, h: colH });
      // side between column i and i+1
      const [dx, dz] = cols[(i + 1) % 6];
      const mid = Math.atan2((cz + dz) / 2, (cx + dx) / 2);
      const open = openDirs.some((a) => Math.abs(Math.atan2(Math.sin(mid - a), Math.cos(mid - a))) < 0.62);
      const mx = x + (cx + dx) / 2, mz = z + (cz + dz) / 2;
      const len = Math.hypot(dx - cx, dz - cz) - 0.26;
      const ry = Math.atan2(dx - cx, dz - cz) + Math.PI / 2;
      // hanging fretwork (挂落) under the beam on every side
      b.add(place(new THREE.BoxGeometry(len, 0.2, 0.05), mx, top + colH - 0.32, mz, ry), '#6d4a36', { edge: 30 });
      const fret: number[] = [];
      for (let k = 1; k < 8; k++) {
        const u = k / 8 - 0.5;
        const px = mx + Math.cos(ry) * u * len, pz = mz - Math.sin(ry) * u * len;
        fret.push(px, top + colH - 0.42, pz, px, top + colH - 0.22, pz);
      }
      b.segs(fret);
      if (!open) {
        // 美人靠: a seat and a back that leans out over the view — solid, so the open sides are the only ways in
        const nIn = 0.1 / Math.hypot((cx + dx) / 2, (cz + dz) / 2);
        for (let k = 1; k < 6; k++) {
          const u = k / 6;
          h.collide({ x: x + (cx + (dx - cx) * u) * (1 - nIn), z: z + (cz + (dz - cz) * u) * (1 - nIn), r: 0.25, h: 1 });
        }
        const inX = Math.cos(mid) * -0.12, inZ = Math.sin(mid) * -0.12;
        b.add(place(new THREE.BoxGeometry(len, 0.08, 0.38), mx + inX, top + 0.45, mz + inZ, ry), COL.wood, { edge: 30 });
        b.add(place(new THREE.BoxGeometry(len, 0.4, 0.06), mx + inX, top + 0.22, mz + inZ, ry), '#6a4a38', { edge: 30 });
        const ox = Math.cos(mid) * 0.12, oz = Math.sin(mid) * 0.12;
        b.add(place(new THREE.BoxGeometry(len, 0.5, 0.05), mx + ox, top + 0.72, mz + oz, ry, 1, 1, 1, -0.45), '#6a4a38', { edge: 30 });
        const slats: number[] = [];
        for (let k = 1; k < 10; k++) {
          const u = k / 10 - 0.5;
          const px = mx + ox + Math.cos(ry) * u * len, pz = mz + oz - Math.sin(ry) * u * len;
          slats.push(px, top + 0.5, pz, px + Math.cos(mid) * 0.2, top + 0.95, pz + Math.sin(mid) * 0.2);
        }
        b.segs(slats);
      }
    }
    const beamY = top + colH;
    b.add(place(new THREE.CylinderGeometry(colR + 0.05, colR + 0.05, 0.26, 6, 1, true, Math.PI / 2), x, beamY - 0.1, z), COL.wood, { edge: 30 });
    // bracket band (斗拱), indigo-green like old paint
    b.add(place(new THREE.CylinderGeometry(colR + 0.2, colR + 0.08, 0.22, 6, 1, true, Math.PI / 2), x, beamY + 0.12, z), '#3f5553', { edge: 30 });
    // lower eave (a skirt), upper drum, upper roof
    const e1 = beamY + 0.22;
    roof(b, ngon(6, 3.9).map(([a, c]) => [x + a, z + c]), ngon(6, 2.2).map(([a, c]) => [x + a, z + c]), e1, e1 + 0.8, { curl: 0.42, flare: 0.3, color: winter ? '#c9c7c2' : COL.tile });
    const drumY = e1 + 0.62;
    b.add(place(new THREE.CylinderGeometry(2.15, 2.15, 0.85, 6, 1, true, Math.PI / 2), x, drumY + 0.42, z), '#5b3d2e', { edge: 30 });
    const lat: number[] = [];
    const dc = ngon(6, 2.17);
    for (let i = 0; i < 6; i++) {
      const [ax, az] = dc[i], [bx, bz] = dc[(i + 1) % 6];
      for (let k = 1; k < 6; k++) {
        const u = k / 6;
        const px = x + ax + (bx - ax) * u, pz = z + az + (bz - az) * u;
        lat.push(px, drumY + 0.08, pz, px, drumY + 0.78, pz);
      }
      for (const yy of [0.3, 0.55]) lat.push(x + ax, drumY + yy, z + az, x + bx, drumY + yy, z + bz);
    }
    b.segs(lat);
    const e2 = drumY + 0.85;
    roof(b, ngon(6, 3.0).map(([a, c]) => [x + a, z + c]), ngon(6, 0.001).map(([a, c]) => [x + a, z + c]), e2, e2 + 1.9, { curl: 0.46, flare: 0.28, color: winter ? '#cfcdc8' : COL.tile });
    b.add(place(new THREE.SphereGeometry(0.2, 10, 8), x, e2 + 1.98, z), '#3c3c3e', { hull: true });
    b.add(place(new THREE.ConeGeometry(0.08, 0.5, 8), x, e2 + 2.32, z), '#3c3c3e');
    // plaque over the south opening
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), h.own(new THREE.MeshLambertMaterial({ map: h.tex(plaqueCanvas('暗香亭', { w: 256, h: 92 })) })));
    const ap = colR * Math.cos(Math.PI / 6) + 0.1;
    plaque.position.set(x, beamY - 0.12, z + ap);
    plaque.name = 'plum:plaque';
    h.add(plaque);
    h.occlude({ x, z, r: 3.2, y0: beamY, y1: e2 + 2 });
    // the platform is walkable: a hexagon (corners on ±x) as three rectangles turned by 60°
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      h.deck({ id: `plum:platform${k}`, cx: x, cz: z, ax: Math.cos(a), az: Math.sin(a), hl: PAV_R / 2, hw: PAV_R * Math.cos(Math.PI / 6), y: () => top + 0.03 });
    }
    h.clearing({ cx: x, cz: z, ax: 1, az: 0, hl: PAV_R + 0.3, hw: PAV_R + 0.3 });
    // two red lanterns at the south opening (the cinnabar accent of the ridge)
    const lanMat = h.toon('#b0473a', { emissive: '#000000' });
    const capMat = h.toon('#2b2724');
    const lanGeo = new THREE.SphereGeometry(0.2, 12, 9);
    const capGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10);
    const glowMat = h.own(new THREE.SpriteMaterial({ map: h.tex(glowCanvas(64)), color: '#ffcf8a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const lans: T.Object3D[] = [];
    const glows: T.Sprite[] = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(x + s * 0.85, beamY - 0.62, z + ap - 0.25);
      const body = new THREE.Mesh(lanGeo, lanMat); body.scale.set(1, 1.2, 1);
      const t1 = new THREE.Mesh(capGeo, capMat); t1.position.y = 0.24;
      const t2 = new THREE.Mesh(capGeo, capMat); t2.position.y = -0.24;
      g.add(body, t1, t2);
      h.add(g);
      lans.push(g);
      const sp = new THREE.Sprite(glowMat);
      sp.position.copy(g.position);
      sp.scale.setScalar(2.4);
      h.add(sp);
      glows.push(sp);
    }
    h.frame((_dt, t) => {
      const n = h.night;
      const flick = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
      lanMat.emissive.setRGB(0.55 * n * flick, 0.2 * n * flick, 0.08 * n);
      glowMat.opacity = 0.55 * n;
      for (const g of glows) g.visible = n > 0.02;
      lans.forEach((l, i) => { l.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.04; });
    });
  }

  // ── the steps up the ridge and down toward the temple; a trail to the bench ─────
  stepPath(b, h, UP_STEPS, { width: 1.7, run: 0.5, seed: 3, endTop: top });
  stepPath(b, h, EAST_STEPS, { width: 1.5, run: 0.55, seed: 4, startTop: top });
  steppingStones(b, h, BENCH_TRAIL, { gap: 0.75, w: 0.6, seed: 5, color: '#b2ad9e' });

  // ── the bench, the stele, scholar's rocks ─────────────────────────────────
  {
    const { x, z } = BENCH;
    const ry = Math.atan2(-0.9, 0.45); // faces south-east, down the slope toward the garden
    const by = h.y(x, z);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const u of [-0.6, 0.6]) b.add(place(new THREE.BoxGeometry(0.22, 0.42, 0.42), x + u * c, by + 0.2, z - u * s, ry), COL.stoneMid, { edge: 40, jitter: 0.05 });
    b.add(place(new THREE.BoxGeometry(1.7, 0.1, 0.5), x, by + 0.46, z, ry), COL.stone, { edge: 40, jitter: 0.04 });
    h.collide({ x, z, r: 0.6, h: 0.5 });
  }
  let steleFront: T.Vector3;
  {
    const { x, z } = STELE;
    const ry = Math.atan2(-72 - x, -68 - z); // faces the steps
    const sy = h.span(x, z, 0.7).lo;
    b.add(place(new THREE.BoxGeometry(1.3, 0.45, 0.8), x, sy + 0.12, z, ry), COL.stoneMid, { edge: 30, jitter: 0.05 });
    b.add(place(new THREE.BoxGeometry(0.95, 2.0, 0.26), x, sy + 1.3, z, ry), '#77726a', { edge: 30 });
    b.add(place(new THREE.BoxGeometry(1.15, 0.18, 0.4), x, sy + 2.36, z, ry), '#6a655e', { edge: 30 });
    b.add(place(new THREE.CylinderGeometry(0.12, 0.62, 0.3, 4, 1, false, Math.PI / 4), x, sy + 2.58, z, ry, 1, 1, 0.45), '#5f5a54', { edge: 30 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.86), h.own(new THREE.MeshLambertMaterial({ map: h.tex(steleCanvas(['疏影横斜水清浅', '暗香浮动月黄昏'], { w: 256, h: 512, title: '梅岭' })) })));
    face.position.set(x + Math.sin(ry) * 0.132, sy + 1.3, z + Math.cos(ry) * 0.132);
    face.rotation.y = ry;
    face.name = 'plum:stele';
    h.add(face);
    h.collide({ x, z, r: 0.7, h: 2.6 });
    steleFront = new THREE.Vector3(x + Math.sin(ry) * 1.2, sy, z + Math.cos(ry) * 1.2);
  }
  h.interact({
    id: 'plum:stele', position: steleFront, radius: 2,
    labelZh: '梅岭碑', labelEn: 'The Plum Ridge stele', actionZh: '读碑', actionEn: 'Read',
    act: () => ctx.hud.showCard({
      titleZh: '山园小梅 · 林逋', titleEn: 'Little Plum in a Hill Garden · Lin Bu',
      bodyZh: '众芳摇落独暄妍，占尽风情向小园。\n疏影横斜水清浅，暗香浮动月黄昏。',
      bodyEn: 'When every flower has fallen, it alone is bright.\nSparse shadows slant across clear shallow water; a hidden fragrance drifts in the yellow dusk of the moon.',
      seal: '梅',
    }),
  });
  const rocks: [number, number, number, number][] = [
    [SUMMIT.x - 5.6, SUMMIT.z + 1.2, 1.1, 2.4], [SUMMIT.x - 4.8, SUMMIT.z - 3.8, 0.8, 1.5], [BENCH.x - 2.6, BENCH.z - 1.0, 0.9, 1.9],
    [-66.5, -70.5, 0.7, 1.2], [-78, -64, 1.2, 1.0], [-84, -80, 1.6, 1.4], [-60, -70, 1.0, 0.9], [-75.8, -68.8, 0.6, 1.3],
  ];
  rocks.forEach(([x, z, w, hh], i) => {
    if (ctx.waterAt(x, z) !== null || pathDist(x, z) < 1.5 || stepDist(x, z) < 1.3) return;
    const g = rockGeometry(3100 + i, w * 1.4, hh * 1.3, { base: '#bdb6a8', dark: '#524e48', lean: 0.35 });
    g.rotateY(rng() * TAU);
    g.translate(x, h.y(x, z) - 0.05, z);
    b.colored(g, { hull: true });
    h.collide({ x, z, r: w * 0.6, h: hh });
  });

  // ── plum trees ──────────────────────────────────────────────────────────
  const blossomPos: number[] = [], blossomCol: number[] = [], blossomSize: number[] = [];
  const crowns: T.Vector3[] = [];
  const kinds = [
    { w: 0.4, cols: ['#b83a4b', '#c44b5b', '#a8303f', '#d06a77'] },   // 红梅
    { w: 0.3, cols: ['#e2a3ab', '#d98c96', '#ebb9be', '#f1cfd1'] },   // 宫粉
    { w: 0.24, cols: ['#f4efe4', '#efe8dc', '#e9e1d4'] },             // 白梅
    { w: 0.06, cols: ['#eef0e2', '#e1ead6'] },                        // 绿萼
  ];
  const spots: { x: number; z: number; s: number }[] = [
    { x: BENCH.x + 1.6, z: BENCH.z - 2.4, s: 1.15 },          // shading the bench
    { x: SUMMIT.x + 6.5, z: SUMMIT.z + 2.5, s: 1.1 },         // framing the pavilion
    { x: SUMMIT.x - 5.2, z: SUMMIT.z + 5.4, s: 1.0 },
    { x: STELE.x + 2.4, z: STELE.z - 1.4, s: 0.9 },
  ];
  for (let tries = 0; tries < 1200 && spots.length < 34; tries++) {
    const a = rng() * TAU, d = 4 + Math.sqrt(rng()) * (R.radius + 2);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (blocked(x, z)) continue;
    if (rng() > 0.55 + 0.5 * noise(x * 0.07, z * 0.07)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
    spots.push({ x, z, s: 0.95 + rng() * 0.55 });
  }
  const tmpC = new THREE.Color();
  for (const sp of spots) {
    const y = h.y(sp.x, sp.z);
    const t = plumTree(rng, sp.x, y, sp.z, sp.s);
    for (const g of t.trunk) b.colored(g, { hull: true, rim: true });
    for (const g of t.twigs) b.colored(g, { rim: true });
    let r = rng(), kind = kinds[0];
    for (const k of kinds) { if (r < k.w) { kind = k; break; } r -= k.w; }
    for (const bl of t.blossoms) {
      blossomPos.push(bl.p.x, bl.p.y, bl.p.z);
      tmpC.set(kind.cols[Math.floor(rng() * kind.cols.length)]);
      if (bl.s < 0.6) tmpC.multiplyScalar(0.8); // buds a little deeper
      blossomCol.push(tmpC.r, tmpC.g, tmpC.b);
      blossomSize.push(bl.s);
    }
    crowns.push(...t.crown.filter((_, i) => i % 2 === 0));
    h.collide({ x: sp.x, z: sp.z, r: 0.35 * sp.s, h: 2.5 });
  }
  // 岁寒三友: three pines on the ridge's shoulder
  for (const [x, z, s] of [[-86, -70, 0.9], [-58, -84, 0.8], [-82, -88, 1.0]] as [number, number, number][]) {
    if (blocked(x, z, -1)) continue;
    const p = pineTree(rng, x, h.y(x, z), z, s);
    for (const g of p.trunk) b.colored(g, { hull: true, rim: true });
    for (const g of p.pads) b.colored(g, { hull: true });
    h.collide({ x, z, r: 0.45 * s, h: p.height });
    h.occlude({ x, z, r: 0.5, y0: h.y(x, z), y1: h.y(x, z) + p.height });
  }

  b.build(h, 'plum', { outline: 0.035, lineOpacity: 0.62, rim: 0.65 });

  // blossoms: one Points draw, alpha-tested so they sort with the branches
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(blossomPos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(blossomCol, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(blossomSize, 1));
    const m = h.own(new THREE.PointsMaterial({ size: 0.24, map: h.tex(blossomCanvas()), vertexColors: true, alphaTest: 0.45, sizeAttenuation: true }));
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSize;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;')
        .replace('#include <logdepthbuf_vertex>', 'gl_PointSize = max(gl_PointSize, 2.5);\n#include <logdepthbuf_vertex>');
    };
    m.customProgramCacheKey = () => 'hill-blossom';
    const pts = new THREE.Points(g, m);
    pts.name = 'plum:blossoms';
    h.add(pts);
    lit(h, m);
  }
  // a wash of colour around each crown, so the ridge reads as in bloom from afar (like 没骨 washes)
  const hazeItems: { p: T.Vector3; w: number; h: number }[] = [];
  const hazeCol: T.Color[] = [];
  for (let i = 0; i < crowns.length; i += 2) {
    const c = crowns[i];
    hazeItems.push({ p: c.clone().add(new THREE.Vector3(0, -0.3, 0)), w: 2.6 + rng() * 1.6, h: 2 + rng() * 1.2 });
  }
  void hazeCol;
  const bloomHaze = mistCards(h, hazeItems, { tex: h.tex(puffCanvas(64, 44)), color: '#e6a9b0', opacity: 0.32, drift: 0.02, fog: true });
  bloomHaze.name = 'plum:bloom-haze';
  bloomHaze.renderOrder = 2;
  h.add(bloomHaze);
  h.frame(() => { (bloomHaze.material as T.MeshBasicMaterial).color.set('#e6a9b0').multiply(h.paper); });

  // petals drifting down on the breeze
  const petals = particles(h, {
    count: 260, at: crowns, spread: [1.2, 0.6, 1.2], vel: [0.35, -0.42, 0.18], velJitter: [0.15, 0.1, 0.15], life: 9, size: 0.09,
    color: '#ffffff', colors: ['#c44b5b', '#e2a3ab', '#efc3c6', '#f4efe4', '#d06a77'], opacity: 0.95, tex: h.tex(blossomCanvas()), wobble: 0.9, spin: true, seed: 17,
  });
  petals.name = 'plum:petals';
  h.add(petals);

  // ── ground: fallen petals (or snow), grass tufts, a low mist on the slope ─────
  const decalTex = h.tex(winter ? snowCanvas() : petalsCanvas());
  const decalMat = h.own(new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const decals: [number, number, number][] = [];
  for (const sp of spots) {
    const n = winter ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = rng() * 2.2;
      const x = sp.x + Math.cos(a) * d, z = sp.z + Math.sin(a) * d;
      if (stepDist(x, z) < 1.1) continue;
      decals.push([x, z, winter ? 3 + rng() * 3 : 1.4 + rng() * 1.4]);
    }
  }
  if (winter) {
    for (let i = 0; i < 70; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * R.radius;
      const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
      if (stepDist(x, z) < 1.2 || pathDist(x, z) < 1.4) continue;
      decals.push([x, z, 3 + rng() * 4]);
    }
  }
  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const decal = new THREE.InstancedMesh(decalGeo, decalMat, Math.max(1, decals.length));
  decal.count = decals.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  decals.forEach(([x, z, s], i) => {
    // tilt with the slope
    const dx = h.y(x + 0.5, z) - h.y(x - 0.5, z), dz = h.y(x, z + 0.5) - h.y(x, z - 0.5);
    e.set(Math.atan(dz), rng() * TAU, -Math.atan(dx), 'XYZ');
    q.setFromEuler(e);
    p3.set(x, h.y(x, z) + 0.04, z); s3.set(s, 1, s);
    decal.setMatrixAt(i, m4.compose(p3, q, s3));
  });
  decal.instanceMatrix.needsUpdate = true;
  decal.computeBoundingSphere();
  decal.renderOrder = -1;
  decal.name = 'plum:ground';
  h.add(decal);
  lit(h, decalMat);

  const tuftMat = windCards(h, h.tex(tuftCanvas()), { amp: 0.1, baseY: gy - 12, span: 14, alphaTest: 0.35, key: 'plum-tuft' });
  const tuftSpots: [number, number][] = [];
  for (let i = 0; i < 900 && tuftSpots.length < 220; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (R.radius + 2);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (ctx.waterAt(x, z) !== null || stepDist(x, z) < 1.2 || pathDist(x, z) < 1.3 || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < PAV_R + 0.3) continue;
    tuftSpots.push([x, z]);
  }
  const tq = new THREE.PlaneGeometry(0.6, 0.45).translate(0, 0.22, 0);
  const tuftGeo = crossQuads(THREE, tq);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftSpots.length);
  tuftSpots.forEach(([x, z], i) => {
    const s = 0.7 + rng() * 0.7;
    e.set(0, rng() * TAU, 0, 'XYZ'); q.setFromEuler(e);
    p3.set(x, h.y(x, z) - 0.02, z); s3.set(s, s * (winter ? 0.6 : 1), s);
    tufts.setMatrixAt(i, m4.compose(p3, q, s3));
  });
  tufts.instanceMatrix.needsUpdate = true;
  tufts.computeBoundingSphere();
  tufts.name = 'plum:tufts';
  h.add(tufts);
  const tuftBase = new THREE.Color(winter ? '#b9b6ae' : '#ffffff');
  h.frame(() => tuftMat.color.copy(tuftBase).multiply(h.paper));

  // mist banks lying in the folds below the summit (云雾缭绕)
  const mistItems: { p: T.Vector3; w: number; h: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + rng() * 0.3, d = R.radius * (0.75 + rng() * 0.45);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    mistItems.push({ p: new THREE.Vector3(x, h.y(x, z) + 1.2 + rng() * 1.5, z), w: 14 + rng() * 10, h: 3 + rng() * 2.5 });
  }
  const mist = mistCards(h, mistItems, { tex: h.tex(puffCanvas(128, 33)), color: '#f3eee4', opacity: 0.6, drift: 0.35 });
  mist.name = 'plum:mist';
  h.add(mist);
  h.frame(() => { (mist.material as T.MeshBasicMaterial).color.set('#f3eee4').multiply(h.paper); });
  void clamp;
}

function crossQuads(THREE: WorldCtx['THREE'], a: T.BufferGeometry): T.BufferGeometry {
  const b = a.clone().rotateY(Math.PI / 2);
  const pos = [...Array.from(a.attributes.position.array), ...Array.from(b.attributes.position.array)];
  const uv = [...Array.from(a.attributes.uv.array), ...Array.from(b.attributes.uv.array)];
  const n = a.attributes.position.count;
  const idx = [...Array.from(a.index!.array), ...Array.from(b.index!.array, (i) => i + n)];
  a.dispose(); b.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const plumRegion: RegionModule = {
  id: 'plum',
  build,
  dispose() {
    hill?.dispose();
    hill = null;
  },
};
