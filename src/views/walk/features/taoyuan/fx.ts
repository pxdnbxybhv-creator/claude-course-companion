// 桃源 · the valley's effects (bible §1.4, FX1–FX17), as one library the story (C) and the case (D)
// call. Everything is drawn into the valley's own group, as sprites and points (a glow is always a
// sprite, so 低 — with no bloom — looks the same), counts scaled by the picture quality, and every
// camera move and flourish respects reduced motion. The screen effects (the flash, the ink that turns
// to colour, the 「证」 stamp, the ink ghosts) are DOM layers (taoyuan.css). See API.md.
import './taoyuan.css';
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { BRUSH_FONT, canvasTexture, loadBrush, reducedMotion } from '../kit';
import { plop } from '../sfx';
import { makeRng } from '../../../../core/rng';
import type { Valley } from './valley';
import {
  ANCHORS, CAVE, CHANNEL, FLOOR_R, G, L, LANE_LANTERNS, STREAM, STREAM_LEN, Y_T, cleftHalf, floorAt, polyAt, polyLen, standAt, streamAt, type XYZ,
} from './places';
import { engine } from './engine';

type Three = WorldCtx['THREE'];
const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };

// ───────────────────────────── point clouds (CPU-driven): glows and petals

const CLOUD_VS = /* glsl */`
attribute vec3 color; attribute float size; attribute float alpha; attribute float spin;
uniform float uPx; uniform vec2 uFog;
varying vec3 vC; varying float vA; varying float vFog; varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = min(size * uPx / max(0.3, d), 90.0);
  vC = color;
  vA = alpha * smoothstep(0.25, 1.1, d);
  vFog = smoothstep(uFog.x, uFog.y, d);
  vRot = spin;
}`;
const CLOUD_FS_GLOW = /* glsl */`
uniform sampler2D uMap;
varying vec3 vC; varying float vA; varying float vFog; varying float vRot;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vA * (1.0 - vFog);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, 1.0);
}`;
const CLOUD_FS_PETAL = /* glsl */`
uniform sampler2D uMap; uniform vec3 uFogColor; uniform vec3 uTint;
varying vec3 vC; varying float vA; varying float vFog; varying float vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  c = mat2(cs, -sn, sn, cs) * c;
  float a = texture2D(uMap, c + 0.5).a * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(vC * uTint, uFogColor, vFog), a);
  #include <colorspace_fragment>
}`;

/** A set of points the CPU moves: glows (additive) or petals (painted). */
export class Cloud {
  readonly points: T.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly spin: Float32Array;
  readonly geo: T.BufferGeometry;
  readonly mat: T.ShaderMaterial;
  constructor(readonly fx: ValleyFx, readonly n: number, kind: 'glow' | 'petal') {
    const TH = fx.THREE;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3).fill(1);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.spin = new Float32Array(n);
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new TH.BufferAttribute(this.col, 3));
    g.setAttribute('size', new TH.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new TH.BufferAttribute(this.alpha, 1));
    g.setAttribute('spin', new TH.BufferAttribute(this.spin, 1));
    this.geo = g;
    this.mat = new TH.ShaderMaterial({
      vertexShader: CLOUD_VS,
      fragmentShader: kind === 'glow' ? CLOUD_FS_GLOW : CLOUD_FS_PETAL,
      uniforms: {
        uPx: fx.px, uFog: fx.fogU, uFogColor: fx.fogColorU, uTint: fx.tintU,
        uMap: { value: kind === 'glow' ? fx.glowTex : fx.petalTex },
      },
      transparent: true, depthWrite: false,
      blending: kind === 'glow' ? TH.CustomBlending : TH.NormalBlending,
      ...(kind === 'glow' ? { blendSrc: TH.OneFactor, blendDst: TH.OneFactor, blendEquation: TH.AddEquation } : {}),
    });
    this.points = new TH.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = kind === 'glow' ? 6 : 4;
    this.points.userData.pocket = true;
    fx.group.add(this.points);
  }
  set(i: number, x: number, y: number, z: number, size: number, alpha: number, color?: T.Color, spin = 0): void {
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.size[i] = size; this.alpha[i] = alpha; this.spin[i] = spin;
    if (color) { this.col[k] = color.r; this.col[k + 1] = color.g; this.col[k + 2] = color.b; }
  }
  flush(): void {
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true; a.color.needsUpdate = true; a.spin.needsUpdate = true;
  }
  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ───────────────────────────── the petal rain (FX3), held (FX11) and let fall (FX12)

