// Props and creatures for the 奇遇: low-poly, vertex-coloured, ink-outlined like everything else in
// the painting (one merged mesh + one outline hull each). Deterministic: shapes vary by a seeded rng.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { Rng } from '../../../../core/rng';
import { inked } from '../kit';
import { merge, part, poly } from '../geo';

const TAU = Math.PI * 2;
type G = T.BufferGeometry;

// warm, living colours (see the art direction): ochre earth, jade leaves, rouge blossoms
export const COL = {
  bark: '#6b4a33', barkD: '#4f3626', wood: '#9a7248', woodL: '#c29a66', straw: '#c9a45e', thatch: '#b8914f',
  peach: '#f2a9b8', peachD: '#e7899f', peachL: '#fbd3da', jade: '#6f9a5a', jadeL: '#9dbb6a', ochre: '#a8703a',
  iron: '#4a4744', white: '#f5f0e4', red: '#c0412f', gold: '#e2b04a', fur: '#8a5a33', furL: '#d9b58a',
  ox: '#5b4a3c', oxL: '#7a6452', horn: '#e6dcc4', crimson: '#b8323a', silk: '#e8d9b0',
} as const;

/** A merged, inked mesh from parts. */
export function mesh(ctx: WorldCtx, parts: G[], width = 0.012): T.Mesh {
  return inked(ctx, merge(ctx.THREE, parts), { width });
}

// ───────────────────────────── trees & land

/** Parts for a peach tree in full bloom at (x, z) (ground y0); add to a list and merge many at once. */
export function peachTreeParts(THREE: WorldCtx['THREE'], rng: Rng, x: number, y0: number, z: number, s = 1): G[] {
  const out: G[] = [];
  const h = (1.5 + rng() * 0.6) * s;
  const lean = (rng() - 0.5) * 0.3;
  out.push(part(THREE, new THREE.CylinderGeometry(0.09 * s, 0.16 * s, h, 7), COL.bark, { p: [x + lean * h * 0.5, y0 + h / 2, z], r: [0, 0, -lean] }));
  const tx = x + lean * h, ty = y0 + h;
  const nb = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + rng() * 0.8;
    const L = (0.7 + rng() * 0.5) * s;
    const up = 0.5 + rng() * 0.4;
    out.push(part(THREE, new THREE.CylinderGeometry(0.035 * s, 0.07 * s, L, 5), COL.barkD, {
      p: [tx + Math.cos(a) * L * 0.4, ty + L * 0.35 * up, z + Math.sin(a) * L * 0.4],
      r: [Math.sin(a) * (1.2 - up), 0, -Math.cos(a) * (1.2 - up)],
    }));
  }
  const nc = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < nc; i++) {
    const a = rng() * TAU, d = (0.35 + rng() * 0.75) * s;
    const r = (0.38 + rng() * 0.3) * s;
    const c = rng() < 0.45 ? COL.peach : rng() < 0.6 ? COL.peachL : COL.peachD;
    out.push(part(THREE, new THREE.IcosahedronGeometry(r, 1), c, { p: [tx + Math.cos(a) * d, ty + 0.25 * s + rng() * 0.7 * s, z + Math.sin(a) * d], s: [1, 0.78, 1] }));
  }
  return out;
}

/** A thatched cottage (white walls, ochre timber, a straw roof), door facing +z. */
export function cottageParts(THREE: WorldCtx['THREE'], x: number, y0: number, z: number, rot: number): G[] {
  const W = 3.2, D = 2.4, H = 1.9;
  const local: G[] = [
    part(THREE, new THREE.BoxGeometry(W, H, D), '#efe6d2', { p: [0, H / 2, 0] }),
    part(THREE, new THREE.BoxGeometry(W + 0.2, 0.25, D + 0.2), '#8c7a64', { p: [0, 0.12, 0] }),
    part(THREE, new THREE.BoxGeometry(0.8, 1.35, 0.06), COL.wood, { p: [0, 0.68, D / 2 + 0.02] }),
    part(THREE, new THREE.BoxGeometry(0.6, 0.5, 0.06), '#5a4632', { p: [-1.0, 1.15, D / 2 + 0.02] }),
    part(THREE, new THREE.BoxGeometry(0.6, 0.5, 0.06), '#5a4632', { p: [1.0, 1.15, D / 2 + 0.02] }),
  ];
  // roof: two sloped slabs of thatch and a ridge
  for (const sx of [-1, 1]) local.push(part(THREE, new THREE.BoxGeometry(W + 0.8, 0.22, D * 0.72), COL.thatch, { p: [0, H + 0.55, sx * D * 0.3], r: [sx * 0.62, 0, 0] }));
  local.push(part(THREE, new THREE.CylinderGeometry(0.14, 0.14, W + 0.9, 6), '#9c7a40', { p: [0, H + 0.98, 0], r: [0, 0, Math.PI / 2] }));
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y0, z);
  for (const g of local) g.applyMatrix4(m);
  return local;
}

