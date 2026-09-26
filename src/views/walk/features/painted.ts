// Brush-painted billboards for the living things features add (the osmanthus tree, the jade rabbit,
// the ginger cat): drawn as ink display lists and rasterised by the same brush engine as the
// user's plants, then stood up in the world as camera-facing paper flats — one visual language.
import type * as T from 'three';
import type { Drawing, Stroke, StrokeKind } from '../../../ink/types';
import { PIGMENTS } from '../../../ink/types';
import { rasterize } from '../../../ink/brush';
import { makeRng, type Rng } from '../../../core/rng';
import type { Bag } from './kit';
import type { WorldCtx } from '../types';
import { NIGHT_SHADE } from '../regions/water-kit';

const TAU = Math.PI * 2;
const P = PIGMENTS;
const GINGER = '#c4843f'; // ochre warmed with gamboge: a ginger cat's wash

type Pt = [number, number, number?];

class Painter {
  readonly strokes: Stroke[] = [];
  /** Shift everything painted down by this much (to seat a low drawing in a taller frame). */
  dy = 0;
  constructor(readonly rng: Rng) {}
  add(kind: StrokeKind, pts: Pt[], tone: number, extra: Partial<Stroke> = {}): void {
    this.strokes.push({
      kind, tone, birth: 0, seed: this.rng.int(1, 2 ** 31 - 1),
      pts: pts.map(([x, y, w]) => ({ x, y: y + this.dy, w: w ?? 2 })),
      ...extra,
    });
  }
  /** A closed outline of an ellipse (for fill / wash / line). */
  ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 28, from = 0, to = TAU): Pt[] {
    const out: Pt[] = [];
    const c = Math.cos(rot), s = Math.sin(rot);
    const closed = to - from >= TAU - 1e-6;
    const m = closed ? n : n + 1;
    for (let i = 0; i < m; i++) {
      const a = from + ((to - from) * i) / n;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  /** A tapering brush stroke along pts, widths from w0 to w1 (with a soft start). */
  stroke(pts: [number, number][], w0: number, w1: number, tone: number, extra: Partial<Stroke> = {}, kind: StrokeKind = 'brush'): void {
    const n = pts.length;
    this.add(kind, pts.map(([x, y], i) => {
      const k = n > 1 ? i / (n - 1) : 0;
      const w = w0 + (w1 - w0) * k;
      return [x, y, i === 0 ? w * 0.7 : w];
    }), tone, extra);
  }
  /** A fine outline (勾勒) along pts. */
  line(pts: Pt[], w: number, tone = 0.82, color?: string): void {
    this.add('line', pts.map(([x, y]) => [x, y, w]), tone, color ? { color } : {});
  }
  leaf(x: number, y: number, ang: number, len: number, w: number, tone: number, color?: string): void {
    const c = Math.cos(ang), s = Math.sin(ang);
    const bend = (this.rng() - 0.5) * 0.3;
    this.add('brush', [
      [x, y, w * 0.25],
      [x + c * len * 0.45 - s * len * bend * 0.2, y + s * len * 0.45 + c * len * bend * 0.2, w],
      [x + c * len, y + s * len, w * 0.2],
    ], tone, { wet: 0.55, ...(color ? { color } : {}) });
  }
}

function drawing(p: Painter, width: number, height: number, ax: number, ay: number): Drawing {
  return { width, height, anchor: { x: ax, y: ay }, strokes: p.strokes };
}

// ───────────────────────────── 桂 · the osmanthus tree ─────────────────────────────

/** An osmanthus in ink: dry-brush trunk, dabbed leaves, a dusting of gamboge flowers. `hook` is a branch tip to hang a lantern from. */
export function osmanthusDrawing(seed = 815): { drawing: Drawing; hook: { x: number; y: number } } {
  const rng = makeRng(seed);
  const p = new Painter(rng);
  const W = 460, H = 560, AX = 226, AY = 548;
  const r = (a: number, b: number) => a + rng() * (b - a);
  // the ground it stands on, a pale wash
  p.add('wash', p.ellipse(AX, AY - 4, 70, 9, 0, 18).map(([x, y]) => [x, y, 6] as Pt), 0.1);
  // foliage masses first (behind the branches), each a pale wash
  const clusters: [number, number, number][] = [
    [110, 262, 46], [168, 212, 52], [226, 150, 50], [282, 196, 50], [338, 236, 40], [196, 116, 40], [262, 118, 38], [140, 300, 34], [300, 290, 30], [226, 224, 40],
  ];
  for (const [cx, cy, cr] of clusters) {
    p.add('wash', p.ellipse(cx + r(-4, 4), cy + r(-3, 3), cr * 1.15, cr * 0.72, r(-0.2, 0.2), 16).map(([x, y]) => [x, y, 8] as Pt), r(0.1, 0.16));
  }
  // trunk: dry brush, then a dark edge
  p.stroke([[AX, AY], [AX - 8, 480], [AX + 4, 410], [AX - 10, 340], [AX - 4, 280], [AX + 2, 240]], 34, 12, 0.82, { dryness: 0.45 }, 'dry');
  p.stroke([[AX - 2, AY - 2], [AX - 8, 470], [AX + 2, 400], [AX - 8, 330]], 16, 8, 0.55);
  p.stroke([[AX + 12, AY - 6], [AX + 2, 470], [AX + 14, 400], [AX + 2, 330]], 6, 3, 0.92);
  p.stroke([[AX - 16, AY - 4], [AX - 20, 490], [AX - 10, 430]], 4, 2, 0.85);
  // branches
  const branches: [number, number][][] = [
    [[AX - 8, 340], [184, 312], [140, 280], [96, 262]],
    [[AX - 2, 300], [270, 276], [314, 250], [352, 240]],
    [[AX - 2, 268], [214, 214], [206, 160], [214, 112]],
    [[AX, 286], [256, 226], [276, 176]],
    [[AX - 6, 318], [178, 258], [160, 216]],
  ];
  branches.forEach((b, i) => p.stroke(b, i < 2 ? 12 : 9, 2, 0.85, { dryness: 0.25 }));
  // leaves: dabs in five ink tones, a few touched with malachite
  for (const [cx, cy, cr] of clusters) {
    const n = Math.round(cr * 0.75);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * cr;
      const x = cx + Math.cos(a) * d * 1.1, y = cy + Math.sin(a) * d * 0.7;
      const ang = (rng() < 0.5 ? Math.PI : 0) + r(-0.7, 0.7) + 0.25;
      const top = (cy - y) / cr; // darker leaves on top of each mass
      p.leaf(x, y, ang, r(18, 27), r(8, 12), Math.min(0.92, r(0.45, 0.7) + top * 0.18), rng() < 0.15 ? P.malachite : undefined);
    }
  }
  // flowers: tiny clusters of gamboge dots in the leaf axils (金桂)
  for (const [cx, cy, cr] of clusters) {
    for (let k = 0; k < 7; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * cr * 0.9;
      const x = cx + Math.cos(a) * d * 1.05, y = cy + Math.sin(a) * d * 0.65;
      for (let j = 0; j < 3; j++) p.add('dot', [[x + r(-4, 4), y + r(-3, 3), r(3.5, 5.5)]], r(0.75, 0.95), { color: P.gamboge });
    }
  }
  return { drawing: drawing(p, W, H, AX, AY), hook: { x: 346, y: 242 } };
}

