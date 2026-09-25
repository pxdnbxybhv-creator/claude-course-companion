// 棋士 · 推演: the world slows to a third for a few breaths while a go board ripples out over the
// ground under him and stones are set down one by one, clack by clack — time enough for any jump.
import type * as T from 'three';
import type { Bag } from '../kit';
import { CELL, MODE } from './fx';
import { HUE, clamp01, type Running, type SkillEnv } from './env';
import * as snd from './sound';

const SIZE = 11;
const SEG = 36;
const MARGIN = 0.04;

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uFade;
uniform float uNight;
uniform vec3 uInk;
uniform vec3 uGlow;
uniform vec3 uWood;
varying vec2 vUv;
void main() {
  float m = ${MARGIN.toFixed(3)};
  vec2 g = (vUv - m) / ((1.0 - 2.0 * m) / 18.0);
  vec2 f = abs(g - floor(g + 0.5));
  vec2 w = fwidth(g);
  bool inside = g.x > -0.06 && g.x < 18.06 && g.y > -0.06 && g.y < 18.06;
  float edge = (abs(g.x) < 0.06 || abs(g.x - 18.0) < 0.06 || abs(g.y) < 0.06 || abs(g.y - 18.0) < 0.06) ? 1.6 : 1.0;
  float lx = 1.0 - smoothstep(0.0, w.x * 1.4 * edge, f.x);
  float ly = 1.0 - smoothstep(0.0, w.y * 1.4 * edge, f.y);
  float line = inside ? max(lx, ly) : 0.0;
  // the nine star points
  vec2 n = floor(g + 0.5);
  bool star = (n.x == 3.0 || n.x == 9.0 || n.x == 15.0) && (n.y == 3.0 || n.y == 9.0 || n.y == 15.0);
  float dot = star ? 1.0 - smoothstep(0.1, 0.1 + w.x * 1.5, length(g - n)) : 0.0;
  // a ripple running out from the centre, and the board's reach growing with it
  float d = length(vUv - 0.5) * ${SIZE.toFixed(1)};
  float reach = smoothstep(uTime * 7.0 + 0.4, uTime * 7.0 - 0.6, d);
  float ring = exp(-pow((d - uTime * 7.0 + 0.3) / 0.45, 2.0));
  float wood = inside ? 0.14 : 0.0;
  float soft = 1.0 - smoothstep(0.42, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
  float a = (max(line * 0.6, dot * 0.85) + wood * (1.0 - line) + ring * 0.35 * (inside ? 1.0 : 0.0)) * reach * uFade * soft;
  if (a < 0.004) discard;
  vec3 ink = mix(uInk, uGlow, uNight);
  vec3 col = mix(uWood, ink, clamp(max(line, dot) + ring * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}`;

interface Board { mesh: T.Mesh; pos: T.BufferAttribute; base: Float32Array; uniforms: Record<string, { value: unknown }> }

function board(bag: Bag): Board {
  const { THREE } = bag.ctx;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as T.BufferAttribute;
  pos.setUsage(THREE.DynamicDrawUsage);
  const base = new Float32Array(pos.array as Float32Array);
  const uniforms = {
    uTime: { value: 0 }, uFade: { value: 0 }, uNight: { value: 0 },
    uInk: { value: new THREE.Color('#2b2520') }, uGlow: { value: new THREE.Color('#f3d49a') }, uWood: { value: new THREE.Color('#d8b878') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'go-board';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  bag.add(mesh);
  return { mesh, pos, base, uniforms };
}

export function makeGo(bag: Bag): (env: SkillEnv) => Running {
  let b: Board | null = null;
  return (env) => {
    const { ctx, fx, rng } = env;
    const P = ctx.player;
    b ??= board(bag);
    const B = b;
    P.emote('skill');
    snd.bend(true, 0.7);
    snd.clack(0.7);
    ctx.setTimeScale(0.3);
    P.setMoveMods({ speed: 2.4, jump: 1.1 });
    ctx.hud.toast('推演——万物放慢，一步三思', 'Foresight — the world slows; think three moves ahead', 2200);
    // lay the board over the ground, turned to face the way he faces
    const cx = P.position.x, cz = P.position.z, h = P.heading;
    const c = Math.cos(h), s = Math.sin(h);
    const arr = B.pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = B.base[i], z = B.base[i + 2];
      const wx = cx + x * c + z * s, wz = cz - x * s + z * c;
      arr[i] = x; arr[i + 2] = z;
      arr[i + 1] = env.floorAt(wx, wz) + 0.05;
    }
    B.pos.needsUpdate = true;
    B.mesh.position.set(cx, 0, cz);
    B.mesh.rotation.y = h;
    B.mesh.visible = true;
    // stones set down round the centre, black and white in turn
    const inner = SIZE * (1 - 2 * MARGIN);
    const stones: { i: number; j: number; at: number }[] = [];
    const taken = new Set<number>();
    for (let k = 0; k < 13; k++) {
      let i = 9, j = 9;
      for (let tries = 0; tries < 20; tries++) {
        i = 9 + rng.int(-5, 5); j = 9 + rng.int(-5, 5);
        if (!taken.has(i * 19 + j)) break;
      }
      taken.add(i * 19 + j);
      stones.push({ i, j, at: 0.35 + k * 0.27 });
    }
    let next = 0;
    let t0 = -1;
    let ended = false;
    const DUR = 4;
    const release = () => {
      if (ended) return;
      ended = true;
      ctx.setTimeScale(1);
      P.setMoveMods(null);
      snd.bend(false, 0.5);
    };
    return {
      update(_dt, t) {
        if (t0 < 0) t0 = t;
        const el = t - t0;
        B.uniforms.uTime.value = env.reduced ? 3 : el;
        B.uniforms.uNight.value = env.night();
        B.uniforms.uFade.value = clamp01(el / 0.3) * clamp01((DUR + 0.9 - el) / 0.9);
        while (next < stones.length && el >= stones[next].at && el < DUR) {
          const st = stones[next];
          const lx = (st.i / 18 - 0.5) * inner, lz = (st.j / 18 - 0.5) * inner;
          const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
          const y = env.floorAt(wx, wz) + 0.07;
          const white = next % 2 === 1;
          fx.ground.emit({ x: wx, y, z: wz, life: (DUR - st.at) * 0.32 + 0.35, size: (inner / 18) * 0.92, color: white ? 0xf3efe4 : 0x1f1c1a, alpha: 1, mode: MODE.flat, cell: CELL.stone, fadeIn: 0.02, fadeOut: 0.25 });
          fx.ground.emit({ x: wx, y: y - 0.01, z: wz, life: 0.3, size: 0.4, grow: 3, color: env.night() > 0.5 ? HUE.amber : HUE.inkSoft, alpha: 0.4, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.01, fadeOut: 0.8 });
          snd.clack(0.55);
          next++;
        }
        if (el >= DUR) release();
        if (el > DUR + 0.9) { B.mesh.visible = false; return false; }
        return true;
      },
      end() {
        release();
        B.mesh.visible = false;
      },
    };
  };
}