// ───────────────────────────── things to hold

/** An axe: returns the group, and the handle and head to crumble separately. */
export function axe(ctx: WorldCtx): { root: T.Group; handle: T.Mesh; head: T.Mesh } {
  const { THREE } = ctx;
  const root = new THREE.Group();
  const handle = mesh(ctx, [part(THREE, new THREE.CylinderGeometry(0.018, 0.022, 0.62, 6), COL.woodL, { p: [0, 0.2, 0] })], 0.006);
  const head = mesh(ctx, [
    part(THREE, new THREE.BoxGeometry(0.05, 0.1, 0.16), COL.iron, { p: [0, 0.47, 0.06] }),
    part(THREE, new THREE.BoxGeometry(0.02, 0.14, 0.05), '#8f8b86', { p: [0, 0.47, 0.15] }),
  ], 0.006);
  root.add(handle, head);
  return { root, handle, head };
}

/** A fat purse with a drawstring (red silk, gold trim). */
export function purse(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  return mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.13, 10, 8), COL.crimson, { p: [0, 0.1, 0], s: [1, 0.85, 0.9] }),
    part(THREE, new THREE.CylinderGeometry(0.05, 0.08, 0.08, 8), COL.crimson, { p: [0, 0.22, 0] }),
    part(THREE, new THREE.TorusGeometry(0.055, 0.012, 4, 10), COL.gold, { p: [0, 0.22, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.SphereGeometry(0.03, 6, 4), COL.gold, { p: [0.06, 0.1, 0.11] }),
  ], 0.008);
}

/** An oil-paper umbrella, open (canopy up); the handle's foot at the origin. */
export function umbrella(ctx: WorldCtx, color: string = COL.red): T.Mesh {
  const { THREE } = ctx;
  const canopy = new THREE.ConeGeometry(0.62, 0.28, 16, 1, true);
  return mesh(ctx, [
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), COL.woodL, { p: [0, 0.5, 0] }),
    part(THREE, canopy, color, { p: [0, 1.06, 0] }),
    part(THREE, new THREE.ConeGeometry(0.63, 0.02, 16, 1, true), '#f0d9a8', { p: [0, 0.915, 0] }),
    part(THREE, new THREE.SphereGeometry(0.03, 6, 4), COL.wood, { p: [0, 1.21, 0] }),
  ], 0.008);
}

/** A bamboo basket of wild fruit. */
export function fruitBasket(ctx: WorldCtx, rng: Rng): T.Mesh {
  const { THREE } = ctx;
  const parts: G[] = [
    part(THREE, new THREE.CylinderGeometry(0.26, 0.2, 0.22, 12, 1, true), COL.straw, { p: [0, 0.11, 0] }),
    part(THREE, new THREE.CircleGeometry(0.2, 12), COL.straw, { p: [0, 0.01, 0], r: [-Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.TorusGeometry(0.26, 0.018, 4, 16, Math.PI), COL.wood, { p: [0, 0.22, 0] }),
  ];
  const fruit = ['#e2573a', '#f0a23a', '#c9362f', '#e8c34a', '#8a3b52'];
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, d = rng() * 0.16;
    parts.push(part(THREE, new THREE.IcosahedronGeometry(0.055 + rng() * 0.02, 1), fruit[i % fruit.length], { p: [Math.cos(a) * d, 0.22 + rng() * 0.06, Math.sin(a) * d] }));
  }
  parts.push(part(THREE, poly(THREE, [[0, 0.3, 0], [0.12, 0.34, 0.05], [0.05, 0.3, 0.1]]), COL.jade));
  return mesh(ctx, parts, 0.008);
}

/** A wine gourd (葫芦) with a red cord. */
export function gourd(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  return mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.09, 10, 8), '#d9b25a', { p: [0, 0.09, 0] }),
    part(THREE, new THREE.SphereGeometry(0.06, 10, 8), '#d9b25a', { p: [0, 0.21, 0] }),
    part(THREE, new THREE.TorusGeometry(0.035, 0.01, 4, 10), COL.red, { p: [0, 0.155, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.015, 0.02, 0.04, 6), COL.wood, { p: [0, 0.28, 0] }),
  ], 0.006);
}

