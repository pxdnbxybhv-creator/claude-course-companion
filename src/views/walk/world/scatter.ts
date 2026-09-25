// What grows and lies about the open country, sprinkled deterministically: painted trees as
// camera-facing flats (pine 松, willow 柳 by the water, 米点 round trees, bare winter trees 寒林),
// ink shrubs, reeds along the river and the lake, grass tufts, a few scholar's boulders on the
// hills, and stone slabs along the paths. Instanced per 64 m cell and shown by distance: near
// cells get grass and reeds, far ones only trees — a couple of dozen draws for the whole world.
import * as THREE from 'three';
import type { Season } from '../../../ink/scene-types';
import { makeNoise2, makeRng, type Rng } from '../../../core/rng';
import { REGIONS, WORLD_RADIUS } from '../map';
import { Bag, canvas, canvasTexture, outlineMaterial, toon } from './kit';
import { terrain } from './terrain';
import { terrainY, waterAt } from './site';
import { deckY } from './bridges';
import { crossedQuad, reedCanvas, swayMaterial, tuftCanvas } from './flora';
import { rockGeometry } from './architecture';

const CELL = 64;
const EXT = 256;
const NCELL = (EXT * 2) / CELL;

// ------------------------------------------------------------------------------------ painting

type Painter = (g: CanvasRenderingContext2D, r: Rng, W: number, H: number, season: Season) => void;

function stroke(g: CanvasRenderingContext2D, pts: [number, number][], w0: number, w1: number, color: string) {
  for (let i = 1; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    g.strokeStyle = color;
    g.lineWidth = w0 + (w1 - w0) * t;
    g.beginPath();
    g.moveTo(pts[i - 1][0], pts[i - 1][1]);
    g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
}

function trunk(g: CanvasRenderingContext2D, r: Rng, x: number, y0: number, y1: number, w: number, lean: number): [number, number][] {
  const pts: [number, number][] = [];
  const n = 9;
  let cx = x;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    cx += (r() - 0.5) * w * 0.9 + lean * 3;
    pts.push([cx, y0 + (y1 - y0) * t]);
  }
  stroke(g, pts, w, w * 0.35, 'rgba(34,30,26,0.9)');
  // dry-brush bark
  for (let i = 0; i < 14; i++) {
    const k = Math.floor(r() * (pts.length - 1));
    const [px, py] = pts[k];
    g.strokeStyle = 'rgba(250,246,236,0.35)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(px + r.range(-w * 0.3, w * 0.3), py); g.lineTo(px + r.range(-w * 0.3, w * 0.3), py - r.range(4, 12)); g.stroke();
  }
  return pts;
}

const pine: Painter = (g, r, W, H) => {
  const pts = trunk(g, r, W / 2 + r.range(-10, 10), H - 4, H * 0.28, 11, r.range(-0.6, 0.6));
  // needle pads on crooked branches
  const pads = 7;
  for (let k = 0; k < pads; k++) {
    const t = 0.25 + (k / pads) * 0.75;
    const [bx, by] = pts[Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)))];
    const side = k % 2 ? 1 : -1;
    const len = r.range(26, 70) * (1.1 - t * 0.5);
    const ex = bx + side * len, ey = by - r.range(4, 18);
    stroke(g, [[bx, by], [(bx + ex) / 2, by - r.range(0, 8)], [ex, ey]], 4, 1.5, 'rgba(34,30,26,0.85)');
    const pw = r.range(30, 52), ph = pw * 0.36;
    for (let i = 0; i < 60; i++) {
      const a = r.range(-Math.PI, 0);
      const d = r.range(0.2, 1);
      const px = ex + Math.cos(a) * pw * d * 0.9, py = ey + Math.sin(a) * ph * d + ph * 0.35;
      g.strokeStyle = `rgba(28,32,30,${r.range(0.35, 0.75)})`;
      g.lineWidth = r.range(1, 2);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + r.range(-4, 4), py - r.range(5, 11)); g.stroke();
    }
    g.fillStyle = 'rgba(40,48,44,0.18)';
    g.beginPath(); g.ellipse(ex, ey + ph * 0.1, pw, ph * 0.8, 0, 0, Math.PI * 2); g.fill();
  }
};

