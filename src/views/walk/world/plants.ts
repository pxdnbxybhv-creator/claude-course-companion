// The user's plants, one for each habit, painted by the SAME brush as the 2D garden:
// plantDrawing → strokes → a canvas, set upright on a plane that turns to face you (a cylindrical
// billboard, like a painted stage flat). Beside each stands a small stone tablet with its name.
// Watering (checking in) paints the new strokes onto the texture one by one — the plant grows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Habit, PlantKind } from '../../../core/types';
import type { Drawing } from '../../../ink/types';
import { PIGMENTS } from '../../../ink/types';
import { plantDrawing } from '../../../ink/plants';
import { applyInkGrain, paintDrawing, StrokeAnimation } from '../../../ink/brush';
import { hashString } from '../../../core/rng';
import { Bag, canvas, canvasTexture, tint, toon } from './kit';
import { JAR_H, JAR_R, KIND_H, KIND_R, TALL, POND, terrainY, type PlantSlot } from './site';

const REF_H = 300;
const KIND_SWAY: Record<PlantKind, number> = { bamboo: 1.35, orchid: 1.15, lotus: 1.0, chrysanthemum: 0.9, plum: 0.65, pine: 0.45 };
export const BURST_COLOR: Record<PlantKind, string> = {
  plum: PIGMENTS.rouge, lotus: PIGMENTS.rouge, chrysanthemum: PIGMENTS.gamboge,
  orchid: PIGMENTS.malachite, bamboo: PIGMENTS.malachite, pine: PIGMENTS.ochre,
};

export function vigorFor(freshness: number): number {
  return Math.round((0.4 + 0.6 * Math.max(0, Math.min(1, freshness))) * 10) / 10;
}

function bornCount(d: Drawing, g: number): number {
  let n = 0;
  for (const s of d.strokes) {
    if (s.birth > g) break;
    n++;
  }
  return n;
}

interface Crop { x0: number; y0: number; w: number; h: number }

function cropOf(d: Drawing): Crop {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const st of d.strokes) {
    const poly = st.kind === 'wash' || st.kind === 'fill';
    for (const p of st.pts) {
      const r = poly ? 2 : p.w / 2 + 2;
      if (p.x - r < minX) minX = p.x - r;
      if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r;
      if (p.y + r > maxY) maxY = p.y + r;
    }
  }
  if (!Number.isFinite(minX)) return { x0: 0, y0: 0, w: d.width, h: d.height };
  const pad = 8;
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const x1 = Math.min(d.width, maxX + pad), y1 = Math.min(d.height, Math.max(maxY, d.anchor.y) + pad);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// Painted bitmaps outlive a world rebuild (festival / time preview) so switching is instant; the
// view releases them when you leave the walk (iOS caps the total canvas memory of a page).
const BMP = new Map<string, HTMLCanvasElement>();
const BMP_MAX = 24;
const freeCanvas = (c: HTMLCanvasElement) => { c.width = c.height = 0; };
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = BMP.get(key);
  if (c) {
    // most recently used last
    BMP.delete(key);
    BMP.set(key, c);
    return c;
  }
  c = make();
  BMP.set(key, c);
  while (BMP.size > BMP_MAX) {
    const k = BMP.keys().next().value as string;
    freeCanvas(BMP.get(k)!);
    BMP.delete(k);
  }
  return c;
}

/** Give every cached plant bitmap back (call when leaving the walk, not between rebuilds). */
export function releasePlantBitmaps(): void {
  for (const c of BMP.values()) freeCanvas(c);
  BMP.clear();
}

/** Free a plant's own texture canvas once its world is gone. */
export function freePlant(e: PlantEntity): void {
  e.anim = null;
  const c = e.tex.image as HTMLCanvasElement | undefined;
  if (c && 'width' in c) freeCanvas(c);
}

function paintCrop(d: Drawing, crop: Crop, growth: number, s: number, vigor: number): HTMLCanvasElement {
  const c = canvas(crop.w * s, crop.h * s);
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, -crop.x0 * s, -crop.y0 * s);
  paintDrawing(g, d, growth, { scale: s, vigor });
  g.setTransform(1, 0, 0, 1, 0, 0);
  applyInkGrain(g, c.width, c.height);
  return c;
}