// ───────────────────────────── 玉兔 · the jade rabbit ─────────────────────────────

/** A white rabbit in 白描: lead-white body, fine ink outline, a cinnabar eye. Faces +x. */
export function rabbitDrawing(seed = 88): Drawing {
  const p = new Painter(makeRng(seed));
  const W = 230, H = 180, AX = 108, AY = 168;
  p.add('wash', p.ellipse(AX, AY - 3, 64, 7, 0, 16).map(([x, y]) => [x, y, 5] as Pt), 0.1);
  // ears behind the head
  p.add('fill', p.ellipse(142, 44, 9, 32, -0.28, 18), 0.95, { color: P.white });
  p.add('fill', p.ellipse(160, 46, 8.5, 30, 0.1, 18), 0.95, { color: P.white });
  p.add('fill', p.ellipse(143, 46, 4, 22, -0.28, 12), 0.3, { color: P.rouge });
  p.add('fill', p.ellipse(160, 48, 3.6, 20, 0.1, 12), 0.3, { color: P.rouge });
  // body and head
  p.add('fill', p.ellipse(100, 122, 58, 40, -0.1, 30), 0.97, { color: P.white });
  p.add('fill', p.ellipse(154, 90, 27, 23, 0.1, 24), 0.97, { color: P.white });
  p.add('fill', p.ellipse(50, 118, 11, 11, 0, 12), 0.97, { color: P.white }); // tail puff
  // outlines (勾勒), broken where light falls
  p.line(p.ellipse(100, 122, 58, 40, -0.1, 22, Math.PI * 0.72, Math.PI * 1.78), 2.4, 0.85);
  p.line(p.ellipse(154, 90, 27, 23, 0.1, 18, Math.PI * 0.9, Math.PI * 2.35), 2.2, 0.85);
  p.line(p.ellipse(142, 44, 9, 32, -0.28, 16, Math.PI * 0.55, Math.PI * 2.4), 1.8, 0.8);
  p.line(p.ellipse(160, 46, 8.5, 30, 0.1, 16, Math.PI * 0.6, Math.PI * 2.45), 1.8, 0.8);
  p.line(p.ellipse(50, 118, 11, 11, 0, 10, Math.PI * 0.5, Math.PI * 1.6), 1.6, 0.6);
  // haunch, forepaw, hind foot
  p.line([[62, 128], [72, 112], [92, 106], [108, 118]], 1.6, 0.55);
  p.line([[132, 132], [138, 152], [150, 160]], 2, 0.8);
  p.line([[70, 158], [100, 162], [122, 160]], 2.2, 0.8);
  // eye, nose, whiskers
  p.add('dot', [[163, 84, 8]], 0.95, { color: P.cinnabar });
  p.add('dot', [[180, 95, 4]], 0.6, { color: P.rouge });
  p.line([[176, 98], [196, 94]], 0.9, 0.45);
  p.line([[176, 100], [195, 104]], 0.9, 0.45);
  return drawing(p, W, H, AX, AY);
}

