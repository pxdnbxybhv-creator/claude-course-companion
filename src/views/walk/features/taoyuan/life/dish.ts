// 桃源 · 二期: the dish kit (spec §4.6). One small set of meshes the 特写 films, built on the first
// 特写 of a visit (≤20 ms), cached, repainted per dish, and disposed on the way out:
//   the vessel     one `inked` mesh of LatheGeometry profiles and a few parts (2 draws);
//   the top        a disc with one 512² CanvasTexture painted by F's paintTop (1 draw);
//   the morsels    one InstancedMesh of ≤12 (petals, beads, noodle pieces, cake squares…) (1 draw);
//   the tool       chopsticks, a spoon — or a lid, while it lifts at the stove (1 draw);
//   the steam      one Cloud('glow'): 35 × density points, and 8 more for the glints (1 draw);
//   the tube       the pour, or 汤饼's strand (1 draw, only while it shows; the morsels hide then).
// ≤6 draws and ≤6k triangles at any moment. The materials are propMat, outlineMat, one Lambert with
// the map, the Cloud's and one basic for the tube; the Lambert, the tube's and the instanced toon are
// compiled once in tv.onBuilt (warmDishMaterials), so the first 特写 never hitches. No lights.
//
// Owner: P (特写).
import type * as T from 'three';
import type { WorldCtx } from '../../../types';
import { inked, propMat } from '../../kit';
import { merge, part } from '../../geo';
import { Cloud, type ValleyFx } from '../fx';
import { G, Y_T } from '../places';
import { paintTop } from './paint';
import type { DishId, KindId } from './types';

type Three = WorldCtx['THREE'];
const TAU = Math.PI * 2;

/** What a dish is served in (the 3D vessel; F's paint.ts paints only the food's top). */
export type VesselKind = 'bowl' | 'deep' | 'fu' | 'plate' | 'cup' | 'wide' | 'steamer' | 'jar' | 'twocups' | 'pan' | 'leaf' | 'slab';

interface VesselSpec {
  kind: VesselKind;
  glaze: string;
  /** The food's top: its height and radius (metres, in the vessel's space). */
  topY: number;
  topR: number;
  /** A lid lifts at the stove (蒸, 鸡黍, 菌子羹). */
  lid?: boolean;
}

const V = (kind: VesselKind, glaze: string, topY: number, topR: number, lid = false): VesselSpec => ({ kind, glaze, topY, topR, lid });

/** Each dish's vessel at the seat (the stove's vessel is the same, larger; 笋菹 starts in its jar). */
export const VESSELS: Record<DishId, VesselSpec> = {
  zhou: V('bowl', '#ece6d8', 0.044, 0.066),
  bing: V('pan', '#2b2724', 0.02, 0.088),
  gao: V('steamer', '#b08a4f', 0.062, 0.09, true),
  tangbing: V('deep', '#8a5a3a', 0.058, 0.07),
  jishu: V('fu', '#9a5b3c', 0.078, 0.086, true),
  sunzu: V('plate', '#b9c9b0', 0.016, 0.07),
  xinpei: V('wide', '#8f8c86', 0.036, 0.074),
  weiyu: V('plate', '#9a5b3c', 0.016, 0.08),
  taocha: V('twocups', '#b9c9b0', 0.038, 0.036),
  zisu: V('cup', '#ece6d8', 0.04, 0.037),
  taojiao: V('bowl', '#b9c9b0', 0.044, 0.066),
  shengao: V('plate', '#2e2a30', 0.016, 0.075),
  zhiyu: V('slab', '#5a4a40', 0.03, 0.09),
  's-aigao': V('leaf', '#b08a4f', 0.014, 0.085),
  's-heye': V('leaf', '#557a42', 0.02, 0.08),
  's-guiyu': V('bowl', '#ece6d8', 0.044, 0.066),
  's-junge': V('fu', '#9a5b3c', 0.078, 0.086, true),
};

/** The tool that lifts the morsel in 举 (drinks raise the cup itself). */
export const TOOL: Record<DishId, 'chop' | 'spoon' | null> = {
  zhou: 'spoon', bing: 'chop', gao: 'chop', tangbing: 'chop', jishu: 'chop', sunzu: 'chop', xinpei: null, weiyu: 'chop',
  taocha: null, zisu: null, taojiao: 'spoon', shengao: 'chop', zhiyu: 'chop',
  's-aigao': 'chop', 's-heye': 'chop', 's-guiyu': 'spoon', 's-junge': 'spoon',
};

