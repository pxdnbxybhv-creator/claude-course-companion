// Built things: the moon gate (月洞门) in a white wall, the hexagonal pavilion 问月亭 on the north
// shore, the zigzag bridge (九曲桥), stone lanterns and scholar's rocks (太湖石). Static geometry
// is merged per material with vertex colours: a handful of draw calls for the whole estate.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise2, makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture, glowTexture, outlineMaterial, tint, toon } from './kit';
import { BRIDGE, BRIDGE_HW, BRIDGE_Y, COLUMNS, GATE, LANTERNS, PAVILION, PAVILION_Y, POND, ROCKS, terrainY } from './site';

const INK = '#1b1916';
const STONE = '#cfc8b8';
const WHITEWASH = '#f1ede4';
const TILE = '#5d5c5a';
const LACQUER = '#7b3f31';
const WOOD = '#5b3d2e';

export interface Architecture {
  group: THREE.Group;
  /** Night glows (lanterns): call every frame with night 0..1. */
  setNight(n: number, t: number): void;
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}

// --------------------------------------------------------------------------------------- moon gate

function wallShape(): THREE.Shape {
  const { halfW, top, holeR, holeY } = GATE;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -0.7);
  shape.lineTo(halfW, -0.7);
  shape.lineTo(halfW, top);
  shape.lineTo(-halfW, top);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, holeY, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** Whitewash with rain stains under the coping, a damp band at the foot, a few moss dots. */
