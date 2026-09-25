// 竹林 · the bamboo grove — 独坐幽篁里，弹琴复长啸。深林人不知，明月来相照。
// Hundreds of tall jointed culms (one instanced draw; nodes are drawn in the shader, the rim inks
// their silhouettes), painted leaf sprays (个 / 介) swaying with a travelling gust, light shafts
// slanting through the canopy, dust motes, a winding stepping-stone path, the clearing with a stone
// go table, the thatched 竹里馆 and a tiny earth-god shrine.
import type * as T from 'three';
import type { RegionModule, WorldCtx } from '../types';
import { ANCHORS, REGION, type XZ } from '../map';
import { makeNoise2, makeRng } from '../../../core/rng';
import { rasterize } from '../../../ink/brush';
import { segmentDeck } from './water-decks';
import {
  Batch, COL, Hill, mistCards, Painter, TAU, canvas, clamp, glowCanvas, hipRoof, lit, pathDist, particles, place, plaqueCanvas,
  polyDist, puffCanvas, rockGeometry, steppingStones, three, windCards, windProject, wind,
} from './hill-kit';

const R = REGION.bamboo;
const CLEAR = ANCHORS.bambooClearing;
const SHRINE = ANCHORS.bambooShrine;
const HUT = { x: -69.5, z: 40.5, ry: -0.5 };
/** Half width / depth of the hut's floor frame; the open front faces local +z. */
const HUT_W = 1.9, HUT_D = 1.5;
/** A point in the hut's own frame (x across, z toward the open front) in world coordinates. */
const hutAt = (lx: number, lz: number): XZ => ({
  x: HUT.x + lx * Math.cos(HUT.ry) + lz * Math.sin(HUT.ry),
  z: HUT.z - lx * Math.sin(HUT.ry) + lz * Math.cos(HUT.ry),
});

/** Winding stone paths inside the grove (the world's PATHS are laid by the core). */
const TRAILS: XZ[][] = [
  wind([{ x: CLEAR.x - 3.5, z: CLEAR.z + 3 }, { x: -89, z: 34.5 }, { x: -91.5, z: 36 }, { x: SHRINE.x + 2.2, z: SHRINE.z - 1.8 }], 0.7),
  // round the hut's west corner to the stone step at its open front
  wind([{ x: CLEAR.x + 3.2, z: CLEAR.z + 3.4 }, { x: -76.5, z: 35 }, { x: -73.5, z: 36.5 }, hutAt(-3.3, 0.9), hutAt(-0.9, HUT_D + 1.75)], 0.7),
  wind([{ x: CLEAR.x - 0.5, z: CLEAR.z - 4.5 }, { x: -85.5, z: 19.5 }, { x: -82.5, z: 15 }, { x: -84, z: 10.5 }], 0.7),
];

// ───────────────────────────── paintings ─────────────────────────────

/** Four sprays of bamboo leaves in a 2×2 atlas, painted in greys so the instance colour tints them. */
function leafAtlas(): { c: HTMLCanvasElement } {
  const S = 256;
  const c = canvas(S * 2, S * 2);
  const g = c.getContext('2d')!;
  for (let cell = 0; cell < 4; cell++) {
    const rng = makeRng(900 + cell * 17);
    const p = new Painter(rng);
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    // twig: a thin zig-zag across the card
    const tw: [number, number][] = [];
    let x = S * 0.12, y = S * (0.3 + rng() * 0.2);
    for (let i = 0; i < 5; i++) { tw.push([x, y]); x += S * 0.18; y += (rng() - 0.4) * S * 0.12; }
    p.stroke(tw, 3.2, 1.2, 0.8, { color: '#6a6a6a' });
    // leaf groups hanging from the twig: 个 (3) and 介 (4), fanned and drooping
    const groups = 4 + Math.floor(rng() * 2);
    for (let k = 0; k < groups; k++) {
      const [bx, by] = tw[Math.min(tw.length - 1, 1 + Math.floor(rng() * (tw.length - 1)))];
      const n = rng() < 0.5 ? 3 : 4;
      const baseA = Math.PI / 2 + (rng() - 0.5) * 1.6; // pointing mostly down (canvas y down)
      for (let j = 0; j < n; j++) {
        const a = baseA + (j - (n - 1) / 2) * (0.42 + rng() * 0.18);
        const len = S * (0.26 + rng() * 0.16);
        const shade = rng();
        const col = shade < 0.35 ? '#8c8c8c' : shade < 0.75 ? '#c4c4c4' : '#f2f2f2';
        p.leaf(bx + (rng() - 0.5) * 8, by + (rng() - 0.5) * 6, a, len, S * (0.045 + rng() * 0.02), 0.95, { color: col });
      }
    }
    g.save();
    g.translate(ox, oy);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    g.drawImage(rasterize(p.drawing(S, S, 0, 0), 1, 1), 0, 0);
    g.restore();
  }
  return { c };
}

/** Fallen leaves: pale ochre and ink slivers scattered on the ground. */
function litterCanvas(): HTMLCanvasElement {
  const S = 256;
  const rng = makeRng(313);
  const p = new Painter(rng);
  for (let i = 0; i < 26; i++) {
    const x = S * (0.1 + rng() * 0.8), y = S * (0.1 + rng() * 0.8);
    const a = rng() * TAU;
    const col = rng() < 0.6 ? '#b8964f' : rng() < 0.5 ? '#76694e' : '#8c9a62';
    p.leaf(x, y, a, S * (0.1 + rng() * 0.06), S * 0.022, 0.55 + rng() * 0.3, { color: col });
  }
  return rasterize(p.drawing(S, S, 0, 0), 1, 1);
}

