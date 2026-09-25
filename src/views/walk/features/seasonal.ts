// The rest of the year's festivals: 清明 (drizzle, kites, willows), 端午 (a dragon boat racing
// round the pond to a drum, zongzi to find), 七夕 (the Milky Way, a bridge of magpies, fireflies),
// 重阳 (potted chrysanthemums, a height to climb, chrysanthemum wine), 冬至 / 腊八 (snow, dumplings
// or laba porridge, the 九九消寒图).
import type * as T from 'three';
import type { WorldCtx } from '../types';
import { Bag, BRUSH_FONT, canvasTexture, claims, entry, feature, findSpot, glowTexture, landmarks, loadBrush, pondDist, reducedMotion, shorePoint, TEXT_FONT, tween, dayRng } from './kit';
import { birdGeometry, instanceAttrs, merge, part, wingMaterial } from './geo';
import { bowl, burst, glints, stoneTable } from './props';
import { fireflySwarm } from './life';
import * as sfx from './sfx';

const TAU = Math.PI * 2;

/** A shore point at angle ≈ a that the player can stand on. */
function landingAt(ctx: WorldCtx, a: number, out = 0.8): { at: T.Vector3; a: number } {
  for (let k = 0; k < 24; k++) {
    const aa = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
    const p = shorePoint(ctx, aa, out);
    if (ctx.isWalkable(p.x, p.z)) return { at: p, a: aa };
  }
  return { at: shorePoint(ctx, a, out), a };
}

// ───────────────────────────── 清明 ─────────────────────────────