const PETAL_VS = /* glsl */`
attribute vec4 aSeed; attribute float aGround;
uniform float uTime; uniform float uPx; uniform float uDrop; uniform vec3 uWalker; uniform float uAside; uniform vec2 uFog; uniform float uH;
varying float vAlpha; varying float vRot; varying float vTone; varying float vFog;
void main() {
  vec3 p = position;
  float t = uTime;
  float fall = 0.3 + aSeed.x * 0.35;
  float y = mod(p.y - t * fall, uH);
  float x = p.x + sin(t * (0.3 + aSeed.y * 0.5) + aSeed.w * 6.283) * 0.9;
  float z = p.z + cos(t * (0.25 + aSeed.z * 0.4) + aSeed.x * 6.283) * 0.9;
  y *= 1.0 - smoothstep(0.0, 1.0, uDrop);
  vec3 w = vec3(x, aGround + 0.03 + y, z);
  // held time: petals within reach of the walker drift aside, and settle back behind
  if (uAside > 0.0) {
    vec2 d = w.xz - uWalker.xz;
    float r = length(d);
    float k = (1.0 - smoothstep(0.25, 0.75, r)) * step(-0.2, w.y - uWalker.y) * (1.0 - smoothstep(1.8, 2.3, w.y - uWalker.y));
    w.xz += normalize(d + 1e-4) * k * 0.55 * uAside;
    w.y += k * 0.12 * uAside;
  }
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float top = 1.0 - smoothstep(uH - 2.0, uH, y);
  vAlpha = top * (0.6 + 0.4 * aSeed.z) * smoothstep(0.35, 1.3, d);
  vRot = aSeed.w * 6.283 + t * (aSeed.x - 0.5) * 2.4;
  vTone = aSeed.y;
  vFog = smoothstep(uFog.x, uFog.y, d);
  gl_PointSize = min(0.17 * (0.65 + aSeed.x * 0.7) * uPx / max(0.4, d), 48.0);
}`;
const PETAL_FS = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uTint; uniform vec3 uFogColor; uniform float uGlow; uniform float uOpacity;
varying float vAlpha; varying float vRot; varying float vTone; varying float vFog;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  c = mat2(cs, -sn, sn, cs) * c;
  float a = texture2D(uMap, c + 0.5).a * vAlpha * uOpacity;
  if (a < 0.02) discard;
  vec3 col = mix(uColA, uColB, vTone);
  // by lamplight (亥) the petals glow warm, whatever the night's tint
  col = mix(col * uTint, col * vec3(1.25, 1.05, 0.85) + vec3(0.12, 0.06, 0.0), uGlow);
  gl_FragColor = vec4(mix(col, uFogColor, vFog * (1.0 - uGlow * 0.6)), a);
  #include <colorspace_fragment>
}`;

// ───────────────────────────── the library

export interface Stamped { zh: string; en: string }

/**
 * The valley's effects. One per world (see world.ts `taoyuan(ctx).fx`). Methods that play out over
 * time return a Promise that resolves when the effect is done (or the world goes).
 */
export class ValleyFx {
  readonly THREE: Three;
  readonly group: T.Group;
  readonly reduced = reducedMotion();
  readonly low: boolean;
  /** Shared uniforms (point size, fog, sky tint). */
  readonly px = { value: 600 };
  readonly fogU = { value: null as unknown as T.Vector2 };
  readonly fogColorU = { value: null as unknown as T.Color };
  readonly tintU = { value: null as unknown as T.Color };
  readonly glowTex: T.Texture;
  readonly petalTex: T.Texture;
  private offs: (() => void)[] = [];
  private owned: { dispose(): void }[] = [];
  private disposed = false;
  private time = 0;

  constructor(readonly ctx: WorldCtx, readonly valley: Valley) {
    const TH = ctx.THREE;
    this.THREE = TH;
    this.low = ctx.quality.level === 'low';
    this.group = new TH.Group();
    this.group.name = 'taoyuan:fx';
    this.group.userData.pocket = true;
    this.group.position.set(G.x, Y_T, G.z);
    ctx.regionGroup('taoyuan').add(this.group);
    this.fogU.value = new TH.Vector2(30, 150);
    this.fogColorU.value = new TH.Color('#f1dabd');
    this.tintU.value = new TH.Color('#ffffff');
    this.glowTex = this.own(canvasTexture(TH, 64, 64, (g, w) => {
      const r = w / 2;
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.18, 'rgba(255,255,255,0.8)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, w);
    }));
    this.petalTex = this.own(canvasTexture(TH, 64, 64, (g) => {
      g.translate(32, 32);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(0, -24);
      g.bezierCurveTo(18, -14, 15, 14, 3, 23);
      g.lineTo(0, 17);
      g.lineTo(-3, 23);
      g.bezierCurveTo(-15, 14, -18, -14, 0, -24);
      g.fill();
    }));
    this.onFrame((dt) => {
      this.time += dt;
      const r = ctx.renderer;
      const H = r.domElement.height;
      this.px.value = H / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
      const fog = ctx.scene.fog as T.Fog | null;
      if (fog) { this.fogU.value.set(fog.near, fog.far); this.fogColorU.value.copy(fog.color); }
      const tint = engine(ctx).skyTint();
      if (tint) this.tintU.value.copy(tint);
    });
    this.rain = this.buildRain();
    this.streamPetals();
  }

  // ── lifetime

  onFrame(fn: (dt: number, t: number) => void): () => void {
    const off = this.ctx.onFrame(fn);
    this.offs.push(off);
    return off;
  }
  own<D extends { dispose(): void }>(d: D): D { this.owned.push(d); return d; }
  /** Wait (real time; resolves early if the world goes). */
  wait(ms: number): Promise<void> {
    return new Promise((res) => {
      if (this.disposed) { res(); return; }
      const h = setTimeout(() => res(), this.reduced ? Math.min(ms, 350) : ms);
      this.offs.push(() => { clearTimeout(h); res(); });
    });
  }
  /** A tween on the world's clock: k 0 → 1 over `secs` (reduced motion: at once). */
  tween(secs: number, step: (k: number) => void): Promise<void> {
    return new Promise((res) => {
      if (this.disposed || this.reduced || secs <= 0) { step(1); res(); return; }
      let t = 0;
      const off = this.onFrame((dt) => {
        t += dt;
        const k = Math.min(1, t / secs);
        step(k);
        if (k >= 1) { off(); res(); }
      });
    });
  }
  /** World → the valley group's local space. */
  local(p: XYZ): T.Vector3 { return new this.THREE.Vector3(p.x - G.x, p.y - Y_T, p.z - G.z); }

  // ───────────────────────────── FX3 · 落英 (always), FX11 held, FX12 let fall

  private rain: { mat: T.ShaderMaterial; points: T.Points; held: boolean };
  private buildRain() {
    const TH = this.THREE;
    const n = Math.round(800 * this.ctx.quality.density * (this.low ? 0.75 : 1));
    const rng = makeRng(8080);
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4), ground = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * (FLOOR_R + 4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      pos[i * 3] = x; pos[i * 3 + 1] = rng() * 12; pos[i * 3 + 2] = z;
      seed.set([rng(), rng(), rng(), rng()], i * 4);
      ground[i] = floorAt(x, z);
    }
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new TH.BufferAttribute(seed, 4));
    g.setAttribute('aGround', new TH.BufferAttribute(ground, 1));
    const mat = new TH.ShaderMaterial({
      vertexShader: PETAL_VS, fragmentShader: PETAL_FS, transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uPx: this.px, uDrop: { value: 0 }, uWalker: { value: new TH.Vector3() }, uAside: { value: 0 }, uFog: this.fogU, uH: { value: 12 },
        uMap: { value: this.petalTex }, uColA: { value: new TH.Color('#e98aa2') }, uColB: { value: new TH.Color('#f9d3dc') }, uTint: this.tintU, uFogColor: this.fogColorU,
        uGlow: { value: 0 }, uOpacity: { value: 1 },
      },
    });
    const points = new TH.Points(g, mat);
    points.frustumCulled = false;
    points.renderOrder = 4;
    points.name = 'taoyuan:petals';
    this.group.add(points);
    this.own(g); this.own(mat);
    const rain = { mat, points, held: false };
    const u = mat.uniforms;
    let asideK = 0;
    this.onFrame((dt) => {
      if (!rain.held && !this.reduced) u.uTime.value += dt;
      else if (!rain.held && this.reduced) u.uTime.value += dt * 0.25;
      const p = this.ctx.player.position;
      (u.uWalker.value as T.Vector3).set(p.x - G.x, p.y - Y_T, p.z - G.z);
      asideK += ((rain.held ? 1 : 0) - asideK) * Math.min(1, dt * 3);
      u.uAside.value = asideK;
    });
    return rain;
  }

  /** The falling petals: hold them in the air (FX11) or let them fall on (null / false). */
  holdPetals(on: boolean): void { this.rain.held = on; }
  /** Petals glow in lamplight (亥): 0 … 1. */
  petalGlow(k: number, secs = 1.5): Promise<void> {
    const u = this.rain.mat.uniforms.uGlow;
    const k0 = u.value as number;
    return this.tween(secs, (e) => { u.value = k0 + (k - k0) * ease(e); });
  }
  /** FX12's fall: every hanging petal drops at once, then the rain begins again. */
  async releasePetals(): Promise<void> {
    const u = this.rain.mat.uniforms;
    await this.tween(1.8, (k) => { u.uDrop.value = k * k; });
    await this.tween(0.5, (k) => { u.uOpacity.value = 1 - k; });
    this.rain.held = false;
    u.uDrop.value = 0;
    await this.tween(3, (k) => { u.uOpacity.value = k; });
  }

  // ───────────────────────────── FX4 · 溪上花: petals riding the stream out through the cleft

  private streamPetals(): void {
    const n = Math.round(70 * Math.min(1.4, this.ctx.quality.density));
    const c = new Cloud(this, n, 'petal');
    c.points.name = 'taoyuan:streampetals';
    const rng = makeRng(404);
    const s0 = new Float32Array(n), off = new Float32Array(n), sp = new Float32Array(n), rot = new Float32Array(n);
    for (let i = 0; i < n; i++) { s0[i] = rng() * STREAM_LEN; off[i] = (rng() - 0.5) * 0.9; sp[i] = 0.25 + rng() * 0.25; rot[i] = rng() * TAU; }
    const col = new this.THREE.Color('#f2b0c0'), colW = new this.THREE.Color('#fbeef0');
    let t = 0;
    this.onFrame((dt) => {
      if (!this.rain.held) t += this.reduced ? dt * 0.3 : dt;
      for (let i = 0; i < n; i++) {
        const s = (s0[i] + t * sp[i]) % STREAM_LEN;
        const p = polyAt(STREAM, s);
        const hw = streamAt(p.x, p.z).hw;
        const x = p.x - p.dz * off[i] * hw, z = p.z + p.dx * off[i] * hw;
        const inCleft = z > CAVE.mouth + 3;
        const y = inCleft ? standAt(0, z) - 0.2 : floorAt(p.x, p.z) + 0.31;
        const fade = Math.min(1, s / 3) * Math.min(1, (STREAM_LEN - s) / 3);
        // (a white-edged one now and then: from the old 碧桃, up the north-west)
        c.set(i, x, y, z, 0.16, 0.9 * fade, i % 9 === 0 ? colW : col, rot[i] + t * 0.3 * (i % 2 ? 1 : -1));
      }
      c.flush();
    });
    this.owned.push(c);
  }

  // ───────────────────────────── FX17 · 萤: fireflies over the stream, drifting toward the walker

  private flies: { cloud: Cloud; k: number; want: number } | null = null;
  fireflies(on: boolean): void {
    if (!this.flies && !on) return;
    if (!this.flies) {
      const n = Math.round(200 * this.ctx.quality.density * (this.low ? 0.6 : 1));
      const cloud = new Cloud(this, n, 'glow');
      cloud.points.name = 'taoyuan:fireflies';
      const rng = makeRng(1717);
      const home = new Float32Array(n * 3), ph = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = rng() * (STREAM_LEN - 20);
        const p = polyAt(STREAM, s);
        const o = (rng() - 0.5) * 7;
        home[i * 3] = p.x - p.dz * o; home[i * 3 + 2] = p.z + p.dx * o; home[i * 3 + 1] = floorAt(p.x, p.z) + 0.3 + rng() * 1.6;
        ph[i * 3] = rng() * TAU; ph[i * 3 + 1] = rng() * TAU; ph[i * 3 + 2] = 0.5 + rng();
      }
      const cA = new this.THREE.Color('#e8f59a'), cB = new this.THREE.Color('#ffd98a'), tmp = new this.THREE.Color();
      const f = { cloud, k: 0, want: 1 };
      this.flies = f;
      let t = 0;
      this.onFrame((dt) => {
        f.k += (f.want - f.k) * Math.min(1, dt * 0.8);
        cloud.points.visible = f.k > 0.01;
        if (!cloud.points.visible) return;
        t += this.reduced ? dt * 0.2 : dt;
        const w = this.ctx.player.position;
        const wx = w.x - G.x, wy = w.y - Y_T + 1.1, wz = w.z - G.z;
        for (let i = 0; i < n; i++) {
          let x = home[i * 3] + Math.sin(t * 0.3 * ph[i * 3 + 2] + ph[i * 3]) * 1.4;
          let y = home[i * 3 + 1] + Math.sin(t * 0.5 + ph[i * 3 + 1]) * 0.35;
          let z = home[i * 3 + 2] + Math.cos(t * 0.27 * ph[i * 3 + 2] + ph[i * 3 + 1]) * 1.4;
          const d = Math.hypot(x - wx, z - wz);
          if (d < 7) { const k = 0.35 * (1 - d / 7); x += (wx - x) * k; y += (wy - y) * k * 0.6; z += (wz - z) * k; }
          const blink = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.4 + ph[i * 3 + 2]) + ph[i * 3] * 3), 3);
          tmp.copy(cA).lerp(cB, (i % 7) / 7);
          cloud.set(i, x, y, z, 0.22, blink * f.k, tmp);
        }
        cloud.flush();
      });
      this.owned.push(cloud);
    }
    this.flies.want = on ? 1 : 0;
  }

  // ───────────────────────────── glows: the lane lanterns' light, glints on clues (FX11)

  private glints = new Map<number, { at: T.Vector3; t0: number; gold: boolean }>();
  private glintCloud: Cloud | null = null;
  private glintId = 0;
  /** A gold glint over a clue (world point). Returns its remover. */
  glint(at: XYZ, o: { color?: 'gold' | 'silver' } = {}): () => void {
    if (!this.glintCloud) {
      const c = new Cloud(this, 64, 'glow');
      c.points.name = 'taoyuan:glints';
      this.glintCloud = c;
      const gold = new this.THREE.Color('#ffd27a'), silver = new this.THREE.Color('#e4ecff');
      this.onFrame(() => {
        let i = 0;
        for (const g of this.glints.values()) {
          if (i >= 32) break;
          const tw = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(this.time * 2.3 + g.t0 * 1.7), 2);
          c.set(i * 2, g.at.x, g.at.y + 0.04 * Math.sin(this.time * 1.3 + g.t0), g.at.z, 0.34, tw * 0.9, g.gold ? gold : silver);
          c.set(i * 2 + 1, g.at.x, g.at.y, g.at.z, 0.9, tw * 0.28, g.gold ? gold : silver);
          i++;
        }
        for (let k = i * 2; k < 64; k++) c.alpha[k] = 0;
        c.flush();
      });
      this.owned.push(c);
    }
    const id = ++this.glintId;
    this.glints.set(id, { at: this.local(at), t0: id * 0.37, gold: o.color !== 'silver' });
    return () => { this.glints.delete(id); };
  }

  private lanternGlow: Cloud | null = null;
  /** The lane lanterns: light one (i), or all of them one by one (戌). */
  lanterns(on: boolean, staggerMs = 450): void {
    const v = this.valley.lanterns;
    if (!this.lanternGlow) {
      const c = new Cloud(this, v.count, 'glow');
      c.points.name = 'taoyuan:lanternglow';
      this.lanternGlow = c;
      const warm = new this.THREE.Color('#ffb45e');
      const pts = lanternPoints();
      this.onFrame((dt) => {
        for (let i = 0; i < v.count; i++) {
          const a = c.alpha[i];
          const want = v.lit(i) ? 0.85 + 0.08 * Math.sin(this.time * 3 + i) : 0;
          c.set(i, pts[i].x, pts[i].y, pts[i].z, 1.5, a + (want - a) * Math.min(1, dt * 3), warm);
        }
        c.flush();
      });
      this.owned.push(c);
    }
    v.all(on, this.reduced ? 0 : staggerMs);
  }

  // ───────────────────────────── FX5 · 天光: god rays through the rim mist (申 from the west, 卯 from the east)

  private rays: { mesh: T.Mesh; mat: T.MeshBasicMaterial; k: number; want: number; side: number } | null = null;
  godRays(on: boolean, from: 'west' | 'east' = 'west'): void {
    const TH = this.THREE;
    if (!this.rays) {
      const tex = this.own(canvasTexture(TH, 64, 256, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.2, 'rgba(255,255,255,0.8)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'destination-in';
        const gx = g.createLinearGradient(0, 0, w, 0);
        gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.5, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gx;
        g.fillRect(0, 0, w, h);
      }));
      const pos: number[] = [], uv: number[] = [];
      const rng = makeRng(55);
      for (let i = 0; i < 7; i++) {
        // a long slanting quad from the rim down into the valley
        const a = (rng() - 0.5) * 1.1, r0 = 50, r1 = 6 + rng() * 18;
        const x0 = -Math.cos(a) * r0, z0 = Math.sin(a) * r0 * 0.8, y0 = 34 + rng() * 6;
        const x1 = -Math.cos(a) * r1 * 0.3, z1 = z0 * 0.2 + (rng() - 0.5) * 12, y1 = 0;
        const w = 2.2 + rng() * 3;
        const px = -(z1 - z0), pz = x1 - x0, pl = Math.hypot(px, pz) || 1;
        const ox = (px / pl) * w, oz = (pz / pl) * w;
        pos.push(x0 - ox, y0, z0 - oz, x0 + ox, y0, z0 + oz, x1 + ox * 1.8, y1, z1 + oz * 1.8, x0 - ox, y0, z0 - oz, x1 + ox * 1.8, y1, z1 + oz * 1.8, x1 - ox * 1.8, y1, z1 - oz * 1.8);
        uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
      const g = new TH.BufferGeometry();
      g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new TH.Float32BufferAttribute(uv, 2));
      const mat = new TH.MeshBasicMaterial({ map: tex, color: '#ffe3a8', transparent: true, opacity: 0, depthWrite: false, blending: TH.AdditiveBlending, side: TH.DoubleSide, fog: false });
      const mesh = new TH.Mesh(g, mat);
      mesh.name = 'taoyuan:godrays';
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.own(g); this.own(mat);
      const r = { mesh, mat, k: 0, want: 0, side: 1 };
      this.rays = r;
      this.onFrame((dt) => {
        r.k += (r.want - r.k) * Math.min(1, dt * 0.6);
        mesh.visible = r.k > 0.01;
        mat.opacity = r.k * (0.16 + 0.04 * Math.sin(this.time * 0.4));
        mesh.scale.x = r.side;
      });
    }
    this.rays.want = on ? 1 : 0;
    this.rays.side = from === 'west' ? 1 : -1;
    this.rays.mat.color.set(from === 'west' ? '#ffdca0' : '#ffd2b0');
  }

  // ───────────────────────────── FX11 · 夜驻: the knee-high blue mist (three layers; FX12 lifts them)

  private mist: { layers: { mesh: T.Mesh; mat: T.MeshBasicMaterial; k: number; want: number; lift: number }[] } | null = null;
  heldMist(on: boolean): void {
    const TH = this.THREE;
    if (!this.mist) {
      const tex = this.own(canvasTexture(TH, 256, 256, (g, w) => {
        const r = makeRng(3);
        for (let i = 0; i < 60; i++) {
          const x = r() * w, y = r() * w, rr = w * (0.08 + r() * 0.18);
          for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) {
            const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr);
            grd.addColorStop(0, 'rgba(255,255,255,0.5)');
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2);
          }
        }
      }));
      tex.wrapS = tex.wrapT = TH.RepeatWrapping;
      tex.repeat.set(6, 6);
      const layers = [0.25, 0.5, 0.85].map((hgt, li) => {
        const N = this.low ? 20 : 30, R = FLOOR_R + 1;
        const geo = new TH.PlaneGeometry(R * 2, R * 2, N, N).rotateX(-Math.PI / 2);
        const p = geo.attributes.position as T.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i);
          const r = Math.hypot(x, z);
          p.setY(i, (r < FLOOR_R + 1 ? floorAt(Math.min(1, (FLOOR_R) / Math.max(r, 1e-3)) * x, Math.min(1, FLOOR_R / Math.max(r, 1e-3)) * z) : 1) + hgt);
        }
        geo.computeVertexNormals();
        const mat = new TH.MeshBasicMaterial({ map: tex, color: li === 0 ? '#9fb6dc' : li === 1 ? '#b3c4e2' : '#c9d4ea', transparent: true, opacity: 0, depthWrite: false, side: TH.DoubleSide });
        const mesh = new TH.Mesh(geo, mat);
        mesh.name = `taoyuan:mist${li}`;
        mesh.renderOrder = 3;
        mesh.visible = false;
        this.group.add(mesh);
        this.own(geo); this.own(mat);
        return { mesh, mat, k: 0, want: 0, lift: 0 };
      });
      this.mist = { layers };
      this.onFrame((dt) => {
        for (let i = 0; i < layers.length; i++) {
          const l = layers[i];
          l.k += (l.want - l.k) * Math.min(1, dt * 0.9);
          l.mesh.visible = l.k > 0.01;
          l.mat.opacity = l.k * (0.34 - i * 0.07);
          l.mesh.position.y = l.lift;
          l.mat.map!.offset.set(this.time * 0.006 * (i + 1), this.time * 0.004);
        }
      });
    }
    for (const l of this.mist.layers) { l.want = on ? 1 : 0; if (on) l.lift = 0; }
  }
  /** The mist lifts in three layers (FX12). */
  async liftMist(): Promise<void> {
    if (!this.mist) return;
    const ls = this.mist.layers;
    await Promise.all(ls.map(async (l, i) => {
      await this.wait(i * 1200);
      const y0 = l.lift;
      l.want = 0;
      await this.tween(3.2, (k) => { l.lift = y0 + ease(k) * (3 + i * 2); });
    }));
  }

  // ───────────────────────────── FX12 · 嗒: one drop, a warm ring, the petals fall, dawn in eight seconds

  private rippleMesh(at: T.Vector3, r: number, color: string, secs: number, width = 0.08): Promise<void> {
    const TH = this.THREE;
    const geo = new TH.RingGeometry(1 - width, 1, 64).rotateX(-Math.PI / 2);
    const mat = new TH.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: TH.AdditiveBlending, fog: false, side: TH.DoubleSide });
    const m = new TH.Mesh(geo, mat);
    m.position.copy(at);
    m.renderOrder = 6;
    this.group.add(m);
    return this.tween(secs, (k) => {
      const s = 0.05 + ease(k) * r;
      m.scale.set(s, 1, s);
      mat.opacity = 0.8 * (1 - k);
    }).then(() => { m.removeFromParent(); geo.dispose(); mat.dispose(); });
  }

  /**
   * 「嗒」 (FX12): one drop falls from the eaves (at: where it lands, default before the hall), a single
   * ripple, a ring of warmer colour sweeps out over the valley, every hanging petal falls at once, the
   * sky runs from 子 to 卯 in about eight seconds and the mist lifts in three layers.
   * `sky: false` leaves the sky to the caller.
   */
  async da(o: { at?: XYZ; sky?: boolean } = {}): Promise<void> {
    const at = this.local(o.at ?? ANCHORS.hallDoor);
    const TH = this.THREE;
    // the drop
    const drop = new Cloud(this, 1, 'glow');
    const white = new TH.Color('#eaf2ff');
    await this.tween(0.55, (k) => { drop.set(0, at.x, at.y + 3.1 - 3.05 * k * k, at.z, 0.12, 0.9, white); drop.flush(); });
    drop.dispose();
    try { plop(0.55); } catch { /* muted */ }
    const eng = engine(this.ctx);
    void this.rippleMesh(new TH.Vector3(at.x, at.y + 0.03, at.z), 1.4, '#dfe8ff', 1.6, 0.06);
    await this.wait(420);
    void this.rippleMesh(new TH.Vector3(at.x, at.y + 0.08, at.z), FLOOR_R + 20, '#ffcf8a', this.reduced ? 0.01 : 3.2, 0.012);
    void this.releasePetals();
    if (o.sky !== false) {
      eng.setMood('zi', { secs: 1.2 });
      await this.wait(1300);
      eng.setMood('mao', { secs: 6.5 });
    }
    await this.wait(700);
    await this.liftMist();
  }

  // ───────────────────────────── FX6 · 流觞: cups with candles drifting down the channel

  /**
   * Six cups, each with a little candle, drift down the cup channel; one stops in front of the walker
   * (at `stop`, default the channel beside the long tables). Resolves when it has stopped; the returned
   * `done()` sends the cups on and away.
   */
  floatCups(o: { stop?: XYZ; n?: number } = {}): { stopped: Promise<void>; done(): void } {
    const TH = this.THREE;
    const n = o.n ?? 6;
    const len = polyLen(CHANNEL);
    const stopL = this.local(o.stop ?? ANCHORS.cupStop);
    let sStop = 0, bd = Infinity;
    for (let s = 0; s <= len; s += 0.05) { const p = polyAt(CHANNEL, s); const d = Math.hypot(p.x - stopL.x, p.z - stopL.z); if (d < bd) { bd = d; sStop = s; } }
    const cupGeo = new TH.CylinderGeometry(0.11, 0.06, 0.07, 12, 1, true);
    const cupMat = new TH.MeshLambertMaterial({ color: '#efe7d6', side: TH.DoubleSide });
    const cups = new TH.InstancedMesh(cupGeo, cupMat, n);
    cups.frustumCulled = false;
    this.group.add(cups);
    const flames = new Cloud(this, n * 2, 'glow');
    const warm = new TH.Color('#ffc46a'), halo = new TH.Color('#ff9a4a');
    const s = Array.from({ length: n }, (_, i) => -i * 1.3);
    let stoppedI = -1, going = false, finished = false;
    let res: () => void = () => {};
    const stopped = new Promise<void>((r) => { res = r; });
    const m4 = new TH.Matrix4();
    const off = this.onFrame((dt) => {
      for (let i = 0; i < n; i++) {
        if (i === stoppedI && !going) continue;
        s[i] += dt * 0.32 * (this.reduced ? 3 : 1);
        if (stoppedI < 0 && s[i] >= sStop && i === 0) { s[i] = sStop; stoppedI = i; res(); }
      }
      let alive = 0;
      for (let i = 0; i < n; i++) {
        const p = polyAt(CHANNEL, Math.max(0, Math.min(len, s[i])));
        const vis = s[i] >= 0 && s[i] <= len;
        if (vis) alive++;
        const y = floorAt(p.x, p.z) + 0.15 + Math.sin(this.time * 2 + i) * 0.01;
        m4.makeTranslation(p.x, vis ? y : -999, p.z);
        cups.setMatrixAt(i, m4);
        const fl = 0.8 + 0.2 * Math.sin(this.time * 17 + i * 3);
        flames.set(i * 2, p.x, y + 0.1, p.z, 0.09, vis ? fl : 0, warm);
        flames.set(i * 2 + 1, p.x, y + 0.1, p.z, 0.5, vis ? 0.35 * fl : 0, halo);
      }
      cups.instanceMatrix.needsUpdate = true;
      flames.flush();
      if (going && alive === 0 && !finished) { finished = true; clean(); }
    });
    const clean = () => { off(); cups.removeFromParent(); cupGeo.dispose(); cupMat.dispose(); flames.dispose(); };
    this.offs.push(() => { if (!finished) { finished = true; clean(); } });
    return { stopped, done: () => { going = true; } };
  }

  // ───────────────────────────── FX7 · 采桑舞: green ribbons trailing from the dancers

  /** Ribbons that follow the figures handed in (their roots), from about hand height. Returns a stopper. */
  ribbons(figs: { root: T.Object3D }[], o: { color?: string; height?: number; length?: number } = {}): () => void {
    const TH = this.THREE;
    const N = 22, n = figs.length;
    const hist = figs.map(() => [] as T.Vector3[]);
    const pos = new Float32Array(n * N * 2 * 3);
    const idx: number[] = [];
    for (let f = 0; f < n; f++) for (let i = 0; i < N - 1; i++) {
      const a = (f * N + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mat = new TH.MeshBasicMaterial({ color: o.color ?? '#7fb35e', transparent: true, opacity: 0.88, side: TH.DoubleSide, depthWrite: false });
    const mesh = new TH.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.group.add(mesh);
    const hgt = o.height ?? 1.25;
    const v = new TH.Vector3();
    let acc = 0;
    const off = this.onFrame((dt) => {
      acc += dt;
      const sample = acc > 0.045;
      if (sample) acc = 0;
      figs.forEach((f, k) => {
        f.root.getWorldPosition(v);
        const h = hist[k];
        const side = new TH.Vector3(Math.cos(f.root.rotation.y), 0, -Math.sin(f.root.rotation.y)).multiplyScalar(0.35);
        const p = new TH.Vector3(v.x - G.x + side.x, v.y - Y_T + hgt + Math.sin(this.time * 4 + k) * 0.12, v.z - G.z + side.z);
        if (sample || !h.length) { h.unshift(p); if (h.length > N) h.pop(); } else h[0] = p;
        for (let i = 0; i < N; i++) {
          const q = h[Math.min(i, h.length - 1)];
          const w = 0.07 * (1 - i / N) + 0.01;
          const b = ((k * N + i) * 2) * 3;
          pos[b] = q.x; pos[b + 1] = q.y + w; pos[b + 2] = q.z;
          pos[b + 3] = q.x; pos[b + 4] = q.y - w - i * 0.012; pos[b + 5] = q.z;
        }
      });
      g.attributes.position.needsUpdate = true;
    });
    let gone = false;
    const stop = () => { if (gone) return; gone = true; off(); mesh.removeFromParent(); g.dispose(); mat.dispose(); };
    this.offs.push(stop);
    return stop;
  }

  // ───────────────────────────── FX8 · 孔明灯 and FX9 · 撒花

  /** Sky lanterns rise from the square (FX8): `n` (40 at 中), over about twenty seconds. */
  skyLanterns(o: { n?: number; from?: XYZ } = {}): Promise<void> {
    const TH = this.THREE;
    const n = Math.round((o.n ?? 40) * Math.min(1.3, this.ctx.quality.density));
    const from = this.local(o.from ?? ANCHORS.square);
    const geo = new TH.CylinderGeometry(0.28, 0.2, 0.62, 8, 1, true);
    const mat = new TH.MeshBasicMaterial({ color: '#ffcf8f', side: TH.DoubleSide, transparent: true, opacity: 0.95 });
    const im = new TH.InstancedMesh(geo, mat, n);
    im.frustumCulled = false;
    this.group.add(im);
    const glow = new Cloud(this, n, 'glow');
    const rng = makeRng(88);
    const L = Array.from({ length: n }, () => ({ x: from.x + (rng() - 0.5) * 9, z: from.z + (rng() - 0.5) * 9, t0: rng() * 6, v: 0.9 + rng() * 0.6, ph: rng() * TAU, drift: (rng() - 0.3) * 0.25 }));
    const warm = new TH.Color('#ffae55');
    const m4 = new TH.Matrix4();
    let t = 0;
    return new Promise((res) => {
      const off = this.onFrame((dt) => {
        t += dt;
        let alive = 0;
        L.forEach((l, i) => {
          const a = Math.max(0, t - l.t0);
          const y = from.y + 0.8 + a * l.v * (1 + a * 0.05);
          const x = l.x + Math.sin(a * 0.4 + l.ph) * 0.8 + a * l.drift, z = l.z + Math.cos(a * 0.33 + l.ph) * 0.8 - a * 0.15;
          const fade = a <= 0 ? 0 : Math.min(1, a / 1.2) * (1 - clamp01((y - from.y - 45) / 15));
          if (fade > 0) alive++;
          m4.makeTranslation(x, fade > 0 ? y : -999, z);
          im.setMatrixAt(i, m4);
          glow.set(i, x, y, z, 1.6, fade * (0.75 + 0.15 * Math.sin(t * 5 + i)), warm);
        });
        im.instanceMatrix.needsUpdate = true;
        glow.flush();
        if (t > 8 && alive === 0) { off(); im.removeFromParent(); geo.dispose(); mat.dispose(); glow.dispose(); res(); }
      });
      this.offs.push(() => res());
    });
  }

  /** Lit petals burst upward and drift down (FX9); also the gust across the lens at the mouth (FX2). */
  petalBurst(at: XYZ, o: { n?: number; up?: number; spread?: number; lit?: boolean; wind?: { x: number; z: number } } = {}): Promise<void> {
    const TH = this.THREE;
    const n = Math.round((o.n ?? 600) * Math.min(1.3, this.ctx.quality.density) * (this.low ? 0.6 : 1));
    const c = new Cloud(this, n, o.lit === false ? 'petal' : 'glow');
    const p0 = this.local(at);
    const rng = makeRng(Math.floor(this.time * 1000) + 3);
    const P = new Float32Array(n * 3), V = new Float32Array(n * 3), life = new Float32Array(n), rot = new Float32Array(n);
    const up = o.up ?? 7, spread = o.spread ?? 3.5, wind = o.wind ?? { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, s = rng() * spread;
      P.set([p0.x, p0.y + 0.4, p0.z], i * 3);
      V.set([Math.cos(a) * s + wind.x, up * (0.5 + rng() * 0.7), Math.sin(a) * s + wind.z], i * 3);
      life[i] = 5 + rng() * 4;
      rot[i] = rng() * TAU;
    }
    const pinkA = new TH.Color(o.lit === false ? '#f0a4b6' : '#ffc9d4'), pinkB = new TH.Color(o.lit === false ? '#f9d5dd' : '#ffe6c8'), tmp = new TH.Color();
    let t = 0;
    return new Promise((res) => {
      const off = this.onFrame((dt) => {
        t += dt;
        for (let i = 0; i < n; i++) {
          const k = i * 3;
          V[k + 1] -= dt * 2.4;
          if (V[k + 1] < -0.55) V[k + 1] = -0.55;
          V[k] *= 1 - dt * 0.9; V[k + 2] *= 1 - dt * 0.9;
          P[k] += (V[k] + Math.sin(t * 1.3 + i) * 0.3) * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += (V[k + 2] + Math.cos(t + i) * 0.3) * dt;
          const a = clamp01(t / 0.2) * clamp01((life[i] - t) / 1.5);
          tmp.copy(pinkA).lerp(pinkB, (i % 5) / 5);
          c.set(i, P[k], P[k + 1], P[k + 2], o.lit === false ? 0.16 : 0.2, a * 0.9, tmp, rot[i] + t * (i % 2 ? 2 : -2));
        }
        c.flush();
        if (t > 9.5) { off(); c.dispose(); res(); }
      });
      this.offs.push(() => res());
    });
  }

  // ───────────────────────────── FX10 · 香篆: the incense seal (a groove, an ember, a thread of smoke)

  /**
   * The incense seal on the altar (or `at`): a meander of powder in a square tray with nine pins
   * (戌初 … 子末). setProgress(p) burns it to p (0 … 1) — the ember sits at the burn's head and a thread
   * of smoke rises; wet(from) darkens the soaked powder from `from` on (C1). pinAt(i) is where pin i
   * stands (world), and pins[i] its progress.
   */
  incenseSeal(o: { at?: XYZ; size?: number } = {}): IncenseSeal {
    return new IncenseSeal(this, this.local(o.at ?? ANCHORS.incense), o.size ?? 0.34);
  }

  // ───────────────────────────── FX13 · 花神现形: petals gather into a figure, then burst into the stream

  /**
   * Petals spiral in to `at` (default the spring) and gather into a standing figure (夭夭), whose
   * silhouette points may be handed in (world). Resolves `formed` when she has formed; burst() scatters
   * her into the stream and resolves when the petals have settled.
   */
  gatherFigure(o: { at?: XYZ; points?: XYZ[]; height?: number } = {}): { formed: Promise<void>; burst(): Promise<void>; remove(): void } {
    const TH = this.THREE;
    const at = this.local(o.at ?? ANCHORS.spring);
    const H = o.height ?? 1.7;
    const target: T.Vector3[] = o.points?.map((p) => this.local(p)) ?? silhouette(H, Math.round(520 * Math.min(1.2, this.ctx.quality.density))).map((p) => new TH.Vector3(at.x + p.x, at.y + 0.2 + p.y, at.z + p.z));
    const n = target.length;
    const c = new Cloud(this, n, 'glow');
    const rng = makeRng(1313);
    const start = target.map(() => { const a = rng() * TAU, r = 5 + rng() * 6; return new TH.Vector3(at.x + Math.cos(a) * r, at.y + rng() * 4, at.z + Math.sin(a) * r); });
    const P = start.map((p) => p.clone());
    const V = target.map(() => new TH.Vector3());
    const delay = target.map(() => rng() * 1.6);
    const cA = new TH.Color('#ffc2cf'), cB = new TH.Color('#fff0e0'), tmp = new TH.Color();
    let t = 0, mode: 'gather' | 'hold' | 'burst' = 'gather', bt = 0;
    let formedRes: () => void = () => {};
    const formed = new Promise<void>((r) => { formedRes = r; });
    let burstRes: () => void = () => {};
    const GATHER = this.reduced ? 0.1 : 4.2;
    const off = this.onFrame((dt) => {
      t += dt;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (mode !== 'burst') {
          const k = ease((t - delay[i]) / (GATHER - 1.6));
          const a = (1 - k) * 5 + i;
          const r = (1 - k) * 4;
          p.set(
            start[i].x + (target[i].x - start[i].x) * k + Math.cos(a + t) * r * 0.3,
            start[i].y + (target[i].y - start[i].y) * k,
            start[i].z + (target[i].z - start[i].z) * k + Math.sin(a + t) * r * 0.3,
          );
          if (mode === 'hold') p.y += Math.sin(t * 1.5 + i) * 0.01;
        } else {
          const v = V[i];
          v.y -= dt * 1.2;
          v.multiplyScalar(1 - dt * 0.6);
          // drawn toward the stream, and away south with it
          v.z += dt * 0.35;
          p.addScaledVector(v, dt);
          if (p.y < floorAt(p.x, p.z) + 0.3) { p.y = floorAt(p.x, p.z) + 0.3; v.y = 0; }
        }
        const fade = mode === 'burst' ? clamp01(1 - (bt - 2.5) / 2.5) : clamp01((t - delay[i]) / 0.6);
        tmp.copy(cA).lerp(cB, (i % 7) / 7);
        c.set(i, p.x, p.y, p.z, 0.11, fade * 0.9, tmp);
      }
      c.flush();
      if (mode === 'gather' && t > GATHER) { mode = 'hold'; formedRes(); }
      if (mode === 'burst') { bt += dt; if (bt > 5.2) { remove(); burstRes(); } }
    });
    let gone = false;
    const remove = () => { if (gone) return; gone = true; off(); c.dispose(); formedRes(); burstRes(); };
    this.offs.push(remove);
    return {
      formed,
      burst: () => new Promise<void>((res) => {
        burstRes = res;
        if (gone) { res(); return; }
        mode = 'burst';
        for (let i = 0; i < n; i++) { const d = P[i].clone().sub(at); d.y = 0.6; V[i].copy(d.normalize().multiplyScalar(1.5 + rng() * 2)); V[i].y = 1 + rng() * 1.5; }
      }),
      remove,
    };
  }

  // ───────────────────────────── FX1 / FX14: the cleft's light, its seasons, its closing

  private caveGlow: { sprite: T.Sprite; mat: T.SpriteMaterial; k: number } | null = null;
  /** FX14 shows the light guttering out, wherever the walker stands. */
  private glowHeld = false;
  /** The light at the cleft's inner mouth, growing as the walker comes nearer (FX1). Built by the door. */
  mouthGlow(): T.Sprite {
    const TH = this.THREE;
    if (this.caveGlow) return this.caveGlow.sprite;
    const mat = new TH.SpriteMaterial({ map: this.glowTex, color: '#fff6de', transparent: true, opacity: 0.8, depthWrite: false, blending: TH.AdditiveBlending, fog: false });
    const sprite = new TH.Sprite(mat);
    sprite.position.set(0.1, standAt(0, CAVE.mouth + 1) + 1.6, CAVE.mouth + 0.5);
    sprite.renderOrder = 6;
    sprite.name = 'taoyuan:mouthglow';
    this.group.add(sprite);
    this.own(mat);
    const g = { sprite, mat, k: 1 };
    this.caveGlow = g;
    // it is the light seen from inside the narrow way: it grows as the walker comes up the cleft, and
    // goes as they reach the mouth (the flash takes over there) or turn back into the valley; and it
    // never fills the lens (it fades as the camera comes near it, or passes it on the way out)
    let seen = 0;
    const cam = new this.THREE.Vector3();
    this.onFrame((dt) => {
      const pw = this.ctx.player.position;
      const p = L(pw.x, pw.z);
      const d = Math.max(0, p.z - CAVE.mouth);
      const want = (this.glowHeld || (p.z > CAVE.mouth + 3 && p.z < CAVE.end + 1 && Math.abs(p.x) < 6)) && pw.y > Y_T - 5 ? 1 : 0;
      seen += (want - seen) * Math.min(1, dt * (want ? 1.2 : 2.2));
      cam.copy(this.ctx.camera.position).sub(this.group.position).sub(sprite.position);
      const lens = clamp01((cam.length() - 2) / 6);
      const k = g.k * seen * lens * lens * (3 - 2 * lens);
      const s = 3.2 + 9 * clamp01(1 - d / 24);
      sprite.scale.set(s * 0.8, s * 1.4, 1);
      mat.opacity = k * (0.55 + 0.35 * clamp01(1 - d / 24));
      sprite.visible = mat.opacity > 0.01;
    });
    return sprite;
  }
  /** FX14 · 闭门: petals flow back into the cleft, its rock flickers through four seasons, mist seals it, the light gutters out. */
  async closeCave(): Promise<void> {
    const TH = this.THREE;
    const mat = this.valley.caveMat;
    const base = mat.color.clone();
    // petals flowing backward, into the cleft
    const n = Math.round(160 * Math.min(1.3, this.ctx.quality.density));
    const c = new Cloud(this, n, 'petal');
    const rng = makeRng(141);
    const P = Array.from({ length: n }, () => new TH.Vector3((rng() - 0.5) * 1.2, standAt(0, CAVE.mouth + 2) + 0.4 + rng() * 1.8, CAVE.mouth - 2 - rng() * 12));
    this.glowHeld = true;
    const col = new TH.Color('#f3b3c3');
    let t = 0;
    const off = this.onFrame((dt) => {
      t += dt;
      P.forEach((p, i) => {
        p.z += dt * (2.2 + (i % 5) * 0.3);
        p.x = Math.max(-cleftHalf(p.z) + 0.1, Math.min(cleftHalf(p.z) - 0.1, p.x + Math.sin(t * 3 + i) * dt * 0.4));
        const a = clamp01((CAVE.start - p.z) / 6) * clamp01(t / 0.5);
        c.set(i, p.x, p.y + Math.sin(t * 2 + i) * 0.05, p.z, 0.16, a, col, i + t * 2);
      });
      c.flush();
    });
    // four seasons washing over the rock: blossom, rain, red leaves, snow
    const seasons = ['#f4c9d2', '#8f9aa8', '#cf6b43', '#f6f5f0'].map((s) => new TH.Color(s));
    for (const s of seasons) {
      await this.tween(0.3, (k) => mat.color.copy(base).lerp(s, k));
      await this.wait(this.reduced ? 120 : 340);
    }
    await this.tween(0.5, (k) => mat.color.copy(seasons[3]).lerp(base, k));
    // the mist seals the mouth, the light gutters out
    const g = this.caveGlow;
    const mistMat = new TH.SpriteMaterial({ map: this.glowTex, color: '#f4f1ea', transparent: true, opacity: 0, depthWrite: false, fog: false });
    const mist = new TH.Sprite(mistMat);
    mist.position.set(0, standAt(0, CAVE.mouth + 2) + 1.4, CAVE.mouth + 1.5);
    mist.scale.set(5, 5, 1);
    this.group.add(mist);
    this.caveMist?.();
    this.caveMist = () => { mist.removeFromParent(); mistMat.dispose(); this.caveMist = null; };
    await this.tween(1.6, (k) => {
      mistMat.opacity = k * 0.95;
      mist.scale.setScalar(5 + k * 4);
      if (g) g.k = (1 - k) * (0.6 + 0.4 * Math.random());
    });
    off();
    c.dispose();
    this.glowHeld = false;
  }
  private caveMist: (() => void) | null = null;
  /** The cleft's light and mist back as they were (after FX14, the next way in). */
  reopenCave(): void {
    if (this.caveGlow) this.caveGlow.k = 1;
    this.caveMist?.();
  }

  // ───────────────────────────── FX16 · 断: a ring of lanterns round the courtyard

  /** Lanterns ringing the courtyard (FX16): light them one by one (a gong each), remove when the judgement is done. */
  lanternRing(o: { at?: XYZ; r?: number; n?: number } = {}): { light(i: number): void; lightAll(): void; count: number; remove(): void } {
    const TH = this.THREE;
    const c = this.local(o.at ?? ANCHORS.courtyard);
    const n = o.n ?? 10, r = o.r ?? 2.9;
    const glow = new Cloud(this, n * 2, 'glow');
    const geo = new TH.CylinderGeometry(0.16, 0.16, 0.3, 10);
    const mat = new TH.MeshBasicMaterial({ color: '#ffffff' });
    const im = new TH.InstancedMesh(geo, mat, n);
    this.group.add(im);
    const pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; return new TH.Vector3(c.x + Math.cos(a) * r * 1.35, c.y + 1.5, c.z + Math.sin(a) * r * 0.8); });
    const lit = pts.map(() => 0);
    const unlit = new TH.Color('#9c3c2e'), on = new TH.Color('#ffd08a'), warm = new TH.Color('#ffb45e');
    pts.forEach((p, i) => { im.setMatrixAt(i, new TH.Matrix4().makeTranslation(p.x, p.y, p.z)); im.setColorAt(i, unlit); });
    im.instanceMatrix.needsUpdate = true;
    const off = this.onFrame(() => {
      pts.forEach((p, i) => {
        glow.set(i * 2, p.x, p.y, p.z, 0.5, lit[i] * 0.9, on);
        glow.set(i * 2 + 1, p.x, p.y, p.z, 2.2, lit[i] * (0.42 + 0.06 * Math.sin(this.time * 3 + i)), warm);
      });
      glow.flush();
    });
    let gone = false;
    const api = {
      count: n,
      light: (i: number) => {
        if (i < 0 || i >= n) return;
        void this.tween(0.6, (k) => { lit[i] = Math.max(lit[i], k); });
        im.setColorAt(i, on);
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        try { this.ctx.audio.bell(); } catch { /* muted */ }
      },
      lightAll: () => { for (let i = 0; i < n; i++) setTimeout(() => { if (!gone) api.light(i); }, this.reduced ? 0 : i * 180); },
      remove: () => { if (gone) return; gone = true; off(); glow.dispose(); im.removeFromParent(); geo.dispose(); mat.dispose(); },
    };
    this.offs.push(api.remove);
    return api;
  }

  // ───────────────────────────── words brushed in the air

  /** Words brushed into the air at a world point: they rise a little and fade (or stay: `stay`). Returns a remover. */
  words(text: string, at: XYZ, o: { color?: string; size?: number; life?: number; rise?: number; vertical?: boolean; stay?: boolean } = {}): () => void {
    const TH = this.THREE;
    const chars = [...text];
    const vertical = o.vertical ?? false;
    const cell = 72;
    const w = vertical ? cell + 16 : cell * chars.length + 16;
    const h = vertical ? cell * chars.length + 16 : cell + 16;
    const paint = (g: CanvasRenderingContext2D) => {
      g.clearRect(0, 0, w, h);
      g.font = `${cell * 0.86}px ${BRUSH_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255,244,220,0.9)';
      g.shadowBlur = 10;
      g.fillStyle = o.color ?? '#1d1916';
      chars.forEach((c, i) => g.fillText(c, vertical ? w / 2 : 8 + cell * (i + 0.5), vertical ? 8 + cell * (i + 0.5) : h / 2 + 2));
    };
    const tex = canvasTexture(TH, w, h, paint);
    const mat = new TH.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    const s = new TH.Sprite(mat);
    let ready = true;
    try { ready = !document.fonts || document.fonts.check('64px "Ma Shan Zheng"', text); } catch { /* assume so */ }
    if (!ready) void loadBrush(text).then(() => { if (!s.parent) return; const g = (tex.image as HTMLCanvasElement).getContext('2d'); if (g) { paint(g); tex.needsUpdate = true; } });
    const size = o.size ?? 0.34;
    s.scale.set((w / cell) * size, (h / cell) * size, 1);
    const p0 = this.local(at);
    s.position.copy(p0);
    s.renderOrder = 7;
    this.group.add(s);
    let age = 0, gone = false;
    const life = o.life ?? 3.4, rise = o.rise ?? 0.6;
    const off = this.onFrame((dt) => {
      age += dt;
      const k = o.stay ? Math.min(1, age / (life * 0.15)) * 0.9999 : Math.min(1, age / life);
      s.position.y = p0.y + (this.reduced || o.stay ? 0 : rise * (1 - Math.pow(1 - k, 2)));
      mat.opacity = o.stay ? Math.min(1, age / 0.6) : k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      if (!o.stay && k >= 1) remove();
    });
    const remove = () => { if (gone) return; gone = true; off(); s.removeFromParent(); tex.dispose(); mat.dispose(); };
    this.offs.push(remove);
    return remove;
  }

  // ───────────────────────────── screen effects (DOM)

  /** FX2 · 豁然: a white-gold flash, then the valley in ink with colour bleeding in from the middle over `secs` (低: a plain fade). */
  async reveal(o: { secs?: number } = {}): Promise<void> {
    const hud = this.ctx.hud;
    const flash = document.createElement('div');
    flash.className = 'ty-flash';
    const offF = hud.mount(flash);
    this.offs.push(offF);
    await this.wait(560);
    const secs = o.secs ?? 4;
    if (this.low || this.reduced || !supportsBackdrop()) {
      const fade = document.createElement('div');
      fade.className = 'ty-fade';
      const off = hud.mount(fade);
      this.offs.push(off);
      requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.add('is-off')));
      await this.wait(2600);
      off();
    } else {
      const ink = document.createElement('div');
      ink.className = 'ty-ink';
      const off = hud.mount(ink);
      this.offs.push(off);
      await this.tween(secs, (k) => ink.style.setProperty('--r', `${(ease(k) * 125).toFixed(1)}%`));
      off();
    }
    await this.wait(200);
    offF();
  }

  /** FX15 · 证: an ink blot spreads, the clue's name is brushed, a red 「证」 is stamped. */
  async stamp(name: Stamped, o: { seal?: string } = {}): Promise<void> {
    const el = document.createElement('div');
    el.className = 'ty-stamp';
    const lang = this.ctx.lang;
    el.innerHTML = '<div class="blot"></div><div class="name"></div><div class="en"></div><div class="seal"></div>';
    (el.querySelector('.name') as HTMLElement).textContent = lang === 'zh' ? name.zh : name.en;
    (el.querySelector('.en') as HTMLElement).textContent = lang === 'zh' ? name.en : '';
    (el.querySelector('.seal') as HTMLElement).textContent = o.seal ?? '证';
    const off = this.ctx.hud.mount(el);
    this.offs.push(off);
    void loadBrush(name.zh + (o.seal ?? '证'));
    await this.wait(1450);
    try { this.ctx.audio.knock(); } catch { /* muted */ }
    await this.wait(1200);
    el.classList.add('is-out');
    await this.wait(750);
    off();
  }

  /** FX16's ending: the truth replays as ink ghosts — the view goes to ink, figures drift, the lines come one by one. */
  async inkGhosts(lines: Stamped[], o: { figures?: number; perLine?: number } = {}): Promise<void> {
    const el = document.createElement('div');
    el.className = 'ty-ghosts';
    const figs: HTMLElement[] = [];
    for (let i = 0; i < (o.figures ?? 3); i++) {
      const f = document.createElement('div');
      f.className = 'fig';
      f.style.left = `${18 + i * 26}%`;
      el.appendChild(f);
      figs.push(f);
    }
    const p = document.createElement('p');
    el.appendChild(p);
    const off = this.ctx.hud.mount(el);
    this.offs.push(off);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('is-on');
      figs.forEach((f, i) => { f.style.opacity = '1'; f.style.transform = `translateX(${(i % 2 ? -1 : 1) * 40}px)`; });
    }));
    await this.wait(1200);
    for (const l of lines) {
      p.textContent = this.ctx.lang === 'zh' ? l.zh : l.en;
      p.classList.add('is-on');
      await this.wait(o.perLine ?? 3200);
      p.classList.remove('is-on');
      await this.wait(900);
    }
    el.classList.remove('is-on');
    await this.wait(1200);
    off();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.caveMist?.();
    for (const f of this.offs.splice(0).reverse()) { try { f(); } catch { /* gone */ } }
    for (const d of this.owned.splice(0)) { try { d.dispose(); } catch { /* gone */ } }
    this.group.removeFromParent();
  }
}

