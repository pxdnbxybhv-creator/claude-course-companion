// Particles: the season in the air (petals, willow fluff, leaves, snow, fireflies) animated wholly on
// the GPU around the camera, and small bursts (water drops, petals, sparks) simulated on the CPU.
import * as THREE from 'three';
import type { Season } from '../../../ink/scene-types';
import { makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture } from './kit';
import { NO_REFLECT } from './pond';

type AirKind = 'petal' | 'fluff' | 'leaf' | 'snow' | 'firefly';

function spriteCanvas(kind: AirKind | 'dot'): HTMLCanvasElement {
  const S = 64;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  if (kind === 'petal') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -24);
    g.bezierCurveTo(18, -14, 14, 16, 0, 24);
    g.bezierCurveTo(-14, 16, -18, -14, 0, -24);
    g.fill();
  } else if (kind === 'leaf') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -28);
    g.quadraticCurveTo(20, -4, 0, 26);
    g.quadraticCurveTo(-20, -4, 0, -28);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 22); g.stroke();
  } else {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    const soft = kind === 'fluff' || kind === 'firefly';
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(soft ? 0.25 : 0.55, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill();
  }
  return c;
}

// Two sets share one draw: the season's own (petals, fluff, leaves, snow) and the night's fireflies,
// cross-faded on the sky's night at run time — so a night brought on by a festival or a preview gets
// its fireflies, and the leaves do not drift on in the dark. Each point knows its set (aKind): its
// motion and colours come from that set's uniforms (x: the season's, y: the fireflies').
const AIR_VS = /* glsl */`
uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform vec2 uFall; uniform vec2 uWind; uniform vec2 uSize; uniform float uPx; uniform vec2 uSpin;
attribute vec4 aSeed;
attribute float aKind;
varying float vAlpha; varying float vRot; varying float vTone; varying float vKind;
void main() {
  vec3 p = position;
  float t = uTime;
  float fall = mix(uFall.x, uFall.y, aKind), wind = mix(uWind.x, uWind.y, aKind);
  p.y -= t * fall * (0.6 + aSeed.x * 0.8);
  p.x += t * wind * (0.4 + aSeed.y) + sin(t * (0.5 + aSeed.z) + aSeed.w * 6.283) * 0.7;
  p.z += sin(t * (0.4 + aSeed.y * 0.6) + aSeed.x * 6.283) * 0.6;
  vec3 rel = p - uCenter;
  rel.xz = mod(rel.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
  rel.y = mod(rel.y + 2.0, uBox.y) - 2.0;
  // fireflies keep low, in the grass and under the eaves
  rel.y *= mix(1.0, 0.4, aKind);
  vec3 wp = uCenter + rel;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(rel.x) / uBox.x, abs(rel.z) / uBox.z));
  float top = 1.0 - smoothstep(uBox.y - 4.0, uBox.y - 2.0, rel.y);
  vAlpha = edge * top * (0.55 + 0.45 * aSeed.z);
  vRot = aSeed.w * 6.283 + t * mix(uSpin.x, uSpin.y, aKind) * (aSeed.x - 0.5) * 2.0;
  vTone = aSeed.y;
  vKind = aKind;
  gl_PointSize = mix(uSize.x, uSize.y, aKind) * (0.6 + aSeed.x * 0.7) * uPx / max(0.5, -mv.z);
}`;
// Premultiplied output, blended ONE / ONE_MINUS_SRC_ALPHA: the season's sprites blend as usual
// (alpha kept), the fireflies add their light (alpha 0).
const AIR_FS = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uFlyA; uniform vec3 uFlyB; uniform vec2 uOpacity; uniform float uTime;
varying float vAlpha; varying float vRot; varying float vTone; varying float vKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  vec3 col;
  if (vKind > 0.5) {
    // a firefly: a soft glow with a bright heart, blinking
    float r = length(c) * 2.0;
    float glow = (1.0 - smoothstep(0.0, 1.0, r)) * 0.55 + (1.0 - smoothstep(0.0, 0.3, r)) * 0.45;
    float blink = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.5 + vTone * 2.0) + vRot * 3.0), 3.0);
    a = glow * vAlpha * uOpacity.y * blink;
    col = mix(uFlyA, uFlyB, vTone);
  } else {
    float cs = cos(vRot), sn = sin(vRot);
    c = mat2(cs, -sn, sn, cs) * c;
    a = texture2D(uMap, c + 0.5).a * vAlpha * uOpacity.x;
    col = mix(uColorA, uColorB, vTone);
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, vKind > 0.5 ? 0.0 : a);
}`;

export interface Air {
  points: THREE.Points;
  update(t: number, center: THREE.Vector3, night: number): void;
}

/**
 * Seasonal particles, and fireflies for the night (none in winter: the snow goes on falling in the
 * moonlight). `night` is only the hour the world was built at; update() follows the sky's night.
 */
export function buildAir(bag: Bag, season: Season, night: boolean, reduced: boolean, px: number): Air | null {
  let kind: AirKind;
  let colorA = '#b83a4b', colorB = '#e8b4b8';
  let fall = 0.35, wind = 0.25, size = 0.16, spin = 1.2, opacity = 0.85, count = 150;
  if (season === 'spring') {
    kind = 'petal'; colorA = '#c8506a'; colorB = '#f0bcc4';
  } else if (season === 'summer') {
    kind = 'fluff'; colorA = '#ffffff'; colorB = '#f4eed8'; fall = 0.08; wind = 0.35; size = 0.12; spin = 0; count = 90; opacity = 0.75;
  } else if (season === 'autumn') {
    // gamboge, vermilion and russet leaves
    kind = 'leaf'; colorA = '#dc9a34'; colorB = '#b8452e'; fall = 0.55; wind = 0.4; size = 0.2; spin = 1.6; count = 90;
  } else {
    kind = 'snow'; colorA = '#ffffff'; colorB = '#f3f1ec'; fall = 0.6; wind = 0.15; size = 0.12; spin = 0; count = 260;
  }
  // warm nights: fireflies drifting low, amber like the lanterns
  let flies = season === 'winter' ? 0 : season === 'summer' ? 110 : 70;
  if (reduced) { count = Math.round(count * 0.35); flies = Math.round(flies * 0.35); }
  const rng = makeRng(606);
  const box = new THREE.Vector3(34, 13, 34);
  const total = count + flies;
  const pos = new Float32Array(total * 3);
  const seed = new Float32Array(total * 4);
  const kindA = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    pos[i * 3] = rng.range(-box.x / 2, box.x / 2);
    pos[i * 3 + 1] = rng.range(0, box.y);
    pos[i * 3 + 2] = rng.range(-box.z / 2, box.z / 2);
    seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = rng();
    kindA[i] = i < count ? 0 : 1;
  }
  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kindA, 1));
  const mat = bag.add(new THREE.ShaderMaterial({
    vertexShader: AIR_VS, fragmentShader: AIR_FS, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: box },
      uFall: { value: new THREE.Vector2(reduced ? fall * 0.5 : fall, -0.025) },
      uWind: { value: new THREE.Vector2(wind, 0.05) }, uSize: { value: new THREE.Vector2(size, 0.12) }, uPx: { value: px },
      uSpin: { value: new THREE.Vector2(reduced ? 0 : spin, 0) },
      uMap: { value: canvasTexture(bag, spriteCanvas(kind)) }, uColorA: { value: new THREE.Color(colorA) }, uColorB: { value: new THREE.Color(colorB) },
      uFlyA: { value: new THREE.Color('#ffcf6e') }, uFlyB: { value: new THREE.Color('#f4f0a0') },
      uOpacity: { value: new THREE.Vector2(opacity, 0) },
    },
  }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.layers.set(NO_REFLECT);
  points.renderOrder = 5;
  const op = mat.uniforms.uOpacity.value as THREE.Vector2;
  const setNight = (n: number) => {
    // snow falls on through the night, a little dimmer; petals, fluff and leaves settle for the dark
    const day = kind === 'snow' ? 1 - 0.3 * n : Math.max(0, 1 - n * 1.6);
    op.set(opacity * day, flies ? Math.max(0, n * 1.4 - 0.4) : 0);
    // nothing to draw: skip the draw
    points.visible = op.x > 0.005 || op.y > 0.005;
    const a = op.x > 0.005 ? 0 : count, b = op.y > 0.005 ? total : count;
    geo.setDrawRange(a, b - a);
  };
  setNight(night ? 1 : 0);
  return {
    points,
    update(t, center, nightK) {
      mat.uniforms.uTime.value = t;
      (mat.uniforms.uCenter.value as THREE.Vector3).copy(center);
      setNight(nightK);
    },
  };
}

// ------------------------------------------------------------------------------------------ bursts

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; r: number; g: number; b: number; drag: number; grav: number; flutter: number }

const BURST_VS = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uPx;
varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx / max(0.3, -mv.z);
  vAlpha = aAlpha; vColor = aColor;
}`;
const BURST_FS = /* glsl */`
uniform sampler2D uMap;
varying float vAlpha; varying vec3 vColor;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

export class Bursts {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private geo: THREE.BufferGeometry;
  private rng = makeRng(999);
  private static MAX = 220;

  constructor(bag: Bag, px: number) {
    const M = Bursts.MAX;
    this.pos = new Float32Array(M * 3);
    this.col = new Float32Array(M * 3);
    this.size = new Float32Array(M);
    this.alpha = new Float32Array(M);
    this.geo = bag.add(new THREE.BufferGeometry());
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = bag.add(new THREE.ShaderMaterial({
      vertexShader: BURST_VS, fragmentShader: BURST_FS, transparent: true, depthWrite: false,
      uniforms: { uPx: { value: px }, uMap: { value: canvasTexture(bag, spriteCanvas('dot')) } },
    }));
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.layers.set(NO_REFLECT);
    this.points.renderOrder = 6;
  }

  private add(p: Omit<P, 'age' | 'r' | 'g' | 'b'>, color: string): void {
    if (this.ps.length >= Bursts.MAX) this.ps.shift();
    const c = new THREE.Color(color);
    this.ps.push({ ...p, age: 0, r: c.r, g: c.g, b: c.b });
  }

  /** Water falling from a raised hand / the sky onto (x, z) from height y. */
  drops(x: number, y: number, z: number, n = 26): void {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      this.add({ x: x + r.gauss() * 0.35, y: y + r.range(0, 0.6), z: z + r.gauss() * 0.35, vx: r.gauss() * 0.2, vy: -r.range(0.5, 1.5), vz: r.gauss() * 0.2, life: r.range(0.7, 1.2), size: r.range(0.05, 0.09), drag: 0.2, grav: 7, flutter: 0 }, i % 3 ? '#6fa2a4' : '#a8d0cc');
    }
  }

  /** Petals / leaves bursting from a plant and drifting down. */
  petals(x: number, y: number, z: number, color: string, n = 22): void {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, sp = r.range(0.6, 1.8);
      this.add({ x: x + r.gauss() * 0.2, y: y + r.gauss() * 0.3, z: z + r.gauss() * 0.2, vx: Math.cos(a) * sp, vy: r.range(0.6, 2), vz: Math.sin(a) * sp, life: r.range(1.8, 3.2), size: r.range(0.07, 0.13), drag: 1.6, grav: 1.2, flutter: r.range(1, 3) }, i % 4 ? color : '#f4efe4');
    }
  }

  /** Tiny golden sparks rising (a festival treat, a happy moment). */
  sparks(x: number, y: number, z: number, color = '#e7c46a', n = 18): void {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      this.add({ x: x + r.gauss() * 0.25, y: y + r.gauss() * 0.15, z: z + r.gauss() * 0.25, vx: r.gauss() * 0.3, vy: r.range(0.6, 1.6), vz: r.gauss() * 0.3, life: r.range(0.8, 1.6), size: r.range(0.04, 0.08), drag: 1.2, grav: -0.2, flutter: 0 }, color);
    }
  }

  update(dt: number, t: number): void {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
      p.x += (p.vx + (p.flutter ? Math.sin(t * p.flutter * 2 + i) * 0.3 : 0)) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.age / p.life;
      this.pos[w * 3] = p.x; this.pos[w * 3 + 1] = p.y; this.pos[w * 3 + 2] = p.z;
      this.col[w * 3] = p.r; this.col[w * 3 + 1] = p.g; this.col[w * 3 + 2] = p.b;
      this.size[w] = p.size;
      this.alpha[w] = Math.min(1, k * 8) * (1 - k * k);
      ps[w] = p;
      w++;
    }
    ps.length = w;
    this.geo.setDrawRange(0, w);
    if (w) {
      for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    }
    this.points.visible = w > 0;
  }
}