export interface PlantEntity {
  key: string;
  habit: Habit | null;
  kind: PlantKind;
  seed: number;
  slot: PlantSlot;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  drawing: Drawing;
  crop: Crop;
  scale: number;
  /** metres per drawing unit */
  k: number;
  growth: number;
  vigor: number;
  n: number;
  pulse: number;
  phase: number;
  anim: { a: StrokeAnimation; ctx: CanvasRenderingContext2D } | null;
  pendingVigor?: number;
  /** Top of the plant (world y) at its current growth, for effects. */
  topY(): number;
  baseY: number;
}

export interface PlantSpec {
  key: string;
  habit: Habit | null;
  kind: PlantKind;
  seed: number;
  growth: number;
  vigor: number;
}

export function buildPlant(bag: Bag, spec: PlantSpec, slot: PlantSlot, lowEnd: boolean): PlantEntity {
  const d = plantDrawing({ kind: spec.kind, seed: spec.seed, height: REF_H });
  const crop = cropOf(d);
  const H = KIND_H[spec.kind] * (0.94 + (hashString(spec.key) % 100) / 100 * 0.12) * (slot.jar ? 0.72 : 1);
  // metres per drawing unit: the full-grown painted height maps to the kind's real height
  const k = H / Math.max(40, d.anchor.y - crop.y0);
  const maxPx = Math.min(lowEnd ? 720 : 900, Math.max(420, H * 300));
  const s = Math.min(2.6, maxPx / Math.max(crop.h, crop.w));
  const n = bornCount(d, spec.growth);
  const key = `${spec.kind}:${spec.seed}:${n}:${spec.vigor}:${s.toFixed(3)}`;
  const bmp = cached(key, () => paintCrop(d, crop, spec.growth, s, spec.vigor));
  // copy: the texture canvas may be painted into when the plant grows
  const own = canvas(bmp.width, bmp.height);
  own.getContext('2d')!.drawImage(bmp, 0, 0);
  const tex = canvasTexture(bag, own);
  const mat = bag.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide }));
  // a billboard shows one face at a time: draw both sides in one pass (three.js would otherwise
  // draw a transparent double-sided plane twice, back then front)
  mat.forceSinglePass = true;
  const geo = bag.add(new THREE.PlaneGeometry(crop.w * k, crop.h * k));
  const cx = crop.x0 + crop.w / 2, cy = crop.y0 + crop.h / 2;
  geo.translate((cx - d.anchor.x) * k, (d.anchor.y - cy) * k, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.order = 'YXZ';
  const baseY = slot.inWater ? POND.waterY - 0.02 : slot.jar ? terrainY(slot.x, slot.z) + JAR_H - 0.07 : terrainY(slot.x, slot.z) - 0.03;
  mesh.position.set(slot.x, baseY, slot.z);
  mesh.name = 'plant:' + spec.key;
  mesh.renderOrder = 2;
  const e: PlantEntity = {
    key: spec.key, habit: spec.habit, kind: spec.kind, seed: spec.seed, slot, mesh, mat, tex, drawing: d, crop, scale: s, k,
    growth: spec.growth, vigor: spec.vigor, n, pulse: 0, phase: (hashString(spec.key) % 628) / 100, anim: null,
    baseY,
    topY() {
      const i = Math.max(0, e.n - 1);
      let minY = d.anchor.y;
      for (let j = 0; j <= i && j < d.strokes.length; j++) for (const p of d.strokes[j].pts) if (p.y < minY) minY = p.y;
      return baseY + (d.anchor.y - minY) * k;
    },
  };
  return e;
}

/** Grow a plant to a new growth level: new strokes are brushed in one after another. */
export function growPlant(e: PlantEntity, growth: number, vigor: number, reduced: boolean): void {
  const n2 = bornCount(e.drawing, growth);
  e.pulse = 1;
  if (n2 > e.n) {
    const c = e.tex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, -e.crop.x0 * e.scale, -e.crop.y0 * e.scale);
    const strokes = e.drawing.strokes.slice(e.n, n2);
    const per = reduced ? 30 : Math.max(70, Math.min(160, 1400 / strokes.length));
    e.anim = { a: new StrokeAnimation(strokes, ctx, { scale: e.scale, vigor: e.vigor, msPerStroke: per }), ctx };
    e.n = n2;
    e.growth = growth;
    if (vigor !== e.vigor) e.pendingVigor = vigor;
  } else if (n2 !== e.n || vigor !== e.vigor) {
    // un-watered (undo) or the ink strength changed: repaint from scratch
    repaint(e, growth, vigor);
  } else e.growth = growth;
}