/** A little wine cup. */
export function cup(ctx: WorldCtx): G {
  const { THREE } = ctx;
  return part(THREE, new THREE.CylinderGeometry(0.035, 0.022, 0.04, 8), '#f3efe6', { p: [0, 0.02, 0] });
}

/** A go board on legs, with a scatter of black and white stones (a game in the middle). */
export function goBoard(ctx: WorldCtx, rng: Rng): { mesh: T.Mesh; top: number } {
  const { THREE } = ctx;
  const parts: G[] = [
    part(THREE, new THREE.BoxGeometry(0.62, 0.1, 0.62), '#d8b276', { p: [0, 0.32, 0] }),
  ];
  for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) parts.push(part(THREE, new THREE.BoxGeometry(0.08, 0.27, 0.08), '#8a6440', { p: [x, 0.135, z] }));
  // the grid, as thin dark strips
  for (let i = 0; i < 9; i++) {
    const u = -0.27 + (i / 8) * 0.54;
    parts.push(part(THREE, new THREE.BoxGeometry(0.54, 0.004, 0.006), '#5a4228', { p: [0, 0.372, u] }));
    parts.push(part(THREE, new THREE.BoxGeometry(0.006, 0.004, 0.54), '#5a4228', { p: [u, 0.372, 0] }));
  }
  for (let i = 0; i < 26; i++) {
    const gx = Math.floor(rng() * 9), gz = Math.floor(rng() * 9);
    const c = i % 2 ? '#1b1916' : '#f4efe4';
    parts.push(part(THREE, new THREE.SphereGeometry(0.027, 8, 4), c, { p: [-0.27 + (gx / 8) * 0.54, 0.378, -0.27 + (gz / 8) * 0.54], s: [1, 0.45, 1] }));
  }
  // two stone bowls
  for (const sx of [-1, 1]) parts.push(part(THREE, new THREE.SphereGeometry(0.08, 8, 6), '#7a5a3a', { p: [sx * 0.45, 0.06, 0], s: [1, 0.7, 1] }));
  return { mesh: mesh(ctx, parts, 0.008), top: 0.38 };
}

/** One go stone (white by default). */
export function goStone(ctx: WorldCtx, white = true): T.Mesh {
  const { THREE } = ctx;
  return mesh(ctx, [part(THREE, new THREE.SphereGeometry(0.035, 10, 6), white ? '#f7f3ea' : '#1b1916', { s: [1, 0.45, 1] })], 0.004);
}

/** A broom of twigs (for sweeping leaves before the temple). */
export function broom(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  return mesh(ctx, [
    part(THREE, new THREE.CylinderGeometry(0.014, 0.016, 1.1, 5), COL.woodL, { p: [0, 0.55, 0] }),
    part(THREE, new THREE.ConeGeometry(0.16, 0.42, 8, 1, true), COL.straw, { p: [0, -0.08, 0], r: [Math.PI, 0, 0] }),
    part(THREE, new THREE.TorusGeometry(0.06, 0.012, 4, 8), COL.red, { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0] }),
  ], 0.006);
}

/** A rolled scroll. */
export function scroll(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  return mesh(ctx, [
    part(THREE, new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), COL.silk, { r: [0, 0, Math.PI / 2] }),
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.38, 5), COL.barkD, { r: [0, 0, Math.PI / 2] }),
  ], 0.005);
}

/** A flute (a thin bamboo stick). */
export function flute(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  return mesh(ctx, [part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), '#a9b36a', { r: [0, 0, Math.PI / 2] })], 0.004);
}

/** A bundle of firewood for the woodcutter's back. */
export function firewood(ctx: WorldCtx, rng: Rng): T.Mesh {
  const { THREE } = ctx;
  const parts: G[] = [];
  for (let i = 0; i < 9; i++) parts.push(part(THREE, new THREE.CylinderGeometry(0.03, 0.035, 0.9, 5), i % 2 ? COL.bark : COL.wood, { p: [(rng() - 0.5) * 0.24, 0, (rng() - 0.5) * 0.12], r: [0, 0, (rng() - 0.5) * 0.2] }));
  parts.push(part(THREE, new THREE.TorusGeometry(0.16, 0.015, 4, 12), COL.straw, { r: [Math.PI / 2, 0, 0] }));
  return mesh(ctx, parts, 0.006);
}

// ───────────────────────────── creatures

