// The homestead's animals, low-poly in the walker's toon washes with an ink outline: a dog, a tabby,
// a rabbit, a red-crowned crane, a duck, a parrot, a goat (koi swim as one instanced school). Each is
// ONE merged mesh plus its outline hull (2 draws). Legs, tail, head and wings move in the vertex
// shader: every vertex knows its part and that part's hinge (aPart, aPivot), and a per-animal pose
// (legs, tail, head pitch and yaw, wings and how folded they are) is set each frame.
import type * as T from 'three';
import type { WorldCtx } from '../../../types';
import type { Bag } from '../../kit';
import { part as geoPart, poly, koiGeometry, swimMaterial, instanceAttrs, type Xf } from '../../geo';
import { hashString, makeRng } from '../../../../../core/rng';
import type { Species } from './logic';

/** Part codes (aPart). */
const P = { body: 0, legA: 1, legB: 2, tail: 3, head: 4, wingL: 5, wingR: 6 } as const;

export interface Pose {
  /** Leg swing (rad): legA forward by this, legB back. */
  legs: number;
  /** Tail wag (rad, around the up axis). */
  tail: number;
  /** Head pitch (rad, + = nods down) and yaw (rad, + = turns left). */
  head: number;
  yaw: number;
  /** Wing flap (rad, + = raised) and fold (1 = folded back along the body, 0 = spread). */
  wings: number;
  fold: number;
}

export interface PetModel {
  species: Species;
  /** Placed and turned by the behaviour (faces +z at heading 0, like the walker). */
  root: T.Group;
  /** Inside the root: bob, tilt and squash. */
  body: T.Group;
  pose: Pose;
  /** Height of the top of the head (m). */
  height: number;
  /** Copy the pose to the GPU (call once per frame after changing it). */
  apply(): void;
  dispose(): void;
}

interface PartGeo { g: T.BufferGeometry; part: number; pivot: [number, number, number] }

class Kit {
  list: PartGeo[] = [];
  constructor(private THREE: WorldCtx['THREE']) {}
  add(g: T.BufferGeometry, color: string, xf: Xf = {}, part = 0, pivot: [number, number, number] = [0, 0, 0], paint?: (x: number, y: number, z: number) => string | null): void {
    const pg = geoPart(this.THREE, g, color, xf);
    if (paint) recolor(this.THREE, pg, paint);
    this.list.push({ g: pg, part, pivot });
  }
  merge(): T.BufferGeometry {
    const THREE = this.THREE;
    let n = 0;
    for (const p of this.list) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const prt = new Float32Array(n), piv = new Float32Array(n * 3);
    let o = 0;
    for (const p of this.list) {
      const c = p.g.attributes.position.count;
      if (!p.g.attributes.normal) p.g.computeVertexNormals();
      pos.set(p.g.attributes.position.array as Float32Array, o * 3);
      nor.set(p.g.attributes.normal.array as Float32Array, o * 3);
      col.set(p.g.attributes.color.array as Float32Array, o * 3);
      prt.fill(p.part, o, o + c);
      for (let i = 0; i < c; i++) { piv[(o + i) * 3] = p.pivot[0]; piv[(o + i) * 3 + 1] = p.pivot[1]; piv[(o + i) * 3 + 2] = p.pivot[2]; }
      o += c;
      p.g.dispose();
    }
    this.list = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(prt, 1));
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 0.3; // room for flapping wings
    return g;
  }
}

/** Recolour whole triangles where `fn` (at the triangle's centre, model space) names a colour. */
function recolor(THREE: WorldCtx['THREE'], g: T.BufferGeometry, fn: (x: number, y: number, z: number) => string | null): void {
  const pos = g.attributes.position, col = g.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const k = fn(x, y, z);
    if (!k) continue;
    c.set(k);
    for (let j = 0; j < 3; j++) col.setXYZ(i + j, c.r, c.g, c.b);
  }
}

// ───────────────────────────── the pose shader ─────────────────────────────

