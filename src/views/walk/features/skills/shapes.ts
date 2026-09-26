// Low-poly things the skills bring into the world: a folded paper crane, a flower that springs up,
// a stray cat, and Red Hare (赤兔) — the horse's legs, mane and tail move in the vertex shader, so the
// whole horse is one draw (plus its ink outline).
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { instanceAttrs, merge, part, poly, wingMaterial } from '../geo';

type Three = WorldCtx['THREE'];

// ───────────────────────────── paper crane ─────────────────────────────

/** A paper crane facing +z, wings along ±x (aFlap), in the shared wing-beat material. */
export function birdWingParts(THREE: Three): { geo: T.BufferGeometry; mat: T.Material; amp: T.InstancedBufferAttribute; uniforms: { uTime: { value: number } } } {
  const paper = '#f6f1e4', shade = '#ddd3bf', red = '#b93a2b';
  const parts: T.BufferGeometry[] = [];
  // the folded body: two slanted planes meeting in a ridge, and a keel
  parts.push(part(THREE, poly(THREE, [[0, 0.03, 0.2], [0.055, 0, 0], [0, 0.03, -0.19]]), paper));
  parts.push(part(THREE, poly(THREE, [[0, 0.03, 0.2], [-0.055, 0, 0], [0, 0.03, -0.19]]), shade));
  parts.push(part(THREE, poly(THREE, [[0, 0.02, 0.18], [0, -0.07, 0.0], [0, 0.02, -0.17]]), shade));
  // the neck rising forward with a folded head, the tail rising back
  parts.push(part(THREE, poly(THREE, [[0, 0.02, 0.12], [0, 0.22, 0.3], [0.012, 0.03, 0.06]]), paper));
  parts.push(part(THREE, poly(THREE, [[0, 0.22, 0.3], [0, 0.19, 0.37], [0.01, 0.2, 0.29]]), red));
  parts.push(part(THREE, poly(THREE, [[0, 0.02, -0.12], [0, 0.2, -0.31], [0.012, 0.03, -0.06]]), paper));
  // the wings, hinged at the ridge
  for (const s of [1, -1]) {
    const h = 0.02;
    parts.push(part(THREE, poly(THREE, [[s * h, 0.03, 0.1], [s * 0.34, 0.07, -0.04], [s * h, 0.03, -0.11]]), s > 0 ? paper : shade, {}, (x) => Math.max(0, Math.abs(x) - h)));
  }
  const geo = merge(THREE, parts);
  const { amp } = instanceAttrs(THREE, geo, 1, () => 0);
  const anim = wingMaterial(THREE, { rate: 11, angle: 0.75, lift: 0.12, fold: 0.5 });
  return { geo, mat: anim.material, amp, uniforms: anim.uniforms };
}

// ───────────────────────────── flowers ─────────────────────────────

/** A flower's stem, two leaves and its golden heart (green, not tinted), ~0.4 m tall. */
export function flowerStem(THREE: Three): T.BufferGeometry {
  return merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.009, 0.013, 0.36, 5), '#5f8a45', { p: [0, 0.18, 0] }),
    part(THREE, poly(THREE, [[0, 0.1, 0], [0.09, 0.16, 0.02], [0.13, 0.2, 0], [0.05, 0.14, -0.01]]), '#7aa552'),
    part(THREE, poly(THREE, [[0, 0.16, 0], [-0.08, 0.22, -0.02], [-0.12, 0.27, 0], [-0.04, 0.2, 0.01]]), '#6c9a4a'),
    part(THREE, new THREE.IcosahedronGeometry(0.026, 0), '#e9b83b', { p: [0, 0.375, 0] }),
  ]);
}

/** Five cupped petals in white (the instance colour tints them). */
export function flowerBloom(THREE: Three): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(THREE, new THREE.IcosahedronGeometry(0.05, 0), '#ffffff', {
      p: [Math.cos(a) * 0.05, 0.37, Math.sin(a) * 0.05], r: [0, -a, 0.45], s: [1.25, 0.32, 0.8],
    }));
  }
  return merge(THREE, parts);
}

// ───────────────────────────── a stray cat ─────────────────────────────

