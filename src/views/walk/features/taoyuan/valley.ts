// 桃源 · the valley itself: the floor with its terraces and stream, the inner slopes and the ring of
// blue-green hills (青绿山水) with mist at their waists, the cloud sea below, the peach banks, the
// houses (the Sang house and its silk room, 杜二's brewery and cellar, 鲁三's workshop, the elder's
// house, 石瞽's hut), the festival square with its 花神杆 and long tables and the cup channel, the
// shrine with its walled courtyard and a hall whose door opens and shuts, the old 碧桃 on its knoll,
// the spring under the north cliff, the pavilion 不出亭, the fields, ponds and coops.
//
// Built once, on the first way in (behind the veil), into ctx.regionGroup('taoyuan') through a Hill
// (hill-kit.ts), which gives back every collider, occluder and deck with the world. Static scenery is
// merged per material; the peaches are instanced. The floor is a deck (regions/water-decks.ts) that is
// registered only while the walker is inside: the open country far below keeps its own ground.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { Batch, COL, Hill, TAU, hipRoof, place, plaqueCanvas, rockGeometry, roof, stairs, steleCanvas, taperTube } from '../../regions/hill-kit';
import { registerDeck, type Deck } from '../../regions/water-decks';
import { makeNoise2, makeRng, type Rng } from '../../../../core/rng';
import {
  CAVE, CHANNEL, CROSSINGS, FLOOR_R, G, KNOLL, PAVILION, PONDS, RING, SHRINE, SPRING, SQUARE, STREAM, STREAM_LEN, Y_T, LANE_LANTERNS,
  cleftHalf, floorAt, pathDist, polyAt, standAt, streamAt, surfaceAt, walkAt, waterAt, type XZ,
} from './places';

type BG = T.BufferGeometry;

