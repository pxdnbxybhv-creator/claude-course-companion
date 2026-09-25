// The land: a gently rolling lawn painted like xuan paper. One mesh, one draw call: a Lambert
// material multiplied by two canvas textures — a tiling paper grain, and a painted site overlay
// (ink texture, grass flicks, the pond's bank line, stepping-stone rims, baked blob shadows).
import * as THREE from 'three';
import type { PlantKind } from '../../../core/types';
import type { Season } from '../../../ink/scene-types';
import { makeNoise2, makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture, toon } from './kit';
import { GATE, LANTERNS, LOOP, PAVILION, POND, ROCKS, SPURS, polyDist, pondQ, steppingStones, terrainY, type PlantSlot } from './site';

/** The overlay covers [-OV, OV]² metres. */
const OV = 32;
const OS = 1024;

const GROUND_COLOR: Record<Season, string> = { spring: '#dcd8c8', summer: '#d9d6c5', autumn: '#ddd5c4', winter: '#e6e3dc' };

const SHADOW_R: Record<PlantKind, number> = { pine: 1.6, bamboo: 1.15, plum: 1.35, chrysanthemum: 0.6, orchid: 0.5, lotus: 0 };

function warp(u: number): number {
  return 30 * u + 120 * u * u * u;
}

function terrainGeometry(bag: Bag): THREE.BufferGeometry {
  const n = 180;
  const verts = (n + 1) * (n + 1);
  const pos = new Float32Array(verts * 3);
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const z = warp(j / n * 2 - 1);
    for (let i = 0; i <= n; i++) {
      const x = warp(i / n * 2 - 1);
      pos[k++] = x; pos[k++] = terrainY(x, z); pos[k++] = z;
    }
  }
  const idx = new Uint32Array(n * n * 6);
  k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const g = bag.add(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

function grainCanvas(): HTMLCanvasElement {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const rng = makeRng(2718);
  const noise = makeNoise2(99, 8);
  // soft blotches (tile-safe noise)
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = noise.fbm((x / S) * 8, (y / S) * 8, 3);
      const d = Math.round(18 * Math.max(0, v + 0.1) + rng() * 10);
      const i = (y * S + x) * 4;
      img.data[i] -= d; img.data[i + 1] -= d; img.data[i + 2] -= d * 1.1;
    }
  }
  g.putImageData(img, 0, 0);
  // fibres
  for (let i = 0; i < 260; i++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2, l = rng.range(8, 34);
    g.strokeStyle = `rgba(60,50,40,${rng.range(0.05, 0.13)})`;
    g.lineWidth = rng.range(0.5, 1.2);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rng.range(-4, 4), y + Math.sin(a) * l * 0.5 + rng.range(-4, 4), x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

function overlayCanvas(slots: PlantSlot[], season: Season): HTMLCanvasElement {
  const c = canvas(OS, OS);
  const g = c.getContext('2d')!;
  const P = (v: number) => ((v + OV) / (2 * OV)) * OS;
  const M = OS / (2 * OV); // px per metre
  const rng = makeRng(5150);
  const noise = makeNoise2(404);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, OS, OS);

  const blob = (x: number, z: number, r: number, a: number, color = '30,26,22', sx = 1, sz = 1) => {
    const cx = P(x), cz = P(z), R = r * M;
    g.save();
    g.translate(cx, cz);
    g.scale(sx, sz);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grd.addColorStop(0, `rgba(${color},${a})`);
    grd.addColorStop(0.55, `rgba(${color},${a * 0.6})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  // 1. mottled ink texture in the lawn
  for (let i = 0; i < 90; i++) {
    const x = rng.range(-OV, OV), z = rng.range(-OV, OV);
    if (pondQ(x, z) < 1.1) continue;
    blob(x, z, rng.range(0.8, 3.6), rng.range(0.025, 0.06), '52,46,36', rng.range(0.7, 1.4), rng.range(0.6, 1.2));
  }

  // 2. the pond's bank: a soft wash outside, a broken ink line on the shore
  for (let i = 0; i < 3; i++) {
    const k = 1.05 + i * 0.09;
    g.strokeStyle = `rgba(40,36,30,${0.07 - i * 0.015})`;
    g.lineWidth = M * (0.5 + i * 0.3);
    g.beginPath();
    g.ellipse(P(POND.x), P(POND.z), POND.rx * k * M, POND.rz * k * M, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineCap = 'round';
  const steps = 220;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1) / steps) * Math.PI * 2;
    const v = noise(i / 14, 1.7);
    if (v < -0.28) continue; // the brush lifts
    const q = 0.985 + noise(i / 9, 5.2) * 0.02;
    g.strokeStyle = `rgba(28,25,22,${0.35 + 0.3 * (v + 0.5)})`;
    g.lineWidth = M * (0.08 + 0.16 * (0.5 + v));
    g.beginPath();
    g.moveTo(P(POND.x + Math.cos(a0) * POND.rx * q), P(POND.z + Math.sin(a0) * POND.rz * q));
    g.lineTo(P(POND.x + Math.cos(a1) * POND.rx * q), P(POND.z + Math.sin(a1) * POND.rz * q));
    g.stroke();
  }
  // pebbles along the bank
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, q = rng.range(1.02, 1.14);
    const x = POND.x + Math.cos(a) * POND.rx * q, z = POND.z + Math.sin(a) * POND.rz * q;
    g.fillStyle = `rgba(40,36,30,${rng.range(0.12, 0.3)})`;
    g.beginPath();
    g.ellipse(P(x), P(z), rng.range(0.06, 0.16) * M, rng.range(0.04, 0.1) * M, rng() * 3, 0, Math.PI * 2);
    g.fill();
  }

  // 3. ground texture: moss dots (苔点) and short dry rubs (皴), sparser near the paths
  g.lineCap = 'round';
  for (let i = 0; i < 3400; i++) {
    const x = rng.range(-OV + 1, OV - 1), z = rng.range(-OV + 1, OV - 1);
    if (pondQ(x, z) < 1.12) continue;
    const dens = 0.35 + 0.65 * Math.max(0, noise(x / 5, z / 5) + 0.3);
    if (rng() > dens * (season === 'winter' ? 0.4 : 0.8)) continue;
    if (polyDist(LOOP, x, z) < 0.55) continue;
    const bx = P(x), bz = P(z);
    const ink = season === 'spring' || season === 'summer' ? '46,54,42' : '46,42,36';
    if (rng() < 0.6) {
      g.fillStyle = `rgba(${ink},${rng.range(0.12, 0.34)})`;
      g.beginPath();
      g.ellipse(bx, bz, rng.range(0.5, 1.3), rng.range(0.4, 0.9), rng() * 3, 0, Math.PI * 2);
      g.fill();
    } else {
      const len = rng.range(0.1, 0.35) * M;
      g.strokeStyle = `rgba(${ink},${rng.range(0.06, 0.16)})`;
      g.lineWidth = rng.range(0.6, 1.4);
      g.beginPath();
      g.moveTo(bx - len / 2, bz);
      g.quadraticCurveTo(bx, bz - rng.range(-1, 1), bx + len / 2, bz + rng.range(-1, 1));
      g.stroke();
    }
  }

  // 4. stepping-stone rims (the 3D stones sit on these)
  for (const [x, z, r, rot] of steppingStones()) {
    g.save();
    g.translate(P(x), P(z));
    g.rotate(rot);
    g.fillStyle = 'rgba(30,27,24,0.34)';
    g.beginPath();
    g.ellipse(0, 0, r * 1.14 * M, r * 0.94 * M, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // a worn earth track under the paths
  g.strokeStyle = 'rgba(90,72,50,0.06)';
  g.lineWidth = M * 1.1;
  g.lineJoin = 'round';
  for (const p of [LOOP, ...SPURS]) {
    g.beginPath();
    for (let i = 0; i < p.x.length; i++) {
      if (i === 0) g.moveTo(P(p.x[i]), P(p.z[i]));
      else g.lineTo(P(p.x[i]), P(p.z[i]));
    }
    g.stroke();
  }

  // 5. baked blob shadows (the light is mostly overhead; a hint toward the north)
  for (const s of slots) {
    if (s.inWater) continue;
    const sr = s.jar ? 0.78 : SHADOW_R[s.kind];
    blob(s.x, s.z - 0.15, sr, s.jar ? 0.42 : 0.32);
    blob(s.tablet.x, s.tablet.z - 0.05, 0.38, 0.28);
    // moss dots at the foot
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, d = rng.range(0.25, 0.9) * sr;
      g.fillStyle = `rgba(22,20,18,${rng.range(0.35, 0.7)})`;
      g.beginPath();
      g.arc(P(s.x + Math.cos(a) * d), P(s.z + Math.sin(a) * d), rng.range(0.6, 1.6), 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const r of ROCKS) {
    blob(r.x, r.z - 0.1, r.w * 1.25, 0.4);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, d = rng.range(0.5, 1.3) * r.w;
      g.fillStyle = `rgba(22,20,18,${rng.range(0.35, 0.75)})`;
      g.beginPath();
      g.arc(P(r.x + Math.cos(a) * d), P(r.z + Math.sin(a) * d), rng.range(0.7, 1.8), 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const l of LANTERNS) blob(l.x, l.z, 0.55, 0.35);
  blob(PAVILION.x, PAVILION.z, PAVILION.r * 1.35, 0.3);
  // along the foot of the moon-gate wall
  for (let x = -GATE.halfW; x <= GATE.halfW; x += 0.5) {
    if (Math.abs(x) < GATE.holeR * 0.7) continue;
    blob(x, GATE.z - 0.3, 0.9, 0.12, '30,26,22', 1, 0.6);
  }

  // 6. the season on the ground: fallen leaves in autumn, petals in spring
  if (season === 'autumn' || season === 'spring') {
    const trees = slots.filter((s) => s.kind === 'plum' || s.kind === 'pine' || s.kind === 'bamboo');
    const colors = season === 'autumn' ? ['168,112,58', '184,58,75', '120,90,50'] : ['184,58,75', '200,120,130'];
    for (let i = 0; i < (season === 'autumn' ? 160 : 90); i++) {
      const t = trees.length ? trees[i % trees.length] : null;
      const x = t ? t.x + rng.gauss() * 1.6 : rng.range(-20, 20);
      const z = t ? t.z + rng.gauss() * 1.6 : rng.range(-20, 20);
      if (pondQ(x, z) < 1.05) continue;
      g.fillStyle = `rgba(${colors[i % colors.length]},${rng.range(0.25, 0.5)})`;
      g.beginPath();
      g.ellipse(P(x), P(z), rng.range(0.05, 0.1) * M, rng.range(0.025, 0.05) * M, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // keep the border blank so the clamped edge does not streak across the far hills
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, OS, 3); g.fillRect(0, OS - 3, OS, 3); g.fillRect(0, 0, 3, OS); g.fillRect(OS - 3, 0, 3, OS);
  return c;
}

export interface Ground {
  mesh: THREE.Mesh;
  stones: THREE.InstancedMesh;
}

export function buildGround(bag: Bag, slots: PlantSlot[], season: Season): Ground {
  const overlay = canvasTexture(bag, overlayCanvas(slots, season), { flipY: false });
  const grain = canvasTexture(bag, grainCanvas(), { repeat: true });
  const mat = bag.add(new THREE.MeshLambertMaterial({ color: GROUND_COLOR[season] }));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOverlay = { value: overlay };
    sh.uniforms.uGrain = { value: grain };
    sh.uniforms.uOv = { value: new THREE.Vector4(-OV, -OV, 2 * OV, 2 * OV) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGxz;\nvarying float vSlope;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGxz = (modelMatrix * vec4(position, 1.0)).xz;\nvSlope = 1.0 - normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGxz;\nvarying float vSlope;\nuniform sampler2D uOverlay;\nuniform sampler2D uGrain;\nuniform vec4 uOv;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 ouv = (vGxz - uOv.xy) / uOv.zw;
        vec3 ov = texture2D(uOverlay, ouv).rgb;
        float g1 = texture2D(uGrain, vGxz / 7.0).r;
        float g2 = texture2D(uGrain, vGxz / 29.0 + 0.37).r;
        float ink = smoothstep(0.06, 0.4, vSlope) * 0.3;
        diffuseColor.rgb *= ov * (0.82 + 0.18 * g1) * (0.9 + 0.1 * g2) * (1.0 - ink);`);
  };
  mat.customProgramCacheKey = () => 'ground';
  const mesh = new THREE.Mesh(terrainGeometry(bag), mat);
  mesh.name = 'ground';

  // stepping stones: one instanced draw
  const list = steppingStones();
  const geo = bag.add(new THREE.CylinderGeometry(1, 1.06, 0.08, 11));
  geo.translate(0, 0.01, 0);
  const smat = toon(bag, '#d9d2c3');
  const stones = new THREE.InstancedMesh(geo, smat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const rng = makeRng(33);
  list.forEach(([x, z, r, rot], i) => {
    e.set(rng.range(-0.04, 0.04), rot, rng.range(-0.04, 0.04));
    q.setFromEuler(e);
    v.set(x, terrainY(x, z), z);
    sc.set(r, 1, r * 0.82);
    m4.compose(v, q, sc);
    stones.setMatrixAt(i, m4);
    col.set('#ffffff').multiplyScalar(rng.range(0.88, 1.04));
    stones.setColorAt(i, col);
  });
  stones.instanceMatrix.needsUpdate = true;
  if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
  stones.name = 'stones';
  return { mesh, stones };
}
