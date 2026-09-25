// Open water beyond the garden: the lotus lake, the river (a ribbon along its course that flows),
// and the pool under the waterfall. Painted, not mirrored — pale paper water with a few ink
// strokes: slow ripple bands on the lake, streaks drifting downstream, a darker wash toward the
// deep middle. One shader for all of it (the half-acre pond keeps its real reflection).
import * as THREE from 'three';
import { LAKE } from '../map';
import { Bag } from './kit';
import { POOL, RIVER_SAMPLES } from './terrain';

const VS = /* glsl */`
attribute vec3 flow;
varying vec3 vFlow;
varying vec3 vWorld;
varying vec3 vView;
#include <common>
#include <fog_pars_vertex>
void main() {
  vFlow = flow;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vView = cameraPosition - w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FS = /* glsl */`
uniform float uTime;
uniform vec3 uWater;
uniform vec3 uInk;
uniform float uNight;
uniform vec4 uLake;
varying vec3 vFlow;
varying vec3 vWorld;
varying vec3 vView;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 w = vWorld.xz;
  float s = vFlow.x, across = vFlow.y, speed = vFlow.z;
  // how deep it reads: the river's middle, the lake's centre
  float deep = speed > 0.0 ? 1.0 - abs(across) : 1.0 - clamp(length((w - uLake.xy) / uLake.zw), 0.0, 1.0);
  vec3 col = mix(uWater, uWater * 0.8 + uInk * 0.2, smoothstep(0.2, 1.0, deep) * 0.55);
  // slow ripple bands (a few brush lines)
  float r1 = sin(w.x * 0.9 + uTime * 0.5 + sin(w.y * 0.7 - uTime * 0.3) * 1.3);
  float band = sin(w.y * 3.2 + r1 * 0.9 + uTime * 0.25) * sin(w.x * 0.45 + uTime * 0.12);
  col = mix(col, uInk, smoothstep(0.88, 1.0, band) * 0.13);
  // streaks drifting downstream
  if (speed > 0.0) {
    float t = s * 0.55 - uTime * speed;
    float lane = sin(across * 9.0 + sin(s * 0.13) * 2.0);
    float st = smoothstep(0.75, 1.0, sin(t + lane * 1.7) * lane);
    col = mix(col, uInk, st * 0.16 * (1.0 - abs(across)));
    // white water where it runs fast and steep
    float foam = smoothstep(0.6, 1.0, sin(t * 2.3 + across * 17.0) * sin(s * 0.7 + across * 5.0)) * clamp(speed - 1.2, 0.0, 1.0);
    col = mix(col, vec3(1.0), foam * 0.35);
  }
  // grazing view: the paper sky in it
  float fres = pow(1.0 - clamp(normalize(vView).y, 0.0, 1.0), 3.0);
  col = mix(col, uWater * 1.06, fres * 0.5);
  col *= 1.0 - uNight * 0.1;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const PAPER = new THREE.Color('#efe9dc');

export interface OpenWater {
  group: THREE.Group;
  update(t: number, water: THREE.Color, night: number): void;
}

function ribbon(from: number, to: number): THREE.BufferGeometry {
  const RS = RIVER_SAMPLES;
  const pos: number[] = [], flow: number[] = [], idx: number[] = [];
  let n = 0;
  for (let i = from; i < to; i++) {
    const p = RS[i];
    const prev = RS[Math.max(from, i - 1)], next = RS[Math.min(to - 1, i + 1)];
    const grade = Math.abs(next.y - prev.y) / (Math.hypot(next.x - prev.x, next.z - prev.z) || 1);
    const speed = 0.55 + Math.min(2.2, grade * 14);
    const hw = p.w + 0.55;
    for (const k of [-1, 0, 1]) {
      pos.push(p.x - p.tz * hw * k, p.y, p.z + p.tx * hw * k);
      flow.push(p.s, k, speed);
    }
    if (n > 0) {
      const a = (n - 1) * 3, b = n * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function disc(x: number, z: number, rx: number, rz: number, y: number, segs: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, segs);
  g.rotateX(-Math.PI / 2);
  g.scale(rx, 1, rz);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute('flow', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

export function buildWater(bag: Bag, reduced: boolean): OpenWater {
  const group = new THREE.Group();
  group.name = 'open-water';
  const mat = bag.add(new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWater: { value: new THREE.Color('#e9e2d2') },
        uInk: { value: new THREE.Color('#3b4448') },
        uNight: { value: 0 },
        uLake: { value: new THREE.Vector4(LAKE.x, LAKE.z, LAKE.rx, LAKE.rz) },
      },
    ]),
  }));
  const RS = RIVER_SAMPLES;
  const lowStart = RS.findIndex((s) => !s.upper);
  const upper = new THREE.Mesh(bag.add(ribbon(0, lowStart)), mat);
  upper.name = 'stream';
  const lower = new THREE.Mesh(bag.add(ribbon(lowStart, RS.length)), mat);
  lower.name = 'river';
  const lake = new THREE.Mesh(bag.add(disc(LAKE.x, LAKE.z, LAKE.rx + 1.6, LAKE.rz + 1.6, LAKE.waterY, 96)), mat);
  lake.name = 'lake';
  const pool = new THREE.Mesh(bag.add(disc(POOL.x, POOL.z, POOL.r + 0.8, POOL.r + 0.8, POOL.y, 32)), mat);
  pool.name = 'pool';
  // the lake sits a hair lower where the river ribbon overlaps it
  lake.position.y = -0.004;
  group.add(upper, lower, lake, pool);
  return {
    group,
    update(t, water, night) {
      mat.uniforms.uTime.value = reduced ? t * 0.3 : t;
      // paper water: the fog's colour, lifted toward the paper (less so by night)
      (mat.uniforms.uWater.value as THREE.Color).copy(water).lerp(PAPER, 0.5 - 0.25 * night);
      mat.uniforms.uNight.value = night;
    },
  };
}