function drizzle(bag: Bag, n: number): void {
  const ctx = bag.ctx;
  const { THREE, pond } = ctx;
  const still = reducedMotion();
  const count = still ? Math.floor(n / 3) : n;
  const pos = new Float32Array(count * 6);
  const seeds = Array.from({ length: count }, () => ({ x: (Math.random() - 0.5) * 20, y: Math.random() * 12, z: (Math.random() - 0.5) * 20, v: 7 + Math.random() * 3 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = bag.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#8a9aa8', transparent: true, opacity: 0.35, depthWrite: false })));
  lines.frustumCulled = false;
  // rings on the pond
  const rn = still ? 6 : 18;
  const ringGeo = new THREE.RingGeometry(0.8, 1, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = bag.add(new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), rn));
  rings.frustumCulled = false;
  const rs = Array.from({ length: rn }, () => ({ x: 0, z: 0, age: Math.random() * 1.4 }));
  const m = new THREE.Matrix4(), c = new THREE.Color();
  bag.frame((dt) => {
    dt = Math.min(dt, 0.1);
    const p = ctx.camera.position;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      s.y -= s.v * dt * (still ? 0.4 : 1);
      if (s.y < -1) { s.y = 11; s.x = (Math.random() - 0.5) * 20; s.z = (Math.random() - 0.5) * 20; }
      const x = p.x + s.x, z = p.z + s.z, y = p.y - 3 + s.y;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.03; pos[i * 6 + 4] = y + 0.35; pos[i * 6 + 5] = z;
    }
    geo.attributes.position.needsUpdate = true;
    for (let i = 0; i < rn; i++) {
      const r = rs[i];
      r.age += dt;
      if (r.age > 1.4) {
        r.age = 0;
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.9;
        r.x = pond.center.x + Math.cos(a) * pond.radiusX * d; r.z = pond.center.z + Math.sin(a) * pond.radiusZ * d;
      }
      const k = r.age / 1.4, s = 0.05 + k * 0.3;
      m.makeScale(s, 1, s).setPosition(r.x, pond.waterY + 0.02, r.z);
      rings.setMatrixAt(i, m);
      rings.setColorAt(i, c.setScalar((1 - k) * 0.6));
    }
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  });
}

function kiteTexture(ctx: WorldCtx, tint: string): T.CanvasTexture {
  // A swallow kite (沙燕): black-ink outline, one colour, white face.
  return canvasTexture(ctx.THREE, 256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f4efe4';
    g.beginPath();
    g.moveTo(c, 30); // head
    g.quadraticCurveTo(c + 40, 60, c + 20, 90);
    g.quadraticCurveTo(c + 120, 70, c + 125, 120); // right wing
    g.quadraticCurveTo(c + 60, 125, c + 25, 150);
    g.lineTo(c + 55, 240); // right tail
    g.lineTo(c, 175);
    g.lineTo(c - 55, 240);
    g.lineTo(c - 25, 150);
    g.quadraticCurveTo(c - 60, 125, c - 125, 120);
    g.quadraticCurveTo(c - 120, 70, c - 20, 90);
    g.quadraticCurveTo(c - 40, 60, c, 30);
    g.fill();
    g.lineWidth = 5; g.strokeStyle = '#1b1916'; g.stroke();
    g.fillStyle = tint;
    g.beginPath(); g.ellipse(c + 70, 105, 40, 12, -0.15, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(c - 70, 105, 40, 12, 0.15, 0, TAU); g.fill();
    g.fillStyle = '#1b1916';
    g.beginPath(); g.arc(c - 10, 62, 5, 0, TAU); g.arc(c + 10, 62, 5, 0, TAU); g.fill();
    g.fillStyle = tint;
    g.beginPath(); g.arc(c, 125, 16, 0, TAU); g.fill();
  });
}

export const qingming = feature('qingming', async (bag, ctx) => {
  if (!ctx.env.festivals.includes('qingming')) return;
  const { THREE, pond, palette: P } = ctx;
  const rng = dayRng(ctx, '404');
  await loadBrush('清明时节雨纷纷');
  if (bag.disposed) return;
  drizzle(bag, 520);
  ctx.hud.toast('清明时节雨纷纷', 'Qingming: a fine rain is falling', 3600);

  // Kites (纸鸢) high over the garden, on long strings.
  const tints = [P.cinnabar, P.azurite, P.gamboge];
  const kites: { mesh: T.Mesh; line: T.Line; base: T.Vector3; anchor: T.Vector3; ph: number }[] = [];
  const way = entry(ctx);
  const ahead = Math.atan2(-way.dz, -way.dx); // from the arrival, across the pond
  for (let i = 0; i < 3; i++) {
    const a = ahead + (i - 1) * 0.55 + (rng() - 0.5) * 0.2, r = ctx.bounds.radius * (0.7 + rng() * 0.35);
    const base = new THREE.Vector3(pond.center.x + Math.cos(a) * r, 9 + rng() * 6, pond.center.z + Math.sin(a) * r);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshLambertMaterial({ map: kiteTexture(ctx, tints[i]), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, fog: false }));
    bag.add(mesh);
    const anchor = new THREE.Vector3(pond.center.x + Math.cos(a) * r * 1.8, 0, pond.center.z + Math.sin(a) * r * 1.8);
    const lg = new THREE.BufferGeometry().setFromPoints([base, anchor]);
    const line = bag.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#5a5650', transparent: true, opacity: 0.5 })));
    kites.push({ mesh, line, base, anchor, ph: rng() * TAU });
  }
  const still = reducedMotion();
  bag.frame((_dt, t) => {
    for (const k of kites) {
      const tt = still ? 0 : t;
      k.mesh.position.set(k.base.x + Math.sin(tt * 0.3 + k.ph) * 1.5, k.base.y + Math.sin(tt * 0.5 + k.ph) * 0.8, k.base.z);
      k.mesh.lookAt(ctx.camera.position.x, k.mesh.position.y - 6, ctx.camera.position.z);
      k.mesh.rotateZ(Math.sin(tt * 0.9 + k.ph) * 0.18);
      const pa = k.line.geometry.attributes.position as T.BufferAttribute;
      pa.setXYZ(0, k.mesh.position.x, k.mesh.position.y - 0.9, k.mesh.position.z);
      pa.needsUpdate = true;
    }
  });

  // Two weeping willows by the water, and a sprig to wear.
  const strandGeo = new THREE.PlaneGeometry(0.05, 1.7, 1, 4);
  strandGeo.translate(0, -0.85, 0);
  const strandMat = new THREE.MeshLambertMaterial({ color: '#9bb07d', side: THREE.DoubleSide });
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#4d3f31', flatShading: true });
  let willowAt: T.Vector3 | null = null;
  const wa = rng() * TAU;
  for (let w = 0; w < 2; w++) {
    const { at } = landingAt(ctx, wa + w * 2.4, 1.4);
    claims(ctx).push({ x: at.x, z: at.z, r: 1.4 });
    willowAt ??= at;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.6, 6), trunkMat);
    trunk.position.set(at.x, at.y + 1.3, at.z);
    trunk.rotation.z = 0.12;
    bag.add(trunk);
    const n = still ? 36 : 64;
    const strands = bag.add(new THREE.InstancedMesh(strandGeo, strandMat, n));
    const tips = Array.from({ length: n }, () => {
      const a = rng() * TAU, r = 0.3 + rng() * 1.1;
      return { x: at.x + Math.cos(a) * r, y: at.y + 2.4 + rng() * 0.6 - r * 0.25, z: at.z + Math.sin(a) * r, s: 0.6 + rng() * 0.6, ph: rng() * TAU };
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const put = (t: number) => {
      tips.forEach((s, i) => {
        e.set(Math.sin(t * 0.8 + s.ph) * 0.08, s.ph, Math.sin(t * 0.6 + s.ph) * 0.1);
        q.setFromEuler(e);
        m.compose(v.set(s.x, s.y, s.z), q, sc.set(1, s.s, 1));
        strands.setMatrixAt(i, m);
      });
      strands.instanceMatrix.needsUpdate = true;
    };
    put(0);
    if (!still) bag.frame((_dt, t) => put(t));
  }
  if (willowAt) {
    bag.interact({
      id: 'willow', position: willowAt, radius: 1.8,
      labelZh: '垂柳', labelEn: 'Weeping willow', actionZh: '折柳', actionEn: 'Pluck a sprig',
      act() {
        ctx.player.emote('wave');
        ctx.audio.pluck(1, 0.5);
        ctx.hud.showCard({
          titleZh: '清明', titleEn: 'Qingming',
          bodyZh: '清明时节雨纷纷，路上行人欲断魂。\n借问酒家何处有？牧童遥指杏花村。\n——杜牧\n\n清明插柳：折一枝柳，戴在身上，想念也有了去处。',
          bodyEn: 'A fine rain falls at Qingming; travellers on the road feel their hearts ache.\n“Where is an inn?” I ask. A cowherd points far off, to Apricot Blossom Village.\n— Du Mu\n\nAt Qingming people wear a willow sprig: somewhere for missing someone to go.',
        });
      },
    });
  }
});

// ───────────────────────────── 端午 ─────────────────────────────

