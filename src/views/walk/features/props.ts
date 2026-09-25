// Shared festival props: rows of red lanterns, stone tables, plates, twinkling glints, crumb bursts,
// flat rocks, bowls — low-poly, flat-shaded, in the ink palette.
import type * as T from 'three';
import type { WorldCtx } from '../types';
import { Bag, glowTexture, reducedMotion, shorePoint, claims, pondDist } from './kit';
import { merge, part } from './geo';

const TAU = Math.PI * 2;

// ───────────────────────────── red lanterns ─────────────────────────────

export interface LanternRowOpts {
  /** Paper colour (default cinnabar). */
  color?: string;
  /** Post height. */
  height?: number;
  /** Always lit, or only at night. */
  alwaysLit?: boolean;
  /** Lantern size multiplier. */
  size?: number;
}

/** Red lanterns hung from bamboo posts at `spots`, arms reaching toward `face` (the pond, the path). */
export function lanternRow(bag: Bag, spots: T.Vector3[], face: T.Vector3 | null, o: LanternRowOpts = {}): { lanterns: T.Vector3[] } {
  const ctx = bag.ctx;
  const { THREE, palette: P } = ctx;
  const n = spots.length;
  const H = o.height ?? 2.2, S = o.size ?? 1;
  const postGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.035, 0.05, H, 5), '#5c4a33', { p: [0, H / 2, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.025, 0.025, 0.55, 4), '#5c4a33', { p: [0.26, H - 0.08, 0], r: [0, 0, Math.PI / 2] }),
    part(THREE, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 5), '#4a3c2b', { p: [0, 0.05, 0] }),
  ]);
  const posts = bag.add(new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n));
  const paperGeo = new THREE.SphereGeometry(0.22 * S, 10, 7);
  paperGeo.scale(1, 0.82, 1);
  // Ribs: darken alternate latitude bands a touch.
  const paperMat = new THREE.MeshLambertMaterial({ color: o.color ?? P.cinnabar, flatShading: true, emissive: new THREE.Color('#ff7a3a'), emissiveIntensity: 0 });
  const paper = bag.add(new THREE.InstancedMesh(paperGeo, paperMat, n));
  const trimGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.1 * S, 0.12 * S, 0.06 * S, 8), '#b8892f', { p: [0, 0.18 * S, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.12 * S, 0.1 * S, 0.06 * S, 8), '#b8892f', { p: [0, -0.18 * S, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.3 * S, 3), P.ink, { p: [0, 0.34 * S, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.025 * S, 0.045 * S, 0.24 * S, 6), P.cinnabar, { p: [0, -0.33 * S, 0] }),
  ]);
  const trim = bag.add(new THREE.InstancedMesh(trimGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n));
  const glowPos = new Float32Array(n * 3);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({
    size: 1.5 * S, map: glowTexture(THREE, 64, 0.1), color: '#ff9a4a', transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  const glow = bag.add(new THREE.Points(glowGeo, glowMat));
  glow.frustumCulled = false;

  const hang: { x: number; y: number; z: number; rot: number; ph: number }[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const centres: T.Vector3[] = [];
  spots.forEach((s, i) => {
    const rot = face ? Math.atan2(-(face.z - s.z), face.x - s.x) : (i * 2.4) % TAU; // arm (+x) toward face
    e.set(0, rot, 0);
    q.setFromEuler(e);
    m.compose(s, q, one);
    posts.setMatrixAt(i, m);
    const ax = s.x + Math.cos(rot) * 0.5, az = s.z - Math.sin(rot) * 0.5;
    hang.push({ x: ax, y: s.y + H - 0.08, z: az, rot, ph: i * 1.7 });
    centres.push(new THREE.Vector3(ax, s.y + H - 0.08 - 0.42 * S, az));
  });
  const still = reducedMotion();
  const place = (t: number) => {
    for (let i = 0; i < n; i++) {
      const h = hang[i];
      const sw = still ? 0 : Math.sin(t * 0.9 + h.ph) * 0.06, sw2 = still ? 0 : Math.cos(t * 0.7 + h.ph) * 0.04;
      e.set(sw2, h.rot, sw);
      q.setFromEuler(e);
      // pivot at the hook: centre = hook + R·(0, -drop, 0)
      v.set(0, -0.42 * S, 0).applyQuaternion(q);
      const cx = h.x + v.x, cy = h.y + v.y, cz = h.z + v.z;
      m.compose(v.set(cx, cy, cz), q, one);
      paper.setMatrixAt(i, m);
      trim.setMatrixAt(i, m);
      glowPos[i * 3] = cx; glowPos[i * 3 + 1] = cy; glowPos[i * 3 + 2] = cz;
    }
    paper.instanceMatrix.needsUpdate = true;
    trim.instanceMatrix.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = true;
  };
  place(0);
  let lit = -1;
  bag.frame((_dt, t) => {
    if (!still) place(t);
    const want = o.alwaysLit || ctx.sky.isNight() ? 1 : 0;
    if (lit < 0) lit = want;
    lit += (want - lit) * 0.05;
    const flick = 0.92 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 11.1) * 0.03;
    paperMat.emissiveIntensity = lit * 0.85 * flick;
    glowMat.opacity = lit * 0.55 * flick;
    glow.visible = lit > 0.02;
  });
  return { lanterns: centres };
}

/** `n` posts spaced round the pond, `out` metres from the shore, on walkable ground. */
export function aroundPond(ctx: WorldCtx, n: number, out: number, phase = 0): T.Vector3[] {
  const res: T.Vector3[] = [];
  const list = claims(ctx);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) {
      const a = phase + (i / n) * TAU + k * 0.09 * (k % 2 ? 1 : -1);
      const p = shorePoint(ctx, a, out + (k > 3 ? 0.8 : 0));
      if (!ctx.isWalkable(p.x, p.z)) continue;
      if (list.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r + 0.35)) continue;
      list.push({ x: p.x, z: p.z, r: 0.4 });
      res.push(p);
      break;
    }
  }
  return res;
}

