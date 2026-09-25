// /lab.html?scene=region-mountain&id=bamboo|plum|mountain&view=0..n[&night=1][&season=winter][&stats=1]
// A standalone bench for the hill regions (竹林, 梅岭, 山寺): a stand-in terrain shaped around map.ts
// (REGIONS elevations, the lake, the river), paper sky and fog, a fake WorldCtx, preset cameras.
// Lets the regions be iterated on while the real world core is being rebuilt.
import * as THREE from 'three';
import { ANCHORS, LAKE, REGION, REGIONS, RIVER, RIVER_LAKE_BREAK, type RegionId, type XZ } from '../../views/walk/map';
import type { RegionModule, WorldCtx } from '../../views/walk/types';
import { PIGMENTS } from '../../ink/types';
import { makeNoise2, makeRng } from '../../core/rng';
import { bambooRegion } from '../../views/walk/regions/bamboo';
import { plumRegion } from '../../views/walk/regions/plum';
import { mountainRegion } from '../../views/walk/regions/mountain';
import { stats } from '../../views/walk/regions/hill-kit';

const MODULES: Record<string, RegionModule> = { bamboo: bambooRegion, plum: plumRegion, mountain: mountainRegion };

// ───────────────────────── stand-in terrain ─────────────────────────
const noise = makeNoise2(4242);
function segDist(pts: XZ[], x: number, z: number): { d: number; i: number; t: number } {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best.d) best = { d, i, t };
  }
  return best;
}
const RIVER_UP = RIVER.slice(0, RIVER_LAKE_BREAK);
const RIVER_DOWN = RIVER.slice(RIVER_LAKE_BREAK);
function base(x: number, z: number): number {
  let num = 0, den = 0, maxw = 0;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.center.x, z - r.center.z) / (r.radius * 1.3);
    const w = Math.exp(-d * d * 2.2);
    num += w * r.elevation; den += w; maxw = Math.max(maxw, w);
  }
  let h = den > 1e-4 ? (num / den) * Math.min(1, maxw * 1.6) : 0;
  const m = REGION.mountain;
  const dm = Math.hypot(x - m.center.x, z - m.center.z) / (m.radius * 1.5);
  h += Math.exp(-dm * dm * 2) * Math.max(-9, Math.min(12, -(z - m.center.z) * 0.38));
  h += 3.2 * Math.exp(-((x - ANCHORS.plumSummit.x) ** 2 + (z - ANCHORS.plumSummit.z) ** 2) / 160);
  // far hills
  const R = Math.hypot(x, z);
  h += Math.max(0, R - 150) * 0.5;
  h += noise.fbm(x * 0.025, z * 0.025, 3) * 1.4;
  return h;
}
function riverInfo(x: number, z: number): { d: number; w: number; y: number } | null {
  for (const pts of [RIVER_UP, RIVER_DOWN]) {
    const s = segDist(pts, x, z);
    const a = pts[s.i - 1], b = pts[s.i];
    const w = a.w + (b.w - a.w) * s.t;
    if (s.d < w + 2.5) {
      const cx = a.x + (b.x - a.x) * s.t, cz = a.z + (b.z - a.z) * s.t;
      return { d: s.d, w, y: base(cx, cz) - 0.5 };
    }
  }
  return null;
}
function inLake(x: number, z: number): number {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
}
function groundY(x: number, z: number): number {
  let h = base(x, z);
  const lq = inLake(x, z);
  if (lq < 1.15) h = Math.min(h, LAKE.waterY - 1.4 * (1 - Math.max(0, (lq - 0.85) / 0.3)) + 0.2);
  const r = riverInfo(x, z);
  if (r) {
    const k = Math.max(0, Math.min(1, (r.w + 2.5 - r.d) / 2.5));
    h = h + (Math.min(h, r.y - 0.9) - h) * k;
  }
  return h;
}
function waterAt(x: number, z: number): number | null {
  if (inLake(x, z) < 1) return LAKE.waterY;
  const r = riverInfo(x, z);
  if (r && r.d < r.w) return r.y;
  return null;
}