function dragonBoat(ctx: WorldCtx): { group: T.Group; paddles: T.InstancedMesh; seats: T.Vector3[] } {
  const { THREE, palette: P } = ctx;
  const L = 2.8;
  const hull = new THREE.BoxGeometry(0.46, 0.2, L, 1, 1, 8);
  const hp = hull.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const z = hp.getZ(i), k = Math.abs(z) / (L / 2);
    hp.setX(i, hp.getX(i) * (1 - Math.pow(k, 2.5) * 0.85));
    hp.setY(i, hp.getY(i) + Math.pow(k, 3) * 0.12);
  }
  const parts = [
    part(THREE, hull, P.cinnabar, { p: [0, 0.05, 0] }),
    part(THREE, new THREE.BoxGeometry(0.47, 0.035, L * 0.8), P.gamboge, { p: [0, 0.1, 0] }),
    // dragon head
    part(THREE, new THREE.BoxGeometry(0.12, 0.34, 0.12), P.cinnabar, { p: [0, 0.32, L / 2 + 0.02], r: [0.35, 0, 0] }),
    part(THREE, new THREE.BoxGeometry(0.2, 0.16, 0.3), P.cinnabar, { p: [0, 0.5, L / 2 + 0.16] }),
    part(THREE, new THREE.BoxGeometry(0.16, 0.05, 0.24), P.gamboge, { p: [0, 0.4, L / 2 + 0.2], r: [-0.25, 0, 0] }),
    part(THREE, new THREE.ConeGeometry(0.03, 0.2, 4), P.gamboge, { p: [0.06, 0.64, L / 2 + 0.06], r: [-0.6, 0, -0.2] }),
    part(THREE, new THREE.ConeGeometry(0.03, 0.2, 4), P.gamboge, { p: [-0.06, 0.64, L / 2 + 0.06], r: [-0.6, 0, 0.2] }),
    part(THREE, new THREE.IcosahedronGeometry(0.03, 0), '#ffffff', { p: [0.1, 0.55, L / 2 + 0.22] }),
    part(THREE, new THREE.IcosahedronGeometry(0.03, 0), '#ffffff', { p: [-0.1, 0.55, L / 2 + 0.22] }),
    part(THREE, new THREE.ConeGeometry(0.04, 0.16, 4), P.ink, { p: [0, 0.34, L / 2 + 0.3], r: [2.6, 0, 0] }),
    // tail
    part(THREE, new THREE.ConeGeometry(0.07, 0.5, 5), P.cinnabar, { p: [0, 0.35, -L / 2 - 0.05], r: [-0.6, 0, 0] }),
    part(THREE, new THREE.ConeGeometry(0.05, 0.2, 4), P.gamboge, { p: [0, 0.6, -L / 2 - 0.2], r: [-1.4, 0, 0] }),
    // drum
    part(THREE, new THREE.CylinderGeometry(0.13, 0.13, 0.14, 10), P.cinnabar, { p: [0, 0.24, L / 2 - 0.45] }),
    part(THREE, new THREE.CylinderGeometry(0.135, 0.135, 0.02, 10), '#e8dcc0', { p: [0, 0.32, L / 2 - 0.45] }),
  ];
  const seats: T.Vector3[] = [];
  const rowers: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (const s of [1, -1]) rowers.push([s * 0.12, -0.8 + r * 0.45]);
  for (const [x, z] of rowers) {
    parts.push(part(THREE, new THREE.CylinderGeometry(0.06, 0.08, 0.26, 5), P.indigo, { p: [x, 0.28, z] }));
    parts.push(part(THREE, new THREE.IcosahedronGeometry(0.055, 0), '#d8b48c', { p: [x, 0.46, z] }));
    parts.push(part(THREE, new THREE.CylinderGeometry(0.058, 0.058, 0.02, 6), P.cinnabar, { p: [x, 0.48, z] }));
    seats.push(new THREE.Vector3(x * 2.2, 0.3, z));
  }
  // drummer, facing the crew
  parts.push(part(THREE, new THREE.CylinderGeometry(0.06, 0.08, 0.26, 5), P.ink, { p: [0, 0.28, L / 2 - 0.72] }));
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.055, 0), '#d8b48c', { p: [0, 0.46, L / 2 - 0.72] }));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(THREE, parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const pg = new THREE.BoxGeometry(0.035, 0.012, 0.62);
  pg.translate(0, 0, -0.18);
  const paddles = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: '#8a6a44', flatShading: true }), seats.length);
  group.add(paddles);
  return { group, paddles, seats };
}

const ZONGZI: { zh: string; en: string; lineZh: string; lineEn: string }[] = [
  { zh: '蜜枣粽', en: 'Honey-date zongzi', lineZh: '糯米裹着蜜枣，甜到心里。', lineEn: 'Sticky rice round a honeyed date — sweet all the way through.' },
  { zh: '蛋黄肉粽', en: 'Pork & yolk zongzi', lineZh: '咸蛋黄配五花肉，南方人的心头好。', lineEn: 'Salted yolk and pork belly — a southern favourite.' },
  { zh: '豆沙粽', en: 'Red-bean zongzi', lineZh: '豆沙绵软，粽叶清香。', lineEn: 'Soft bean paste, fragrant leaves.' },
  { zh: '碱水粽', en: 'Alkaline zongzi', lineZh: '金黄透亮，蘸一点白糖。', lineEn: 'Golden and translucent — dip it in sugar.' },
  { zh: '八宝粽', en: 'Eight-treasure zongzi', lineZh: '红豆、莲子、花生、桂圆……一口八样。甜粽还是咸粽？——都吃！', lineEn: 'Beans, lotus seeds, peanuts, longan… Sweet or savoury? Both!' },
];

