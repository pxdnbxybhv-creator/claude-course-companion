// Shared festival props: paper lanterns, stone tables, plates, twinkling glints, crumb bursts, flat
// rocks, bowls — toon-washed and ink-outlined like the core's buildings, in the ink palette.
import type * as T from 'three';
import type { WorldCtx } from '../types';
import { Bag, claims, entry, glowTexture, inked, lanternMat, outlineMat, propMat, reducedMotion, reflects, shorePoint } from './kit';
import { merge, part } from './geo';

const TAU = Math.PI * 2;

// ───────────────────────────── paper lanterns ─────────────────────────────

export interface Hook { x: number; y: number; z: number }

export interface LanternOpts {
  /** Paper colour of each lantern (default: warm apricot / ochre paper; pass one cinnabar as the accent). */
  colors?: string[];
  /** Always lit, or only at night. */
  alwaysLit?: boolean;
  /** Lantern size multiplier. */
  size?: number;
  /** Cord length from the hook to the lantern's top, metres. */
  drop?: number;
}

/** Warm paper, not red: most lanterns sit quietly in the ink; one cinnabar is the accent. */
export const PAPER_APRICOT = '#e6c48c';
export const PAPER_OCHRE = '#d3a266';

export interface Lanterns {
  /** Centres of the lanterns (updated as they sway). */
  lanterns: T.Vector3[];
  /** Move a hook (a lantern hanging from a turning branch). */
  setHook(i: number, h: Hook): void;
}

/**
 * Paper lanterns hanging on cords from hooks in the air — an eave, a branch, the tip of a leaning
 * bamboo. Toon-washed and ink-outlined like the core's lanterns; lit softly from inside at night.
 */
export function hangLanterns(bag: Bag, hooks: Hook[], o: LanternOpts = {}): Lanterns {
  const ctx = bag.ctx;
  const { THREE, palette: P } = ctx;
  const n = hooks.length;
  const S = o.size ?? 1, drop = o.drop ?? 0.18;
  const cols = o.colors ?? hooks.map((_, i) => (i % 2 ? PAPER_OCHRE : PAPER_APRICOT));
  // one geometry: paper body (vertex colour set per lantern below), dark caps and a tassel
  const body = new THREE.SphereGeometry(0.2 * S, 12, 8);
  body.scale(1, 0.84, 1);
  const parts = (paper: string) => merge(THREE, [
    part(THREE, body.clone(), paper),
    part(THREE, new THREE.CylinderGeometry(0.09 * S, 0.11 * S, 0.05 * S, 8), P.ink, { p: [0, 0.165 * S, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.11 * S, 0.09 * S, 0.05 * S, 8), P.ink, { p: [0, -0.165 * S, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.018 * S, 0.035 * S, 0.2 * S, 5), P.cinnabar, { p: [0, -0.29 * S, 0] }),
  ]);
  body.dispose();
  const glowMatl = lanternMat(ctx);
  const outline = outlineMat(ctx, 0.012);
  const meshes: T.Mesh[] = cols.map((c) => {
    const m = new THREE.Mesh(parts(c), glowMatl);
    const hull = new THREE.Mesh(m.geometry, outline);
    hull.name = 'outline';
    m.add(hull);
    return bag.add(reflects(m)); // lanterns glow twice: in the air and in the pond
  });
  // cords
  const cordPos = new Float32Array(n * 6);
  const cordGeo = new THREE.BufferGeometry();
  cordGeo.setAttribute('position', new THREE.BufferAttribute(cordPos, 3).setUsage(THREE.DynamicDrawUsage));
  const cords = bag.add(reflects(new THREE.LineSegments(cordGeo, new THREE.LineBasicMaterial({ color: P.ink, transparent: true, opacity: 0.7 }))));
  cords.frustumCulled = false;
  // a soft halo at night (small, warm, restrained)
  const glowPos = new Float32Array(n * 3);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3).setUsage(THREE.DynamicDrawUsage));
  const halo = new THREE.PointsMaterial({
    size: 1.1 * S, map: glowTexture(THREE, 64, 0.1), color: '#ffc98a', transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  const glow = bag.add(reflects(new THREE.Points(glowGeo, halo)));
  glow.frustumCulled = false;

  const hk = hooks.map((h, i) => ({ ...h, ph: i * 1.7 }));
  const centres = hooks.map(() => new THREE.Vector3());
  const still = reducedMotion();
  const L = drop + 0.19 * S; // hook → lantern centre
  const place = (t: number) => {
    for (let i = 0; i < n; i++) {
      const h = hk[i];
      const sx = still ? 0 : Math.sin(t * 0.9 + h.ph) * 0.05, sz = still ? 0 : Math.cos(t * 0.7 + h.ph) * 0.035;
      const cx = h.x + Math.sin(sx) * L, cy = h.y - Math.cos(sx) * Math.cos(sz) * L, cz = h.z + Math.sin(sz) * L;
      const m = meshes[i];
      m.position.set(cx, cy, cz);
      m.rotation.set(sz, h.ph, -sx);
      centres[i].set(cx, cy, cz);
      cordPos.set([h.x, h.y, h.z, cx, cy + 0.17 * S, cz], i * 6);
      glowPos.set([cx, cy, cz], i * 3);
    }
    cordGeo.attributes.position.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = true;
  };
  place(0);
  let lit = -1;
  bag.frame((_dt, t) => {
    place(still ? 0 : t);
    const want = o.alwaysLit || ctx.sky.isNight() ? 1 : 0;
    if (lit < 0) lit = want;
    lit += (want - lit) * 0.05;
    const flick = still ? 1 : 0.94 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 11.1) * 0.03;
    glowMatl.emissiveIntensity = lit * 0.32 * flick;
    halo.opacity = lit * 0.3 * flick;
    glow.visible = lit > 0.02;
  });
  return {
    lanterns: centres,
    setHook(i, h) { hk[i].x = h.x; hk[i].y = h.y; hk[i].z = h.z; },
  };
}

/**
 * A slender bamboo pole planted at `base` and leaning toward `toward` (over the water, over a path),
 * like a fishing rod holding out a lantern (挑灯). Returns the hook at its tip.
 */
export function leaningPole(bag: Bag, base: T.Vector3, toward: { x: number; z: number }, h = 2.5): Hook {
  const ctx = bag.ctx;
  const { THREE } = ctx;
  const a = Math.atan2(toward.x - base.x, toward.z - base.z);
  const lean = 0.42;
  const geo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.022, 0.034, h, 5), '#6b5a3e', { p: [0, h / 2, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 5), '#4a3c2b', { p: [0, h * 0.35, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.028, 0.028, 0.03, 5), '#4a3c2b', { p: [0, h * 0.7, 0] }),
  ]);
  const pole = inked(ctx, geo, { width: 0.008 });
  pole.position.copy(base);
  pole.rotation.set(lean, a, 0, 'YXZ');
  bag.add(reflects(pole));
  const tip = new THREE.Vector3(0, h, 0).applyEuler(pole.rotation).add(base);
  return { x: tip.x, y: tip.y, z: tip.z };
}

