// Sky, light and fog: the paper the whole painting sits on. Follows the real clock (dawn / day /
// dusk / night) and can be forced to night by a feature. The moon shows its real phase.
import * as THREE from 'three';
import type { TimeOfDay } from '../../../ink/scene-types';
import type { Sky } from '../types';
import { Bag, canvas, canvasTexture, glowTexture, damp } from './kit';

interface Palette {
  top: string; horizon: string; fog: string;
  hemiSky: string; hemiGround: string; hemi: number;
  sun: string; sunI: number;
  /** multiplier for unlit things (plant paintings, tablets): the light falling on the paper */
  tint: string;
  glow: string;
}

const PALETTES: Record<TimeOfDay, Palette> = {
  dawn: { top: '#d9d6d2', horizon: '#f1ddcb', fog: '#eddccc', hemiSky: '#f5ebe4', hemiGround: '#a89c8a', hemi: 2.1, sun: '#ffe2c8', sunI: 1.15, tint: '#f6ece2', glow: '#f3b98f' },
  day: { top: '#e2dccd', horizon: '#f3ede0', fog: '#efe9dc', hemiSky: '#fbf8f1', hemiGround: '#b0a898', hemi: 2.25, sun: '#fff8ec', sunI: 1.25, tint: '#ffffff', glow: '#fff4dc' },
  dusk: { top: '#d5c2a7', horizon: '#eecfa6', fog: '#e9d1b2', hemiSky: '#f4e0c8', hemiGround: '#9b8a74', hemi: 2.0, sun: '#ffcf9e', sunI: 1.2, tint: '#f5e4cc', glow: '#e89a62' },
  // Night keeps the paper light — cool silver-blue moonlit xuan, value ≥ ~0.75 — and lets the dark
  // gather in the upper sky and the far distance; the moon's glow and the lanterns carry the mood.
  night: { top: '#121a28', horizon: '#6c7788', fog: '#65707f', hemiSky: '#cfd8e8', hemiGround: '#8f98a8', hemi: 2.75, sun: '#e2e9f6', sunI: 0.8, tint: '#c6cedb', glow: '#d8d4c4' },
};

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFog; uniform vec3 uGlowColor; uniform vec3 uSunDir; uniform float uGlow;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.42, h), 0.8));
  col = mix(col, uFog, smoothstep(0.06, -0.05, h));
  float g = max(dot(d, uSunDir), 0.0);
  col += uGlowColor * (pow(g, 90.0) * 0.28 + pow(g, 12.0) * 0.06) * uGlow;
  // paper tooth: a faint fibrous grain so the sky reads as a sheet, not a screen
  vec2 q = gl_FragCoord.xy;
  float n = hash(floor(q * 0.5)) * 0.6 + hash(floor(q * vec2(0.05, 0.9))) * 0.4;
  col *= 1.0 + (n - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Paint the moon at a phase (0 new → 0.5 full → 1 new): lit paper, unlit sky, a soft rim. */
function moonCanvas(phase: number): HTMLCanvasElement {
  const S = 256, R = 104, cx = S / 2, cy = S / 2;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  // faint earthshine on the dark part
  g.fillStyle = 'rgba(236, 228, 210, 0.07)';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  const waxing = phase < 0.5;
  const k = Math.cos(phase * Math.PI * 2);
  g.save();
  if (!waxing) { g.translate(S, 0); g.scale(-1, 1); }
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
  if (k >= 0) g.ellipse(cx, cy, Math.max(0.01, R * k), R, 0, Math.PI / 2, -Math.PI / 2, true);
  else g.ellipse(cx, cy, Math.max(0.01, R * -k), R, 0, Math.PI / 2, Math.PI * 1.5, false);
  g.closePath();
  const lit = g.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R);
  lit.addColorStop(0, '#fbf6ea');
  lit.addColorStop(1, '#ebe0c8');
  g.fillStyle = lit;
  g.fill();
  g.clip();
  // a few pale grey "seas", like thin ink washes
  const seas: [number, number, number][] = [[-0.25, -0.2, 0.28], [0.18, -0.05, 0.22], [-0.05, 0.3, 0.2], [0.3, 0.32, 0.12]];
  for (const [x, y, r] of seas) {
    const gg = g.createRadialGradient(cx + x * R, cy + y * R, 0, cx + x * R, cy + y * R, r * R);
    gg.addColorStop(0, 'rgba(120, 118, 110, 0.16)');
    gg.addColorStop(1, 'rgba(120, 118, 110, 0)');
    g.fillStyle = gg;
    g.fillRect(0, 0, S, S);
  }
  g.restore();
  return c;
}