// ───────────────────────────── 大橘 · the ginger cat ─────────────────────────────

/** The cat asleep: curled into a loaf, tail round its paws. Faces +x. Same frame as catAwakeDrawing. */
export function catAsleepDrawing(seed = 606): Drawing {
  const p = new Painter(makeRng(seed));
  p.dy = 90;
  const W = 250, H = 240, AX = 122, AY = 140;
  p.add('wash', p.ellipse(AX, AY - 2, 92, 8, 0, 16).map(([x, y]) => [x, y, 6] as Pt), 0.12);
  p.add('wash', p.ellipse(116, 102, 80, 38, 0, 30).map(([x, y]) => [x, y, 5] as Pt), 0.62, { color: GINGER });
  p.add('wash', p.ellipse(182, 106, 30, 25, 0, 20).map(([x, y]) => [x, y, 4] as Pt), 0.62, { color: GINGER });
  p.add('fill', [[164, 90], [170, 64], [184, 86]], 0.7, { color: GINGER });
  p.add('fill', [[186, 86], [200, 66], [206, 92]], 0.7, { color: GINGER });
  // stripes across the back (the ink does the fur)
  for (const [x, y] of [[70, 72], [96, 66], [122, 64], [148, 70]] as [number, number][]) p.stroke([[x, y], [x - 4, y + 14], [x - 2, y + 26]], 7, 1.5, 0.62);
  p.stroke([[176, 86], [180, 94]], 4, 1, 0.6);
  p.stroke([[188, 85], [190, 94]], 4, 1, 0.6);
  // white muzzle and paws
  p.add('fill', p.ellipse(200, 118, 12, 9, 0, 14), 0.95, { color: P.white });
  p.add('fill', p.ellipse(172, 134, 11, 6, 0, 12), 0.95, { color: P.white });
  p.add('fill', p.ellipse(150, 136, 10, 5, 0, 12), 0.95, { color: P.white });
  // tail wrapped round the front, with an ink tip
  p.stroke([[40, 112], [52, 132], [96, 140], [136, 136]], 13, 9, 0.66, { color: GINGER });
  p.stroke([[126, 137], [140, 135], [148, 131]], 7, 2, 0.8);
  // outline and the closed, contented eye
  p.line(p.ellipse(116, 102, 80, 38, 0, 20, Math.PI * 0.95, Math.PI * 1.85), 2.4, 0.8);
  p.line([[164, 90], [170, 64], [184, 86]], 1.8, 0.85);
  p.line([[186, 86], [200, 66], [206, 92]], 1.8, 0.85);
  p.line(p.ellipse(182, 106, 30, 25, 0, 14, Math.PI * 1.2, Math.PI * 2.2), 2, 0.75);
  p.line([[186, 104], [193, 108], [201, 104]], 1.8, 0.9);
  p.add('dot', [[210, 116, 4]], 0.55, { color: P.rouge });
  return drawing(p, W, H, AX, AY + p.dy);
}