const willow: Painter = (g, r, W, H, season) => {
  const pts = trunk(g, r, W / 2, H - 4, H * 0.45, 14, r.range(-0.5, 0.5));
  const [tx, ty] = pts[pts.length - 1];
  const strandColor = season === 'winter' ? '52,50,46' : '74,96,80';
  for (let i = 0; i < 44; i++) {
    const a = r.range(-2.6, -0.5);
    const len = r.range(30, 70);
    const sx = tx + Math.cos(a) * len * 0.7, sy = ty + Math.sin(a) * len * 0.5;
    g.strokeStyle = 'rgba(34,30,26,0.7)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + sx) / 2, sy - 10, sx, sy); g.stroke();
    // the long hanging strands
    const drop = r.range(H * 0.3, H * 0.6);
    const sway = r.range(-12, 12);
    g.strokeStyle = `rgba(${strandColor},${r.range(0.35, 0.6)})`;
    g.lineWidth = r.range(0.8, 1.6);
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + sway, sy + drop * 0.5, sx + sway * 0.4, Math.min(H - 6, sy + drop)); g.stroke();
    if (season !== 'winter') for (let k = 0; k < 6; k++) {
      const tt = r.range(0.2, 1);
      const lx = sx + sway * tt * 0.7, ly = sy + drop * tt;
      g.fillStyle = `rgba(${strandColor},${r.range(0.3, 0.55)})`;
      g.beginPath(); g.ellipse(lx, Math.min(H - 6, ly), 1.2, 3.4, r.range(-0.3, 0.3), 0, Math.PI * 2); g.fill();
    }
  }
};

const midot: Painter = (g, r, W, H, season) => {
  const pts = trunk(g, r, W / 2 + r.range(-8, 8), H - 4, H * 0.42, 9, r.range(-0.4, 0.4));
  const [tx, ty] = pts[pts.length - 1];
  // a few branches into the crown
  for (let i = 0; i < 4; i++) stroke(g, [[tx, ty + 30], [tx + r.range(-40, 40), ty - r.range(10, 50)]], 4, 1, 'rgba(34,30,26,0.8)');
  const cx = tx, cy = ty - 30, rx = r.range(70, 100), ry = r.range(70, 110);
  const warm = season === 'autumn';
  for (let i = 0; i < 460; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d * 0.9;
    const low = (y - (cy - ry)) / (2 * ry); // darker toward the bottom of the crown
    const tone = 0.18 + 0.5 * low * r.range(0.6, 1.1);
    const col = warm && r() < 0.12 ? `rgba(168,102,56,${tone})` : `rgba(30,32,30,${tone})`;
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y, r.range(3.5, 7), r.range(1.6, 2.8), r.range(-0.2, 0.2), 0, Math.PI * 2); g.fill();
  }
};

const bare: Painter = (g, r, W, H) => {
  const pts = trunk(g, r, W / 2 + r.range(-6, 6), H - 4, H * 0.35, 10, r.range(-0.5, 0.5));
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    if (depth === 0 || len < 6) return;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    stroke(g, [[x, y], [(x + ex) / 2 + r.range(-4, 4), (y + ey) / 2 + r.range(-4, 4)], [ex, ey]], w, w * 0.6, 'rgba(32,28,24,0.85)');
    branch(ex, ey, a - r.range(0.3, 0.7), len * r.range(0.55, 0.75), w * 0.65, depth - 1);
    branch(ex, ey, a + r.range(0.3, 0.7), len * r.range(0.55, 0.75), w * 0.65, depth - 1);
  };
  for (let k = 3; k < pts.length; k += 2) branch(pts[k][0], pts[k][1], -Math.PI / 2 + r.range(-1.1, 1.1), r.range(30, 60), 4, 4);
};

const PAINTERS: Painter[] = [pine, willow, midot, bare];
const TREE_W = 256, TREE_H = 512;

function treeAtlas(season: Season): HTMLCanvasElement {
  const c = canvas(TREE_W * PAINTERS.length, TREE_H);
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  PAINTERS.forEach((p, i) => {
    g.save();
    g.beginPath(); g.rect(i * TREE_W, 0, TREE_W, TREE_H); g.clip();
    g.translate(i * TREE_W, 0);
    p(g, makeRng(900 + i * 31), TREE_W, TREE_H, season);
    g.restore();
  });
  return c;
}