const POSE_GLSL = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
uniform vec4 uPose;
uniform vec2 uPose2;
vec3 hlRotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 hlRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 hlRotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
vec3 hlPose(vec3 v) {
  if (aPart < 0.5) return v;
  if (aPart < 1.5) return hlRotX(v, -uPose.x);
  if (aPart < 2.5) return hlRotX(v, uPose.x);
  if (aPart < 3.5) return hlRotY(v, uPose.y);
  if (aPart < 4.5) return hlRotY(hlRotX(v, uPose.z), uPose2.x);
  float side = aPart < 5.5 ? 1.0 : -1.0;
  return hlRotZ(hlRotY(v, side * uPose2.y * 1.45), side * uPose.w);
}
`;

interface PoseMats { toon: T.MeshToonMaterial; ink: T.MeshBasicMaterial; pose: { value: T.Vector4 }; pose2: { value: T.Vector2 } }

function poseMaterials(ctx: WorldCtx, gradient: T.Texture, outline: number): PoseMats {
  const { THREE } = ctx;
  const pose = { value: new THREE.Vector4() };
  const pose2 = { value: new THREE.Vector2() };
  const toon = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradient, vertexColors: true });
  toon.onBeforeCompile = (sh) => {
    sh.uniforms.uPose = pose;
    sh.uniforms.uPose2 = pose2;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${POSE_GLSL}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = hlPose(objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = hlPose(transformed - aPivot) + aPivot;');
  };
  toon.customProgramCacheKey = () => 'hl-pose-toon';
  const ink = new THREE.MeshBasicMaterial({ color: ctx.palette.ink, side: THREE.BackSide });
  ink.onBeforeCompile = (sh) => {
    sh.uniforms.uPose = pose;
    sh.uniforms.uPose2 = pose2;
    sh.uniforms.uOutline = { value: outline };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${POSE_GLSL}\nuniform float uOutline;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = hlPose(transformed - aPivot) + aPivot + normalize(hlPose(normal)) * uOutline;');
  };
  ink.customProgramCacheKey = () => 'hl-pose-ink';
  // freed by the model's dispose(), not by the Bag's tree walk (the gradient is shared)
  toon.userData.shared = ink.userData.shared = true;
  return { toon, ink, pose, pose2 };
}

const gradients = new WeakMap<Bag, T.DataTexture>();
function gradientFor(bag: Bag): T.DataTexture {
  let g = gradients.get(bag);
  if (g) return g;
  const { THREE } = bag.ctx;
  // the core's three soft bands, a touch warmer in the shade
  g = new THREE.DataTexture(new Uint8Array([160, 150, 142, 255, 212, 206, 198, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  g.minFilter = g.magFilter = THREE.NearestFilter;
  g.generateMipmaps = false;
  g.needsUpdate = true;
  bag.own(g);
  gradients.set(bag, g);
  return g;
}

// ───────────────────────────── the animals ─────────────────────────────

const INK = '#211d1a';

type Build = (k: Kit, THREE: WorldCtx['THREE'], r: () => number, coat?: number) => number;

/** Pick a coat: the forced one, else by the seed. */
const pick = <C,>(list: C[], r: () => number, coat?: number): C => list[coat !== undefined ? Math.min(coat, list.length - 1) : Math.floor(r() * list.length)];

const S = (THREE: WorldCtx['THREE'], r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

const BUILD: Record<Exclude<Species, 'koi'>, Build> = {
  dog(k, THREE, r, coat) {
    const coats = [
      { body: '#c98d45', light: '#f1e2c4', ear: '#8e5a2a' }, // 阿黄
      { body: '#3b3330', light: '#d9a466', ear: '#2a2422' }, // black and tan
      { body: '#efe6d4', light: '#fbf6ea', ear: '#c98d45' }, // white with ochre ears
      { body: '#bf6a38', light: '#f4e6cf', ear: '#8a4522' }, // 柴 red
    ];
    const c = pick(coats, r, coat);
    const belly = (_x: number, y: number, z: number) => (y < 0.26 && z > -0.1 ? c.light : null);
    k.add(S(THREE, 0.15), c.body, { p: [0, 0.3, 0], s: [0.9, 0.85, 1.5] }, P.body, [0, 0, 0], belly);
    k.add(S(THREE, 0.11), c.light, { p: [0, 0.28, 0.14], s: [0.85, 0.9, 0.8] });
    k.add(new THREE.TorusGeometry(0.085, 0.02, 5, 14), '#c0392b', { p: [0, 0.385, 0.2], r: [Math.PI / 2 + 0.55, 0, 0] });
    k.add(S(THREE, 0.024, 6, 5), '#e2b24a', { p: [0, 0.33, 0.275] });
    for (const [sx, sz, part] of [[1, 0.13, P.legA], [-1, -0.14, P.legA], [-1, 0.13, P.legB], [1, -0.14, P.legB]] as const) {
      const x = 0.075 * sx;
      k.add(new THREE.CylinderGeometry(0.038, 0.032, 0.2, 6), c.body, { p: [x, 0.11, sz] }, part, [x, 0.22, sz]);
      k.add(S(THREE, 0.04, 6, 5), c.light, { p: [x, 0.025, sz + 0.015], s: [1, 0.6, 1.3] }, part, [x, 0.22, sz]);
    }
    const hp: [number, number, number] = [0, 0.38, 0.2];
    k.add(S(THREE, 0.12), c.body, { p: [0, 0.47, 0.28] }, P.head, hp);
    k.add(S(THREE, 0.065, 8, 6), c.light, { p: [0, 0.43, 0.38], s: [0.9, 0.75, 1.1] }, P.head, hp);
    k.add(S(THREE, 0.024, 6, 4), INK, { p: [0, 0.455, 0.445] }, P.head, hp);
    k.add(S(THREE, 0.02, 6, 4), '#d9776f', { p: [0, 0.4, 0.425], s: [1, 0.45, 1.4] }, P.head, hp);
    for (const sx of [1, -1]) {
      k.add(S(THREE, 0.018, 6, 4), INK, { p: [0.05 * sx, 0.5, 0.375] }, P.head, hp);
      k.add(S(THREE, 0.05, 6, 5), c.ear, { p: [0.105 * sx, 0.47, 0.25], s: [0.5, 1.25, 0.9], r: [0, 0, 0.4 * sx] }, P.head, hp);
    }
    k.add(new THREE.ConeGeometry(0.036, 0.22, 6), c.body, { p: [0, 0.44, -0.27], r: [-0.65, 0, 0] }, P.tail, [0, 0.36, -0.2]);
    return 0.6;
  },
  cat(k, THREE, r, coat) {
    const coats = [
      { body: '#9d8466', stripe: '#5b4633', light: '#f0e5cf' }, // brown tabby 狸花
      { body: '#a9a397', stripe: '#4e4a44', light: '#f2eee4' }, // silver tabby
      { body: '#f1eadb', stripe: '#2d2824', light: '#fbf7ee', calico: '#c98a45' }, // 三花
      { body: '#d99550', stripe: '#b56a2e', light: '#f3e6cf' }, // ginger (only for Big Ginger, when he visits)
    ];
    const c = pick(coats.slice(0, coat === 3 ? 4 : 3), r, coat);
    const fur = (x: number, y: number, z: number) => {
      if (y < 0.17 && z > -0.12) return c.light;
      if (c.calico) return Math.sin(x * 23 + z * 9) + Math.sin(z * 17 - x * 5) > 1.1 ? c.stripe : Math.sin(x * 11 - z * 21) > 0.55 ? c.calico : null;
      return Math.sin(z * 46 + Math.abs(x) * 8) > 0.3 ? c.stripe : null;
    };
    k.add(S(THREE, 0.11), c.body, { p: [0, 0.2, 0], s: [0.85, 0.8, 1.55] }, P.body, [0, 0, 0], fur);
    for (const [sx, sz, part] of [[1, 0.1, P.legA], [-1, -0.1, P.legA], [-1, 0.1, P.legB], [1, -0.1, P.legB]] as const) {
      const x = 0.05 * sx;
      k.add(new THREE.CylinderGeometry(0.024, 0.02, 0.16, 5), c.body, { p: [x, 0.08, sz] }, part, [x, 0.16, sz]);
      k.add(S(THREE, 0.025, 5, 4), c.light, { p: [x, 0.012, sz + 0.01], s: [1, 0.55, 1.2] }, part, [x, 0.16, sz]);
    }
    const hp: [number, number, number] = [0, 0.25, 0.14];
    const face = (x: number, y: number, z: number) => (y < 0.29 && z > 0.24 ? c.light : !c.calico && y > 0.33 && Math.sin(x * 60) > 0.4 ? c.stripe : c.calico && x > 0.02 && y > 0.3 ? c.calico : null);
    k.add(S(THREE, 0.095), c.body, { p: [0, 0.3, 0.2], s: [1.1, 0.95, 0.95] }, P.head, hp, face);
    k.add(S(THREE, 0.038, 6, 5), c.light, { p: [0, 0.272, 0.275], s: [1.15, 0.7, 0.8] }, P.head, hp);
    k.add(S(THREE, 0.012, 5, 4), '#d98a8a', { p: [0, 0.29, 0.3] }, P.head, hp);
    for (const sx of [1, -1]) {
      k.add(new THREE.ConeGeometry(0.036, 0.075, 4), c.calico && sx > 0 ? c.calico : c.body, { p: [0.058 * sx, 0.385, 0.19], r: [0, 0, -0.28 * sx] }, P.head, hp);
      k.add(new THREE.ConeGeometry(0.018, 0.045, 4), '#e4a6a0', { p: [0.056 * sx, 0.378, 0.205], r: [0, 0, -0.28 * sx] }, P.head, hp);
      k.add(S(THREE, 0.017, 6, 4), '#c9a23c', { p: [0.04 * sx, 0.315, 0.27], s: [1, 1, 0.6] }, P.head, hp);
      k.add(S(THREE, 0.009, 4, 3), INK, { p: [0.04 * sx, 0.315, 0.281], s: [0.5, 1.2, 0.5] }, P.head, hp);
    }
    const tp: [number, number, number] = [0, 0.22, -0.16];
    const tailFur = (_x: number, y: number) => (Math.sin(y * 60) > 0.2 ? c.stripe : null);
    k.add(new THREE.CylinderGeometry(0.02, 0.018, 0.22, 5), c.body, { p: [0, 0.3, -0.21], r: [-0.45, 0, 0] }, P.tail, tp, tailFur);
    k.add(new THREE.CylinderGeometry(0.018, 0.012, 0.14, 5), c.body, { p: [0, 0.44, -0.2], r: [0.35, 0, 0] }, P.tail, tp, tailFur);
    return 0.42;
  },
  rabbit(k, THREE, r, coat) {
    const coats = [
      { body: '#f5f1e8', ear: '#eaa8a8', eye: '#b0343a' },
      { body: '#b39777', ear: '#d8a79c', eye: INK },
      { body: '#9b958b', ear: '#d6a19b', eye: INK },
      { body: '#f5f1e8', ear: '#eaa8a8', eye: INK, patch: '#3a3330' },
    ];
    const c = pick(coats, r, coat);
    const patch = c.patch ? (x: number, _y: number, z: number) => (Math.sin(x * 20 + z * 14) > 0.5 ? c.patch! : null) : undefined;
    k.add(S(THREE, 0.1), c.body, { p: [0, 0.12, -0.01], s: [0.95, 0.9, 1.2] }, P.body, [0, 0, 0], patch);
    for (const sx of [1, -1]) {
      k.add(S(THREE, 0.068, 7, 6), c.body, { p: [0.058 * sx, 0.09, -0.05] }, P.body, [0, 0, 0], patch);
      k.add(new THREE.CylinderGeometry(0.018, 0.016, 0.08, 5), c.body, { p: [0.035 * sx, 0.04, 0.075] }, P.legA, [0.035 * sx, 0.08, 0.075]);
      k.add(S(THREE, 0.03, 6, 4), c.body, { p: [0.06 * sx, 0.02, -0.02], s: [0.8, 0.5, 2] }, P.legB, [0.06 * sx, 0.07, -0.06]);
    }
    const hp: [number, number, number] = [0, 0.16, 0.08];
    k.add(S(THREE, 0.07), c.body, { p: [0, 0.2, 0.12], s: [1, 0.95, 1.05] }, P.head, hp, patch);
    k.add(S(THREE, 0.012, 5, 4), '#d98a8a', { p: [0, 0.2, 0.19] }, P.head, hp);
    for (const sx of [1, -1]) {
      k.add(S(THREE, 0.015, 5, 4), c.eye, { p: [0.042 * sx, 0.22, 0.165] }, P.head, hp);
      k.add(S(THREE, 0.028, 6, 6), c.body, { p: [0.032 * sx, 0.32, 0.09], s: [0.75, 3.3, 0.4], r: [-0.28, 0, -0.14 * sx] }, P.head, hp);
      k.add(S(THREE, 0.018, 5, 5), c.ear, { p: [0.032 * sx, 0.32, 0.1], s: [0.6, 3.0, 0.25], r: [-0.28, 0, -0.14 * sx] }, P.head, hp);
    }
    k.add(S(THREE, 0.034, 6, 5), '#fbf8f2', { p: [0, 0.13, -0.13] }, P.tail, [0, 0.13, -0.11]);
    return 0.4;
  },
  crane(k, THREE) {
    const white = '#f4f1e9', black = '#221f1c';
    k.add(S(THREE, 0.17, 12, 9), white, { p: [0, 0.8, -0.02], s: [0.75, 0.72, 1.3] });
    k.add(new THREE.ConeGeometry(0.1, 0.24, 7), black, { p: [0, 0.77, -0.27], r: [-(Math.PI / 2 + 0.35), 0, 0] });
    const hp: [number, number, number] = [0, 0.86, 0.14];
    k.add(new THREE.CylinderGeometry(0.026, 0.04, 0.48, 6), black, { p: [0, 1.08, 0.21], r: [0.28, 0, 0] }, P.head, hp);
    k.add(S(THREE, 0.052, 8, 6), white, { p: [0, 1.32, 0.29] }, P.head, hp, (_x, y, z) => (y < 1.31 && z > 0.29 ? black : null));
    k.add(S(THREE, 0.032, 6, 4), '#c8372d', { p: [0, 1.36, 0.285], s: [1, 0.55, 1.25] }, P.head, hp);
    k.add(new THREE.ConeGeometry(0.014, 0.17, 5), '#a39a72', { p: [0, 1.305, 0.41], r: [Math.PI / 2, 0, 0] }, P.head, hp);
    for (const sx of [1, -1]) k.add(S(THREE, 0.009, 4, 3), INK, { p: [0.035 * sx, 1.33, 0.32] }, P.head, hp);
    for (const [sx, part] of [[1, P.legA], [-1, P.legB]] as const) {
      const x = 0.055 * sx;
      k.add(new THREE.CylinderGeometry(0.011, 0.011, 0.66, 4), '#3a3530', { p: [x, 0.34, 0] }, part, [x, 0.68, 0]);
      k.add(new THREE.BoxGeometry(0.02, 0.012, 0.13), '#3a3530', { p: [x, 0.01, 0.03] }, part, [x, 0.68, 0]);
    }
    for (const [sx, part] of [[1, P.wingL], [-1, P.wingR]] as const) {
      const w = (pts: [number, number, number][]) => poly(THREE, pts.map(([x, y, z]) => [x * sx, y, z] as [number, number, number]));
      const pv: [number, number, number] = [0.1 * sx, 0.9, 0.02];
      k.add(w([[0.1, 0.9, 0.12], [0.52, 0.92, 0.06], [0.6, 0.9, -0.1], [0.36, 0.89, -0.26], [0.1, 0.89, -0.18]]), white, {}, part, pv);
      k.add(w([[0.36, 0.885, -0.26], [0.6, 0.895, -0.1], [0.64, 0.89, -0.2], [0.42, 0.88, -0.36]]), black, {}, part, pv);
    }
    return 1.4;
  },
  duck(k, THREE, r, coat) {
    const coats = [
      { body: '#f3eee2', head: '#f3eee2', wing: '#e6dfcf', bill: '#e6a23a' }, // 白鸭
      { body: '#9c7c57', head: '#3f6d52', wing: '#6b5a44', bill: '#d8b04a' }, // 麻鸭 with a green head
      { body: '#f0c95a', head: '#f0c95a', wing: '#e3b447', bill: '#e08a30' }, // a yellow one
    ];
    const c = pick(coats, r, coat);
    k.add(S(THREE, 0.1), c.body, { p: [0, 0.14, -0.01], s: [0.85, 0.72, 1.3] });
    k.add(new THREE.ConeGeometry(0.04, 0.09, 5), c.body, { p: [0, 0.19, -0.14], r: [-1.1, 0, 0] });
    const hp: [number, number, number] = [0, 0.19, 0.08];
    k.add(new THREE.CylinderGeometry(0.034, 0.045, 0.1, 6), c.head, { p: [0, 0.23, 0.09] }, P.head, hp);
    k.add(S(THREE, 0.056, 8, 6), c.head, { p: [0, 0.3, 0.1] }, P.head, hp);
    k.add(S(THREE, 0.03, 6, 4), c.bill, { p: [0, 0.29, 0.166], s: [1.15, 0.38, 1.8] }, P.head, hp);
    for (const sx of [1, -1]) k.add(S(THREE, 0.011, 4, 3), INK, { p: [0.036 * sx, 0.315, 0.128] }, P.head, hp);
    for (const [sx, part] of [[1, P.legA], [-1, P.legB]] as const) {
      const x = 0.035 * sx;
      k.add(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 4), '#e0892e', { p: [x, 0.035, 0] }, part, [x, 0.065, 0]);
      k.add(S(THREE, 0.026, 5, 3), '#e0892e', { p: [x, 0.008, 0.02], s: [1, 0.3, 1.5] }, part, [x, 0.065, 0]);
    }
    for (const [sx, part] of [[1, P.wingL], [-1, P.wingR]] as const) {
      const pv: [number, number, number] = [0.06 * sx, 0.17, 0.02];
      k.add(poly(THREE, ([[0.06, 0.175, 0.05], [0.17, 0.185, -0.01], [0.15, 0.175, -0.1], [0.06, 0.165, -0.07]] as [number, number, number][]).map(([x, y, z]) => [x * sx, y, z] as [number, number, number])), c.wing, {}, part, pv);
    }
    return 0.36;
  },
  parrot(k, THREE, r, coat) {
    const coats = [
      { body: '#3f9a5a', head: '#8cc04a', face: '#e8c040', tail: '#c8452e', tip: '#3a6fa8' },
      { body: '#3f7fb8', head: '#e8c040', face: '#f4e7b0', tail: '#3a6fa8', tip: '#23466e' },
      { body: '#c8452e', head: '#d85a38', face: '#f0d060', tail: '#3a6fa8', tip: '#3f9a5a' },
    ];
    const c = pick(coats, r, coat);
    k.add(S(THREE, 0.055), c.body, { p: [0, 0.1, 0], s: [0.9, 1.35, 0.95], r: [0.22, 0, 0] });
    k.add(S(THREE, 0.04, 6, 5), c.face, { p: [0, 0.09, 0.03], s: [0.9, 1.3, 0.6] });
    for (const sx of [1, -1]) k.add(S(THREE, 0.014, 5, 4), '#8a8578', { p: [0.022 * sx, 0.008, 0.012], s: [1, 0.6, 1.4] });
    const hp: [number, number, number] = [0, 0.16, 0];
    k.add(S(THREE, 0.046, 8, 6), c.head, { p: [0, 0.205, 0.015] }, P.head, hp);
    k.add(S(THREE, 0.028, 6, 4), c.face, { p: [0, 0.195, 0.045], s: [1.2, 0.9, 0.6] }, P.head, hp);
    k.add(new THREE.ConeGeometry(0.018, 0.045, 5), '#3a3632', { p: [0, 0.19, 0.066], r: [2.2, 0, 0] }, P.head, hp);
    for (const sx of [1, -1]) k.add(S(THREE, 0.009, 4, 3), INK, { p: [0.03 * sx, 0.212, 0.04] }, P.head, hp);
    k.add(new THREE.BoxGeometry(0.03, 0.16, 0.008), c.tail, { p: [0, -0.03, -0.07], r: [0.35, 0, 0] }, P.tail, [0, 0.05, -0.04]);
    for (const [sx, part] of [[1, P.wingL], [-1, P.wingR]] as const) {
      const pv: [number, number, number] = [0.04 * sx, 0.14, 0];
      const m = (pts: [number, number, number][]) => poly(THREE, pts.map(([x, y, z]) => [x * sx, y, z] as [number, number, number]));
      k.add(m([[0.04, 0.145, 0.03], [0.13, 0.145, -0.01], [0.12, 0.14, -0.08], [0.045, 0.13, -0.06]]), c.body, {}, part, pv);
      k.add(m([[0.12, 0.139, -0.08], [0.13, 0.144, -0.01], [0.17, 0.14, -0.1]]), c.tip, {}, part, pv);
    }
    return 0.28;
  },
  goat(k, THREE, r, coat) {
    const coats = [
      { body: '#ece5d4', horn: '#8f836a', beard: '#f7f3ea' },
      { body: '#6b5037', horn: '#4a3f33', beard: '#3a302a', face: '#f0e6d4' },
      { body: '#2f2a28', horn: '#8f836a', beard: '#2a2522' },
    ];
    const c = pick(coats, r, coat);
    k.add(S(THREE, 0.19), c.body, { p: [0, 0.46, 0], s: [0.78, 0.78, 1.35] });
    for (const [sx, sz, part] of [[1, 0.17, P.legA], [-1, -0.17, P.legA], [-1, 0.17, P.legB], [1, -0.17, P.legB]] as const) {
      const x = 0.09 * sx;
      k.add(new THREE.CylinderGeometry(0.03, 0.025, 0.32, 5), c.body, { p: [x, 0.18, sz] }, part, [x, 0.35, sz]);
      k.add(new THREE.CylinderGeometry(0.027, 0.03, 0.04, 5), INK, { p: [x, 0.02, sz] }, part, [x, 0.35, sz]);
    }
    const hp: [number, number, number] = [0, 0.56, 0.24];
    k.add(S(THREE, 0.085), c.body, { p: [0, 0.66, 0.35], s: [0.8, 0.9, 1.35], r: [0.45, 0, 0] }, P.head, hp, c.face ? (_x, _y, z) => (z > 0.4 ? c.face! : null) : undefined);
    for (const sx of [1, -1]) {
      k.add(new THREE.ConeGeometry(0.022, 0.17, 5), c.horn, { p: [0.04 * sx, 0.78, 0.28], r: [-0.95, 0, -0.18 * sx] }, P.head, hp);
      k.add(S(THREE, 0.03, 6, 4), c.body, { p: [0.095 * sx, 0.7, 0.3], s: [2, 0.5, 0.9], r: [0, 0, -0.35 * sx] }, P.head, hp);
      k.add(S(THREE, 0.013, 5, 4), '#b8862e', { p: [0.052 * sx, 0.7, 0.4] }, P.head, hp);
      k.add(S(THREE, 0.007, 4, 3), INK, { p: [0.058 * sx, 0.7, 0.408], s: [1.4, 0.6, 0.5] }, P.head, hp);
    }
    k.add(new THREE.ConeGeometry(0.022, 0.09, 5), c.beard, { p: [0, 0.52, 0.43], r: [Math.PI - 0.2, 0, 0] }, P.head, hp);
    k.add(new THREE.ConeGeometry(0.03, 0.09, 5), c.body, { p: [0, 0.59, -0.27], r: [-0.6, 0, 0] }, P.tail, [0, 0.55, -0.24]);
    return 0.86;
  },
};

/** Build one animal (not added anywhere; the caller places `root`). `seed` picks its coat. */
export function petModel(bag: Bag, species: Exclude<Species, 'koi'>, seed: string, coat?: number): PetModel {
  const ctx = bag.ctx;
  const { THREE } = ctx;
  const k = new Kit(THREE);
  const height = BUILD[species](k, THREE, makeRng(hashString(`pet:${seed}`)), coat);
  const geo = k.merge();
  const mats = poseMaterials(ctx, gradientFor(bag), species === 'crane' || species === 'goat' ? 0.011 : 0.008);
  const mesh = new THREE.Mesh(geo, mats.toon);
  const hull = new THREE.Mesh(geo, mats.ink);
  hull.name = 'outline';
  hull.raycast = () => {};
  mesh.add(hull);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh);
  root.name = `pet:${species}`;
  const pose: Pose = { legs: 0, tail: 0, head: 0, yaw: 0, wings: 0, fold: 1 };
  return {
    species, root, body, pose, height,
    apply() {
      mats.pose.value.set(pose.legs, pose.tail, pose.head, pose.wings);
      mats.pose2.value.set(pose.yaw, pose.fold);
    },
    dispose() {
      mats.toon.dispose();
      mats.ink.dispose();
    },
  };
}

// ───────────────────────────── koi ─────────────────────────────

export interface KoiSchool {
  mesh: T.InstancedMesh;
  uniforms: { uTime: { value: number } };
  count: number;
}

/** Up to `max` koi as one instanced draw (kohaku, gold, sanke-ish tints per instance). */
export function koiSchool(bag: Bag, max: number): KoiSchool {
  const { THREE } = bag.ctx;
  const geo = koiGeometry(THREE, '#d8482c', '#f6f1e6', '#f3e6d6');
  instanceAttrs(THREE, geo, max, (i) => i * 1.7);
  const anim = swimMaterial(THREE);
  const mesh = new THREE.InstancedMesh(geo, anim.material, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tints = ['#ffffff', '#f6c65a', '#ffd9c4', '#f09a5a', '#ffffff'];
  const c = new THREE.Color();
  for (let i = 0; i < max; i++) mesh.setColorAt(i, c.set(tints[i % tints.length]));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = 'pet:koi';
  return { mesh, uniforms: anim.uniforms, count: 0 };
}