export interface Valley {
  hill: Hill;
  /** Register (true) or take away (false) the valley's floor: registered only while the walker is inside. */
  setFloor(on: boolean): void;
  readonly floorOn: boolean;
  /** The shrine hall's door: open or shut (a collider stops the doorway while shut). */
  shrineDoor(open: boolean, instant?: boolean): void;
  readonly doorOpen: boolean;
  /** The lane lanterns (lit one by one at 戌). */
  lanterns: { count: number; light(i: number, on: boolean): void; all(on: boolean, staggerMs?: number): void; lit(i: number): boolean };
  /** The cleft's rock material (FX14 washes its colour). */
  caveMat: T.MeshToonMaterial;
  /** The water's material (it darkens with the night; the case tints it). */
  waterMat: T.MeshBasicMaterial;
  /** World heights (the floor as walked, and the drawn surface) at a world point. */
  standY(x: number, z: number): number;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** Build the valley (once). `density` scales the trees on the slopes; the banks are always whole. */
export function buildValley(ctx: WorldCtx): Valley {
  const h = new Hill(ctx, 'taoyuan');
  const TH = h.THREE;
  h.group.name = 'region:taoyuan:valley';
  const root = h.group;
  root.position.set(G.x, Y_T, G.z);
  root.userData.pocket = true;
  const rng = makeRng(8801);
  const noise = makeNoise2(3307);
  const density = ctx.quality.density;
  const low = ctx.quality.level === 'low';

  // ── the floor (a deck: registered only while inside)
  const deck: Deck = {
    id: 'taoyuan:floor', cx: G.x, cz: G.z, ax: 1, az: 0, hl: RING.outer + 18, hw: RING.outer + 18,
    y: () => Y_T,
    yAt(x, z) {
      const u = x - G.x, v = z - G.z;
      const r = Math.hypot(u, v);
      if (r > RING.outer + 17) return null;
      // in the cleft the camera keeps to the planks (the walls keep it in, not the rock's height)
      if (v > CAVE.mouth + 1 && Math.abs(u) < cleftHalf(v) + 7) return Y_T + standAt(u, v);
      const s = standAt(u, v);
      return Y_T + (r < FLOOR_R - 0.5 ? s : Math.max(s, surfaceAt(u, v)));
    },
    walk: (x, z) => walkAt(x - G.x, z - G.z),
    water: (x, z) => { const w = waterAt(x - G.x, z - G.z); return w === null ? null : Y_T + w; },
  };
  // (registered at once: the builders below read the ground here; the caller takes it away if the walker is not inside)
  let offDeck: (() => void) | null = registerDeck(deck);

  const b = new Batch();
  const ph = (x: number, z: number) => floorAt(x, z); // local floor height

  // ── the floor mesh: a grid over the floor disc, painted: grass, packed earth, paths, fallen petals
  {
    const S = 0.6, R = FLOOR_R + 1.2, n = Math.ceil((R * 2) / S) + 1;
    const pos: number[] = [], col: number[] = [];
    const cGrass = new TH.Color('#9db566'), cWarm = new TH.Color('#c6c77a'), cDeep = new TH.Color('#7b9a57');
    const cPath = new TH.Color('#c9a877'), cEarth = new TH.Color('#d1b98f'), cPetal = new TH.Color('#eab4bf'), cBed = new TH.Color('#7c8d74');
    const cStone = new TH.Color('#c4bba8'), cField = new TH.Color('#b4d06c'), cRow = new TH.Color('#8fb35a');
    const tmp = new TH.Color();
    const vert = (x: number, z: number) => {
      const y = ph(x, z);
      pos.push(x, y, z);
      const n1 = noise(x * 0.09, z * 0.09), n2 = noise(x * 0.5 + 9, z * 0.5 - 3);
      tmp.copy(cGrass).lerp(cWarm, clamp(0.35 + n1 * 0.6, 0, 1)).lerp(cDeep, clamp(-n2 * 0.5, 0, 0.4));
      // fields: rows of young rice
      if (z > 20 && Math.abs(x) > 17 && Math.abs(x) < 33) tmp.copy(cField).lerp(cRow, (Math.sin(z * 5.2) * 0.5 + 0.5) * 0.6);
      const st = streamAt(x, z);
      if (!st.inCleft) tmp.lerp(cBed, smooth(st.hw + 0.5, st.hw - 0.2, st.d));
      const dp = pathDist(x, z);
      tmp.lerp(cPath, smooth(1.25, 0.6, dp) * 0.9);
      tmp.lerp(cEarth, smooth(SQUARE.r + 0.8, SQUARE.r - 0.4, Math.hypot(x - SQUARE.x, z - SQUARE.z)));
      // the shrine's paving
      if (Math.abs(x) < SHRINE.wallX && z < SHRINE.south && z > SHRINE.hall.z1 - 0.2) tmp.lerp(cStone, 0.85);
      // fallen petals, thicker under the banks' trees
      const bank = smooth(8, 2, st.d) * smooth(8, 14, z) * smooth(38, 30, z);
      const speck = (Math.sin(x * 13.1 + z * 7.7) * Math.sin(x * 5.3 - z * 11.9) + 1) * 0.5;
      tmp.lerp(cPetal, clamp((speck - 0.55) * 1.6 + bank * 0.35 + n2 * 0.1, 0, 0.55));
      col.push(tmp.r, tmp.g, tmp.b);
    };
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const x0 = -R + i * S, z0 = -R + j * S, x1 = x0 + S, z1 = z0 + S;
        const cx = x0 + S / 2, cz = z0 + S / 2;
        if (Math.hypot(cx, cz) > R) continue;
        if (cz > CAVE.mouth + 1.8) continue;
        const quad: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]];
        for (const [x, z] of quad) vert(x, z);
      }
    }
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new TH.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new TH.Mesh(g, h.toon('#ffffff', { vc: true }));
    m.name = 'taoyuan:floor';
    m.receiveShadow = true;
    h.add(m);
  }

  // ── the inner slopes, the ring of hills and the outer skirt (one mesh), and the cleft's rock
  const caveMat = h.toon('#ffffff', { vc: true, side: TH.DoubleSide });
  {
    const segA = low ? 120 : 180;
    const radii = [36, 38.5, 40.5, 42, 43.5, 45.5, 47.5, 50, 52.5, 55, 57, 58.5, 60, 62, 64.5, 67, 70, 74, 80, 86];
    const pos: number[] = [], col: number[] = [];
    const cLow = new TH.Color('#86a35c'), cMid = new TH.Color('#5c957e'), cBlue = new TH.Color('#4b8396'), cHigh = new TH.Color('#9bb9ae');
    const cMist = new TH.Color('#e9e4d6'), cRock = new TH.Color('#9c8566'), cInk = new TH.Color('#3a3f3a');
    const tmp = new TH.Color();
    const P = (i: number, j: number) => {
      const a = (i / segA) * TAU;
      const r = radii[j];
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return { x, z, y: surfaceAt(x, z), a, r };
    };
    const colour = (p: { x: number; z: number; y: number; a: number; r: number }) => {
      const n1 = noise(p.x * 0.07 + 3, p.z * 0.07), n2 = noise(p.x * 0.3, p.z * 0.3 + 7);
      const k = clamp(p.y / 44, 0, 1);
      tmp.copy(cLow).lerp(cMid, smooth(0.08, 0.35, k)).lerp(cBlue, smooth(0.35, 0.62, k) * (0.6 + n1 * 0.4)).lerp(cHigh, smooth(0.62, 0.86, k)).lerp(cMist, smooth(0.8, 1.0, k) * 0.85);
      // the north cliff: warm rock, inked
      const north = Math.exp(-((Math.atan2(Math.sin(p.a + Math.PI / 2), Math.cos(p.a + Math.PI / 2)) / 0.5) ** 2));
      tmp.lerp(cRock, north * smooth(0.05, 0.3, k) * 0.7);
      // 皴: dark wrinkles down the faces
      tmp.lerp(cInk, clamp((n2 - 0.35) * 0.9, 0, 0.35) * smooth(0.1, 0.4, k));
      // below the outer crest: into the clouds
      if (p.r > RING.outer) tmp.lerp(cMist, smooth(RING.outer, 84, p.r) * 0.8);
      return tmp;
    };
    for (let i = 0; i < segA; i++) {
      for (let j = 0; j < radii.length - 1; j++) {
        const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
        // the cleft's own patch covers the south
        const cx = (q[0].x + q[2].x) / 2, cz = (q[0].z + q[2].z) / 2;
        if (cz > CAVE.mouth - 5 && Math.abs(cx) < 8.2 && cz < 78) continue;
        for (const k of [0, 2, 1, 0, 3, 2]) {
          const p = q[k];
          pos.push(p.x, p.y, p.z);
          const c = colour(p);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new TH.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new TH.Mesh(g, h.toon('#ffffff', { vc: true, side: TH.DoubleSide }));
    m.name = 'taoyuan:ring';
    m.userData.noShadow = true;
    h.add(m);

    // the cleft: a finer patch where the ring is cut through (walls, a sliver of sky above)
    const cpos: number[] = [], ccol: number[] = [];
    const xs: number[] = [];
    for (let x = -9; x <= 9.001; x += Math.abs(x) < 2.6 ? 0.18 : 0.6) xs.push(+x.toFixed(3));
    const zs: number[] = [];
    for (let z = CAVE.mouth - 6; z <= 80; z += z < CAVE.end + 1 ? 0.5 : 1.5) zs.push(z);
    const cWall = new TH.Color('#5d574e'), cMoss = new TH.Color('#6e8c5f'), cDamp = new TH.Color('#3e4a44');
    const cv = (x: number, z: number) => {
      const y = surfaceAt(x, z);
      cpos.push(x, y, z);
      const hw = cleftHalf(z);
      const inWall = Math.abs(x) > hw - 0.05;
      const hgt = y - standAt(0, Math.min(z, CAVE.start));
      tmp.copy(inWall ? cWall : cDamp);
      if (inWall) tmp.lerp(cMoss, smooth(6, 16, hgt) * 0.7 + clamp(noise(x * 0.8, z * 0.5) * 0.3, 0, 0.3)).lerp(cInk, clamp(noise(z * 0.9, y * 0.4) - 0.2, 0, 0.4));
      // up on the ring: the same washes as the hills
      if (hgt > 18 || z < CAVE.mouth - 2) { const r = Math.hypot(x, z); tmp.lerp(colour({ x, z, y, a: Math.atan2(z, x), r }), smooth(14, 24, hgt) + (z < CAVE.mouth - 2 ? 1 : 0)); }
      ccol.push(tmp.r, tmp.g, tmp.b);
    };
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
        for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]] as [number, number][]) cv(x, z);
      }
    }
    const cg = new TH.BufferGeometry();
    cg.setAttribute('position', new TH.Float32BufferAttribute(cpos, 3));
    cg.setAttribute('color', new TH.Float32BufferAttribute(ccol, 3));
    cg.computeVertexNormals();
    const cm = new TH.Mesh(cg, caveMat);
    cm.name = 'taoyuan:cleft';
    cm.userData.noShadow = true;
    h.add(cm);
  }

  // the underside (closed: never a void from below) and the cloud sea round the ring
  {
    const under = new TH.Mesh(new TH.CircleGeometry(92, 48).rotateX(Math.PI / 2), h.nightShade(h.own(new TH.MeshBasicMaterial({ color: '#b9b3a6' }))));
    under.position.y = -30.5;
    under.name = 'taoyuan:under';
    h.add(under);
    const cloudTex = h.tex(cloudCanvas(512, 7), { repeat: true });
    cloudTex.repeat.set(3, 3);
    const seaMat = h.nightShade(h.own(new TH.MeshBasicMaterial({ color: '#f3ebe0', map: cloudTex, transparent: true, opacity: 0.94, depthWrite: false })));
    const sea = new TH.Mesh(new TH.RingGeometry(50, 190, 64, 1).rotateX(-Math.PI / 2), seaMat);
    sea.position.y = -12;
    sea.renderOrder = -2;
    sea.name = 'taoyuan:cloudsea';
    h.add(sea);
    let tt = 0;
    h.frame((dt) => { tt += dt; cloudTex.offset.set(tt * 0.004, tt * 0.0025); });
    // a belt of mist at the hills' waist (云腰), soft at its edges, drifting
    const mistTex = h.tex(mistBandCanvas(1024, 128), { repeat: true });
    mistTex.repeat.set(4, 1);
    const mistMat = h.own(new TH.MeshBasicMaterial({ map: mistTex, color: '#fbf6ee', transparent: true, opacity: 0.55, depthWrite: false, side: TH.DoubleSide, fog: false }));
    const band = new TH.Mesh(new TH.CylinderGeometry(49, 51, 12, 72, 1, true), mistMat);
    band.position.y = 21;
    band.renderOrder = 3;
    band.name = 'taoyuan:mistbelt';
    h.add(band);
    h.frame((dt) => { mistTex.offset.x += dt * 0.003; });
  }

  // ── the water: the stream (a ribbon along its line), the spring, the ponds, the cup channel
  const waterTex = h.tex(waterCanvas(64, 256), { repeat: true });
  const waterMat = h.nightShade(h.own(new TH.MeshBasicMaterial({ color: '#b9dccb', map: waterTex, transparent: true, opacity: 0.86, depthWrite: false, side: TH.DoubleSide })));
  {
    const pos: number[] = [], uv: number[] = [];
    const ribbon = (pts: [number, number][], hwOf: (s: number, x: number, z: number) => number, yOf: (x: number, z: number) => number, step = 0.8) => {
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const n = Math.max(2, Math.ceil(L / step));
      let prev: number[] | null = null;
      for (let k = 0; k <= n; k++) {
        const s = (k / n) * L;
        const p = polyAt(pts, s);
        const hw = hwOf(s, p.x, p.z);
        const y = yOf(p.x, p.z);
        const nx = -p.dz, nz = p.dx;
        const row = [p.x + nx * hw, y, p.z + nz * hw, p.x - nx * hw, y, p.z - nz * hw, s / 3];
        if (prev) {
          const [ax, ay, az, bx, by, bz, av] = prev;
          const [cx, cy, cz, dx, dy, dz, cvv] = row;
          pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, bx, by, bz, dx, dy, dz, cx, cy, cz);
          uv.push(0, av, 1, av, 0, cvv, 1, av, 1, cvv, 0, cvv);
        }
        prev = row;
      }
    };
    const inValley = STREAM.filter((p) => p[1] <= CAVE.mouth + 4);
    ribbon(inValley, (_s, x, z) => streamAt(x, z).hw + 0.12, (x, z) => (waterAt(x, z) ?? floorAt(x, z)));
    ribbon([[0.36, CAVE.mouth + 3.8], [0.36, CAVE.end + 0.5]], () => 0.36, (_x, z) => standAt(0, z) - 0.22);
    ribbon(CHANNEL, () => 0.2, (x, z) => floorAt(x, z) + 0.12, 0.5);
    const disc = (cx: number, cz: number, r: number, y: number) => {
      const seg = 28;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        pos.push(cx, y, cz, cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r, cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r);
        uv.push(0.5, 0.5, 0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5, 0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5);
      }
    };
    disc(SPRING.x, SPRING.z, SPRING.r + 0.15, waterAt(SPRING.x, SPRING.z) ?? 0);
    for (const p of PONDS) disc(p.x, p.z, p.r + 0.2, waterAt(p.x, p.z) ?? 0);
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new TH.Float32BufferAttribute(uv, 2));
    const m = new TH.Mesh(g, waterMat);
    m.renderOrder = 1;
    m.name = 'taoyuan:water';
    h.add(m);
    h.frame((dt) => { waterTex.offset.y -= dt * 0.12; });
    // the spring glows from below (a soft disc of light)
    const glowMat = h.own(new TH.MeshBasicMaterial({ map: h.tex(glowDisc(128)), color: '#fff1c6', transparent: true, opacity: 0.55, depthWrite: false, blending: TH.AdditiveBlending, fog: false }));
    const glow = new TH.Mesh(new TH.CircleGeometry(SPRING.r * 1.25, 32).rotateX(-Math.PI / 2), glowMat);
    glow.position.set(SPRING.x, (waterAt(SPRING.x, SPRING.z) ?? 0) + 0.02, SPRING.z);
    glow.renderOrder = 2;
    glow.name = 'taoyuan:springglow';
    h.add(glow);
    h.frame((_dt, t) => { glowMat.opacity = (0.4 + 0.12 * Math.sin(t * 0.9)) * (1 - 0.3 * h.night); });
  }

  // ── colliders: circles along walls and round footprints
  const solid = (x: number, z: number, r: number, hgt = 2) => h.collide({ x: G.x + x, z: G.z + z, r, h: hgt });
  const wallLine = (ax: number, az: number, bx: number, bz: number, hgt: number, gap?: { x: number; z: number; w: number }) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.45));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      if (gap && Math.hypot(x - gap.x, z - gap.z) < gap.w / 2 + 0.25) continue;
      solid(x, z, 0.26, hgt);
    }
  };
  // ── buildings (merged): walls, timber, roofs
  const Y = (x: number, z: number) => ph(x, z);
  /** A cottage: whitewashed walls on a stone plinth, timber corners, a door, windows, a hip roof of tile or thatch. */
  const cottage = (x: number, z: number, ry: number, w: number, d: number, wallH: number, o: { roof?: 'tile' | 'thatch'; door?: 'front' | 'none'; porch?: boolean; lit?: boolean } = {}) => {
    const base = Math.min(Y(x - w / 2, z - d / 2), Y(x + w / 2, z + d / 2), Y(x, z)) - 0.05;
    const top = Math.max(Y(x - w / 2, z - d / 2), Y(x + w / 2, z + d / 2), Y(x, z)) + 0.18;
    b.add(place(new TH.BoxGeometry(w + 0.3, top - base + 0.3, d + 0.3), x, base + (top - base) / 2 - 0.12, z, ry), COL.stoneMid, { edge: 30, jitter: 0.05 });
    b.add(place(new TH.BoxGeometry(w, wallH, d), x, top + wallH / 2, z, ry), COL.whitewash, { edge: 30, jitter: 0.03 });
    const c = Math.cos(ry), s = Math.sin(ry);
    const lp = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c] as const;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      const [px, pz] = lp(lx, lz);
      b.add(place(new TH.BoxGeometry(0.16, wallH, 0.16), px, top + wallH / 2, pz, ry), COL.wood, { edge: 30 });
    }
    // the door (front = +z local) and two windows
    if (o.door !== 'none') {
      const [dx, dz] = lp(0, d / 2 + 0.02);
      b.add(place(new TH.BoxGeometry(0.9, Math.min(1.75, wallH - 0.2), 0.06), dx, top + Math.min(1.75, wallH - 0.2) / 2, dz, ry), '#5b3e2a', { edge: 30 });
    }
    for (const sx of [-1, 1]) {
      const [wx, wz] = lp(sx * w * 0.3, d / 2 + 0.03);
      b.add(place(new TH.BoxGeometry(0.62, 0.5, 0.05), wx, top + wallH * 0.62, wz, ry), o.lit ? '#e8b25a' : '#4c3a2c', { edge: 30 });
    }
    const roofC = o.roof === 'thatch' ? COL.thatch : COL.tile;
    hipRoof(b, x, z, ry, w / 2 + 0.55, d / 2 + 0.6, top + wallH, o.roof === 'thatch' ? 1.25 : 1.1, { color: roofC, curl: o.roof === 'thatch' ? 0.12 : 0.4, flare: o.roof === 'thatch' ? 0.05 : 0.25, ridge: o.roof !== 'thatch' });
    if (o.porch) {
      for (const sx of [-1, 1]) {
        const [px, pz] = lp(sx * (w / 2 - 0.2), d / 2 + 1.1);
        b.add(place(new TH.CylinderGeometry(0.07, 0.08, wallH + 0.2, 6), px, top + (wallH + 0.2) / 2, pz, ry), COL.wood, { edge: 40 });
      }
      const [px, pz] = lp(0, d / 2 + 0.7);
      b.add(place(new TH.BoxGeometry(w + 0.2, 0.16, 1.5), px, top - 0.02, pz, ry), COL.stone, { edge: 30 });
    }
    // solid footprint (walls stop the walker; the camera does not hide behind them)
    const hx = w / 2 + 0.1, hz = d / 2 + 0.1;
    const pts: [number, number][] = [];
    for (let i = -1; i <= 1; i += 2 / Math.max(1, Math.round(w / 0.9))) pts.push([i * hx, -hz], [i * hx, hz]);
    for (let j = -1; j <= 1; j += 2 / Math.max(1, Math.round(d / 0.9))) pts.push([-hx, j * hz], [hx, j * hz]);
    for (const [lx, lz] of pts) { const [px, pz] = lp(lx, lz); solid(px, pz, 0.34, wallH + 1); }
    solid(x, z, Math.min(w, d) / 2 - 0.1, wallH + 1);
    return top;
  };

  // an open shed: posts and a roof (the silk room, 鲁三's workshop, the kitchen lean-to, the coop)
  const shed = (x: number, z: number, ry: number, w: number, d: number, postH: number, roofC: string = COL.thatch) => {
    const base = Y(x, z);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      b.add(place(new TH.CylinderGeometry(0.07, 0.09, postH, 6), px, base + postH / 2, pz, ry), COL.wood, { edge: 40 });
      solid(px, pz, 0.14, postH);
    }
    hipRoof(b, x, z, ry, w / 2 + 0.45, d / 2 + 0.5, base + postH, 0.9, { color: roofC, curl: 0.1, flare: 0.05, ridge: false });
    return base;
  };

  // ── the Sang house, its kitchen lean-to (the stove) and the silk room (trays of silkworms)
  {
    cottage(-23.2, 5.7, Math.PI, 4.2, 2.6, 2.1, { roof: 'thatch', lit: true });
    const kb = shed(-20.3, 6.6, 0, 1.9, 3.0, 1.9);
    // the stove: a clay block with a pot hole and a chimney
    b.add(place(new TH.BoxGeometry(1.1, 0.72, 0.8), -20.6, kb + 0.36, 6.9), '#b28a64', { edge: 30, jitter: 0.06 });
    b.add(place(new TH.CylinderGeometry(0.3, 0.26, 0.2, 10), -20.6, kb + 0.8, 6.9), '#3f3a34', { edge: 40 });
    b.add(place(new TH.CylinderGeometry(0.1, 0.12, 1.6, 6), -20.05, kb + 1.4, 7.25), '#8d7a66', { edge: 40 });
    // the steamer (dry, its cloth folded)
    b.add(place(new TH.CylinderGeometry(0.28, 0.28, 0.22, 12), -20.6, kb + 1.0, 6.9), COL.woodLight, { edge: 40 });
    b.add(place(new TH.BoxGeometry(0.34, 0.05, 0.22), -20.0, kb + 0.75, 6.62), '#efe6d4', { edge: 40 });
    solid(-20.6, 6.9, 0.55, 1);
    // the silk room: an open shed with racks of flat trays
    const sb = shed(-24, 8.7, 0, 4.0, 2.2, 2.0);
    for (const rx of [-25.2, -24, -22.8]) {
      for (const ty of [0.55, 0.95, 1.35]) {
        b.add(place(new TH.CylinderGeometry(0.46, 0.46, 0.06, 14), rx, sb + ty, 8.55), '#b89a64', { edge: 40 });
        b.add(place(new TH.CylinderGeometry(0.4, 0.4, 0.04, 14), rx, sb + ty + 0.04, 8.55), '#8fae5e', {});
      }
      for (const lx of [-0.5, 0.5]) b.add(place(new TH.BoxGeometry(0.05, 1.5, 0.05), rx + lx, sb + 0.75, 8.1), COL.woodDark, {});
    }
    solid(-24, 8.6, 0.5, 1.5); solid(-25.2, 8.6, 0.5, 1.5); solid(-22.8, 8.6, 0.5, 1.5);
    // a loom at the window, mulberry trees behind
    b.add(place(new TH.BoxGeometry(1.1, 0.9, 0.7), -25.9, Y(-25.9, 3.7) + 0.45, 3.7), COL.woodLight, { edge: 30 });
    solid(-25.9, 3.7, 0.5, 1);
  }

  // ── 杜二's brewery: the house with an open counter, the jars in the yard, the cellar mouth
  {
    const top = cottage(22.4, 4.0, -Math.PI / 2, 4.6, 3.0, 2.2, { roof: 'tile', lit: true });
    // the counter before its open front (facing the square, west)
    b.add(place(new TH.BoxGeometry(0.6, 1.0, 2.4), 19.6, Y(19.6, 4.6) + 0.5, 4.6), COL.woodLight, { edge: 30 });
    solid(19.6, 4.2, 0.35, 1); solid(19.6, 5.1, 0.35, 1);
    // new-brew vats by the counter
    for (let i = 0; i < 3; i++) {
      const jx = 19.3 + i * 0.1, jz = 2.2 + i * 0.75;
      b.add(place(new TH.SphereGeometry(0.36, 10, 8), jx, Y(jx, jz) + 0.34, jz, 0, 1, 1.1, 1), '#6b4b34', { edge: 40, hull: true });
    }
    // the cellar: an earth mound with a dark arched mouth, and mud-sealed jars within and without
    const cx = 23.2, cz = 8.6, cy = Y(cx, cz);
    b.add(place(new TH.SphereGeometry(2.2, 14, 8, 0, TAU, 0, Math.PI / 2), cx, cy - 0.1, cz + 0.9, 0, 1.1, 0.75, 1), '#a78862', { jitter: 0.08 });
    b.add(place(new TH.BoxGeometry(1.3, 1.25, 0.2), cx, cy + 0.62, cz - 0.95), '#2e2620', {});
    for (let i = 0; i < 5; i++) {
      const jx = cx - 0.9 + i * 0.45, jz = cz - 1.25 + (i % 2) * 0.12;
      const jy = Y(jx, jz);
      b.add(place(new TH.SphereGeometry(0.26, 10, 8), jx, jy + 0.3, jz, 0, 1, 1.25, 1), '#5e4330', { edge: 0, hull: true });
      b.add(place(new TH.SphereGeometry(0.2, 8, 6, 0, TAU, 0, Math.PI / 2), jx, jy + 0.56, jz), '#9b7a58', {});
    }
    solid(cx, cz + 0.6, 1.8, 1.4);
    for (let i = 0; i < 5; i++) solid(cx - 0.9 + i * 0.45, cz - 1.2, 0.24, 0.7);
    void top;
  }

  // ── 鲁三's workshop: an open shed, the workbench, offcuts, a half-carved staff
  {
    const base = shed(18, -10.8, 0, 4.4, 2.8, 2.1);
    b.add(place(new TH.BoxGeometry(2.0, 0.12, 0.7), 18, base + 0.82, -9.9), COL.woodLight, { edge: 30 });
    for (const [lx, lz] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) b.add(place(new TH.BoxGeometry(0.1, 0.8, 0.1), 18 + lx, base + 0.4, -9.9 + lz), COL.wood, {});
    // the chalk job list: a small dark board under a weight
    b.add(place(new TH.BoxGeometry(0.42, 0.02, 0.3), 17.6, base + 0.89, -9.85, 0.2), '#2d2a26', {});
    b.add(place(new TH.BoxGeometry(0.12, 0.08, 0.1), 17.5, base + 0.94, -9.8), COL.stoneDark, {});
    for (let i = 0; i < 5; i++) b.add(place(new TH.BoxGeometry(0.22, 0.06, 0.07), 18.5 + (i % 3) * 0.18, base + 0.91, -9.95 + Math.floor(i / 3) * 0.12, i * 0.7), '#d8a987', {});
    b.add(place(new TH.CylinderGeometry(0.03, 0.035, 1.5, 6), 19.6, base + 0.75, -11.6, 0, 1, 1, 1, 0.18), COL.woodLight, {});
    solid(18, -9.9, 0.6, 1); solid(17.2, -9.9, 0.45, 1); solid(18.8, -9.9, 0.45, 1);
    for (let i = 0; i < 4; i++) b.add(place(new TH.CylinderGeometry(0.14, 0.14, 1.4, 7), 16.3 + i * 0.3, base + 0.14, -12.2, 0, 1, 1, 1, Math.PI / 2), COL.wood, { edge: 40 });
  }

  // ── the elder's house (tiled, a porch, a lamp in the window)
  cottage(8, -14, 0, 4.6, 3.0, 2.3, { roof: 'tile', porch: true, lit: true });
  // ── 石瞽's hut on the lane, its porch with a stool and a zither
  {
    cottage(-14.2, -15.3, Math.PI / 2 + 0.25, 2.8, 2.4, 1.9, { roof: 'thatch' });
    const py = Y(-12.3, -14.1);
    b.add(place(new TH.BoxGeometry(1.8, 0.14, 1.4), -12.2, py + 0.05, -14.2, 0.25), COL.stone, { edge: 30 });
    b.add(place(new TH.CylinderGeometry(0.2, 0.22, 0.42, 8), -12.1, py + 0.33, -13.8), COL.woodLight, { edge: 40 });
    b.add(place(new TH.BoxGeometry(1.2, 0.06, 0.2), -12.6, py + 0.5, -14.5, 0.25), '#4a3526', { edge: 40 });
    solid(-12.1, -13.8, 0.28, 0.6);
  }

  // ── the festival square: the 花神杆, the long tables and benches, the well
  {
    const y0 = Y(0, 0);
    b.add(place(new TH.CylinderGeometry(0.09, 0.14, 7.2, 8), 0, y0 + 3.6, 0), COL.lacquer, { edge: 40 });
    b.add(place(new TH.CylinderGeometry(0.38, 0.5, 0.35, 10), 0, y0 + 0.17, 0), COL.stone, { edge: 30 });
    b.add(place(new TH.TorusGeometry(0.46, 0.09, 6, 16), 0, y0 + 6.7, 0, 0, 1, 1, 1, Math.PI / 2), '#8fb35a', {});
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      b.add(place(new TH.IcosahedronGeometry(0.13, 0), Math.cos(a) * 0.46, y0 + 6.72, Math.sin(a) * 0.46), i % 3 ? '#f2a9b8' : '#f7d9de', {});
    }
    solid(0, 0, 0.4, 7);
    for (const tz of [-1.3, 1.3]) {
      const tx = 4.6;
      const ty = Y(tx, tz);
      b.add(place(new TH.BoxGeometry(0.8, 0.08, 3.4), tx, ty + 0.72, tz), COL.woodLight, { edge: 30 });
      for (const lz of [-1.4, 1.4]) b.add(place(new TH.BoxGeometry(0.66, 0.68, 0.08), tx, ty + 0.34, tz + lz), COL.wood, {});
      for (const bx of [-0.75, 0.75]) b.add(place(new TH.BoxGeometry(0.28, 0.4, 3.2), tx + bx, ty + 0.2, tz), COL.wood, { edge: 30 });
      for (const lz of [-1.1, 0, 1.1]) solid(tx, tz + lz, 0.55, 0.8);
      // cups and dishes on the table
      for (let k = 0; k < 5; k++) b.add(place(new TH.CylinderGeometry(0.05, 0.04, 0.06, 8), tx + (k % 2 ? 0.2 : -0.2), ty + 0.79, tz - 1.2 + k * 0.6), '#f2ece0', {});
    }
    // the well: a stone ring, a winch
    const wy = Y(-3, 2);
    b.add(place(new TH.CylinderGeometry(0.62, 0.68, 0.72, 14, 1, true), -3, wy + 0.36, 2), COL.stone, { edge: 30 });
    b.add(place(new TH.CylinderGeometry(0.5, 0.5, 0.05, 14), -3, wy + 0.2, 2), '#2b3d3a', {});
    for (const sx of [-1, 1]) b.add(place(new TH.BoxGeometry(0.1, 1.5, 0.1), -3 + sx * 0.66, wy + 0.75, 2), COL.wood, {});
    b.add(place(new TH.CylinderGeometry(0.06, 0.06, 1.4, 6), -3, wy + 1.35, 2, 0, 1, 1, 1, Math.PI / 2), COL.woodDark, {});
    solid(-3, 2, 0.8, 1);
    // the cup channel's stone lips
    const L = CHANNEL.length;
    for (let i = 1; i < L; i++) {
      const [ax, az] = CHANNEL[i - 1], [bx, bz] = CHANNEL[i];
      const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
      for (const sd of [-1, 1]) {
        const nx = Math.cos(ry) * sd * 0.26, nz = -Math.sin(ry) * sd * 0.26;
        const mx = (ax + bx) / 2 + nx, mz = (az + bz) / 2 + nz;
        b.add(place(new TH.BoxGeometry(0.12, 0.12, len + 0.1), mx, Y(mx, mz) + 0.1, mz, ry), COL.stoneMid, { edge: 40 });
      }
    }
  }

  // ── the shrine: the outer gate, the walled courtyard, the hall (its door), altar, table, stele, window
  const S = SHRINE;
  const sy = Y(0, -20);
  const hallY = sy + S.hall.floor;
  const doorLeaves: T.Mesh[] = [];
  let doorSolid: (() => void)[] = [];
  {
    const wallH = 2.3;
    // courtyard walls (whitewash, tile coping), with the front gate and the north-west side gate
    const seg = (ax: number, az: number, bx: number, bz: number, hgt = wallH, gap?: { x: number; z: number; w: number }) => {
      const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
      const pieces: [number, number][] = gap ? (() => {
        const t0 = clamp(((gap.x - ax) * (bx - ax) + (gap.z - az) * (bz - az)) / (L * L), 0, 1);
        const g0 = t0 - gap.w / 2 / L, g1 = t0 + gap.w / 2 / L;
        return [[0, g0], [g1, 1]] as [number, number][];
      })() : [[0, 1]];
      for (const [u0, u1] of pieces) {
        if (u1 - u0 <= 0.01) continue;
        const mx = ax + (bx - ax) * (u0 + u1) / 2, mz = az + (bz - az) * (u0 + u1) / 2, l = L * (u1 - u0);
        b.add(place(new TH.BoxGeometry(0.34, hgt, l), mx, sy + hgt / 2 - 0.05, mz, ry), COL.whitewash, { edge: 30, jitter: 0.03 });
        b.add(place(new TH.BoxGeometry(0.62, 0.16, l + 0.2), mx, sy + hgt + 0.05, mz, ry), COL.tile, { edge: 30 });
        b.add(place(new TH.BoxGeometry(0.4, 0.12, l + 0.1), mx, sy + hgt + 0.18, mz, ry), COL.tileDark, {});
      }
      wallLine(ax, az, bx, bz, hgt, gap);
    };
    seg(-S.wallX, S.south, S.wallX, S.south, wallH, { x: 0, z: S.south, w: S.gate.w });
    seg(S.wallX, S.south, S.wallX, S.sideN);
    seg(-S.wallX, S.south, -S.wallX, S.sideN, wallH, { x: S.sideGate.x, z: S.sideGate.z, w: S.sideGate.w });
    seg(S.hall.x1, S.sideN, S.wallX, S.sideN);
    seg(-S.wallX, S.sideN, S.hall.x0, S.sideN);
    // the outer gate: two red posts, a lintel and a little roof
    for (const sx of [-1, 1]) b.add(place(new TH.CylinderGeometry(0.12, 0.13, 2.9, 8), sx * (S.gate.w / 2 + 0.1), sy + 1.45, S.south), COL.lacquer, { edge: 40 });
    b.add(place(new TH.BoxGeometry(S.gate.w + 0.6, 0.22, 0.3), 0, sy + 2.8, S.south), COL.lacquer, { edge: 30 });
    hipRoof(b, 0, S.south, 0, S.gate.w / 2 + 0.7, 0.75, sy + 2.95, 0.6, { color: COL.tile, curl: 0.5, flare: 0.3 });
    // the hall: a platform, walls with the door and the back window, a hip roof
    const H = S.hall, hw = (H.x1 - H.x0) / 2, hd = (H.z0 - H.z1) / 2, hcx = 0, hcz = (H.z0 + H.z1) / 2;
    b.add(place(new TH.BoxGeometry(H.x1 - H.x0 + 0.6, H.floor + 0.3, H.z0 - H.z1 + 0.6), hcx, sy + H.floor / 2 - 0.15, hcz), COL.stoneMid, { edge: 30, jitter: 0.04 });
    b.add(place(new TH.BoxGeometry(1.6, H.floor / 2, 0.7), 0, sy + H.floor / 4, H.z0 + 0.45), COL.stone, { edge: 30 });
    const wall = (ax: number, az: number, bx: number, bz: number, gap?: { at: number; w: number; y0: number; y1: number }) => {
      const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
      const put = (u0: number, u1: number, y0: number, y1: number) => {
        if (u1 - u0 < 0.02 || y1 - y0 < 0.02) return;
        const mx = ax + (bx - ax) * (u0 + u1) / 2, mz = az + (bz - az) * (u0 + u1) / 2;
        b.add(place(new TH.BoxGeometry(0.22, y1 - y0, L * (u1 - u0)), mx, hallY + (y0 + y1) / 2, mz, ry), '#d9c9a8', { edge: 30, jitter: 0.03 });
      };
      if (!gap) put(0, 1, 0, H.eave);
      else {
        const g0 = gap.at - gap.w / 2 / L, g1 = gap.at + gap.w / 2 / L;
        put(0, g0, 0, H.eave); put(g1, 1, 0, H.eave);
        put(g0, g1, 0, gap.y0); put(g0, g1, gap.y1, H.eave);
      }
    };
    wall(H.x0, H.z0, -S.door.w / 2 - 0.02, H.z0);
    wall(S.door.w / 2 + 0.02, H.z0, H.x1, H.z0);
    b.add(place(new TH.BoxGeometry(S.door.w + 0.1, H.eave - 2.2, 0.22), 0, hallY + 2.2 + (H.eave - 2.2) / 2, H.z0), '#d9c9a8', { edge: 30 });
    wall(H.x1, H.z0, H.x1, H.z1);
    wall(H.x0, H.z1, H.x0, H.z0);
    wall(H.x1, H.z1, H.x0, H.z1, { at: (H.x1 - S.window.x) / (H.x1 - H.x0), w: S.window.w, y0: S.window.sill, y1: S.window.sill + 0.8 });
    // red columns at the front, a plaque above the door
    for (const cx of [H.x0 + 0.1, -S.door.w / 2 - 0.3, S.door.w / 2 + 0.3, H.x1 - 0.1]) b.add(place(new TH.CylinderGeometry(0.11, 0.12, H.eave, 8), cx, hallY + H.eave / 2, H.z0 + 0.2), COL.lacquer, { edge: 40 });
    hipRoof(b, hcx, hcz, 0, hw + 0.9, hd + 0.9, hallY + H.eave, 1.8, { color: COL.tile, curl: 0.5, flare: 0.3 });
    // the altar, the side table with its register, a cushion, candles
    const A = S.altar;
    b.add(place(new TH.BoxGeometry(A.w, 0.1, A.d), A.x, hallY + A.h, A.z), COL.lacquer, { edge: 30 });
    b.add(place(new TH.BoxGeometry(A.w - 0.1, A.h - 0.05, A.d - 0.1), A.x, hallY + (A.h - 0.05) / 2, A.z), '#6b2f22', { edge: 30 });
    b.add(place(new TH.BoxGeometry(0.9, 0.5, 0.5), 0, hallY + A.h + 0.3, A.z - 0.45), COL.woodDark, { edge: 30 });
    for (const cx of [-0.8, 0.8]) b.add(place(new TH.CylinderGeometry(0.04, 0.04, 0.26, 6), cx, hallY + A.h + 0.18, A.z - 0.2), '#c0412f', {});
    b.add(place(new TH.BoxGeometry(0.8, 0.72, 0.5), S.table.x, hallY + 0.36, S.table.z), COL.woodDark, { edge: 30 });
    b.add(place(new TH.BoxGeometry(0.34, 0.06, 0.26), S.table.x, hallY + 0.75, S.table.z, 0.1), '#e7dcc2', { edge: 40 });
    b.add(place(new TH.CylinderGeometry(0.34, 0.34, 0.1, 10), 0, hallY + 0.05, A.z + 1.6), '#b8553c', {});
    // inside the hall: the altar and the table stop the walker; the walls keep the camera in (or out)
    solid(-0.55, A.z, 0.42, 1.2); solid(0.55, A.z, 0.42, 1.2); solid(S.table.x, S.table.z, 0.38, 1);
    wallLine(H.x0, H.z0, -S.door.w / 2, H.z0, 3);
    wallLine(S.door.w / 2, H.z0, H.x1, H.z0, 3);
    wallLine(H.x1, H.z0, H.x1, H.z1, 3);
    wallLine(H.x1, H.z1, H.x0, H.z1, 3);
    wallLine(H.x0, H.z1, H.x0, H.z0, 3);
    // the stele beside the hall (its face painted below)
    b.add(place(new TH.BoxGeometry(0.8, 0.3, 0.45), S.stele.x, sy + 0.15, S.stele.z), COL.stoneDark, { edge: 30 });
    b.add(place(new TH.BoxGeometry(0.62, 1.6, 0.2), S.stele.x, sy + 1.1, S.stele.z), '#8a857c', { edge: 30 });
    solid(S.stele.x, S.stele.z, 0.4, 2);
    // the side gate's frame
    for (const sz of [-1, 1]) b.add(place(new TH.BoxGeometry(0.4, 2.3, 0.14), S.sideGate.x, sy + 1.15, S.sideGate.z + sz * (S.sideGate.w / 2 + 0.05)), COL.wood, {});
  }
  // the hall doors (two leaves on hinges; shut, a collider stops the doorway)
  const doorMat = h.toon('#8a3a26');
  for (const sx of [-1, 1]) {
    const pivot = new TH.Group();
    pivot.position.set(sx * S.door.w / 2, hallY, S.door.z + 0.02);
    const leaf = new TH.Mesh(new TH.BoxGeometry(S.door.w / 2, 2.15, 0.06).translate(-sx * S.door.w / 4, 1.075, 0), doorMat);
    pivot.add(leaf);
    h.add(pivot);
    doorLeaves.push(leaf);
  }
  let doorOpen = true;
  let doorK = 1, doorWant = 1;
  const setDoorSolid = (shut: boolean) => {
    for (const f of doorSolid) f();
    doorSolid = [];
    if (shut) for (let i = 0; i < 4; i++) doorSolid.push(ctx.addCollider({ x: G.x - S.door.w / 2 + 0.16 + i * (S.door.w - 0.32) / 3, z: G.z + S.door.z, r: 0.24, h: 2.2 }));
  };
  h.frame((dt) => {
    if (doorK === doorWant) return;
    doorK += Math.sign(doorWant - doorK) * Math.min(Math.abs(doorWant - doorK), dt / 1.1);
    const e = doorK * doorK * (3 - 2 * doorK);
    doorLeaves.forEach((l, i) => { l.parent!.rotation.y = (i === 0 ? 1 : -1) * e * 1.75; });
  });
  // (the leaves swing inward, into the hall)
  doorLeaves.forEach((l, i) => { l.parent!.rotation.y = (i === 0 ? 1 : -1) * 1.75; });

  // the stele's face and the plaque over the gate (painted)
  {
    const face = new TH.Mesh(new TH.PlaneGeometry(0.56, 1.45), h.own(new TH.MeshBasicMaterial({ map: h.tex(steleCanvas(['花朝子正', '钤印过所', '方得复归'], { w: 192, h: 512, title: '' })), transparent: false })));
    h.nightShade(face.material as T.MeshBasicMaterial);
    face.position.set(S.stele.x, sy + 1.12, S.stele.z + 0.11);
    face.name = 'taoyuan:stele';
    h.add(face);
    const plaque = new TH.Mesh(new TH.PlaneGeometry(0.9, 0.34), h.own(new TH.MeshBasicMaterial({ map: h.tex(plaqueCanvas('祠', { w: 192, h: 72, font: 50 })) })));
    h.nightShade(plaque.material as T.MeshBasicMaterial);
    plaque.position.set(0, hallY + S.hall.eave - 0.45, S.hall.z0 + 0.14);
    h.add(plaque);
  }

  // ── the spring: rocks round the pool, stepping stones below it, the north cliff's foot
  {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (0.95 + (i / 10) * 1.1);
      const rx = SPRING.x + Math.cos(a) * (SPRING.r + 0.4), rz = SPRING.z + Math.sin(a) * (SPRING.r + 0.4);
      const g = rockGeometry(900 + i, 0.9 + rng() * 0.8, 0.5 + rng() * 0.7, { detail: 1, base: '#b4a88f', dark: '#5f574b' });
      place(g, rx, Y(rx, rz) - 0.1, rz, rng() * TAU);
      b.colored(g, { hull: true });
    }
    const c = CROSSINGS.find((q) => q.id === 'stones')!;
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      const x = c.a[0] + (c.b[0] - c.a[0]) * t, z = c.a[1] + (c.b[1] - c.a[1]) * t;
      b.add(place(new TH.CylinderGeometry(0.34, 0.38, 0.22, 7), x, standAt(x, z) - 0.09, z, rng() * TAU), COL.stone, { edge: 50 });
    }
  }

  // ── the stone bridge (an arch over the stream) and the slab to 鲁三's
  {
    const c = CROSSINGS.find((q) => q.id === 'bridge')!;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = c.a[0] + (c.b[0] - c.a[0]) * t0, z0 = c.a[1] + (c.b[1] - c.a[1]) * t0;
      const x1 = c.a[0] + (c.b[0] - c.a[0]) * t1, z1 = c.a[1] + (c.b[1] - c.a[1]) * t1;
      const y0 = standAt(x0, z0), y1 = standAt(x1, z1);
      const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      const ry = Math.atan2(x1 - x0, z1 - z0), pitch = Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
      const g = new TH.BoxGeometry(c.hw * 2, 0.22, len + 0.03);
      place(g, (x0 + x1) / 2, (y0 + y1) / 2 - 0.11, (z0 + z1) / 2, ry, 1, 1, 1, -pitch);
      b.add(g, COL.stone, { edge: 40, jitter: 0.04 });
      for (const sd of [-1, 1]) {
        const ox = Math.cos(ry) * sd * (c.hw - 0.06), oz = -Math.sin(ry) * sd * (c.hw - 0.06);
        const gg = new TH.BoxGeometry(0.14, 0.34, len + 0.02);
        place(gg, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + 0.17, (z0 + z1) / 2 + oz, ry, 1, 1, 1, -pitch);
        b.add(gg, COL.stoneMid, { edge: 40 });
      }
    }
    // (the parapets stop the walker at the sides)
    const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    const ux = (c.b[0] - c.a[0]) / L, uz = (c.b[1] - c.a[1]) / L;
    for (let s = 0.4; s < L - 0.3; s += 0.45) for (const sd of [-1, 1]) solid(c.a[0] + ux * s + uz * sd * (c.hw + 0.05), c.a[1] + uz * s - ux * sd * (c.hw + 0.05), 0.12, 0.5);
    const sl = CROSSINGS.find((q) => q.id === 'slab')!;
    const mx = (sl.a[0] + sl.b[0]) / 2, mz = (sl.a[1] + sl.b[1]) / 2;
    b.add(place(new TH.BoxGeometry(1.3, 0.2, Math.hypot(sl.b[0] - sl.a[0], sl.b[1] - sl.a[1]) + 0.4), mx, standAt(mx, mz) - 0.1, mz, Math.atan2(sl.b[0] - sl.a[0], sl.b[1] - sl.a[1])), COL.stoneWarm, { edge: 40 });
  }

  // ── the pavilion 不出亭 on its outcrop, the stepped path up
  {
    const pr = PAVILION;
    const top = floorAt(pr.x, pr.z);
    const rock = rockGeometry(7717, (pr.r + 2.2) * 2, top + 1.5, { detail: 2, base: '#a79a80', dark: '#5a5044', flat: 0.25, lean: 0.05 });
    place(rock, pr.x, -1.5, pr.z, 0.6);
    b.colored(rock, { hull: true });
    b.add(place(new TH.CylinderGeometry(pr.r + 0.1, pr.r + 0.3, 0.3, 12), pr.x, top - 0.12, pr.z), COL.stone, { edge: 30 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.add(place(new TH.CylinderGeometry(0.09, 0.1, 2.4, 8), pr.x + Math.cos(a) * (pr.r - 0.3), top + 1.2, pr.z + Math.sin(a) * (pr.r - 0.3)), COL.lacquer, { edge: 40 });
    }
    const ring = (n: number, r: number): [number, number][] => Array.from({ length: n }, (_, i) => { const a = -(i / n) * TAU; return [pr.x + Math.cos(a) * r, pr.z + Math.sin(a) * r]; });
    // a six-sided roof
    const outer = ring(6, pr.r + 0.7), inner = ring(6, 0.05);
    import_roof(b, outer, inner, top + 2.45, top + 4.0);
    // the stairs along the path
    for (let i = 1; i < pr.path.length; i++) {
      const [ax, az] = pr.path[i - 1], [bx, bz] = pr.path[i];
      stairs(b, h, new TH.Vector3(G.x + ax, Y_T + standAt(ax, az), G.z + az), new TH.Vector3(G.x + bx, Y_T + standAt(bx, bz), G.z + bz), 1.0, { rise: 0.2, cheeks: false, seed: i });
    }
    // (stairs() builds in world coordinates; the batch is local: see the shift below)
  }

  // ── the old 碧桃 on its knoll (white-edged blossom, the hollow at knee height), the terrace's old peach
  const bigTree = (x: number, z: number, s: number, white: boolean, seed: number) => {
    const r = makeRng(seed);
    const y0 = Y(x, z) - 0.1;
    const trunk: T.Vector3[] = [];
    for (let i = 0; i <= 5; i++) trunk.push(new TH.Vector3(x + Math.sin(i * 0.9) * 0.25 * s, y0 + i * 0.55 * s, z + Math.cos(i * 0.7) * 0.18 * s));
    b.colored(taperTube(trunk, trunk.map((_, i) => (0.34 - i * 0.045) * s), 8, COL.woodDark, { seed }), { hull: true });
    const top = trunk[trunk.length - 1];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r() * 0.6;
      const L = (1.3 + r() * 0.8) * s;
      const end = new TH.Vector3(top.x + Math.cos(a) * L, top.y + (0.3 + r() * 0.6) * s, top.z + Math.sin(a) * L);
      const mid = top.clone().lerp(end, 0.5).add(new TH.Vector3(0, 0.25 * s, 0));
      b.colored(taperTube([top.clone().add(new TH.Vector3(0, -0.4 * s, 0)), mid, end], [0.14 * s, 0.09 * s, 0.04 * s], 6, COL.woodDark, { seed: seed + k }), {});
      for (let c = 0; c < 4; c++) {
        const p = end.clone().add(new TH.Vector3((r() - 0.5) * 1.2 * s, (r() - 0.2) * 0.7 * s, (r() - 0.5) * 1.2 * s));
        const col = white ? (r() < 0.55 ? '#fbeef0' : '#f4c6cf') : (r() < 0.5 ? '#f2a9b8' : '#f7c9d2');
        b.add(place(new TH.IcosahedronGeometry((0.55 + r() * 0.35) * s, 1), p.x, p.y, p.z, r() * TAU, 1, 0.78, 1), col, { hull: true, jitter: 0.06 });
      }
    }
    solid(x, z, 0.45 * s, 3);
    return trunk;
  };
  {
    const t = bigTree(KNOLL.x - 0.3, KNOLL.z - 0.3, 1.35, true, 4242);
    // the hollow: a dark oval on the trunk's south-east face, knee high
    const p = t[1];
    b.add(place(new TH.SphereGeometry(0.22, 10, 8), p.x + 0.28, p.y - 0.1, p.z + 0.36, 0.7, 1, 1.5, 0.5), '#1f1712', {});
    bigTree(-2.6, 35.8, 1.1, false, 5151);
    // the kite string's peg on the terrace
    b.add(place(new TH.CylinderGeometry(0.03, 0.03, 0.4, 5), -0.4, Y(-0.4, 34.6) + 0.2, 34.6), COL.wood, {});
    const tr = rockGeometry(333, 3.4, 0.7, { detail: 1, base: '#c1b79f', dark: '#7a705f', flat: 0.6 });
    place(tr, -1.4, Y(-1.4, 35.2) - 0.55, 35.2, 0.3, 1, 1, 0.8);
    b.colored(tr, {});
  }

  // ── the herb garden and the petal clock (葛姑's basin, ruled in ten rings)
  {
    for (let i = 0; i < 6; i++) {
      const bx = 23 + (i % 3) * 2.4, bz = -23.2 + Math.floor(i / 3) * 5.6;
      b.add(place(new TH.BoxGeometry(1.8, 0.18, 1.3), bx, Y(bx, bz) + 0.05, bz), '#7a5e42', { edge: 30 });
      for (let k = 0; k < 6; k++) b.add(place(new TH.IcosahedronGeometry(0.2, 0), bx - 0.6 + (k % 3) * 0.6, Y(bx, bz) + 0.25, bz - 0.3 + Math.floor(k / 3) * 0.6), k % 2 ? '#6f9a5a' : '#8fb35a', {});
    }
    const by = Y(26, -20);
    b.add(place(new TH.CylinderGeometry(0.75, 0.6, 0.55, 18), 26, by + 0.27, -20), COL.stone, { edge: 30 });
    solid(26, -20, 0.8, 0.6);
  }
  // the basin's face: ten rings, and a thin layer of petals
  {
    const tex = h.tex(basinCanvas(256));
    const face = new TH.Mesh(new TH.CircleGeometry(0.66, 32).rotateX(-Math.PI / 2), h.nightShade(h.own(new TH.MeshBasicMaterial({ map: tex }))));
    face.position.set(26, Y(26, -20) + 0.56, -20);
    face.name = 'taoyuan:basin';
    h.add(face);
  }

  // ── fields, coops, fences, bamboo and mulberry (桑竹之属)
  {
    for (const sx of [-1, 1]) {
      for (let r = 0; r < 4; r++) {
        const z0 = 20 + r * 4;
        b.add(place(new TH.BoxGeometry(14, 0.14, 0.18), sx * 25, Y(sx * 25, z0) + 0.04, z0), '#8a7a52', {});
      }
    }
    // the coop and a fence
    shed(-20.5, 19.5, 0.3, 2.0, 1.4, 1.1);
    for (let i = 0; i < 10; i++) {
      const fx = -24 + i * 0.7, fz = 17.8;
      b.add(place(new TH.CylinderGeometry(0.04, 0.05, 0.8, 5), fx, Y(fx, fz) + 0.4, fz), COL.woodLight, {});
    }
    b.add(place(new TH.BoxGeometry(6.4, 0.05, 0.05), -20.85, Y(-20.85, 17.8) + 0.6, 17.8), COL.woodLight, {});
    // bamboo clumps (west slopes' foot), mulberries by the Sang house
    for (let c = 0; c < 4; c++) {
      const cx = -33 + c * 1.3, cz = -6 + c * 4;
      for (let i = 0; i < 6; i++) {
        const x = cx + (rng() - 0.5) * 1.2, z = cz + (rng() - 0.5) * 1.2, hh = 3.4 + rng() * 2;
        b.add(place(new TH.CylinderGeometry(0.045, 0.06, hh, 5), x, Y(x, z) + hh / 2, z, 0, 1, 1, 1, (rng() - 0.5) * 0.12), COL.bamboo, {});
        b.add(place(new TH.IcosahedronGeometry(0.55, 0), x, Y(x, z) + hh, z, rng() * TAU, 0.7, 1.5, 0.7), '#6f9a5a', { jitter: 0.08 });
      }
    }
    for (const [mx, mz] of [[-27.5, 1.5], [-28.2, 6.5], [-19, 11]] as [number, number][]) {
      const t: T.Vector3[] = [0, 1, 2].map((i) => new TH.Vector3(mx, Y(mx, mz) + i * 0.9, mz));
      b.colored(taperTube(t, [0.16, 0.12, 0.08], 6, COL.wood, { seed: mx }), {});
      for (let k = 0; k < 4; k++) b.add(place(new TH.IcosahedronGeometry(0.8, 1), mx + (rng() - 0.5) * 1.4, Y(mx, mz) + 2 + rng() * 0.6, mz + (rng() - 0.5) * 1.4, 0, 1, 0.75, 1), k % 2 ? '#5f8f4e' : '#77a35a', { hull: true, jitter: 0.08 });
      solid(mx, mz, 0.25, 2);
    }
  }

  // ── lane lanterns on posts (the lanterns themselves are one instanced mesh; lit ones glow)
  for (const w of LANE_LANTERNS) {
    const x = w.x - G.x, z = w.z - G.z;
    b.add(place(new TH.CylinderGeometry(0.05, 0.06, 1.9, 6), x, Y(x, z) + 0.95, z), COL.woodDark, {});
    b.add(place(new TH.BoxGeometry(0.5, 0.05, 0.05), x + 0.2, Y(x, z) + 1.85, z), COL.woodDark, {});
    solid(x, z, 0.12, 1.9);
  }

  // stairs() and the like built in world space: shift what they added back to local (the batch is local)
  // (everything else above was placed in local coordinates)
  shiftWorldStairs(b, TH);

  // ── build the merged scenery (solids, ink hulls, ink lines)
  b.build(h, 'taoyuan', { outline: 0.03, lineOpacity: 0.6 });

  // ── the peaches: one instanced tree (trunk, branches and blossom in one geometry) and its ink hull
  const trees: { x: number; z: number; s: number; ry: number; t: number }[] = [];
  const clear = (x: number, z: number, r: number) => {
    if (pathDist(x, z) < 1.3 + r * 0.3) return false;
    if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 1.5) return false;
    const st = streamAt(x, z);
    if (st.d < st.hw + 0.9) return false;
    if (Math.abs(x) < S.wallX + 2 && z < S.south + 1.5 && z > S.hall.z1 - 2) return false;
    if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + 1.5) return false;
    if (Math.hypot(x - PAVILION.x, z - PAVILION.z) < PAVILION.r + 3.5) return false;
    if (Math.hypot(x - KNOLL.x, z - KNOLL.z) < 3) return false;
    for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r + 1.2) return false;
    for (const [bx, bz, br] of BUILT) if (Math.hypot(x - bx, z - bz) < br + 1.2) return false;
    for (const t of trees) if (Math.hypot(x - t.x, z - t.z) < 2.1) return false;
    return Math.hypot(x, z) < FLOOR_R - 1.5 && z < CAVE.mouth - 3;
  };
  // 夹岸数百步，中无杂树: both banks from the terrace down to the bridge
  for (let s = 0; s < STREAM_LEN; s += 1.7) {
    const p = polyAt(STREAM, s);
    if (p.z < 11 || p.z > 36) continue;
    for (const side of [-1, 1]) {
      for (const off of [2.4, 4.6]) {
        const x = p.x + -p.dz * side * (off + rng() * 0.8), z = p.z + p.dx * side * (off + rng() * 0.8);
        if (clear(x, z, 1)) trees.push({ x, z, s: 0.95 + rng() * 0.35, ry: rng() * TAU, t: rng() });
      }
    }
  }
  // round the houses and along the lanes
  for (let i = 0; i < 260 && trees.length < 46 + Math.round(26 * density); i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (FLOOR_R - 2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (clear(x, z, 1)) trees.push({ x, z, s: 0.85 + rng() * 0.4, ry: rng() * TAU, t: rng() });
  }
  // on the lower slopes (no walking there): pink among the jade
  const slopeTrees = Math.round((low ? 14 : 28) * Math.min(1.5, density));
  for (let i = 0; i < slopeTrees; i++) {
    const a = rng() * TAU, r = 41.5 + rng() * 8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > CAVE.mouth - 6 && Math.abs(x) < 9) continue;
    trees.push({ x, z, s: 0.8 + rng() * 0.5, ry: rng() * TAU, t: rng() });
  }
  {
    const floorTrees = trees.filter((t) => Math.hypot(t.x, t.z) < FLOOR_R);
    const slopeT = trees.filter((t) => Math.hypot(t.x, t.z) >= FLOOR_R);
    const hi = mergeParts(TH, peachParts(TH, 1)), lo = mergeParts(TH, peachParts(TH, 0));
    const mat = h.toon('#ffffff', { vc: true });
    const im = new TH.InstancedMesh(hi, mat, floorTrees.length);
    // (the ink hull only needs the silhouette: the coarse tree)
    const hull = new TH.InstancedMesh(lo, h.outline(0.035), floorTrees.length);
    const far = new TH.InstancedMesh(lo, mat, Math.max(1, slopeT.length));
    far.count = slopeT.length;
    const m4 = new TH.Matrix4(), q = new TH.Quaternion(), e = new TH.Euler(), v = new TH.Vector3(), sc = new TH.Vector3();
    const tint = new TH.Color();
    const put = (list: typeof trees, meshes: T.InstancedMesh[]) => list.forEach((t, i) => {
      const y = Math.hypot(t.x, t.z) < FLOOR_R ? floorAt(t.x, t.z) : surfaceAt(t.x, t.z);
      m4.compose(v.set(t.x, y - 0.05, t.z), q.setFromEuler(e.set(0, t.ry, 0)), sc.set(t.s, t.s * (0.92 + t.t * 0.18), t.s));
      for (const m of meshes) m.setMatrixAt(i, m4);
      meshes[0].setColorAt(i, tint.setRGB(1, 0.94 + t.t * 0.06, 0.95 + t.t * 0.05));
      if (Math.hypot(t.x, t.z) < FLOOR_R) solid(t.x, t.z, 0.2 * t.s, 1.8);
    });
    put(floorTrees, [im, hull]);
    put(slopeT, [far]);
    for (const m of [im, hull, far]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
    im.name = 'taoyuan:peaches'; hull.name = 'taoyuan:peaches:ink'; far.name = 'taoyuan:peaches:far';
    im.castShadow = true;
    h.add(im); h.add(hull); h.add(far);
  }

  // ── lane lanterns (one instanced mesh: unlit red paper, lit amber)
  const lanternGeo = new TH.CylinderGeometry(0.17, 0.17, 0.34, 10);
  const lanternMat = h.own(new TH.MeshBasicMaterial({ color: '#ffffff' }));
  const lim = new TH.InstancedMesh(lanternGeo, lanternMat, LANE_LANTERNS.length);
  const litState = LANE_LANTERNS.map(() => false);
  const cUnlit = new TH.Color('#a8483a'), cLit = new TH.Color('#ffd08a');
  LANE_LANTERNS.forEach((w, i) => {
    const x = w.x - G.x, z = w.z - G.z;
    lim.setMatrixAt(i, new TH.Matrix4().makeTranslation(x + 0.4, floorAt(x, z) + 1.6, z));
    lim.setColorAt(i, cUnlit);
  });
  lim.instanceMatrix.needsUpdate = true;
  lim.name = 'taoyuan:lanterns';
  h.add(lim);
  const lanterns = {
    count: LANE_LANTERNS.length,
    lit: (i: number) => !!litState[i],
    light(i: number, on: boolean) {
      if (i < 0 || i >= litState.length) return;
      litState[i] = on;
      lim.setColorAt(i, on ? cLit : cUnlit);
      if (lim.instanceColor) lim.instanceColor.needsUpdate = true;
    },
    all(on: boolean, staggerMs = 0) {
      litState.forEach((_, i) => { if (!staggerMs) lanterns.light(i, on); else setTimeout(() => { if (!disposed) lanterns.light(i, on); }, i * staggerMs); });
    },
  };

  // the doors start shut? (open: the valley at rest; the story shuts them for the rite)
  let disposed = false;
  const valley: Valley = {
    hill: h,
    get floorOn() { return offDeck !== null; },
    setFloor(on: boolean) {
      if (on && !offDeck) offDeck = registerDeck(deck);
      else if (!on && offDeck) { offDeck(); offDeck = null; }
    },
    get doorOpen() { return doorOpen; },
    shrineDoor(open: boolean, instant = false) {
      doorOpen = open;
      doorWant = open ? 1 : 0;
      if (instant || h.reduced) { doorK = doorWant; doorLeaves.forEach((l, i) => { l.parent!.rotation.y = (i === 0 ? 1 : -1) * doorK * 1.75; }); }
      setDoorSolid(!open);
    },
    lanterns,
    caveMat,
    waterMat,
    standY: (x, z) => Y_T + standAt(x - G.x, z - G.z),
    dispose() {
      disposed = true;
      valley.setFloor(false);
      setDoorSolid(false);
      h.dispose();
    },
  };
  return valley;
}

