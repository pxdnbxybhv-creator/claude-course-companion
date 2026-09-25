// Arched stone bridges (拱桥) where the ways cross the river: where the stream runs into the lotus
// lake, where the river leaves it, and one far to the west. The water town's own bridge (at
// ANCHORS.villageBridge) is the village's to build; the core only gives it a walkable deck (and
// paints a plain one when no village module is present). Deck heights are pure numbers here;
// the meshes are built by buildBridges().
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANCHORS, LAKE } from '../map';
import { RIVER_SAMPLES, RIVER_LOWER_START, terrain } from './terrain';
import { Bag, tint, toon } from './kit';

export interface BridgeSpec {
  id: string;
  /** Centre over the water, and the unit axis the deck runs along. */
  x: number; z: number; ax: number; az: number;
  /** Half the span (m) and half the deck width. */
  L: number; hw: number;
  /** Deck height at both ends, and the rise of the arch at the crown. */
  y0: number; H: number;
  waterY: number;
  /** The water town builds its own; the core only keeps its deck walkable. */
  village: boolean;
}

const lakeQ = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);

function specAt(id: string, i: number, village = false): BridgeSpec {
  const T = terrain();
  const s = RIVER_SAMPLES[i];
  const ax = -s.tz, az = s.tx;
  const L = s.w + 2.6;
  const e1 = T.height(s.x + ax * L, s.z + az * L), e2 = T.height(s.x - ax * L, s.z - az * L);
  const y0 = Math.max(e1, e2, s.y + 0.35);
  return { id, x: s.x, z: s.z, ax, az, L, hw: 1.25, y0, H: 1.15 + 0.08 * s.w, waterY: s.y, village };
}

let cache: BridgeSpec[] | null = null;
export function bridgeSpecs(): BridgeSpec[] {
  if (cache) return cache;
  const RS = RIVER_SAMPLES;
  const nearest = (x: number, z: number, from = 0, to = RS.length) => {
    let best = from, bd = Infinity;
    for (let i = from; i < to; i++) { const d = Math.hypot(RS[i].x - x, RS[i].z - z); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  // the stream just before it meets the lake
  let inlet = 0;
  for (let i = 0; i < RIVER_LOWER_START; i++) if (lakeQ(RS[i].x, RS[i].z) < 1.25) { inlet = Math.max(0, i - 5); break; }
  // the river just after it leaves the lake
  let outlet = RIVER_LOWER_START;
  for (let i = RIVER_LOWER_START; i < RS.length; i++) if (lakeQ(RS[i].x, RS[i].z) > 1.3) { outlet = i + 3; break; }
  const v = ANCHORS.villageBridge;
  cache = [
    specAt('inlet', inlet),
    specAt('outlet', outlet),
    specAt('west', nearest(-76, 78, RIVER_LOWER_START)),
    specAt('village', nearest(v.x, v.z, RIVER_LOWER_START), true),
  ];
  return cache;
}

let villageBuilt = false;
/** The water town registered its own bridge deck: stand the core's stand-in down. */
export function setVillageBridgeBuilt(on: boolean): void {
  villageBuilt = on;
}

/** Height of a bridge deck under (x, z), or null when not on one. `pad` widens the test. */
export function deckY(x: number, z: number, pad = 0): number | null {
  for (const b of bridgeSpecs()) {
    if (b.village && villageBuilt) continue;
    const dx = x - b.x, dz = z - b.z;
    const along = dx * b.ax + dz * b.az;
    if (along > b.L + pad || along < -b.L - pad) continue;
    const across = -dx * b.az + dz * b.ax;
    if (across > b.hw - 0.22 + pad || across < -(b.hw - 0.22) - pad) continue;
    const u = Math.max(-1, Math.min(1, along / b.L));
    return b.y0 + b.H * (1 - u * u);
  }
  return null;
}

/** Stone arched bridges, merged: one draw for the stone, one for the ink lines. */
export function buildBridges(bag: Bag, withVillage: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bridges';
  const parts: THREE.BufferGeometry[] = [];
  const lines: THREE.BufferGeometry[] = [];
  for (const b of bridgeSpecs()) {
    if (b.village && !withVillage) continue;
    const mine: THREE.BufferGeometry[] = [];
    const ext = b.L + 0.5;
    const yb = b.waterY - 0.9;
    const deck = (a: number) => { const u = Math.max(-1, Math.min(1, a / b.L)); return b.y0 + b.H * (1 - u * u); };
    // side profile: the deck curve over an elliptical arch opening
    const shape = new THREE.Shape();
    shape.moveTo(-ext, yb);
    const n = 24;
    for (let i = 0; i <= n; i++) { const a = -ext + (2 * ext * i) / n; shape.lineTo(a, deck(a) - 0.02); }
    shape.lineTo(ext, yb);
    const rx = Math.min(b.L - 1.2, 2.9), ry = Math.min(b.y0 + b.H - 0.42 - yb, rx * 1.1);
    shape.lineTo(rx, yb);
    for (let i = 0; i <= 20; i++) { const t = (i / 20) * Math.PI; shape.lineTo(Math.cos(t) * rx, yb + Math.sin(t) * ry); }
    shape.lineTo(-ext, yb);
    const body = new THREE.ExtrudeGeometry(shape, { depth: b.hw * 2, bevelEnabled: false, curveSegments: 4 });
    body.translate(0, 0, -b.hw);
    mine.push(tint(body, '#c9c2b2', 0.06, 17));
    // parapets
    for (const side of [-1, 1]) {
      const ps = new THREE.Shape();
      ps.moveTo(-ext + 0.1, deck(-ext + 0.1) - 0.05);
      for (let i = 0; i <= n; i++) { const a = -ext + 0.1 + ((2 * ext - 0.2) * i) / n; ps.lineTo(a, deck(a) + 0.5); }
      for (let i = n; i >= 0; i--) { const a = -ext + 0.1 + ((2 * ext - 0.2) * i) / n; ps.lineTo(a, deck(a) - 0.05); }
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.14, bevelEnabled: false, curveSegments: 2 });
      pg.translate(0, 0, side > 0 ? b.hw - 0.14 : -b.hw);
      mine.push(tint(pg, '#bdb6a6', 0.05, 23));
      // posts at the ends and the crown
      for (const a of [-ext + 0.18, 0, ext - 0.18]) {
        const post = new THREE.BoxGeometry(0.2, 0.72, 0.2);
        post.translate(a, deck(a) + 0.32, side * (b.hw - 0.07));
        mine.push(tint(post, '#b3ac9c'));
      }
    }
    // orient: shape x → the bridge axis, extrusion z → across
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(b.ax, 0, b.az), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-b.az, 0, b.ax));
    m.setPosition(b.x, 0, b.z);
    for (const g of mine) {
      g.applyMatrix4(m);
      parts.push(g);
      lines.push(new THREE.EdgesGeometry(g, 32));
    }
  }
  if (!parts.length) return group;
  const geo = bag.add(mergeGeometries(parts, false)!);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, toon(bag, '#ffffff', { vertexColors: true }));
  mesh.name = 'bridge-stone';
  group.add(mesh);
  const eg = bag.add(mergeGeometries(lines, false)!);
  for (const g of lines) g.dispose();
  group.add(new THREE.LineSegments(eg, bag.add(new THREE.LineBasicMaterial({ color: '#1b1916', transparent: true, opacity: 0.7 }))));
  return group;
}
