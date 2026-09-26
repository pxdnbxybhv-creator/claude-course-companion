// The skills' shared effects, each one draw call:
//  - ParticleField: petals, leaves, dust, sparkles, moon-dust, ink flecks and ground marks (paw
//    prints, hoof prints, ink trails, ripples) — instanced quads from one painted atlas, tinted per
//    particle, fluttering in 3D, facing the camera, or lying flat on the ground. Premultiplied
//    blending lets glows add light and ink sit on top in the same draw.
//  - GlyphField: brush characters in the air (or on the ground), from an atlas painted on demand
//    with a paper halo so they read against foliage by day and glow softly by night; they can be
//    "brushed in" from top to bottom.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { BRUSH_FONT, type Bag } from '../kit';
import { makeRng } from '../../../../core/rng';

type Three = WorldCtx['THREE'];

/** Atlas cells (4 × 4) of the particle sheet. */
export const CELL = {
  petal: 0, leaf: 1, soft: 2, blot: 3,
  paw: 4, ring: 5, blossom: 6, star: 7,
  streak: 8, hoof: 9, blade: 10, sprout: 11,
  stone: 12, cloud: 13, drop: 14, swirl: 15,
} as const;

/** How a particle is drawn: a fluttering flake, an additive glow, flat on the ground, a camera-facing puff, or a flat glow (moonlit ripples). */
export const MODE = { flake: 0, glow: 1, flat: 2, puff: 3, flatGlow: 4 } as const;

export interface Emit {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  /** Gravity (m/s², positive pulls down). */
  g?: number;
  /** Velocity damping per second. */
  drag?: number;
  /** Sideways sway (m/s) for petals and leaves. */
  flutter?: number;
  life: number;
  size: number;
  /** Size multiplier reached at the end of life. */
  grow?: number;
  color: number;
  alpha?: number;
  mode: number;
  cell: number;
  rot?: number;
  spin?: number;
  /** Settle here (y) instead of falling through the ground. */
  floor?: number;
  /** Seconds to fade in. */
  fadeIn?: number;
  /** Fraction of the life spent fading out (default 0.35). */
  fadeOut?: number;
  /** Circle a centre (the walker when `follow`): radius, angular speed, start angle, rise (m/s), radius growth (m/s). */
  orbit?: { r: number; w: number; a: number; rise?: number; dr?: number; follow?: boolean; cx?: number; cz?: number };
}

const TAU = Math.PI * 2;

// ───────────────────────────── the particle atlas ─────────────────────────────