/** A morsel: where it sits on the top (x, z in the top's radius units), its size (m) and colour; box or lump. */
interface Morsel { x: number; z: number; y?: number; s: [number, number, number]; c: string; r?: number }
interface MorselSet { shape: 'box' | 'lump'; list: Morsel[] }

const ring = (n: number, rad: number, s: [number, number, number], c: string, o = 0): Morsel[] =>
  Array.from({ length: n }, (_, i) => ({ x: Math.cos(o + (i / n) * TAU) * rad, z: Math.sin(o + (i / n) * TAU) * rad, s, c, r: o + (i / n) * TAU }));

/** Each dish's morsels (instance 0 is the one lifted in 举). */
export const MORSELS: Record<DishId, MorselSet> = {
  zhou: { shape: 'lump', list: ring(5, 0.45, [0.012, 0.0025, 0.009], '#f2a9b8', 0.3) },
  bing: { shape: 'box', list: [{ x: 0.1, z: 0.05, s: [0.05, 0.008, 0.035], c: '#c98f3c' }, ...ring(6, 0.5, [0.006, 0.004, 0.006], '#6f9a4a')] },
  gao: { shape: 'box', list: [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].map(([x, z], i) => ({ x, z, s: [0.034, 0.02, 0.034] as [number, number, number], c: '#f4efe2', r: i * 0.08 })) },
  tangbing: { shape: 'box', list: [...ring(5, 0.42, [0.03, 0.004, 0.014], '#efe2c4', 0.7), ...ring(2, 0.2, [0.008, 0.004, 0.008], '#7ea651', 2)] },
  jishu: { shape: 'lump', list: ring(5, 0.36, [0.022, 0.014, 0.018], '#b9793a', 0.4) },
  sunzu: { shape: 'box', list: ring(8, 0.4, [0.034, 0.005, 0.006], '#e9e2bf', 0.2) },
  xinpei: { shape: 'lump', list: ring(6, 0.35, [0.003, 0.002, 0.003], '#f4f0e0', 0.5) },
  weiyu: { shape: 'lump', list: [{ x: -0.3, z: 0, s: [0.04, 0.026, 0.03], c: '#f1ead8' }, { x: 0.32, z: 0.05, s: [0.04, 0.026, 0.032], c: '#4a3a33' }] },
  taocha: { shape: 'lump', list: ring(3, 0.35, [0.009, 0.002, 0.007], '#f7c3cf', 1) },
  zisu: { shape: 'box', list: [{ x: 0.2, z: -0.1, s: [0.022, 0.0015, 0.012], c: '#5c7b3c', r: 0.6 }] },
  taojiao: { shape: 'lump', list: ring(10, 0.42, [0.009, 0.007, 0.009], '#d99a3c', 0.1) },
  shengao: { shape: 'box', list: ring(3, 0.4, [0.034, 0.022, 0.034], '#5b2a55', 0.5) },
  zhiyu: { shape: 'lump', list: [{ x: 0, z: 0, y: 0.018, s: [0.07, 0.02, 0.024], c: '#6b5a45', r: 0.5 }] },
  's-aigao': { shape: 'lump', list: ring(3, 0.4, [0.028, 0.018, 0.028], '#6f9a4a', 0.4) },
  's-heye': { shape: 'box', list: ring(4, 0.5, [0.07, 0.003, 0.05], '#6f9458', 0) },
  's-guiyu': { shape: 'lump', list: [...ring(5, 0.4, [0.018, 0.013, 0.016], '#e7d7b8', 0.3), ...ring(6, 0.62, [0.003, 0.002, 0.003], '#e8b93a', 0.1)] },
  's-junge': { shape: 'lump', list: [...ring(6, 0.42, [0.016, 0.008, 0.014], '#8a6440', 0.2), ...ring(3, 0.2, [0.012, 0.002, 0.003], '#e3cf85', 1.3)] },
};

/** How many glints ride at the end of the steam cloud. */
const GLINTS = 8;
/** The pour's and the strand's tube segments. */
const TUBE_SEGS = 12;
const TUBE_RAD = 5;

// ───────────────────────────── the materials, warmed once per world

