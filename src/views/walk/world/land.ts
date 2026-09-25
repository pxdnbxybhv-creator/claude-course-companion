// The open country beyond the garden wall: a grid of land chunks (48 m) with four levels of detail
// chosen by distance, built lazily, painted like the garden lawn — paper grain, ink texture, paths
// as packed earth, damp washes and broken ink lines along the river and the lake shore, cooler and
// paler as the land climbs (远山淡). One material; a dozen or so draws in view.
import * as THREE from 'three';
import type { Season } from '../../../ink/scene-types';
import { makeNoise2, makeRng } from '../../../core/rng';
import { LAKE, REGION, type RegionId } from '../map';
import { Bag, LAWN, NIGHT_LAND, canvas, canvasTexture } from './kit';
import { skyNow } from './sky';
import { RIVER_SAMPLES, POOL, terrain } from './terrain';
import { terrainY } from './site';

const CH = 48;
const EXT = 264;
const NC = (EXT * 2) / CH; // 11 × 11 chunks
/** Quads inside this square belong to the garden's own finer mesh. */
const GARDEN_CUT = 29;
/** Overlay texture extent (m) and size (px). */
const OVX = 196;
const OVS = 1024;
const LOD_STEP = [1, 2, 4, 8];

/** The colour of the land is all in its vertices (meadow, jade hollows, ochre slopes, blue-green heights). */
const GROUND = '#ffffff';
/** Broad patches of the meadow: jade in the hollows, tender yellow-green on the rises, ochre where it is steep. */
const PATCH: Record<Season, { jade: string; leaf: string; ochre: string; high: string; damp: string }> = {
  spring: { jade: '#8cc39e', leaf: '#c2d995', ochre: '#cbb087', high: '#98bcb2', damp: '#94c39f' },
  summer: { jade: '#7fb98e', leaf: '#b3d08d', ochre: '#c6a87e', high: '#90b6ad', damp: '#86bb95' },
  autumn: { jade: '#92bd92', leaf: '#c6c987', ochre: '#c89f72', high: '#98b4a8', damp: '#98bf95' },
  winter: { jade: '#dfe2dc', leaf: '#efece4', ochre: '#d8cdbd', high: '#e4e6e6', damp: '#d2d4cc' },
};

/** Where people live and walk the ground is not meadow: the town's packed earth, the grove's leaf litter, the temple's dust. */
const SETTLED: { id: RegionId; color: string; k: number; inner: number }[] = [
  { id: 'village', color: '#dbd2be', k: 0.95, inner: 0.62 },
  { id: 'bamboo', color: '#b3ae78', k: 0.6, inner: 0.7 },
  { id: 'mountain', color: '#cfbd9a', k: 0.55, inner: 0.45 },
];