// ───────────────────────────── the incense seal (FX10)

const INCENSE_VS = /* glsl */`
attribute float aS;
varying float vS;
void main() { vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const INCENSE_FS = /* glsl */`
uniform float uBurn; uniform float uWet; uniform vec3 uTint;
varying float vS;
void main() {
  vec3 powder = vec3(0.36, 0.25, 0.17);
  vec3 ash = vec3(0.86, 0.84, 0.8);
  vec3 wet = vec3(0.16, 0.11, 0.08);
  vec3 c = vS < uBurn ? ash : powder;
  if (vS >= uWet) c = wet;
  // the head of the burn glows
  c = mix(c, vec3(1.0, 0.55, 0.2), (1.0 - smoothstep(0.0, 0.012, abs(vS - uBurn))) * step(uBurn, uWet - 0.001));
  gl_FragColor = vec4(c * uTint, 1.0);
  #include <colorspace_fragment>
}`;

export class IncenseSeal {
  readonly group: T.Group;
  /** Progress (0 … 1) of the nine pins: 戌初 戌正 戌末 亥初 亥正 亥末 子初 子正 子末. */
  readonly pins: number[] = Array.from({ length: 9 }, (_, i) => (i + 0.5) / 9);
  private mat: T.ShaderMaterial;
  private path: T.Vector3[] = [];
  private cum: number[] = [];
  private emberOn = true;
  private smokeOn = true;
  progress = 0;
  constructor(private fx: ValleyFx, at: T.Vector3, size: number) {
    const TH = fx.THREE;
    this.group = new TH.Group();
    this.group.position.copy(at);
    this.group.name = 'taoyuan:incense';
    fx.group.add(this.group);
    // the tray: a shallow bronze box of pale ash
    const tray = new TH.Mesh(new TH.BoxGeometry(size, 0.04, size), new TH.MeshLambertMaterial({ color: '#6b5a3c' }));
    tray.position.y = -0.02;
    this.group.add(tray);
    const bed = new TH.Mesh(new TH.PlaneGeometry(size * 0.9, size * 0.9).rotateX(-Math.PI / 2), new TH.MeshLambertMaterial({ color: '#cfc7b8' }));
    bed.position.y = 0.001;
    this.group.add(bed);
    // the meander (a 回 pattern, the old 篆 of incense seals)
    const s = size * 0.4, pts: [number, number][] = [];
    const turns = 5;
    let x = -s, z = -s, w = s * 2, d = s * 2;
    pts.push([x, z]);
    for (let k = 0; k < turns; k++) {
      x += w; pts.push([x, z]);
      z += d; pts.push([x, z]);
      w -= s * 0.36; x -= w; pts.push([x, z]);
      d -= s * 0.36; z -= d; pts.push([x, z]);
      w -= s * 0.36; d -= s * 0.36;
      if (w <= 0 || d <= 0) break;
    }
    let acc = 0;
    this.path = pts.map(([px, pz]) => new TH.Vector3(px, 0.012, pz));
    this.cum = this.path.map((p, i) => (i ? (acc += p.distanceTo(this.path[i - 1])) : 0));
    const total = acc;
    const pos: number[] = [], sAttr: number[] = [];
    const hw = size * 0.018;
    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1], b = this.path[i];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * hw, nz = (dx / l) * hw;
      const sa = this.cum[i - 1] / total, sb = this.cum[i] / total;
      pos.push(a.x + nx, a.y, a.z + nz, a.x - nx, a.y, a.z - nz, b.x + nx, b.y, b.z + nz, a.x - nx, a.y, a.z - nz, b.x - nx, b.y, b.z - nz, b.x + nx, b.y, b.z + nz);
      sAttr.push(sa, sa, sb, sa, sb, sb);
    }
    const g = new TH.BufferGeometry();
    g.setAttribute('position', new TH.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new TH.Float32BufferAttribute(sAttr, 1));
    this.mat = new TH.ShaderMaterial({ vertexShader: INCENSE_VS, fragmentShader: INCENSE_FS, side: TH.DoubleSide, uniforms: { uBurn: { value: 0 }, uWet: { value: 2 }, uTint: fx.tintU } });
    this.group.add(new TH.Mesh(g, this.mat));
    // the pins
    const pinGeo = new TH.CylinderGeometry(0.003, 0.003, 0.05, 4);
    const pinMat = new TH.MeshLambertMaterial({ color: '#c9a45a' });
    for (const p of this.pins) {
      const q = this.at(p);
      const m = new TH.Mesh(pinGeo, pinMat);
      m.position.set(q.x, 0.035, q.z);
      this.group.add(m);
    }
    // the ember and the smoke
    const ember = new Cloud(fx, 2, 'glow');
    const smoke = new Cloud(fx, 28, 'glow');
    const orange = new TH.Color('#ff9a3c'), grey = new TH.Color('#8c8a86');
    const sm = Array.from({ length: 28 }, (_, i) => i / 28);
    const w0 = new TH.Vector3();
    fx.onFrame((dt) => {
      if (!this.group.parent) return;
      const h = this.at(this.progress);
      this.group.localToWorld(w0.copy(h));
      w0.sub(fx.group.position);
      const burning = this.emberOn && this.progress < Math.min(1, this.mat.uniforms.uWet.value as number) - 0.002;
      ember.set(0, w0.x, w0.y + 0.006, w0.z, 0.02, burning ? 0.95 : 0, orange);
      ember.set(1, w0.x, w0.y + 0.01, w0.z, 0.09, burning ? 0.4 + 0.1 * Math.sin(Date.now() * 0.01) : 0, orange);
      ember.flush();
      for (let i = 0; i < sm.length; i++) {
        sm[i] = (sm[i] + dt * 0.18) % 1;
        const k = sm[i];
        const on = burning && this.smokeOn;
        smoke.set(i, w0.x + Math.sin(k * 9 + i) * 0.015 * k * 3, w0.y + 0.02 + k * 0.55, w0.z + Math.cos(k * 7) * 0.01 * k * 3, 0.03 + k * 0.08, on ? 0.12 * (1 - k) : 0, grey);
      }
      smoke.flush();
    });
    this.clouds = [ember, smoke];
  }
  private clouds: Cloud[] = [];
  /** The groove's point at progress p (local to the tray). */
  private at(p: number): T.Vector3 {
    const total = this.cum[this.cum.length - 1];
    const s = Math.max(0, Math.min(1, p)) * total;
    for (let i = 1; i < this.cum.length; i++) {
      if (s <= this.cum[i]) {
        const k = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
        return this.path[i - 1].clone().lerp(this.path[i], k);
      }
    }
    return this.path[this.path.length - 1].clone();
  }
  /** Where pin i stands (world). */
  pinAt(i: number): XYZ {
    const v = this.group.localToWorld(this.at(this.pins[Math.max(0, Math.min(8, i))]).clone());
    return { x: v.x, y: v.y, z: v.z };
  }
  /** Burn to p (0 … 1), over `secs` (0: at once). */
  setProgress(p: number, secs = 0): Promise<void> {
    const p0 = this.progress;
    const to = Math.max(0, Math.min(1, p));
    return this.fx.tween(secs, (k) => { this.progress = p0 + (to - p0) * k; this.mat.uniforms.uBurn.value = this.progress; });
  }
  /** The powder is soaked (and will not burn) from `from` on; null: dry. */
  wet(from: number | null): void { this.mat.uniforms.uWet.value = from === null ? 2 : from; }
  ember(on: boolean): void { this.emberOn = on; }
  smoke(on: boolean): void { this.smokeOn = on; }
  remove(): void {
    this.group.removeFromParent();
    for (const c of this.clouds) c.dispose();
    this.group.traverse((o) => { const m = o as T.Mesh; m.geometry?.dispose(); if (m.material && !Array.isArray(m.material) && m.material !== this.mat) m.material.dispose(); });
    this.mat.dispose();
  }
}

// ───────────────────────────── helpers

function supportsBackdrop(): boolean {
  try { return CSS.supports('backdrop-filter', 'grayscale(1)') || CSS.supports('-webkit-backdrop-filter', 'grayscale(1)'); } catch { return false; }
}

/** The lane lanterns' glows (local). */
function lanternPoints(): { x: number; y: number; z: number }[] {
  return LANE_LANTERNS.map((w) => ({ x: w.x - G.x + 0.4, y: floorAt(w.x - G.x, w.z - G.z) + 1.6, z: w.z - G.z }));
}

/** A standing figure in long robes, as points (local, feet at 0): 夭夭 when no silhouette is handed in. */
function silhouette(H: number, n: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const rng = makeRng(2718);
  while (out.length < n) {
    const y = rng() * H;
    const k = y / H;
    let r: number;
    if (k > 0.88) r = 0.11 * Math.sqrt(Math.max(0, 1 - ((k - 0.94) / 0.06) ** 2));   // head
    else if (k > 0.83) r = 0.05;                                                        // neck
    else if (k > 0.6) r = 0.2 + (0.83 - k) * 0.3;                                       // shoulders, sleeves
    else r = 0.18 + (0.6 - k) * 0.45;                                                   // the robe, flaring to the hem
    const a = rng() * TAU, d = Math.sqrt(rng()) * r;
    // the long sleeves hang out at the sides
    const sleeve = k > 0.5 && k < 0.72 && rng() < 0.25 ? (rng() < 0.5 ? -1 : 1) * (0.28 + rng() * 0.12) : 0;
    out.push({ x: Math.cos(a) * d + sleeve, y, z: Math.sin(a) * d * 0.6 });
  }
  return out;
}