export function repaint(e: PlantEntity, growth: number, vigor: number): void {
  const c = e.tex.image as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  const n = bornCount(e.drawing, growth);
  const key = `${e.kind}:${e.seed}:${n}:${vigor}:${e.scale.toFixed(3)}`;
  const bmp = cached(key, () => paintCrop(e.drawing, e.crop, growth, e.scale, vigor));
  g.drawImage(bmp, 0, 0);
  e.tex.needsUpdate = true;
  e.anim = null;
  e.pendingVigor = undefined;
  e.n = n;
  e.growth = growth;
  e.vigor = vigor;
}

/** Per frame: face the camera, sway, grow-pulse, and advance any stroke animation. */
export function tickPlant(e: PlantEntity, dt: number, t: number, cam: THREE.Vector3, tintColor: THREE.Color, reduced: boolean): void {
  const m = e.mesh;
  const dx = cam.x - m.position.x, dz = cam.z - m.position.z;
  m.rotation.y = Math.atan2(dx, dz);
  // a partial spherical billboard: as the view rises the painting leans back toward it (the foot
  // stays planted), so from above a plum never lies on the lawn like a fallen twig
  const elev = Math.atan2(cam.y - (m.position.y + 0.8), Math.hypot(dx, dz));
  m.rotation.x = -Math.max(0, Math.min(0.42, (elev - 0.12) * 0.55));
  const sway = reduced ? 0 : KIND_SWAY[e.kind] * (Math.PI / 180) * (Math.sin(t * 0.7 + e.phase) * 0.7 + Math.sin(t * 1.9 + e.phase * 2) * 0.3);
  m.rotation.z = sway;
  if (e.pulse > 0) {
    e.pulse = Math.max(0, e.pulse - dt / 1.6);
    const p = e.pulse;
    const s = 1 + Math.sin((1 - p) * Math.PI) * 0.06 * p * 2;
    m.scale.set(s, s, 1);
  }
  e.mat.color.copy(tintColor);
  if (e.anim) {
    e.anim.a.step(dt * 1000);
    e.tex.needsUpdate = true;
    if (e.anim.a.done) {
      e.anim.ctx.setTransform(1, 0, 0, 1, 0, 0);
      e.anim = null;
      if (e.pendingVigor !== undefined) {
        const v = e.pendingVigor;
        e.pendingVigor = undefined;
        repaint(e, e.growth, v);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------ tablets

const isCJK = (s: string) => /[㐀-鿿豈-﫿]/.test(s);

const CN = '〇一二三四五六七八九';
/** 1 → 一, 12 → 十二, 105 → 一百零五 (enough for streaks). */
export function cnNum(n: number): string {
  n = Math.max(0, Math.floor(n));
  if (n < 10) return CN[n];
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 1000) {
    const r = n % 100;
    return CN[Math.floor(n / 100)] + '百' + (r === 0 ? '' : r < 10 ? '零' + CN[r] : r < 20 ? '一' + cnNum(r) : cnNum(r));
  }
  return String(n);
}

function tabletCanvas(text: string, glyph: string | null, note: string | null = null, into?: HTMLCanvasElement): HTMLCanvasElement {
  const W = 160, H = 244;
  const c = into ?? canvas(W, H);
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#dccfb3';
  g.fillRect(0, 0, W, H);
  // stone mottling
  let s = hashString(text) || 1;
  const r = () => ((s = (Math.imul(s ^ (s >>> 13), 1274126177) + 0x6d2b79f5) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(92,70,48,${0.02 + r() * 0.05})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 4 + r() * 18, 3 + r() * 10, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(40,36,30,0.45)';
  g.lineWidth = 2;
  g.strokeRect(9, 9, W - 18, H - 18);
  g.fillStyle = '#23201c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text.trim()];
  if (chars.length && isCJK(text)) {
    const list = chars.slice(0, 7);
    const size = Math.min(50, 176 / list.length);
    g.font = `${size}px "LXGW WenKai", "Kaiti SC", "KaiTi", serif`;
    const top = (H - 26 - size * list.length) / 2 + size / 2;
    list.forEach((ch, i) => g.fillText(ch, W / 2, top + i * size));
  } else {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let size = 30;
    g.font = `italic ${size}px "Cormorant Garamond", Georgia, serif`;
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (g.measureText(next).width > W - 30 && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    while (lines.length * size > 150 && size > 16) size -= 2;
    g.font = `italic ${size}px "Cormorant Garamond", Georgia, serif`;
    const top = (H - 30 - size * 1.1 * lines.length) / 2 + size / 2;
    lines.slice(0, 5).forEach((l, i) => g.fillText(l, W / 2, top + i * size * 1.1, W - 24));
  }
  if (note) {
    // the streak, brushed small in the lower corner like a painter's inscription (款); re-brushed
    // on every watering, so the stone keeps count
    g.save();
    g.fillStyle = 'rgba(35,32,28,0.78)';
    if (isCJK(note)) {
      const chars = [...note].slice(0, 7);
      const size = Math.min(15, 96 / chars.length);
      g.font = `${size}px "LXGW WenKai", "Kaiti SC", "KaiTi", serif`;
      chars.forEach((ch, i) => g.fillText(ch, 24, H - 24 - (chars.length - i) * size + size / 2));
    } else {
      g.font = 'italic 15px "Cormorant Garamond", Georgia, serif';
      g.textAlign = 'left';
      g.fillText(note, 17, H - 30, glyph ? W / 2 - 34 : W - 34);
    }
    g.restore();
  }
  if (glyph) {
    // a small cinnabar seal with the plant's character
    g.fillStyle = PIGMENTS.cinnabar;
    g.fillRect(W / 2 - 13, H - 44, 26, 26);
    g.fillStyle = '#f4ead8';
    g.font = '20px "LXGW WenKai", "KaiTi", serif';
    g.fillText(glyph, W / 2, H - 31);
  }
  return c;
}

export interface TabletSpec { x: number; z: number; rot: number; text: string; glyph: string | null; note?: string | null }

export interface Tablets {
  group: THREE.Group;
  /** The name faces (all tablets share one mesh and one texture atlas). */
  faces: THREE.Mesh[];
  /** Re-brush tablet i (its streak changed). */
  rebrush(i: number, spec: TabletSpec): void;
}

const TW = 160, TH = 244, TCOLS = 8;

/**
 * The name tablets: the stone bodies merged into one draw, and every name face in one more — the
 * faces share a texture atlas (one cell per tablet), so a garden of twenty habits still costs two
 * draws and one line pass.
 */
export function buildTablets(bag: Bag, list: TabletSpec[]): Tablets {
  const group = new THREE.Group();
  group.name = 'tablets';
  const faces: THREE.Mesh[] = [];
  if (!list.length) return { group, faces, rebrush() {} };
  const parts: THREE.BufferGeometry[] = [];
  const lines: THREE.BufferGeometry[] = [];
  const faceParts: THREE.BufferGeometry[] = [];
  const cols = Math.min(TCOLS, list.length), rows = Math.ceil(list.length / TCOLS);
  const atlas = canvas(TW * cols, TH * rows);
  const ag = atlas.getContext('2d')!;
  const scratch = canvas(TW, TH);
  const paintCell = (i: number, t: TabletSpec) => {
    tabletCanvas(t.text, t.glyph, t.note ?? null, scratch);
    const cx = (i % TCOLS) * TW, cy = Math.floor(i / TCOLS) * TH;
    ag.clearRect(cx, cy, TW, TH);
    ag.drawImage(scratch, cx, cy);
  };
  list.forEach((t, i) => {
    const y = terrainY(t.x, t.z) - 0.02;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, y, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rot, 0)), new THREE.Vector3(1, 1, 1));
    const pieces = [
      tint(new THREE.BoxGeometry(0.58, 0.12, 0.24).translate(0, 0.06, 0), '#b3a486'),
      tint(new THREE.BoxGeometry(0.44, 0.66, 0.1).translate(0, 0.45, 0), '#d2c6ab'),
      tint(new THREE.BoxGeometry(0.5, 0.06, 0.13).translate(0, 0.8, 0), '#b3a486'),
    ];
    for (const p of pieces) {
      p.applyMatrix4(m);
      parts.push(p);
      lines.push(new THREE.EdgesGeometry(p, 30));
    }
    paintCell(i, t);
    // the face, a sliver in front of the stone, its uvs on this tablet's cell of the atlas
    const f = new THREE.PlaneGeometry(0.34, 0.52).translate(0, 0.45, 0.052);
    f.applyMatrix4(m);
    const uv = f.attributes.uv as THREE.BufferAttribute;
    const u0 = (i % TCOLS) / cols, v0 = 1 - (Math.floor(i / TCOLS) + 1) / rows;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / cols, v0 + uv.getY(k) / rows);
    f.deleteAttribute('normal');
    faceParts.push(f);
  });
  const tex = canvasTexture(bag, atlas);
  const faceMat = bag.add(new THREE.MeshBasicMaterial({ map: tex }));
  const faceGeo = bag.add(mergeGeometries(faceParts, false)!);
  for (const f of faceParts) f.dispose();
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.name = 'tablet-faces';
  faces.push(face);
  group.add(face);
  const body = bag.add(mergeGeometries(parts, false)!);
  for (const p of parts) p.dispose();
  const edge = bag.add(mergeGeometries(lines, false)!);
  for (const l of lines) l.dispose();
  const mat = bag.add(new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(new THREE.Mesh(body, mat));
  group.add(new THREE.LineSegments(edge, bag.add(new THREE.LineBasicMaterial({ color: '#1b1916', transparent: true, opacity: 0.7 }))));
  return {
    group, faces,
    rebrush(i, spec) {
      if (i < 0 || i >= list.length) return;
      paintCell(i, spec);
      tex.needsUpdate = true;
    },
  };
}

export function plantCollider(e: PlantEntity): { x: number; z: number; r: number } | null {
  if (e.slot.inWater) return null;
  return { x: e.slot.x, z: e.slot.z, r: e.slot.jar ? JAR_R + 0.04 : KIND_R[e.kind] };
}

export function interactRadius(kind: PlantKind): number {
  return TALL.has(kind) ? 3.2 : 2.4;
}

// ------------------------------------------------------------------------------------ water jars

/** 荷缸: a glazed stoneware jar for the lotus the pond had no room for. One merged draw call. */
export function buildJars(bag: Bag, slots: PlantSlot[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'jars';
  const list = slots.filter((s) => s.jar);
  if (!list.length) return group;
  const profile: THREE.Vector2[] = [
    [0.001, 0], [0.3, 0], [0.38, 0.08], [0.46, 0.3], [0.47, 0.46], [0.44, 0.58], [JAR_R + 0.02, JAR_H - 0.02], [JAR_R - 0.04, JAR_H], [JAR_R - 0.07, JAR_H - 0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const parts: THREE.BufferGeometry[] = [];
  const water: THREE.BufferGeometry[] = [];
  for (const s of list) {
    const y = terrainY(s.x, s.z) - 0.04;
    parts.push(tint(new THREE.LatheGeometry(profile, 18).translate(s.x, y, s.z), '#46707a', 0.06, hashString(s.key)));
    water.push(new THREE.CircleGeometry(JAR_R - 0.07, 18).rotateX(-Math.PI / 2).translate(s.x, y + JAR_H - 0.09, s.z));
  }
  const body = bag.add(mergeGeometries(parts, false)!);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(body, toon(bag, '#ffffff', { vertexColors: true }));
  mesh.name = 'lotus-jars';
  const edge = new THREE.LineSegments(bag.add(new THREE.EdgesGeometry(body, 40)), bag.add(new THREE.LineBasicMaterial({ color: '#1b1916', transparent: true, opacity: 0.5 })));
  const wg = bag.add(mergeGeometries(water, false)!);
  for (const w of water) w.dispose();
  const wmesh = new THREE.Mesh(wg, bag.add(new THREE.MeshBasicMaterial({ color: '#6f8f7e' })));
  group.add(mesh, edge, wmesh);
  return group;
}
