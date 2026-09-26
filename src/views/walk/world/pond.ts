// 半亩方塘一鉴开 — the half-acre pond. A mirror (Reflector) seen through ink: the reflection is laid
// over the paper as a soft wash, stirred by slow ripples. How clear it is follows the habits'
// freshness: clear and bright when they are kept, muddier and dotted with duckweed when not.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { makeRng } from '../../../core/rng';
import { Bag } from './kit';
import { POND } from './site';

/** Layer for things the reflection camera should skip (particles, ripples, duckweed, shadows). */
export const NO_REFLECT = 1;

const WATER_SHADER = {
  name: 'InkWater',
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uTime: { value: 0 },
      uClarity: { value: 1 },
      uWater: { value: new THREE.Color('#e9e2d2') },
      uMurk: { value: new THREE.Color('#7f7757') },
      uPond: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) },
    },
  ]),
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uClarity;
    uniform vec3 uWater;
    uniform vec3 uMurk;
    uniform vec4 uPond;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      vec2 w = vWorld.xz;
      float r1 = sin(w.x * 2.1 + uTime * 0.9 + sin(w.y * 1.7 - uTime * 0.6) * 1.3);
      float r2 = sin(w.y * 2.9 - uTime * 0.7 + sin(w.x * 1.1 + uTime * 0.3) * 1.5);
      vec2 d = vec2(r1 + 0.5 * r2, r2 - 0.4 * r1) * (0.006 + 0.008 * (1.0 - uClarity));
      vec4 uv = vUv;
      uv.xy += d * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      float cl = uClarity;
      vec3 base = mix(uMurk, uWater, smoothstep(0.1, 0.95, cl));
      vec3 col = mix(base, refl, 0.28 + 0.5 * cl);
      // brush-line ripples, like the few strokes a painter gives to water
      float band = sin(w.y * 7.0 + r1 * 0.8 + uTime * 0.35) * sin(w.x * 0.9 + uTime * 0.2);
      col *= 1.0 - smoothstep(0.86, 1.0, band) * 0.07;
      // darker near the bank: the water is deeper in shadow under the lip
      float q = length((w - uPond.xy) / uPond.zw);
      col *= 1.0 - smoothstep(0.72, 1.0, q) * 0.1;
      gl_FragColor = vec4(col * color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

export interface Pond {
  group: THREE.Group;
  water: Reflector;
  update(dt: number, t: number, waterColor: THREE.Color, night: number): void;
  ripple(x: number, z: number, size?: number): void;
  setSize(w: number, h: number): void;
  /**
   * While true the mirror is redrawn at every render, whatever the frame-skipping (低) or the world's
   * far-off gate would do: a photograph's frame always holds a fresh reflection.
   */
  force: boolean;
  dispose(): void;
}

const RING_DAY = new THREE.Color('#2a2724');
const RING_NIGHT = new THREE.Color('#c9cfd8');

/**
 * `mirror` comes from the picture quality: the reflection's resolution against the canvas's (中 0.55,
 * or 0.4 on a low-end phone; 低 a quarter; 身临其境 full) and every how many frames it is redrawn (低
 * every other frame: the ripples hide it).
 */
export function buildPond(bag: Bag, clarity: number, o: { mirror: { scale: number; every: number }; reduced: boolean; w: number; h: number }): Pond {
  const group = new THREE.Group();
  group.name = 'pond';
  const geo = bag.add(new THREE.CircleGeometry(1, 72));
  geo.scale(POND.rx * 1.14, POND.rz * 1.14, 1);
  const scale = o.mirror.scale;
  const minTex = scale < 0.4 ? 128 : 256;
  const water = new Reflector(geo, {
    color: '#ffffff',
    textureWidth: Math.max(minTex, Math.round(o.w * scale)),
    textureHeight: Math.max(minTex, Math.round(o.h * scale)),
    clipBias: 0.003,
    shader: WATER_SHADER,
    multisample: 0,
  });
  const mat = water.material as THREE.ShaderMaterial;
  mat.fog = true;
  mat.uniforms.uClarity.value = clarity;
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, POND.waterY, POND.z);
  water.name = 'water';
  group.add(water);
  // a mirror redrawn every other frame (低): the last reflection holds in between (not while forced)
  const gate = { force: false };
  if (o.mirror.every > 1) {
    const every = Math.round(o.mirror.every);
    const draw = water.onBeforeRender;
    let n = 0;
    water.onBeforeRender = function (...a: Parameters<typeof draw>) { if (n++ % every === 0 || gate.force) draw.apply(this, a); };
  }

  // duckweed: more the muddier the pond
  const rng = makeRng(8080);
  const count = Math.round((1 - clarity) * 220);
  let weed: THREE.InstancedMesh | null = null;
  if (count > 0) {
    const wg = bag.add(new THREE.CircleGeometry(1, 7));
    wg.rotateX(-Math.PI / 2);
    const wm = bag.add(new THREE.MeshLambertMaterial({ color: '#6d8660' }));
    weed = new THREE.InstancedMesh(wg, wm, count);
    const m4 = new THREE.Matrix4();
    const clusters = Array.from({ length: 5 }, () => {
      const a = rng() * Math.PI * 2, q = rng.range(0.55, 0.9);
      return [POND.x + Math.cos(a) * POND.rx * q, POND.z + Math.sin(a) * POND.rz * q];
    });
    for (let i = 0; i < count; i++) {
      const c = clusters[i % clusters.length];
      let x = c[0] + rng.gauss() * 0.8, z = c[1] + rng.gauss() * 0.6;
      const q = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
      if (q > 0.93) { x = POND.x + (x - POND.x) * 0.9 / q; z = POND.z + (z - POND.z) * 0.9 / q; }
      const s = rng.range(0.04, 0.11);
      m4.makeScale(s, 1, s * rng.range(0.7, 1));
      m4.setPosition(x, POND.waterY + 0.012, z);
      weed.setMatrixAt(i, m4);
    }
    weed.layers.set(NO_REFLECT);
    group.add(weed);
  }

  // ripple rings
  const ringGeo = bag.add(new THREE.RingGeometry(0.92, 1, 48));
  ringGeo.rotateX(-Math.PI / 2);
  const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; life: number; size: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const m = bag.add(new THREE.MeshBasicMaterial({ color: '#2a2724', transparent: true, opacity: 0, depthWrite: false }));
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.visible = false;
    mesh.layers.set(NO_REFLECT);
    mesh.renderOrder = 1;
    group.add(mesh);
    rings.push({ mesh, mat: m, age: 0, life: 1, size: 1 });
  }
  let next = 0;
  const ripple = (x: number, z: number, size = 1) => {
    const r = rings[next++ % rings.length];
    r.mesh.position.set(x, POND.waterY + 0.015, z);
    r.age = 0;
    r.life = 2.2 + size * 0.8;
    r.size = size;
    r.mesh.visible = true;
  };
  let nextFish = 3;
  const fishRng = makeRng(1234);

  return {
    group,
    water,
    ripple,
    update(dt, t, waterColor, night) {
      mat.uniforms.uTime.value = o.reduced ? t * 0.35 : t;
      (mat.uniforms.uWater.value as THREE.Color).copy(waterColor);
      (mat.uniforms.color.value as THREE.Color).setScalar(1 - night * 0.12);
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) { r.mesh.visible = false; continue; }
        const s = (0.1 + (1 - Math.pow(1 - k, 2.2)) * 0.9) * r.size;
        r.mesh.scale.setScalar(s);
        r.mat.opacity = 0.35 * (1 - k) * (night > 0.5 ? 0.6 : 1);
        r.mat.color.copy(night > 0.5 ? RING_NIGHT : RING_DAY);
      }
      // now and then a fish rises
      if (!o.reduced && t > nextFish) {
        nextFish = t + fishRng.range(3, 8);
        const a = fishRng() * Math.PI * 2, q = fishRng.range(0.2, 0.8);
        ripple(POND.x + Math.cos(a) * POND.rx * q, POND.z + Math.sin(a) * POND.rz * q, fishRng.range(0.5, 0.9));
      }
    },
    setSize(w, h) {
      water.getRenderTarget().setSize(Math.max(minTex, Math.round(w * scale)), Math.max(minTex, Math.round(h * scale)));
    },
    get force() { return gate.force; },
    set force(on: boolean) { gate.force = on; },
    dispose() {
      water.dispose();
    },
  };
}