function wallCanvas(): HTMLCanvasElement {
  const W = 1024, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = WHITEWASH;
  g.fillRect(0, 0, W, H);
  const r = makeRng(1661);
  // a few soft rain stains under the coping, irregular and pale
  for (let i = 0; i < 16; i++) {
    const x = r() * W, w = r.range(14, 60), len = r.range(40, 130);
    g.save();
    g.translate(x, 6);
    g.scale(1, len / w);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, w);
    grd.addColorStop(0, `rgba(105,98,86,${r.range(0.05, 0.11)})`);
    grd.addColorStop(1, 'rgba(105,98,86,0)');
    g.fillStyle = grd;
    g.fillRect(-w, 0, w * 2, w);
    g.restore();
  }
  const damp = g.createLinearGradient(0, H * 0.62, 0, H);
  damp.addColorStop(0, 'rgba(90,84,70,0)');
  damp.addColorStop(1, 'rgba(90,84,70,0.28)');
  g.fillStyle = damp;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(40,46,36,${r.range(0.15, 0.5)})`;
    g.beginPath();
    g.arc(r() * W, H * r.range(0.8, 0.97), r.range(0.6, 2), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function gateGeometry(): THREE.BufferGeometry[] {
  const { halfW, top, holeR, holeY, thick, z } = GATE;
  const cut = -0.1;
  const a0 = Math.asin(Math.max(-1, Math.min(1, (cut - holeY) / holeR)));
  const out: THREE.BufferGeometry[] = [];
  // tiled coping and ridge
  out.push(tint(place(new THREE.BoxGeometry(halfW * 2 + 0.36, 0.14, thick + 0.4), 0, top + 0.05, z), TILE));
  out.push(tint(place(new THREE.BoxGeometry(halfW * 2 + 0.2, 0.08, 0.14), 0, top + 0.16, z), '#4a4947'));
  // plinth
  out.push(tint(place(new THREE.BoxGeometry(halfW * 2 + 0.04, 0.5, thick + 0.06), -0, -0.1, z), '#9d9990'));
  // gate surround: a thin grey ring of brick around the opening (both faces)
  for (const side of [-1, 1]) {
    const ring = new THREE.RingGeometry(holeR, holeR + 0.12, 48, 1, a0, Math.PI - 2 * a0);
    ring.translate(0, holeY, 0);
    if (side < 0) ring.rotateY(Math.PI);
    ring.translate(0, 0, z + side * (thick / 2 + 0.005));
    out.push(tint(ring, '#a39f96'));
  }
  return out;
}

// ---------------------------------------------------------------------------------------- pavilion

function roofGeometry(y0: number, Re: number, H: number): { roof: THREE.BufferGeometry; lines: number[] } {
  const U = 10, V = 9;
  const pos: number[] = [];
  const idx: number[] = [];
  const lines: number[] = [];
  const apex = y0 + H;
  const corner = (i: number) => {
    const a = (i / 6) * Math.PI * 2;
    return [Math.cos(a) * Re, Math.sin(a) * Re];
  };
  for (let s = 0; s < 6; s++) {
    const [ax, az] = corner(s), [bx, bz] = corner(s + 1);
    const base = pos.length / 3;
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      for (let i = 0; i <= U; i++) {
        const u = i / U;
        const e = Math.abs(u - 0.5) * 2; // 0 middle … 1 corner
        const flare = 1 + 0.13 * Math.pow(e, 3);
        const ex = (ax + (bx - ax) * u) * flare, ez = (az + (bz - az) * u) * flare;
        const ey = y0 + 0.42 * Math.pow(e, 2.6);
        const k = 1 - v;
        const y = ey + (apex - ey) * Math.pow(v, 1.7);
        pos.push(ex * k, y, ez * k);
      }
    }
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < U; i++) {
        const a = base + j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    // tile rows (瓦垄): ink lines running up the slope
    for (let i = 1; i < U; i++) {
      for (let j = 0; j < V - 2; j++) {
        const p = base + j * (U + 1) + i, q = p + U + 1;
        lines.push(pos[p * 3], pos[p * 3 + 1] + 0.01, pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1] + 0.01, pos[q * 3 + 2]);
      }
    }
    // hip ridge and eave
    for (let j = 0; j < V; j++) {
      const p = base + j * (U + 1), q = p + U + 1;
      lines.push(pos[p * 3], pos[p * 3 + 1] + 0.02, pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1] + 0.02, pos[q * 3 + 2]);
    }
    for (let i = 0; i < U; i++) {
      const p = base + i, q = p + 1;
      lines.push(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { roof: g, lines };
}

function plaqueCanvas(): HTMLCanvasElement {
  const c = canvas(256, 96);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b2a20';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#8c6a3e';
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#e8d9b0';
  g.font = '60px "Ma Shan Zheng", "LXGW WenKai", "KaiTi", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('问月', 128, 52);
  return c;
}

// ------------------------------------------------------------------------------------------- rocks

export function rockGeometry(seed: number, w: number, h: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const n = makeNoise2(seed);
  const rng = makeRng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const base = new THREE.Color('#b9b3a6');
  const dark = new THREE.Color('#57544e');
  const twist = rng.range(-0.5, 0.5);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const big = n(x * 1.3 + z * 0.8 + 3.1, y * 1.6 - 1.7);
    const fine = n(x * 3.7 - z * 2.1, y * 3.3 + z * 1.9 + 5);
    const r = 1 + 0.3 * big + 0.12 * fine;
    x *= r; y *= r; z *= r;
    // taller, leaning, waisted like a Taihu stone
    const yy = (y + 1) / 2;
    const waist = 1 - 0.28 * Math.sin(yy * Math.PI * 1.1) * (0.5 + 0.5 * n(yy * 3, 9.1));
    const ang = twist * yy;
    const cx = x * Math.cos(ang) - z * Math.sin(ang), cz = x * Math.sin(ang) + z * Math.cos(ang);
    p.setXYZ(i, cx * w * 0.5 * waist + yy * yy * w * 0.2 * twist, (yy * h) - h * 0.12, cz * w * 0.42 * waist);
    // crevices darker (the 皴 of the stone)
    const cav = Math.max(0, -big * 1.3 - fine * 0.5 + 0.1);
    const c = base.clone().lerp(dark, Math.min(1, cav * 1.2 + (1 - yy) * 0.12));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// ----------------------------------------------------------------------------------------- lantern

function lanternParts(x: number, z: number): THREE.BufferGeometry[] {
  const y = terrainY(x, z);
  return [
    tint(place(new THREE.CylinderGeometry(0.24, 0.28, 0.16, 6), x, y + 0.08, z), '#a6a092'),
    tint(place(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 8), x, y + 0.46, z), '#b1ab9e'),
    tint(place(new THREE.CylinderGeometry(0.22, 0.2, 0.08, 6), x, y + 0.8, z), '#a6a092'),
    tint(place(new THREE.BoxGeometry(0.3, 0.28, 0.3), x, y + 0.98, z), '#b8b2a5'),
    tint(place(new THREE.ConeGeometry(0.34, 0.24, 6), x, y + 1.24, z), '#8f8a80'),
    tint(place(new THREE.SphereGeometry(0.06, 8, 6), x, y + 1.4, z), '#8f8a80'),
  ];
}

// ------------------------------------------------------------------------------------------- build

export function buildArchitecture(bag: Bag): Architecture {
  const group = new THREE.Group();
  group.name = 'architecture';
  const lineMat = bag.add(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 }));
  const solid = toon(bag, '#ffffff', { vertexColors: true });

  // --- static stone & plaster, merged
  const parts: THREE.BufferGeometry[] = [];
  const lineParts: THREE.BufferGeometry[] = [];
  const addLined = (g: THREE.BufferGeometry, angle = 28) => {
    parts.push(g);
    lineParts.push(new THREE.EdgesGeometry(g, angle));
  };
  for (const g of gateGeometry()) addLined(g, 30);
  const wallGeo = bag.add(new THREE.ExtrudeGeometry(wallShape(), { depth: GATE.thick, bevelEnabled: false, curveSegments: 20 }));
  wallGeo.translate(0, 0, GATE.z - GATE.thick / 2);
  const wallTex = canvasTexture(bag, wallCanvas());
  wallTex.repeat.set(1 / (GATE.halfW * 2), 1 / (GATE.top + 0.7));
  wallTex.offset.set(0.5, 0.7 / (GATE.top + 0.7));
  const wall = new THREE.Mesh(wallGeo, bag.add(new THREE.MeshLambertMaterial({ map: wallTex })));
  wall.name = 'moon-gate';
  group.add(wall);
  lineParts.push(new THREE.EdgesGeometry(wallGeo, 30));

  // pavilion
  const P = PAVILION;
  const platform = tint(place(new THREE.CylinderGeometry(P.r, P.r + 0.1, 0.6, 6, 1, false, Math.PI / 6), P.x, PAVILION_Y - 0.3, P.z), STONE);
  addLined(platform);
  const colH = 2.3;
  for (const c of COLUMNS) {
    parts.push(tint(place(new THREE.CylinderGeometry(0.1, 0.11, colH, 8), c.x, PAVILION_Y + colH / 2, c.z), LACQUER));
    parts.push(tint(place(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 8), c.x, PAVILION_Y + 0.07, c.z), '#a49e91'));
  }
  const beamY = PAVILION_Y + colH;
  const beam = tint(place(new THREE.CylinderGeometry(P.r - 0.2, P.r - 0.2, 0.22, 6, 1, true, Math.PI / 6), P.x, beamY - 0.06, P.z), WOOD);
  addLined(beam);
  // hanging fretwork (挂落) under the beam
  parts.push(tint(place(new THREE.CylinderGeometry(P.r - 0.24, P.r - 0.24, 0.2, 6, 1, true, Math.PI / 6), P.x, beamY - 0.26, P.z), '#6d4a36'));
  // stone table & stools
  parts.push(tint(place(new THREE.CylinderGeometry(0.42, 0.3, 0.72, 10), P.x, PAVILION_Y + 0.36, P.z), '#b3ad9f'));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push(tint(place(new THREE.CylinderGeometry(0.17, 0.15, 0.42, 8), P.x + Math.cos(a) * 0.85, PAVILION_Y + 0.21, P.z + Math.sin(a) * 0.85), '#aaa496'));
  }
  // finial
  parts.push(tint(place(new THREE.SphereGeometry(0.16, 10, 8), P.x, beamY + 1.75, P.z), '#3c3c3e'));
  parts.push(tint(place(new THREE.ConeGeometry(0.07, 0.35, 8), P.x, beamY + 2.0, P.z), '#3c3c3e'));

  // bridge
  for (let i = 1; i < BRIDGE.length; i++) {
    const [ax, az] = BRIDGE[i - 1], [bx, bz] = BRIDGE[i];
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    addLined(tint(place(new THREE.BoxGeometry(BRIDGE_HW * 2, 0.14, len + BRIDGE_HW * 0.9), mx, BRIDGE_Y - 0.07, mz, ry), STONE, 0.05, i));
    for (const side of [-1, 1]) {
      const ox = Math.cos(ry) * side * (BRIDGE_HW - 0.05), oz = -Math.sin(ry) * side * (BRIDGE_HW - 0.05);
      addLined(tint(place(new THREE.BoxGeometry(0.07, 0.26, Math.max(0.3, len - 0.7)), mx + ox, BRIDGE_Y + 0.13, mz + oz, ry), '#c4bdae'));
    }
  }
  for (const [x, z] of BRIDGE) {
    if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) > 1) continue;
    parts.push(tint(place(new THREE.BoxGeometry(0.4, 0.9, 0.4), x, BRIDGE_Y - 0.55, z), '#8f8a7f'));
  }

  // stone lanterns
  for (const l of LANTERNS) for (const g of lanternParts(l.x, l.z)) addLined(g, 40);

  const merged = bag.add(mergeGeometries(parts, false)!);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(merged, solid);
  mesh.name = 'estate';
  group.add(mesh);
  const edges = bag.add(mergeGeometries(lineParts, false)!);
  for (const g of lineParts) g.dispose();
  group.add(new THREE.LineSegments(edges, lineMat));

  // roof: double-sided tiles with ink ridges and tile rows
  const { roof, lines } = roofGeometry(beamY + 0.05, P.r + 0.55, 1.75);
  bag.add(roof);
  roof.translate(P.x, 0, P.z);
  const roofMat = toon(bag, TILE, { side: THREE.DoubleSide });
  group.add(new THREE.Mesh(roof, roofMat));
  const lg = bag.add(new THREE.BufferGeometry());
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  lg.translate(P.x, 0, P.z);
  group.add(new THREE.LineSegments(lg, bag.add(new THREE.LineBasicMaterial({ color: '#141312', transparent: true, opacity: 0.6 }))));

  // name plaque on the south beam
  const plaque = new THREE.Mesh(bag.add(new THREE.PlaneGeometry(0.75, 0.28)), bag.add(new THREE.MeshBasicMaterial({ map: canvasTexture(bag, plaqueCanvas()) })));
  const southA = Math.PI / 2;
  const apothem = (P.r - 0.2) * Math.cos(Math.PI / 6);
  plaque.position.set(P.x + Math.cos(southA) * (apothem + 0.02), beamY - 0.02, P.z + Math.sin(southA) * (apothem + 0.02));
  group.add(plaque);

  // rocks: one merged mesh + one outline hull
  const rockGeos = ROCKS.map((r) => {
    const g = rockGeometry(r.seed, r.w, r.h);
    g.rotateY((r.seed % 628) / 100);
    g.translate(r.x, terrainY(r.x, r.z), r.z);
    return g;
  });
  const rocks = bag.add(mergeGeometries(rockGeos, false)!);
  for (const g of rockGeos) g.dispose();
  const rockMesh = new THREE.Mesh(rocks, toon(bag, '#ffffff', { vertexColors: true }));
  rockMesh.add(new THREE.Mesh(rocks, outlineMaterial(bag, 0.03)));
  rockMesh.name = 'rocks';
  group.add(rockMesh);

  // --- lights that come on at night: paper lanterns under the eaves, fire in the stone lanterns
  const glowTex = glowTexture(bag, 128);
  const glows: THREE.Sprite[] = [];
  const glowMat = bag.add(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf8a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const addGlow = (x: number, y: number, z: number, s: number) => {
    const sp = new THREE.Sprite(glowMat);
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    sp.userData.s = s;
    glows.push(sp);
    group.add(sp);
  };
  const windowMat = bag.add(new THREE.MeshBasicMaterial({ color: '#5f5a50' }));
  for (const l of LANTERNS) {
    const y = terrainY(l.x, l.z) + 0.98;
    const win = new THREE.Mesh(bag.add(new THREE.BoxGeometry(0.31, 0.14, 0.31)), windowMat);
    win.position.set(l.x, y, l.z);
    group.add(win);
    addGlow(l.x, y, l.z, 1.6);
  }
  const redMat = toon(bag, '#b0473a', { emissive: '#000000' });
  const capMat = toon(bag, '#2b2724');
  const lanternGeo = bag.add(new THREE.SphereGeometry(0.2, 14, 10));
  const capGeo = bag.add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10));
  const cordGeo = bag.add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4));
  const lanternMeshes: THREE.Object3D[] = [];
  for (const ang of [Math.PI / 2 - Math.PI / 6, Math.PI / 2 + Math.PI / 6]) {
    const x = P.x + Math.cos(ang) * (P.r - 0.5), z = P.z + Math.sin(ang) * (P.r - 0.5);
    const y = beamY - 0.65;
    const lan = new THREE.Group();
    lan.position.set(x, y, z);
    const body = new THREE.Mesh(lanternGeo, redMat);
    body.scale.set(1, 1.2, 1);
    const top = new THREE.Mesh(capGeo, capMat); top.position.y = 0.24;
    const bot = new THREE.Mesh(capGeo, capMat); bot.position.y = -0.24;
    const cord = new THREE.Mesh(cordGeo, capMat); cord.position.y = 0.42;
    lan.add(body, top, bot, cord);
    group.add(lan);
    lanternMeshes.push(lan);
    addGlow(x, y, z, 2.4);
  }
  const lamp = new THREE.PointLight('#ffb870', 0, 9, 1.6);
  lamp.position.set(P.x, beamY - 0.8, P.z + 0.6);
  group.add(lamp);

  const warm = new THREE.Color('#f3cf85');
  const cold = new THREE.Color('#5f5a50');
  return {
    group,
    setNight(n: number, t: number) {
      const flick = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
      for (const g of glows) {
        g.visible = n > 0.02;
        (g.material as THREE.SpriteMaterial).opacity = 0.55 * n;
        g.scale.setScalar(g.userData.s * (0.9 + 0.1 * flick));
      }
      windowMat.color.copy(cold).lerp(warm, n * flick);
      redMat.emissive.setRGB(0.55 * n * flick, 0.2 * n * flick, 0.08 * n);
      lamp.intensity = 6 * n * flick;
      lamp.visible = n > 0.02;
      for (let i = 0; i < lanternMeshes.length; i++) lanternMeshes[i].rotation.z = Math.sin(t * 0.9 + i * 2) * 0.03;
    },
  };
}


// ------------------------------------------------------------------------------------ garden wall

/** Lattice for the leak windows (漏窗): a cracked-ice pattern in a round frame. */
function latticeCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = 'rgba(60,58,54,1)';
  g.fillRect(0, 0, S, S);
  // openings: cracked ice (冰裂纹) — random convex cells cut out
  const r = makeRng(5121);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const cx = r.range(20, S - 20), cy = r.range(20, S - 20), rad = r.range(14, 30);
    const n = 3 + Math.floor(r() * 3);
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r.range(-0.3, 0.3);
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  g.restore();
  // the frame
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(70,68,64,1)';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
  g.stroke();
  return c;
}

/** The long white wall round the garden (粉墙黛瓦), following the land, with a few leak windows. */
export function buildGardenWall(bag: Bag, path: [number, number][], h: number, thick: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'garden-wall';
  const n = path.length;
  // per point: position, outward normal (averaged), ground height
  const P = path.map(([x, z], i) => {
    const [ax, az] = path[Math.max(0, i - 1)], [bx, bz] = path[Math.min(n - 1, i + 1)];
    const tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz) || 1;
    return { x, z, nx: tz / l, nz: -tx / l, y: terrainY(x, z) };
  });
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const white = new THREE.Color(WHITEWASH), foot = new THREE.Color('#d9d3c6'), tile = new THREE.Color(TILE), ridge = new THREE.Color('#4a4947');
  const quadStrip = (a: (p: typeof P[0]) => [number, number, number], b: (p: typeof P[0]) => [number, number, number], ca: THREE.Color, cb: THREE.Color) => {
    const base = pos.length / 3;
    for (const p of P) {
      pos.push(...a(p), ...b(p));
      col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    }
    for (let i = 0; i < n - 1; i++) {
      const v = base + i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  };
  const t2 = thick / 2, c2 = thick / 2 + 0.2;
  // outer and inner faces, the top of the wall
  quadStrip((p) => [p.x + p.nx * t2, p.y - 0.5, p.z + p.nz * t2], (p) => [p.x + p.nx * t2, p.y + h, p.z + p.nz * t2], foot, white);
  quadStrip((p) => [p.x - p.nx * t2, p.y + h, p.z - p.nz * t2], (p) => [p.x - p.nx * t2, p.y - 0.5, p.z - p.nz * t2], white, foot);
  // coping: two sloping tile faces meeting at a ridge, overhanging both sides
  quadStrip((p) => [p.x + p.nx * c2, p.y + h - 0.02, p.z + p.nz * c2], (p) => [p.x, p.y + h + 0.26, p.z], tile, ridge);
  quadStrip((p) => [p.x, p.y + h + 0.26, p.z], (p) => [p.x - p.nx * c2, p.y + h - 0.02, p.z - p.nz * c2], ridge, tile);
  // eave undersides
  quadStrip((p) => [p.x + p.nx * t2, p.y + h - 0.02, p.z + p.nz * t2], (p) => [p.x + p.nx * c2, p.y + h - 0.02, p.z + p.nz * c2], tile, tile);
  quadStrip((p) => [p.x - p.nx * c2, p.y + h - 0.02, p.z - p.nz * c2], (p) => [p.x - p.nx * t2, p.y + h - 0.02, p.z - p.nz * t2], tile, tile);
  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toon(bag, '#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'wall';
  group.add(mesh);
  // ink: the eave lines on both sides, the ridge, a line at the foot
  const lines: number[] = [];
  const line = (f: (p: typeof P[0]) => [number, number, number]) => {
    for (let i = 1; i < n; i++) lines.push(...f(P[i - 1]), ...f(P[i]));
  };
  line((p) => [p.x + p.nx * c2, p.y + h - 0.02, p.z + p.nz * c2]);
  line((p) => [p.x - p.nx * c2, p.y + h - 0.02, p.z - p.nz * c2]);
  line((p) => [p.x, p.y + h + 0.27, p.z]);
  line((p) => [p.x + p.nx * (t2 + 0.01), p.y + h - 0.1, p.z + p.nz * (t2 + 0.01)]);
  line((p) => [p.x - p.nx * (t2 + 0.01), p.y + h - 0.1, p.z - p.nz * (t2 + 0.01)]);
  const lg = bag.add(new THREE.BufferGeometry());
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  group.add(new THREE.LineSegments(lg, bag.add(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 }))));
  // leak windows on both faces, all in one draw
  const tex = canvasTexture(bag, latticeCanvas());
  const wpos: number[] = [], wuv: number[] = [], widx: number[] = [];
  for (const f of [0.14, 0.3, 0.5, 0.7, 0.86]) {
    const i = Math.round(f * (n - 1));
    const p = P[i];
    const tx = -p.nz, tz = p.nx; // along the wall
    const sz = 0.62, cy = p.y + h * 0.58;
    for (const side of [1, -1]) {
      const o = t2 + 0.012;
      const base = wpos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const a = (u - 0.5) * 2 * sz, b = (v - 0.5) * 2 * sz;
        wpos.push(p.x + p.nx * o * side + tx * a, cy + b, p.z + p.nz * o * side + tz * a);
        wuv.push(u, v);
      }
      widx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const wg = bag.add(new THREE.BufferGeometry());
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wg.setIndex(widx);
  group.add(new THREE.Mesh(wg, bag.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }))));
  return group;
}
