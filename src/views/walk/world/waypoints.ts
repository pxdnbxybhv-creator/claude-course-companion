// 驿碑 — a waypoint stele in every place (map.ts WAYPOINTS): a warm stone tablet on a plinth under
// a little tiled roof, the place's name brushed down its face with a cinnabar 驿 seal, and a bronze
// lantern on a post beside it. Walk up to one and its lantern is lit for good (the map can then send
// you there). Each stele is one merged mesh (stone, roof and its name share a texture atlas), its
// ink edges, the lantern glass and, once lit, a glow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Waypoint } from '../map';
import { makeRng } from '../../../core/rng';
import { Bag, canvas, canvasTexture, glowTexture, toon } from './kit';

export interface PlacedWaypoint extends Waypoint {
  /** The stele's footing (validated) and the way its face looks (radians, 0 = +z). */
  sx: number;
  sz: number;
  y: number;
  rot: number;
}

export interface Steles {
  /** Light a stele's lantern (at once, or with a little flare when `flare`). */
  light(id: string, flare: boolean): void;
  update(dt: number, t: number, night: number): void;
  /** Where the lantern hangs (for sparks). */
  lanternAt(id: string): THREE.Vector3 | null;
}

const CELL_W = 128, CELL_H = 384, COLS = 8;
const STONE_CELL = 7;

