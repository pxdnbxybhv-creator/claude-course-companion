// Built things: the moon gate (月洞门) in a white wall, the hexagonal pavilion 问月亭 on the north
// shore, the zigzag bridge (九曲桥), stone lanterns and scholar's rocks (太湖石). Static geometry
// is merged per material with vertex colours: a handful of draw calls for the whole estate.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise2, makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture, glowTexture, outlineMaterial, tint, toon } from './kit';
import { NO_REFLECT } from './pond';
import { BRIDGE, BRIDGE_HW, BRIDGE_Y, COLUMNS, GATE, LANTERNS, PAVILION, PAVILION_Y, POND, ROCKS, terrainY } from './site';

const INK = '#1b1916';
const STONE = '#d6c8ab';
const WHITEWASH = '#f3ecdc';
const TILE = '#3d5a64';
const LACQUER = '#b8402e';
const WOOD = '#7a4e32';

export interface Architecture {
  group: THREE.Group;
  /** Night glows (lanterns): call every frame with night 0..1. */
  setNight(n: number, t: number): void;
}

/** The same triangles facing the other way (a double-sided surface inside a single-sided merge). */
function backFaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = g.clone();
  const pos = b.attributes.position as THREE.BufferAttribute, nor = b.attributes.normal as THREE.BufferAttribute;
  for (const a of [pos, nor, b.attributes.color as THREE.BufferAttribute]) {
    if (!a) continue;
    // swap the 2nd and 3rd vertex of every triangle
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let c = 0; c < a.itemSize; c++) {
        const k1 = (i + 1) * a.itemSize + c, k2 = (i + 2) * a.itemSize + c;
        const arr = a.array as Float32Array;
        const tmp = arr[k1]; arr[k1] = arr[k2]; arr[k2] = tmp;
      }
    }
  }
  const na = nor.array as Float32Array;
  for (let i = 0; i < na.length; i++) na[i] = -na[i];
  return b;
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
    grd.addColorStop(0, `rgba(120,96,70,${r.range(0.05, 0.11)})`);
    grd.addColorStop(1, 'rgba(120,96,70,0)');
    g.fillStyle = grd;
    g.fillRect(-w, 0, w * 2, w);
    g.restore();
  }
  const damp = g.createLinearGradient(0, H * 0.62, 0, H);
  damp.addColorStop(0, 'rgba(110,88,60,0)');
  damp.addColorStop(1, 'rgba(110,88,60,0.3)');
  g.fillStyle = damp;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(66,98,52,${r.range(0.2, 0.55)})`;
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
  out.push(tint(place(new THREE.BoxGeometry(halfW * 2 + 0.2, 0.08, 0.14), 0, top + 0.16, z), '#2f4650'));
  // plinth
  out.push(tint(place(new THREE.BoxGeometry(halfW * 2 + 0.04, 0.5, thick + 0.06), -0, -0.1, z), '#a8977a'));
  // gate surround: a thin grey ring of brick around the opening (both faces)
  for (const side of [-1, 1]) {
    const ring = new THREE.RingGeometry(holeR, holeR + 0.12, 48, 1, a0, Math.PI - 2 * a0);
    ring.translate(0, holeY, 0);
    if (side < 0) ring.rotateY(Math.PI);
    ring.translate(0, 0, z + side * (thick / 2 + 0.005));
    out.push(tint(ring, '#b09f82'));
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
  g.strokeStyle = '#c99a4a';
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#f0d58e';
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
  const base = new THREE.Color('#c2b397');
  const dark = new THREE.Color('#5c4a3a');
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
    tint(place(new THREE.CylinderGeometry(0.24, 0.28, 0.16, 6), x, y + 0.08, z), '#ab9d83'),
    tint(place(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 8), x, y + 0.46, z), '#b8aa8f'),
    tint(place(new THREE.CylinderGeometry(0.22, 0.2, 0.08, 6), x, y + 0.8, z), '#ab9d83'),
    tint(place(new THREE.BoxGeometry(0.3, 0.28, 0.3), x, y + 0.98, z), '#c1b398'),
    tint(place(new THREE.ConeGeometry(0.34, 0.24, 6), x, y + 1.24, z), '#8d7d64'),
    tint(place(new THREE.SphereGeometry(0.06, 8, 6), x, y + 1.4, z), '#8d7d64'),
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
    parts.push(tint(place(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 8), c.x, PAVILION_Y + 0.07, c.z), '#ae9f84'));
  }
  const beamY = PAVILION_Y + colH;
  const beam = tint(place(new THREE.CylinderGeometry(P.r - 0.2, P.r - 0.2, 0.22, 6, 1, true, Math.PI / 6), P.x, beamY - 0.06, P.z), WOOD);
  addLined(beam);
  // hanging fretwork (挂落) under the beam
  parts.push(tint(place(new THREE.CylinderGeometry(P.r - 0.24, P.r - 0.24, 0.2, 6, 1, true, Math.PI / 6), P.x, beamY - 0.26, P.z), '#2f6a6a'));
  // stone table & stools
  parts.push(tint(place(new THREE.CylinderGeometry(0.42, 0.3, 0.72, 10), P.x, PAVILION_Y + 0.36, P.z), '#bcae93'));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push(tint(place(new THREE.CylinderGeometry(0.17, 0.15, 0.42, 8), P.x + Math.cos(a) * 0.85, PAVILION_Y + 0.21, P.z + Math.sin(a) * 0.85), '#b3a58a'));
  }
  // finial
  parts.push(tint(place(new THREE.SphereGeometry(0.16, 10, 8), P.x, beamY + 1.75, P.z), '#b08a3e'));
  parts.push(tint(place(new THREE.ConeGeometry(0.07, 0.35, 8), P.x, beamY + 2.0, P.z), '#b08a3e'));

  // bridge
  for (let i = 1; i < BRIDGE.length; i++) {
    const [ax, az] = BRIDGE[i - 1], [bx, bz] = BRIDGE[i];
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    addLined(tint(place(new THREE.BoxGeometry(BRIDGE_HW * 2, 0.14, len + BRIDGE_HW * 0.9), mx, BRIDGE_Y - 0.07, mz, ry), STONE, 0.05, i));
    for (const side of [-1, 1]) {
      const ox = Math.cos(ry) * side * (BRIDGE_HW - 0.05), oz = -Math.sin(ry) * side * (BRIDGE_HW - 0.05);
      addLined(tint(place(new THREE.BoxGeometry(0.07, 0.26, Math.max(0.3, len - 0.7)), mx + ox, BRIDGE_Y + 0.13, mz + oz, ry), '#cdbfa4'));
    }
  }
  for (const [x, z] of BRIDGE) {
    if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) > 1) continue;
    parts.push(tint(place(new THREE.BoxGeometry(0.4, 0.9, 0.4), x, BRIDGE_Y - 0.55, z), '#8e7f66'));
  }

  // stone lanterns
  for (const l of LANTERNS) for (const g of lanternParts(l.x, l.z)) addLined(g, 40);

  // roof: tiles seen from above and below (both faces in the one merged mesh), ink ridges and tile rows
  const { roof, lines } = roofGeometry(beamY + 0.05, P.r + 0.55, 1.75);
  roof.translate(P.x, 0, P.z);
  const roofTop = tint(roof, TILE);
  parts.push(roofTop, backFaces(roofTop));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  lg.translate(P.x, 0, P.z);
  lineParts.push(lg);

  // the paper lanterns' caps and cords (their red bodies glow at night: a mesh of their own)
  const hanging: [number, number, number][] = [Math.PI / 2 - Math.PI / 6, Math.PI / 2 + Math.PI / 6].map((ang) => [P.x + Math.cos(ang) * (P.r - 0.5), beamY - 0.65, P.z + Math.sin(ang) * (P.r - 0.5)]);
  const bodies: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of hanging) {
    for (const dy of [0.24, -0.24]) parts.push(tint(place(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), x, y + dy, z), '#2b2724'));
    parts.push(tint(place(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), x, y + 0.42, z), '#2b2724'));
    const b = new THREE.SphereGeometry(0.2, 14, 10);
    b.scale(1, 1.2, 1);
    b.translate(x, y, z);
    b.deleteAttribute('uv');
    bodies.push(b);
  }

  const merged = bag.add(mergeGeometries(parts, false)!);
  for (const g of parts) g.dispose();
  roof.dispose();
  const mesh = new THREE.Mesh(merged, solid);
  mesh.name = 'estate';
  group.add(mesh);
  const edges = bag.add(mergeGeometries(lineParts, false)!);
  for (const g of lineParts) g.dispose();
  // the ink lines stay out of the rippling mirror (a hairline there is lost, the draw is not)
  const edgeLines = new THREE.LineSegments(edges, lineMat);
  edgeLines.layers.set(NO_REFLECT);
  group.add(edgeLines);

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
  const rockInk = new THREE.Mesh(rocks, outlineMaterial(bag, 0.03));
  rockInk.layers.set(NO_REFLECT);
  rockMesh.add(rockInk);
  rockMesh.name = 'rocks';
  group.add(rockMesh);

  // --- lights that come on at night: paper lanterns under the eaves, fire in the stone lanterns.
  // The fire windows are one mesh, the red bodies one more, every glow one point cloud.
  const glowTex = glowTexture(bag, 128);
  const glowAt: number[] = [];
  const windowMat = bag.add(new THREE.MeshBasicMaterial({ color: '#5a4636' }));
  const wins: THREE.BufferGeometry[] = [];
  for (const l of LANTERNS) {
    const y = terrainY(l.x, l.z) + 0.98;
    const w = new THREE.BoxGeometry(0.31, 0.14, 0.31).translate(l.x, y, l.z);
    w.deleteAttribute('uv');
    wins.push(w);
    glowAt.push(l.x, y, l.z);
  }
  const winGeo = bag.add(mergeGeometries(wins, false)!);
  for (const w of wins) w.dispose();
  // small things stay out of the pond's mirror (each reflected mesh is a second draw)
  const winMesh = new THREE.Mesh(winGeo, windowMat);
  winMesh.layers.set(NO_REFLECT);
  group.add(winMesh);
  const redMat = toon(bag, '#c8412f', { emissive: '#000000' });
  const bodyGeo = bag.add(mergeGeometries(bodies, false)!);
  for (const b of bodies) b.dispose();
  const bodyMesh = new THREE.Mesh(bodyGeo, redMat);
  bodyMesh.layers.set(NO_REFLECT);
  group.add(bodyMesh);
  for (const [x, y, z] of hanging) glowAt.push(x, y, z);
  const glowGeo = bag.add(new THREE.BufferGeometry());
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowAt, 3));
  const glowMat = bag.add(new THREE.PointsMaterial({ map: glowTex, color: '#ffcf8a', size: 1.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const glows = new THREE.Points(glowGeo, glowMat);
  glows.name = 'lantern-glows';
  glows.visible = false;
  group.add(glows);
  const lamp = new THREE.PointLight('#ffb870', 0, 9, 1.6);
  lamp.position.set(P.x, beamY - 0.8, P.z + 0.6);
  group.add(lamp);

  const warm = new THREE.Color('#ffc978');
  const cold = new THREE.Color('#5a4636');
  return {
    group,
    setNight(n: number, t: number) {
      const flick = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
      glows.visible = n > 0.02;
      glowMat.opacity = 0.6 * n;
      glowMat.size = 1.9 * (0.9 + 0.1 * flick);
      windowMat.color.copy(cold).lerp(warm, n * flick);
      redMat.emissive.setRGB(0.55 * n * flick, 0.2 * n * flick, 0.08 * n);
      lamp.intensity = 6 * n * flick;
      lamp.visible = n > 0.02;
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
  g.fillStyle = 'rgba(74,62,50,1)';
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
  g.strokeStyle = 'rgba(84,70,56,1)';
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
  const white = new THREE.Color(WHITEWASH), foot = new THREE.Color('#dccfb4'), tile = new THREE.Color(TILE), ridge = new THREE.Color('#2f4650');
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
  const lattice = bag.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  lattice.forceSinglePass = true;
  group.add(new THREE.Mesh(wg, lattice));
  return group;
}