/** Ink grass and fern tufts. */
function tuftCanvas(): HTMLCanvasElement {
  const W = 128, H = 128;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(77);
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.9;
    const len = 40 + r() * 80;
    const x0 = W / 2 + (r() - 0.5) * 20;
    const bend = (r() - 0.5) * 0.9;
    for (let s = 0; s < 10; s++) {
      const t0 = s / 10, t1 = (s + 1) / 10;
      const pt = (t: number) => [x0 + Math.cos(a + bend * t * t) * len * t, H - 2 + Math.sin(a + bend * t * t) * len * t];
      const [ax, ay] = pt(t0), [bx, by] = pt(t1);
      g.strokeStyle = `rgba(52,60,50,${0.75 - t0 * 0.4})`;
      g.lineWidth = 3.4 * (1 - t0) + 0.5;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  return c;
}

/** A light shaft: soft vertical beam fading at both ends and edges. */
function shaftCanvas(): HTMLCanvasElement {
  const W = 64, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), v = y / (H - 1);
      const edge = Math.pow(Math.sin(Math.PI * u), 2.2);
      const len = Math.pow(Math.sin(Math.PI * clamp(v * 1.05, 0, 1)), 0.8) * (0.55 + 0.45 * (1 - v));
      const a = edge * len;
      const i = (y * W + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 250; img.data[i + 2] = 232; img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The go board: a 19-line grid with a game in progress (a few dozen stones). */
function goCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  g.fillStyle = '#c2b493';
  g.fillRect(0, 0, S, S);
  const m = 16, step = (S - m * 2) / 18;
  g.strokeStyle = 'rgba(40,36,30,0.75)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 19; i++) {
    g.beginPath(); g.moveTo(m, m + i * step); g.lineTo(S - m, m + i * step); g.stroke();
    g.beginPath(); g.moveTo(m + i * step, m); g.lineTo(m + i * step, S - m); g.stroke();
  }
  g.fillStyle = 'rgba(40,36,30,0.9)';
  for (const [i, j] of [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]]) {
    g.beginPath(); g.arc(m + i * step, m + j * step, 2.4, 0, TAU); g.fill();
  }
  return c;
}

// ───────────────────────────── build ─────────────────────────────

let hill: Hill | null = null;