function paintAtlas(): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const g = c.getContext('2d')!;
  const rng = makeRng(0x5ec1a5);
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * S, Math.floor(i / 4) * S);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    draw();
    g.restore();
  };
  const blob = (x: number, y: number, r: number, a = 1) => { g.globalAlpha = a; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1; };
  // petal: a rounded fan with a little notch, pale at the base
  cell(CELL.petal, () => {
    g.beginPath();
    g.moveTo(64, 112);
    g.bezierCurveTo(14, 80, 22, 22, 56, 18);
    g.quadraticCurveTo(64, 30, 72, 18);
    g.bezierCurveTo(106, 22, 114, 80, 64, 112);
    g.fill();
  });
  // leaf: pointed, with a midrib left bare
  cell(CELL.leaf, () => {
    g.beginPath();
    g.moveTo(64, 6);
    g.bezierCurveTo(104, 40, 96, 92, 64, 122);
    g.bezierCurveTo(32, 92, 24, 40, 64, 6);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 14); g.lineTo(64, 116); g.stroke();
    g.globalCompositeOperation = 'source-over';
  });
  // soft round glow / dust
  cell(CELL.soft, () => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  });
  // ink blot: overlapping dabs and a few splashes
  cell(CELL.blot, () => {
    for (let i = 0; i < 9; i++) blob(64 + rng.range(-16, 16), 64 + rng.range(-16, 16), rng.range(14, 30), 0.8);
    for (let i = 0; i < 10; i++) { const a = rng() * TAU, d = rng.range(36, 58); blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rng.range(2, 6)); }
  });
  // paw print: a pad and four toes
  cell(CELL.paw, () => {
    g.beginPath(); g.ellipse(64, 80, 24, 20, 0, 0, TAU); g.fill();
    for (const [x, y, r] of [[34, 50, 10], [52, 34, 11], [76, 34, 11], [94, 50, 10]] as const) { g.beginPath(); g.ellipse(x, y, r, r * 1.2, 0, 0, TAU); g.fill(); }
  });
  // a brushy ring (ripple, sound wave)
  cell(CELL.ring, () => {
    for (let k = 0; k < 3; k++) {
      g.globalAlpha = 0.55;
      g.lineWidth = 5 + k * 2;
      g.beginPath();
      g.arc(64, 64, 52 - k * 2, rng() * TAU, rng() * TAU + TAU * 0.9);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
  // blossom: five round petals round a bare heart
  cell(CELL.blossom, () => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; blob(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30, 26); }
    g.globalCompositeOperation = 'destination-out';
    blob(64, 64, 9, 0.8);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; blob(64 + Math.cos(a) * 15, 64 + Math.sin(a) * 15, 3); }
  });
  // four-point sparkle
  cell(CELL.star, () => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 20);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff';
    for (const r of [0, Math.PI / 2]) {
      g.save(); g.translate(64, 64); g.rotate(r);
      g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(0, 5, 60, 0); g.quadraticCurveTo(0, -5, -60, 0); g.fill();
      g.restore();
    }
  });
  // dry-brush streak (afterimages, wind)
  cell(CELL.streak, () => {
    for (let i = 0; i < 26; i++) {
      const x = 20 + rng() * 88, w = rng.range(2, 7), top = rng.range(4, 30), bot = rng.range(96, 124);
      const a = 0.35 + rng() * 0.5 * (1 - Math.abs(x - 64) / 50);
      g.globalAlpha = Math.max(0.08, a);
      g.fillRect(x, top, w, bot - top);
    }
    g.globalAlpha = 1;
  });
  // hoof print: a horseshoe
  cell(CELL.hoof, () => {
    g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 60, 34, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
    blob(64, 70, 14, 0.5);
  });
  // blade: a slim bamboo / willow leaf
  cell(CELL.blade, () => {
    g.beginPath();
    g.moveTo(64, 4);
    g.quadraticCurveTo(80, 60, 64, 124);
    g.quadraticCurveTo(50, 60, 64, 4);
    g.fill();
  });
  // sprout: two leaves on a stem
  cell(CELL.sprout, () => {
    g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 120); g.quadraticCurveTo(60, 90, 64, 64); g.stroke();
    g.beginPath(); g.moveTo(64, 70); g.bezierCurveTo(40, 40, 16, 50, 14, 58); g.bezierCurveTo(30, 76, 52, 78, 64, 70); g.fill();
    g.beginPath(); g.moveTo(64, 64); g.bezierCurveTo(84, 30, 110, 34, 114, 42); g.bezierCurveTo(100, 62, 78, 70, 64, 64); g.fill();
  });
  // go stone
  cell(CELL.stone, () => {
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 56);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fill();
  });
  // 祥云: an auspicious cloud curl
  cell(CELL.cloud, () => {
    g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * 1.4, r = 8 + i * 0.55; const x = 50 + Math.cos(a) * r, y = 62 + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.beginPath(); g.moveTo(84, 62); g.bezierCurveTo(100, 40, 124, 56, 112, 76); g.bezierCurveTo(104, 88, 90, 80, 96, 70); g.stroke();
    g.beginPath(); g.moveTo(10, 96); g.quadraticCurveTo(64, 110, 118, 96); g.stroke();
  });
  // a drop
  cell(CELL.drop, () => {
    g.beginPath(); g.moveTo(64, 10); g.bezierCurveTo(70, 40, 98, 64, 94, 86); g.bezierCurveTo(90, 112, 38, 112, 34, 86); g.bezierCurveTo(30, 64, 58, 40, 64, 10); g.fill();
  });
  // swirl: a crescent brush stroke of wind
  cell(CELL.swirl, () => {
    g.beginPath();
    g.arc(64, 64, 54, Math.PI * 0.15, Math.PI * 1.25);
    g.arc(58, 60, 40, Math.PI * 1.25, Math.PI * 0.15, true);
    g.closePath();
    g.fill();
  });
  return c;
}