/** Footprints the trees keep clear of (local x, z, radius). */
const BUILT: [number, number, number][] = [
  [-23.2, 5.7, 3], [-20.3, 6.6, 1.8], [-24, 8.7, 2.4], [22.4, 4, 3], [23.2, 9.2, 2.6], [18, -10.8, 2.8], [8, -14, 3.4], [-14.2, -15.3, 2.2], [-12.2, -14.2, 1.2],
  [4.6, 0, 2.4], [-3, 2, 1.2], [26, -20, 4.5], [-20.5, 19.5, 1.8], [-2.6, 35.8, 2.5], [-1.4, 35.2, 2], [-27.5, 1.5, 1.5], [-28.2, 6.5, 1.5], [-19, 11, 1.5], [-31, 0, 4],
];

/** hill-kit's stairs() places in world coordinates (it reads the ground there); the batch here is local. */
function shiftWorldStairs(b: Batch, TH: WorldCtx['THREE']): void {
  const m = new TH.Matrix4().makeTranslation(-G.x, -Y_T, -G.z);
  for (const list of [b.solid, b.hull, b.lines, b.rimSolid]) {
    for (const g of list) {
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      // anything whose centre lies far out at the world's valley position is in world space
      if ((bb.min.x + bb.max.x) / 2 > G.x - 60 && (bb.min.y + bb.max.y) / 2 > Y_T - 40) g.applyMatrix4(m);
    }
  }
}

