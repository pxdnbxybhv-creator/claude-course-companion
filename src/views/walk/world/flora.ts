// Small life that is not a habit: ink grass tufts at the feet of stones and tablets, reeds (芦苇)
// leaning over the pond's edge, and a band of mist between the garden and the far mountains.
// Instanced crossed quads that sway in the vertex shader: two draw calls for all of it.
import * as THREE from 'three';
import { makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture } from './kit';
import { BRIDGE, LANTERNS, LOOP, POND, ROCKS, SPURS, polyDist, pondQ, terrainY, type PlantSlot } from './site';

export function tuftCanvas(seed: number): HTMLCanvasElement {
  const W = 128, H = 128;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(seed);
  g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + r.range(-0.9, 0.9);
    const len = r.range(50, 118);
    const x0 = W / 2 + r.range(-10, 10);
    const bend = r.range(-0.5, 0.5);
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const p = (t: number) => [x0 + Math.cos(a + bend * t * t) * len * t, H - 2 + Math.sin(a + bend * t * t) * len * t];
      const [ax, ay] = p(t0), [bx, by] = p(t1);
      // ink at the root, a deep grass green toward the tip
      g.strokeStyle = `rgba(${Math.round(30 + 40 * t0)},${Math.round(34 + 62 * t0)},${Math.round(26 + 22 * t0)},${0.75 - t0 * 0.3})`;
      g.lineWidth = 3.6 * (1 - t0) + 0.5;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  return c;
}