export const dragonboat = feature('dragonboat', (bag, ctx) => {
  if (!ctx.env.festivals.includes('dragonboat')) return;
  const { THREE, pond } = ctx;
  const rng = dayRng(ctx, '505');
  ctx.hud.toast('端午安康！龙舟正在池中竞渡', 'Happy Dragon Boat Festival! A boat is racing round the pond', 4000);

  // Find a loop on the water clear of bridges and stepping stones (walkable spots inside the pond).
  const blocked: [number, number][] = [];
  for (let x = -pond.radiusX; x <= pond.radiusX; x += 0.4) for (let z = -pond.radiusZ; z <= pond.radiusZ; z += 0.4) {
    const wx = pond.center.x + x, wz = pond.center.z + z;
    if (pondDist(ctx, wx, wz) < 0.98 && ctx.isWalkable(wx, wz)) blocked.push([wx, wz]);
  }
  const rx = pond.radiusX, rz = pond.radiusZ;
  const cands = [
    { cx: 0, cz: 0, ax: rx * 0.7, az: rz * 0.66 },
    { cx: rx * 0.5, cz: 0, ax: rx * 0.34, az: rz * 0.62 },
    { cx: -rx * 0.5, cz: 0, ax: rx * 0.34, az: rz * 0.62 },
    { cx: 0, cz: -rz * 0.48, ax: rx * 0.62, az: rz * 0.34 },
    { cx: 0, cz: rz * 0.48, ax: rx * 0.62, az: rz * 0.34 },
  ];
  let best = cands[0], bestScore = -Infinity;
  for (const c of cands) {
    let hits = 0;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const x = pond.center.x + c.cx + Math.cos(a) * c.ax, z = pond.center.z + c.cz + Math.sin(a) * c.az;
      for (const [bx, bz] of blocked) if (Math.hypot(bx - x, bz - z) < 0.9) { hits++; break; }
    }
    const score = (c.ax + c.az) - hits * 10;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  const { group, paddles, seats } = dragonBoat(ctx);
  bag.add(group);
  const scale = Math.min(1, (Math.min(best.ax, best.az) * 2) / 3.2);
  group.scale.setScalar(Math.max(0.7, scale));
  let u = rng() * TAU, beatT = 0, beats = 0;
  const period = 0.62;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const still = reducedMotion();
  bag.frame((dt) => {
    dt = Math.min(dt, 0.1);
    beatT += dt;
    if (beatT >= period) {
      beatT -= period;
      beats++;
      const d = Math.hypot(group.position.x - ctx.player.position.x, group.position.z - ctx.player.position.z);
      const lvl = Math.min(1, 7 / Math.max(1, d)) * (beats % 4 === 0 ? 0.8 : 0.55);
      sfx.drum(lvl);
    }
    const ph = beatT / period; // 0 = the catch
    const surge = 1 + 0.35 * Math.cos(ph * TAU);
    const perim = Math.PI * (best.ax + best.az);
    u += (1.3 * surge * dt / perim) * TAU * (still ? 0.5 : 1);
    const x = pond.center.x + best.cx + Math.cos(u) * best.ax, z = pond.center.z + best.cz + Math.sin(u) * best.az;
    const tx = -Math.sin(u) * best.ax, tz = Math.cos(u) * best.az;
    group.position.set(x, pond.waterY - 0.03 + Math.sin(ph * TAU) * 0.01, z);
    group.rotation.set(0, Math.atan2(tx, tz), Math.sin(u * 3) * 0.02);
    // paddles: catch, pull back, lift, reach forward
    const sweep = Math.cos(ph * TAU) * 0.7, dip = Math.sin(ph * TAU) > 0 ? -0.5 : -0.15;
    seats.forEach((s, i) => {
      const side = s.x > 0 ? 1 : -1;
      e.set(-sweep * 0.9, 0, side * (0.9 - dip * 0.6), 'XYZ');
      q.setFromEuler(e);
      m.compose(v.set(s.x * 0.55, s.y + 0.02, s.z), q, one);
      paddles.setMatrixAt(i, m);
    });
    paddles.instanceMatrix.needsUpdate = true;
  });

  // Five zongzi to find.
  const zGeo = merge(THREE, [
    part(THREE, new THREE.TetrahedronGeometry(0.11, 0), '#5f7f4f', { s: [1, 1.25, 1], r: [0.3, 0.6, 0] }),
    part(THREE, new THREE.TorusGeometry(0.075, 0.008, 3, 10), '#b58a4a', { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] }),
  ]);
  zGeo.translate(0, 0.09, 0);
  const zMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  bag.own(zGeo); bag.own(zMat);
  const tAt = findSpot(ctx, rng, { clear: 1.6, pondMargin: 2 });
  const table = stoneTable(ctx, tAt, rng() * TAU, 2);
  bag.add(table.group);
  const spots = [new THREE.Vector3(tAt.x + 0.15, table.top, tAt.z), new THREE.Vector3(tAt.x - 0.18, table.top, tAt.z + 0.1)];
  const plants = landmarks(ctx).filter((l) => l.kind === 'plant' && l.plant !== 'lotus');
  for (let i = 0; i < 3; i++) {
    const host = plants[i];
    if (host) {
      const a = rng() * TAU;
      const x = host.position.x + Math.cos(a) * (host.radius + 0.25), z = host.position.z + Math.sin(a) * (host.radius + 0.25);
      if (ctx.isWalkable(x, z)) { spots.push(new THREE.Vector3(x, ctx.groundY(x, z), z)); continue; }
    }
    spots.push(findSpot(ctx, rng, { clear: 0.6 }));
  }
  const gl = glints(bag, spots, '#d9f0a0', 0.45);
  let got = 0;
  const label = { zh: '粽子', en: 'Zongzi' };
  bag.counter('zongzi', label, `0/${spots.length}`);
  spots.forEach((at, i) => {
    const mesh = new THREE.Mesh(zGeo, zMat);
    mesh.position.copy(at);
    mesh.rotation.y = rng() * TAU;
    bag.add(mesh);
    const z = ZONGZI[i];
    const off = bag.interact({
      id: `zongzi-${i}`, position: at, radius: 1.4, labelZh: z.zh, labelEn: z.en, actionZh: '剥开吃', actionEn: 'Unwrap & eat',
      act() {
        off(); got++;
        gl.hide(i);
        ctx.player.emote('eat');
        sfx.rustle(0.5);
        ctx.audio.chime(got);
        burst(bag, at.clone().setY(at.y + 0.1), '#5f7f4f', 10, { speed: 0.9 });
        tween(bag, 600, (k) => mesh.scale.setScalar(1 - k), () => (mesh.visible = false));
        bag.counter('zongzi', label, `${got}/${spots.length}`);
        const done = got === spots.length;
        ctx.hud.showCard({
          titleZh: z.zh, titleEn: z.en,
          bodyZh: done ? `${z.lineZh}\n\n五个粽子都找到了！\n\n路漫漫其修远兮，吾将上下而求索。\n——屈原《离骚》` : z.lineZh,
          bodyEn: done ? `${z.lineEn}\n\nAll five found!\n\n“Long, long is the road, and far; I will seek high and low.”\n— Qu Yuan, Encountering Sorrow` : z.lineEn,
          seal: done ? '端午' : undefined,
        });
      },
    });
  });
});

// ───────────────────────────── 七夕 ─────────────────────────────

