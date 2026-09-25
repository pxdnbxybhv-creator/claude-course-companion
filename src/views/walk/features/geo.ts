// Low-poly geometry helpers: merge coloured parts into one vertex-coloured mesh, and a few small
// creatures whose wings / tails move in the vertex shader (one draw call per flock or school).
import type * as T from 'three';
import type { Three } from './kit';

export interface Xf { p?: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number] }

/** A coloured, transformed, non-indexed copy of `g` (disposes `g`). `flap` fills the aFlap attribute. */
export function part(THREE: Three, g: T.BufferGeometry, color: T.ColorRepresentation, xf: Xf = {}, flap?: (x: number, y: number, z: number) => number): T.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  const m = new THREE.Matrix4();
  const s = xf.s === undefined ? [1, 1, 1] : typeof xf.s === 'number' ? [xf.s, xf.s, xf.s] : xf.s;
  m.compose(
    new THREE.Vector3(...(xf.p ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(xf.r ?? [0, 0, 0]))),
    new THREE.Vector3(s[0], s[1], s[2]),
  );
  ng.applyMatrix4(m);
  const n = ng.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (flap) {
    const pos = ng.attributes.position;
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = flap(pos.getX(i), pos.getY(i), pos.getZ(i));
    ng.setAttribute('aFlap', new THREE.BufferAttribute(f, 1));
  }
  return ng;
}

/** Concatenate parts (position, normal, color, aFlap) into one geometry; disposes the parts. */
export function merge(THREE: Three, parts: T.BufferGeometry[]): T.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), flp = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    const c = p.attributes.position.count;
    if (!p.attributes.normal) p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    if (p.attributes.color) col.set(p.attributes.color.array as Float32Array, o * 3);
    else col.fill(1, o * 3, (o + c) * 3);
    if (p.attributes.aFlap) flp.set(p.attributes.aFlap.array as Float32Array, o);
    o += c;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlap', new THREE.BufferAttribute(flp, 1));
  g.computeBoundingSphere();
  return g;
}

/** A flat polygon (list of [x, y, z]) as a double-sided fan. */
export function poly(THREE: Three, pts: [number, number, number][]): T.BufferGeometry {
  const v: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    v.push(...pts[0], ...pts[i], ...pts[i + 1]);
    v.push(...pts[0], ...pts[i + 1], ...pts[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

// ───────────────────────────── animated instanced materials ─────────────────────────────

export interface Animated {
  material: T.MeshLambertMaterial;
  uniforms: { uTime: { value: number } };
}

/**
 * Wings hinge in the vertex shader. Geometry attribute aFlap = a vertex's distance from its wing's
 * hinge (0 for the body). Instance attributes: aPhase (beat offset) and aAmp (0 = folded / gliding,
 * 1 = full beat). `rate` in rad/s, `angle` the beat amplitude in radians.
 */
export function wingMaterial(THREE: Three, o: { rate: number; angle: number; lift?: number; fold?: number }): Animated {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFlap;
attribute float aPhase;
attribute float aAmp;
uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (aFlap > 0.0) {
  float side = sign(transformed.x);
  float d = aFlap * mix(${(o.fold ?? 0.35).toFixed(3)}, 1.0, aAmp);
  float hinge = abs(transformed.x) - aFlap;
  float th = aAmp * (sin(uTime * ${o.rate.toFixed(3)} + aPhase) * ${o.angle.toFixed(3)} + ${(o.lift ?? 0).toFixed(3)});
  transformed.x = side * (hinge + d * cos(th));
  transformed.y += d * sin(th);
}`);
  };
  material.customProgramCacheKey = () => `wing-${o.rate}-${o.angle}-${o.lift ?? 0}-${o.fold ?? 0.35}`;
  return { material, uniforms };
}

/** A swimming wiggle for fish: aFlap weights the sideways wave (0 at the head, 1 at the tail). */
export function swimMaterial(THREE: Three): Animated {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFlap;
attribute float aPhase;
attribute float aAmp;
uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.x += sin(uTime * (5.0 + 7.0 * aAmp) + aPhase - transformed.z * 9.0) * aFlap * (0.035 + 0.05 * aAmp);`);
  };
  material.customProgramCacheKey = () => 'koi-swim';
  return { material, uniforms };
}

/** Adds the per-instance aPhase / aAmp attributes to a geometry for `count` instances. */
export function instanceAttrs(THREE: Three, g: T.BufferGeometry, count: number, phase: (i: number) => number): { phase: T.InstancedBufferAttribute; amp: T.InstancedBufferAttribute } {
  const ph = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const amp = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  for (let i = 0; i < count; i++) { ph.setX(i, phase(i)); amp.setX(i, 1); }
  amp.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPhase', ph);
  g.setAttribute('aAmp', amp);
  return { phase: ph, amp };
}

// ───────────────────────────── creatures ─────────────────────────────

/** A small bird facing +z, wings spread along ±x (sparrow / magpie). ~0.26 m long. */
export function birdGeometry(THREE: Three, c: { body: string; belly: string; wing: string; tip: string; beak: string }): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.06, 0), c.body, { s: [0.9, 0.8, 1.45] }));
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.045, 0), c.belly, { p: [0, -0.022, 0.01], s: [0.95, 0.7, 1.3] }));
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.042, 0), c.body, { p: [0, 0.045, 0.075] }));
  parts.push(part(THREE, new THREE.ConeGeometry(0.012, 0.04, 4), c.beak, { p: [0, 0.04, 0.125], r: [Math.PI / 2, 0, 0] }));
  parts.push(part(THREE, poly(THREE, [[0, 0.02, -0.06], [0.03, 0.035, -0.17], [-0.03, 0.035, -0.17]]), c.wing));
  for (const s of [1, -1]) {
    const h = 0.035;
    parts.push(part(THREE, poly(THREE, [[s * h, 0.02, 0.04], [s * (h + 0.07), 0.02, 0.02], [s * (h + 0.12), 0.02, -0.04], [s * h, 0.02, -0.05]]), c.wing, {},
      (x) => Math.max(0, Math.abs(x) - h)));
    parts.push(part(THREE, poly(THREE, [[s * (h + 0.07), 0.021, 0.02], [s * (h + 0.14), 0.021, -0.02], [s * (h + 0.12), 0.021, -0.04]]), c.tip, {},
      (x) => Math.max(0, Math.abs(x) - h)));
  }
  return merge(THREE, parts);
}

