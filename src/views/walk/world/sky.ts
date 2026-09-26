// Sky, light and fog: the paper the whole painting sits on. Follows the real clock (dawn / day /
// dusk / night) and can be forced to night by a feature. The moon shows its real phase.
import * as THREE from 'three';
import type { TimeOfDay } from '../../../ink/scene-types';
import type { Sky } from '../types';
import { Bag, canvas, canvasTexture, glowTexture, damp } from './kit';
import { fogFor, type ShadowSpec } from './quality';
import { ShadowRig, type ShadowAim } from './shadows';

interface Palette {
  top: string; horizon: string; fog: string;
  hemiSky: string; hemiGround: string; hemi: number;
  sun: string; sunI: number;
  /** multiplier for unlit things (plant paintings, tablets): the light falling on the paper */
  tint: string;
  glow: string;
}

// A warm living painting: golden paper light by day under a pale 花青 (indigo-teal) wash of sky,
// rose-gold at dawn, amber at dusk (a bright bounce from below, so white walls glow apricot, not
// tan); warm ink-brown from below (never blue-grey). Night is a deep indigo sky over a warm dark:
// an ivory moon on things — more moon and less flat sky fill, so the land has a lit side and a
// shaded one — a lavender (not blue) sky fill and a warm-brown bounce from below, so lawns, walls and
// paving read umber and ivory and the blue stays in the sky and the water; dark enough near the
// ground that the lanterns and the lit windows glow amber against it — cosy, never a teal wash.
const PALETTES: Record<TimeOfDay, Palette> = {
  dawn: { top: '#a0bccb', horizon: '#f4d9ba', fog: '#ecdcc8', hemiSky: '#fbeee2', hemiGround: '#8f7866', hemi: 2.0, sun: '#ffdcb4', sunI: 1.25, tint: '#faefe4', glow: '#f7a468' },
  day: { top: '#97bfcc', horizon: '#efebdf', fog: '#e7e6d8', hemiSky: '#fff8ee', hemiGround: '#a88a68', hemi: 2.05, sun: '#fff3de', sunI: 1.4, tint: '#fffaf2', glow: '#fff0c8' },
  dusk: { top: '#7b8db5', horizon: '#f2c59a', fog: '#e8cfb6', hemiSky: '#f6e9dc', hemiGround: '#957866', hemi: 2.15, sun: '#ffd3a6', sunI: 1.25, tint: '#f6e5d3', glow: '#f2844a' },
  night: { top: '#0b1130', horizon: '#2c3766', fog: '#2a3462', hemiSky: '#aaa8c4', hemiGround: '#74553e', hemi: 1.2, sun: '#ece6da', sunI: 0.9, tint: '#aaa6bc', glow: '#efe2bc' },
};

/** Fog distances by day and by night (a light warm haze, a closer indigo dark): fogFor() in quality.ts, × the picture quality's distance. */

/** Water takes the sky's colour through jade: 碧 by day, a deep indigo-teal by night. */
const WATER: Record<TimeOfDay, string> = { dawn: '#a8c6b6', day: '#97c2b4', dusk: '#b5b89a', night: '#2d4a5c' };

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFog; uniform vec3 uGlowColor; uniform vec3 uSunDir; uniform float uGlow; uniform float uNight;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.34, h), 0.7));
  col = mix(col, uFog, smoothstep(0.06, -0.05, h));
  float g = max(dot(d, uSunDir), 0.0);
  col += uGlowColor * (pow(g, 90.0) * 0.28 + pow(g, 12.0) * 0.06 + pow(g, 3.0) * 0.05) * uGlow;
  // by night a scatter of small stars in the upper sky (none by the moon, fewer toward the horizon)
  if (uNight > 0.01) {
    vec2 sp = vec2(atan(d.z, d.x) * 95.0, asin(clamp(h, -1.0, 1.0)) * 95.0);
    vec2 cell = floor(sp);
    float r = hash(cell);
    vec2 off = vec2(hash(cell + 7.1), hash(cell + 3.7)) - 0.5;
    float star = smoothstep(0.34, 0.0, length(fract(sp) - 0.5 - off * 0.5)) * step(0.985, r);
    star *= smoothstep(0.1, 0.45, h) * (1.0 - smoothstep(0.93, 0.99, g)) * (0.4 + 0.6 * hash(cell + 1.3));
    col += vec3(0.95, 0.92, 0.82) * star * uNight * 0.7;
  }
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

/**
 * The hour as the painted things of the world see it (mountains, lamplight pools): the latest sky's
 * eased night (0 day … 1 night), updated every frame. For look code that has no per-frame hook.
 */