// ───────────────────────────── furniture ─────────────────────────────

const STONE = '#8f8b80', STONE_D = '#77736a';

/** A drum-shaped stone table with stools; returns the group and the tabletop height. */
export function stoneTable(ctx: WorldCtx, at: T.Vector3, rot = 0, stools = 3): { group: T.Group; top: number } {
  const { THREE } = ctx;
  const parts = [
    part(THREE, new THREE.CylinderGeometry(0.55, 0.52, 0.1, 9), STONE, { p: [0, 0.72, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.2, 0.3, 0.68, 7), STONE_D, { p: [0, 0.34, 0] }),
  ];
  for (let i = 0; i < stools; i++) {
    const a = (i / stools) * TAU + 0.5;
    parts.push(part(THREE, new THREE.CylinderGeometry(0.17, 0.2, 0.42, 7), STONE, { p: [Math.cos(a) * 0.95, 0.21, Math.sin(a) * 0.95] }));
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge(THREE, parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  g.position.copy(at);
  g.rotation.y = rot;
  return { group: g, top: at.y + 0.77 };
}

/** A white porcelain plate with an indigo rim. */
export function plate(ctx: WorldCtx, r = 0.24): T.Mesh {
  const { THREE, palette: P } = ctx;
  const geo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(r, r * 0.7, 0.025, 14), '#f3efe6', { p: [0, 0.0125, 0] }),
    part(THREE, new THREE.TorusGeometry(r * 0.98, 0.008, 3, 20), P.indigo, { p: [0, 0.026, 0], r: [Math.PI / 2, 0, 0] }),
  ]);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** A little celadon teapot with two cups. */
export function teaSet(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  const cel = '#9fb5a2';
  const parts = [
    part(THREE, new THREE.SphereGeometry(0.09, 8, 6), cel, { p: [0, 0.08, 0], s: [1, 0.85, 1] }),
    part(THREE, new THREE.CylinderGeometry(0.035, 0.045, 0.03, 8), cel, { p: [0, 0.16, 0] }),
    part(THREE, new THREE.ConeGeometry(0.018, 0.1, 5), cel, { p: [0.1, 0.1, 0], r: [0, 0, -1.0] }),
    part(THREE, new THREE.TorusGeometry(0.045, 0.01, 4, 8, Math.PI), cel, { p: [-0.09, 0.09, 0], r: [0, 0, Math.PI / 2] }),
  ];
  for (const [x, z] of [[0.2, 0.08], [0.16, -0.14]]) {
    parts.push(part(THREE, new THREE.CylinderGeometry(0.035, 0.025, 0.04, 8), '#f3efe6', { p: [x, 0.02, z] }));
  }
  return new THREE.Mesh(merge(THREE, parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** A low, flat boulder by the water. */
export function flatRock(ctx: WorldCtx, at: T.Vector3, r = 0.7): { mesh: T.Mesh; top: number } {
  const { THREE } = ctx;
  const g = new THREE.DodecahedronGeometry(r, 0);
  g.scale(1.1, 0.45, 0.9);
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#7d786d', flatShading: true }));
  mesh.position.set(at.x, at.y + r * 0.2, at.z);
  mesh.rotation.y = at.x * 1.3;
  return { mesh, top: at.y + r * 0.2 + r * 0.42 };
}

/** A round lotus leaf floating on the water. */
export function lotusPad(ctx: WorldCtx, r = 0.55): T.Mesh {
  const { THREE, palette: P } = ctx;
  const g = new THREE.CircleGeometry(r, 14, 0.25, TAU - 0.25);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: P.malachite, flatShading: true, side: THREE.DoubleSide }));
  return mesh;
}

/** A bowl (lathe), e.g. for 汤圆, dumplings, laba porridge. `fill` is the colour of what's inside. */
export function bowl(ctx: WorldCtx, fill: string, r = 0.14): T.Mesh {
  const { THREE, palette: P } = ctx;
  const pts = [
    new THREE.Vector2(r * 0.45, 0), new THREE.Vector2(r * 0.5, 0.01), new THREE.Vector2(r * 0.85, r * 0.35),
    new THREE.Vector2(r, r * 0.72), new THREE.Vector2(r * 0.94, r * 0.74), new THREE.Vector2(r * 0.8, r * 0.4), new THREE.Vector2(0.001, r * 0.3),
  ];
  const lathe = new THREE.LatheGeometry(pts, 14);
  const geo = merge(THREE, [
    part(THREE, lathe, '#f1ece0'),
    part(THREE, new THREE.TorusGeometry(r * 0.985, 0.006, 3, 18), P.indigo, { p: [0, r * 0.73, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.CircleGeometry(r * 0.9, 14), fill, { p: [0, r * 0.6, 0], r: [-Math.PI / 2, 0, 0] }),
  ]);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
}

// ───────────────────────────── glints & crumbs ─────────────────────────────

/** Twinkling motes above collectibles so they can be found from afar; `hide(i)` when collected. */
export function glints(bag: Bag, spots: T.Vector3[], color = '#ffd98a', size = 0.5): { hide(i: number): void; move(i: number, p: T.Vector3): void } {
  const { THREE } = bag.ctx;
  const n = spots.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const live = spots.map(() => true);
  spots.forEach((s, i) => { pos[i * 3] = s.x; pos[i * 3 + 1] = s.y + 0.35; pos[i * 3 + 2] = s.z; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, map: glowTexture(THREE, 64, 0.04), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = bag.add(new THREE.Points(geo, mat));
  pts.frustumCulled = false;
  const c = new THREE.Color(color);
  bag.frame((_dt, t) => {
    for (let i = 0; i < n; i++) {
      const k = live[i] ? Math.pow(Math.max(0, Math.sin(t * 1.3 + i * 2.1)), 6) * 0.9 + 0.12 : 0;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    geo.attributes.color.needsUpdate = true;
  });
  return {
    hide(i) { live[i] = false; },
    move(i, p) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y + 0.35; pos[i * 3 + 2] = p.z; geo.attributes.position.needsUpdate = true; },
  };
}

/** A small burst of crumbs (or petals, confetti) that fall and settle, then vanish. */
export function burst(bag: Bag, at: T.Vector3, color: string, n = 16, o: { speed?: number; size?: number; life?: number } = {}): void {
  const { THREE } = bag.ctx;
  const size = o.size ?? 0.025;
  const mesh = bag.add(new THREE.InstancedMesh(new THREE.TetrahedronGeometry(size, 0), new THREE.MeshLambertMaterial({ color, flatShading: true }), n));
  mesh.frustumCulled = false;
  const sp = o.speed ?? 1.2;
  const ps = Array.from({ length: n }, () => {
    const a = Math.random() * TAU, u = Math.random();
    return { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp * (0.3 + u * 0.7), vy: sp * (0.6 + Math.random() * 0.9), vz: Math.sin(a) * sp * (0.3 + u * 0.7), r: Math.random() * TAU };
  });
  const floor = at.y - 0.05;
  let age = 0;
  const life = o.life ?? 1.6;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let off: (() => void) | null = bag.ctx.onFrame((dt) => {
    age += dt;
    const k = Math.max(0, 1 - Math.max(0, age - life * 0.6) / (life * 0.4));
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      if (p.y > floor) {
        p.vy -= 6 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.r += dt * 8;
      } else p.y = floor;
      e.set(p.r, p.r * 0.7, 0);
      q.setFromEuler(e);
      s.setScalar(k);
      m.compose(v.set(p.x, p.y, p.z), q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (age > life) { off?.(); off = null; bag.drop(mesh); }
  });
  bag.onDispose(() => { off?.(); off = null; });
}

/** True when (x, z) is on land a comfortable distance from the water. */
export const dryLand = (ctx: WorldCtx, x: number, z: number, margin = 0.8) => ctx.isWalkable(x, z) && pondDist(ctx, x, z, margin) >= 1;