const VERT = /* glsl */`
attribute vec4 aColor;
attribute vec3 aInfo;
varying vec2 vUv;
varying vec4 vCol;
varying float vGlow;
void main() {
  float cell = aInfo.x;
  float mode = aInfo.y;
  vUv = (vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0)) + position.xy + 0.5) * 0.25;
  vec4 mv;
  if (abs(mode - 1.0) < 0.5 || abs(mode - 3.0) < 0.5) {
    mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
    float s = length(instanceMatrix[0].xyz);
    float c = cos(aInfo.z), si = sin(aInfo.z);
    mv.xy += vec2(position.x * c - position.y * si, position.x * si + position.y * c) * s;
  } else {
    mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
  gl_Position = projectionMatrix * mv;
  vCol = aColor;
  vGlow = (abs(mode - 1.0) < 0.5 || abs(mode - 4.0) < 0.5) ? 1.0 : 0.0;
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uLight;
varying vec2 vUv;
varying vec4 vCol;
varying float vGlow;
void main() {
  float a = texture2D(uMap, vUv).a * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * mix(uLight, 1.0, vGlow), 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vGlow));
}`;

function premultiplied(THREE: Three, m: T.ShaderMaterial): T.ShaderMaterial {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}

/** A pool of instanced particles (see Emit). One draw call. */
export class ParticleField {
  readonly mesh: T.InstancedMesh;
  private n = 0;
  private readonly cap: number;
  // structure of arrays (no per-particle objects)
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private age: Float32Array; private life: Float32Array; private size: Float32Array; private grow: Float32Array;
  private g: Float32Array; private drag: Float32Array; private flut: Float32Array; private floor: Float32Array;
  private rot: Float32Array; private spin: Float32Array; private fin: Float32Array; private fout: Float32Array;
  private ax: Float32Array; private ay: Float32Array; private az: Float32Array;
  private cr: Float32Array; private cg: Float32Array; private cb: Float32Array; private ca: Float32Array;
  private mode: Uint8Array; private cell: Uint8Array;
  private orb: Uint8Array; private ocx: Float32Array; private ocz: Float32Array; private orad: Float32Array; private ow: Float32Array; private oa: Float32Array; private orise: Float32Array; private odr: Float32Array;
  private colA: T.InstancedBufferAttribute;
  private infoA: T.InstancedBufferAttribute;
  private uLight: { value: number };
  private tmp: T.Color;
  private all: Float32Array[];
  private rng = makeRng(0xf1e1d);
  /** The centre `orbit.follow` particles circle (the walker). */
  follow: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor(bag: Bag, map: T.Texture, cap: number, o: { ground?: boolean; name?: string } = {}) {
    const { THREE } = bag.ctx;
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f(); this.size = f(); this.grow = f(); this.g = f(); this.drag = f(); this.flut = f(); this.floor = f();
    this.rot = f(); this.spin = f(); this.fin = f(); this.fout = f(); this.ax = f(); this.ay = f(); this.az = f();
    this.cr = f(); this.cg = f(); this.cb = f(); this.ca = f();
    this.mode = new Uint8Array(cap); this.cell = new Uint8Array(cap); this.orb = new Uint8Array(cap);
    this.ocx = f(); this.ocz = f(); this.orad = f(); this.ow = f(); this.oa = f(); this.orise = f(); this.odr = f();
    this.tmp = new THREE.Color();
    this.all = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.size, this.grow, this.g, this.drag, this.flut, this.floor,
      this.rot, this.spin, this.fin, this.fout, this.ax, this.ay, this.az, this.cr, this.cg, this.cb, this.ca, this.ocx, this.ocz, this.orad, this.ow, this.oa, this.orise, this.odr];
    const geo = new THREE.PlaneGeometry(1, 1);
    this.colA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.infoA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.colA.setUsage(THREE.DynamicDrawUsage);
    this.infoA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colA);
    geo.setAttribute('aInfo', this.infoA);
    this.uLight = { value: 1 };
    const mat = premultiplied(THREE, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uLight: this.uLight },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    }));
    if (o.ground) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4; }
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = o.name ?? 'skill-particles';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = o.ground ? 1 : 3;
    bag.add(this.mesh);
  }

  get alive(): number {
    return this.n;
  }

  /** Brightness of non-glowing particles (dimmer by night). */
  setLight(k: number): void {
    this.uLight.value = k;
  }

  emit(e: Emit): void {
    let i = this.n;
    if (i >= this.cap) {
      // full: replace the oldest-looking one (the one nearest its end)
      let best = 0, bk = -1;
      for (let j = 0; j < this.cap; j += 7) { const k = this.age[j] / this.life[j]; if (k > bk) { bk = k; best = j; } }
      i = best;
    } else this.n++;
    this.px[i] = e.x; this.py[i] = e.y; this.pz[i] = e.z;
    this.vx[i] = e.vx ?? 0; this.vy[i] = e.vy ?? 0; this.vz[i] = e.vz ?? 0;
    this.age[i] = 0; this.life[i] = Math.max(0.05, e.life);
    this.size[i] = e.size; this.grow[i] = e.grow ?? 1;
    this.g[i] = e.g ?? 0; this.drag[i] = e.drag ?? 0; this.flut[i] = e.flutter ?? 0;
    this.floor[i] = e.floor ?? -1e9;
    this.rot[i] = e.rot ?? this.rng() * TAU; this.spin[i] = e.spin ?? 0;
    this.fin[i] = e.fadeIn ?? 0.08; this.fout[i] = e.fadeOut ?? 0.35;
    // a random tumbling axis for flakes
    const u = this.rng() * 2 - 1, th = this.rng() * TAU, s = Math.sqrt(1 - u * u);
    this.ax[i] = s * Math.cos(th); this.ay[i] = u; this.az[i] = s * Math.sin(th);
    this.tmp.setHex(e.color);
    this.cr[i] = this.tmp.r; this.cg[i] = this.tmp.g; this.cb[i] = this.tmp.b; this.ca[i] = e.alpha ?? 1;
    this.mode[i] = e.mode; this.cell[i] = e.cell;
    const o = e.orbit;
    if (o) {
      this.orb[i] = o.follow ? 2 : 1;
      this.ocx[i] = o.cx ?? e.x; this.ocz[i] = o.cz ?? e.z;
      this.orad[i] = o.r; this.ow[i] = o.w; this.oa[i] = o.a; this.orise[i] = o.rise ?? 0; this.odr[i] = o.dr ?? 0;
    } else this.orb[i] = 0;
  }

  /** Drop everything at once (a skill cancelled). */
  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    this.mesh.visible = this.n > 0;
    if (!this.n) { if (this.mesh.count) this.mesh.count = 0; return; }
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.colA.array as Float32Array, info = this.infoA.array as Float32Array;
    const fx = this.follow;
    for (let i = 0; i < this.n; i++) {
      let age = this.age[i] + dt;
      if (age >= this.life[i]) {
        this.kill(i);
        i--;
        continue;
      }
      this.age[i] = age;
      const life = this.life[i];
      const k = age / life;
      let x = this.px[i], y = this.py[i], z = this.pz[i];
      if (this.orb[i]) {
        if (this.orb[i] === 2) { this.ocx[i] = fx.x; this.ocz[i] = fx.z; }
        this.oa[i] += this.ow[i] * dt;
        this.orad[i] = Math.max(0.05, this.orad[i] + this.odr[i] * dt);
        x = this.ocx[i] + Math.cos(this.oa[i]) * this.orad[i];
        z = this.ocz[i] + Math.sin(this.oa[i]) * this.orad[i];
        y += this.orise[i] * dt;
      } else if (y > this.floor[i] + 0.001 || this.vy[i] > 0) {
        this.vy[i] -= this.g[i] * dt;
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vx[i] *= dr; this.vy[i] *= dr; this.vz[i] *= dr;
        const fl = this.flut[i];
        x += (this.vx[i] + (fl ? Math.sin(age * 2.7 + i) * fl : 0)) * dt;
        y += this.vy[i] * dt;
        z += (this.vz[i] + (fl ? Math.cos(age * 2.1 + i * 1.3) * fl : 0)) * dt;
        if (y < this.floor[i]) { y = this.floor[i]; this.vx[i] = this.vy[i] = this.vz[i] = 0; this.spin[i] = 0; }
      }
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      const fin = this.fin[i] > 0 ? Math.min(1, age / this.fin[i]) : 1;
      const fo = this.fout[i];
      const fout = fo > 0 ? Math.min(1, (1 - k) / fo) : 1;
      const s = this.size[i] * (1 + (this.grow[i] - 1) * k);
      const mode = this.mode[i];
      const r = this.rot[i] + this.spin[i] * age;
      const o = i * 16;
      if (mode === 1 || mode === 3) {
        arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      } else {
        let qx: number, qy: number, qz: number, qw: number;
        if (mode === 2 || mode === 4) {
          // flat on the ground, turned by r about +y
          const sy = Math.sin(r / 2), cy = Math.cos(r / 2), sx = -Math.SQRT1_2, cx = Math.SQRT1_2;
          qx = cy * sx; qy = sy * cx; qz = -sy * sx; qw = cy * cx;
        } else {
          const h = Math.sin(r / 2);
          qx = this.ax[i] * h; qy = this.ay[i] * h; qz = this.az[i] * h; qw = Math.cos(r / 2);
        }
        const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
        const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
        const wx = qw * x2, wy = qw * y2, wz = qw * z2;
        arr[o] = (1 - (yy + zz)) * s; arr[o + 1] = (xy + wz) * s; arr[o + 2] = (xz - wy) * s; arr[o + 3] = 0;
        arr[o + 4] = (xy - wz) * s; arr[o + 5] = (1 - (xx + zz)) * s; arr[o + 6] = (yz + wx) * s; arr[o + 7] = 0;
        arr[o + 8] = (xz + wy) * s; arr[o + 9] = (yz - wx) * s; arr[o + 10] = (1 - (xx + yy)) * s; arr[o + 11] = 0;
      }
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      const c4 = i * 4;
      col[c4] = this.cr[i]; col[c4 + 1] = this.cg[i]; col[c4 + 2] = this.cb[i]; col[c4 + 3] = this.ca[i] * fin * fout;
      const c3 = i * 3;
      info[c3] = this.cell[i]; info[c3 + 1] = mode; info[c3 + 2] = r;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colA.needsUpdate = true;
    this.infoA.needsUpdate = true;
  }

  /** Move the last particle into slot i. */
  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    const all = this.all;
    for (let k = 0; k < all.length; k++) all[k][i] = all[k][j];
    this.mode[i] = this.mode[j]; this.cell[i] = this.cell[j]; this.orb[i] = this.orb[j];
  }
}