export const skyNow = { night: 0 };


/** The sun's direction at an hour (0 at 6h in the east … π at 18h in the west); low at dawn and dusk. */
function aimSun(dir: THREE.Vector3, hour: number, tod: TimeOfDay): void {
  const a = ((hour - 6) / 12) * Math.PI;
  dir.set(Math.cos(a), Math.max(0.06, Math.sin(a)) * 0.75, 0.55 * Math.max(0.2, Math.sin(a))).normalize();
  if (tod === 'dawn' || tod === 'dusk') dir.y = 0.07;
}
export class SkySystem implements Sky {
  readonly fog: THREE.Fog;
  readonly hemi: THREE.HemisphereLight;
  readonly sunLight: THREE.DirectionalLight;
  /** The light falling on unlit painted things (plants, tablets). */
  readonly tint = new THREE.Color('#ffffff');
  readonly fogColor = new THREE.Color();
  /** Jade water under this sky (the pond and the open water take it). */
  readonly waterColor = new THREE.Color('#97c2b4');
  /** 0 = day … 1 = night, eased. */
  night01 = 0;

  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private celestial = new THREE.Group();
  private moon: THREE.Sprite;
  private moonGlow: THREE.Sprite;
  private sun: THREE.Sprite;
  private forced = false;
  private moonOverride: { visible?: boolean | null; scale: number; glow: number } = { scale: 1, glow: 1 };
  private moonDir = new THREE.Vector3(0.28, 0.3, -1).normalize();
  private sunDir = new THREE.Vector3();
  private cur: Record<keyof Palette, THREE.Color | number>;
  private moonScale = 1;
  private moonGlowK = 1;
  private moonVis = 0;
  private fogD: ReturnType<typeof fogFor>;
  private halo: number;
  /** 身临其境: a soft warm halo round the low sun (the moon has its glow already). */
  private sunHalo: THREE.Sprite | null = null;
  private rig: ShadowRig | null = null;

  constructor(
    scene: THREE.Scene,
    bag: Bag,
    private tod: TimeOfDay,
    hour: number,
    private moonPhase: number,
    q: { distance?: number; shadows?: ShadowSpec | null; halo?: number; renderer?: THREE.WebGLRenderer } = {},
  ) {
    this.fogD = fogFor(q.distance ?? 1);
    this.halo = Math.max(0.5, q.halo ?? 1);
    this.fog = new THREE.Fog('#efe7d7', 20, 115);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 2);
    this.sunLight = new THREE.DirectionalLight('#fff', 1.4);
    scene.add(this.hemi, this.sunLight, this.sunLight.target);

    this.domeMat = bag.add(new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
        uGlowColor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 1 }, uNight: { value: 0 },
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
    if (this.halo > 1.001) {
      this.sunHalo = new THREE.Sprite(bag.add(new THREE.SpriteMaterial({ map: glowTexture(bag, 128, 0.5), color: '#f6a66e', fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 })));
      this.sunHalo.renderOrder = -9;
      this.celestial.add(this.sunHalo);
    }
    scene.add(this.celestial);
    if (q.shadows) {
      const rig = new ShadowRig(scene, this.sunLight, q.shadows, q.renderer ?? null);
      this.rig = rig;
      bag.add({ dispose: () => rig.dispose() });
    }

    aimSun(this.sunDir, hour, tod);
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
  private glowDir = new THREE.Vector3();
  private moonLight = new THREE.Vector3();
  private sunLightDir = new THREE.Vector3();

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

  /** Whether a feature (or a picture) has forced night on. */
  isForcedNight(): boolean {
    return this.forced;
  }

  /** The hour the world was entered at, kept while a picture turns it (photo mode). */
  private realHour: { tod: TimeOfDay; sun: THREE.Vector3 } | null = null;

  /** Photo mode: paint the sky at another time of day for a while; `null` puts the real hour back. */
  setTimeOfDay(tod: TimeOfDay | null): void {
    if (tod === null) {
      if (this.realHour) {
        this.tod = this.realHour.tod;
        this.sunDir.copy(this.realHour.sun);
        this.realHour = null;
      }
      return;
    }
    if (!this.realHour) this.realHour = { tod: this.tod, sun: this.sunDir.clone() };
    this.tod = tod;
    aimSun(this.sunDir, tod === 'dusk' ? 18.2 : tod === 'dawn' ? 6.2 : tod === 'night' ? 22 : 11, tod);
  }