/** A koi, head at +z, ~0.5 m long; aFlap weights the tail wave. */
export function koiGeometry(THREE: Three, patch: string, base: string, fin: string): T.BufferGeometry {
  const tailW = (_x: number, _y: number, z: number) => Math.min(1, Math.max(0, (0.06 - z) / 0.36));
  const body = new THREE.IcosahedronGeometry(0.1, 1);
  body.scale(0.55, 0.42, 2.3);
  // Colour the back with patches (kohaku): ink-free, cheerful, restrained.
  const parts: T.BufferGeometry[] = [];
  const b = part(THREE, body, base, {}, tailW);
  const pos = b.attributes.position, col = b.attributes.color;
  const pc = new THREE.Color(patch);
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const spot = cy > 0.005 && (Math.sin(cz * 26 + 0.8) + Math.sin(cx * 40) * 0.4 > 0.1 || cz > 0.17);
    if (spot) for (let k = 0; k < 3; k++) col.setXYZ(i + k, pc.r, pc.g, pc.b);
  }
  parts.push(b);
  parts.push(part(THREE, poly(THREE, [[0, 0, -0.2], [0, 0.09, -0.36], [0, 0.01, -0.3], [0, -0.08, -0.36]]), fin, {}, tailW));
  parts.push(part(THREE, poly(THREE, [[0, 0.035, 0.06], [0, 0.07, -0.02], [0, 0.03, -0.1]]), fin, {}, tailW));
  for (const s of [1, -1]) parts.push(part(THREE, poly(THREE, [[s * 0.045, -0.02, 0.1], [s * 0.1, -0.035, 0.06], [s * 0.05, -0.02, 0.04]]), fin, {}, tailW));
  return merge(THREE, parts);
}

/** A butterfly, wings along ±x in a near-horizontal plane; ~0.14 m span. */
export function butterflyGeometry(THREE: Three, wing: string, edge: string, body: string): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  parts.push(part(THREE, new THREE.CylinderGeometry(0.006, 0.004, 0.06, 4), body, { r: [Math.PI / 2, 0, 0] }));
  for (const s of [1, -1]) {
    const f = (x: number) => Math.abs(x);
    parts.push(part(THREE, poly(THREE, [[0, 0, 0.01], [s * 0.04, 0, 0.05], [s * 0.075, 0, 0.035], [s * 0.065, 0, -0.005], [s * 0.01, 0, -0.005]]), wing, {}, f));
    parts.push(part(THREE, poly(THREE, [[0, 0, -0.005], [s * 0.05, 0, -0.01], [s * 0.045, 0, -0.045], [s * 0.012, 0, -0.035]]), wing, {}, f));
    parts.push(part(THREE, poly(THREE, [[s * 0.06, 0.001, 0.045], [s * 0.078, 0.001, 0.034], [s * 0.07, 0.001, 0.02]]), edge, {}, f));
  }
  return merge(THREE, parts);
}

/** A dragonfly, long body along z, two pairs of glassy wings. */
export function dragonflyGeometry(THREE: Three, body: string, wing: string): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  parts.push(part(THREE, new THREE.CylinderGeometry(0.006, 0.003, 0.12, 4), body, { p: [0, 0, -0.04], r: [Math.PI / 2, 0, 0] }));
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.013, 0), body, { p: [0, 0, 0.03] }));
  for (const s of [1, -1]) {
    const f = (x: number) => Math.abs(x);
    parts.push(part(THREE, poly(THREE, [[0, 0, 0.02], [s * 0.08, 0, 0.03], [s * 0.085, 0, 0.012], [0, 0, 0.008]]), wing, {}, f));
    parts.push(part(THREE, poly(THREE, [[0, 0, 0.0], [s * 0.075, 0, -0.012], [s * 0.07, 0, -0.03], [0, 0, -0.012]]), wing, {}, f));
  }
  return merge(THREE, parts);
}