/** A six-sided (or any) roof in local space. */
function import_roof(b: Batch, outer: [number, number][], inner: [number, number][], eaveY: number, topY: number): void {
  roof(b, outer, inner, eaveY, topY, { color: COL.tile, curl: 0.55, flare: 0.35 });
}

/** One blossoming peach (trunk, branches, blossom clouds) as vertex-coloured parts, at the origin (detail 0: the coarse one). */
function peachParts(TH: WorldCtx['THREE'], detail = 1): BG[] {
  const out: BG[] = [];
  const r: Rng = makeRng(77);
  const add = (g: BG, color: string, p: [number, number, number], rot: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.applyMatrix4(new TH.Matrix4().compose(new TH.Vector3(...p), new TH.Quaternion().setFromEuler(new TH.Euler(...rot)), new TH.Vector3(...s)));
    const c = new TH.Color(color);
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = 0.93 + ((i * 7919) % 13) / 13 * 0.12; col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    ng.setAttribute('color', new TH.BufferAttribute(col, 3));
    ng.deleteAttribute('uv');
    out.push(ng);
  };
  const h = 1.7;
  add(new TH.CylinderGeometry(0.08, 0.15, h, 7), '#5e3f2c', [0.08, h / 2, 0], [0, 0, -0.1]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    add(new TH.CylinderGeometry(0.03, 0.065, 1.0, 5), '#4f3626', [0.17 + Math.cos(a) * 0.35, h + 0.3, Math.sin(a) * 0.35], [Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75]);
  }
  const pinks = ['#f2a9b8', '#f7c4ce', '#ec93a8', '#fbd8de'];
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU, d = 0.3 + r() * 0.75;
    add(new TH.IcosahedronGeometry(0.46 + r() * 0.28, detail), pinks[i % pinks.length], [0.15 + Math.cos(a) * d, h + 0.4 + r() * 0.7, Math.sin(a) * d], [r(), r(), 0], [1, 0.78, 1]);
  }
  return out;
}