function overlayCanvas(season: Season): HTMLCanvasElement {
  const c = canvas(OVS, OVS);
  const g = c.getContext('2d')!;
  const M = OVS / (2 * OVX);
  const P = (v: number) => (v + OVX) * M;
  const rng = makeRng(8841);
  const noise = makeNoise2(3303);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, OVS, OVS);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const T = terrain();

  // 1. mottled ink washes in the land
  for (let i = 0; i < 700; i++) {
    const x = rng.range(-OVX, OVX), z = rng.range(-OVX, OVX);
    const r = rng.range(2, 9) * M;
    const grd = g.createRadialGradient(P(x), P(z), 0, P(x), P(z), r);
    const a = rng.range(0.02, 0.055);
    grd.addColorStop(0, `rgba(52,48,38,${a})`);
    grd.addColorStop(1, 'rgba(52,48,38,0)');
    g.fillStyle = grd;
    g.fillRect(P(x) - r, P(z) - r, r * 2, r * 2);
  }
  // 2. moss dots (苔点) and dry rubs, thicker on the slopes
  const ink = season === 'spring' || season === 'summer' ? '46,54,42' : '46,42,36';
  for (let i = 0; i < 26000; i++) {
    const x = rng.range(-OVX, OVX), z = rng.range(-OVX, OVX);
    const dens = 0.3 + 0.7 * Math.max(0, noise(x / 11, z / 11) + 0.25) + Math.min(0.6, T.slope(x, z));
    if (rng() > dens * (season === 'winter' ? 0.35 : 0.7)) continue;
    if (T.waterAt(x, z) !== null) continue;
    if (T.pathNear(x, z).d < 1.4) continue;
    if (rng() < 0.65) {
      g.fillStyle = `rgba(${ink},${rng.range(0.1, 0.3)})`;
      g.beginPath();
      g.ellipse(P(x), P(z), rng.range(0.4, 1.1), rng.range(0.3, 0.8), rng() * 3, 0, Math.PI * 2);
      g.fill();
    } else {
      const len = rng.range(0.4, 1.2) * M;
      g.strokeStyle = `rgba(${ink},${rng.range(0.05, 0.13)})`;
      g.lineWidth = rng.range(0.5, 1.1);
      g.beginPath();
      g.moveTo(P(x) - len / 2, P(z));
      g.lineTo(P(x) + len / 2, P(z) + rng.range(-1, 1));
      g.stroke();
    }
  }
  // 3. paths: packed earth, with a soft darker edge
  for (const list of T.paths) {
    for (const [w, col] of [[3.6, 'rgba(150,112,62,0.12)'], [2.4, 'rgba(176,132,76,0.2)'], [1.2, 'rgba(120,88,52,0.1)']] as const) {
      g.strokeStyle = col;
      g.lineWidth = w * M;
      g.beginPath();
      list.forEach((p, i) => (i ? g.lineTo(P(p.x), P(p.z)) : g.moveTo(P(p.x), P(p.z))));
      g.stroke();
    }
  }
  // 4. the river: a damp band outside each bank and a broken ink line on it
  const RS = RIVER_SAMPLES;
  for (const side of [-1, 1]) {
    for (let i = 1; i < RS.length; i++) {
      const a = RS[i - 1], b = RS[i];
      if (a.upper !== b.upper) continue;
      const ax = a.x - a.tz * side * (a.w + 0.9), az = a.z + a.tx * side * (a.w + 0.9);
      const bx = b.x - b.tz * side * (b.w + 0.9), bz = b.z + b.tx * side * (b.w + 0.9);
      g.strokeStyle = 'rgba(60,56,44,0.07)';
      g.lineWidth = 2.2 * M;
      g.beginPath(); g.moveTo(P(ax), P(az)); g.lineTo(P(bx), P(bz)); g.stroke();
      const v = noise(i / 9, side * 3.1);
      if (v < -0.25) continue;
      const cx = a.x - a.tz * side * (a.w - 0.1), cz = a.z + a.tx * side * (a.w - 0.1);
      const dx = b.x - b.tz * side * (b.w - 0.1), dz = b.z + b.tx * side * (b.w - 0.1);
      g.strokeStyle = `rgba(28,25,22,${0.3 + 0.3 * (v + 0.5)})`;
      g.lineWidth = Math.max(0.8, (0.12 + 0.2 * (0.5 + v)) * M);
      g.beginPath(); g.moveTo(P(cx), P(cz)); g.lineTo(P(dx), P(dz)); g.stroke();
    }
  }
  // 5. the lake's shore and the pool: soft wash, broken ink line, pebbles
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = `rgba(40,36,30,${0.06 - k * 0.015})`;
    g.lineWidth = M * (1.2 + k * 0.9);
    g.beginPath();
    g.ellipse(P(LAKE.x), P(LAKE.z), (LAKE.rx + 1.2 + k) * M, (LAKE.rz + 1.2 + k) * M, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const steps = 360;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1) / steps) * Math.PI * 2;
    const v = noise(i / 16, 8.3);
    if (v < -0.3) continue;
    g.strokeStyle = `rgba(28,25,22,${0.3 + 0.3 * (v + 0.5)})`;
    g.lineWidth = Math.max(0.8, M * (0.1 + 0.18 * (0.5 + v)));
    g.beginPath();
    g.moveTo(P(LAKE.x + Math.cos(a0) * LAKE.rx * 1.0), P(LAKE.z + Math.sin(a0) * LAKE.rz * 1.0));
    g.lineTo(P(LAKE.x + Math.cos(a1) * LAKE.rx * 1.0), P(LAKE.z + Math.sin(a1) * LAKE.rz * 1.0));
    g.stroke();
  }
  g.strokeStyle = 'rgba(28,25,22,0.4)';
  g.lineWidth = M * 0.2;
  g.beginPath(); g.arc(P(POOL.x), P(POOL.z), POOL.r * M, 0, Math.PI * 2); g.stroke();
  // a blank border so the clamped edge never streaks
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, OVS, 3); g.fillRect(0, OVS - 3, OVS, 3); g.fillRect(0, 0, 3, OVS); g.fillRect(OVS - 3, 0, 3, OVS);
  return c;
}

function grainCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const rng = makeRng(2719);
  const noise = makeNoise2(97, 8);
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = noise.fbm((x / S) * 8, (y / S) * 8, 3);
    const d = Math.round(20 * Math.max(0, v + 0.1) + rng() * 9);
    const i = (y * S + x) * 4;
    img.data[i] -= d; img.data[i + 1] -= d; img.data[i + 2] -= d * 1.1;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 140; i++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2, l = rng.range(6, 22);
    g.strokeStyle = `rgba(60,50,40,${rng.range(0.05, 0.12)})`;
    g.lineWidth = rng.range(0.5, 1.1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return c;
}

export interface Land {
  group: THREE.Group;
  material: THREE.MeshLambertMaterial;
  /** Pick detail levels and visibility by the camera; builds at most one new chunk level per call. */
  update(cam: THREE.Vector3, far: number): void;
  /** Build every chunk's coarse levels now (during loading). */
  warm(): void;
}

export function buildLand(bag: Bag, season: Season): Land {
  const group = new THREE.Group();
  group.name = 'land';
  const overlay = canvasTexture(bag, overlayCanvas(season), { flipY: false });
  const grain = canvasTexture(bag, grainCanvas(), { repeat: true });
  const mat = bag.add(new THREE.MeshLambertMaterial({ color: GROUND, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOverlay = { value: overlay };
    sh.uniforms.uGrain = { value: grain };
    sh.uniforms.uOv = { value: new THREE.Vector4(-OVX, -OVX, 2 * OVX, 2 * OVX) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGxz;\nvarying float vSlope;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGxz = (modelMatrix * vec4(position, 1.0)).xz;\nvSlope = 1.0 - normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGxz;\nvarying float vSlope;\nuniform sampler2D uOverlay;\nuniform sampler2D uGrain;\nuniform vec4 uOv;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 ouv = (vGxz - uOv.xy) / uOv.zw;
        vec3 ov = (ouv.x > 0.0 && ouv.x < 1.0 && ouv.y > 0.0 && ouv.y < 1.0) ? texture2D(uOverlay, ouv).rgb : vec3(1.0);
        float g1 = texture2D(uGrain, vGxz / 6.0).r;
        float g2 = texture2D(uGrain, vGxz / 31.0 + 0.37).r;
        float ink = smoothstep(0.12, 0.55, vSlope) * 0.34;
        diffuseColor.rgb *= ov * (0.8 + 0.2 * g1) * (0.9 + 0.1 * g2) * (1.0 - ink);`);
  };
  mat.customProgramCacheKey = () => 'land';

  const P = PATCH[season];
  const lawn = new THREE.Color(LAWN[season]);
  const jade = new THREE.Color(P.jade), leaf = new THREE.Color(P.leaf), ochre = new THREE.Color(P.ochre);
  const high = new THREE.Color(P.high), damp = new THREE.Color(P.damp);
  const far = new THREE.Color('#b9c7bd');
  const tmp = new THREE.Color();
  const T = terrain();
  const patches = makeNoise2(7717);
  const settled = SETTLED.map((g) => ({ ...REGION[g.id], color: new THREE.Color(g.color), k: g.k, inner: g.inner }));

  const buildChunk = (ci: number, cj: number, lod: number): THREE.BufferGeometry => {
    const step = LOD_STEP[lod];
    const n = CH / step;
    const x0 = -EXT + ci * CH, z0 = -EXT + cj * CH;
    const vc = (n + 1) * (n + 1);
    const skirt = (n + 1) * 4;
    const pos = new Float32Array((vc + skirt) * 3);
    const col = new Float32Array((vc + skirt) * 3);
    const hs = new Float32Array(vc);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const k = j * (n + 1) + i;
      const y = terrainY(x, z);
      hs[k] = y;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      // colour: the season's meadow in broad patches, ochre on steep ground, blue-green up high
      // (青绿), deeper green where damp; it meets the garden's lawn without a seam
      const r = Math.hypot(x, z);
      const up = Math.min(1, Math.max(0, (y - 3) / 26));
      const out = Math.min(1, Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - 30) / 12));
      const nv = patches(x / 46, z / 46) + 0.35 * patches(x / 13 + 5.1, z / 13);
      tmp.copy(lawn);
      tmp.lerp(jade, Math.min(1, Math.max(0, -nv * 1.5)) * 0.9 * out);
      tmp.lerp(leaf, Math.min(1, Math.max(0, nv * 1.5)) * 0.8 * out);
      // 青绿: ochre earth where the low ground turns steep, mineral blue-green as the hills rise
      const sl = T.slope(x, z);
      const low = (1 - up) * (1 - up);
      tmp.lerp(ochre, Math.min(1, Math.max(0, sl * 2 - 0.3)) * 0.5 * low * out);
      tmp.lerp(high, Math.min(1, up * 1.1 + Math.max(0, sl - 0.25) * 0.8 * (1 - low * 0.5)) * 0.85 * out);
      tmp.lerp(far, Math.min(1, Math.max(0, (r - 165) / 50)) * 0.35);
      for (const g of settled) {
        const q = Math.hypot(x - g.center.x, z - g.center.z) / g.radius;
        if (q < 1) tmp.lerp(g.color, g.k * Math.min(1, (1 - q) / (1 - g.inner)));
      }
      const w = T.waterAt(x, z);
      if (w !== null && w - y < 3) tmp.lerp(damp, 0.55);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    // skirt: the border ring again, 4 m lower, to hide cracks between levels
    let s = vc;
    const border: number[] = [];
    for (let i = 0; i <= n; i++) border.push(i);
    for (let j = 1; j <= n; j++) border.push(j * (n + 1) + n);
    for (let i = n - 1; i >= 0; i--) border.push(n * (n + 1) + i);
    for (let j = n - 1; j >= 1; j--) border.push(j * (n + 1));
    const skirtIdx: number[] = [];
    for (const k of border) {
      pos[s * 3] = pos[k * 3]; pos[s * 3 + 1] = pos[k * 3 + 1] - 4; pos[s * 3 + 2] = pos[k * 3 + 2];
      col[s * 3] = col[k * 3]; col[s * 3 + 1] = col[k * 3 + 1]; col[s * 3 + 2] = col[k * 3 + 2];
      skirtIdx.push(s++);
    }
    const idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const xa = x0 + i * step, za = z0 + j * step;
      if (xa >= -GARDEN_CUT && xa + step <= GARDEN_CUT && za >= -GARDEN_CUT && za + step <= GARDEN_CUT) continue;
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    for (let m = 0; m < border.length; m++) {
      const a = border[m], b = border[(m + 1) % border.length];
      const sa = skirtIdx[m], sb = skirtIdx[(m + 1) % border.length];
      idx.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb); // both windings: the skirt is seen from either side
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, s * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, s * 3), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // the skirt wears the surface's normals, so a crack between levels shows land, not a dark wall
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    border.forEach((k, m) => nrm.setXYZ(skirtIdx[m], nrm.getX(k), nrm.getY(k), nrm.getZ(k)));
    g.computeBoundingSphere();
    return g;
  };

  interface Chunk { ci: number; cj: number; cx: number; cz: number; mesh: THREE.Mesh; geos: (THREE.BufferGeometry | null)[]; lod: number }
  const chunks: Chunk[] = [];
  for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
    const cx = -EXT + (ci + 0.5) * CH, cz = -EXT + (cj + 0.5) * CH;
    if (Math.hypot(cx, cz) > EXT + CH * 0.4) continue;
    const mesh = new THREE.Mesh(undefined, mat);
    mesh.name = 'land';
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    chunks.push({ ci, cj, cx, cz, mesh, geos: [null, null, null, null], lod: -1 });
  }
  const geoFor = (c: Chunk, lod: number) => {
    let g = c.geos[lod];
    if (!g) { g = bag.add(buildChunk(c.ci, c.cj, lod)); c.geos[lod] = g; }
    return g;
  };
  const nightLand = new THREE.Color(NIGHT_LAND);
  let lastNight = -1;
  const want = (d: number) => (d < 56 ? 0 : d < 110 ? 1 : d < 170 ? 2 : 3);
  return {
    group,
    material: mat,
    warm() {
      for (const c of chunks) { geoFor(c, 3); if (Math.hypot(c.cx, c.cz) < 140) geoFor(c, 2); }
    },
    update(cam, far) {
      // by night the land goes down to a moonlit indigo
      const n = skyNow.night;
      if (Math.abs(n - lastNight) > 1e-3) { lastNight = n; mat.color.setRGB(1, 1, 1).lerp(nightLand, n); }
      let budget = 1;
      for (const c of chunks) {
        // distance from the camera to the chunk's square
        const dx = Math.max(0, Math.abs(cam.x - c.cx) - CH / 2), dz = Math.max(0, Math.abs(cam.z - c.cz) - CH / 2);
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > far + 12) { c.mesh.visible = false; continue; }
        let lod = want(d);
        if (!c.geos[lod]) {
          if (budget > 0) { budget--; geoFor(c, lod); }
          else { while (lod < 3 && !c.geos[lod]) lod++; if (!c.geos[lod]) geoFor(c, lod); }
        }
        if (c.lod !== lod) { c.mesh.geometry = c.geos[lod]!; c.lod = lod; }
        c.mesh.visible = true;
      }
    },
  };
}