// ───────────────────────────── glyphs ─────────────────────────────

const GLYPH_VERT = /* glsl */`
attribute vec4 aColor;
attribute vec4 aInfo; // cell, reveal, rotation, flat
varying vec2 vUv;
varying vec2 vLocal;
varying vec4 vCol;
varying float vReveal;
void main() {
  float cell = aInfo.x;
  vLocal = position.xy + 0.5;
  vUv = (vec2(mod(cell, 8.0), 7.0 - floor(cell / 8.0)) + vLocal) * 0.125;
  vec4 mv;
  if (aInfo.w < 0.5) {
    mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
    float s = length(instanceMatrix[0].xyz);
    float c = cos(aInfo.z), si = sin(aInfo.z);
    mv.xy += vec2(position.x * c - position.y * si, position.x * si + position.y * c) * s;
  } else {
    mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
  gl_Position = projectionMatrix * mv;
  vCol = aColor;
  vReveal = aInfo.y;
}`;

const GLYPH_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uNight;
uniform vec3 uPaper;
uniform vec3 uMoonInk;
uniform vec3 uAmber;
varying vec2 vUv;
varying vec2 vLocal;
varying vec4 vCol;
varying float vReveal;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float d = 1.0 - vLocal.y;
  float m = smoothstep(d, d + 0.18, vReveal * 1.18);
  float g = t.r * t.a * m;
  float h = t.g * t.a * m;
  vec3 ink = mix(vCol.rgb, uMoonInk, uNight * 0.85);
  vec3 halo = mix(uPaper, uAmber, uNight);
  float ha = h * mix(0.5, 0.55, uNight);
  float a = g + ha * (1.0 - g);
  if (a * vCol.a < 0.004) discard;
  vec3 c = (ink * g + halo * ha * (1.0 - g)) / max(a, 1e-4);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  float outA = (g + ha * (1.0 - g) * mix(1.0, 0.3, uNight)) * vCol.a;
  gl_FragColor = vec4(gl_FragColor.rgb * a * vCol.a, outA);
}`;

/** Brush characters as instanced quads; the atlas (8 × 8 cells) is painted as characters are needed. */
export class GlyphField {
  readonly mesh: T.InstancedMesh;
  private canvas: HTMLCanvasElement;
  private g2: CanvasRenderingContext2D;
  private tex: T.CanvasTexture;
  private cells = new Map<string, number>();
  private cellChar: string[] = [];
  private refs = new Int16Array(64);
  private lru: number[] = [];
  private dirty = false;
  private used: boolean[];
  private colA: T.InstancedBufferAttribute;
  private infoA: T.InstancedBufferAttribute;
  private uNight: { value: number };
  private cellOf: Int16Array;
  private m: T.Matrix4;
  private q: T.Quaternion;
  private e: T.Euler;
  private v: T.Vector3;
  private s: T.Vector3;
  private tmp: T.Color;
  private top = 0;

  constructor(bag: Bag, readonly cap = 40) {
    const { THREE } = bag.ctx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 1024;
    this.g2 = this.canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    this.tex = tex;
    this.used = Array.from({ length: cap }, () => false);
    this.cellOf = new Int16Array(cap).fill(-1);
    for (let i = 0; i < 64; i++) { this.cellChar.push(''); this.lru.push(i); }
    const geo = new THREE.PlaneGeometry(1, 1);
    this.colA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.infoA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.colA.setUsage(THREE.DynamicDrawUsage);
    this.infoA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colA);
    geo.setAttribute('aInfo', this.infoA);
    this.uNight = { value: 0 };
    const mat = premultiplied(THREE, new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex }, uNight: this.uNight,
        uPaper: { value: new THREE.Color('#fbf3e2') }, uMoonInk: { value: new THREE.Color('#fff4dc') }, uAmber: { value: new THREE.Color('#ffb86b') },
      },
      vertexShader: GLYPH_VERT,
      fragmentShader: GLYPH_FRAG,
      side: THREE.DoubleSide,
    }));
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'skill-glyphs';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.tmp = new THREE.Color();
    bag.add(this.mesh);
    bag.own(tex);
  }

  setNight(k: number): void {
    this.uNight.value = k;
  }

  /** A slot showing `ch` (ink colour `color`), or -1 when all are in use. */
  add(ch: string, color = 0x1d1916): number {
    let h = -1;
    for (let i = 0; i < this.cap; i++) if (!this.used[i]) { h = i; break; }
    if (h < 0) return -1;
    const c = this.cell(ch);
    if (c < 0) return -1;
    this.used[h] = true;
    this.cellOf[h] = c;
    this.refs[c]++;
    this.tmp.setHex(color);
    const col = this.colA.array as Float32Array;
    col[h * 4] = this.tmp.r; col[h * 4 + 1] = this.tmp.g; col[h * 4 + 2] = this.tmp.b; col[h * 4 + 3] = 0;
    const info = this.infoA.array as Float32Array;
    info[h * 4] = c; info[h * 4 + 1] = 0; info[h * 4 + 2] = 0; info[h * 4 + 3] = 0;
    this.top = Math.max(this.top, h + 1);
    this.set(h, 0, -999, 0, 0, 0, 0);
    return h;
  }

  /** Place a slot: billboard at (x, y, z), `size` metres, opacity, how much of it is brushed in (0..1), tilt. */
  set(h: number, x: number, y: number, z: number, size: number, alpha: number, reveal: number, rot = 0): void {
    if (h < 0 || !this.used[h]) return;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const o = h * 16;
    arr.fill(0, o, o + 16);
    arr[o] = arr[o + 5] = arr[o + 10] = size;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
    (this.colA.array as Float32Array)[h * 4 + 3] = alpha;
    const info = this.infoA.array as Float32Array;
    info[h * 4 + 1] = reveal; info[h * 4 + 2] = rot; info[h * 4 + 3] = 0;
  }

  /** Place a slot lying on the ground (or upright on a wall when `upright`), turned by `yaw`. */
  setFlat(h: number, x: number, y: number, z: number, size: number, alpha: number, reveal: number, yaw: number, upright = false): void {
    if (h < 0 || !this.used[h]) return;
    this.e.set(upright ? 0 : -Math.PI / 2, yaw, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(size, size, size));
    this.m.toArray(this.mesh.instanceMatrix.array as Float32Array, h * 16);
    (this.colA.array as Float32Array)[h * 4 + 3] = alpha;
    const info = this.infoA.array as Float32Array;
    info[h * 4 + 1] = reveal; info[h * 4 + 3] = 1;
  }

  remove(h: number): void {
    if (h < 0 || !this.used[h]) return;
    this.used[h] = false;
    const c = this.cellOf[h];
    if (c >= 0) this.refs[c] = Math.max(0, this.refs[c] - 1);
    this.cellOf[h] = -1;
    (this.colA.array as Float32Array)[h * 4 + 3] = 0;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    arr.fill(0, h * 16, h * 16 + 16);
    while (this.top > 0 && !this.used[this.top - 1]) this.top--;
  }

  /** Repaint every cached character (the brush face has arrived). */
  repaint(): void {
    for (let c = 0; c < 64; c++) if (this.cellChar[c]) this.paint(c, this.cellChar[c]);
    this.dirty = true;
  }

  /** Upload what changed; call once a frame. */
  update(): void {
    if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; }
    this.mesh.count = this.top;
    this.mesh.visible = this.top > 0;
    if (!this.top) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colA.needsUpdate = true;
    this.infoA.needsUpdate = true;
  }

  private cell(ch: string): number {
    const hit = this.cells.get(ch);
    if (hit !== undefined) {
      const k = this.lru.indexOf(hit);
      if (k >= 0) { this.lru.splice(k, 1); this.lru.push(hit); }
      return hit;
    }
    // the least recently used free cell
    let c = -1;
    for (let k = 0; k < this.lru.length; k++) if (this.refs[this.lru[k]] === 0) { c = this.lru[k]; this.lru.splice(k, 1); this.lru.push(c); break; }
    if (c < 0) return -1;
    if (this.cellChar[c]) this.cells.delete(this.cellChar[c]);
    this.cellChar[c] = ch;
    this.cells.set(ch, c);
    this.paint(c, ch);
    this.dirty = true;
    return c;
  }

  private paint(c: number, ch: string): void {
    const g = this.g2, S = 128;
    const x0 = (c % 8) * S, y0 = Math.floor(c / 8) * S;
    g.save();
    g.clearRect(x0, y0, S, S);
    g.beginPath(); g.rect(x0, y0, S, S); g.clip();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `98px ${BRUSH_FONT}`;
    // the paper halo (green channel), then the ink (red channel) on top
    g.globalCompositeOperation = 'source-over';
    g.shadowColor = 'rgb(0,255,0)';
    g.shadowBlur = 14;
    g.fillStyle = 'rgb(0,255,0)';
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgb(0,255,0)';
    g.strokeText(ch, x0 + S / 2, y0 + S / 2 + 4);
    g.fillText(ch, x0 + S / 2, y0 + S / 2 + 4);
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgb(255,0,0)';
    g.fillText(ch, x0 + S / 2, y0 + S / 2 + 4);
    g.restore();
  }
}

// ───────────────────────────── the bundle ─────────────────────────────

/** Every shared effect for the skills: particles in the air, marks on the ground, glyphs. */
export class Fx {
  readonly air: ParticleField;
  readonly ground: ParticleField;
  readonly glyphs: GlyphField;
  private night = 0;

  constructor(bag: Bag) {
    const { THREE } = bag.ctx;
    const atlas = new THREE.CanvasTexture(paintAtlas());
    atlas.colorSpace = THREE.NoColorSpace;
    atlas.anisotropy = 4;
    bag.own(atlas);
    this.air = new ParticleField(bag, atlas, 420, { name: 'skill-air' });
    this.ground = new ParticleField(bag, atlas, 640, { ground: true, name: 'skill-ground' });
    this.glyphs = new GlyphField(bag, 40);
  }

  get nightK(): number {
    return this.night;
  }

  update(dt: number, night: number, follow: { x: number; y: number; z: number }): void {
    this.night = night;
    const light = 1 - night * 0.5;
    this.air.setLight(light);
    this.ground.setLight(light);
    this.glyphs.setNight(night);
    this.air.follow = follow;
    this.ground.follow = follow;
    this.air.update(dt);
    this.ground.update(dt);
    this.glyphs.update();
  }

  clear(): void {
    this.air.clear();
    this.ground.clear();
  }
}