/** A water buffalo, facing +z; legs animate via the returned groups. */
export function ox(ctx: WorldCtx): { root: T.Group; legs: T.Group[]; head: T.Group } {
  const { THREE, palette: P } = ctx;
  const root = new THREE.Group();
  root.add(mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.5, 12, 8), COL.ox, { p: [0, 0.95, 0], s: [0.85, 0.75, 1.45] }),
    part(THREE, new THREE.SphereGeometry(0.34, 10, 8), COL.oxL, { p: [0, 0.82, 0.1], s: [0.95, 0.7, 1.3] }),
    part(THREE, new THREE.CylinderGeometry(0.03, 0.02, 0.6, 4), COL.ox, { p: [0, 0.8, -0.72], r: [0.4, 0, 0] }),
  ], 0.018));
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.72);
  head.add(mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.22, 10, 8), COL.ox, { s: [0.9, 0.85, 1.2] }),
    part(THREE, new THREE.SphereGeometry(0.13, 8, 6), '#8c7766', { p: [0, -0.07, 0.2], s: [1, 0.75, 0.8] }),
    part(THREE, new THREE.TorusGeometry(0.28, 0.035, 5, 12, Math.PI * 0.9), COL.horn, { p: [0, 0.14, -0.04], r: [0.25, 0, 0.16] }),
    part(THREE, new THREE.SphereGeometry(0.022, 6, 4), P.ink, { p: [0.13, 0.05, 0.14] }),
    part(THREE, new THREE.SphereGeometry(0.022, 6, 4), P.ink, { p: [-0.13, 0.05, 0.14] }),
  ], 0.014));
  root.add(head);
  const legs: T.Group[] = [];
  for (const [x, z] of [[0.22, 0.42], [-0.22, 0.42], [0.22, -0.42], [-0.22, -0.42]]) {
    const g = new THREE.Group();
    g.position.set(x, 0.72, z);
    g.add(mesh(ctx, [part(THREE, new THREE.CylinderGeometry(0.07, 0.06, 0.72, 6), COL.ox, { p: [0, -0.36, 0] })], 0.012));
    root.add(g);
    legs.push(g);
  }
  return { root, legs, head };
}

/** A red-crowned crane standing, facing +z (wings folded; `wings` open them). */
export function crane(ctx: WorldCtx): { root: T.Group; neck: T.Group; wings: T.Group[] } {
  const { THREE, palette: P } = ctx;
  const root = new THREE.Group();
  root.add(mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.2, 10, 8), COL.white, { p: [0, 0.95, 0], s: [0.85, 0.8, 1.5] }),
    part(THREE, poly(THREE, [[0, 1.0, -0.2], [0.12, 0.9, -0.48], [-0.12, 0.9, -0.48]]), P.ink),
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4), P.ink, { p: [0.05, 0.4, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4), P.ink, { p: [-0.05, 0.4, 0] }),
  ], 0.01));
  const neck = new THREE.Group();
  neck.position.set(0, 1.02, 0.24);
  neck.add(mesh(ctx, [
    part(THREE, new THREE.CylinderGeometry(0.03, 0.045, 0.5, 6), P.ink, { p: [0, 0.23, 0.04], r: [0.2, 0, 0] }),
    part(THREE, new THREE.SphereGeometry(0.055, 8, 6), COL.white, { p: [0, 0.5, 0.08] }),
    part(THREE, new THREE.SphereGeometry(0.03, 6, 4), P.cinnabar, { p: [0, 0.55, 0.08] }),
    part(THREE, new THREE.ConeGeometry(0.014, 0.17, 4), P.ochre, { p: [0, 0.49, 0.2], r: [Math.PI / 2, 0, 0] }),
  ], 0.008));
  root.add(neck);
  const wings: T.Group[] = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.14, 1.02, 0.05);
    w.add(mesh(ctx, [
      part(THREE, poly(THREE, [[0, 0, 0.12], [s * 0.6, 0.02, 0.05], [s * 0.95, 0, -0.1], [s * 0.6, 0, -0.32], [0, 0, -0.25]]), COL.white),
      part(THREE, poly(THREE, [[s * 0.1, -0.005, -0.24], [s * 0.6, -0.005, -0.32], [s * 0.55, -0.005, -0.42], [s * 0.1, -0.005, -0.34]]), P.ink),
    ], 0));
    w.rotation.z = s * -1.35; // folded against the body
    root.add(w);
    wings.push(w);
  }
  return { root, neck, wings };
}