interface Mats { top: T.MeshLambertMaterial; tube: T.MeshBasicMaterial; tex: T.CanvasTexture; canvas: HTMLCanvasElement }
const worldMats = new WeakMap<WorldCtx, Mats>();

function matsOf(ctx: WorldCtx): Mats {
  let m = worldMats.get(ctx);
  if (m) return m;
  const TH = ctx.THREE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const tex = new TH.CanvasTexture(canvas);
  tex.colorSpace = TH.SRGBColorSpace;
  tex.anisotropy = 4;
  const top = new TH.MeshLambertMaterial({ map: tex, alphaTest: 0.35 });
  const tube = new TH.MeshBasicMaterial({ color: '#f2e6c8', transparent: true, opacity: 0.85, depthWrite: false });
  m = { top, tube, tex, canvas };
  worldMats.set(ctx, m);
  return m;
}

/**
 * Compile the kit's new programs once, on a hidden dummy (tv.onBuilt): the painted top's Lambert, the
 * tube's basic material and the instanced toon of the morsels. Returns the world's release.
 */
export function warmDishMaterials(ctx: WorldCtx): () => void {
  const TH = ctx.THREE;
  const m = matsOf(ctx);
  const g = new TH.Group();
  const tri = new TH.BufferGeometry();
  tri.setAttribute('position', new TH.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
  tri.setAttribute('normal', new TH.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  tri.setAttribute('uv', new TH.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  tri.setAttribute('color', new TH.BufferAttribute(new Float32Array(9).fill(1), 3));
  g.add(new TH.Mesh(tri, m.top), new TH.Mesh(tri, m.tube));
  const inst = new TH.InstancedMesh(tri, propMat(ctx), 1);
  inst.setMatrixAt(0, new TH.Matrix4());
  inst.setColorAt(0, new TH.Color('#ffffff'));
  g.add(inst);
  try { ctx.renderer.compile(g, ctx.camera, ctx.scene); } catch (e) { console.warn('[walk] taoyuan 特写 warm', e); }
  inst.dispose();
  tri.dispose();
  return () => {
    const mm = worldMats.get(ctx);
    if (!mm) return;
    worldMats.delete(ctx);
    mm.top.dispose();
    mm.tube.dispose();
    mm.tex.dispose();
  };
}

// ───────────────────────────── geometry

/** A lathe from (r, y) pairs, coloured, with its seam closed. */
function lathe(TH: Three, pts: [number, number][], color: string, segs = 24, p: [number, number, number] = [0, 0, 0]): T.BufferGeometry {
  const g = new TH.LatheGeometry(pts.map(([r, y]) => new TH.Vector2(r, y)), segs);
  return part(TH, g, color, { p });
}

/** A bowl-like wall: outer profile up to the rim, then the inner down to the floor. */
function wall(rim: number, h: number, foot: number, t = 0.005, floor = 0.012, belly = 0.5): [number, number][] {
  const out: [number, number][] = [[0.0001, 0], [foot, 0], [foot + 0.002, 0.006]];
  for (let i = 1; i <= 6; i++) {
    const k = i / 6;
    const r = foot + (rim - foot) * Math.pow(k, belly);
    out.push([r, 0.006 + (h - 0.006) * k]);
  }
  for (let i = 6; i >= 0; i--) {
    const k = i / 6;
    const r = Math.max(0.0001, foot * 0.6 + (rim - t - foot * 0.6) * Math.pow(k, belly * 0.9));
    out.push([r, floor + (h - floor) * k]);
  }
  out.push([0.0001, floor]);
  return out;
}

function vesselGeometry(TH: Three, v: VesselSpec, stand: boolean): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  const c = v.glaze;
  switch (v.kind) {
    case 'bowl': parts.push(lathe(TH, wall(0.076, 0.055, 0.034), c)); break;
    case 'deep': parts.push(lathe(TH, wall(0.08, 0.07, 0.036, 0.006, 0.014, 0.6), c)); break;
    case 'wide': parts.push(lathe(TH, wall(0.085, 0.045, 0.04, 0.005, 0.01, 0.4), c)); break;
    case 'cup': parts.push(lathe(TH, wall(0.042, 0.05, 0.026, 0.004, 0.01, 0.8), c, 18)); break;
    case 'twocups':
      parts.push(lathe(TH, wall(0.042, 0.05, 0.026, 0.004, 0.01, 0.8), c, 18));
      // the second cup, full and untouched, beside it
      parts.push(lathe(TH, wall(0.042, 0.05, 0.026, 0.004, 0.01, 0.8), c, 18, [0.1, 0, 0.04]));
      parts.push(part(TH, new TH.CircleGeometry(0.036, 16), '#d9a441', { p: [0.1, 0.04, 0.04], r: [-Math.PI / 2, 0, 0] }));
      break;
    case 'plate': parts.push(lathe(TH, [[0.0001, 0], [0.05, 0], [0.052, 0.006], [0.09, 0.016], [0.094, 0.02], [0.088, 0.02], [0.05, 0.012], [0.0001, 0.012]], c)); break;
    case 'pan':
      parts.push(lathe(TH, [[0.0001, 0], [0.09, 0], [0.1, 0.022], [0.104, 0.026], [0.098, 0.026], [0.088, 0.012], [0.0001, 0.012]], c));
      parts.push(part(TH, new TH.BoxGeometry(0.12, 0.012, 0.022), '#3a2f28', { p: [0.16, 0.02, 0] }));
      break;
    case 'fu':
      parts.push(lathe(TH, [[0.0001, 0], [0.05, 0], [0.08, 0.02], [0.1, 0.05], [0.096, 0.085], [0.09, 0.095], [0.086, 0.095], [0.088, 0.08], [0.09, 0.05], [0.07, 0.024], [0.0001, 0.018]], c));
      for (const s of [-1, 1]) parts.push(part(TH, new TH.BoxGeometry(0.03, 0.012, 0.02), c, { p: [s * 0.108, 0.082, 0] }));
      break;
    case 'steamer':
      for (const [y0, h] of [[0, 0.035], [0.033, 0.035]] as const) {
        parts.push(lathe(TH, [[0.0001, y0], [0.1, y0], [0.1, y0 + h], [0.093, y0 + h], [0.093, y0 + 0.006], [0.0001, y0 + 0.006]], c, 20));
      }
      break;
    case 'jar':
      parts.push(lathe(TH, [[0.0001, 0], [0.06, 0], [0.09, 0.06], [0.085, 0.13], [0.055, 0.16], [0.055, 0.175], [0.0001, 0.175]], '#6b4a30', 18));
      break;
    case 'leaf':
      parts.push(part(TH, new TH.CylinderGeometry(0.095, 0.09, 0.008, 18), c, { p: [0, 0.004, 0] }));
      break;
    case 'slab':
      parts.push(part(TH, new TH.CylinderGeometry(0.11, 0.12, 0.02, 12), '#3a2a22', { p: [0, 0.01, 0] }));
      // the willow twig across it
      parts.push(part(TH, new TH.CylinderGeometry(0.004, 0.004, 0.26, 5), '#8a7048', { p: [0, 0.032, 0], r: [0, 0.5, Math.PI / 2] }));
      break;
  }
  // a low stand where there is no table (the step, the doorstep, the fire, the bank)
  if (stand) {
    const y = -STAND_H;
    parts.push(part(TH, new TH.BoxGeometry(0.34, 0.03, 0.26), '#6b2e24', { p: [0, y + STAND_H - 0.015, 0] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(TH, new TH.BoxGeometry(0.03, STAND_H - 0.03, 0.03), '#5a2a20', { p: [sx * 0.14, y + (STAND_H - 0.03) / 2, sz * 0.1] }));
  }
  return merge(TH, parts);
}

/** The low tray-stand's height (the dish stands on it where there is no table). */
export const STAND_H = 0.36;

function toolGeometry(TH: Three, kind: 'chop' | 'spoon' | 'lid' | 'fulid', lidR = 0.1): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  if (kind === 'chop') {
    for (const s of [-1, 1]) parts.push(part(TH, new TH.CylinderGeometry(0.0022, 0.0035, 0.22, 5), '#8a6a48', { p: [s * 0.006, 0.11, 0], r: [0, 0, s * 0.03] }));
  } else if (kind === 'spoon') {
    parts.push(part(TH, new TH.SphereGeometry(0.018, 10, 5, 0, TAU, Math.PI / 2, Math.PI / 2), '#f2ece0', { s: [1, 0.45, 1.4] }));
    parts.push(part(TH, new TH.BoxGeometry(0.008, 0.004, 0.09), '#f2ece0', { p: [0, 0.012, -0.06], r: [-0.3, 0, 0] }));
  } else if (kind === 'lid') {
    parts.push(lathe(TH, [[0.0001, 0.03], [lidR * 0.6, 0.026], [lidR, 0.004], [lidR + 0.004, 0], [lidR - 0.004, 0], [lidR * 0.6, 0.02], [0.0001, 0.024]], '#b08a4f', 20));
  } else {
    parts.push(lathe(TH, [[0.0001, 0.05], [0.02, 0.05], [0.022, 0.036], [lidR * 0.8, 0.02], [lidR, 0.002], [lidR - 0.004, 0], [0.0001, 0.02]], '#8a4a30', 20));
  }
  return merge(TH, parts);
}

/** Your good as the cook holds it up (亲手). */
function goodGeometry(TH: Three, kind: KindId): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  switch (kind) {
    case 'yu':
      parts.push(part(TH, new TH.IcosahedronGeometry(0.5, 1), '#6b5a45', { s: [0.2, 0.06, 0.07] }));
      parts.push(part(TH, new TH.ConeGeometry(0.04, 0.06, 4), '#5a4a38', { p: [0.12, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3] }));
      break;
    case 'dan': parts.push(part(TH, new TH.SphereGeometry(0.045, 10, 8), '#f4efe2', { s: [1, 1.3, 1] })); break;
    case 'qu': parts.push(part(TH, new TH.BoxGeometry(0.12, 0.05, 0.1), '#b9c2ae')); break;
    case 'shen':
      parts.push(lathe(TH, wall(0.06, 0.04, 0.03), '#ece6d8', 16));
      for (let i = 0; i < 5; i++) parts.push(part(TH, new TH.IcosahedronGeometry(0.014, 0), '#4b2346', { p: [Math.cos(i * 1.3) * 0.025, 0.042, Math.sin(i * 1.3) * 0.025] }));
      break;
    case 'jun': for (let i = 0; i < 3; i++) parts.push(part(TH, new TH.SphereGeometry(0.03, 8, 4, 0, TAU, 0, Math.PI / 2), '#8a6440', { p: [(i - 1) * 0.04, 0.01 * i, 0], s: [1, 0.6, 1] })); break;
    case 'shu': parts.push(part(TH, new TH.SphereGeometry(0.07, 10, 8), '#c8b27a', { s: [1, 1.2, 0.9] })); parts.push(part(TH, new TH.CylinderGeometry(0.02, 0.035, 0.05, 8), '#a8905a', { p: [0, 0.09, 0] })); break;
  }
  return merge(TH, parts);
}

// ───────────────────────────── the kit

export interface KitPose { x: number; y: number; z: number; yaw: number; scale: number }

export class DishKit {
  readonly group: T.Group;
  readonly vessel: T.Mesh;
  readonly top: T.Mesh;
  readonly morsels: T.InstancedMesh;
  readonly tool: T.Mesh;
  readonly tube: T.Mesh;
  readonly steam: Cloud;
  dish: DishId | null = null;
  private vesselKey = '';
  private toolKey = '';
  private readonly boxGeo: T.BufferGeometry;
  private readonly lumpGeo: T.BufferGeometry;
  private readonly mats: Mats;
  private readonly m4: T.Matrix4;
  private readonly q: T.Quaternion;
  private readonly v3: T.Vector3;
  private readonly s3: T.Vector3;
  private readonly col: T.Color;
  /** The morsels' rest layout (the top's space, metres), for the beats to move from. */
  base: { x: number; y: number; z: number; sx: number; sy: number; sz: number; r: number; c: string }[] = [];
  /** The steam: 0 none … 1 full; the glints are set by the director. */
  steamK = 0;
  /** Which glints are lit (a bit each). */
  private glints = 0;
  private steamN: number;
  private seeds: Float32Array;
  private t = 0;
  private offFrame: () => void;
  private disposed = false;

  constructor(readonly ctx: WorldCtx, readonly fx: ValleyFx) {
    const TH = ctx.THREE;
    this.mats = matsOf(ctx);
    this.m4 = new TH.Matrix4(); this.q = new TH.Quaternion(); this.v3 = new TH.Vector3(); this.s3 = new TH.Vector3(); this.col = new TH.Color();
    this.group = new TH.Group();
    this.group.name = 'taoyuan:dish';
    this.group.userData.pocket = true;
    this.group.visible = false;
    this.vessel = inked(ctx, new TH.BufferGeometry(), { width: 0.0025 });
    this.top = new TH.Mesh(new TH.CircleGeometry(1, 40).rotateX(-Math.PI / 2), this.mats.top);
    this.boxGeo = part(TH, new TH.BoxGeometry(1, 1, 1), '#ffffff');
    this.lumpGeo = part(TH, new TH.IcosahedronGeometry(0.5, 1), '#ffffff');
    this.morsels = new TH.InstancedMesh(this.boxGeo, propMat(ctx), 12);
    this.morsels.count = 0;
    this.morsels.frustumCulled = false;
    this.tool = new TH.Mesh(new TH.BufferGeometry(), propMat(ctx));
    this.tool.visible = false;
    this.tube = new TH.Mesh(new TH.BufferGeometry(), this.mats.tube);
    this.tube.visible = false;
    this.tube.frustumCulled = false;
    this.group.add(this.vessel, this.top, this.morsels, this.tool);
    // (the tube is drawn in the valley's space: its ends are anywhere)
    fx.group.add(this.tube);
    const dens = ctx.quality.density;
    this.steamN = ctx.quality.level === 'low' ? 15 : Math.max(15, Math.round(35 * dens));
    this.steam = new Cloud(fx, this.steamN + GLINTS, 'glow');
    this.steam.points.visible = false;
    this.seeds = new Float32Array(this.steamN * 3);
    for (let i = 0; i < this.steamN; i++) { this.seeds[i * 3] = Math.random(); this.seeds[i * 3 + 1] = Math.random(); this.seeds[i * 3 + 2] = Math.random(); }
    ctx.regionGroup('taoyuan').add(this.group);
    this.offFrame = ctx.onFrame((dt) => this.frame(dt));
  }

  /** Dress the kit for a dish: its vessel (and stand), its painted top, its morsels. */
  setDish(dish: DishId, o: { li?: boolean; festival?: boolean; stand?: boolean; jar?: boolean } = {}): void {
    const TH = this.ctx.THREE;
    this.dish = dish;
    const v = o.jar ? { ...VESSELS[dish], kind: 'jar' as const, topY: 0.176, topR: 0.055 } : VESSELS[dish];
    const key = `${v.kind}:${v.glaze}:${o.stand ? 1 : 0}`;
    if (key !== this.vesselKey) {
      this.vesselKey = key;
      const old = this.vessel.geometry;
      const g = vesselGeometry(TH, v, !!o.stand);
      this.vessel.geometry = g;
      const hull = this.vessel.children[0] as T.Mesh | undefined;
      if (hull) hull.geometry = g;
      old.dispose();
    }
    this.paint(dish, o, o.jar ? 'seal' : null);
    this.top.scale.set(v.topR, 1, v.topR);
    this.top.position.set(0, v.topY, 0);
    (this.top.material as T.MeshLambertMaterial).color.set('#ffffff');
    // the morsels
    const m = MORSELS[dish];
    const list = o.jar || (dish === 'xinpei' && o.li) ? [] : m.list.slice(0, 12);
    this.morsels.geometry = m.shape === 'box' ? this.boxGeo : this.lumpGeo;
    this.base = list.map((x) => ({ x: x.x * v.topR, y: v.topY + (x.y ?? x.s[1] * 0.5), z: x.z * v.topR, sx: x.s[0], sy: x.s[1], sz: x.s[2], r: x.r ?? 0, c: x.c }));
    this.morsels.count = this.base.length;
    for (let i = 0; i < this.base.length; i++) {
      this.placeMorsel(i, 0, 0, 0, 1, 0);
      this.morsels.setColorAt(i, this.col.set(this.base[i].c));
    }
    if (this.morsels.instanceColor) this.morsels.instanceColor.needsUpdate = true;
    this.morsels.instanceMatrix.needsUpdate = true;
    this.morsels.visible = this.base.length > 0;
    this.setTool(null);
  }

  /** Repaint the top: the dish (paintTop), or 笋菹's mud seal cracking (`crack` 0…3). */
  paint(dish: DishId, o: { li?: boolean; festival?: boolean } = {}, seal: 'seal' | null = null, crack = 0): void {
    const g = this.mats.canvas.getContext('2d');
    if (!g) return;
    const w = this.mats.canvas.width;
    try {
      if (seal) paintSeal(g, w, crack);
      else paintTop(g, w, dish, { li: o.li, festival: o.festival });
    } catch (e) { console.error('[walk] taoyuan 特写 paint', e); }
    this.mats.tex.needsUpdate = true;
  }

  /** Move morsel i from its rest: (dx, dy, dz) metres, scale k, extra turn about y and a tilt. */
  placeMorsel(i: number, dx: number, dy: number, dz: number, k: number, turn: number, tilt = 0): void {
    const b = this.base[i];
    if (!b) return;
    const TH = this.ctx.THREE;
    this.q.setFromEuler(new TH.Euler(tilt, b.r + turn, 0));
    this.m4.compose(this.v3.set(b.x + dx, b.y + dy, b.z + dz), this.q, this.s3.set(b.sx * k, b.sy * k, b.sz * k));
    this.morsels.setMatrixAt(i, this.m4);
    this.morsels.instanceMatrix.needsUpdate = true;
  }

  /** Where the kit stands (world), turned `yaw` about y, at `scale`. */
  pose(p: KitPose): void {
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.set(0, p.yaw, 0);
    this.group.scale.setScalar(p.scale);
    this.group.visible = true;
    this.group.updateMatrixWorld(true);
  }

  hide(): void {
    this.group.visible = false;
    this.steam.points.visible = false;
    this.tube.visible = false;
    this.steamK = 0;
  }

  /** The tool in play: chopsticks, a spoon, a lid (steamer or 釜), or none. */
  setTool(kind: 'chop' | 'spoon' | 'lid' | 'fulid' | null): void {
    if (!kind) { this.tool.visible = false; return; }
    const lidR = this.dish ? VESSELS[this.dish].topR + 0.01 : 0.1;
    const key = `${kind}:${lidR}`;
    if (key !== this.toolKey) {
      this.toolKey = key;
      const old = this.tool.geometry;
      this.tool.geometry = toolGeometry(this.ctx.THREE, kind, lidR);
      old.dispose();
    }
    this.tool.visible = true;
    this.tool.position.set(0, 0, 0);
    this.tool.rotation.set(0, 0, 0);
  }

  /** The cook's 亲手 beat: your good held up (a fish, an egg, a yeast cake, mulberries, mushrooms, millet) in the tool slot. */
  setGood(kind: KindId): void {
    const key = `good:${kind}`;
    if (key !== this.toolKey) {
      this.toolKey = key;
      const old = this.tool.geometry;
      this.tool.geometry = goodGeometry(this.ctx.THREE, kind);
      old.dispose();
    }
    this.tool.visible = true;
    this.tool.position.set(0, 0, 0);
    this.tool.rotation.set(0, 0, 0);
  }

  /** The food's top centre in world space. */
  topWorld(out: T.Vector3): T.Vector3 {
    return out.copy(this.top.position).applyMatrix4(this.group.matrixWorld);
  }

  /**
   * A tube along a parabola from `a` to `b` (world), dropping `sag` below the chord (negative: an
   * arc), shown up to `k` (0…1) of its length: the pour, the noodle strand.
   */
  tubeAlong(a: T.Vector3, b: T.Vector3, o: { sag: number; k: number; r: number; color: string; opacity?: number }): void {
    const TH = this.ctx.THREE;
    const la = this.fx.local(a), lb = this.fx.local(b);
    const pts: T.Vector3[] = [];
    for (let i = 0; i <= TUBE_SEGS; i++) {
      const u = i / TUBE_SEGS;
      const p = la.clone().lerp(lb, u);
      p.y -= o.sag * 4 * u * (1 - u);
      pts.push(p);
    }
    const curve = new TH.CatmullRomCurve3(pts);
    const old = this.tube.geometry;
    const g = new TH.TubeGeometry(curve, TUBE_SEGS, o.r, TUBE_RAD, false);
    const shown = Math.max(1, Math.round(TUBE_SEGS * Math.max(0, Math.min(1, o.k))));
    g.setDrawRange(0, shown * TUBE_RAD * 6);
    this.tube.geometry = g;
    old.dispose();
    const mat = this.tube.material as T.MeshBasicMaterial;
    mat.color.set(o.color);
    mat.opacity = o.opacity ?? 0.85;
    this.tube.visible = o.k > 0;
  }

  hideTube(): void { this.tube.visible = false; }

  /** A glint (i < 8) at a world point, or off (size 0). */
  glint(i: number, at: T.Vector3 | null, size = 0.05, alpha = 0.9, color = '#fff4d8'): void {
    const j = Math.min(GLINTS - 1, Math.max(0, i));
    const k = this.steamN + j;
    if (!at) { this.steam.set(k, 0, -999, 0, 0, 0); this.glints &= ~(1 << j); return; }
    const l = this.fx.local(at);
    this.steam.set(k, l.x, l.y, l.z, size, alpha, this.col.set(color));
    this.glints |= 1 << j;
  }

  /** Every glint off. */
  clearGlints(): void {
    for (let i = 0; i < GLINTS; i++) this.glint(i, null);
  }

  private frame(dt: number): void {
    if (this.disposed || !this.group.visible) return;
    this.t += dt;
    const on = this.steamK > 0.001 && this.dish !== null;
    // (no steam and no glint: no draw)
    this.steam.points.visible = on || this.glints !== 0;
    if (!on) {
      for (let i = 0; i < this.steamN; i++) this.steam.alpha[i] = 0;
      this.steam.flush();
      return;
    }
    // steam rises off the top, spreads and thins (valley-local coordinates)
    const top = this.topWorld(this.v3);
    const sc = this.group.scale.x;
    const r0 = (this.dish ? VESSELS[this.dish].topR : 0.07) * sc;
    const lx = top.x - G.x, ly = top.y - Y_T, lz = top.z - G.z;
    const col = this.col.set('#fff8ec');
    for (let i = 0; i < this.steamN; i++) {
      const s = this.seeds.subarray(i * 3, i * 3 + 3);
      const life = 1.6 + s[0] * 1.2;
      const u = ((this.t * 0.9 + s[1] * life) % life) / life;
      const a = s[2] * TAU + u * 1.4;
      const spread = r0 * (0.35 + u * 1.3);
      const x = lx + Math.cos(a) * spread * s[0], z = lz + Math.sin(a) * spread * s[0];
      const y = ly + 0.01 + u * (0.22 + s[0] * 0.1) * Math.max(0.6, sc);
      const alpha = Math.sin(Math.PI * u) * 0.16 * this.steamK;
      this.steam.set(i, x + Math.sin(this.t * 1.7 + i) * 0.006 * u, y, z, (0.035 + u * 0.08) * Math.max(0.7, sc), alpha, col);
    }
    this.steam.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.group.removeFromParent();
    this.tube.removeFromParent();
    this.vessel.geometry.dispose();
    this.tool.geometry.dispose();
    this.tube.geometry.dispose();
    this.top.geometry.dispose();
    this.boxGeo.dispose();
    this.lumpGeo.dispose();
    this.morsels.dispose();
    this.steam.dispose();
  }
}

/** 笋菹's jar: the mud seal from above, cracking in three frames. */
function paintSeal(g: CanvasRenderingContext2D, w: number, crack: number): void {
  g.save();
  g.clearRect(0, 0, w, w);
  g.translate(w / 2, w / 2);
  g.scale(w / 200, w / 200);
  const grd = g.createRadialGradient(-20, -24, 10, 0, 0, 100);
  grd.addColorStop(0, '#9b7a55');
  grd.addColorStop(1, '#6d5238');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 100, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(30, 22, 14, 0.85)';
  g.lineCap = 'round';
  const cracks: [number, number][][] = [
    [[-6, -4], [-30, -20], [-52, -18], [-78, -40]],
    [[-6, -4], [20, 10], [44, 4], [70, 26]],
    [[-6, -4], [-2, 30], [-20, 56], [-12, 84]],
  ];
  for (let i = 0; i < Math.min(3, crack); i++) {
    g.lineWidth = 5 - i;
    g.beginPath();
    cracks[i].forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  if (crack >= 3) {
    // the seal gives: a pale sliver of the shoots shows through
    g.fillStyle = 'rgba(233, 226, 191, 0.9)';
    g.beginPath();
    g.moveTo(-6, -4); g.lineTo(18, 8); g.lineTo(-2, 26); g.closePath();
    g.fill();
  }
  g.restore();
}