function mergeParts(TH: WorldCtx['THREE'], parts: BG[]): BG {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new TH.BufferGeometry();
  g.setAttribute('position', new TH.BufferAttribute(pos, 3));
  g.setAttribute('normal', new TH.BufferAttribute(nor, 3));
  g.setAttribute('color', new TH.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// ───────────────────────────── painted textures

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** Soft cumulus washes for the cloud sea (tileable enough at a distance). */
function cloudCanvas(S: number, seed: number): HTMLCanvasElement {
  const [c, g] = cv(S, S);
  const r = makeRng(seed);
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = r() * S, y = r() * S, rr = S * (0.05 + r() * 0.14);
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2);
    }
  }
  return c;
}

/** A horizontal belt of mist, thick in the middle, ragged at its top and bottom. */
function mistBandCanvas(w: number, h: number): HTMLCanvasElement {
  const [c, g] = cv(w, h);
  const r = makeRng(12);
  for (let i = 0; i < 140; i++) {
    const x = r() * w, y = h * (0.35 + r() * 0.3), rx = w * (0.02 + r() * 0.06), ry = h * (0.12 + r() * 0.2);
    for (const dx of [0, w, -w]) {
      g.save();
      g.translate(x + dx, y);
      g.scale(1, ry / rx);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    }
  }
  return c;
}