/** The atlas: each name on its own cell of pale stone, and one plain stone cell for the body. */
function atlasCanvas(list: readonly Waypoint[], lang: 'zh' | 'en'): HTMLCanvasElement {
  const c = canvas(CELL_W * COLS, 512);
  const g = c.getContext('2d')!;
  const r = makeRng(3301);
  // the stone: warm grey with a faint grain, used by everything that is not a name
  const sx = STONE_CELL * CELL_W;
  g.fillStyle = '#f4efe6';
  g.fillRect(sx, 0, CELL_W, CELL_H);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${90 + r() * 40},${80 + r() * 30},${60 + r() * 20},${r.range(0.03, 0.09)})`;
    g.fillRect(sx + r() * CELL_W, r() * CELL_H, r.range(1, 5), r.range(1, 3));
  }
  list.forEach((w, i) => {
    const x0 = i * CELL_W;
    g.fillStyle = '#efe6d3';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    // a sunk panel with a fine border
    g.strokeStyle = 'rgba(90,70,48,0.55)';
    g.lineWidth = 3;
    g.strokeRect(x0 + 10, 10, CELL_W - 20, CELL_H - 20);
    for (let k = 0; k < 120; k++) {
      g.fillStyle = `rgba(110,90,60,${r.range(0.03, 0.08)})`;
      g.fillRect(x0 + r() * CELL_W, r() * CELL_H, r.range(1, 4), r.range(1, 3));
    }
    g.fillStyle = '#231c15';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const name = w.zh;
    const n = [...name].length;
    const room = CELL_H - 120;
    const fs = Math.min(76, room / n);
    g.font = `${fs}px "Ma Shan Zheng", "LXGW WenKai", "KaiTi", serif`;
    [...name].forEach((ch, k) => g.fillText(ch, x0 + CELL_W / 2, 30 + fs / 2 + k * fs));
    // the seal: 驿 in cinnabar
    const s = 40, ys = CELL_H - 30 - s;
    g.fillStyle = '#b93a2b';
    g.fillRect(x0 + CELL_W / 2 - s / 2, ys, s, s);
    g.fillStyle = '#f6ecd9';
    g.font = `${s * 0.78}px "Ma Shan Zheng", "LXGW WenKai", serif`;
    g.fillText('驿', x0 + CELL_W / 2, ys + s / 2 + 1);
    if (lang === 'en') {
      // a small latin line under the seal for English readers
      g.fillStyle = 'rgba(35,28,21,0.8)';
      g.font = 'italic 15px "Cormorant Garamond", Georgia, serif';
      g.fillText(w.en.length > 14 ? w.en.slice(0, 13) + '…' : w.en, x0 + CELL_W / 2, CELL_H - 14);
    }
  });
  return c;
}

/** Keep a geometry's shape, give it a flat vertex colour and uvs inside the atlas cell `cell`. */
function paint(geo: THREE.BufferGeometry, color: string, cell: number, full = false): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = new Float32Array(n * 2);
  const src = g.attributes.uv as THREE.BufferAttribute | undefined;
  const u0 = (cell * CELL_W) / (CELL_W * COLS), du = CELL_W / (CELL_W * COLS);
  const v1 = 1, dv = CELL_H / 512;
  for (let i = 0; i < n; i++) {
    let u = src ? src.getX(i) : 0.5, v = src ? src.getY(i) : 0.5;
    if (!full) { u = 0.1 + u * 0.8; v = 0.1 + v * 0.8; }
    uv[i * 2] = u0 + u * du;
    uv[i * 2 + 1] = v1 - dv + v * dv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const STONE = '#c3b69c', PLINTH = '#a39479', TILE = '#46646b', WOOD = '#6b4431', BRONZE = '#8a6534', BRONZE_DK = '#5e4424';

export function buildSteles(bag: Bag, list: readonly PlacedWaypoint[], groupFor: (id: string) => THREE.Object3D, lang: 'zh' | 'en', reduced: boolean): Steles {
  const tex = canvasTexture(bag, atlasCanvas(list, lang));
  const mat = toon(bag, '#ffffff', { vertexColors: true });
  mat.map = tex;
  const lineMat = bag.add(new THREE.LineBasicMaterial({ color: '#2a2018', transparent: true, opacity: 0.6 }));
  const glassOff = bag.add(new THREE.MeshBasicMaterial({ color: '#4d3d2a' }));
  const glassOn = bag.add(new THREE.MeshBasicMaterial({ color: '#ffd489' }));
  const glowMat = bag.add(new THREE.SpriteMaterial({ map: glowTexture(bag, 64), color: '#ffb86b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
  const glassGeo = bag.add(new THREE.BoxGeometry(0.17, 0.2, 0.17));

  const lanterns = new Map<string, { glass: THREE.Mesh; glow: THREE.Sprite; at: THREE.Vector3; flare: number; lit: boolean }>();
  list.forEach((w, i) => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, cell = STONE_CELL) => {
      g.translate(x, y, z);
      parts.push(paint(g, color, cell, cell !== STONE_CELL));
    };
    // plinth, the tablet, a thin moulding, the roof with its wooden eave and ridge
    add(new THREE.BoxGeometry(0.98, 0.3, 0.6), PLINTH, 0, 0.15 - 0.05, 0);
    add(new THREE.BoxGeometry(0.84, 0.08, 0.5), STONE, 0, 0.29, 0);
    add(new THREE.BoxGeometry(0.62, 1.45, 0.2), STONE, 0, 0.33 + 0.725, 0);
    add(new THREE.BoxGeometry(0.72, 0.07, 0.3), WOOD, 0, 1.81, 0);
    const roof = new THREE.ConeGeometry(0.62, 0.36, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(1.25, 1, 0.8);
    add(roof, TILE, 0, 1.84 + 0.18, 0);
    add(new THREE.BoxGeometry(0.5, 0.05, 0.06), '#33474d', 0, 2.2, 0);
    // the name on the face (+z), a sliver proud of the stone
    const face = new THREE.PlaneGeometry(0.48, 1.3);
    add(face, '#ffffff', 0, 1.06, 0.101, i);
    // the bronze lantern on its post, to the right of the stele
    const lx = 0.78, lz = 0.12;
    add(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8), PLINTH, lx, 0.06, lz);
    add(new THREE.CylinderGeometry(0.04, 0.045, 1.12, 6), BRONZE_DK, lx, 0.62, lz);
    add(new THREE.BoxGeometry(0.24, 0.035, 0.24), BRONZE, lx, 1.2, lz);
    for (const [ox, oz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) add(new THREE.BoxGeometry(0.025, 0.24, 0.025), BRONZE_DK, lx + ox, 1.33, lz + oz);
    const cap = new THREE.ConeGeometry(0.2, 0.16, 4, 1);
    cap.rotateY(Math.PI / 4);
    add(cap, BRONZE, lx, 1.53, lz);
    add(new THREE.SphereGeometry(0.035, 6, 4), BRONZE, lx, 1.63, lz);

    const body = bag.add(mergeGeometries(parts, false)!);
    for (const p of parts) p.dispose();
    const g = new THREE.Group();
    g.name = 'stele:' + w.id;
    g.position.set(w.sx, w.y - 0.04, w.sz);
    g.rotation.y = w.rot;
    const mesh = new THREE.Mesh(body, mat);
    g.add(mesh);
    const edges = new THREE.LineSegments(bag.add(new THREE.EdgesGeometry(body, 35)), lineMat);
    g.add(edges);
    const glass = new THREE.Mesh(glassGeo, glassOff);
    glass.position.set(lx, 1.33, lz);
    g.add(glass);
    const glow = new THREE.Sprite(glowMat.clone());
    bag.add(glow.material);
    glow.position.set(lx, 1.33, lz);
    glow.scale.setScalar(1.3);
    glow.visible = false;
    glow.renderOrder = 4;
    g.add(glow);
    groupFor(w.id).add(g);
    g.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    glass.getWorldPosition(at);
    lanterns.set(w.id, { glass, glow, at, flare: 0, lit: false });
  });

  let night = 0;
  return {
    light(id, flare) {
      const l = lanterns.get(id);
      if (!l || l.lit) return;
      l.lit = true;
      l.glass.material = glassOn;
      l.glow.visible = true;
      l.flare = flare && !reduced ? 1 : 0;
    },
    lanternAt(id) {
      return lanterns.get(id)?.at ?? null;
    },
    update(dt, t, n) {
      night = n;
      for (const l of lanterns.values()) {
        if (!l.lit) continue;
        if (l.flare > 0) l.flare = Math.max(0, l.flare - dt / 1.4);
        const flick = reduced ? 1 : 0.93 + 0.07 * Math.sin(t * 6.1 + l.at.x) * Math.sin(t * 2.3 + l.at.z);
        const m = l.glow.material as THREE.SpriteMaterial;
        m.opacity = (0.3 + 0.55 * night) * flick + l.flare * 0.6;
        l.glow.scale.setScalar((1.1 + 0.9 * night) * (1 + l.flare * 2.2));
      }
    },
  };
}
