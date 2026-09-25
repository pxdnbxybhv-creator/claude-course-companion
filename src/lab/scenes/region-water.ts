// /lab.html?scene=region-water&id=village&view=0[&night=1][&cam=x,y,z,tx,ty,tz][&stats=1][&colliders=1]
// A stand-alone bench for the 水乡 (village) and 荷塘 (lake) regions: a fake WorldCtx over simple
// terrain (flat land, a carved river channel and lake basin, flat water planes where map.ts puts
// them), a paper-fog sky, and fixed viewpoints — so the scenery can be iterated on without the core.
import * as THREE from 'three';
import type { Collider, Interactable, Occluder, WorldCtx } from '../../views/walk/types';
import { LAKE, REGIONS, RIVER, RIVER_LAKE_BREAK, type RegionId, type XZ } from '../../views/walk/map';
import { makeNoise2, makeRng } from '../../core/rng';
import { PIGMENTS } from '../../ink/types';
import { village } from '../../views/walk/regions/village';
import { lake } from '../../views/walk/regions/lake';

const RIVER_Y = -0.55;

function segDist(px: number, pz: number, a: XZ, b: XZ): { d: number; t: number } {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L2));
  return { d: Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t)), t };
}

/** Distance to the river centreline and the half-width there (the lake gap excluded). */
function river(x: number, z: number): { d: number; w: number } {
  let best = { d: Infinity, w: 4 };
  for (let i = 1; i < RIVER.length; i++) {
    if (i === RIVER_LAKE_BREAK) continue;
    const a = RIVER[i - 1], b = RIVER[i];
    const s = segDist(x, z, a, b);
    if (s.d < best.d) best = { d: s.d, w: a.w + (b.w - a.w) * s.t };
  }
  return best;
}