function build(ctx: WorldCtx): void {
  hill?.dispose();
  const h = (hill = new Hill(ctx, 'bamboo'));
  const THREE = three();
  const rng = makeRng(20260925);
  const noise = makeNoise2(515);
  const b = new Batch();
  const baseY = h.y(CLEAR.x, CLEAR.z);

  const trailDist = (x: number, z: number) => Math.min(...TRAILS.map((t) => polyDist(t, x, z)));
  const openness = (x: number, z: number) => {
    // 0 deep in the grove … 1 on a path / in the clearing
    const dc = Math.hypot(x - CLEAR.x, z - CLEAR.z);
    return Math.max(clamp((8 - dc) / 3, 0, 1), clamp((3 - pathDist(x, z)) / 1.5, 0, 1), clamp((2.4 - trailDist(x, z)) / 1.2, 0, 1));
  };
  const blocked = (x: number, z: number, pad = 0) =>
    Math.hypot(x - CLEAR.x, z - CLEAR.z) < 7.2 + pad ||
    Math.hypot(x - SHRINE.x, z - SHRINE.z) < 3.4 + pad ||
    Math.hypot(x - HUT.x, z - HUT.z) < 4.6 + pad ||
    pathDist(x, z) < 2.3 + pad ||
    trailDist(x, z) < 1.3 + pad ||
    ctx.waterAt(x, z) !== null;

  // ── culms ───────────────────────────────────────────────────────────
  type Culm = { x: number; z: number; y: number; H: number; r: number; lean: number; dir: number; tone: number };
  const culms: Culm[] = [];
  const target = 520;
  for (let tries = 0; tries < 9000 && culms.length < target; tries++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (R.radius + 4);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (blocked(x, z)) continue;
    // clumps and gaps (疏密): noise-driven density, thinning at the rim of the region
    const dens = 0.55 + 0.6 * noise.fbm(x * 0.09, z * 0.09, 2) - clamp((d - R.radius + 6) / 10, 0, 0.7);
    if (rng() > dens) continue;
    if (culms.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 0.36)) continue;
    // lean toward the open (paths, clearing) so the grove arches over them
    let best = Infinity, dir = rng() * TAU;
    for (let k = 0; k < 8; k++) {
      const aa = (k / 8) * TAU;
      const px = x + Math.cos(aa) * 4, pz = z + Math.sin(aa) * 4;
      const o = pathDist(px, pz) + trailDist(px, pz) * 0.6 + Math.hypot(px - CLEAR.x, pz - CLEAR.z) * 0.12;
      if (o < best) { best = o; dir = aa; }
    }
    const near = openness(x + Math.cos(dir) * 3, z + Math.sin(dir) * 3);
    const H = 8 + rng() * 6.5 + noise(x * 0.05, z * 0.05) * 2;
    culms.push({
      x, z, y: h.y(x, z), H, r: 0.045 + rng() * 0.05 + (H - 8) * 0.004,
      lean: 0.03 + rng() * 0.07 + near * 0.12, dir: dir + (rng() - 0.5) * 0.6, tone: rng(),
    });
  }
  // a few young culms (新篁) right at the edges of paths
  const culmGeo = new THREE.CylinderGeometry(0.62, 1, 1, 6, 5, true).translate(0, 0.5, 0);
  const culmMat = h.toon('#ffffff', { rim: 0.72 });
  const rimCompile = culmMat.onBeforeCompile;
  culmMat.onBeforeCompile = (sh, r) => {
    rimCompile.call(culmMat, sh, r);
    sh.uniforms.uTime = h.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vCy; varying float vNodes;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCy = position.y;
        #ifdef USE_INSTANCING
          float cH = length(instanceMatrix[1].xyz);
          vec3 cp = instanceMatrix[3].xyz;
        #else
          float cH = 10.0; vec3 cp = vec3(0.0);
        #endif
        vNodes = cH / (0.36 + 0.14 * fract(sin(dot(cp.xz, vec2(12.9898, 78.233))) * 43758.5453));`)
      .replace('#include <project_vertex>', windProject(h.reduced ? 0 : 0.5, baseY, 13));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCy; varying float vNodes;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float f = fract(vCy * vNodes);
          float dnode = min(f, 1.0 - f) / max(vNodes, 1.0) * 30.0;
          float node = 1.0 - smoothstep(0.012, 0.05, dnode);
          float halo = smoothstep(0.03, 0.06, f) * (1.0 - smoothstep(0.06, 0.16, f));
          diffuseColor.rgb *= mix(1.0, 0.28, node) * (1.0 + 0.16 * halo);
          diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.25, vCy));
        }`);
  };
  culmMat.customProgramCacheKey = () => 'hill-culm';
  const culmMesh = new THREE.InstancedMesh(culmGeo, culmMat, culms.length);
  culmMesh.name = 'bamboo:culms';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), ax = new THREE.Vector3();
  const tones = ['#2f4a3a', '#46684a', '#5f8a5a', '#7ea66a', '#9cb97c', '#b8b176'].map((c) => new THREE.Color(c));
  const tipOf: T.Vector3[] = [];
  culms.forEach((c, i) => {
    const dx = Math.cos(c.dir), dz = Math.sin(c.dir);
    ax.set(dz, 0, -dx).normalize();
    q.setFromAxisAngle(ax, c.lean);
    p3.set(c.x, c.y - 0.15, c.z);
    s3.set(c.r, c.H, c.r);
    culmMesh.setMatrixAt(i, m4.compose(p3, q, s3));
    // tone: darker, inkier near the eye line of paths; paler deep and far (air between culms)
    const open = openness(c.x, c.z);
    let k = clamp(Math.floor(clamp(c.tone * 0.75 + (1 - open) * 0.3 - 0.05, 0, 0.999) * 5), 0, 4);
    if (c.tone > 0.965) k = 5; // an old dry culm here and there
    culmMesh.setColorAt(i, tones[k]);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    tipOf.push(new THREE.Vector3(c.x, c.y, c.z).addScaledVector(up, c.H));
  });
  // colliders: one per clump (2.4 m cells) rather than one per culm
  const cells = new Map<string, { x: number; z: number; n: number; r: number }>();
  for (const c of culms) {
    const key = `${Math.floor(c.x / 2.4)},${Math.floor(c.z / 2.4)}`;
    const cell = cells.get(key) ?? { x: 0, z: 0, n: 0, r: 0 };
    cell.x += c.x; cell.z += c.z; cell.n++;
    cells.set(key, cell);
  }
  for (const cell of cells.values()) {
    const x = cell.x / cell.n, z = cell.z / cell.n;
    let r = 0.3;
    for (const c of culms) if (Math.abs(c.x - x) < 2.4 && Math.abs(c.z - z) < 2.4) r = Math.max(r, Math.min(1.3, Math.hypot(c.x - x, c.z - z) + 0.2));
    if (blocked(x, z, -0.3 - r)) r = 0.3; // never close a walkway
    h.collide({ x, z, r: cell.n > 1 ? r : 0.3, h: 10 });
  }
  culmMesh.instanceMatrix.needsUpdate = true;
  if (culmMesh.instanceColor) culmMesh.instanceColor.needsUpdate = true;
  culmMesh.computeBoundingSphere();
  h.add(culmMesh);

  // ── leaf sprays ────────────────────────────────────────────────────
  const { c: atlasC } = leafAtlas();
  const leafTex = h.tex(atlasC);
  const leafMat = windCards(h, leafTex, { amp: 0.5, baseY, span: 13, atlas: true, alphaTest: 0.38, key: 'bamboo-leaf' });
  const cards: { p: T.Vector3; s: number; ry: number; rx: number; rz: number; tone: number; cell: [number, number] }[] = [];
  culms.forEach((c, i) => {
    const tip = tipOf[i];
    const base = new THREE.Vector3(c.x, c.y, c.z);
    const n = 5 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const t = 0.45 + Math.sqrt(rng()) * 0.55;
      const at = base.clone().lerp(tip, t);
      const side = rng() * TAU;
      const off = 0.25 + rng() * 0.8;
      at.x += Math.cos(side) * off + Math.cos(c.dir) * t * 0.6;
      at.z += Math.sin(side) * off + Math.sin(c.dir) * t * 0.6;
      cards.push({ p: at, s: 1.2 + rng() * 1.2 + t * 0.8, ry: rng() * TAU, rx: (rng() - 0.5) * 0.8, rz: (rng() - 0.5) * 0.5, tone: rng(), cell: [rng() < 0.5 ? 0 : 1, rng() < 0.5 ? 0 : 1] });
    }
    // understory sprays at eye level on some culms (the grove closes in around the walker)
    if (rng() < 0.35) {
      const t = 0.12 + rng() * 0.22;
      const at = base.clone().lerp(tip, t);
      at.x += (rng() - 0.5) * 0.8; at.z += (rng() - 0.5) * 0.8;
      if (!blocked(at.x, at.z, -0.6)) cards.push({ p: at, s: 1.0 + rng() * 0.7, ry: rng() * TAU, rx: (rng() - 0.5) * 0.6, rz: (rng() - 0.5) * 0.4, tone: rng() * 0.5, cell: [rng() < 0.5 ? 0 : 1, rng() < 0.5 ? 0 : 1] });
    }
  });
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(cards.length * 2), 2);
  cardGeo.setAttribute('aCell', cellAttr);
  const leaves = new THREE.InstancedMesh(cardGeo, leafMat, cards.length);
  leaves.name = 'bamboo:leaves';
  const leafTones = ['#2a4434', '#3f6444', '#588454', '#7aa26a', '#9dbb84'].map((c) => new THREE.Color(c));
  const e = new THREE.Euler();
  cards.forEach((cd, i) => {
    e.set(cd.rx, cd.ry, cd.rz, 'YXZ');
    q.setFromEuler(e);
    s3.set(cd.s, cd.s * 0.9, cd.s);
    leaves.setMatrixAt(i, m4.compose(cd.p, q, s3));
    // higher = paler (air), low = darker ink
    const hk = clamp((cd.p.y - baseY) / 14, 0, 1);
    const k = clamp(Math.floor((cd.tone * 0.55 + hk * 0.5) * leafTones.length), 0, leafTones.length - 1);
    leaves.setColorAt(i, leafTones[k]);
    cellAttr.setXY(i, cd.cell[0], cd.cell[1]);
  });
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.computeBoundingSphere();
  h.add(leaves);
  lit(h, leafMat);

  // ── ground: litter and tufts ──────────────────────────────────────
  const litterTex = h.tex(litterCanvas());
  const litterMat = h.own(new THREE.MeshBasicMaterial({ map: litterTex, alphaTest: 0.3, transparent: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const litterSpots: [number, number][] = [];
  for (let i = 0; i < 1400 && litterSpots.length < 420; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * R.radius;
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (ctx.waterAt(x, z) !== null || pathDist(x, z) < 1.4) continue;
    litterSpots.push([x, z]);
  }
  const litterGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const litter = new THREE.InstancedMesh(litterGeo, litterMat, litterSpots.length);
  litter.name = 'bamboo:litter';
  litterSpots.forEach(([x, z], i) => {
    const s = 1.4 + rng() * 1.8;
    e.set(0, rng() * TAU, 0); q.setFromEuler(e);
    p3.set(x, h.y(x, z) + 0.03, z); s3.set(s, 1, s);
    litter.setMatrixAt(i, m4.compose(p3, q, s3));
  });
  litter.instanceMatrix.needsUpdate = true;
  litter.computeBoundingSphere();
  litter.renderOrder = -1;
  h.add(litter);
  lit(h, litterMat);

  const tuftTex = h.tex(tuftCanvas());
  const tuftMat = windCards(h, tuftTex, { amp: 0.12, baseY: baseY - 2, span: 4, alphaTest: 0.35, key: 'bamboo-tuft' });
  const tuftGeo = new THREE.PlaneGeometry(0.7, 0.5).translate(0, 0.25, 0);
  const tg2 = tuftGeo.clone().rotateY(Math.PI / 2);
  const tuftX = mergeCross(THREE, tuftGeo, tg2);
  const tuftSpots: [number, number][] = [];
  for (let i = 0; i < 900 && tuftSpots.length < 260; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * R.radius;
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (ctx.waterAt(x, z) !== null || pathDist(x, z) < 1.2 || trailDist(x, z) < 0.6 || Math.hypot(x - CLEAR.x, z - CLEAR.z) < 4) continue;
    tuftSpots.push([x, z]);
  }
  const tufts = new THREE.InstancedMesh(tuftX, tuftMat, tuftSpots.length);
  tufts.name = 'bamboo:tufts';
  tuftSpots.forEach(([x, z], i) => {
    const s = 0.7 + rng() * 0.8;
    e.set(0, rng() * TAU, 0); q.setFromEuler(e);
    p3.set(x, h.y(x, z) - 0.02, z); s3.set(s, s, s);
    tufts.setMatrixAt(i, m4.compose(p3, q, s3));
  });
  tufts.instanceMatrix.needsUpdate = true;
  tufts.computeBoundingSphere();
  h.add(tufts);
  lit(h, tuftMat);

  // ── the winding stone paths ───────────────────────────────────────
  TRAILS.forEach((t, i) => steppingStones(b, h, t, { gap: 0.72, w: 0.56, seed: 40 + i, color: '#b4a98f' }));

  // ── the clearing: stone table with a go board, four drum stools, a qin on its stand ──
  const cy = h.y(CLEAR.x, CLEAR.z);
  const tableTop = cy + 0.78;
  b.add(place(new THREE.CylinderGeometry(0.28, 0.4, 0.66, 8), CLEAR.x, cy + 0.33, CLEAR.z), COL.stoneMid, { edge: 40, jitter: 0.05 });
  b.add(place(new THREE.BoxGeometry(1.05, 0.12, 1.05), CLEAR.x, tableTop - 0.06, CLEAR.z, 0.3), COL.stone, { edge: 30, jitter: 0.04 });
  for (let i = 0; i < 4; i++) {
    const a = 0.3 + (i / 4) * TAU + Math.PI / 4;
    const sx = CLEAR.x + Math.cos(a) * 1.05, sz = CLEAR.z + Math.sin(a) * 1.05;
    const sy = h.y(sx, sz);
    b.add(place(new THREE.CylinderGeometry(0.2, 0.17, 0.44, 10), sx, sy + 0.22, sz), COL.stoneWarm, { hull: true, jitter: 0.06, seed: i + 3 });
  }
  // a game in progress: black and white stones, two jars
  const goGeo = () => new THREE.SphereGeometry(0.022, 6, 3);
  const goRng = makeRng(19);
  const cellS = 0.92 / 18;
  for (let i = 0; i < 34; i++) {
    const gx = goRng.int(2, 16), gz = goRng.int(2, 16);
    const lx = (gx - 9) * cellS, lz = (gz - 9) * cellS;
    const c = Math.cos(0.3), s = Math.sin(0.3);
    b.add(place(goGeo(), CLEAR.x + lx * c + lz * s, tableTop + 0.006, CLEAR.z - lx * s + lz * c, 0, 1, 0.45, 1), i % 2 ? '#f0ece2' : '#1d1b18');
  }
  for (const [dx, dz, col] of [[-0.42, 0.52, '#3b2a21'], [0.48, -0.44, '#3b2a21']] as const) {
    b.add(place(new THREE.CylinderGeometry(0.075, 0.065, 0.1, 10), CLEAR.x + dx, tableTop + 0.05, CLEAR.z + dz), col, { hull: true });
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2).rotateY(0.3), h.own(new THREE.MeshLambertMaterial({ map: h.tex(goCanvas()) })));
  board.position.set(CLEAR.x, tableTop + 0.002, CLEAR.z);
  board.name = 'bamboo:go-board';
  h.add(board);
  h.collide({ x: CLEAR.x, z: CLEAR.z, r: 0.75, h: 0.8 });
  // the qin on a low stand at the clearing's edge, facing the table
  {
    const qx = CLEAR.x - 3.4, qz = CLEAR.z + 2.2, qy = h.y(qx, qz);
    const ry = Math.atan2(CLEAR.x - qx, CLEAR.z - qz) + Math.PI / 2;
    b.add(place(new THREE.BoxGeometry(1.3, 0.05, 0.42), qx, qy + 0.42, qz, ry), COL.wood, { edge: 30 });
    for (const lx of [-0.58, 0.58]) {
      for (const lz of [-0.16, 0.16]) {
        const c = Math.cos(ry), s = Math.sin(ry);
        b.add(place(new THREE.BoxGeometry(0.05, 0.4, 0.05), qx + lx * c + lz * s, qy + 0.2, qz - lx * s + lz * c, ry), COL.woodDark);
      }
    }
    b.add(place(new THREE.BoxGeometry(1.18, 0.05, 0.18), qx, qy + 0.47, qz, ry, 1, 1, 1, 0, 0.02), '#241c17', { edge: 30 });
    const strings: number[] = [];
    for (let i = 0; i < 7; i++) {
      const lz = -0.06 + i * 0.02, c = Math.cos(ry), s = Math.sin(ry);
      strings.push(qx - 0.55 * c + lz * s, qy + 0.5, qz + 0.55 * s + lz * c, qx + 0.55 * c + lz * s, qy + 0.5, qz - 0.55 * s + lz * c);
    }
    b.segs(strings);
    b.add(place(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), qx + Math.cos(ry + Math.PI / 2) * 0.85, qy + 0.025, qz - Math.sin(ry + Math.PI / 2) * 0.85), '#8e8674', { hull: true });
    h.collide({ x: qx, z: qz, r: 0.6, h: 0.4 });
  }

  // ── 竹里馆: a thatched bamboo hut on a raised floor ──────────────
  {
    const { x, z, ry } = HUT;
    const top = h.span(x, z, 2.4).hi + 0.45;
    const W = HUT_W, D = HUT_D;
    const corner = hutAt;
    const floorTop = top + 0.05;
    // stilts and floor
    for (const [lx, lz] of [[-W, -D], [W, -D], [W, D], [-W, D], [0, -D], [0, D]]) {
      const c = corner(lx, lz);
      const gy = h.y(c.x, c.z);
      b.add(place(new THREE.CylinderGeometry(0.07, 0.08, top - gy + 0.1, 6), c.x, (top + gy) / 2 - 0.05, c.z), COL.bambooDry, { rim: true });
    }
    b.add(place(new THREE.BoxGeometry(W * 2 + 0.3, 0.1, D * 2 + 0.3), x, top, z, ry), '#a48f68', { edge: 30, jitter: 0.08 });
    // floor slats (lines)
    const slat: number[] = [];
    for (let i = -7; i <= 7; i++) {
      const a = corner(i * 0.14 * (W / 1), -D - 0.15), c = corner(i * 0.14 * (W / 1), D + 0.15);
      slat.push(a.x, top + 0.052, a.z, c.x, top + 0.052, c.z);
    }
    b.segs(slat);
    // posts
    const postH = 2.35;
    for (const [lx, lz] of [[-W, -D], [W, -D], [W, D], [-W, D]]) {
      const c = corner(lx, lz);
      b.add(place(new THREE.CylinderGeometry(0.075, 0.085, postH, 6), c.x, top + postH / 2, c.z), COL.bamboo, { rim: true });
      h.collide({ x: c.x, z: c.z, r: 0.18, h: 3 });
    }
    // back wall: woven bamboo screen, low railings on the sides
    const back = corner(0, -D);
    b.add(place(new THREE.BoxGeometry(W * 2, postH * 0.8, 0.06), back.x, top + postH * 0.42, back.z, ry), '#b3a47c', { edge: 30, jitter: 0.1 });
    const weave: number[] = [];
    for (let i = 0; i < 9; i++) {
      const yy = top + 0.2 + i * 0.2;
      const a = corner(-W, -D + 0.035), c = corner(W, -D + 0.035);
      weave.push(a.x, yy, a.z, c.x, yy, c.z);
    }
    b.segs(weave);
    for (const side of [-1, 1]) {
      for (const yy of [0.45, 0.75]) {
        const a = corner(side * W, -D), c = corner(side * W, D);
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
        b.add(place(new THREE.CylinderGeometry(0.035, 0.035, D * 2, 5).rotateX(Math.PI / 2), mx, top + yy, mz, ry), COL.bambooDry, { rim: true });
      }
    }
    // a low table and cushion inside
    b.add(place(new THREE.BoxGeometry(0.9, 0.08, 0.5), x, top + 0.34, z, ry), COL.wood, { edge: 30 });
    for (const lx of [-0.38, 0.38]) {
      const c = corner(lx, 0);
      b.add(place(new THREE.BoxGeometry(0.06, 0.3, 0.44), c.x, top + 0.17, c.z, ry), COL.woodDark);
    }
    // stone steps up to the open front: risers no taller than a walker's stride (≤ 0.3 m)
    const stepDepth = 0.44;
    const frontY = h.y(corner(0, D + 0.5).x, corner(0, D + 0.5).z);
    const risers = Math.max(1, Math.ceil((floorTop - frontY) / 0.3));
    for (let i = 1; i < risers; i++) {
      const sTop = floorTop - ((floorTop - frontY) * i) / risers;
      const lz0 = D + 0.15 + (i - 1) * stepDepth, lz1 = lz0 + stepDepth;
      const c = corner(0, (lz0 + lz1) / 2);
      const lo = Math.min(h.y(c.x, c.z), sTop) - 0.35;
      b.add(place(new THREE.BoxGeometry(1.25 - i * 0.06, sTop - lo, stepDepth + 0.02), c.x, (sTop + lo) / 2, c.z, ry), COL.stoneWarm, { edge: 30, jitter: 0.06, seed: 40 + i });
      h.deck(segmentDeck(`bamboo:hut-step${i}`, corner(0, lz0), corner(0, lz1), 0.6, sTop));
    }
    // walkable floor; the back wall, the side rails and the table are solid (the front stays open)
    h.deck(segmentDeck('bamboo:hut', corner(0, -D - 0.15), corner(0, D + 0.15), W + 0.15, floorTop));
    const colLine = (a: XZ, c: XZ, r: number, hgt: number) => {
      const n = Math.max(1, Math.round(Math.hypot(c.x - a.x, c.z - a.z) / 0.4));
      for (let i = 0; i <= n; i++) h.collide({ x: a.x + ((c.x - a.x) * i) / n, z: a.z + ((c.z - a.z) * i) / n, r, h: hgt });
    };
    colLine(corner(-W, -D), corner(W, -D), 0.16, 2.4);
    for (const side of [-1, 1]) {
      colLine(corner(side * W, -D), corner(side * W, D), 0.16, 1);
      // the floor's front lip either side of the step: too high to climb, so keep the body off it
      colLine(corner(side * (W + 0.1), D + 0.15), corner(side * 0.72, D + 0.15), 0.12, 0.6);
    }
    for (const lx of [-0.22, 0.22]) { const c = corner(lx, 0); h.collide({ x: c.x, z: c.z, r: 0.3, h: 0.45 }); }
    const foot = corner(0, 0.2 + (risers - 1) * stepDepth * 0.5);
    h.clearing({ cx: foot.x, cz: foot.z, ax: Math.sin(ry), az: Math.cos(ry), hl: D + 0.6 + (risers - 1) * stepDepth * 0.5, hw: W + 0.5 });
    // thatch roof: a steep hip roof, soft and shaggy (straw colour, dark underside)
    hipRoof(b, x, z, ry, W + 0.75, D + 0.8, top + postH, 1.55, { curl: 0.12, flare: 0.1, color: COL.thatch, ridge: false });
    const rc = corner(0, 0);
    b.add(place(new THREE.CylinderGeometry(0.09, 0.09, (W + 0.75 - (D + 0.8) * 0.9) * 2 + 0.4, 6).rotateZ(Math.PI / 2), rc.x, top + postH + 1.6, rc.z, ry), '#6f6048', { rim: true });
    // signboard 竹里馆 under the front eave
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.36), h.own(new THREE.MeshLambertMaterial({ map: h.tex(plaqueCanvas('竹里馆', { w: 256, h: 92, bg: '#3a3026', fg: '#e9dcb8', frame: '#7d6844' })) })));
    const front = corner(0, D + 0.12);
    plaque.position.set(front.x, top + postH - 0.25, front.z);
    plaque.rotation.y = ry;
    plaque.name = 'bamboo:hut-sign';
    h.add(plaque);
    h.occlude({ x, z, r: 2.4, y0: top, y1: top + postH + 1.6 });
    // a bamboo fence curving away from the hut
    const fence: XZ[] = wind([corner(W + 0.6, D + 1.4), { x: x + 4.2, z: z + 1.5 }, { x: x + 5, z: z - 2.5 }], 0.3);
    for (let i = 0; i < fence.length; i++) {
      const f = fence[i];
      const fy = h.y(f.x, f.z);
      const hh = 0.9 + rng() * 0.25;
      b.add(place(new THREE.CylinderGeometry(0.03, 0.035, hh, 5), f.x, fy + hh / 2, f.z), rng() < 0.5 ? COL.bambooDry : '#8e8a66', { rim: true });
      h.collide({ x: f.x, z: f.z, r: 0.1, h: hh });
    }
    for (let i = 1; i < fence.length; i++) {
      const a = fence[i - 1], c = fence[i];
      for (const yy of [0.35, 0.7]) {
        const ya = h.y(a.x, a.z) + yy, yc = h.y(c.x, c.z) + yy;
        const len = Math.hypot(c.x - a.x, c.z - a.z, yc - ya);
        const g = new THREE.CylinderGeometry(0.02, 0.02, len, 4).rotateX(Math.PI / 2);
        place(g, (a.x + c.x) / 2, (ya + yc) / 2, (a.z + c.z) / 2, Math.atan2(c.x - a.x, c.z - a.z), 1, 1, 1, -Math.atan2(yc - ya, Math.hypot(c.x - a.x, c.z - a.z)));
        b.add(g, '#7d7456', { rim: true });
      }
    }
  }

  // ── 土地龛: a tiny stone shrine with incense ─────────────────────
  let smokeAt: T.Vector3;
  {
    const { x, z } = SHRINE;
    const ry = Math.atan2(CLEAR.x - x, CLEAR.z - z); // faces the clearing
    const gy = h.span(x, z, 0.8).hi;
    const fw = (lx: number, lz: number) => ({ x: x + lx * Math.cos(ry) + lz * Math.sin(ry), z: z - lx * Math.sin(ry) + lz * Math.cos(ry) });
    b.add(place(new THREE.BoxGeometry(1.3, 0.5, 1.0), x, gy + 0.05, z, ry), COL.stoneMid, { edge: 30, jitter: 0.06 });
    b.add(place(new THREE.BoxGeometry(1.0, 0.8, 0.75), x, gy + 0.7, z, ry), COL.stone, { edge: 30, jitter: 0.06 });
    const niche = fw(0, 0.36);
    b.add(place(new THREE.BoxGeometry(0.46, 0.5, 0.06), niche.x, gy + 0.68, niche.z, ry), '#3a3530');
    // the little god: a pale figure in the niche
    b.add(place(new THREE.SphereGeometry(0.1, 8, 6), niche.x, gy + 0.62, niche.z, ry, 1, 1.4, 0.8), '#cbbf9f');
    b.add(place(new THREE.SphereGeometry(0.06, 8, 6), niche.x, gy + 0.8, niche.z, ry), '#d8cdb0');
    // red cloth over the lintel, couplet strips
    const lint = fw(0, 0.39);
    b.add(place(new THREE.BoxGeometry(0.62, 0.1, 0.03), lint.x, gy + 0.98, lint.z, ry), COL.cinnabar);
    for (const s of [-1, 1]) {
      const cp = fw(s * 0.36, 0.39);
      b.add(place(new THREE.BoxGeometry(0.1, 0.5, 0.02), cp.x, gy + 0.66, cp.z, ry), COL.cinnabar);
    }
    hipRoof(b, x, z, ry + Math.PI / 2, 0.72, 0.62, gy + 1.12, 0.5, { curl: 0.14, flare: 0.08 });
    // incense bowl with three sticks
    const bowl = fw(0, 0.85);
    const by = h.y(bowl.x, bowl.z);
    b.add(place(new THREE.CylinderGeometry(0.16, 0.12, 0.16, 10), bowl.x, by + 0.08, bowl.z), COL.bronze, { hull: true });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(0.006, 0.006, 0.3, 3);
      place(g, bowl.x + (i - 1) * 0.04, by + 0.3, bowl.z, 0, 1, 1, 1, 0, (i - 1) * 0.08);
      b.add(g, '#8c3a2c');
    }
    smokeAt = new THREE.Vector3(bowl.x, by + 0.46, bowl.z);
    h.collide({ x, z, r: 0.85, h: 1.6 });
    h.interact({
      id: 'bamboo:shrine', position: new THREE.Vector3(bowl.x, by, bowl.z), radius: 2,
      labelZh: '土地龛', labelEn: 'Earth-god shrine', actionZh: '拜', actionEn: 'Bow',
      act: () => {
        ctx.player.emote('bow');
        ctx.hud.toast('一拜竹林清风。', 'A bow to the wind in the bamboo.');
      },
    });
  }

  // ── bamboo shoots (笋) and mossy stones ─────────────────────────
  for (let i = 0; i < 40; i++) {
    const c = culms[Math.floor(rng() * culms.length)];
    if (!c) break;
    const a = rng() * TAU, d = 0.5 + rng() * 1.2;
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    if (blocked(x, z, -1)) continue;
    const hh = 0.18 + rng() * 0.55;
    const g = new THREE.ConeGeometry(0.07 + hh * 0.12, hh, 6, 3);
    place(g, x, h.y(x, z) + hh / 2 - 0.03, z, rng() * TAU, 1, 1, 1, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3);
    b.add(g, rng() < 0.5 ? '#7a6242' : '#8b7450', { hull: true, jitter: 0.25, seed: i });
  }
  const rockSpots: [number, number, number][] = [
    [CLEAR.x + 5.8, CLEAR.z - 3.5, 1.1], [CLEAR.x - 6.2, CLEAR.z - 1.8, 0.8], [SHRINE.x - 2.4, SHRINE.z + 1.2, 1.2],
    [-74, 20, 0.9], [-98, 22, 1.4], [-66, 48, 1.0], [-90, 50, 1.3], [-104, 34, 1.6], [HUT.x + 3.4, HUT.z - 2.8, 0.8],
  ];
  rockSpots.forEach(([x, z, s], i) => {
    if (ctx.waterAt(x, z) !== null) return;
    const g = rockGeometry(700 + i, s * 1.3, s * 0.8, { base: '#b6ad97', dark: '#4f4a3e', lean: 0.1 });
    g.rotateY(rng() * TAU);
    g.translate(x, h.y(x, z) - 0.05, z);
    b.colored(g, { hull: true });
    h.collide({ x, z, r: s * 0.6, h: s * 0.8 });
  });

  b.build(h, 'bamboo', { outline: 0.03, lineOpacity: 0.6, rim: 0.7 });

  // ── light: shafts through the canopy, motes, incense smoke ────────
  const shaftTex = h.tex(shaftCanvas());
  const shaftMat = h.own(new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.2, color: '#fff3d6' }));
  const shaftGeos: T.BufferGeometry[] = [];
  const shaftSpots: XZ[] = [CLEAR, { x: CLEAR.x + 3, z: CLEAR.z - 2 }, { x: -72, z: 29 }, { x: -64, z: 30 }, { x: -89, z: 35 }, { x: -85, z: 17 }, { x: -76, z: 35 }];
  shaftSpots.forEach((sp, i) => {
    for (let k = 0; k < 2; k++) {
      const w = 1.2 + rng() * 1.6, len = 17;
      const g = new THREE.PlaneGeometry(w, len);
      // slant with the light (from the south-east, high), and turn around the beam axis
      place(g, sp.x + (rng() - 0.5) * 2 + 3.5, h.y(sp.x, sp.z) + len * 0.42, sp.z + (rng() - 0.5) * 2 + 2.2, 0.6 + k * 1.3 + i, 1, 1, 1, 0.26, -0.3);
      shaftGeos.push(g);
    }
  });
  const shafts = new THREE.Mesh(mergeAll(THREE, shaftGeos), shaftMat);
  shafts.name = 'bamboo:shafts';
  shafts.renderOrder = 4;
  h.add(shafts);
  const dayShaft = new THREE.Color('#fff3d6'), moonShaft = new THREE.Color('#b8c8e6');
  h.frame((_dt, t) => {
    shaftMat.opacity = (0.16 + 0.05 * Math.sin(t * 0.37)) * (1 - 0.55 * h.night);
    shaftMat.color.copy(dayShaft).lerp(moonShaft, h.night);
  });

  const glow = h.tex(glowCanvas(64));
  const motes = particles(h, {
    count: 140, at: shaftSpots.map((sp) => new THREE.Vector3(sp.x + 2, h.y(sp.x, sp.z) + 2.4, sp.z + 1)), spread: [2.5, 2.2, 2.5],
    vel: [0.02, 0.03, 0.01], velJitter: [0.05, 0.03, 0.05], life: 14, size: 0.05, color: '#fff6de', opacity: 0.8, tex: glow, additive: true, wobble: 0.5, seed: 4,
  });
  motes.name = 'bamboo:motes';
  h.add(motes);
  const smoke = particles(h, {
    count: 26, at: [smokeAt], spread: [0.02, 0.02, 0.02], vel: [0.03, 0.22, 0.01], velJitter: [0.03, 0.03, 0.03], life: 6, size: 0.3, grow: 3,
    color: '#8d8a84', opacity: 0.35, tex: h.tex(puffCanvas(64, 7)), wobble: 0.25, seed: 9,
  });
  smoke.name = 'bamboo:smoke';
  h.add(smoke);

  // grey-green haze deep between the culms: layers of air (the grove recedes into mist)
  const hazeItems: { p: T.Vector3; w: number; h: number }[] = [];
  for (let i = 0; i < 90 && hazeItems.length < 22; i++) {
    const a = rng() * TAU, d = 9 + rng() * (R.radius - 6);
    const x = R.center.x + Math.cos(a) * d, z = R.center.z + Math.sin(a) * d;
    if (pathDist(x, z) < 3 || trailDist(x, z) < 2) continue;
    hazeItems.push({ p: new THREE.Vector3(x, h.y(x, z) + 1.6 + rng() * 2.5, z), w: 9 + rng() * 8, h: 3.5 + rng() * 3 });
  }
  const haze = mistCards(h, hazeItems, { tex: h.tex(puffCanvas(128, 21)), color: '#ece6cc', opacity: 0.55, drift: 0.25 });
  haze.name = 'bamboo:haze';
  h.add(haze);
  h.frame(() => { (haze.material as T.MeshBasicMaterial).color.set('#ece6cc').multiply(h.paper); });

  // the go board invites a look
  h.interact({
    id: 'bamboo:go', position: new THREE.Vector3(CLEAR.x, cy, CLEAR.z), radius: 2.2,
    labelZh: '石上残局', labelEn: 'A game left on the stone', actionZh: '观棋', actionEn: 'Study it',
    act: () => {
      ctx.player.emote('sit');
      ctx.hud.showCard({ titleZh: '烂柯', titleEn: 'The Rotten Axe-handle', bodyZh: '樵夫入山，观二童子对弈，一局未终，斧柄已烂。归来，人世已百年。', bodyEn: 'A woodcutter watched two boys at go in the hills; before the game ended his axe-handle had rotted away. At home, a hundred years had passed.', seal: '弈' });
    },
  });
}

function mergeCross(THREE: WorldCtx['THREE'], a: T.BufferGeometry, b: T.BufferGeometry): T.BufferGeometry {
  return mergeAll(THREE, [a, b]);
}

function mergeAll(THREE: WorldCtx['THREE'], list: T.BufferGeometry[]): T.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position.array, u = g.attributes.uv.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    const ix = g.index!.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += g.attributes.position.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const bambooRegion: RegionModule = {
  id: 'bamboo',
  build,
  dispose() {
    hill?.dispose();
    hill = null;
  },
};
