// The things you climb: crates, wine jars, flat stones, 梅花桩 poles, a whitewashed wall with a
// tiled cap, a woodshed's roof, a drying terrace (晒台) with laundry, stairs, a scholar rock (太湖石),
// an old pine with a walkable limb. Each prop's top is a walkable deck at exactly the height it is
// drawn (regions/water-decks), its sides stop you (a deck higher than a step is a wall to a walker),
// and it stands on the ground (its foot reaches the lowest ground under it). One Builder per place:
// everything merges into one vertex-coloured mesh plus its ink outline (two draws).
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import type { RegionId } from '../../map';
import { registerDeck, type Deck } from '../../regions/water-decks';
import { makeRng, type Rng } from '../../../../core/rng';
import { type Bag, inked } from '../kit';
import { merge, part } from '../geo';

export type PropKind = 'crate' | 'jar' | 'stone' | 'pole' | 'wall' | 'shed' | 'terrace' | 'stair' | 'rock' | 'plank' | 'pine' | 'slab';

export interface PropSpec {
  kind: PropKind;
  x: number;
  z: number;
  /** Walkable top, metres above the place's base height (see Builder). */
  h: number;
  /** Turn about +Y (radians): the prop's length (w) runs along its local x. */
  ry?: number;
  /** Length along local x, and depth along local z (m). Round props use r. */
  w?: number;
  d?: number;
  r?: number;
  /** Shed: the eave height (above base); pine: the limb's height at the trunk. */
  low?: number;
  /** Pole / stone accents: a cinnabar band (start / finish). */
  mark?: boolean;
  /** Stair: steps rise toward +x (1) or −x (−1). */
  dir?: 1 | -1;
  /** Terrace: laundry on the poles. */
  laundry?: boolean;
  seed?: number;
}

/** Warm, painterly colours: ochre wood, warm stone, whitewash, 花青 tiles, a touch of cinnabar. */
export const C = {
  wood: '#a0805e',
  woodLight: '#b39373',
  woodDark: '#6e5540',
  woodGrey: '#86735f',
  endGrain: '#d3b98f',
  stone: '#b5aa95',
  stoneWarm: '#bdae93',
  stoneDark: '#8c7e69',
  moss: '#86984f',
  lime: '#f0e8d6',
  plinth: '#9a917f',
  tile: '#4f6168',
  tileDark: '#3b4a52',
  jar: '#7a4f2e',
  jarGlaze: '#5e3b22',
  cinnabar: '#c0412f',
  gamboge: '#d9a62e',
  rope: '#c8a86e',
  lake: '#c7c0ad',
  lakeDark: '#a59d8a',
  pineBark: '#76583f',
  pineNeedle: '#4d7a4c',
  pineNeedle2: '#6a8f4f',
  indigoCloth: '#3f5f86',
  rougeCloth: '#c8676b',
  whiteCloth: '#f1ead9',
  ochreCloth: '#d19a4a',
} as const;

const TAU = Math.PI * 2;
/**
 * How far a walkable top reaches past the drawn edge: the walker is tested at its centre, so without
 * this its body would sink into the side of a crate before the top stopped it. A foot may rest a
 * hand's breadth beyond the edge instead, which reads as standing on it.
 */
const EDGE = 0.18;
/** A pine limb's walkable half width, and how far its deck reaches past the tip. */
const LIMB_HW = 0.3;
const LIMB_TIP = 0.15;

export interface BuiltProp {
  spec: PropSpec;
  /** The base the prop was built from, its foot, and its walkable top (absolute y). */
  base: number;
  foot: number;
  top: number;
  /** Its walkable top, as registered (the last deck it made), for exact on-top tests. */
  deck: Deck | null;
}

/**
 * Builds one place's props into merged geometry and registers their decks. Heights are relative to
 * the place's `base` (the ground at its anchor), so a route rises by exactly what the numbers say
 * even on sloping ground.
 */
export class Builder {
  readonly parts: T.BufferGeometry[] = [];
  readonly decks: Deck[] = [];
  readonly built: BuiltProp[] = [];
  /** Tall props the camera must not hide behind. */
  readonly occluders: { x: number; z: number; r: number; y0: number; y1: number }[] = [];
  private n = 0;