  setMoon(o: { visible?: boolean | null; scale?: number; glow?: number; position?: THREE.Vector3 }): void {
    if (o.visible !== undefined) this.moonOverride.visible = o.visible;
    if (o.scale !== undefined) this.moonOverride.scale = Math.max(0.1, o.scale);
    if (o.glow !== undefined) this.moonOverride.glow = Math.max(0, o.glow);
    if (o.position && o.position.lengthSq() > 1e-6) this.moonDir.copy(o.position).normalize();
  }

  /** Direction toward the moon (unit). */
  moonDirection(): THREE.Vector3 {
    return this.moonDir;
  }

  /** A photograph's frame: the shadows drawn finer (see ShadowRig.setFine); nothing without real shadows. */
  shadowFine(fine: boolean): void {
    this.rig?.setFine(fine);
  }

  /** `aim`: where the shadows should be instead of round the view (the photo camera: see ShadowRig.update). */
  update(dt: number, camera: THREE.Camera, aim?: ShadowAim | null): void {
    const k = dt > 0.5 ? 1 : 1 - Math.exp(-dt * 1.6);
    this.applyPalette(k);
    const c = this.cur as Record<string, THREE.Color & number>;
    const night = this.isNight() ? 1 : 0;
    this.night01 = dt > 0.5 ? night : damp(this.night01, night, 1.6, dt);
    skyNow.night = this.night01;

    const u = this.domeMat.uniforms;
    (u.uTop.value as THREE.Color).copy(c.top);
    (u.uHorizon.value as THREE.Color).copy(c.horizon);
    (u.uFog.value as THREE.Color).copy(c.fog);
    (u.uGlowColor.value as THREE.Color).copy(c.glow);
    this.fog.color.copy(c.fog);
    // by night the near garden stays clear and the dark gathers further off
    const F = this.fogD;
    this.fog.near = F.near + (F.nightNear - F.near) * this.night01;
    this.fog.far = F.far + (F.nightFar - F.far) * this.night01;
    this.fogColor.copy(c.fog);
    this.waterColor.copy(SkySystem.col(WATER[this.tod])).lerp(SkySystem.col(WATER.night), this.night01);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemi as number;
    this.sunLight.color.copy(c.sun);
    this.sunLight.intensity = c.sunI as number;
    if (this.rig) {
      // with real shadows, more of the light comes from the sun and less from the sky's fill, so a
      // cast shadow reads even under a low sun (lit ground stays as bright as before: flat ground at
      // a 28° sun loses ~4%, at noon gains ~1%; the side away from the sun sits a little deeper);
      // gentler by moonlight
      const k = 1 - 0.5 * this.night01;
      this.hemi.intensity *= 1 - 0.15 * k;
      this.sunLight.intensity *= 1 + 0.3 * k;
    }
    this.tint.copy(c.tint);

    // light direction: the sun by day, the moon by night
    // (moonlight falls from higher than the moon's disc sits: there are no cast shadows to betray
    // it, and a grazing light would leave the land one flat dark — this way the moonlit side of
    // every swell and roof reads silver, the far side stays in shade)
    const moonLight = this.moonLight.copy(this.moonDir);
    moonLight.y = Math.max(moonLight.y, 0.62);
    moonLight.normalize();
    // (and a low sun lights from a little higher than its disc, so dawn and dusk rake the land gold
    // rather than leaving it to the sky's fill alone)
    const sunLight = this.sunLightDir.copy(this.sunDir);
    sunLight.y = Math.max(sunLight.y, 0.24);
    sunLight.normalize();
    const lightDir = this.lightDir.copy(sunLight).lerp(moonLight, this.night01).normalize();
    if (this.rig) this.rig.update(dt, camera, lightDir, this.night01, aim);
    else {
      this.sunLight.position.copy(lightDir).multiplyScalar(50);
      this.sunLight.target.position.set(0, 0, 0);
    }
    (u.uSunDir.value as THREE.Vector3).copy(this.glowDir.copy(this.sunDir).lerp(this.moonDir, this.night01).normalize());
    u.uGlow.value = this.night01 > 0.5 ? 0.9 * this.moonOverride.glow : 1;
    u.uNight.value = this.night01;

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
    this.moonGlow.scale.setScalar(ms * (2.4 + Math.min(1.5, this.moonGlowK) * 0.5) * this.halo);
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
    if (this.sunHalo) {
      this.sunHalo.visible = this.sun.visible;
      this.sunHalo.position.copy(this.sun.position).multiplyScalar(1.01);
      this.sunHalo.scale.setScalar(16 * 4.2 * this.halo);
      (this.sunHalo.material as THREE.SpriteMaterial).opacity = (1 - this.night01) * 0.16 * (this.halo - 1) / 0.35;
    }
  }
}