/** Flowing water: faint light streaks down its length. */
function waterCanvas(w: number, h: number): HTMLCanvasElement {
  const [c, g] = cv(w, h);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  const r = makeRng(31);
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, l = 12 + r() * 40;
    g.strokeStyle = `rgba(160,200,190,${0.25 + r() * 0.35})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + l); g.stroke();
    g.strokeStyle = `rgba(255,255,250,${0.5 + r() * 0.5})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + 2, y + 3); g.lineTo(x + 2, y + l * 0.6); g.stroke();
  }
  return c;
}

function glowDisc(S: number): HTMLCanvasElement {
  const [c, g] = cv(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

/** 葛姑's petal clock: a stone basin ruled in ten rings, a thin even layer of petals. */
function basinCanvas(S: number): HTMLCanvasElement {
  const [c, g] = cv(S, S);
  g.fillStyle = '#b9b09c';
  g.fillRect(0, 0, S, S);
  const r = makeRng(10);
  g.strokeStyle = 'rgba(40,34,28,0.75)';
  for (let i = 1; i <= 10; i++) {
    g.lineWidth = i === 10 ? 3 : 1.5;
    g.beginPath(); g.arc(S / 2, S / 2, (S / 2 - 4) * (i / 10), 0, TAU); g.stroke();
  }
  for (let i = 0; i < 160; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * (S / 2 - 6);
    g.fillStyle = r() < 0.5 ? 'rgba(236,160,178,0.9)' : 'rgba(247,205,213,0.9)';
    g.save(); g.translate(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d); g.rotate(r() * TAU);
    g.beginPath(); g.ellipse(0, 0, 4.5, 2.6, 0, 0, TAU); g.fill(); g.restore();
  }
  return c;
}

export type { XZ };
