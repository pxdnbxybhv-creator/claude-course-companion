// The homestead's materials: toon washes with motion in the vertex shader (windmills turn, swings
// and hanging lanterns sway, leaves and laundry stir — see brush.ts for the attributes), an ink
// hull for soft shapes, ink edge lines, warm-lit lantern paper and window paper for the night, the
// water, the painted boards, the ghost. One set per world, shared by the plot, the ghost and the
// thumbnails.
import type * as T from 'three';
import type { Three } from './brush';

/** Shared uniforms: seconds, and the one swing a walker is riding (its slot and amplitude). */
export interface AnimUniforms { uTime: { value: number }; uHot: { value: number }; uHotAmp: { value: number } }

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uHot;
uniform float uHotAmp;
attribute vec4 aPiv;
attribute vec4 aAnim;
mat3 hbRot(vec3 a, float ang) {
  float s = sin(ang), c = cos(ang), oc = 1.0 - c;
  return mat3(
    oc * a.x * a.x + c,       oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
    oc * a.x * a.y - a.z * s, oc * a.y * a.y + c,       oc * a.y * a.z + a.x * s,
    oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
}
void hbAnim(inout vec3 p, inout vec3 n) {
  float m = mod(aAnim.w + 0.001, 8.0);
  if (m < 0.5) return;
  if (m < 2.5) {
    float ang;
    if (m < 1.5) ang = uTime * aPiv.w;
    else {
      float slot = floor((aAnim.w + 0.001) / 8.0);
      float amp = abs(slot - uHot) < 0.5 ? uHotAmp : aPiv.w;
      ang = amp * sin(uTime * 1.9 + aPiv.x * 0.7 + aPiv.z * 0.3);
    }
    mat3 R = hbRot(normalize(aAnim.xyz), ang);
    p = aPiv.xyz + R * (p - aPiv.xyz);
    n = R * n;
    return;
  }
  float h = m < 3.5 ? max(0.0, p.y - aPiv.y) : max(0.0, aPiv.y - p.y);
  float ph = aPiv.x * 0.37 + aPiv.z * 0.23;
  float w = aPiv.w * h * h;
  p.x += (sin(uTime * 1.3 + ph) + 0.4 * sin(uTime * 2.9 + ph * 1.7)) * w;
  p.z += cos(uTime * 1.1 + ph) * 0.6 * w;
}
`;

/** The pendulum angle the shader gives a swing (the rider's seat follows it in JS). */
export function swingAngle(t: number, px: number, pz: number, amp: number): number {
  return amp * Math.sin(t * 1.9 + px * 0.7 + pz * 0.3);
}

function animToon<M extends T.Material>(m: M, U: AnimUniforms, key: string): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 hbP = position;\nhbAnim(hbP, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = hbP;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export interface HomeMats {
  U: AnimUniforms;
  solid: T.MeshToonMaterial;
  soft: T.MeshToonMaterial;
  glow: T.MeshToonMaterial;
  water: T.MeshToonMaterial;
  hull: T.MeshBasicMaterial;
  lines: T.LineBasicMaterial;
  text: T.MeshToonMaterial;
  /** 0 day … 1 night: dims the washes, lights the lanterns and windows. */
  setNight(n: number): void;
  /** Thumbnails: full daylight regardless of the hour (restore with setNight). */
  daylight(): void;
  dispose(): void;
}

export function homeMats(THREE: Three, grad: T.Texture, nightShade: string): HomeMats {
  const U: AnimUniforms = { uTime: { value: 0 }, uHot: { value: -1 }, uHotAmp: { value: 0 } };
  const toon = (o: T.MeshToonMaterialParameters) => new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
  const solid = animToon(toon({ color: '#ffffff', vertexColors: true }), U, 'hb-solid');
  const soft = animToon(toon({ color: '#ffffff', vertexColors: true }), U, 'hb-soft');
  const glow = animToon(toon({ color: '#ffffff', vertexColors: true, emissive: new THREE.Color('#000000') }), U, 'hb-glow');
  const water = toon({ color: '#ffffff', vertexColors: true, emissive: new THREE.Color('#13302f') });
  water.customProgramCacheKey = () => 'hb-water';
  const text = toon({ color: '#ffffff' });
  const hull = new THREE.MeshBasicMaterial({ color: '#2a211b', side: THREE.BackSide });
  hull.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <begin_vertex>', 'vec3 hbN = normal;\nvec3 transformed = position;\nhbAnim(transformed, hbN);\ntransformed += normalize(hbN) * 0.016;');
  };
  hull.customProgramCacheKey = () => 'hb-hull';
  const lines = new THREE.LineBasicMaterial({ color: '#2a211b', transparent: true, opacity: 0.5 });
  lines.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <begin_vertex>', 'vec3 hbN = vec3(0.0, 1.0, 0.0);\nvec3 transformed = position;\nhbAnim(transformed, hbN);');
  };
  lines.customProgramCacheKey = () => 'hb-lines';

  const day = new THREE.Color('#ffffff'), night = new THREE.Color(nightShade);
  const shade = new THREE.Color();
  const warm = new THREE.Color('#ff9a45');
  const washes = [solid, soft, glow, water, text];
  const setNight = (n: number) => {
    shade.copy(day).lerp(night, n);
    for (const m of washes) m.color.copy(shade);
    glow.emissive.copy(warm).multiplyScalar(0.95 * n);
    water.emissive.set('#13302f').multiplyScalar(1 - 0.5 * n);
    lines.opacity = 0.5 - 0.15 * n;
  };
  setNight(0);
  return {
    U, solid, soft, glow, water, hull, lines, text, setNight,
    daylight: () => { for (const m of washes) m.color.copy(day); glow.emissive.setRGB(0, 0, 0); },
    dispose: () => { for (const m of [solid, soft, glow, water, text, hull, lines]) m.dispose(); },
  };
}