export function reedCanvas(seed: number): HTMLCanvasElement {
  const W = 128, H = 384;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const r = makeRng(seed);
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x0 = W / 2 + r.range(-18, 18);
    const lean = r.range(-26, 26);
    const top = r.range(40, 110);
    // stem
    g.strokeStyle = 'rgba(62,58,34,0.85)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(x0, H);
    g.quadraticCurveTo(x0 + lean * 0.3, (H + top) / 2, x0 + lean, top);
    g.stroke();
    // long leaves peeling off the stem
    for (let k = 0; k < 3; k++) {
      const y = H - r.range(60, 220);
      const t = (H - y) / (H - top);
      const sx = x0 + lean * t * t;
      const dir = r.chance(0.5) ? 1 : -1;
      g.strokeStyle = 'rgba(58,84,48,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx, y);
      g.quadraticCurveTo(sx + dir * 30, y - 50, sx + dir * r.range(40, 58), y - r.range(20, 90));
      g.stroke();
    }
    // the plume: dry, feathery ochre-ink dabs
    for (let k = 0; k < 16; k++) {
      const tt = r();
      const px = x0 + lean + r.gauss() * 4 + lean * 0.15 * tt;
      const py = top + tt * 40;
      g.fillStyle = `rgba(${r.chance(0.6) ? '196,150,90' : '120,92,60'},${r.range(0.35, 0.65)})`;
      g.beginPath();
      g.ellipse(px, py, r.range(1.5, 3.5), r.range(3, 7), r.range(-0.4, 0.4), 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

export function crossedQuad(w: number, h: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const pos = [...Array.from(a.attributes.position.array), ...Array.from(b.attributes.position.array)];
  const uv = [...Array.from(a.attributes.uv.array), ...Array.from(b.attributes.uv.array)];
  const idx = Array.from(a.index!.array as ArrayLike<number>).concat(Array.from(b.index!.array as ArrayLike<number>, (i) => i + a.attributes.position.count));
  a.dispose(); b.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function swayMaterial(bag: Bag, tex: THREE.Texture, amp: number, time: { value: number }): THREE.MeshBasicMaterial {
  const m = bag.add(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.32, side: THREE.DoubleSide }));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sw = sin(uTime * 1.3 + ip.x * 0.6 + ip.z * 0.4) + 0.4 * sin(uTime * 2.9 + ip.z);
        transformed.x += sw * ${amp.toFixed(3)} * position.y * position.y;
        transformed.z += sw * ${(amp * 0.5).toFixed(3)} * position.y * position.y;`);
  };
  m.customProgramCacheKey = () => 'sway' + amp;
  return m;
}

export interface Flora {
  group: THREE.Group;
  update(t: number, tint: THREE.Color, fog: THREE.Color): void;
  /** The band of mist between the land and the far mountains, kept round the camera. */
  mist: THREE.Mesh;
}

export function buildFlora(bag: Bag, slots: PlantSlot[], reduced: boolean): Flora {
  const group = new THREE.Group();
  group.name = 'flora';
  const time = { value: 0 };
  const rng = makeRng(3131);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const nearBridge = (x: number, z: number) => BRIDGE.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 1.8);

  // --- grass tufts: at the feet of stones, lanterns, tablets, and here and there by the path
  const spots: [number, number][] = [];
  const around = (x: number, z: number, r: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = r * rng.range(0.8, 1.5);
      spots.push([x + Math.cos(a) * d, z + Math.sin(a) * d]);
    }
  };
  for (const r of ROCKS) around(r.x, r.z, r.w * 0.7, 4);
  for (const l of LANTERNS) around(l.x, l.z, 0.35, 2);
  for (const sl of slots) if (!sl.inWater) { around(sl.tablet.x, sl.tablet.z, 0.35, 2); around(sl.x, sl.z, 0.6, 2); }
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, rr = rng.range(4, 22);
    spots.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const grassSpots = spots.filter(([x, z]) => pondQ(x, z) > 1.12 && polyDist(LOOP, x, z) > 0.45 && SPURS.every((sp) => polyDist(sp, x, z) > 0.45));
  const tuftGeo = bag.add(crossedQuad(0.42, 0.3));
  const tufts = new THREE.InstancedMesh(tuftGeo, swayMaterial(bag, canvasTexture(bag, tuftCanvas(7)), reduced ? 0 : 0.18, time), Math.max(1, grassSpots.length));
  tufts.count = grassSpots.length;
  grassSpots.forEach(([x, z], i) => {
    e.set(0, rng() * Math.PI, 0); q.setFromEuler(e);
    const k = rng.range(0.6, 1.25);
    p.set(x, terrainY(x, z) - 0.02, z); s.set(k, k * rng.range(0.8, 1.2), k);
    tufts.setMatrixAt(i, m4.compose(p, q, s));
  });
  tufts.instanceMatrix.needsUpdate = true;
  group.add(tufts);

  // --- reeds: a few clumps where the bank bends, never on the bridge
  const reedSpots: [number, number][] = [];
  for (const deg of [165, 30, 318]) {
    const a = (deg * Math.PI) / 180;
    for (let i = 0; i < 5; i++) {
      const aa = a + rng.range(-0.12, 0.12), qq = rng.range(0.9, 1.04);
      const x = POND.x + Math.cos(aa) * POND.rx * qq, z = POND.z + Math.sin(aa) * POND.rz * qq;
      if (nearBridge(x, z)) continue;
      reedSpots.push([x, z]);
    }
  }
  const reedGeo = bag.add(crossedQuad(0.6, 1.55));
  const reeds = new THREE.InstancedMesh(reedGeo, swayMaterial(bag, canvasTexture(bag, reedCanvas(11)), reduced ? 0 : 0.035, time), Math.max(1, reedSpots.length));
  reeds.count = reedSpots.length;
  reedSpots.forEach(([x, z], i) => {
    e.set(0, rng() * Math.PI, 0); q.setFromEuler(e);
    const k = rng.range(0.7, 1.15);
    p.set(x, Math.max(POND.waterY - 0.05, terrainY(x, z) - 0.03), z); s.set(k, k, k);
    reeds.setMatrixAt(i, m4.compose(p, q, s));
  });
  reeds.instanceMatrix.needsUpdate = true;
  group.add(reeds);

  // --- mist: a ring of soft wisps between the garden and the mountains (云雾)
  const mc = canvas(1024, 128);
  const mg = mc.getContext('2d')!;
  for (let i = 0; i < 70; i++) {
    const x = rng() * 1024, y = rng.range(40, 100), w = rng.range(60, 260), h = rng.range(8, 26);
    for (const dx of [-1024, 0, 1024]) {
      const grd = mg.createRadialGradient(x + dx, y, 0, x + dx, y, w);
      grd.addColorStop(0, `rgba(255,255,255,${rng.range(0.25, 0.55)})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      mg.save();
      mg.translate(x + dx, y);
      mg.scale(1, h / w);
      mg.translate(-(x + dx), -y);
      mg.fillStyle = grd;
      mg.fillRect(x + dx - w, y - w, w * 2, w * 2);
      mg.restore();
    }
  }
  const mistTex = canvasTexture(bag, mc);
  mistTex.wrapS = THREE.RepeatWrapping;
  mistTex.repeat.set(2, 1);
  const mistMat = bag.add(new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, opacity: 0.85 }));
  const mist = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(215, 215, 34, 64, 1, true).translate(0, 7, 0)), mistMat);
  mist.frustumCulled = false;
  mist.renderOrder = -4;
  group.add(mist);

  const tuftMat = tufts.material as THREE.MeshBasicMaterial;
  const reedMat = reeds.material as THREE.MeshBasicMaterial;
  return {
    group,
    mist,
    update(t, tint, fog) {
      time.value = t;
      tuftMat.color.copy(tint);
      reedMat.color.copy(tint);
      mistMat.color.copy(fog);
      mistTex.offset.x = (t * 0.002) % 1;
    },
  };
}