function sunCanvas(): HTMLCanvasElement {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(192, 65, 47, 0.95)');
  grd.addColorStop(0.72, 'rgba(192, 65, 47, 0.9)');
  grd.addColorStop(0.8, 'rgba(192, 65, 47, 0.3)');
  grd.addColorStop(1, 'rgba(192, 65, 47, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

export class SkySystem implements Sky {
  readonly fog: THREE.Fog;
  readonly hemi: THREE.HemisphereLight;
  readonly sunLight: THREE.DirectionalLight;
  /** The light falling on unlit painted things (plants, tablets). */
  readonly tint = new THREE.Color('#ffffff');
  readonly fogColor = new THREE.Color();
  /** 0 = day … 1 = night, eased. */
  night01 = 0;

  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private celestial = new THREE.Group();
  private moon: THREE.Sprite;
  private moonGlow: THREE.Sprite;
  private sun: THREE.Sprite;
  private forced = false;
  private moonOverride: { visible?: boolean; scale: number; glow: number } = { scale: 1, glow: 1 };
  private moonDir = new THREE.Vector3(0.28, 0.3, -1).normalize();
  private sunDir = new THREE.Vector3();
  private cur: Record<keyof Palette, THREE.Color | number>;
  private moonScale = 1;
  private moonGlowK = 1;
  private moonVis = 0;

  constructor(
    scene: THREE.Scene,
    bag: Bag,
    private tod: TimeOfDay,
    hour: number,
    private moonPhase: number,
  ) {
    this.fog = new THREE.Fog('#efe7d7', 20, 115);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 2);
    this.sunLight = new THREE.DirectionalLight('#fff', 1.4);
    scene.add(this.hemi, this.sunLight, this.sunLight.target);

    this.domeMat = bag.add(new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
        uGlowColor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 1 },
      },
    }));
    this.dome = new THREE.Mesh(bag.add(new THREE.SphereGeometry(400, 32, 16)), this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // sun & moon ride with the camera (infinitely far away)
    const moonTex = canvasTexture(bag, moonCanvas(moonPhase));
    this.moon = new THREE.Sprite(bag.add(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true })));
    this.moonGlow = new THREE.Sprite(bag.add(new THREE.SpriteMaterial({ map: glowTexture(bag, 128, 0.7), color: '#f4ecd6', fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.35 })));
    this.sun = new THREE.Sprite(bag.add(new THREE.SpriteMaterial({ map: canvasTexture(bag, sunCanvas()), fog: false, depthWrite: false, transparent: true })));
    this.moon.renderOrder = this.moonGlow.renderOrder = this.sun.renderOrder = -9;
    this.celestial.add(this.moonGlow, this.moon, this.sun);
    scene.add(this.celestial);

    const hourAngle = ((hour - 6) / 12) * Math.PI; // 0 at 6h (east) … π at 18h (west)
    this.sunDir.set(Math.cos(hourAngle), Math.max(0.06, Math.sin(hourAngle)) * 0.75, 0.55 * Math.max(0.2, Math.sin(hourAngle))).normalize();
    if (tod === 'dawn' || tod === 'dusk') this.sunDir.y = 0.07;
    this.cur = {} as Record<keyof Palette, THREE.Color | number>;
    this.applyPalette(1);
  }

  private static parsed = new Map<string, THREE.Color>();
  private static col(hex: string): THREE.Color {
    let c = SkySystem.parsed.get(hex);
    if (!c) SkySystem.parsed.set(hex, (c = new THREE.Color(hex)));
    return c;
  }
  private lightDir = new THREE.Vector3();

  private target(): Palette {
    return PALETTES[this.forced ? 'night' : this.tod];
  }

  private applyPalette(k: number): void {
    const p = this.target();
    for (const key of Object.keys(p) as (keyof Palette)[]) {
      const v = p[key];
      if (typeof v === 'number') {
        const c = this.cur[key];
        this.cur[key] = typeof c === 'number' ? c + (v - c) * k : v;
      } else {
        const c = this.cur[key];
        if (!(c instanceof THREE.Color)) this.cur[key] = SkySystem.col(v).clone();
        else c.lerp(SkySystem.col(v), k);
      }
    }
  }

  isNight(): boolean {
    return this.forced || this.tod === 'night';
  }

  forceNight(on: boolean): void {
    this.forced = on;
  }

  setMoon(o: { visible?: boolean; scale?: number; glow?: number; position?: THREE.Vector3 }): void {
    if (o.visible !== undefined) this.moonOverride.visible = o.visible;
    if (o.scale !== undefined) this.moonOverride.scale = Math.max(0.1, o.scale);
    if (o.glow !== undefined) this.moonOverride.glow = Math.max(0, o.glow);
    if (o.position && o.position.lengthSq() > 1e-6) this.moonDir.copy(o.position).normalize();
  }

  /** Direction toward the moon (unit). */
  moonDirection(): THREE.Vector3 {
    return this.moonDir;
  }

  update(dt: number, camera: THREE.Camera): void {
    const k = dt > 0.5 ? 1 : 1 - Math.exp(-dt * 1.6);
    this.applyPalette(k);
    const c = this.cur as Record<string, THREE.Color & number>;
    const night = this.isNight() ? 1 : 0;
    this.night01 = dt > 0.5 ? night : damp(this.night01, night, 1.6, dt);

    const u = this.domeMat.uniforms;
    (u.uTop.value as THREE.Color).copy(c.top);
    (u.uHorizon.value as THREE.Color).copy(c.horizon);
    (u.uFog.value as THREE.Color).copy(c.fog);
    (u.uGlowColor.value as THREE.Color).copy(c.glow);
    this.fog.color.copy(c.fog);
    // by night the near garden stays clear and the dark gathers further off
    this.fog.near = 30 - 4 * this.night01;
    this.fog.far = 150 - 40 * this.night01;
    this.fogColor.copy(c.fog);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemi as number;
    this.sunLight.color.copy(c.sun);
    this.sunLight.intensity = c.sunI as number;
    this.tint.copy(c.tint);

    // light direction: the sun by day, the moon by night
    const lightDir = this.lightDir.copy(this.sunDir).lerp(this.moonDir, this.night01).normalize();
    this.sunLight.position.copy(lightDir).multiplyScalar(50);
    this.sunLight.target.position.set(0, 0, 0);
    (u.uSunDir.value as THREE.Vector3).copy(lightDir);
    u.uGlow.value = this.night01 > 0.5 ? 0.9 * this.moonOverride.glow : 1;

    this.dome.position.copy(camera.position);
    this.celestial.position.copy(camera.position);

    // moon: visible at night (unless new), or whenever a feature asks
    const illum = (1 - Math.cos(this.moonPhase * Math.PI * 2)) / 2;
    const wantMoon = this.moonOverride.visible ?? (this.night01 > 0.05 && illum > 0.04);
    this.moonVis = dt > 0.5 ? (wantMoon ? 1 : 0) : damp(this.moonVis, wantMoon ? 1 : 0, 2, dt);
    this.moonScale = dt > 0.5 ? this.moonOverride.scale : damp(this.moonScale, this.moonOverride.scale, 1.5, dt);
    this.moonGlowK = damp(this.moonGlowK, this.moonOverride.glow, 2, dt);
    const D = 300;
    const ms = 22 * this.moonScale;
    this.moon.position.copy(this.moonDir).multiplyScalar(D);
    this.moon.scale.setScalar(ms);
    this.moonGlow.position.copy(this.moon.position).multiplyScalar(1.01);
    this.moonGlow.scale.setScalar(ms * (2.4 + Math.min(1.5, this.moonGlowK) * 0.5));
    const dayMoon = 1 - this.night01 * 0.6;
    (this.moon.material as THREE.SpriteMaterial).opacity = this.moonVis * (this.night01 > 0.5 ? 1 : 0.55 + 0.45 * (1 - dayMoon));
    (this.moonGlow.material as THREE.SpriteMaterial).opacity = this.moonVis * this.night01 * 0.22 * Math.min(1.6, this.moonGlowK) / Math.sqrt(Math.max(1, this.moonScale));
    this.moon.visible = this.moonVis > 0.01;
    this.moonGlow.visible = this.moon.visible && this.night01 > 0.02;

    // the cinnabar sun, only when low (dawn, dusk)
    const low = this.tod === 'dawn' || this.tod === 'dusk';
    this.sun.visible = low && this.night01 < 0.9;
    this.sun.position.copy(this.sunDir).multiplyScalar(D);
    this.sun.scale.setScalar(16);
    (this.sun.material as THREE.SpriteMaterial).opacity = (1 - this.night01) * 0.85;
  }
}
