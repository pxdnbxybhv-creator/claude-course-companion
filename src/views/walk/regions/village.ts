// 水乡 · the water town: a Jiangnan canal town astride the river south of the garden. White walls
// and black tiles (粉墙黛瓦) with horse-head gables, houses fronting a stone-quayed canal, the
// high-arched stone bridge, river steps for floating lanterns, a square for 投壶, a two-storey
// teahouse under a fluttering 茶 banner, a market street (awnings, baskets, oil-paper umbrellas,
// a 糖人 stall), moored 乌篷 boats, laundry poles, a well, willows and a memorial archway (牌坊).
// Static geometry is merged per material; boats, cloth and willows sway in their vertex shaders.
import type * as T from 'three';
import type { RegionModule } from '../types';
import { ANCHORS } from '../map';
import { Kit, Parts, bob, flatsMesh, fontsReady, headingTo, packAtlas, riverZ, sway, type Flat } from './water-kit';
import { Quads, RIDGE, STONE, WOODC, buildHouse, gableRoof, rectColliders, xfLines, type Collectors, type Front, type HouseSpec } from './water-arch';
import { ATLAS_CHARS, CELL, bannerUV, cellUV, paintFacades, signUV, stripUV, willowDrawing } from './water-paint';
import { rectClearing, segmentDeck } from './water-decks';
import { rasterize } from '../../../ink/brush';
import { plantDrawing } from '../../../ink/plants';

let kit: Kit | null = null;

export const village: RegionModule = {
  id: 'village',
  async build(ctx) {
    kit?.dispose();
    kit = new Kit(ctx, 'village');
    await buildVillage(kit);
  },
  dispose() {
    kit?.dispose();
    kit = null;
  },
};

type V3 = [number, number, number];

/** South-pointing unit normal of the river at x (the river flows west through the town). */
function southNormal(x: number): { x: number; z: number } {
  const r = riverZ(x);
  return { x: r.tz, z: -r.tx };
}