function shrubCanvas(): HTMLCanvasElement {
  const W = 128, H = 96;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(4411);
  for (let i = 0; i < 180; i++) {
    const a = r.range(Math.PI, Math.PI * 2), d = Math.sqrt(r());
    const x = W / 2 + Math.cos(a) * 54 * d, y = H - 4 + Math.sin(a) * 70 * d;
    g.fillStyle = `rgba(30,34,30,${r.range(0.2, 0.55)})`;
    g.beginPath(); g.ellipse(x, y, r.range(2.5, 5), r.range(1.4, 2.5), r.range(-0.4, 0.4), 0, Math.PI * 2); g.fill();
  }
  return c;
}

// ------------------------------------------------------------------------------------ billboards

const TREE_VS = /* glsl */`
attribute float aVar;
varying vec2 vUv;
uniform float uTime;
uniform float uVariants;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sc = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
  vec2 d = cameraPosition.xz - ip.xz;
  vec2 f = normalize(d + vec2(1e-4));
  vec3 right = vec3(f.y, 0.0, -f.x);
  float sway = sin(uTime * 0.8 + ip.x * 0.3 + ip.z * 0.2) * 0.04 * position.y * position.y;
  vec3 wp = ip + right * (position.x + sway) * sc + vec3(0.0, position.y * sc, 0.0);
  vUv = vec2((uv.x + aVar) / uVariants, uv.y);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TREE_FS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uTint;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.35) discard;
  gl_FragColor = vec4(c.rgb * uTint, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface Scatter {
  group: THREE.Group;
  update(t: number, cam: THREE.Vector3, tint: THREE.Color, far: number): void;
}

interface Cell { cx: number; cz: number; trees: THREE.Object3D | null; shrubs: THREE.Object3D | null; reeds: THREE.Object3D | null; tufts: THREE.Object3D | null; rocks: THREE.Object3D | null; slabs: THREE.Object3D | null }

export function buildScatter(bag: Bag, season: Season, reduced: boolean): Scatter {
  const group = new THREE.Group();
  group.name = 'scatter';
  const T = terrain();
  const time = { value: 0 };
  const noise = makeNoise2(6161);

  // --- materials
  const atlas = canvasTexture(bag, treeAtlas(season));
  const treeMat = bag.add(new THREE.ShaderMaterial({
    vertexShader: TREE_VS, fragmentShader: TREE_FS, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 }, uVariants: { value: PAINTERS.length } }]),
  }));
  treeMat.uniforms.uMap.value = atlas;
  treeMat.uniforms.uTime = time;
  const treeGeo = bag.add(new THREE.PlaneGeometry(1, 2).translate(0, 1, 0));
  const tuftMat = swayMaterial(bag, canvasTexture(bag, tuftCanvas(7)), reduced ? 0 : 0.18, time);
  const reedMat = swayMaterial(bag, canvasTexture(bag, reedCanvas(11)), reduced ? 0 : 0.035, time);
  const shrubMat = swayMaterial(bag, canvasTexture(bag, shrubCanvas()), reduced ? 0 : 0.02, time);
  const tuftGeo = bag.add(crossedQuad(0.42, 0.3));
  const reedGeo = bag.add(crossedQuad(0.6, 1.55));
  const shrubGeo = bag.add(crossedQuad(1.6, 1.2));
  const rockGeo = bag.add(rockGeometry(7331, 1, 1));
  const rockMat = toon(bag, '#ffffff', { vertexColors: true });
  const rockOutline = outlineMaterial(bag, 0.03);
  const slabGeo = bag.add(new THREE.CylinderGeometry(1, 1.08, 0.09, 6).translate(0, 0.015, 0));
  const slabMat = toon(bag, '#c9c1ae');

  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const tinted = new Set<THREE.Material>([tuftMat, reedMat, shrubMat]);

  // keep the places' own hearts for the region builders; the garden is walled and dressed already
  const core = (x: number, z: number, k: number) => {
    if (x * x + z * z < 31 * 31) return true;
    for (const r of REGIONS) {
      if (r.id === 'garden' || r.id === 'lake') continue;
      const d = Math.hypot(x - r.center.x, z - r.center.z);
      if (d < r.radius * k) return true;
    }
    return false;
  };
  const dry = (x: number, z: number, pad: number) => waterAt(x, z) === null && waterAt(x + pad, z) === null && waterAt(x - pad, z) === null && waterAt(x, z + pad) === null && waterAt(x, z - pad) === null;

  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]): THREE.InstancedMesh | null => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return im;
  };
  const compose = (x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number) => {
    e.set(0, ry, 0); q.setFromEuler(e); p.set(x, y, z); s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(p, q, s);
  };

  const buildCell = (c: Cell, ci: number, cj: number) => {
    const rng = makeRng(0x5ca7 + ci * 131 + cj * 7919);
    const x0 = c.cx - CELL / 2, z0 = c.cz - CELL / 2;
    const trees: THREE.Matrix4[] = [], treeVar: number[] = [];
    const shrubs: THREE.Matrix4[] = [], reeds: THREE.Matrix4[] = [], tufts: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
    // trees: clumps and groves by noise, open meadows between (留白)
    for (let k = 0; k < 150; k++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      const r = Math.hypot(x, z);
      if (r > WORLD_RADIUS + 60) continue;
      const grove = noise(x / 38, z / 38) + (r > WORLD_RADIUS - 10 ? 0.35 : 0);
      if (rng() > Math.max(0, grove + 0.12) * 1.3) continue;
      if (core(x, z, 0.72)) continue;
      if (T.pathNear(x, z).d < 3.2 || deckY(x, z, 3) !== null || !dry(x, z, 1.5)) continue;
      const y = terrainY(x, z);
      const nearWater = !dry(x, z, 7);
      let v = nearWater ? 1 : y > 7 || rng() < 0.3 ? 0 : 2;
      if (season === 'winter' && v === 2 && rng() < 0.6) v = 3;
      if (season === 'autumn' && v === 2 && rng() < 0.2) v = 3;
      const sc = (v === 0 ? rng.range(3.4, 5) : v === 1 ? rng.range(3.4, 4.6) : rng.range(3, 4.4)) * (r > WORLD_RADIUS ? 1.4 : 1);
      trees.push(compose(x, y - 0.2, z, 0, sc, sc, sc));
      treeVar.push(v);
      // a shrub or two at the foot
      if (rng() < 0.4) shrubs.push(compose(x + rng.range(-2, 2), y - 0.05, z + rng.range(-2, 2), rng() * 3, rng.range(0.8, 1.3), rng.range(0.7, 1.1), rng.range(0.8, 1.3)));
    }
    // shrubs and boulders on open ground
    for (let k = 0; k < 40; k++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      if (Math.hypot(x, z) > WORLD_RADIUS + 20 || core(x, z, 0.6)) continue;
      if (T.pathNear(x, z).d < 2.2 || !dry(x, z, 1)) continue;
      const y = terrainY(x, z);
      if (noise(x / 20 + 4, z / 20) > 0.05 && rng() < 0.6) shrubs.push(compose(x, y - 0.05, z, rng() * 3, rng.range(0.7, 1.2), rng.range(0.6, 1.1), rng.range(0.7, 1.2)));
      else if (T.slope(x, z) > 0.12 && rng() < 0.35) {
        const w = rng.range(0.7, 2.2);
        rocks.push(compose(x, y - 0.25 * w, z, rng() * 6.28, w, w * rng.range(0.5, 0.9), w));
      }
    }
    // reeds: along the river banks and the lake shore
    for (let k = 0; k < 260; k++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      if (core(x, z, 0.35) || x * x + z * z < 900) continue;
      const w = waterAt(x, z);
      if (w === null && dry(x, z, 1.3)) continue; // not by the water
      if (deckY(x, z, 2) !== null || T.pathNear(x, z).d < 2) continue;
      if (w !== null && w - terrainY(x, z) > 0.45) continue; // only in the shallows
      const y = Math.max(terrainY(x, z), w ?? -99) - 0.05;
      reeds.push(compose(x, y, z, rng() * 3, 1, rng.range(0.7, 1.2), 1));
    }
    // grass tufts, thicker along the edges of paths
    for (let k = 0; k < 420; k++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      if (Math.hypot(x, z) > WORLD_RADIUS || x * x + z * z < 900) continue;
      const pd = T.pathNear(x, z).d;
      const edge = pd > 1.3 && pd < 3.2;
      if (!edge && rng() > 0.45 + 0.4 * noise(x / 9, z / 9)) continue;
      if (pd < 1.3 || !dry(x, z, 0.3) || deckY(x, z, 0.5) !== null) continue;
      const kk = rng.range(0.7, 1.35);
      tufts.push(compose(x, terrainY(x, z) - 0.02, z, rng() * 3, kk, kk * rng.range(0.8, 1.2), kk));
    }
    const tm = inst(treeGeo, treeMat, trees);
    if (tm) {
      // each cell's own copy of the quad carries its trees' variants as an instanced attribute
      tm.geometry = treeGeo.clone();
      bag.add(tm.geometry);
      tm.geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(Float32Array.from(treeVar), 1));
      // trees are tall: pad the bounds so a trunk at the edge is never culled while its crown shows
      tm.computeBoundingSphere();
      if (tm.boundingSphere) tm.boundingSphere.radius += 10;
      tm.name = 'trees';
    }
    c.trees = tm;
    c.shrubs = inst(shrubGeo, shrubMat, shrubs);
    c.reeds = inst(reedGeo, reedMat, reeds);
    c.tufts = inst(tuftGeo, tuftMat, tufts);
    const rm = inst(rockGeo, rockMat, rocks);
    if (rm) {
      const ol = new THREE.InstancedMesh(rockGeo, rockOutline, rocks.length);
      rocks.forEach((m, i) => ol.setMatrixAt(i, m));
      ol.instanceMatrix.needsUpdate = true;
      ol.computeBoundingSphere();
      rm.add(ol);
      // the outline hull is a child: its instance matrices are already in world space
      ol.matrixAutoUpdate = false;
    }
    c.rocks = rm;
    for (const o of [c.trees, c.shrubs, c.reeds, c.tufts, c.rocks]) if (o) { o.visible = false; o.matrixAutoUpdate = false; group.add(o); }
  };

  // --- stone slabs along every path, outside the places' hearts and off the bridges
  const slabs: THREE.Matrix4[] = [];
  const srng = makeRng(2424);
  for (const list of T.paths) {
    for (let i = 0; i < list.length; i += 1) {
      const pt = list[i];
      if (srng() < 0.22) continue;
      if (core(pt.x, pt.z, 0.3) || pt.x * pt.x + pt.z * pt.z < 23 * 23) continue;
      if (deckY(pt.x, pt.z, 1.2) !== null || waterAt(pt.x, pt.z) !== null) continue;
      const j = srng.range(-0.55, 0.55);
      const x = pt.x - pt.tz * j, z = pt.z + pt.tx * j;
      const r = srng.range(0.24, 0.38);
      slabs.push(compose(x, terrainY(x, z) - 0.03, z, Math.atan2(pt.tx, pt.tz) + srng.range(-0.3, 0.3), r, 1, r * srng.range(0.7, 0.95)));
    }
  }
  const cells: Cell[] = [];
  for (let cj = 0; cj < NCELL; cj++) for (let ci = 0; ci < NCELL; ci++) {
    const cx = -EXT + (ci + 0.5) * CELL, cz = -EXT + (cj + 0.5) * CELL;
    if (Math.hypot(cx, cz) > EXT + CELL * 0.3) continue;
    const c: Cell = { cx, cz, trees: null, shrubs: null, reeds: null, tufts: null, rocks: null, slabs: null };
    buildCell(c, ci, cj);
    // slabs of this cell
    const mine = slabs.filter((m) => { const x = m.elements[12], z = m.elements[14]; return x >= cx - CELL / 2 && x < cx + CELL / 2 && z >= cz - CELL / 2 && z < cz + CELL / 2; });
    c.slabs = inst(slabGeo, slabMat, mine);
    if (c.slabs) { c.slabs.visible = false; c.slabs.matrixAutoUpdate = false; group.add(c.slabs); }
    cells.push(c);
  }

  return {
    group,
    update(t, cam, tint, far) {
      time.value = t;
      (treeMat.uniforms.uTint.value as THREE.Color).copy(tint);
      for (const m of tinted) (m as THREE.MeshBasicMaterial).color.copy(tint);
      for (const c of cells) {
        const dx = Math.max(0, Math.abs(cam.x - c.cx) - CELL / 2), dz = Math.max(0, Math.abs(cam.z - c.cz) - CELL / 2);
        const d = Math.sqrt(dx * dx + dz * dz);
        if (c.trees) c.trees.visible = d < far;
        if (c.rocks) c.rocks.visible = d < Math.min(far, 110);
        if (c.shrubs) c.shrubs.visible = d < 70;
        if (c.slabs) c.slabs.visible = d < 60;
        if (c.reeds) c.reeds.visible = d < 48;
        if (c.tufts) c.tufts.visible = d < 30;
      }
    },
  };
}