function milkyWay(bag: Bag): void {
  const ctx = bag.ctx;
  const { THREE } = ctx;
  const n = new THREE.Vector3(1, 0.35, 0.55).normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const w = n.clone().cross(u).normalize();
  const R = 250;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / 1.22; };
  const dir = (th: number, off: number) => u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th)).addScaledVector(n, off).normalize();
  const make = (count: number, band: number, size: number, bright: number, soft: boolean) => {
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < count * 3 && pos.length < count * 3; i++) {
      const th = Math.random() * TAU;
      const off = band > 0 ? gauss() * band * (0.6 + 0.4 * Math.sin(th * 3)) : (Math.random() - 0.5) * 2;
      const d = band > 0 ? dir(th, off) : new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.05, Math.random() - 0.5).normalize();
      if (d.y < 0.02) continue;
      pos.push(d.x * R, d.y * R, d.z * R);
      c.setHSL(0.58 + Math.random() * 0.1, 0.3, 0.8).multiplyScalar(bright * (0.4 + Math.random() * 0.6));
      col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size, map: glowTexture(THREE, 32, soft ? 0.05 : 0.3), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: soft });
    const p = bag.add(new THREE.Points(geo, mat));
    p.frustumCulled = false;
    p.renderOrder = -8;
    return p;
  };
  const layers = [
    make(1800, 0.07, 2.2, 1, false),
    make(700, 0.09, 14, 0.05, true),
    make(260, 0, 2.6, 1, false),
  ];
  // 织女 Vega and 牛郎 Altair, facing each other across the river.
  const pair = new THREE.BufferGeometry();
  const vega = dir(1.1, 0.3), altair = dir(1.1 + 0.5, -0.28);
  pair.setAttribute('position', new THREE.Float32BufferAttribute([vega.x * R, vega.y * R, vega.z * R, altair.x * R, altair.y * R, altair.z * R], 3));
  const pairPts = bag.add(new THREE.Points(pair, new THREE.PointsMaterial({ size: 7, map: glowTexture(THREE, 32, 0.25), color: '#fff4dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: false })));
  pairPts.frustumCulled = false;
  layers.push(pairPts);
  bag.frame(() => {
    const on = ctx.sky.isNight();
    for (const l of layers) { l.visible = on; l.position.copy(ctx.camera.position); }
  });
}

export const qixi = feature('qixi', (bag, ctx) => {
  if (!ctx.env.festivals.includes('qixi')) return;
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '707');
  ctx.sky.forceNight(true);
  bag.onDispose(() => ctx.sky.forceNight(false));
  ctx.hud.toast('七夕 · 今夜鹊桥相会', 'Qixi: tonight the magpies build their bridge', 4000);
  milkyWay(bag);
  fireflySwarm(bag, ctx, 50, true);

  // A bridge of magpies across the pond, east to west.
  const A = landingAt(ctx, 0, 0.3).at, B = landingAt(ctx, Math.PI, 0.3).at;
  const n = reducedMotion() ? 24 : 44;
  const geo = birdGeometry(THREE, { body: '#1f1e1c', belly: '#f1ede4', wing: '#26313d', tip: '#f1ede4', beak: P.ink });
  const attrs = instanceAttrs(THREE, geo, n, (i) => i * 0.9);
  const anim = wingMaterial(THREE, { rate: 20, angle: 0.8, lift: 0.1, fold: 0.3 });
  const mesh = bag.add(new THREE.InstancedMesh(geo, anim.material, n));
  mesh.frustumCulled = false;
  const span = A.distanceTo(B);
  const birds = Array.from({ length: n }, (_, i) => {
    const s = (i + 0.5) / n;
    const lat = (rng() - 0.5) * 0.7;
    const a = rng() * TAU;
    return { s, lat, from: new THREE.Vector3(Math.cos(a) * 40, 18 + rng() * 10, Math.sin(a) * 40), delay: rng() * 4, dur: 4 + rng() * 3, face: (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.6, ph: rng() * TAU };
  });
  const dirAB = B.clone().sub(A).normalize();
  const sideV = new THREE.Vector3(-dirAB.z, 0, dirAB.x);
  const headAB = Math.atan2(dirAB.x, dirAB.z);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), tgt = new THREE.Vector3(), sc = new THREE.Vector3(2, 2, 2);
  // at night the magpies shine faintly, a bridge of starlight
  const gPos = new Float32Array(n * 3);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  const gPts = bag.add(new THREE.Points(gGeo, new THREE.PointsMaterial({ size: 0.9, map: glowTexture(THREE, 64, 0.1), color: '#b8c8e8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  gPts.frustumCulled = false;
  let t0 = -1;
  bag.frame((_dt, t) => {
    if (t0 < 0) t0 = t;
    const tt = t - t0;
    anim.uniforms.uTime.value = t;
    for (let i = 0; i < n; i++) {
      const b = birds[i];
      tgt.lerpVectors(A, B, b.s).addScaledVector(sideV, b.lat);
      tgt.y = Math.max(A.y, B.y) + 1.2 + Math.sin(b.s * Math.PI) * Math.min(2.6, span * 0.2) + Math.sin(t * 2 + b.ph) * 0.05;
      const k = Math.min(1, Math.max(0, (tt - b.delay) / b.dur));
      const ek = 1 - Math.pow(1 - k, 3);
      v.lerpVectors(b.from, tgt, ek);
      let head = headAB + b.face;
      if (k < 1) head = Math.atan2(tgt.x - b.from.x, tgt.z - b.from.z);
      e.set(0, head, Math.sin(t * 1.3 + b.ph) * 0.1);
      q.setFromEuler(e);
      m.compose(v, q, sc);
      mesh.setMatrixAt(i, m);
      gPos[i * 3] = v.x; gPos[i * 3 + 1] = v.y + 0.05; gPos[i * 3 + 2] = v.z;
      attrs.amp.setX(i, k < 1 ? 1 : 0.35 + 0.25 * Math.sin(t * 0.7 + b.ph));
    }
    attrs.amp.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    gGeo.attributes.position.needsUpdate = true;
  });
  bag.interact({
    id: 'magpie-bridge', position: A, radius: 2.2,
    labelZh: '鹊桥', labelEn: 'The magpie bridge', actionZh: '仰望', actionEn: 'Look up',
    act() {
      ctx.player.emote('wave');
      ctx.audio.chime(4);
      ctx.hud.showCard({
        titleZh: '鹊桥仙', titleEn: 'Immortals at the Magpie Bridge',
        bodyZh: '纤云弄巧，飞星传恨，银汉迢迢暗度。\n金风玉露一相逢，便胜却人间无数。\n……\n两情若是久长时，又岂在朝朝暮暮。\n——秦观',
        bodyEn: 'Fine clouds weave their patterns, shooting stars carry their longing across the endless Silver River.\nOne meeting in the golden wind and jade dew outshines countless ones on earth…\nIf love is to last, it need not be every morning and every night.\n— Qin Guan',
        seal: '七夕',
      });
    },
  });
});

// ───────────────────────────── 重阳 ─────────────────────────────

export const chongyang = feature('chongyang', (bag, ctx) => {
  if (!ctx.env.festivals.includes('chongyang')) return;
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '909');
  ctx.hud.toast('重阳 · 登高去！高处有东西等你', 'Double Ninth: climb high — something waits at the top', 4200);

  // Potted chrysanthemums in two groups.
  const parts: T.BufferGeometry[] = [];
  const blooms = [P.gamboge, '#f4efe4', P.rouge, '#e0913a', P.gamboge, '#f4efe4', '#d9b3d0'];
  for (let g = 0; g < 2; g++) {
    const c = findSpot(ctx, rng, { clear: 1.8, pondMargin: 1.5, maxR: ctx.bounds.radius * 0.7 });
    const k = g === 0 ? 4 : 3;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU + rng(), r = k === 4 ? 0.55 : 0.45;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = ctx.groundY(x, z);
      const potH = 0.3 + rng() * 0.1;
      parts.push(part(THREE, new THREE.CylinderGeometry(0.2, 0.14, potH, 8), g ? P.indigo : '#8a5a3a', { p: [x, y + potH / 2, z] }));
      parts.push(part(THREE, new THREE.IcosahedronGeometry(0.26, 0), '#4f6a4a', { p: [x, y + potH + 0.16, z], s: [1, 0.8, 1] }));
      const col = blooms[(g * 4 + i) % blooms.length];
      for (let f = 0; f < 6; f++) {
        const fa = rng() * TAU, fr = rng() * 0.18;
        const fx = x + Math.cos(fa) * fr, fz = z + Math.sin(fa) * fr, fy = y + potH + 0.3 + rng() * 0.12;
        parts.push(part(THREE, new THREE.IcosahedronGeometry(0.075, 0), col, { p: [fx, fy, fz], s: [1, 0.55, 1] }));
        parts.push(part(THREE, new THREE.IcosahedronGeometry(0.03, 0), P.ochre, { p: [fx, fy + 0.035, fz] }));
      }
    }
  }
  bag.add(new THREE.Mesh(merge(THREE, parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // The highest ground you can walk to: a stele, a sprig of dogwood (茱萸), a gourd of wine.
  let top = new THREE.Vector3(0, -Infinity, 0);
  const R = ctx.bounds.radius;
  for (let x = -R; x <= R; x += 0.8) for (let z = -R; z <= R; z += 0.8) {
    if (Math.hypot(x, z) > R * 0.95 || !ctx.isWalkable(x, z)) continue;
    const y = ctx.groundY(x, z);
    if (y > top.y) top.set(x, y, z);
  }
  if (!Number.isFinite(top.y)) top = findSpot(ctx, rng);
  const stele = findSpot(ctx, rng, { near: { x: top.x, z: top.z, r: 1.2, min: 0.5 }, clear: 0.4 });
  claims(ctx).push({ x: stele.x, z: stele.z, r: 0.6 });
  const steleTex = canvasTexture(THREE, 64, 192, (g, w, h) => {
    g.fillStyle = '#9a968a'; g.fillRect(0, 0, w, h);
    g.fillStyle = P.cinnabar; g.font = `44px ${BRUSH_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['登', '高'].forEach((c, i) => g.fillText(c, w / 2, h * (0.32 + i * 0.36)));
  });
  const stone = new THREE.MeshLambertMaterial({ color: '#8f8b80', flatShading: true });
  const sMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.12), [stone, stone, stone, stone, new THREE.MeshLambertMaterial({ map: steleTex }), stone]);
  sMesh.position.set(stele.x, stele.y + 0.47, stele.z);
  sMesh.rotation.y = Math.atan2(-stele.x, -stele.z);
  bag.add(sMesh);
  const sprig = new THREE.Mesh(merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.008, 0.01, 0.4, 3), '#4a3b2c', { p: [0, 0.2, 0], r: [0, 0, 0.2] }),
    ...Array.from({ length: 7 }, (_, i) => part(THREE, new THREE.IcosahedronGeometry(0.025, 0), P.cinnabar, { p: [0.03 + Math.cos(i) * 0.05, 0.36 + Math.sin(i * 2) * 0.04, Math.sin(i) * 0.05] })),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  sprig.position.set(stele.x + 0.25, stele.y, stele.z + 0.1);
  bag.add(sprig);
  const gourd = new THREE.Mesh(merge(THREE, [
    part(THREE, new THREE.SphereGeometry(0.11, 8, 6), '#c9963e', { p: [0, 0.11, 0] }),
    part(THREE, new THREE.SphereGeometry(0.075, 8, 6), '#c9963e', { p: [0, 0.27, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.02, 0.025, 0.06, 5), P.cinnabar, { p: [0, 0.36, 0] }),
    part(THREE, new THREE.TorusGeometry(0.05, 0.01, 3, 8), P.cinnabar, { p: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] }),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  gourd.position.set(stele.x - 0.3, stele.y, stele.z + 0.15);
  bag.add(gourd);
  glints(bag, [new THREE.Vector3(stele.x, stele.y + 0.8, stele.z)], '#ffcf7a', 0.9);
  let climbed = false;
  bag.frame(() => {
    if (climbed) return;
    const p = ctx.player.position;
    if (Math.hypot(p.x - stele.x, p.z - stele.z) < 2) {
      climbed = true;
      ctx.player.emote('wave');
      ctx.audio.chime(5);
      ctx.hud.showCard({
        titleZh: '登高', titleEn: 'Climbing high',
        bodyZh: '独在异乡为异客，每逢佳节倍思亲。\n遥知兄弟登高处，遍插茱萸少一人。\n——王维《九月九日忆山东兄弟》',
        bodyEn: 'A stranger alone in a strange land, at every festival I miss my family twice as much.\nI know that where my brothers climb today, wearing dogwood, one of us is missing.\n— Wang Wei, Remembering My Brothers on the Double Ninth',
        seal: '重阳',
      });
    }
  });
  let drank = 0;
  bag.interact({
    id: 'chrysanthemum-wine', position: gourd.position, radius: 1.4,
    labelZh: '菊花酒', labelEn: 'Chrysanthemum wine', actionZh: '饮一口', actionEn: 'Take a sip',
    act() {
      drank++;
      ctx.player.emote('eat');
      ctx.audio.pluck(drank % 5, 0.5);
      if (drank === 1) ctx.hud.showCard({ titleZh: '菊花酒', titleEn: 'Chrysanthemum wine', bodyZh: '重阳饮菊花酒，祈愿长寿。\n\n待到重阳日，还来就菊花。——孟浩然', bodyEn: 'On the Double Ninth one drinks chrysanthemum wine, for a long life.\n\n“When the Double Ninth comes, I will come back for the chrysanthemums.” — Meng Haoran' });
      else ctx.hud.toast(drank > 3 ? '微醺……园子在轻轻晃' : '清香微苦', drank > 3 ? 'Tipsy… the garden sways gently' : 'Fragrant, a little bitter', 2000);
    },
  });
});

// ───────────────────────────── 冬至 · 腊八 ─────────────────────────────

function snowfall(bag: Bag, n: number): void {
  const ctx = bag.ctx;
  const { THREE } = ctx;
  const still = reducedMotion();
  const count = still ? Math.floor(n / 3) : n;
  const pos = new Float32Array(count * 3);
  const seeds = Array.from({ length: count }, () => ({ x: (Math.random() - 0.5) * 26, y: Math.random() * 14, z: (Math.random() - 0.5) * 26, v: 0.5 + Math.random() * 0.6, ph: Math.random() * TAU }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const pts = bag.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, map: glowTexture(THREE, 32, 0.4), color: '#ffffff', transparent: true, depthWrite: false })));
  pts.frustumCulled = false;
  bag.frame((dt, t) => {
    dt = Math.min(dt, 0.1);
    const c = ctx.camera.position;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      s.y -= s.v * dt;
      if (s.y < -2) { s.y = 12; s.x = (Math.random() - 0.5) * 26; s.z = (Math.random() - 0.5) * 26; }
      pos[i * 3] = c.x + s.x + Math.sin(t * 0.7 + s.ph) * 0.4;
      pos[i * 3 + 1] = c.y - 4 + s.y;
      pos[i * 3 + 2] = c.z + s.z + Math.cos(t * 0.5 + s.ph) * 0.3;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

function snowCover(bag: Bag, rng: () => number): void {
  const ctx = bag.ctx;
  const { THREE } = ctx;
  const n = 170;
  const g = new THREE.PlaneGeometry(2, 2);
  g.rotateX(-Math.PI / 2);
  // soft-edged drifts, a little uneven, like thin white wash on the paper
  const tex = canvasTexture(THREE, 128, 128, (c, w) => {
    const r = w / 2;
    for (let k = 0; k < 5; k++) {
      const x = r + Math.cos(k * 1.7) * r * 0.25, y = r + Math.sin(k * 2.3) * r * 0.25;
      const grad = c.createRadialGradient(x, y, 0, x, y, r * 0.75);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, w);
    }
  });
  const mesh = bag.add(new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#fbfaf6', map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), n));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const at = findSpot(ctx, rng, { noClaim: true, pondMargin: 0.2, tries: 8 });
    const r = 0.5 + rng() * 1.3;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
    m.compose(new THREE.Vector3(at.x, at.y + 0.03, at.z), q, s.set(r, 1, r * (0.6 + rng() * 0.4)));
    mesh.setMatrixAt(i, m);
  }
}

export const winter = feature('winter', async (bag, ctx) => {
  const f = ctx.env.festivals;
  const dz = f.includes('dongzhi'), lb = f.includes('laba');
  if (!dz && !lb) return;
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '1222');
  await loadBrush('亭前垂柳珍重待春风九九消寒图');
  if (bag.disposed) return;
  snowfall(bag, 900);
  snowCover(bag, rng);
  ctx.hud.toast(dz ? '冬至 · 白昼最短的一天' : '腊八 · 过了腊八就是年', dz ? 'Winter Solstice: the shortest day' : 'Laba: after Laba, the New Year is near', 4000);

  const tAt = findSpot(ctx, rng, { clear: 1.6, pondMargin: 2 });
  const table = stoneTable(ctx, tAt, rng() * TAU);
  bag.add(table.group);
  const b = bowl(ctx, lb && !dz ? '#8c4a3a' : '#e9e0cc', 0.17);
  b.position.set(tAt.x, table.top, tAt.z);
  bag.add(b);
  let food: T.Object3D | null = null;
  if (dz) {
    // dumplings: plump crescents
    const dg = new THREE.SphereGeometry(0.05, 8, 4, 0, TAU, 0, Math.PI / 2);
    dg.scale(1.3, 0.7, 0.7);
    const dumplings = new THREE.InstancedMesh(dg, new THREE.MeshLambertMaterial({ color: '#f6f0e2', flatShading: true }), 6);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI / 2);
      m.compose(new THREE.Vector3(tAt.x + Math.cos(a) * 0.075, table.top + 0.105, tAt.z + Math.sin(a) * 0.075), q, new THREE.Vector3(1, 1, 1));
      dumplings.setMatrixAt(i, m);
    }
    bag.add(dumplings);
    food = dumplings;
  } else {
    const beans = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.014, 0), new THREE.MeshLambertMaterial({ color: '#5a2a24' }), 14);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 14; i++) { const a = rng() * TAU, r = rng() * 0.11; m.makeTranslation(tAt.x + Math.cos(a) * r, table.top + 0.105, tAt.z + Math.sin(a) * r); beans.setMatrixAt(i, m); }
    bag.add(beans);
    food = beans;
  }
  // steam
  const steamMat = new THREE.SpriteMaterial({ map: glowTexture(THREE, 64, 0.2), color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false });
  const steam = Array.from({ length: 4 }, () => bag.add(new THREE.Sprite(steamMat)));
  let ate = false;
  bag.frame((_dt, t) => {
    steam.forEach((s, i) => {
      const k = (t * 0.25 + i / 4) % 1;
      s.visible = !ate;
      s.position.set(tAt.x + Math.sin(k * 5 + i) * 0.05, table.top + 0.15 + k * 0.6, tAt.z);
      s.scale.setScalar(0.08 + k * 0.25);
    });
  });
  bag.interact({
    id: 'winter-bowl', position: new THREE.Vector3(tAt.x, table.top, tAt.z), radius: 1.6,
    labelZh: dz ? '一碗饺子' : '一碗腊八粥', labelEn: dz ? 'A bowl of dumplings' : 'A bowl of laba porridge',
    actionZh: '趁热吃', actionEn: 'Eat it warm',
    act() {
      if (ate) { ctx.hud.toast('吃饱了，身上暖暖的', 'Full, and warm all over', 1600); return; }
      ate = true;
      ctx.player.emote('eat');
      ctx.audio.chime(3);
      if (food) food.visible = false;
      burst(bag, new THREE.Vector3(tAt.x, table.top + 0.1, tAt.z), '#ffffff', 8, { speed: 0.5, size: 0.015 });
      ctx.hud.showCard(dz ? {
        titleZh: '冬至饺子', titleEn: 'Solstice dumplings',
        bodyZh: '“冬至不端饺子碗，冻掉耳朵没人管。”\n\n今天白昼最短。从明天起，一天会比一天长一点。',
        bodyEn: '“Skip the dumplings on the solstice, and your ears will freeze off,” as the saying goes.\n\nToday is the shortest day. From tomorrow, each day a little longer.',
      } : {
        titleZh: '腊八粥', titleEn: 'Laba porridge',
        bodyZh: '红豆、糯米、红枣、莲子、花生、桂圆、薏米、栗子——八样好东西熬一锅。\n\n过了腊八就是年。',
        bodyEn: 'Red beans, glutinous rice, jujubes, lotus seeds, peanuts, longan, barley, chestnuts: eight good things in one pot.\n\nAfter Laba, the New Year is near.',
      });
    },
  });

  if (dz) {
    // 九九消寒图: nine characters of nine strokes; paint one stroke a day for 81 days, and it is spring.
    const at = findSpot(ctx, rng, { near: { x: tAt.x, z: tAt.z, r: 3, min: 1.6 }, clear: 0.6 });
    const tex = canvasTexture(THREE, 384, 128, (g, w, h) => {
      g.fillStyle = '#f1e9d8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1b1916'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
      const chars = [...'亭前垂柳珍重待春风'];
      g.font = `36px ${BRUSH_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      chars.forEach((c, i) => {
        const x = 24 + (i % 9) * ((w - 48) / 8.3), y = h * 0.58;
        g.lineWidth = 1.2; g.strokeStyle = P.cinnabar; g.strokeText(c, x, y);
        if (i === 0) { g.fillStyle = 'rgba(192,65,47,0.35)'; g.fillText(c, x, y); }
      });
      g.fillStyle = '#1b1916'; g.font = `16px ${TEXT_FONT}`; g.fillText('九九消寒图', w / 2, 22);
    });
    const board = new THREE.Mesh(merge(THREE, [
      part(THREE, new THREE.BoxGeometry(0.06, 1.3, 0.06), '#4a3c2b', { p: [-0.55, 0.65, -0.03] }),
      part(THREE, new THREE.BoxGeometry(0.06, 1.3, 0.06), '#4a3c2b', { p: [0.55, 0.65, -0.03] }),
    ]), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const face = Math.atan2(tAt.x - at.x, tAt.z - at.z);
    board.position.copy(at);
    board.rotation.y = face;
    bag.add(board);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    sheet.position.set(at.x, at.y + 1.05, at.z);
    sheet.rotation.y = face;
    bag.add(sheet);
    bag.interact({
      id: 'jiujiu', position: at, radius: 1.6,
      labelZh: '九九消寒图', labelEn: 'Chart of Nine Nines', actionZh: '描一笔', actionEn: 'Paint a stroke',
      act() {
        ctx.audio.pluck(0, 0.5);
        ctx.hud.showCard({
          titleZh: '九九消寒图', titleEn: 'Chart for Dispelling the Cold',
          bodyZh: '“亭前垂柳珍重待春风”——九个字，每字九画。\n从冬至起，每天描一笔，八十一天描完，春天就来了。\n\n和你的园子一样：一天一笔。',
          bodyEn: 'Nine characters of nine strokes each — “the willow by the pavilion patiently awaits the spring wind”.\nFrom the solstice, paint one stroke a day; after 81 days the chart is done, and spring is here.\n\nLike your garden: one stroke a day.',
          seal: '冬至',
        });
      },
    });
  }
});

export const SEASONAL = [qingming, dragonboat, qixi, chongyang, winter];