/**
 * Hooks for `n` lanterns held out over the water from the shore on the side the visitor arrives,
 * either side of the view across the pond (so they sit in the reflection, not in the path).
 */
export function shoreLanterns(bag: Bag, n: number, spread = 0.55): Hook[] {
  const ctx = bag.ctx;
  const way = entry(ctx);
  const ahead = Math.atan2(way.dz * ctx.pond.radiusX, way.dx * ctx.pond.radiusZ); // shore angle facing the arrival
  const hooks: Hook[] = [];
  const list = claims(ctx);
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2; // -1 … 1
    for (let k = 0; k < 8; k++) {
      const a = ahead + side * spread + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.12;
      const p = shorePoint(ctx, a, 0.45);
      if (!ctx.isWalkable(p.x, p.z)) continue;
      if (list.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r + 0.2)) continue;
      list.push({ x: p.x, z: p.z, r: 0.35 });
      hooks.push(leaningPole(bag, p, ctx.pond.center));
      break;
    }
  }
  return hooks;
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
  g.add(inked(ctx, merge(THREE, parts), { width: 0.016 }));
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
  return inked(ctx, geo, { width: 0.006 });
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
  return inked(ctx, merge(THREE, parts), { width: 0.006 });
}

/** A low, flat boulder by the water. */
export function flatRock(ctx: WorldCtx, at: T.Vector3, r = 0.7): { mesh: T.Mesh; top: number } {
  const { THREE } = ctx;
  const g = part(THREE, new THREE.DodecahedronGeometry(r, 0), '#8a857a', { s: [1.1, 0.45, 0.9] });
  const mesh = inked(ctx, merge(THREE, [g]), { width: 0.018 });
  mesh.position.set(at.x, at.y + r * 0.2, at.z);
  mesh.rotation.y = at.x * 1.3;
  return { mesh, top: at.y + r * 0.2 + r * 0.42 };
}

/** A round lotus leaf floating on the water. */
export function lotusPad(ctx: WorldCtx, r = 0.55): T.Mesh {
  const { THREE, palette: P } = ctx;
  const g = part(THREE, new THREE.CircleGeometry(r, 14, 0.25, TAU - 0.25), P.malachite, { r: [-Math.PI / 2, 0, 0] });
  return inked(ctx, merge(THREE, [g]), { width: 0 });
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
  return inked(ctx, geo, { width: 0.005 });
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
  const mesh = bag.add(new THREE.InstancedMesh(merge(THREE, [part(THREE, new THREE.TetrahedronGeometry(size, 0), color)]), propMat(bag.ctx), n));
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
