// Little puffs of dust at the walker's feet: a running stride, a take-off, a landing (a soft ring
// that spreads over the ground). Warm ochre-grey, like dry earth brushed in a pale wash. One draw
// call, only while any puff is alive; nothing allocated per frame.
import * as THREE from 'three';
import { Bag, canvas, canvasTexture } from './kit';
import { NO_REFLECT } from './pond';
import { makeRng } from '../../../core/rng';

const VS = /* glsl */`
attribute float aSize; attribute float aAlpha;
uniform float uPx;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx / max(0.3, -mv.z);
  vAlpha = aAlpha;
}`;
const FS = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

/** A soft, slightly ragged blob: dust in a dry-brush wash. */
function puffCanvas(): HTMLCanvasElement {
  const S = 64;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const r = makeRng(4417);
  for (let i = 0; i < 7; i++) {
    const x = S / 2 + r.gauss() * 5, y = S / 2 + r.gauss() * 4, rad = r.range(12, 22);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.38)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  return c;
}

interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; a: number }

export class Dust {
  readonly points: THREE.Points;
  private ps: Puff[] = [];
  private pool: Puff[] = [];
  private pos: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private rng = makeRng(2718);
  private static MAX = 64;

  constructor(bag: Bag, private reduced: boolean) {
    const M = Dust.MAX;
    this.pos = new Float32Array(M * 3);
    this.size = new Float32Array(M);
    this.alpha = new Float32Array(M);
    this.geo = bag.add(new THREE.BufferGeometry());
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = bag.add(new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      uniforms: { uPx: { value: 600 }, uMap: { value: canvasTexture(bag, puffCanvas()) }, uColor: { value: new THREE.Color('#b8a381') } },
    }));
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.layers.set(NO_REFLECT);
    this.points.renderOrder = 5;
    this.points.visible = false;
    this.points.name = 'dust';
  }

  /** Pixels per metre at one metre away (as the world's other point sprites). */
  setPx(px: number): void {
    this.mat.uniforms.uPx.value = px;
  }

  /** The dust's colour follows the light (paler by day, dim and warm at night). */
  setTint(c: THREE.Color, night: number): void {
    (this.mat.uniforms.uColor.value as THREE.Color).setRGB(0.72, 0.64, 0.5).multiply(c).multiplyScalar(1 - night * 0.45);
  }

  private add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, a: number): void {
    if (this.ps.length >= Dust.MAX) return;
    const p = this.pool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 0, s1: 0, a: 0 };
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.age = 0; p.life = life; p.s0 = s0; p.s1 = s1; p.a = a;
    this.ps.push(p);
  }

  /** A footfall while running: a small puff kicked back from the heel. */
  stride(x: number, y: number, z: number, heading: number): void {
    const r = this.rng;
    const bx = -Math.sin(heading), bz = -Math.cos(heading);
    for (let i = 0; i < 2; i++) {
      this.add(x + bx * 0.15 + r.gauss() * 0.08, y + 0.06, z + bz * 0.15 + r.gauss() * 0.08,
        bx * r.range(0.3, 0.7) + r.gauss() * 0.15, r.range(0.25, 0.5), bz * r.range(0.3, 0.7) + r.gauss() * 0.15,
        r.range(0.45, 0.7), 0.16, r.range(0.42, 0.6), 0.55);
    }
  }

  /** Leaving the ground: a small kick of dust. */
  takeoff(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r.range(0, 1);
      this.add(x + Math.cos(a) * 0.12, y + 0.04, z + Math.sin(a) * 0.12, Math.cos(a) * 0.6, r.range(0.1, 0.3), Math.sin(a) * 0.6, r.range(0.35, 0.5), 0.14, 0.4, 0.45);
    }
  }

  /** Touching down: a ring of dust spreading over the ground, stronger for a harder landing. */
  land(x: number, y: number, z: number, impact: number): void {
    const r = this.rng;
    const k = Math.min(1, impact / 7);
    const n = this.reduced ? 4 : 6 + Math.round(k * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
      const sp = r.range(0.9, 1.5) * (0.6 + k);
      this.add(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2, Math.cos(a) * sp, r.range(0.05, 0.25), Math.sin(a) * sp, r.range(0.5, 0.8), 0.18, 0.5 + k * 0.35, 0.5 + k * 0.25);
    }
  }

  update(dt: number): void {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { this.pool.push(p); continue; }
      const d = Math.exp(-3.2 * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - 0.3 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.age / p.life;
      this.pos[w * 3] = p.x; this.pos[w * 3 + 1] = p.y; this.pos[w * 3 + 2] = p.z;
      this.size[w] = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      this.alpha[w] = p.a * Math.min(1, k * 10) * (1 - k) * (1 - k);
      ps[w++] = p;
    }
    ps.length = w;
    this.geo.setDrawRange(0, w);
    if (w) {
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    }
    this.points.visible = w > 0;
  }
}
