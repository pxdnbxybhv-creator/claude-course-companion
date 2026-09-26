// Distant mountains: three rings of washes around the garden in the blue-green of 青绿山水 — azurite
// far off, teal nearer, a deep mineral green on the nearest ridge with ochre at its feet — each
// paler than the one before (远山淡), dissolving downward into a warm mist so the land meets them
// in 留白. They take the hour from the fog: warm at dusk, dark indigo silhouettes by night.
import * as THREE from 'three';
import { makeNoise2, makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture } from './kit';
import { skyNow } from './sky';

interface Layer { R: number; H: number; alpha: number; color: string; foot: string; seed: number; rough: number; dots: boolean; haze: number }

// They ride with the camera (always at the horizon, however far you walk), beyond the land's rim.
const LAYERS: Layer[] = [
  { R: 385, H: 96, alpha: 0.3, color: '#7d9db3', foot: '#c9b79c', seed: 31, rough: 0.35, dots: false, haze: 0.45 },
  { R: 330, H: 84, alpha: 0.4, color: '#4f8584', foot: '#b99c78', seed: 17, rough: 0.5, dots: false, haze: 0.3 },
  { R: 280, H: 60, alpha: 0.52, color: '#35664f', foot: '#a8784c', seed: 5, rough: 0.7, dots: true, haze: 0.15 },
];

/** By night the washes go down to dark indigo silhouettes against the sky. */
const NIGHT_MUL = new THREE.Color('#3c4670');

/** Where the moon hangs (u around the ring, see CylinderGeometry): keep the ridges low there. */
const MOON_U = 0.48;

function paintLayer(L: Layer, W: number, H: number): HTMLCanvasElement {
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const period = 8;
  const n = makeNoise2(L.seed, period);
  const rng = makeRng(L.seed * 7 + 1);
  const ridge = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    let v = 0.5 + 0.5 * n.fbm(u * period, 0.37, 4, 2, 0.5 + L.rough * 0.1);
    v = Math.pow(v, 1.7);
    // gaps between ranges and a low saddle where the moon rises
    const du = Math.min(Math.abs(u - MOON_U), 1 - Math.abs(u - MOON_U));
    const saddle = 1 - 0.6 * Math.exp(-(du * du) / 0.004);
    ridge[x] = H * (1 - (0.14 + 0.84 * v) * saddle);
  }
  // body: a mineral wash from the ridge, warming to ochre at the foot, fading into mist
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(L.color.slice(i, i + 2), 16));
  const [fr, fg, fb] = [1, 3, 5].map((i) => parseInt(L.foot.slice(i, i + 2), 16));
  const mid = (k: number) => `${Math.round(r + (fr - r) * k)},${Math.round(gg + (fg - gg) * k)},${Math.round(b + (fb - b) * k)}`;
  for (let x = 0; x < W; x++) {
    const top = ridge[x];
    const fade = top + (H - top) * 0.8;
    const grd = g.createLinearGradient(0, top, 0, fade);
    grd.addColorStop(0, `rgba(${r},${gg},${b},${L.alpha})`);
    grd.addColorStop(0.3, `rgba(${mid(0.3)},${L.alpha * 0.7})`);
    grd.addColorStop(0.62, `rgba(${mid(0.75)},${L.alpha * 0.38})`);
    grd.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
    g.fillStyle = grd;
    g.fillRect(x, top, 1, fade - top + 1);
  }
  // ridge line: a dry brush that thickens and breaks
  g.lineCap = 'round';
  for (let x = 0; x < W - 3; x += 3) {
    const w = 1 + 2.5 * (0.5 + 0.5 * n(x / 40, 3.3));
    const a = L.alpha * (0.5 + 0.5 * n(x / 25, 7.1));
    if (a < L.alpha * 0.25) continue;
    g.strokeStyle = `rgba(${r},${gg},${b},${Math.min(0.9, a * 1.3)})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, ridge[x] + 0.5);
    g.lineTo(x + 3, ridge[x + 3] + 0.5);
    g.stroke();
  }
  // texture strokes (披麻皴): short, falling from the ridge
  const count = Math.round(W / 14);
  for (let i = 0; i < count; i++) {
    const x = rng() * W;
    const top = ridge[Math.floor(x)];
    const len = (H - top) * rng.range(0.1, 0.3);
    const lean = (ridge[Math.min(W - 1, Math.floor(x) + 6)] - ridge[Math.max(0, Math.floor(x) - 6)]) * 0.6;
    g.strokeStyle = `rgba(${r},${gg},${b},${L.alpha * rng.range(0.08, 0.22)})`;
    g.lineWidth = rng.range(0.6, 1.3);
    g.beginPath();
    g.moveTo(x, top + 3);
    g.quadraticCurveTo(x + lean * 0.3, top + len * 0.5, x + lean * 0.6 + rng.range(-2, 2), top + len);
    g.stroke();
  }
  // 米点: horizontal blots along the nearest ridge
  if (L.dots) {
    for (let i = 0; i < W / 3; i++) {
      const x = rng() * W;
      const top = ridge[Math.floor(x)];
      const y = top + rng.range(0, 10) * rng();
      g.fillStyle = `rgba(${r},${gg},${b},${L.alpha * rng.range(0.2, 0.55)})`;
      g.beginPath();
      g.ellipse(x, y, rng.range(2, 5), rng.range(1, 2.4), 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** The painted ranges; call follow() each frame so they stay on the horizon. */
export function buildMountains(bag: Bag): THREE.Group & { follow(cam: THREE.Vector3): void } {
  const group = new THREE.Group();
  group.name = 'mountains';
  const hazed = new THREE.Color();
  for (const L of LAYERS) {
    const tex = canvasTexture(bag, paintLayer(L, 2048, 256));
    tex.wrapS = THREE.RepeatWrapping;
    const mat = bag.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide }));
    const geo = bag.add(new THREE.CylinderGeometry(L.R, L.R, L.H, 96, 1, true));
    geo.translate(0, L.H / 2 - 8, 0);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -5;
    // the hour: a little of the haze's warmth by day (more on the far ranges), dark indigo by night
    m.onBeforeRender = (_r, scene) => {
      const fog = scene.fog as THREE.Fog | null;
      if (!fog) return;
      const c = fog.color;
      const mx = Math.max(c.r, c.g, c.b, 1e-3);
      hazed.setRGB(c.r / mx, c.g / mx, c.b / mx);
      mat.color.setRGB(1, 1, 1).lerp(hazed, L.haze * 0.5).lerp(NIGHT_MUL, skyNow.night);
    };
    group.add(m);
  }
  return Object.assign(group, {
    follow(cam: THREE.Vector3) {
      group.position.set(cam.x, Math.min(0, cam.y * 0.3), cam.z);
    },
  });
}
