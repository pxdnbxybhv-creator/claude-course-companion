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
import { Bag, canvas, canvasTexture, tint } from './kit';
import { KIND_H, KIND_R, TALL, POND, terrainY, type PlantSlot } from './site';

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

// Painted bitmaps outlive a world rebuild (festival preview) so switching is instant.
const BMP = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = BMP.get(key);
  if (!c) {
    c = make();
    BMP.set(key, c);
    if (BMP.size > 40) BMP.delete(BMP.keys().next().value as string);
  }
  return c;
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
  const H = KIND_H[spec.kind] * (0.94 + (hashString(spec.key) % 100) / 100 * 0.12);
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
  const geo = bag.add(new THREE.PlaneGeometry(crop.w * k, crop.h * k));
  const cx = crop.x0 + crop.w / 2, cy = crop.y0 + crop.h / 2;
  geo.translate((cx - d.anchor.x) * k, (d.anchor.y - cy) * k, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.order = 'YXZ';
  const baseY = slot.inWater ? POND.waterY - 0.02 : terrainY(slot.x, slot.z) - 0.03;
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
  m.rotation.y = Math.atan2(cam.x - m.position.x, cam.z - m.position.z);
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

function tabletCanvas(text: string, glyph: string | null): HTMLCanvasElement {
  const W = 160, H = 244;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#d3cdbf';
  g.fillRect(0, 0, W, H);
  // stone mottling
  let s = hashString(text) || 1;
  const r = () => ((s = (Math.imul(s ^ (s >>> 13), 1274126177) + 0x6d2b79f5) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(60,55,48,${0.02 + r() * 0.05})`;
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

export interface TabletSpec { x: number; z: number; rot: number; text: string; glyph: string | null }

export function buildTablets(bag: Bag, list: TabletSpec[]): { group: THREE.Group; faces: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.name = 'tablets';
  const faces: THREE.Mesh[] = [];
  if (!list.length) return { group, faces };
  const parts: THREE.BufferGeometry[] = [];
  const lines: THREE.BufferGeometry[] = [];
  const faceGeo = bag.add(new THREE.PlaneGeometry(0.34, 0.52));
  for (const t of list) {
    const y = terrainY(t.x, t.z) - 0.02;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, y, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rot, 0)), new THREE.Vector3(1, 1, 1));
    const pieces = [
      tint(new THREE.BoxGeometry(0.58, 0.12, 0.24).translate(0, 0.06, 0), '#a8a295'),
      tint(new THREE.BoxGeometry(0.44, 0.66, 0.1).translate(0, 0.45, 0), '#c7c1b3'),
      tint(new THREE.BoxGeometry(0.5, 0.06, 0.13).translate(0, 0.8, 0), '#a8a295'),
    ];
    for (const p of pieces) {
      p.applyMatrix4(m);
      parts.push(p);
      lines.push(new THREE.EdgesGeometry(p, 30));
    }
    const mat = bag.add(new THREE.MeshBasicMaterial({ map: canvasTexture(bag, tabletCanvas(t.text, t.glyph)) }));
    const face = new THREE.Mesh(faceGeo, mat);
    face.position.set(0, 0.45, 0.052).applyMatrix4(m);
    face.rotation.y = t.rot;
    faces.push(face);
    group.add(face);
  }
  const body = bag.add(mergeGeometries(parts, false)!);
  for (const p of parts) p.dispose();
  const edge = bag.add(mergeGeometries(lines, false)!);
  for (const l of lines) l.dispose();
  const mat = bag.add(new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(new THREE.Mesh(body, mat));
  group.add(new THREE.LineSegments(edge, bag.add(new THREE.LineBasicMaterial({ color: '#1b1916', transparent: true, opacity: 0.7 }))));
  return { group, faces };
}

export function plantCollider(e: PlantEntity): { x: number; z: number; r: number } | null {
  if (e.slot.inWater) return null;
  return { x: e.slot.x, z: e.slot.z, r: KIND_R[e.kind] };
}

export function interactRadius(kind: PlantKind): number {
  return TALL.has(kind) ? 2.7 : 2.3;
}