// ───────────────────────── views ─────────────────────────
type View = { eye: [number, number, number]; at: [number, number, number]; fov?: number };
function V(ex: number, ez: number, eh: number, ax: number, az: number, ah: number, fov = 50): View {
  return { eye: [ex, groundY(ex, ez) + eh, ez], at: [ax, groundY(ax, az) + ah, az], fov };
}
const VIEWS: Record<string, () => View[]> = {
  bamboo: () => {
    const c = ANCHORS.bambooClearing, s = ANCHORS.bambooShrine;
    return [
      V(c.x + 16, c.z + 2, 1.7, c.x, c.z, 1.2),           // 0 arriving along the path
      V(c.x - 5, c.z - 6, 1.6, c.x + 2, c.z + 3, 1.0),     // 1 in the clearing, table
      V(c.x + 40, c.z + 40, 40, c.x, c.z, 0, 45),          // 2 overview
      V(s.x + 5, s.z - 5, 1.6, s.x, s.z, 0.8),             // 3 shrine
      V(c.x + 2, c.z + 1, 1.6, c.x + 2, c.z - 10, 9, 60),  // 4 looking up into the canopy
      V(-70, 36, 1.6, -72, 42, 1.4),                       // 5 hut
      V(c.x - 2, c.z - 10, 1.6, c.x - 3, c.z - 20, 1.2),   // 6 path to the ridge
    ];
  },
  plum: () => {
    const s = ANCHORS.plumSummit, b = ANCHORS.plumBench;
    return [
      V(-72, -60, 1.7, s.x, s.z, 2.5),                     // 0 foot of the steps
      V(s.x + 5, s.z + 5, 1.7, s.x, s.z, 2),               // 1 at the pavilion
      V(s.x + 36, s.z + 34, 30, s.x, s.z, 0, 45),          // 2 overview
      V(b.x + 4, b.z + 4, 1.6, b.x, b.z, 0.6),             // 3 bench
      V(s.x, s.z, 2.2, s.x + 30, s.z + 20, -2, 60),        // 4 view from the pavilion
      V(-60, -80, 1.7, -70, -74, 3),                       // 5 from the ridge path
    ];
  },
  mountain: () => {
    const g = ANCHORS.templeGate, hl = ANCHORS.templeHall, b = ANCHORS.bellTower, p = ANCHORS.pagoda, w = ANCHORS.waterfall;
    return [
      V(g.x + 2, g.z + 12, 1.7, g.x, g.z, 3),              // 0 the gate
      V(g.x + 4, g.z - 6, 1.7, hl.x, hl.z, 3),             // 1 up the stairs to the hall
      V(hl.x + 50, hl.z + 50, 45, hl.x + 5, hl.z, 0, 45),  // 2 overview
      V(b.x + 7, b.z + 5, 1.7, b.x, b.z, 3.5),             // 3 bell tower
      V(p.x - 8, p.z + 14, 1.7, p.x, p.z, 10, 55),         // 4 pagoda
      V(w.x - 6, w.z + 12, 1.7, w.x, w.z, 5, 55),          // 5 waterfall
      V(hl.x - 3, hl.z + 9, 1.7, hl.x, hl.z, 3),           // 6 hall front, incense burner
      V(g.x - 30, g.z + 30, 12, hl.x, hl.z, 6, 45),        // 7 approach from the ridge path
    ];
  },
};