/** The cat awake: sitting up, eyes open, tail curled. Faces the viewer. */
export function catAwakeDrawing(seed = 607): Drawing {
  const p = new Painter(makeRng(seed));
  const W = 250, H = 240, AX = 122, AY = 228;
  const dx = AX - 104; // drawn about x = 104; centre it in the shared frame
  const add = p.add.bind(p);
  p.add = (kind, pts, tone, extra) => add(kind, pts.map(([x, y, w]) => [x + dx, y, w] as Pt), tone, extra);
  p.add('wash', p.ellipse(AX, AY - 2, 66, 8, 0, 16).map(([x, y]) => [x, y, 6] as Pt), 0.12);
  // tail first (behind)
  p.stroke([[146, 214], [180, 204], [192, 170], [178, 140]], 13, 6, 0.66, { color: GINGER });
  p.stroke([[184, 150], [178, 140], [170, 134]], 6, 2, 0.8);
  // body, head, ears
  p.add('wash', p.ellipse(102, 176, 54, 52, 0, 28).map(([x, y]) => [x, y, 5] as Pt), 0.62, { color: GINGER });
  p.add('wash', p.ellipse(104, 98, 38, 32, 0, 24).map(([x, y]) => [x, y, 4] as Pt), 0.64, { color: GINGER });
  p.add('fill', [[72, 82], [76, 50], [98, 70]], 0.72, { color: GINGER });
  p.add('fill', [[110, 70], [134, 50], [136, 84]], 0.72, { color: GINGER });
  p.add('fill', p.ellipse(104, 186, 26, 34, 0, 18), 0.9, { color: P.white }); // white chest
  p.add('fill', p.ellipse(105, 112, 15, 10, 0, 14), 0.95, { color: P.white }); // muzzle
  // stripes: forehead and flanks
  p.stroke([[96, 70], [98, 82]], 5, 1, 0.65);
  p.stroke([[106, 68], [106, 82]], 5, 1, 0.65);
  p.stroke([[116, 70], [113, 82]], 5, 1, 0.65);
  for (const [x, y, s] of [[58, 160, 1], [54, 182, 1], [148, 160, -1], [152, 182, -1]] as [number, number, number][]) p.stroke([[x, y], [x + s * 12, y + 4], [x + s * 20, y + 10]], 6, 1.5, 0.6);
  // forelegs and white paws
  p.stroke([[88, 176], [86, 200], [88, 218]], 13, 11, 0.6, { color: GINGER });
  p.stroke([[120, 176], [122, 200], [120, 218]], 13, 11, 0.6, { color: GINGER });
  p.add('fill', p.ellipse(88, 220, 10, 6, 0, 12), 0.95, { color: P.white });
  p.add('fill', p.ellipse(121, 220, 10, 6, 0, 12), 0.95, { color: P.white });
  // eyes (gamboge with an ink pupil), nose, whiskers, outline
  p.add('dot', [[90, 96, 12]], 0.9, { color: P.gamboge });
  p.add('dot', [[119, 96, 12]], 0.9, { color: P.gamboge });
  p.add('dot', [[90, 96, 5]], 0.95);
  p.add('dot', [[119, 96, 5]], 0.95);
  p.add('dot', [[105, 108, 5]], 0.7, { color: P.rouge });
  for (const s of [1, -1]) {
    p.line([[105 + s * 12, 112], [105 + s * 34, 106]], 0.9, 0.5);
    p.line([[105 + s * 12, 115], [105 + s * 33, 118]], 0.9, 0.5);
  }
  p.line([[72, 82], [76, 50], [98, 70]], 1.8, 0.85);
  p.line([[110, 70], [134, 50], [136, 84]], 1.8, 0.85);
  p.line(p.ellipse(104, 98, 38, 32, 0, 18, Math.PI * 0.05, Math.PI * 0.95), 2, 0.7);
  p.line(p.ellipse(102, 176, 54, 52, 0, 20, Math.PI * 0.9, Math.PI * 2.1), 2.2, 0.75);
  return drawing(p, W, H, AX, AY);
}