/** A small cat facing +z (~0.45 m long), in pale tones for the instance colour to tint. */
export function catGeometry(THREE: Three): T.BufferGeometry {
  const fur = '#ffffff', pale = '#f4ede2', dark = '#2a2622', pink = '#e3a09a';
  const parts: T.BufferGeometry[] = [
    part(THREE, new THREE.IcosahedronGeometry(0.12, 1), fur, { p: [0, 0.17, 0], s: [0.8, 0.75, 1.35] }),
    part(THREE, new THREE.IcosahedronGeometry(0.075, 0), pale, { p: [0, 0.13, 0.03], s: [0.9, 0.7, 1.3] }),
    part(THREE, new THREE.IcosahedronGeometry(0.085, 1), fur, { p: [0, 0.27, 0.16] }),
    part(THREE, new THREE.ConeGeometry(0.035, 0.07, 4), fur, { p: [0.045, 0.35, 0.16], r: [0, 0, -0.25] }),
    part(THREE, new THREE.ConeGeometry(0.035, 0.07, 4), fur, { p: [-0.045, 0.35, 0.16], r: [0, 0, 0.25] }),
    part(THREE, new THREE.IcosahedronGeometry(0.013, 0), dark, { p: [0.032, 0.285, 0.235] }),
    part(THREE, new THREE.IcosahedronGeometry(0.013, 0), dark, { p: [-0.032, 0.285, 0.235] }),
    part(THREE, new THREE.IcosahedronGeometry(0.011, 0), pink, { p: [0, 0.26, 0.245] }),
    // the tail curling up behind
    part(THREE, new THREE.CylinderGeometry(0.014, 0.022, 0.26, 5), fur, { p: [0, 0.26, -0.2], r: [-0.55, 0, 0] }),
    part(THREE, new THREE.IcosahedronGeometry(0.02, 0), dark, { p: [0, 0.37, -0.27] }),
  ];
  for (const [x, z] of [[0.05, 0.1], [-0.05, 0.1], [0.05, -0.09], [-0.05, -0.09]]) {
    parts.push(part(THREE, new THREE.CylinderGeometry(0.018, 0.02, 0.12, 5), fur, { p: [x, 0.06, z] }));
  }
  return merge(THREE, parts);
}

// ───────────────────────────── Red Hare ─────────────────────────────

/**
 * The horse, facing +z, standing on y = 0 (back ~1.3 m). Attributes aLeg (0 body, 1–4 legs,
 * 5 tail, 6 mane) and aPiv (the hinge's y and z) let the vertex shader swing them.
 */