async function buildVillage(k: Kit): Promise<void> {
  const { ctx } = k;
  const THREE = k.T;
  const gy = (x: number, z: number) => ctx.groundY(x, z);
  const riverY = (x: number) => ctx.waterAt(x, riverZ(x).z) ?? -0.5;

  // ───────────── textures & materials
  await fontsReady(ATLAS_CHARS);
  const facades = paintFacades();
  const atlas = k.canvasTex(facades.day);
  const glowAtlas = k.canvasTex(facades.glow);
  const wallMat = k.toon('#ffffff', { vertexColors: true, map: atlas });
  wallMat.emissiveMap = glowAtlas;
  wallMat.emissive = new THREE.Color('#000000');
  const solidMat = k.toon('#ffffff', { vertexColors: true });
  const roofMat = k.toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
  const lineMat = k.lineMat(0.7);
  const tileLineMat = k.lineMat(0.42, '#141312');
  const clothMat = sway(k.toon('#ffffff', { vertexColors: true, map: atlas, side: THREE.DoubleSide }), k.time, 0.16, 'attr', 'cloth');

  const c: Collectors = { walls: new Parts(k), solid: new Parts(k), roofs: new Parts(k) };
  const cloth = new Parts(k);
  const lanternGeos: T.BufferGeometry[] = [];
  const lanternAt: V3[] = [];
  const flats: Flat[] = [];

  /** Cloth: a subdivided rectangle hanging from its top edge (aw = 0 there, 1 at the free edge). */
  const clothPiece = (w: number, h: number, color: string, uv: [number, number, number, number], m: T.Matrix4, freeEdge: 'bottom' | 'front' = 'bottom') => {
    const g = new THREE.PlaneGeometry(w, h, 3, 4);
    g.translate(0, -h / 2, 0);
    const p = g.attributes.position, u = g.attributes.uv;
    const aw = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const t = freeEdge === 'bottom' ? -p.getY(i) / h : (p.getX(i) + w / 2) / w;
      aw[i] = t * t;
      u.setXY(i, uv[0] + u.getX(i) * (uv[2] - uv[0]), uv[1] + u.getY(i) * (uv[3] - uv[1]));
    }
    const tg = k.tint(g, color, 0.03, 7, true);
    tg.setAttribute('aw', new THREE.BufferAttribute(tg.index ? aw : expand(aw, g), 1));
    tg.applyMatrix4(m);
    cloth.add(tg, false);
  };
  // PlaneGeometry is indexed; tint() made it non-indexed, so expand aw along the old index
  function expand(a: Float32Array, g: T.BufferGeometry): Float32Array {
    const idx = g.index!;
    const out = new Float32Array(idx.count);
    for (let i = 0; i < idx.count; i++) out[i] = a[idx.getX(i)];
    return out;
  }
  const mat4 = (x: number, y: number, z: number, ry = 0, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const lantern = (x: number, y: number, z: number, s = 1) => {
    const g = new THREE.SphereGeometry(0.2 * s, 10, 7);
    g.scale(1, 1.25, 1);
    lanternGeos.push(k.tint(k.xf(g, x, y, z), '#b8473a', 0.04));
    c.solid.add(k.cyl(0.09 * s, 0.09 * s, 0.06, 8, '#2b2724', x, y + 0.26 * s, z), false);
    c.solid.add(k.cyl(0.09 * s, 0.09 * s, 0.06, 8, '#2b2724', x, y - 0.26 * s, z), false);
    c.solid.add(k.cyl(0.01, 0.01, 0.34, 3, '#2b2724', x, y + 0.45 * s, z), false);
    c.solid.add(k.cyl(0.012, 0.012, 0.22, 3, '#b8473a', x, y - 0.4 * s, z), false);
    lanternAt.push([x, y, z]);
  };

  // ───────────── the canal: stone quays on both banks, with a gap for the river steps
  const BRIDGE_X = ANCHORS.villageBridge.x;
  const STEPS_X = ANCHORS.lanternSteps.x;
  const quay2 = (side: 1 | -1, x0: number, x1: number, skip: [number, number][]) => {
    const step = 1.25;
    // walkable runs of up to six slabs (the quay top is the street by the water)
    let run: { a: { x: number; z: number }; b: { x: number; z: number }; top: number; n: number; nx: number; nz: number } | null = null;
    const flush = () => {
      if (!run) return;
      const off = 1.25;
      const a = { x: run.a.x + side * run.nx * off, z: run.a.z + side * run.nz * off }, b = { x: run.b.x + side * run.nx * off, z: run.b.z + side * run.nz * off };
      k.deck(segmentDeck(`village-quay-${side}-${Math.round(run.a.x * 10)}`, a, b, 1.25, run.top));
      run = null;
    };
    for (let x = x0; x < x1 - 0.01; x += step) {
      const xa = x, xb = Math.min(x1, x + step), xm = (xa + xb) / 2;
      if (skip.some(([a, b]) => xm > a && xm < b)) { flush(); continue; }
      const ra = riverZ(xa), rb = riverZ(xb), rm = riverZ(xm);
      const na = southNormal(xa), nb = southNormal(xb), nm = southNormal(xm);
      const pa = { x: xa + side * na.x * (ra.w - 0.15), z: ra.z + side * na.z * (ra.w - 0.15) };
      const pb = { x: xb + side * nb.x * (rb.w - 0.15), z: rb.z + side * nb.z * (rb.w - 0.15) };
      const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const ry = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      const wy = riverY(xm);
      const land = { x: xm + side * nm.x * (rm.w + 2.8), z: rm.z + side * nm.z * (rm.w + 2.8) };
      const top = Math.max(gy(land.x, land.z), wy + 0.45) + 0.06;
      const bottom = wy - 0.9;
      const depth = 2.5;
      const cx = (pa.x + pb.x) / 2 + side * nm.x * depth / 2, cz = (pa.z + pb.z) / 2 + side * nm.z * depth / 2;
      if (!run) run = { a: pa, b: pb, top, n: 0, nx: nm.x, nz: nm.z };
      run.b = pb; run.top = Math.max(run.top, top); run.n++;
      if (run.n >= 6) flush();
      const shade = (Math.round(x / step) % 3) * 0.05;
      // slab: long side along the bank (local z = along ry)
      c.solid.add(k.box(depth, top - bottom, len + 0.02, shade ? '#c4bdad' : STONE, cx, (top + bottom) / 2, cz, ry, 0.08), 25);
      const ex = (pa.x + pb.x) / 2 + side * nm.x * 0.28, ez = (pa.z + pb.z) / 2 + side * nm.z * 0.28;
      c.solid.add(k.box(0.66, 0.14, len - 0.03, '#b3ac9d', ex, top + 0.05, ez, ry, 0.08), 25);
      // tide mark and moss on the water face: a dark band just above the water
      const fx = (pa.x + pb.x) / 2 - side * nm.x * 0.02, fz = (pa.z + pb.z) / 2 - side * nm.z * 0.02;
      c.solid.add(k.box(0.04, 0.28, len + 0.02, '#6f6c5e', fx, wy + 0.16, fz, ry, 0.15), false);
    }
    flush();
  };
  const bSkip: [number, number] = [BRIDGE_X - 3.6, BRIDGE_X + 2.6];
  quay2(1, -48, 38, [bSkip, [STEPS_X - 1.9, STEPS_X + 1.9]]);
  quay2(-1, -46, 32, [bSkip]);

  // ───────────── river steps (河埠头) for floating lanterns
  {
    const r = riverZ(STEPS_X), n = southNormal(STEPS_X);
    const wy = riverY(STEPS_X);
    const top = Math.max(gy(STEPS_X + n.x * (r.w + 2.8), r.z + n.z * (r.w + 2.8)), wy + 0.45) + 0.06;
    const ry = Math.atan2(n.x, n.z); // local +z points inland (south)
    const land = wy + 0.16;
    const at = (d: number) => ({ x: STEPS_X + n.x * d, z: r.z + n.z * d });
    const nSteps = 4;
    // landing at the water
    const l0 = r.w - 2.7, l1 = r.w - 0.9;
    const lm = at((l0 + l1) / 2);
    c.solid.add(k.box(3.4, land - (wy - 0.9), l1 - l0, '#bfb8a8', lm.x, (land + wy - 0.9) / 2, lm.z, ry, 0.06), 25);
    for (let i = 0; i < nSteps; i++) {
      const d0 = l1 + i * 0.5, d1 = d0 + 0.5;
      const yTop = land + ((top - land) * (i + 1)) / (nSteps + 1);
      const m = at((d0 + d1) / 2);
      c.solid.add(k.box(3.4, yTop - (wy - 0.9), 0.5, i % 2 ? '#c6bfaf' : '#bbb4a4', m.x, (yTop + wy - 0.9) / 2, m.z, ry, 0.06), 25);
    }
    // a mooring post and two small stone lanterns on the landing's outer corners
    const mp = at(l0 + 0.3);
    c.solid.add(k.cyl(0.12, 0.14, 0.7, 8, '#8f8a7f', mp.x - n.z * 1.3, land + 0.3, mp.z + n.x * 1.3), 30);
    for (const s of [-1, 1]) {
      const p = at(l0 + 0.35);
      const x = p.x - n.z * s * 1.4, z = p.z + n.x * s * 1.4, y = land;
      if (s > 0) continue;
      c.solid.add(k.cyl(0.18, 0.22, 0.12, 6, '#a6a092', x, y + 0.06, z), 30);
      c.solid.add(k.cyl(0.05, 0.07, 0.42, 6, '#b1ab9e', x, y + 0.33, z), 30);
      c.solid.add(k.box(0.24, 0.22, 0.24, '#b8b2a5', x, y + 0.64, z, ry), 30);
      c.solid.add(k.cyl(0.02, 0.26, 0.2, 6, '#8f8a80', x, y + 0.85, z), 30);
      lanternAt.push([x, y + 0.64, z]);
      k.collider({ x, z, r: 0.25, h: 1 });
    }
    // walkable: the flight and the landing (s = along n from the landing's water end)
    const a = at(l0), b = at(r.w + 2.4);
    const L = (r.w + 2.4) - l0;
    k.deck(segmentDeck('village-steps', a, b, 1.6, (s) => {
      const d = s + L / 2 + l0; // back to distance from the centreline
      if (d <= l1) return land;
      const i = Math.min(nSteps, Math.floor((d - l1) / 0.5));
      return i >= nSteps ? top : land + ((top - land) * (i + 1)) / (nSteps + 1);
    }));
  }

  // ───────────── the arched stone bridge
  {
    const r = riverZ(BRIDGE_X), n = southNormal(BRIDGE_X);
    const bx = BRIDGE_X, bz = r.z;
    const wy = riverY(BRIDGE_X);
    const L = 9.6, W = 3.4, R = 3.5;
    const endN = { x: bx - n.x * L, z: bz - n.z * L }, endS = { x: bx + n.x * L, z: bz + n.z * L };
    const yEnd = Math.max(gy(endN.x, endN.z), gy(endS.x, endS.z), wy + 0.5) + 0.06;
    const yc = wy - 0.15;
    const crest = yc + R + 0.78;
    const deckY = (s: number) => yEnd + (crest - yEnd) * (1 - Math.pow(Math.min(1, Math.abs(s) / L), 1.8));
    const ry = Math.atan2(n.x, n.z);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, 0, bz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    const shape = new THREE.Shape();
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const s = -L + (2 * L * i) / N;
      if (i === 0) shape.moveTo(s, deckY(s)); else shape.lineTo(s, deckY(s));
    }
    shape.lineTo(L, wy - 1.4);
    shape.lineTo(-L, wy - 1.4);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(R, wy - 1.3);
    hole.lineTo(R, yc);
    hole.absarc(0, yc, R, 0, Math.PI, false);
    hole.lineTo(-R, wy - 1.3);
    hole.closePath();
    shape.holes.push(hole);
    const body = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 28 });
    body.translate(0, 0, -W / 2);
    body.rotateY(-Math.PI / 2);
    c.solid.add(k.tint(body, '#cbc4b4', 0.06, 3).applyMatrix4(m), 25);
    // voussoir rings on both faces, keystone
    for (const s of [1, -1]) {
      const ring = new THREE.RingGeometry(R, R + 0.42, 26, 1, 0, Math.PI);
      ring.translate(0, yc, 0);
      ring.rotateY(s * Math.PI / 2);
      ring.translate(s * (W / 2 + 0.012), 0, 0);
      c.solid.add(k.tint(ring, '#aaa395', 0.1, 5).applyMatrix4(m), 20);
      c.solid.add(k.box(0.06, 0.5, 0.36, '#9d9689', s * (W / 2 + 0.03), yc + R + 0.22, 0).applyMatrix4(m), 30);
      // a creeper hanging over the arch
      c.solid.add(k.box(0.05, 0.9, 0.5, '#4f6a55', s * (W / 2 + 0.03), yc + R - 0.1, 1.9 * s, 0, 0.2).applyMatrix4(m), false);
    }
    // stair treads
    for (let s = -L + 0.3; s <= L - 0.3; s += 0.38) {
      const y = deckY(s);
      c.solid.add(k.box(W - 0.46, 0.16, 0.4, Math.round(s / 0.38) % 2 ? '#c2bbab' : '#b8b1a1', 0, y + 0.03, s, 0, 0.05).applyMatrix4(m), 25);
    }
    // parapets: posts and panels following the hump, drum stones at the ends
    const posts: number[] = [];
    for (let s = -L + 0.5; s <= L - 0.4; s += 1.18) posts.push(s);
    for (const side of [1, -1]) {
      const x = side * (W / 2 - 0.12);
      for (const s of posts) c.solid.add(k.box(0.2, 0.78, 0.2, '#c4bdae', x, deckY(s) + 0.39, s).applyMatrix4(m), 30);
      for (let i = 1; i < posts.length; i++) {
        const s0 = posts[i - 1], s1 = posts[i];
        const y0 = deckY(s0) + 0.34, y1 = deckY(s1) + 0.34;
        const len = Math.hypot(s1 - s0, y1 - y0);
        c.solid.add(k.box(0.13, 0.46, len, '#d0c9b9', x, (y0 + y1) / 2, (s0 + s1) / 2, 0, 0.04, -Math.atan2(y1 - y0, s1 - s0)).applyMatrix4(m), 30);
      }
      for (const e of [-1, 1]) {
        const s = e * (L - 0.1);
        c.solid.add(k.box(0.24, 0.55, 0.8, '#bdb6a6', x, deckY(s) + 0.27, s).applyMatrix4(m), 30);
        c.solid.add(k.cyl(0.3, 0.3, 0.2, 12, '#c7c0b0', x, deckY(s) + 0.72, s + e * 0.12, 0, 0, Math.PI / 2).applyMatrix4(m), 30);
      }
      // colliders along the parapet
      const a = new THREE.Vector3(x, 0, -L).applyMatrix4(m), b = new THREE.Vector3(x, 0, L).applyMatrix4(m);
      k.fence(a.x, a.z, b.x, b.z, 0.2, 1.2);
    }
    // a lantern post at each end
    for (const e of [-1, 1]) {
      const p = new THREE.Vector3(W / 2 + 0.5, 0, e * (L + 0.3)).applyMatrix4(m);
      const y = gy(p.x, p.z);
      c.solid.add(k.box(0.14, 2.5, 0.14, WOODC, p.x, y + 1.25, p.z, ry), 30);
      c.solid.add(k.box(0.7, 0.1, 0.1, WOODC, p.x - n.z * 0.3, y + 2.45, p.z + n.x * 0.3, ry + Math.PI / 2), 30);
      lantern(p.x - n.z * 0.55, y + 1.95, p.z + n.x * 0.55);
      k.collider({ x: p.x, z: p.z, r: 0.2, h: 2.5 });
    }
    k.deck(segmentDeck('village-bridge', endN, endS, W / 2 - 0.25, (s) => deckY(s) + 0.11));
    k.occluder({ x: bx, z: bz, r: 2.2, y0: wy, y1: yc + R * 0.7 });
  }

  // ───────────── houses
  const houses: HouseSpec[] = [];
  let seed = 11;
  const rowHouse = (side: 1 | -1, xc: number, w: number, d: number, floors: 1 | 2, gable: 'horse' | 'plain', front: Front, sign?: number, street = side > 0 ? 3.2 : 2.6) => {
    const r = riverZ(xc), n = southNormal(xc);
    const off = r.w + street + d / 2;
    const x = xc + side * n.x * off, z = r.z + side * n.z * off;
    houses.push({ x, z, ry: headingTo(-side * n.x, -side * n.z), w, d, floors, gable, front, sign, seed: seed++ });
  };
  // south bank, west of the steps · between the steps and the bridge · east of the bridge
  rowHouse(1, -43.5, 7, 6, 2, 'horse', 'home');
  rowHouse(1, -36.2, 6.2, 5.5, 1, 'plain', 'shop', 7);
  rowHouse(1, -29.4, 6.6, 6, 2, 'horse', 'shop', 6);
  rowHouse(1, -15.8, 6, 5, 2, 'plain', 'shop', 1);
  rowHouse(1, -8.6, 6.6, 5, 1, 'horse', 'home');
  rowHouse(1, 7.4, 6.4, 6, 2, 'horse', 'shop', 9);
  rowHouse(1, 14.2, 6.4, 5.5, 1, 'plain', 'home');
  rowHouse(1, 21.2, 7, 6, 2, 'plain', 'shop', 10);
  rowHouse(1, 28.4, 6.6, 6, 1, 'horse', 'home');
  rowHouse(1, 35.2, 6.2, 6, 2, 'horse', 'shop', 11);
  // north bank
  rowHouse(-1, -40, 7, 6, 2, 'horse', 'home');
  rowHouse(-1, -32.6, 6.8, 5.5, 1, 'plain', 'shop', 3);
  rowHouse(-1, -25.2, 7, 6, 2, 'horse', 'shop', 4);
  rowHouse(-1, -17.6, 6.4, 5.5, 1, 'horse', 'home');
  rowHouse(-1, -10.4, 6.6, 6, 2, 'plain', 'shop', 8);
  rowHouse(-1, 7.2, 6.4, 6, 1, 'horse', 'home');
  rowHouse(-1, 14.4, 7, 6, 2, 'horse', 'shop', 2);
  rowHouse(-1, 21.8, 6.6, 5.5, 1, 'plain', 'home');
  rowHouse(-1, 28.6, 6.2, 6, 2, 'horse', 'wall');
  // the market's south side, facing north across the street
  const mz = ANCHORS.market.z + 8.6;
  [[-1.5, 7, 2, 'horse', 2], [6, 7, 1, 'plain', 3], [13.5, 7, 2, 'horse', 4], [21, 7, 1, 'plain', 1], [28.5, 7, 2, 'horse', 5]].forEach(([x, w, f, g, s]) => {
    houses.push({ x: x as number, z: mz, ry: Math.PI, w: w as number, d: 6, floors: f as 1 | 2, gable: g as 'horse' | 'plain', front: 'shop', sign: s as number, seed: seed++ });
  });
  // back lanes: west and east of the square
  houses.push({ x: -31.5, z: 93, ry: Math.PI / 2, w: 7, d: 6, floors: 2, gable: 'horse', front: 'home', seed: seed++ });
  houses.push({ x: -31.5, z: 102, ry: Math.PI / 2, w: 6.5, d: 6, floors: 1, gable: 'plain', front: 'home', seed: seed++ });
  houses.push({ x: -20.5, z: 104.5, ry: Math.PI, w: 7, d: 6, floors: 2, gable: 'horse', front: 'home', seed: seed++ });
  houses.push({ x: -11, z: 105.5, ry: Math.PI, w: 6, d: 5.5, floors: 1, gable: 'horse', front: 'home', seed: seed++ });
  houses.push({ x: 34, z: 80, ry: -Math.PI / 2, w: 7, d: 6, floors: 2, gable: 'horse', front: 'home', seed: seed++ });
  houses.push({ x: 34.5, z: 90.5, ry: -Math.PI / 2, w: 7, d: 6, floors: 1, gable: 'plain', front: 'home', seed: seed++ });
  // the teahouse (two storeys, flared gables) fronting the square
  const TEA = { x: ANCHORS.teahouse.x + 5.6, z: ANCHORS.teahouse.z, w: 8.6, d: 7 };
  houses.push({ x: TEA.x, z: TEA.z, ry: -Math.PI / 2, w: TEA.w, d: TEA.d, floors: 2, gable: 'plain', front: 'tea', sign: 0, seed: 99, pent: true });

  const cornerY = (h: HouseSpec) => {
    const cs = Math.cos(h.ry), sn = Math.sin(h.ry);
    let s = 0;
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) {
      const lx = (a * h.w) / 2, lz = (b * h.d) / 2;
      s += gy(h.x + lx * cs + lz * sn, h.z - lx * sn + lz * cs);
    }
    return s / 5;
  };
  const houseOut = houses.map((h) => {
    const y0 = cornerY(h);
    const out = buildHouse(k, c, h, y0, signUV);
    rectColliders(k, h.x, h.z, h.ry, h.w + 0.2, h.d + 0.2, out.eaveH, y0);
    k.clearing({ cx: h.x, cz: h.z, ax: Math.cos(h.ry), az: -Math.sin(h.ry), hl: h.w / 2 + 0.6, hw: h.d / 2 + 0.6 });
    return { h, out };
  });

  /** A point in a house's local frame, in world space. */
  const local = (i: number, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(houseOut[i].out.matrix);

  // lanterns at shop doors, water jars by the homes
  houseOut.forEach(({ h, out }, i) => {
    if (h.front === 'shop' || h.front === 'tea') {
      const p = local(i, h.w / 2 - 0.7, (h.floors === 2 ? 2.9 : out.eaveH) - 0.62, h.d / 2 + (h.floors === 2 ? 0.55 : 0.45));
      lantern(p.x, p.y, p.z);
    } else if (h.front === 'home') {
      const p = local(i, h.w / 2 - 0.55, 0, h.d / 2 + 0.45);
      const y = gy(p.x, p.z);
      c.solid.add(k.cyl(0.3, 0.24, 0.62, 10, '#3d3833', p.x, y + 0.31, p.z), 30);
      c.solid.add(k.cyl(0.31, 0.31, 0.05, 10, '#2c2825', p.x, y + 0.6, p.z), false);
    }
  });

  // ───────────── the teahouse: porch, tables, the 茶 banner, lanterns under the eaves
  {
    const ti = houseOut.length - 1;
    const { h } = houseOut[ti];
    for (let i = 0; i < 4; i++) {
      const lx = -h.w / 2 + 0.35 + (i * (h.w - 0.7)) / 3;
      const a = local(ti, lx, 0, h.d / 2 + 0.7);
      c.solid.add(k.cyl(0.1, 0.11, 2.75, 8, '#6d3d2f', a.x, a.y + 1.375 - 0.05, a.z), 30);
      if (i === 0 || i === 3) lantern(a.x, a.y + 2.25, a.z + (i === 0 ? 0.0 : 0), 1.1);
      k.collider({ x: a.x, z: a.z, r: 0.15, h: 2.7 });
    }
    // porch railing (美人靠) on the upper floor
    const b0 = local(ti, -h.w / 2 + 0.2, 3.6, h.d / 2 + 0.12), b1 = local(ti, h.w / 2 - 0.2, 3.6, h.d / 2 + 0.12);
    c.solid.add(k.beam(b0, b1, 0.1, '#5e3a2c'), 25);
    for (let i = 0; i <= 12; i++) {
      const p = b0.clone().lerp(b1, i / 12);
      c.solid.add(k.box(0.05, 0.6, 0.05, '#5e3a2c', p.x, p.y - 0.3, p.z), false);
    }
    // the banner pole at the corner by the square, a crossbar, and the fluttering 茶 flag
    const pole = local(ti, -h.w / 2 - 0.4, 0, h.d / 2 + 1.3);
    const py = gy(pole.x, pole.z);
    c.solid.add(k.cyl(0.06, 0.08, 7, 6, '#8a7250', pole.x, py + 3.5, pole.z), 30);
    c.solid.add(k.cyl(0.035, 0.035, 1.6, 5, '#8a7250', pole.x - 0.75, py + 6.7, pole.z, 0, 0, Math.PI / 2), 30);
    c.solid.add(k.cyl(0.02, 0.02, 0.4, 4, '#8a7250', pole.x - 0.1, py + 6.5, pole.z, 0, 0, 0.9), false);
    clothPiece(0.86, 2.5, '#ffffff', bannerUV(0), mat4(pole.x - 0.75, py + 6.65, pole.z));
    k.collider({ x: pole.x, z: pole.z, r: 0.15, h: 7 });
    // tables and benches in front, a teapot and cups
    for (const dz of [-2.9, 2.9]) {
      const tx = ANCHORS.teahouse.x - 2.3, tz = ANCHORS.teahouse.z + dz;
      const y = gy(tx, tz);
      c.solid.add(k.box(1.0, 0.07, 1.0, '#6a4632', tx, y + 0.78, tz), 30);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) c.solid.add(k.box(0.07, 0.76, 0.07, '#5a3b2a', tx + a * 0.42, y + 0.38, tz + b * 0.42), false);
      for (const s of [-1, 1]) {
        c.solid.add(k.box(1.0, 0.06, 0.28, '#6a4632', tx, y + 0.45, tz + s * 0.85), 30);
        c.solid.add(k.box(0.9, 0.42, 0.05, '#5a3b2a', tx, y + 0.22, tz + s * 0.85), false);
      }
      c.solid.add(k.tint(k.xf(new THREE.SphereGeometry(0.11, 10, 7), tx + 0.1, y + 0.9, tz), '#4c5a63', 0.05), false);
      c.solid.add(k.cyl(0.02, 0.02, 0.08, 5, '#4c5a63', tx + 0.22, y + 0.92, tz, 0, 0, 1.0), false);
      for (const [a, b] of [[-0.25, 0.2], [-0.2, -0.22], [0.25, -0.25]]) c.solid.add(k.cyl(0.04, 0.03, 0.05, 7, '#e8e2d4', tx + a, y + 0.84, tz + b), false);
      k.collider({ x: tx, z: tz, r: 0.9, h: 0.9 });
    }
  }

  // ───────────── the square: flagstones, the well, stone benches
  const paveRects: [number, number, number, number][] = [
    [-20, 82, 13, 93],          // the square
    [-2.6, 75, 2.6, 82],        // lane from the bridge
    [-5, 93, 35, 99],           // the market street
  ];
  for (const [a, b, cc, d] of paveRects) k.clearing(rectClearing(a, b, cc, d));
  {
    const S = 1.3;
    const x0 = -21, x1 = 36, z0 = 74.5, z1 = 99.5;
    const pos: number[] = [], col: number[] = [], lines: number[] = [];
    const inside = (x: number, z: number) => paveRects.some(([a, b, cc, d]) => x >= a && x <= cc && z >= b && z <= d);
    const cA = new THREE.Color('#c3bba9'), cB = new THREE.Color('#d2cbba'), cM = new THREE.Color('#aaa290');
    let n = 0;
    for (let z = z0; z < z1; z += S) for (let x = x0; x < x1; x += S) {
      const mx = x + S / 2, mz = z + S / 2;
      if (!inside(mx, mz)) continue;
      const off = (Math.floor(z / S) % 2) * S * 0.5; // running bond
      const xs = [x, x + S];
      const corners: V3[] = [[xs[0], 0, z], [xs[1], 0, z], [xs[1], 0, z + S], [xs[0], 0, z + S]].map(([a, , b]) => [a, gy(a, b) + 0.04, b]);
      const hh = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const col0 = cA.clone().lerp(cB, hh - Math.floor(hh)).lerp(cM, (((hh * 7) % 1) + 1) % 1 < 0.12 ? 0.6 : 0);
      for (const idx of [0, 2, 1, 0, 3, 2]) { pos.push(...corners[idx]); col.push(col0.r, col0.g, col0.b); }
      // joints (a running bond: every other row offset)
      lines.push(corners[0][0], corners[0][1] + 0.005, corners[0][2], corners[1][0], corners[1][1] + 0.005, corners[1][2]);
      const jx = x + off + S * 0.5 * ((n++ % 3) === 0 ? 1 : 0);
      if (jx < x + S) lines.push(jx, gy(jx, z) + 0.045, z, jx, gy(jx, z + S) + 0.045, z + S);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    c.solid.add(g, false);
    const jl = new THREE.BufferGeometry();
    jl.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const joints = new THREE.LineSegments(k.own(jl), k.lineMat(0.16, '#3a352d'));
    joints.name = 'village-joints';
    k.add(joints);
  }
  // the well
  {
    const wx = ANCHORS.villageSquare.x - 6, wz = ANCHORS.villageSquare.z + 6.8;
    const y = gy(wx, wz);
    c.solid.add(k.tint(k.xf(new THREE.CylinderGeometry(0.78, 0.84, 0.72, 14, 1, true), wx, y + 0.36, wz), '#aaa395', 0.05), 25);
    c.solid.add(k.tint(k.xf(new THREE.CylinderGeometry(0.6, 0.6, 0.7, 14, 1, true), wx, y + 0.36, wz).scale(1, 1, 1), '#6e695e', 0.05), false);
    c.solid.add(k.tint(k.xf(new THREE.RingGeometry(0.6, 0.84, 14).rotateX(-Math.PI / 2), wx, y + 0.72, wz), '#bab3a4', 0.05), 25);
    c.solid.add(k.tint(k.xf(new THREE.CircleGeometry(0.6, 14).rotateX(-Math.PI / 2), wx, y + 0.2, wz), '#2f3634', 0), false);
    for (const s of [-1, 1]) c.solid.add(k.box(0.12, 1.9, 0.12, WOODC, wx + s * 0.95, y + 0.95, wz), 30);
    c.solid.add(k.cyl(0.05, 0.05, 2.1, 6, WOODC, wx, y + 1.8, wz, 0, 0, Math.PI / 2), 30);
    c.solid.add(k.cyl(0.14, 0.14, 0.4, 10, '#6b5040', wx, y + 1.8, wz, 0, 0, Math.PI / 2), 30);
    c.solid.add(k.cyl(0.008, 0.008, 1.0, 3, '#3a2e25', wx, y + 1.3, wz + 0.14), false);
    c.solid.add(k.cyl(0.16, 0.13, 0.26, 9, '#6b5040', wx + 0.55, y + 0.85, wz + 0.1), 30);
    k.collider({ x: wx, z: wz, r: 1.05, h: 1.1 });
    // stone benches along the square's edges
    for (const [bx, bz, ry] of [[-19.2, 85, Math.PI / 2], [-19.2, 90, Math.PI / 2], [6.5, 82.6, 0]] as V3[]) {
      const yy = gy(bx, bz);
      c.solid.add(k.box(1.8, 0.14, 0.5, '#bdb6a6', bx, yy + 0.46, bz, ry), 30);
      for (const s of [-0.65, 0.65]) c.solid.add(k.box(0.3, 0.4, 0.44, '#aaa395', bx + Math.sin(ry + Math.PI / 2) * s, yy + 0.2, bz + Math.cos(ry + Math.PI / 2) * s, ry), 30);
      k.collider({ x: bx, z: bz, r: 0.7, h: 0.6 });
    }
  }

  // ───────────── the market: stalls with awnings, baskets, umbrellas, the 糖人 stall
  {
    const AWN = ['#3d5a73', '#a8703a', '#e2dccd', '#8c5a48', '#3d5a73', '#6d7d6a'];
    const stall = (x: number, z: number, ry: number, i: number, kind: 'produce' | 'umbrella' | 'baskets') => {
      const y = gy(x, z);
      const m = mat4(x, y, z, ry);
      const P = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
      const add = (g: T.BufferGeometry, e: number | false = 30) => c.solid.add(g.applyMatrix4(m), e);
      add(k.box(2.3, 0.08, 0.95, '#6f4d38', 0, 0.82, 0.2));
      add(k.box(2.2, 0.72, 0.06, '#5d3f2e', 0, 0.4, 0.62), 30);
      for (const [a, b] of [[-1.15, -0.45], [1.15, -0.45], [-1.15, 0.9], [1.15, 0.9]]) add(k.box(0.08, b < 0 ? 2.45 : 2.05, 0.08, '#6b5040', a, (b < 0 ? 2.45 : 2.05) / 2, b), 30);
      // the awning: tied at the back, the front edge lifting in the breeze
      const aw = new THREE.Matrix4().compose(P(0, 2.45, -0.45), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.36, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
      clothPiece(2.6, 1.75, AWN[i % AWN.length], cellUV(CELL.wall, [0.15, 0.3, 0.45, 0.6]), aw);
      if (kind === 'produce' || kind === 'baskets') {
        for (let b = 0; b < 3; b++) {
          const bx = -0.7 + b * 0.7;
          add(k.cyl(0.3, 0.22, 0.2, 10, '#a88450', bx, 0.96, 0.2), 30);
          const tone = ['#6f8a5a', '#c47a3a', '#b8a24a'][(b + i) % 3];
          for (let q = 0; q < 5; q++) add(k.tint(k.xf(new THREE.IcosahedronGeometry(0.09, 0), bx + Math.cos(q * 1.3) * 0.13, 1.08 + (q % 2) * 0.05, 0.2 + Math.sin(q * 1.3) * 0.1), tone, 0.1), false);
        }
        if (kind === 'baskets') for (let b = 0; b < 3; b++) add(k.cyl(0.26, 0.2, 0.36, 10, '#b09060', -0.9 + b * 0.9, 0.18, 1.05), 30);
      } else {
        const cols = ['#b5503f', '#c9a256', '#3d5a73'];
        for (let u = 0; u < 3; u++) {
          const ux = -0.75 + u * 0.75;
          const cone = new THREE.ConeGeometry(0.62, 0.26, 16, 1, true);
          add(k.tint(k.xf(cone, ux, 1.45 + (u % 2) * 0.12, 0.25, 0, -0.9 + u * 0.1, 0), cols[u], 0.06), 8);
          add(k.cyl(0.012, 0.012, 0.9, 3, '#3a2e25', ux, 1.05, 0.25 - 0.05, -0.9 + u * 0.1), false);
        }
      }
      lantern(P(1.0, 2.0, 0.85).x, P(1.0, 2.0, 0.85).y, P(1.0, 2.0, 0.85).z, 0.85);
      const cc = P(0, 0, 0.2);
      k.collider({ x: cc.x, z: cc.z, r: 1.1, h: 2.4 });
    };
    const sz = ANCHORS.market.z + 3.9;
    stall(-1, sz, Math.PI, 0, 'produce');
    stall(5.5, sz, Math.PI, 1, 'baskets');
    stall(14.5, sz, Math.PI, 2, 'produce');
    stall(21, sz, Math.PI, 3, 'baskets');
    stall(27.5, sz, Math.PI, 4, 'produce');
    const nz = ANCHORS.market.z - 3.3;
    stall(-1.5, nz, 0, 5, 'umbrella');
    // 糖人: a carrying-pole stand with a straw target bristling with sugar figures
    {
      const x = 5, z = nz, y = gy(x, z);
      c.solid.add(k.box(0.7, 0.8, 0.5, '#6f4d38', x, y + 0.4, z), 30);
      c.solid.add(k.box(0.74, 0.06, 0.54, '#5a3b2a', x, y + 0.82, z), 30);
      c.solid.add(k.cyl(0.03, 0.03, 1.3, 5, '#8a7250', x, y + 1.45, z), 30);
      c.solid.add(k.cyl(0.17, 0.15, 0.62, 9, '#c7a766', x, y + 2.1, z), 30);
      for (let q = 0; q < 9; q++) {
        const a = q * 0.71, hh = 1.9 + (q % 3) * 0.16;
        const fx = x + Math.cos(a) * 0.3, fz = z + Math.sin(a) * 0.3;
        c.solid.add(k.cyl(0.006, 0.006, 0.26, 3, '#d8c9a0', x + Math.cos(a) * 0.2, y + hh - 0.05, z + Math.sin(a) * 0.2, 0, -a, Math.PI / 2 - 0.3), false);
        c.solid.add(k.tint(k.xf(new THREE.SphereGeometry(0.075, 7, 5), fx, y + hh + 0.06, fz, 0, 0, 0, 1, 1.3, 0.35), '#d99a2e', 0.08), false);
      }
      // brazier and sugar pot, a stool
      c.solid.add(k.cyl(0.2, 0.16, 0.34, 10, '#3a3531', x + 0.8, y + 0.17, z), 30);
      c.solid.add(k.cyl(0.14, 0.14, 0.08, 10, '#5c4a38', x + 0.8, y + 0.38, z), false);
      c.solid.add(k.box(0.35, 0.3, 0.3, '#6f4d38', x - 0.7, y + 0.15, z + 0.4), 30);
      const fp = { x: x - 0.45, z: z - 0.3 };
      c.solid.add(k.cyl(0.018, 0.018, 1.9, 4, '#8a7250', fp.x, y + 0.95, fp.z), false);
      clothPiece(0.34, 0.9, '#ffffff', bannerUV(3), mat4(fp.x + 0.19, y + 1.85, fp.z), 'bottom');
      k.collider({ x, z, r: 0.8, h: 2.3 });
    }
  }

  // ───────────── the memorial archway (牌坊) where the path from the garden meets the town
  {
    const px = -1.35, pz = 51.5;
    const ry = headingTo(-0.11, 0.99);
    const y = gy(px, pz);
    const m = mat4(px, y, pz, ry);
    const add = (g: T.BufferGeometry, e: number | false = 30) => c.solid.add(g.applyMatrix4(m), e);
    const P = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
    const PIL = '#c3bcac';
    for (const [x, hgt] of [[-3.7, 4.3], [-1.75, 5.3], [1.75, 5.3], [3.7, 4.3]]) {
      add(k.box(0.44, hgt, 0.44, PIL, x, hgt / 2, 0));
      add(k.box(0.62, 0.3, 0.62, '#b1aa9a', x, 0.15, 0));
      for (const s of [-1, 1]) {
        add(k.box(0.34, 0.9, 0.7, '#b6af9f', x, 0.45, s * 0.55));
        add(k.cyl(0.32, 0.32, 0.26, 12, '#bdb6a6', x, 1.0, s * 0.6, 0, 0, Math.PI / 2));
      }
      const w = P(x, 0, 0);
      k.collider({ x: w.x, z: w.z, r: 0.42, h: hgt });
    }
    add(k.box(3.9, 0.36, 0.34, '#bab3a3', 0, 4.55, 0));
    add(k.box(3.9, 0.28, 0.3, '#bab3a3', 0, 3.55, 0));
    add(k.box(1.6, 0.26, 0.3, '#bab3a3', -2.72, 3.55, 0));
    add(k.box(1.6, 0.26, 0.3, '#bab3a3', 2.72, 3.55, 0));
    add(k.box(0.3, 0.7, 0.26, '#b1aa9a', -0.9, 4.05, 0));
    add(k.box(0.3, 0.7, 0.26, '#b1aa9a', 0.9, 4.05, 0));
    // plaque on both faces
    const pq = new Quads();
    for (const s of [1, -1]) {
      const z = s * 0.16, [x0, x1] = s > 0 ? [-0.72, 0.72] : [0.72, -0.72];
      pq.quad([x0, 3.73, z], [x1, 3.73, z], [x1, 4.37, z], [x0, 4.37, z], stripUV(0));
    }
    c.walls.add(pq.geometry(k).applyMatrix4(m), false);
    // three little tiled roofs with flying corners
    const roofAt = (cx: number, ey: number, ry2: number, Lx: number) => {
      const rf = gableRoof(k, { Lx, D: 0.72, eaveY: ey, ridgeY: ry2, lift: 0.34, U: 8, V: 4 }, 31);
      rf.geo.translate(cx, 0, 0);
      c.roofs.add(rf.geo.applyMatrix4(m), false);
      c.roofs.lines(xfLines(k, rf.lines.map((v, i) => (i % 3 === 0 ? v + cx : v)), m));
      add(k.box(Lx * 2 + 0.1, 0.2, 0.22, RIDGE, cx, ry2 + 0.06, 0));
      for (const s of [-1, 1]) add(k.box(0.45, 0.16, 0.2, RIDGE, cx + s * (Lx + 0.1), ry2 + 0.2, 0, 0, 0, 0, s * 0.6));
    };
    roofAt(0, 4.95, 5.55, 2.35);
    roofAt(-2.72, 3.85, 4.3, 1.1);
    roofAt(2.72, 3.85, 4.3, 1.1);
  }

  // ───────────── boats: 乌篷船 moored along the quays (instanced, bobbing)
  {
    const hull = boatGeometry(k);
    const spots: [number, 1 | -1, number][] = [[-37.5, 1, 0.1], [-11.5, 1, 3.1], [12.5, 1, 0.05], [27, 1, 3.2], [-28, -1, 0.02], [17, -1, 3.1], [-44, -1, 3.2]];
    const im = new THREE.InstancedMesh(hull, bob(k.toon('#ffffff', { vertexColors: true }), k.time, 0.035, 'boat'), spots.length);
    const outline = new THREE.InstancedMesh(hull, bob(k.own(new THREE.MeshBasicMaterial({ color: '#1b1916', side: THREE.BackSide })), k.time, 0.035, 'boat-ol', 0.03), spots.length);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), mm = new THREE.Matrix4();
    spots.forEach(([x, side, turn], i) => {
      const r = riverZ(x), n = southNormal(x);
      const off = r.w - 1.25;
      const px = x + side * n.x * off, pz = r.z + side * n.z * off;
      e.set(0, Math.atan2(r.tx, r.tz) + turn, 0);
      q.setFromEuler(e);
      mm.compose(new THREE.Vector3(px, riverY(x) - 0.06, pz), q, s);
      im.setMatrixAt(i, mm);
      outline.setMatrixAt(i, mm);
      // a mooring rope to the quay
      const qx = x + side * n.x * (r.w + 0.1), qz = r.z + side * n.z * (r.w + 0.1);
      const bow = new THREE.Vector3(0, 0.45, 2.6 * (Math.abs(turn) > 1 ? -1 : 1)).applyQuaternion(q).add(new THREE.Vector3(px, riverY(x), pz));
      c.solid.add(k.beam(bow, { x: qx, y: riverY(x) + 0.75, z: qz }, 0.025, '#6b5a44', true), false);
    });
    im.name = 'village-boats';
    outline.name = 'village-boats-outline';
    im.computeBoundingSphere();
    outline.computeBoundingSphere();
    k.add(im);
    k.add(outline);
  }

  // ───────────── laundry: bamboo poles out of upper windows, and a line in the back yard
  {
    const COL = ['#f1ece0', '#3d5a73', '#e6dcc4', '#a8703a', '#46607a', '#f1ece0'];
    let ci = 0;
    const pole = (a: T.Vector3, b: T.Vector3, pieces: number) => {
      c.solid.add(k.beam(a, b, 0.05, '#9a8458', true), false);
      for (let i = 0; i < pieces; i++) {
        const t = (i + 0.6) / (pieces + 0.4);
        const p = a.clone().lerp(b, t);
        const ry = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
        const w = 0.5 + ((i * 7) % 3) * 0.12, hgt = 0.7 + ((i * 5) % 4) * 0.18;
        clothPiece(w, hgt, COL[ci++ % COL.length], cellUV(CELL.wall, [0.15, 0.3, 0.45, 0.6]), mat4(p.x, p.y - 0.02, p.z, ry));
      }
    };
    for (const hi of [0, 5, 12, 7]) {
      const { h } = houseOut[hi];
      if (h.floors !== 2) continue;
      const a = local(hi, h.w * 0.15, 4.25, h.d / 2), b = local(hi, h.w * 0.15 + 0.3, 4.55, h.d / 2 + 2.3);
      pole(a, b, 3);
    }
    // back yard: two posts and a line between the west lane and the square
    const a0 = { x: -27.2, z: 88.4 }, b0 = { x: -21.2, z: 88.1 };
    for (const p of [a0, b0]) {
      const y = gy(p.x, p.z);
      c.solid.add(k.cyl(0.05, 0.06, 2.3, 6, '#8a7250', p.x, y + 1.15, p.z), 30);
      k.collider({ x: p.x, z: p.z, r: 0.12, h: 2.3 });
    }
    pole(new THREE.Vector3(a0.x, gy(a0.x, a0.z) + 2.15, a0.z), new THREE.Vector3(b0.x, gy(b0.x, b0.z) + 2.15, b0.z), 5);
  }

  // ───────────── painted flats: willows over the water, bamboo in the lanes
  {
    const wd = willowDrawing(1717, 1);
    const wc = rasterize(wd, 1, 256 / wd.width);
    const bd = plantDrawing({ kind: 'bamboo', seed: 4242, height: 360 });
    const bc = rasterize(bd, 1, Math.min(256 / bd.width, 256 / bd.height));
    const pk = packAtlas([{ c: wc, slot: [0, 0, 256, 512] }, { c: bc, slot: [256, 0, 256, 256] }]);
    const tex = k.canvasTex(pk.canvas);
    const [wuv, buv] = pk.uv;
    const flip = (uv: [number, number, number, number]): [number, number, number, number] => [uv[2], uv[1], uv[0], uv[3]];
    const willow = (x: number, z: number, hgt: number, mirror: boolean) => {
      const y = gy(x, z);
      flats.push({ x, y: y - 0.1, z, w: hgt * 0.5, h: hgt, ax: mirror ? 1 - wd.anchor.x / wd.width : wd.anchor.x / wd.width, uv: mirror ? flip(wuv) : wuv, sway: 0.35 });
      k.collider({ x, z, r: 0.35, h: 3 });
    };
    willow(-25.2, riverZ(-25.2).z + 5.6, 8.5, false);
    willow(-13.2, riverZ(-13.2).z - 5.4, 7.6, true);
    willow(31.6, riverZ(31.6).z + 5.2, 8, true);
    willow(-47, riverZ(-47).z - 5.6, 8.8, false);
    willow(3.6, riverZ(3.6).z - 5.3, 7.2, false);
    const bamboo = (x: number, z: number, hgt: number, mirror = false) => {
      flats.push({ x, y: gy(x, z) - 0.05, z, w: hgt * (bd.width / bd.height), h: hgt, ax: bd.anchor.x / bd.width, uv: mirror ? flip(buv) : buv, sway: 0.18 });
    };
    bamboo(-26.8, 97.5, 4.2);
    bamboo(-24.8, 99.4, 3.4, true);
    bamboo(38.5, 85.5, 4.6);
    bamboo(-44, 86.4, 4.0, true);
    bamboo(-6.8, 108.8, 3.6);
    k.add(flatsMesh(k, tex, flats, 'village-flats'));
  }

  // ───────────── merge, add, and light up at night
  const walls = c.walls.mesh(wallMat, 'village-walls');
  const wallEdges = c.walls.edges(lineMat, 'village-wall-ink');
  const solid = c.solid.mesh(solidMat, 'village-solid');
  const solidEdges = c.solid.edges(lineMat, 'village-ink');
  const roofs = c.roofs.mesh(roofMat, 'village-roofs');
  const roofLines = c.roofs.edges(tileLineMat, 'village-tiles');
  const clothMesh = cloth.mesh(clothMat, 'village-cloth');
  for (const o of [walls, wallEdges, solid, solidEdges, roofs, roofLines, clothMesh]) if (o) k.add(o);

  const lanternMat = k.toon('#ffffff', { vertexColors: true, emissive: '#000000' });
  if (lanternGeos.length) {
    const lp = new Parts(k);
    lp.addAll(lanternGeos, false);
    const lm = lp.mesh(lanternMat, 'village-lanterns');
    if (lm) k.add(lm);
  }
  // glows: one Points cloud, visible at night
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const g2 = gc.getContext('2d')!;
  const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grd;
  g2.fillRect(0, 0, 64, 64);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(lanternAt.flat(), 3));
  const glowMat = k.own(new THREE.PointsMaterial({ map: k.canvasTex(gc), color: '#ffc47a', size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const glows = new THREE.Points(k.own(pg), glowMat);
  glows.name = 'village-glows';
  glows.visible = false;
  k.add(glows);

  const warm = new THREE.Color('#ffb868');
  let night = ctx.sky.isNight() ? 1 : 0;
  k.frame((dt, t) => {
    const target = ctx.sky.isNight() ? 1 : 0;
    night += (target - night) * Math.min(1, dt * 1.5);
    const flick = 0.9 + 0.1 * Math.sin(t * 7.1) * Math.sin(t * 2.9 + 1.3);
    wallMat.emissive.copy(warm).multiplyScalar(0.62 * night * flick);
    lanternMat.emissive.setRGB(0.6 * night * flick, 0.22 * night * flick, 0.08 * night);
    glowMat.opacity = 0.6 * night;
    glows.visible = night > 0.02;
  });
}

/** A 乌篷船: a long shallow hull with upswept ends and black arched mat awnings. Local: length along z. */
function boatGeometry(k: Kit): T.BufferGeometry {
  const THREE = k.T;
  const parts: T.BufferGeometry[] = [];
  const Lh = 3.1, NZ = 16, NA = 8;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NZ; i++) {
    const z = -Lh + (2 * Lh * i) / NZ;
    const t = z / Lh;
    const b = 0.72 * Math.pow(Math.max(0, 1 - t * t), 0.55) + 0.04;
    const top = 0.32 + 0.32 * Math.pow(Math.abs(t), 4);
    const keel = -0.22 + 0.2 * Math.pow(Math.abs(t), 3);
    for (let j = 0; j <= NA; j++) {
      const a = Math.PI * (j / NA); // 0 → starboard gunwale, π → port gunwale
      const x = Math.cos(a) * b;
      const y = keel + (top - keel) * (1 - Math.sin(a)) ** 0.8;
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b2 = a + 1, cc = a + NA + 1, d = cc + 1;
    idx.push(a, cc, b2, b2, cc, d);
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  parts.push(k.tint(hg, '#4a3a2f', 0.08, 3));
  // floor boards and a gunwale stripe
  parts.push(k.box(1.1, 0.05, 4.4, '#7a5e45', 0, 0.2, 0, 0, 0.1));
  // awnings: two black mat arches and a lower one at the stern
  for (const [z, len, r] of [[-0.3, 1.3, 0.66], [1.05, 1.1, 0.62], [-1.55, 0.8, 0.5]]) {
    const g = new THREE.CylinderGeometry(r, r, len, 12, 1, false, Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.28, z);
    parts.push(k.tint(g, '#2a2724', 0.12, 9));
  }
  // the scull at the stern, a bamboo pole along the side
  parts.push(k.box(0.08, 0.05, 2.2, '#8a6a48', 0.1, 0.5, -3.4, 0.1, 0.05, -0.25));
  parts.push(k.cyl(0.025, 0.025, 4.2, 5, '#a08a5a', 0.55, 0.45, 0.3, Math.PI / 2 - 0.05));
  const merged = new Parts(k);
  merged.addAll(parts, false);
  return merged.geometry()!;
}