export default async function (canvas: HTMLCanvasElement, params: URLSearchParams) {
  const id = (params.get('id') ?? 'mountain') as RegionId;
  const viewI = Number(params.get('view') ?? 0);
  const night = params.get('night') === '1';
  const dpr = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const fogC = night ? '#65707f' : '#efe9dc';
  scene.background = new THREE.Color(night ? '#39424f' : '#ece5d6');
  scene.fog = new THREE.Fog(fogC, 24, 170);
  const hemi = new THREE.HemisphereLight(night ? '#cfd8e8' : '#fbf8f1', night ? '#8f98a8' : '#b0a898', night ? 2.75 : 2.25);
  const sun = new THREE.DirectionalLight(night ? '#e2e9f6' : '#fff8ec', night ? 0.8 : 1.25);
  sun.position.set(30, 40, 22);
  scene.add(hemi, sun);
  const views = VIEWS[id]?.() ?? VIEWS.mountain();
  const view = views[Math.max(0, Math.min(views.length - 1, viewI))];
  const camera = new THREE.PerspectiveCamera(view.fov ?? 50, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(...view.eye);
  camera.lookAt(...view.at);

  // terrain & water around the region
  const R = REGION[id] ?? REGION.mountain;
  const S = 150, N = 150;
  const tg = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2).translate(R.center.x, 0, R.center.z);
  const wg = tg.clone();
  const tp = tg.attributes.position as THREE.BufferAttribute, wp = wg.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(tp.count * 3);
  const grass = new THREE.Color('#d9d3bf'), dark = new THREE.Color('#b9b39c');
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const y = groundY(x, z);
    tp.setY(i, y);
    const w = waterAt(x, z);
    wp.setY(i, w ?? y - 3);
    const c = grass.clone().lerp(dark, 0.5 + 0.5 * noise(x * 0.08, z * 0.08));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));
  scene.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: '#9fb0b0', transparent: true, opacity: 0.85 })));
  // a person for scale at the view's target
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 8), new THREE.MeshLambertMaterial({ color: '#3b3a38' }));
  const tx = view.at[0], tz = view.at[2];
  person.position.set(tx + 1.5, groundY(tx + 1.5, tz) + 0.82, tz);
  if (params.get('person') !== '0') scene.add(person);

  const groups = new Map<RegionId, THREE.Group>();
  const frames = new Set<(dt: number, t: number) => void>();
  const interactables: string[] = [];
  let colliders = 0, occluders = 0;
  const env = { season: (params.get('season') ?? 'spring') as 'spring', tod: night ? 'night' as const : 'day' as const, hour: night ? 22 : 11, moonPhase: 0.5, termIndex: 3, clarity: 0.8, seed: 7, date: new Date(2026, 2, 10), festivals: [] };
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const ctx = {
    THREE, scene, camera, renderer,
    groundY, waterAt,
    isWalkable: (x: number, z: number) => waterAt(x, z) === null,
    pond: { center: v3(0, 0, 0), radiusX: 9, radiusZ: 6, waterY: -0.3 },
    bounds: { radius: 175 },
    player: { position: v3(tx, groundY(tx, tz), tz), heading: 0, character: 'scholar', emote() {}, teleport() {}, freeze() {}, ride() {} },
    env,
    addInteractable: (i: { id: string }) => { interactables.push(i.id); return () => {}; },
    addCollider: () => { colliders++; return () => {}; },
    addOccluder: () => { occluders++; return () => {}; },
    hud: { toast() {}, mount: () => () => {}, say: async () => -1, setCounter() {}, showCard() {} },
    audio: { unlock: async () => {}, setEnabled() {}, setVolume() {}, pluck() {}, chime() {}, bell() {}, knock() {}, setAmbient() {}, stats: () => ({}) },
    rng: makeRng(7),
    onFrame: (fn: (dt: number, t: number) => void) => { frames.add(fn); return () => frames.delete(fn); },
    sky: { setMoon() {}, isNight: () => night, forceNight() {} },
    palette: PIGMENTS,
    lang: 'zh',
    input: { x: 0, y: 0, run: false, actionPressed: false },
    currentRegion: () => id,
    onRegion: () => () => {},
    regionGroup: (rid: RegionId) => {
      let g = groups.get(rid);
      if (!g) { g = new THREE.Group(); g.name = 'rg:' + rid; scene.add(g); groups.set(rid, g); }
      return g;
    },
    anchor: (p: XZ) => v3(p.x, waterAt(p.x, p.z) ?? groundY(p.x, p.z), p.z),
    music: { setTheme() {} },
  } as unknown as WorldCtx;

  const mods = params.get('all') === '1' ? Object.values(MODULES) : [MODULES[id] ?? mountainRegion];
  const t0 = performance.now();
  for (const m of mods) await m.build(ctx);
  const buildMs = performance.now() - t0;

  let last = performance.now();
  let t = Number(params.get('t') ?? 3);
  const tick = (dt: number) => {
    t += dt;
    for (const f of frames) f(dt, t);
    renderer.render(scene, camera);
  };
  tick(1);
  for (let i = 0; i < 3; i++) tick(1 / 30);
  const info = renderer.info.render;
  const st = [...groups.values()].map((g) => ({ name: g.name, ...stats(g) }));
  const msg = `${id} view ${viewI} · build ${buildMs.toFixed(0)} ms · frame draws ${info.calls} tris ${info.triangles} · ${st.map((s) => `${s.name}: ${s.draws} draws ${s.tris} tris`).join(' · ')} · colliders ${colliders} occluders ${occluders} · interact ${interactables.join(',')}`;
  console.log(msg);
  if (params.get('stats') !== '0') {
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;left:8px;bottom:6px;font:12px system-ui;color:#333;background:rgba(255,255,255,.6);padding:2px 6px">${msg}</div>`);
  }
  if (params.get('animate') === '1') {
    const loop = () => { const now = performance.now(); tick(Math.min(0.05, (now - last) / 1000)); last = now;; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