/** A monkey (for the chain that reaches for the moon), hanging by its arms: origin at the hands. */
export function monkey(ctx: WorldCtx): T.Mesh {
  const { THREE, palette: P } = ctx;
  return mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.16, 10, 8), COL.fur, { p: [0, -0.42, 0], s: [0.85, 1.15, 0.8] }),
    part(THREE, new THREE.SphereGeometry(0.11, 10, 8), COL.fur, { p: [0, -0.2, 0.02] }),
    part(THREE, new THREE.SphereGeometry(0.075, 8, 6), COL.furL, { p: [0, -0.22, 0.08], s: [1, 0.8, 0.6] }),
    part(THREE, new THREE.SphereGeometry(0.014, 5, 4), P.ink, { p: [0.03, -0.19, 0.12] }),
    part(THREE, new THREE.SphereGeometry(0.014, 5, 4), P.ink, { p: [-0.03, -0.19, 0.12] }),
    part(THREE, new THREE.CylinderGeometry(0.025, 0.03, 0.3, 5), COL.fur, { p: [0.08, -0.08, 0], r: [0, 0, 0.3] }),
    part(THREE, new THREE.CylinderGeometry(0.025, 0.03, 0.3, 5), COL.fur, { p: [-0.08, -0.08, 0], r: [0, 0, -0.3] }),
    part(THREE, new THREE.CylinderGeometry(0.025, 0.03, 0.34, 5), COL.fur, { p: [0.07, -0.66, 0.02], r: [0.2, 0, -0.15] }),
    part(THREE, new THREE.CylinderGeometry(0.025, 0.03, 0.34, 5), COL.fur, { p: [-0.07, -0.66, 0.02], r: [0.2, 0, 0.15] }),
    part(THREE, new THREE.TorusGeometry(0.16, 0.015, 4, 10, Math.PI * 1.2), COL.fur, { p: [0, -0.5, -0.18], r: [0, Math.PI / 2, 0] }),
  ], 0.008);
}

/** A white fox, sitting, facing +z; the tail is its own group (it swishes). */
export function fox(ctx: WorldCtx): { root: T.Group; tail: T.Group } {
  const { THREE, palette: P } = ctx;
  const root = new THREE.Group();
  const white = '#f7f2e8';
  root.add(mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.2, 10, 8), white, { p: [0, 0.26, 0], s: [0.8, 1.1, 0.95] }),
    part(THREE, new THREE.SphereGeometry(0.13, 10, 8), white, { p: [0, 0.55, 0.06] }),
    part(THREE, new THREE.ConeGeometry(0.06, 0.16, 6), white, { p: [0, 0.52, 0.2], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.SphereGeometry(0.02, 5, 4), P.ink, { p: [0, 0.52, 0.29] }),
    part(THREE, new THREE.ConeGeometry(0.05, 0.14, 4), white, { p: [0.07, 0.69, 0.03] }),
    part(THREE, new THREE.ConeGeometry(0.05, 0.14, 4), white, { p: [-0.07, 0.69, 0.03] }),
    part(THREE, new THREE.SphereGeometry(0.016, 5, 4), P.ink, { p: [0.05, 0.58, 0.16] }),
    part(THREE, new THREE.SphereGeometry(0.016, 5, 4), P.ink, { p: [-0.05, 0.58, 0.16] }),
    part(THREE, new THREE.SphereGeometry(0.018, 5, 4), P.rouge, { p: [0, 0.62, 0.15], s: [1.4, 0.5, 0.5] }),
  ], 0.01));
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.16);
  tail.add(mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.11, 8, 6), white, { p: [0.12, 0.08, -0.22], s: [0.9, 0.8, 2.1], r: [0.3, 0.5, 0] }),
    part(THREE, new THREE.SphereGeometry(0.06, 8, 6), '#e9dcc4', { p: [0.24, 0.15, -0.42] }),
  ], 0.01));
  root.add(tail);
  return { root, tail };
}

/** A small sampan with a cabin roof of woven bamboo, bow at +z. */
export function sampan(ctx: WorldCtx): T.Mesh {
  const { THREE } = ctx;
  const hull = new THREE.CylinderGeometry(0.55, 0.55, 3.2, 12, 1, false, Math.PI / 2, Math.PI);
  return mesh(ctx, [
    part(THREE, hull, '#7a5638', { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.5] }),
    part(THREE, new THREE.BoxGeometry(1.0, 0.04, 2.8), '#a07a4e', { p: [0, 0.29, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.62, 0.62, 1.0, 10, 1, true, -Math.PI / 2, Math.PI), '#8a6a3c', { p: [0, 0.35, -0.5], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), COL.woodL, { p: [0.35, 0.9, -1.3], r: [0.9, 0, 0] }),
  ], 0.014);
}