export function horseGeometry(THREE: Three): { geo: T.BufferGeometry; saddleY: number } {
  const coat = '#9e3824', coatDk = '#7e2a1b', muzzle = '#b75a3d', mane = '#2a1510', hoofC = '#2b221c';
  const saddle = '#b93a2b', cloth = '#3f6b54', gold = '#c9a13b';
  const tagged: { g: T.BufferGeometry; leg: number; py: number; pz: number }[] = [];
  const add = (g: T.BufferGeometry, leg = 0, py = 0, pz = 0) => tagged.push({ g, leg, py, pz });
  // body, chest, rump
  add(part(THREE, new THREE.SphereGeometry(0.3, 12, 8), coat, { p: [0, 1.05, 0], s: [0.95, 1.05, 1.9] }));
  add(part(THREE, new THREE.SphereGeometry(0.27, 10, 8), coat, { p: [0, 1.08, 0.42] }));
  add(part(THREE, new THREE.SphereGeometry(0.29, 10, 8), coatDk, { p: [0, 1.1, -0.42] }));
  // the neck, reaching forward and up, and the head
  add(part(THREE, new THREE.CylinderGeometry(0.12, 0.2, 0.66, 8), coat, { p: [0, 1.46, 0.66], r: [0.62, 0, 0] }));
  add(part(THREE, new THREE.CylinderGeometry(0.075, 0.12, 0.46, 7), coat, { p: [0, 1.7, 0.98], r: [1.75, 0, 0] }));
  add(part(THREE, new THREE.SphereGeometry(0.08, 7, 5), muzzle, { p: [0, 1.62, 1.2], s: [0.95, 0.85, 1.1] }));
  add(part(THREE, new THREE.SphereGeometry(0.018, 5, 4), '#141110', { p: [0.085, 1.77, 0.98] }));
  add(part(THREE, new THREE.SphereGeometry(0.018, 5, 4), '#141110', { p: [-0.085, 1.77, 0.98] }));
  for (const s of [1, -1]) add(part(THREE, new THREE.ConeGeometry(0.035, 0.12, 4), coatDk, { p: [s * 0.05, 1.93, 0.86], r: [-0.2, 0, s * -0.2] }));
  // a red tassel (缨) at the chest and a gold bridle ring
  add(part(THREE, new THREE.ConeGeometry(0.07, 0.16, 7), saddle, { p: [0, 1.12, 0.66], r: [Math.PI, 0, 0] }));
  add(part(THREE, new THREE.TorusGeometry(0.1, 0.012, 4, 12), gold, { p: [0, 1.7, 1.0], r: [0.2, 0, 0] }));
  // the mane along the neck (sways), the forelock
  add(part(THREE, new THREE.BoxGeometry(0.05, 0.12, 0.62), mane, { p: [0, 1.55, 0.57], r: [-0.95, 0, 0] }), 6, 1.35, 0.5);
  add(part(THREE, new THREE.BoxGeometry(0.1, 0.06, 0.08), mane, { p: [0, 1.9, 0.94] }), 6, 1.35, 0.5);
  // the saddle, its green cloth with a gold edge
  add(part(THREE, new THREE.BoxGeometry(0.58, 0.03, 0.5), cloth, { p: [0, 1.31, -0.02] }));
  add(part(THREE, new THREE.BoxGeometry(0.6, 0.02, 0.52), gold, { p: [0, 1.296, -0.02] }));
  add(part(THREE, new THREE.BoxGeometry(0.34, 0.08, 0.42), saddle, { p: [0, 1.36, -0.02] }));
  add(part(THREE, new THREE.BoxGeometry(0.3, 0.1, 0.06), saddle, { p: [0, 1.42, 0.17] }));
  // the tail: a long flowing brush from the rump
  add(part(THREE, new THREE.ConeGeometry(0.1, 0.8, 7), mane, { p: [0, 0.86, -0.86], r: [0.45, 0, 0] }), 5, 1.2, -0.7);
  // four legs with dark hooves
  const legs: [number, number, number][] = [[0.15, 0.44, 1], [-0.15, 0.44, 2], [0.15, -0.44, 3], [-0.15, -0.44, 4]];
  for (const [x, z, id] of legs) {
    add(part(THREE, new THREE.CylinderGeometry(0.06, 0.045, 0.96, 6), id < 3 ? coat : coatDk, { p: [x, 0.52, z] }), id, 0.98, z);
    add(part(THREE, new THREE.CylinderGeometry(0.055, 0.065, 0.1, 6), hoofC, { p: [x, 0.05, z] }), id, 0.98, z);
  }
  // tag, then merge
  for (const t of tagged) {
    const n = t.g.attributes.position.count;
    t.g.setAttribute('aFlap', new THREE.BufferAttribute(new Float32Array(n).fill(t.leg), 1));
    const piv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { piv[i * 2] = t.py; piv[i * 2 + 1] = t.pz; }
    t.g.setAttribute('aPiv', new THREE.BufferAttribute(piv, 2));
  }
  // merge() keeps position/normal/color/aFlap; carry aPiv across by hand
  let total = 0;
  for (const t of tagged) total += t.g.attributes.position.count;
  const pivAll = new Float32Array(total * 2);
  let o = 0;
  for (const t of tagged) { pivAll.set(t.g.attributes.aPiv.array as Float32Array, o * 2); o += t.g.attributes.position.count; }
  const geo = merge(THREE, tagged.map((t) => t.g));
  geo.setAttribute('aPiv', new THREE.BufferAttribute(pivAll, 2));
  return { geo, saddleY: 1.36 };
}

const HORSE_VERT = /* glsl */`
if (aFlap > 0.5) {
  float ang;
  if (aFlap > 5.5) ang = sin(uGait * 0.5) * 0.05 * uAmp - 0.02;
  else if (aFlap > 4.5) ang = 0.55 * uAmp + sin(uGait * 0.5 + 0.8) * (0.08 + 0.1 * uAmp);
  else {
    float off = aFlap < 1.5 ? 0.0 : aFlap < 2.5 ? 0.55 : aFlap < 3.5 ? 3.3 : 3.85;
    ang = sin(uGait + off) * 0.62 * uAmp;
  }
  float c = cos(ang), s = sin(ang);
  vec3 p = transformed - vec3(0.0, aPiv.x, aPiv.y);
  transformed = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c) + vec3(0.0, aPiv.x, aPiv.y);
}`;

/** Animate a material's vertices as the horse's gait (uGait: stride phase, uAmp: 0 standing … 1 full gallop). */
export function horseAnimate(m: T.Material, uniforms: { uGait: { value: number }; uAmp: { value: number } }, key: string, outline = 0): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGait = uniforms.uGait;
    sh.uniforms.uAmp = uniforms.uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlap;\nattribute vec2 aPiv;\nuniform float uGait;\nuniform float uAmp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + HORSE_VERT + (outline ? `\ntransformed += normalize(normal) * ${outline.toFixed(4)};` : ''));
  };
  m.customProgramCacheKey = () => key;
}