// ───────────────────────────── billboards ─────────────────────────────

/** The light falling on painted paper, as the core gives it to its plants and tablets. */
export function paperTint(ctx: WorldCtx): () => T.Color {
  const fallback = new ctx.THREE.Color();
  let src: T.Color | null = null;
  const tablets = ctx.scene.getObjectByName('tablets');
  tablets?.traverse((o) => {
    const m = (o as T.Mesh).material as T.MeshBasicMaterial | undefined;
    if (!src && m && !Array.isArray(m) && m.isMeshBasicMaterial && m.map) src = m.color;
  });
  return () => src ?? fallback.set(ctx.sky.isNight() ? NIGHT_SHADE : '#ffffff');
}

export interface Billboard {
  mesh: T.Mesh;
  material: T.MeshBasicMaterial;
  /** Metres per drawing px. */
  k: number;
  /** Drawing px → local offset from the anchor (metres; x right, y up). */
  local(x: number, y: number): { x: number; y: number };
  /** Swap the painting (same size), e.g. the cat waking up. */
  show(i: number): void;
}

/**
 * Paintings stood up as a paper flat at the anchor, turning to face the camera like the plants.
 * `drawings` share one size; `height` is the drawing's full height in metres.
 */
export function billboard(bag: Bag, drawings: Drawing[], height: number, o: { px?: number; face?: boolean } = {}): Billboard {
  const ctx = bag.ctx;
  const { THREE } = ctx;
  const d0 = drawings[0];
  const scale = (o.px ?? 512) / Math.max(d0.width, d0.height);
  const texs = drawings.map((d) => {
    const c = rasterize(d, 1, scale);
    const t = bag.own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  const k = height / d0.height;
  const geo = new THREE.PlaneGeometry(d0.width * k, d0.height * k);
  geo.translate((d0.width / 2 - d0.anchor.x) * k, (d0.anchor.y - d0.height / 2) * k, 0);
  // the same parameters as the core's plant paintings, so they share its GL program
  const material = new THREE.MeshBasicMaterial({ map: texs[0], transparent: true, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  mesh.rotation.order = 'YXZ';
  const tint = paperTint(ctx);
  const face = o.face !== false;
  bag.frame(() => {
    material.color.copy(tint());
    if (face) {
      const cam = ctx.camera.position;
      mesh.rotation.y = Math.atan2(cam.x - mesh.position.x, cam.z - mesh.position.z);
    }
  });
  return {
    mesh, material, k,
    local: (x, y) => ({ x: (x - d0.anchor.x) * k, y: (d0.anchor.y - y) * k }),
    show(i) {
      const t = texs[Math.max(0, Math.min(texs.length - 1, i))];
      if (material.map !== t) { material.map = t; material.needsUpdate = false; }
    },
  };
}