const lakeQ = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
const ss = (e0: number, e1: number, v: number) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const VIEWS: Record<string, number[][]> = {
  village: [
    [48, 46, 128, 0, 0, 76],
    [-1.5, 5.8, 54, 0, 2, 80],
    [-40, 3.2, 70.5, 0, 2, 66],
    [-4, 2.6, 86, 17, 3.2, 88],
    [-2, 2.4, 95, 24, 2.2, 97],
    [-1.4, 2.4, 40, -1, 3.5, 62],
    [0.01, 150, 80, 0, 0, 80],
    [-14, 2.2, 78, -22, 0, 69],
    [26, 3, 56, 0, 2, 70],
  ],
  lake: [
    [52, 42, 66, 92, 0, 14],
    [64.5, 2.3, 33.5, 92, 0.5, 14],
    [98, 4, 22, 116, 2, 6],
    [80, 1.6, 26, 63, 2, 42],
    [74, 1.7, 36, 90, 0, 22],
    [92.01, 150, 14, 92, 0, 14],
    [134, 3, 0, 114, 2, 7],
    [86, 5, 36, 97, 2, 17],
  ],
};

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const id = (p.get('id') ?? 'village') as RegionId;
  const night = p.get('night') === '1';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const fogC = night ? '#65707f' : '#efe9dc';
  scene.background = new THREE.Color(night ? '#3a4454' : '#ece5d6');
  scene.fog = new THREE.Fog(fogC, 20, Number(p.get('fog') ?? 140));
  const hemi = new THREE.HemisphereLight(night ? '#cfd8e8' : '#fbf8f1', night ? '#8f98a8' : '#b0a898', night ? 2.2 : 2.25);
  const sun = new THREE.DirectionalLight(night ? '#e2e9f6' : '#fff8ec', night ? 0.7 : 1.25);
  sun.position.set(40, 60, 30);
  scene.add(hemi, sun);

  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 600);
  const views = VIEWS[id] ?? VIEWS.village;
  const v = p.get('cam')?.split(',').map(Number) ?? views[Math.min(views.length - 1, Number(p.get('view') ?? 0))];
  camera.position.set(v[0], v[1], v[2]);
  camera.lookAt(v[3], v[4], v[5]);

  // --- fake terrain
  const noise = makeNoise2(77);
  const groundY = (x: number, z: number): number => {
    let y = 0.1 * noise(x * 0.06, z * 0.06);
    const lq = lakeQ(x, z);
    y += -0.35 * ss(1.8, 1.1, lq);
    y = y + (LAKE.waterY - 1.2 - y) * ss(1.12, 0.92, lq);
    const r = river(x, z);
    y = y + (RIVER_Y - 1.1 - y) * ss(r.w + 1.2, r.w - 0.6, r.d);
    return y;
  };
  const waterAt = (x: number, z: number): number | null => {
    if (lakeQ(x, z) < 1.0) return LAKE.waterY;
    const r = river(x, z);
    if (r.d < r.w) return RIVER_Y;
    return null;
  };

  // ground mesh around the region
  const spec = REGIONS.find((r) => r.id === id)!;
  const S = spec.radius * 3.2, N = 200;
  const gg = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const gp = gg.attributes.position as THREE.BufferAttribute;
  const gc = new Float32Array(gp.count * 3);
  const cBase = new THREE.Color('#e4dccb'), cGrass = new THREE.Color('#c9c7ae'), cMud = new THREE.Color('#a79f8c');
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i) + spec.center.x, z = gp.getZ(i) + spec.center.z;
    const y = groundY(x, z);
    gp.setXYZ(i, x, y, z);
    const c = cBase.clone().lerp(cGrass, 0.5 + 0.5 * noise(x * 0.1, z * 0.1)).lerp(cMud, ss(-0.2, -0.9, y));
    gc.set([c.r, c.g, c.b], i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true })));

  // water: the lake ellipse and a river ribbon
  const waterMat = new THREE.MeshLambertMaterial({ color: night ? '#7d8795' : '#cfd3c9', transparent: true, opacity: 0.92 });
  const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), waterMat);
  lakeMesh.scale.set(LAKE.rx, 1, LAKE.rz);
  lakeMesh.position.set(LAKE.x, LAKE.waterY, LAKE.z);
  scene.add(lakeMesh);
  const rp: number[] = [];
  for (let i = 1; i < RIVER.length; i++) {
    if (i === RIVER_LAKE_BREAK) continue;
    const a = RIVER[i - 1], b = RIVER[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
    const ew = 1.8;
    const A = [a.x + nx * (a.w + ew), a.z + nz * (a.w + ew)], B = [a.x - nx * (a.w + ew), a.z - nz * (a.w + ew)];
    const C = [b.x + nx * (b.w + ew), b.z + nz * (b.w + ew)], D = [b.x - nx * (b.w + ew), b.z - nz * (b.w + ew)];
    rp.push(A[0], RIVER_Y, A[1], B[0], RIVER_Y, B[1], C[0], RIVER_Y, C[1], B[0], RIVER_Y, B[1], D[0], RIVER_Y, D[1], C[0], RIVER_Y, C[1]);
    // round joints
    const j = new THREE.Mesh(new THREE.CircleGeometry(b.w + ew, 24).rotateX(-Math.PI / 2), waterMat);
    j.position.set(b.x, RIVER_Y, b.z);
    scene.add(j);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.computeVertexNormals();
  scene.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: waterMat.color, transparent: true, opacity: 0.92, side: THREE.DoubleSide })));

  // --- fake ctx
  const frames: ((dt: number, t: number) => void)[] = [];
  const colliders: Collider[] = [], occluders: Occluder[] = [], interactables: Interactable[] = [];
  const groups = new Map<RegionId, THREE.Group>();
  const noop = () => {};
  const player = {
    position: new THREE.Vector3(), heading: 0, character: 'scholar',
    emote: noop, teleport: noop, freeze: noop, ride: noop,
  };
  const ctx = {
    THREE, scene, camera, renderer,
    groundY, waterAt,
    isWalkable: (x: number, z: number) => waterAt(x, z) === null,
    pond: { center: new THREE.Vector3(), radiusX: 10, radiusZ: 7, waterY: -0.3 },
    bounds: { radius: 175 },
    player,
    env: { season: 'summer', tod: night ? 'night' : 'day', hour: night ? 22 : 10, moonPhase: 0.5, termIndex: 10, clarity: 0.9, seed: 1, date: new Date(2026, 6, 1), festivals: [] },
    addInteractable: (i: Interactable) => { interactables.push(i); return noop; },
    addCollider: (c: Collider) => { colliders.push(c); return noop; },
    addOccluder: (o: Occluder) => { occluders.push(o); return noop; },
    hud: { toast: noop, mount: () => noop, say: async () => -1, setCounter: noop, showCard: noop },
    audio: {},
    rng: makeRng(1),
    onFrame: (fn: (dt: number, t: number) => void) => { frames.push(fn); return noop; },
    sky: { setMoon: noop, isNight: () => night, forceNight: noop },
    palette: PIGMENTS,
    lang: 'zh',
    input: { x: 0, y: 0, run: false, actionPressed: false },
    currentRegion: () => id,
    onRegion: () => noop,
    regionGroup: (rid: RegionId) => {
      let g = groups.get(rid);
      if (!g) { g = new THREE.Group(); g.name = 'region:' + rid; scene.add(g); groups.set(rid, g); }
      return g;
    },
    anchor: (a: XZ) => new THREE.Vector3(a.x, waterAt(a.x, a.z) ?? groundY(a.x, a.z), a.z),
    music: { setTheme: noop },
  } as unknown as WorldCtx;

  const t0 = performance.now();
  const mods = p.get('both') === '1' ? [village, lake] : [id === 'lake' ? lake : village];
  for (const m of mods) await m.build(ctx);
  const buildMs = performance.now() - t0;

  if (p.get('colliders') === '1') {
    const cm = new THREE.MeshBasicMaterial({ color: '#c0412f', wireframe: true });
    for (const c of colliders) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.h ?? 1, 12), cm);
      m.position.set(c.x, groundY(c.x, c.z) + (c.h ?? 1) / 2, c.z);
      scene.add(m);
    }
    const am = new THREE.MeshBasicMaterial({ color: '#3d5a73' });
    for (const i of interactables) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3), am);
      m.position.copy(i.position);
      scene.add(m);
    }
  }

  // --- stats for the region group(s)
  const stat = (g: THREE.Object3D) => {
    let calls = 0, tris = 0, lines = 0;
    g.traverse((o) => {
      if (!o.visible) return;
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      const geo = m.geometry as THREE.BufferGeometry;
      const n = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
      const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
      calls++;
      if ((o as THREE.LineSegments).isLineSegments) lines += n / 2;
      else if ((o as THREE.Points).isPoints) tris += 0;
      else tris += (n / 3) * inst;
    });
    return { calls, tris: Math.round(tris), lines: Math.round(lines) };
  };

  let last = performance.now();
  const start = last;
  let frame = 0;
  const info = document.createElement('div');
  info.style.cssText = 'position:fixed;left:8px;bottom:6px;font:12px/1.4 system-ui;color:#333;background:rgba(255,255,255,.6);padding:2px 6px';
  document.body.appendChild(info);
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;
    for (const f of frames) f(dt, t);
    renderer.render(scene, camera);
    frame++;
    if (frame === 3 || frame % 60 === 0) {
      const parts = [...groups.entries()].map(([k, g]) => { const s = stat(g); return `${k}: ${s.calls} draws · ${s.tris} tris · ${s.lines} line segs`; });
      info.textContent = `${parts.join(' | ')} · build ${Math.round(buildMs)} ms · frame calls ${renderer.info.render.calls} · colliders ${colliders.length} · interact ${interactables.length}`;
    }
    requestAnimationFrame(loop);
  };
  loop();
  await new Promise((r) => setTimeout(r, 200));
}