  constructor(readonly ctx: WorldCtx, readonly id: string, readonly base: number) {}

  private get THREE() { return this.ctx.THREE; }

  /** The lowest ground under a footprint (so nothing floats). */
  footAt(x: number, z: number, hx: number, hz: number, ry = 0): number {
    const c = Math.cos(ry), s = Math.sin(ry);
    let lo = this.ctx.groundY(x, z);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = a * hx, lz = b * hz;
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      lo = Math.min(lo, this.ctx.groundY(px, pz));
      const w = this.ctx.waterAt(px, pz);
      if (w !== null) lo = Math.min(lo, w - 0.6);
    }
    return lo - 0.05;
  }

  /** A flat deck over an oriented rectangle (local x = length). */
  deck(x: number, z: number, ry: number, hl: number, hw: number, y: number | ((s: number) => number)): Deck {
    const d: Deck = {
      id: `parkour:${this.id}:${this.n++}`,
      cx: x, cz: z, ax: Math.cos(ry), az: -Math.sin(ry), hl, hw,
      y: typeof y === 'number' ? () => y : y,
    };
    this.decks.push(d);
    return d;
  }

  private put(g: T.BufferGeometry, color: string, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | [number, number, number] = 1): void {
    this.parts.push(part(this.THREE, g, color, { p: [x, y, z], r: [rx, ry, rz], s }));
  }

  /** A box whose local position (lx, ly, lz) is in the prop's frame at (x, z) turned by ry. */
  private boxL(o: { x: number; z: number; ry: number }, lx: number, ly: number, lz: number, w: number, h: number, d: number, color: string, tilt: [number, number] = [0, 0]): void {
    const c = Math.cos(o.ry), s = Math.sin(o.ry);
    const g = new this.THREE.BoxGeometry(w, h, d);
    if (tilt[0] || tilt[1]) {
      g.rotateX(tilt[0]);
      g.rotateZ(tilt[1]);
    }
    this.put(g, color, o.x + lx * c + lz * s, ly, o.z - lx * s + lz * c, o.ry);
  }

  add(spec: PropSpec): BuiltProp {
    const rng = makeRng(spec.seed ?? (Math.round(spec.x * 131 + spec.z * 71) | 0));
    const top = this.base + spec.h;
    const ry = spec.ry ?? 0;
    const n0 = this.decks.length;
    let foot = top;
    switch (spec.kind) {
      case 'crate': foot = this.crate(spec, top, ry, rng); break;
      case 'jar': foot = this.jar(spec, top, rng); break;
      case 'stone': foot = this.stone(spec, top, rng, false); break;
      case 'slab': foot = this.stone(spec, top, rng, true); break;
      case 'pole': foot = this.pole(spec, top, rng); break;
      case 'wall': foot = this.wall(spec, top, ry); break;
      case 'shed': foot = this.shed(spec, top, ry, rng); break;
      case 'terrace': foot = this.terrace(spec, top, ry, rng); break;
      case 'stair': foot = this.stair(spec, top, ry); break;
      case 'rock': foot = this.rock(spec, top, rng); break;
      case 'plank': foot = this.plank(spec, top, ry); break;
      case 'pine': foot = this.pine(spec, top, ry, rng); break;
    }
    const b: BuiltProp = { spec, base: this.base, foot, top, deck: this.decks.length > n0 ? this.decks[this.decks.length - 1] : null };
    this.built.push(b);
    return b;
  }

  // ─────────────── the props ───────────────

  /** Stacked crates up to `top`: one box per ~0.5 m, each a little turned. */
  private crate(p: PropSpec, top: number, ry: number, rng: Rng): number {
    const w = p.w ?? 1, d = p.d ?? w;
    const foot = this.footAt(p.x, p.z, w / 2, d / 2, ry);
    const H = top - foot;
    const n = Math.max(1, Math.round(H / 0.55));
    const hEach = H / n;
    for (let i = 0; i < n; i++) {
      const y0 = foot + i * hEach;
      const tw = i === n - 1 ? 0 : (rng() - 0.5) * 0.12;
      const o = { x: p.x, z: p.z, ry: ry + tw };
      const col = rng() < 0.5 ? C.wood : C.woodLight;
      this.boxL(o, 0, y0 + hEach / 2, 0, w, hEach - 0.02, d, col);
      // two dark bands, and slats on the faces
      for (const t of [0.2, 0.8]) this.boxL(o, 0, y0 + hEach * t, 0, w + 0.03, 0.06, d + 0.03, C.woodDark);
      this.boxL(o, 0, y0 + hEach / 2, 0, 0.07, hEach - 0.04, d + 0.035, C.woodDark);
    }
    this.deck(p.x, p.z, ry, w / 2 + EDGE, d / 2 + EDGE, top);
    this.tall(p.x, p.z, Math.max(w, d) * 0.55, foot, top);
    return foot;
  }

  /** A wine jar (酒坛) with a red paper label and a cloth-tied lid. */
  private jar(p: PropSpec, top: number, rng: Rng): number {
    const r = p.r ?? 0.34;
    const foot = this.footAt(p.x, p.z, r, r);
    const H = top - foot;
    const pts = [[0, 0], [r * 0.7, 0], [r * 0.95, H * 0.25], [r, H * 0.52], [r * 0.82, H * 0.8], [r * 0.52, H * 0.9], [r * 0.56, H * 0.96], [r * 0.5, H], [0, H]].map(([a, b]) => new this.THREE.Vector2(a, b));
    const g = new this.THREE.LatheGeometry(pts, 12);
    this.put(g, rng() < 0.5 ? C.jar : C.jarGlaze, p.x, foot, p.z, rng() * TAU);
    // lid cloth and the red label facing a random way
    this.put(new this.THREE.CylinderGeometry(r * 0.56, r * 0.62, 0.08, 12), C.ochreCloth, p.x, top - 0.03, p.z);
    const a = rng() * TAU;
    const label = new this.THREE.BoxGeometry(r * 0.75, r * 0.75, 0.02);
    this.put(label, C.cinnabar, p.x + Math.sin(a) * r * 0.99, foot + H * 0.5, p.z + Math.cos(a) * r * 0.99, a, 0, Math.PI / 4);
    this.deck(p.x, p.z, 0, r * 0.62 + EDGE * 0.7, r * 0.62 + EDGE * 0.7, top);
    return foot;
  }

  /** A flat-topped stone (stepping stone, boulder) or a broad slab: a lumpy, rounded boulder cut level on top. */
  private stone(p: PropSpec, top: number, rng: Rng, slab: boolean): number {
    const r = p.r ?? 0.55;
    const w = p.w ?? r * 2, d = p.d ?? r * 2;
    const rx = w / 2, rz = d / 2;
    const ry = p.ry ?? rng() * TAU;
    const foot = this.footAt(p.x, p.z, rx * 0.8, rz * 0.8, ry);
    const H = Math.max(0.2, top - foot);
    // an indexed sphere, so the lumps shade smoothly; displaced by a few smooth waves (the same
    // displacement for the seam's twin vertices), then its crown pressed flat
    const g = new this.THREE.SphereGeometry(1, 10, 7);
    const pos = g.attributes.position;
    const s1 = rng() * 6, s2 = rng() * 6, s3 = rng() * 6;
    const cut = slab ? 0.3 : 0.45;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 1 + 0.11 * Math.sin(3.1 * x + 1.7 * z + s1) + 0.08 * Math.sin(4.3 * y + 2.1 * x + s2) + 0.07 * Math.sin(5.1 * z - 3.3 * y + s3);
      let yy = y * k;
      if (yy > cut) yy = cut + (yy - cut) * 0.06;
      // unit space → the prop: bottom (−1·k) at the foot, the cut at the top
      pos.setXYZ(i, x * k, (yy + 1) / (cut + 1.02), z * k);
    }
    g.computeVertexNormals();
    this.put(g, rng() < 0.5 ? C.stone : C.stoneWarm, p.x, foot - 0.02, p.z, ry, 0, 0, [rx * 1.05, H, rz * 1.05]);
    // a cap of moss (or a cinnabar ribbon for a marked stone)
    if (p.mark) this.put(new this.THREE.CylinderGeometry(0.62, 0.64, 0.04, 16), C.cinnabar, p.x, top + 0.005, p.z, ry, 0, 0, [rx, 1, rz]);
    else if (!slab && rng() < 0.55) this.put(new this.THREE.CylinderGeometry(0.4, 0.46, 0.03, 9), C.moss, p.x + (rng() - 0.5) * rx * 0.3, top + 0.008, p.z + (rng() - 0.5) * rz * 0.3, ry, 0, 0, [rx, 1, rz]);
    this.deck(p.x, p.z, ry, rx * 0.8 + EDGE * 0.5, rz * 0.8 + EDGE * 0.5, top);
    this.tall(p.x, p.z, Math.min(rx, rz), foot, top);
    return foot;
  }

  /** A 梅花桩 post: weathered wood, pale end grain on top, a cinnabar band on the start / finish. */
  private pole(p: PropSpec, top: number, rng: Rng): number {
    const r = p.r ?? 0.24;
    const foot = this.footAt(p.x, p.z, r, r) - 0.1;
    const H = top - foot;
    const g = new this.THREE.CylinderGeometry(r * 0.96, r * 1.05, H, 10, 1);
    this.put(g, rng() < 0.5 ? C.woodGrey : C.woodDark, p.x, foot + H / 2, p.z, rng() * TAU);
    this.put(new this.THREE.CylinderGeometry(r * 0.9, r * 0.96, 0.05, 10), C.endGrain, p.x, top - 0.02, p.z);
    this.put(new this.THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.1, 10), p.mark ? C.cinnabar : C.woodDark, p.x, foot + 0.22, p.z);
    if (p.mark) this.put(new this.THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.07, 10), C.cinnabar, p.x, top - 0.12, p.z);
    // generous: the whole round top (and a hair beyond) holds a foot
    this.deck(p.x, p.z, 0, r * 1.05 + 0.08, r * 1.05 + 0.08, top);
    return foot;
  }

  /** A whitewashed wall (粉墙) with a stone plinth and a tiled cap; walk along the cap. */
  private wall(p: PropSpec, top: number, ry: number): number {
    const w = p.w ?? 4, d = p.d ?? 0.44;
    const foot = this.footAt(p.x, p.z, w / 2, d / 2, ry);
    const o = { x: p.x, z: p.z, ry };
    const capH = 0.2;
    const bodyTop = top - capH;
    this.boxL(o, 0, (foot + bodyTop) / 2, 0, w, bodyTop - foot, d, C.lime);
    this.boxL(o, 0, foot + 0.2, 0, w + 0.03, 0.4, d + 0.04, C.plinth);
    // cap: a tiled saddle roof with a ridge
    const ov = 0.16;
    for (const sd of [-1, 1]) this.boxL(o, 0, bodyTop + 0.06, sd * (d / 4 + ov / 2), w + 0.14, 0.06, d / 2 + ov + 0.02, C.tile, [sd * 0.32, 0]);
    this.boxL(o, 0, top - 0.05, 0, w + 0.2, 0.1, 0.16, C.tileDark);
    this.deck(p.x, p.z, ry, w / 2 + 0.12, d / 2 + 0.14, top);
    this.tall(p.x, p.z, 0.3, foot, top, w, ry);
    return foot;
  }

  /**
   * A woodshed (柴房) with a gable roof: the ridge along local x at `top`, the eaves at `low`. The roof
   * is walkable: a deck across the ridge whose height falls away down both slopes.
   */
  private shed(p: PropSpec, top: number, ry: number, rng: Rng): number {
    const w = p.w ?? 3, d = p.d ?? 2.4;
    const eave = this.base + (p.low ?? p.h - 0.7);
    const foot = this.footAt(p.x, p.z, w / 2, d / 2, ry);
    const o = { x: p.x, z: p.z, ry };
    const hd = d / 2, ov = 0.35;
    const k = (top - eave) / hd;
    // plank walls (a slightly darker band at the foot), a door and a window
    this.boxL(o, 0, (foot + eave) / 2, 0, w, eave - foot, d, C.wood);
    this.boxL(o, 0, foot + 0.18, 0, w + 0.03, 0.36, d + 0.03, C.plinth);
    for (let i = -2; i <= 2; i++) this.boxL(o, (i * w) / 5.2, (foot + eave) / 2, 0, 0.05, eave - foot - 0.1, d + 0.03, C.woodDark);
    this.boxL(o, -w * 0.18, foot + 0.8, hd + 0.02, 0.8, 1.5, 0.04, C.woodDark);
    // gables (triangles as squashed boxes would read wrong: stack three shrinking bars)
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const hh = (top - eave) / 3;
      this.boxL(o, sx * (w / 2 - 0.01), eave + hh * (i + 0.5), 0, 0.06, hh, d * (1 - (i + 0.5) / 3), C.woodLight);
    }
    // the two tiled slopes
    const slope = Math.atan(k);
    const run = hd + ov;
    const len = run / Math.cos(slope);
    for (const sd of [-1, 1]) {
      const cy = top - (run / 2) * k + 0.08;
      this.boxL(o, 0, cy, sd * (run / 2), w + 0.5, 0.1, len, C.tile, [sd * slope, 0]);
      // tile ribs down the slope
      for (let i = -3; i <= 3; i++) this.boxL(o, (i * (w + 0.4)) / 7, cy + 0.07, sd * (run / 2), 0.06, 0.05, len, C.tileDark, [sd * slope, 0]);
    }
    this.boxL(o, 0, top + 0.1, 0, w + 0.6, 0.14, 0.2, C.tileDark);
    // a woodpile against the wall
    for (let i = 0; i < 6; i++) {
      const g = new this.THREE.CylinderGeometry(0.07, 0.07, 0.9, 6);
      g.rotateX(Math.PI / 2);
      const c = Math.cos(ry), s = Math.sin(ry);
      const lx = -w / 2 + 0.4 + (i % 3) * 0.16, lz = -hd - 0.3, ly = foot + 0.08 + Math.floor(i / 3) * 0.14;
      this.put(g, rng() < 0.5 ? C.woodDark : C.endGrain, p.x + lx * c + lz * s, ly, p.z - lx * s + lz * c, ry + Math.PI / 2);
    }
    // the roof deck: its axis runs across the ridge (local z), its height falls off to the eaves
    this.deck(p.x, p.z, ry - Math.PI / 2, run, w / 2 + 0.2, (sAcross) => top + 0.12 - Math.abs(sAcross) * k);
    this.tall(p.x, p.z, Math.min(w, d) * 0.5, foot, top, w, ry);
    return foot;
  }

  /** A drying terrace (晒台): a board platform on posts, a rail, bamboo poles hung with cloth. */
  private terrace(p: PropSpec, top: number, ry: number, rng: Rng): number {
    const w = p.w ?? 2.6, d = p.d ?? 2.2;
    const foot = this.footAt(p.x, p.z, w / 2, d / 2, ry);
    const o = { x: p.x, z: p.z, ry };
    const hw = w / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.boxL(o, sx * (hw - 0.12), (foot + top) / 2, sz * (hd - 0.12), 0.16, top - foot, 0.16, C.woodDark);
    }
    // cross braces
    for (const sz of [-1, 1]) this.boxL(o, 0, (foot + top) / 2, sz * (hd - 0.12), Math.hypot(w, top - foot) * 0.8, 0.08, 0.06, C.woodGrey, [0, Math.atan2(top - foot, w)]);
    this.boxL(o, 0, top - 0.06, 0, w, 0.12, d, C.woodLight);
    for (let i = 0; i < 6; i++) this.boxL(o, -hw + (i + 0.5) * (w / 6), top + 0.005, 0, 0.02, 0.012, d, C.woodDark);
    // a low rail on the back side
    for (const sx of [-1, 0, 1]) this.boxL(o, sx * (hw - 0.1), top + 0.35, -hd + 0.06, 0.07, 0.7, 0.07, C.woodDark);
    this.boxL(o, 0, top + 0.68, -hd + 0.06, w, 0.06, 0.06, C.woodDark);
    if (p.laundry) {
      // two bamboo forks and a pole, cloth hung in cheerful colours (蓝印花布, rouge, white)
      const py = top + 1.55;
      for (const sx of [-1, 1]) this.boxL(o, sx * (hw - 0.2), top + 0.78, hd - 0.3, 0.05, 1.56, 0.05, C.rope);
      const pole = new this.THREE.CylinderGeometry(0.03, 0.03, w + 0.8, 6);
      pole.rotateZ(Math.PI / 2);
      const c = Math.cos(ry), s = Math.sin(ry);
      this.put(pole, C.rope, p.x + (hd - 0.3) * s, py, p.z + (hd - 0.3) * c, ry);
      const cloths = [C.indigoCloth, C.whiteCloth, C.rougeCloth, C.ochreCloth];
      let lx = -hw + 0.1;
      for (let i = 0; i < 3; i++) {
        const cw = 0.45 + rng() * 0.3, ch = 0.7 + rng() * 0.5;
        const g = new this.THREE.PlaneGeometry(cw, ch);
        const col = cloths[(i + Math.floor(rng() * 4)) % 4];
        const cx = lx + cw / 2;
        this.put(g, col, p.x + cx * c + (hd - 0.3) * s, py - ch / 2 - 0.02, p.z - cx * s + (hd - 0.3) * c, ry);
        lx += cw + 0.12;
      }
    }
    this.deck(p.x, p.z, ry, hw + EDGE, hd + EDGE, top);
    this.tall(p.x, p.z, Math.min(hw, hd), foot, top, w, ry);
    return foot;
  }

  /** Wooden stairs rising toward `dir` along local x to `top`, each step no more than a stair's rise. */
  private stair(p: PropSpec, top: number, ry: number): number {
    const w = p.w ?? 2.4, d = p.d ?? 0.9;
    const dir = p.dir ?? 1;
    const foot = this.footAt(p.x, p.z, w / 2, d / 2, ry);
    const o = { x: p.x, z: p.z, ry };
    const rise = top - foot;
    const n = Math.max(2, Math.ceil(rise / 0.3));
    const tread = w / n;
    for (let i = 0; i < n; i++) {
      const yTop = foot + (rise * (i + 1)) / n;
      const lx = dir * (-w / 2 + tread * (i + 0.5));
      this.boxL(o, lx, yTop - 0.05, 0, tread + 0.02, 0.1, d, C.woodLight);
      this.boxL(o, lx, (foot + yTop - 0.1) / 2, 0, 0.08, yTop - 0.1 - foot, d - 0.1, C.woodDark);
    }
    // stringers either side
    const ang = Math.atan2(rise, w);
    for (const sz of [-1, 1]) this.boxL(o, 0, foot + rise / 2, sz * (d / 2 + 0.03), Math.hypot(w, rise), 0.12, 0.05, C.woodDark, [0, dir * ang]);
    this.deck(p.x, p.z, ry, w / 2, d / 2, (s) => {
      const i = Math.min(n - 1, Math.max(0, Math.floor(((dir * s) + w / 2) / tread)));
      return foot + (rise * (i + 1)) / n;
    });
    return foot;
  }

  /** A scholar rock (太湖石): pale, eroded lumps stacked and leaning, a flat seat on top. */
  private rock(p: PropSpec, top: number, rng: Rng): number {
    const r = p.r ?? 0.6;
    const foot = this.footAt(p.x, p.z, r, r);
    const H = top - foot;
    const n = Math.max(2, Math.round(H / 0.55));
    let cx = p.x, cz = p.z;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const rr = r * (1.05 - t * 0.35) * (0.85 + rng() * 0.3);
      const g = new this.THREE.IcosahedronGeometry(1, 1);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const f = 0.78 + rng() * 0.36;
        pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f, pos.getZ(k) * f);
      }
      g.computeVertexNormals();
      const lean = i / n;
      cx = p.x + Math.sin(i * 2.3 + (p.seed ?? 1)) * r * 0.25 * lean;
      cz = p.z + Math.cos(i * 1.7 + (p.seed ?? 1)) * r * 0.25 * lean;
      this.put(g, i % 2 ? C.lake : C.lakeDark, cx, foot + H * t, cz, rng() * TAU, rng() * 0.6, 0, [rr, (H / n) * 0.75, rr * (0.8 + rng() * 0.3)]);
      // the holes: dark dimples on the surface
      if (rng() < 0.8) {
        const a = rng() * TAU;
        this.put(new this.THREE.SphereGeometry(rr * 0.22, 6, 4), C.stoneDark, cx + Math.sin(a) * rr * 0.86, foot + H * t + (rng() - 0.5) * 0.2, cz + Math.cos(a) * rr * 0.86, a, 0, 0, [1, 1.3, 0.5]);
      }
    }
    // the seat
    this.put(new this.THREE.CylinderGeometry(r * 0.62, r * 0.72, 0.16, 9), C.lake, cx, top - 0.08, cz, rng() * TAU);
    this.deck(cx, cz, 0, r * 0.55 + EDGE * 0.5, r * 0.55 + EDGE * 0.5, top);
    this.tall(p.x, p.z, r * 0.8, foot, top);
    return foot;
  }

  /** A board laid across two trestles. */
  private plank(p: PropSpec, top: number, ry: number): number {
    const w = p.w ?? 2.4, d = p.d ?? 0.4;
    const foot = this.footAt(p.x, p.z, w / 2, d / 2, ry);
    const o = { x: p.x, z: p.z, ry };
    this.boxL(o, 0, top - 0.04, 0, w, 0.08, d, C.woodLight);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.boxL(o, sx * (w / 2 - 0.2), (foot + top - 0.08) / 2, sz * (d / 2 - 0.05), 0.08, top - 0.08 - foot, 0.08, C.woodDark);
    this.deck(p.x, p.z, ry, w / 2 + EDGE, d / 2 + EDGE, top);
    return foot;
  }

  /**
   * An old pine leaning over, one long limb reaching out along local +x: the limb is walkable from
   * its tip (at `top`) up toward the trunk (at `low` + base). Needles in flat clouds (云头).
   */
  private pine(p: PropSpec, top: number, ry: number, rng: Rng): number {
    const L = p.w ?? 3.2;
    const trunkY = this.base + (p.low ?? p.h + 0.4);
    const foot = this.footAt(p.x, p.z, 0.4, 0.4) - 0.1;
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx: number, lz = 0) => ({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
    // trunk: two tapering pieces leaning back from the limb, a knot where the limb leaves it
    const H = trunkY - foot + 2.6;
    const lean = Math.atan2(0.45, H);
    const lower = new this.THREE.CylinderGeometry(0.24, 0.32, trunkY - foot + 0.2, 8);
    lower.rotateZ(lean * 0.5);
    this.put(lower, C.pineBark, p.x - Math.sin(lean) * (trunkY - foot) * 0.25 * c, (foot + trunkY + 0.2) / 2, p.z + Math.sin(lean) * (trunkY - foot) * 0.25 * s, ry);
    const upper = new this.THREE.CylinderGeometry(0.12, 0.24, H - (trunkY - foot), 8);
    upper.rotateZ(lean * 1.4);
    const ut = at(-0.35);
    this.put(upper, C.pineBark, ut.x, (trunkY + foot + H) / 2, ut.z, ry);
    this.put(new this.THREE.SphereGeometry(0.3, 8, 6), C.pineBark, p.x, trunkY - 0.15, p.z, ry, 0, 0, [1, 0.8, 1]);
    // the limb: from the trunk out to its tip, a gentle droop toward the tip; its upper side is the deck
    const t0 = 0.5, ang = Math.atan2(trunkY - top, L - t0);
    const len = Math.hypot(L - t0, trunkY - top);
    const mid = at((L + t0) / 2);
    const lg = new this.THREE.CylinderGeometry(0.14, 0.2, len + 0.3, 8);
    lg.rotateZ(Math.PI / 2 - ang);
    this.put(lg, C.pineBark, mid.x, (trunkY + top) / 2 - 0.17, mid.z, ry);
    // needle clouds (云头): flat clusters, a darker layer under a lighter one
    const clouds: [number, number, number, number][] = [[L + 0.2, top + 1.0, 0.3, 1.0], [0, foot + H + 0.2, 0, 1.3], [-0.8, foot + H - 0.8, 0.6, 0.95], [L * 0.5, trunkY + 1.5, -0.5, 1.05]];
    for (const [lx, y, lz, rr] of clouds) {
      const q = at(lx, lz);
      for (let k = 0; k < 4; k++) {
        const a = rng() * TAU, dd = k === 0 ? 0 : rr * 0.55;
        const cx = q.x + Math.cos(a) * dd, cz = q.z + Math.sin(a) * dd;
        const sz = rr * (k === 0 ? 0.8 : 0.55 + rng() * 0.15);
        this.put(new this.THREE.SphereGeometry(1, 9, 5), C.pineNeedle, cx, y - 0.06, cz, rng() * TAU, 0, 0, [sz * 1.1, sz * 0.3, sz]);
        this.put(new this.THREE.SphereGeometry(1, 9, 5), C.pineNeedle2, cx, y + sz * 0.12, cz, rng() * TAU, 0, 0, [sz * 0.9, sz * 0.24, sz * 0.82]);
      }
    }
    // the walkable limb: from near the trunk (at trunkY) down to its tip (at top), and a foot's
    // breadth past the tip and to either side (the walker is tested at its centre, and a jump from
    // below rarely comes in straight along the limb), level beyond the tip
    const x0 = t0 + 0.25, x1 = L + LIMB_TIP;
    const a0 = at(x0), a1 = at(x1);
    const cx = (a0.x + a1.x) / 2, cz = (a0.z + a1.z) / 2;
    const hl = (x1 - x0) / 2;
    const y0 = trunkY - (trunkY - top) * (0.25 / (L - t0));
    this.deck(cx, cz, ry, hl, LIMB_HW, (sAlong) => {
      const lx = x0 + sAlong + hl;
      return lx >= L ? top : y0 + (top - y0) * ((lx - x0) / (L - x0));
    });
    return foot;
  }

  /** Remember a tall prop for the camera. */
  private tall(x: number, z: number, r: number, foot: number, top: number, len = 0, ry = 0): void {
    if (top - foot < 1.2) return;
    if (len > r * 3) {
      // a long wall: a few cylinders along it
      const n = Math.ceil(len / (r * 2.5));
      for (let i = 0; i < n; i++) {
        const lx = -len / 2 + (len * (i + 0.5)) / n;
        this.occluders.push({ x: x + lx * Math.cos(ry), z: z - lx * Math.sin(ry), r, y0: foot, y1: top - 0.3 });
      }
    } else this.occluders.push({ x, z, r, y0: foot, y1: top - 0.3 });
  }

  /**
   * Merge everything into one inked mesh under `parent`, register the decks and occluders.
   * Returns the mesh (null when nothing was built).
   */
  finish(bag: Bag, parent: T.Object3D): T.Mesh | null {
    for (const d of this.decks) bag.onDispose(registerDeck(d));
    for (const o of this.occluders) bag.onDispose(this.ctx.addOccluder(o));
    if (!this.parts.length) return null;
    const geo = merge(this.THREE, this.parts.splice(0));
    const mesh = inked(this.ctx, geo, { width: 0.016 });
    mesh.name = `parkour-${this.id}`;
    bag.add(mesh, parent);
    return mesh;
  }
}

/** The group a region's props go in (hidden with the region when far), or the scene. */
export function groupFor(ctx: WorldCtx, region: RegionId | null): T.Object3D {
  return region ? ctx.regionGroup(region) : ctx.scene;
}
