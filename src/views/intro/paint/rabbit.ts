// 开篇 · 玉兔, the moon's rabbit (spec §8.1): 留白 — the body is unpainted paper outlined in 淡墨,
// one rouge eye, an ochre-pink inner ear, a breath of grey wash for its roundness. Every pose is a
// stroke list through the app's brush engine (so the grain matches the garden), rasterised once per
// (pose, size, dpr) and cached. The look reference is paintPortrait('rabbit') and CHAR_SPECS.rabbit;
// the fallback (spec §14 #5) is CHAR_SPECS.rabbit through renderSpec, posed by transforms.
//
// Units: a sitting rabbit is 100 u from its ear tips to the ground; x runs 0..110, facing right.
// The anchor (where it meets the ground) is (50, 100).
import type { Stroke } from '../../../ink/types';
import { paintStroke } from '../../../ink/brush';
import { C, arc, ctxOf, mk, makeRng, poly, st, taper } from './util';

export type RabbitPose = 'sit' | 'pound' | 'back' | 'stand' | 'crouch' | 'stretch' | 'ride' | 'shake0' | 'shake1' | 'shake2' | 'lean';
export const RABBIT_POSES: RabbitPose[] = ['sit', 'pound', 'back', 'stand', 'crouch', 'stretch', 'ride', 'shake0', 'shake1', 'shake2', 'lean'];

const WHITE = '#fbf8f0';
const SHADE = '#6f7d8e';
const PINK = '#d99a8f';
const LINE = C.ink;

type P2 = [number, number];

function egg(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 30, squash = 0): P2[] {
  const out: P2[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a little fuller below (an egg), a little flatter on top when squashed
    const k = 1 + 0.08 * Math.sin(a) - squash * Math.max(0, -Math.sin(a)) * 0.2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry * k;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}

interface Ear { outline: P2[]; left: [number, number, number][]; right: [number, number, number][]; inner: P2[] }

/** An ear from its base along `ang` (radians, 0 = right, −π/2 = up), `L` long, `W` wide, bent sideways. */
function ear(bx: number, by: number, ang: number, L: number, W: number, bend: number, lw: number): Ear {
  const n = 14;
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const sp = (u: number): P2 => {
    const b = bend * Math.sin(Math.PI * u) * L * 0.18 + bend * u * u * L * 0.12;
    return [bx + dx * L * u + px * b, by + dy * L * u + py * b];
  };
  const wd = (u: number) => W * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * u)), 0.7) * (1 - 0.25 * u);
  const Lp: P2[] = [], Rp: P2[] = [], Ip: P2[] = [], Io: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const [x, y] = sp(u);
    const w = wd(u) / 2;
    Lp.push([x + px * w, y + py * w]);
    Rp.push([x - px * w, y - py * w]);
    if (u > 0.12 && u < 0.9) {
      const wi = w * 0.45;
      Ip.push([x + px * wi + px * w * 0.12, y + py * wi + py * w * 0.12]);
      Io.push([x - px * wi * 0.6, y - py * wi * 0.6]);
    }
  }
  const outline = [...Lp, ...Rp.slice().reverse()];
  const inner = [...Ip, ...Io.reverse()];
  const tw = (u: number) => lw * Math.min(1, u * 5, (1 - u) * 4 + 0.25);
  return {
    outline,
    left: Lp.map(([x, y], i) => [x, y, tw(i / n)]),
    right: Rp.map(([x, y], i) => [x, y, tw(i / n)]),
    inner,
  };
}

interface Built { strokes: Stroke[]; box: [number, number, number, number] }

/** The strokes of one pose. `k` = px per unit, so outlines never fall below ~1 px. */
function build(pose: RabbitPose, k: number): Built {
  const rng = makeRng(0x7ab1 + RABBIT_POSES.indexOf(pose) * 97);
  const lw = Math.max(1.5, 1.05 / k);
  const S: Stroke[] = [];
  const seed = () => Math.floor(rng() * 1e9);
  const fill = (pts: P2[], color: string, tone: number, soft = 0.6) => S.push(st('fill', poly(pts, soft), tone, seed(), { color }));
  const wash = (pts: P2[], color: string, tone: number, soft = 3) => S.push(st('wash', poly(pts, soft), tone, seed(), { color }));
  const line = (pts: [number, number, number][], tone = 0.62) => S.push(st('line', pts, tone, seed(), { color: LINE }));
  const dot = (x: number, y: number, d: number, color: string, tone: number) => S.push(st('dot', [[x, y, d]], tone, seed(), { color }));
  const outlineArc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, rot = 0, tone = 0.6) =>
    line(arc(cx, cy, rx, ry, a0, a1, taper(lw, 0.18, 0.3), 16, rot), tone);

  const drawEar = (e: Ear, far: boolean) => {
    fill(e.outline, far ? '#efe9dd' : WHITE, 0.96);
    fill(e.inner, PINK, far ? 0.22 : 0.34, 1.2);
    line(e.left, far ? 0.45 : 0.62);
    line(e.right.slice(0, -2), far ? 0.4 : 0.55);
  };
  const shadow = (cx: number, cy: number, rx: number) => wash(egg(cx, cy, rx, 3.4), C.ink, 0.1, 4);
  const eye = (x: number, y: number, closed = false) => {
    if (closed) { line([[x - 2.4, y, lw * 0.9], [x, y + 1.2, lw], [x + 2.4, y, lw * 0.9]], 0.8); return; }
    dot(x, y, 4.6, '#7a2230', 0.95);
    dot(x - 0.1, y + 0.1, 3.5, C.rouge, 0.95);
    dot(x + 0.8, y - 0.9, 1.3, '#fffaf0', 0.95);
  };
  const face = (hx: number, hy: number, dir: 1 | -1, closed = false) => {
    eye(hx + 5.5 * dir, hy - 1.5, closed);
    dot(hx + 13.4 * dir, hy + 2.2, 2.6, PINK, 0.9); // nose
    line([[hx + 13 * dir, hy + 3.4, lw * 0.6], [hx + 11.6 * dir, hy + 5.6, lw * 0.7], [hx + 9.6 * dir, hy + 6.1, lw * 0.5]], 0.45);
    dot(hx + 7 * dir, hy + 5.5, 7, C.rouge, 0.1); // blush
    for (const [a, l] of [[-0.12, 10], [0.12, 11]] as P2[]) line([[hx + 13 * dir, hy + 3.3, 0.4], [hx + (13 + l) * dir, hy + 3.3 + a * l * 3, 0.25]], 0.25);
  };
  const tail = (x: number, y: number, r: number) => {
    fill(egg(x, y, r, r * 0.9, 0, 16), WHITE, 0.96, 1.2);
    S.push(st('dry', arc(x, y, r, r * 0.9, Math.PI * 0.6, Math.PI * 1.45, taper(lw * 1.6), 8), 0.35, seed(), { color: LINE, dryness: 0.7 }));
  };
  const foot = (x: number, y: number, len: number, rot = 0) => {
    fill(egg(x, y, len, 4.2, rot, 18), WHITE, 0.96, 0.8);
    outlineArc(x, y, len, 4.2, Math.PI * 0.15, Math.PI * 0.95, rot, 0.5);
  };
  const paw = (x: number, y: number, r = 4.4, rot = 0.3) => {
    fill(egg(x, y, r, r * 0.75, rot, 14), WHITE, 0.97, 0.6);
    outlineArc(x, y, r, r * 0.75, Math.PI * 0.05, Math.PI * 1.05, rot, 0.5);
  };
  // a soft grey breath of wash on the shadow side, for roundness
  const shade = (cx: number, cy: number, rx: number, ry: number, rot = 0) => wash(egg(cx, cy, rx, ry, rot, 20), SHADE, 0.11, 5);

  switch (pose) {
    case 'sit':
    case 'pound':
    case 'lean':
    case 'shake0':
    case 'shake1':
    case 'shake2': {
      const shake = pose.startsWith('shake') ? Number(pose.slice(5)) : -1;
      const tilt = pose === 'lean' ? 0.3 : shake === 0 ? -0.1 : shake === 2 ? 0.1 : 0;
      const hx = pose === 'lean' ? 71 : 67 + (shake === 0 ? -2 : shake === 2 ? 2 : 0);
      const hy = pose === 'lean' ? 47 : 42;
      shadow(48, 98, 34);
      // the far ear, behind
      const earA = shake === 0 ? -2.25 : shake === 1 ? -1.55 : shake === 2 ? -1.95 : pose === 'lean' ? -1.9 : -2.02;
      const earB = shake === 0 ? -1.45 : shake === 1 ? -2.2 : shake === 2 ? -0.95 : pose === 'lean' ? -1.35 : -1.68;
      drawEar(ear(hx - 5, hy - 10, earA, 33, 9, shake === 1 ? 0.5 : -0.25, lw * 0.9), true);
      tail(16, 78, 6.5);
      const body = egg(42, 72, 28, 24, -0.22 + tilt * 0.5, 34);
      fill(body, WHITE, 0.97);
      shade(36, 80, 22, 14, -0.2);
      fill(egg(58, 64, 13, 17, 0.1 + tilt * 0.4, 20), WHITE, 0.97);
      outlineArc(42, 72, 28, 24, Math.PI * 0.62, Math.PI * 1.62, -0.22 + tilt * 0.5, 0.62); // back and rump
      outlineArc(42, 72, 28, 24, Math.PI * 0.12, Math.PI * 0.42, -0.22 + tilt * 0.5, 0.45); // belly
      foot(50, 94.5, 14, 0.02);
      // head
      const head = egg(hx, hy, 15.5, 13.2, 0.18 + tilt, 26);
      fill(head, WHITE, 0.98);
      outlineArc(hx, hy, 15.5, 13.2, Math.PI * 0.95, Math.PI * 2.02, 0.18 + tilt, 0.6);
      outlineArc(hx, hy, 15.5, 13.2, Math.PI * 0.2, Math.PI * 0.62, 0.18 + tilt, 0.5);
      drawEar(ear(hx + 1, hy - 11, earB, 35, 9.6, shake === 2 ? -0.6 : 0.3, lw), false);
      face(hx, hy, 1, shake === 1);
      paw(70, 75, 4.6, 0.4);
      paw(64, 78, 4.3, 0.2);
      if (shake >= 0) {
        // droplets flung off
        const drops = [[92, 30], [96, 52], [22, 40], [16, 58], [86, 18], [28, 22]] as P2[];
        drops.forEach(([x, y], i) => { if ((i + shake) % 2 === 0) dot(x, y, 2.4, C.indigo, 0.45); });
        line([[90, 36, lw * 0.6], [97, 34, lw * 0.3]], 0.25);
        line([[20, 50, lw * 0.6], [12, 48, lw * 0.3]], 0.25);
      }
      return { strokes: S, box: [0, -6, 110, 102] };
    }
    case 'back': {
      // from behind, over its shoulder: the head sits down into the shoulders (no collar), tilted a little,
      // two tufts of cheek fur; the outline is broken 淡墨, never a closed ring
      shadow(50, 99, 36);
      const tl = 0.1; // the head's tilt (~6°)
      const hx = 52, hy = 50;
      const e1 = ear(hx - 11, hy - 13, -1.86 + tl, 36, 11, -0.3, lw), e2 = ear(hx + 12, hy - 15, -1.3 + tl, 37, 11, 0.35, lw);
      for (const e of [e1, e2]) {
        fill(e.outline, WHITE, 0.97);
        fill(e.inner, '#e8ddcc', 0.3, 1.2); // seen from behind: the backs of the ears, a faint warm grey
        line(e.left.slice(1, -2), 0.42);
        line(e.right.slice(3, -1), 0.36);
      }
      // the head first: seen from behind, the back is nearer and overlaps its lower half
      fill(egg(hx, hy, 19, 16, tl, 26), WHITE, 0.99);
      outlineArc(hx, hy, 19, 16, Math.PI * 1.02, Math.PI * 1.3, tl, 0.4);
      outlineArc(hx, hy, 19, 16, Math.PI * 1.42, Math.PI * 1.6, tl, 0.32);
      outlineArc(hx, hy, 19, 16, Math.PI * 1.72, Math.PI * 1.98, tl, 0.4);
      fill(egg(50, 74, 36, 29, 0, 34), WHITE, 0.98);
      // the nape: the back runs up into the head with no line (a white bridge over both fills' edges)
      wash(egg(hx - 1, hy + 12, 17, 8, tl, 20), WHITE, 0.95, 5);
      wash(egg(hx - 1, hy + 12, 13, 6, tl, 20), WHITE, 0.95, 4);
      shade(36, 84, 24, 15, 0.2);
      // body: short arcs with gaps
      outlineArc(50, 74, 36, 29, Math.PI * 0.58, Math.PI * 0.8, 0, 0.4);
      outlineArc(50, 74, 36, 29, Math.PI * 0.9, Math.PI * 1.14, 0, 0.36);
      outlineArc(50, 74, 36, 29, Math.PI * 1.92, Math.PI * 2.08, 0, 0.34);
      outlineArc(50, 74, 36, 29, Math.PI * 2.18, Math.PI * 2.4, 0, 0.4);
      // cheek fur: a few quick flicks at each side of the head's lower edge
      for (const [x, y, d] of [[hx - 19, hy + 7, -1], [hx - 17, hy + 10, -1], [hx + 20, hy + 5, 1], [hx + 18, hy + 9, 1]] as [number, number, number][]) {
        line([[x, y, lw * 0.8], [x + 4 * d, y + 2.5, lw * 0.5], [x + 6 * d, y + 1.5, lw * 0.2]], 0.34);
      }
      tail(50, 92, 8);
      return { strokes: S, box: [0, -22, 100, 102] };
    }
    case 'stand': {
      shadow(50, 99, 22);
      const hx = 60, hy = 26;
      drawEar(ear(hx - 5, hy - 10, -1.95, 32, 8.6, -0.2, lw * 0.9), true);
      tail(30, 74, 6);
      fill(egg(46, 64, 17, 30, 0.12, 30), WHITE, 0.97);
      shade(40, 70, 12, 20, 0.1);
      outlineArc(46, 64, 17, 30, Math.PI * 0.62, Math.PI * 1.6, 0.12, 0.62);
      outlineArc(46, 64, 17, 30, Math.PI * 0.05, Math.PI * 0.38, 0.12, 0.45);
      foot(48, 96, 13, 0);
      fill(egg(hx, hy, 14.5, 12.5, 0.15, 26), WHITE, 0.98);
      outlineArc(hx, hy, 14.5, 12.5, Math.PI * 0.95, Math.PI * 2.02, 0.15, 0.6);
      outlineArc(hx, hy, 14.5, 12.5, Math.PI * 0.2, Math.PI * 0.62, 0.15, 0.5);
      drawEar(ear(hx + 1, hy - 10, -1.62, 34, 9.4, 0.25, lw), false);
      face(hx, hy, 1);
      paw(58, 56, 4.2, 0.6);
      paw(54, 60, 4, 0.4);
      return { strokes: S, box: [0, -26, 100, 102] };
    }
    case 'crouch': {
      shadow(50, 99, 38);
      const hx = 74, hy = 70;
      drawEar(ear(hx - 6, hy - 9, -2.75, 32, 8.6, 0.2, lw * 0.9), true);
      tail(12, 80, 6);
      fill(egg(44, 82, 34, 16, -0.05, 34), WHITE, 0.97);
      shade(36, 88, 24, 8, 0);
      outlineArc(44, 82, 34, 16, Math.PI * 0.95, Math.PI * 1.9, -0.05, 0.62);
      foot(40, 96, 16, 0);
      fill(egg(hx, hy, 15, 12.5, 0.1, 26), WHITE, 0.98);
      outlineArc(hx, hy, 15, 12.5, Math.PI * 0.95, Math.PI * 2.02, 0.1, 0.6);
      outlineArc(hx, hy, 15, 12.5, Math.PI * 0.2, Math.PI * 0.62, 0.1, 0.5);
      drawEar(ear(hx - 1, hy - 11, -2.6, 34, 9.4, -0.3, lw), false);
      face(hx, hy, 1);
      paw(84, 92, 4.4, 0.1);
      return { strokes: S, box: [0, 20, 110, 102] };
    }
    case 'stretch': {
      // the leap / the fall: long, ears streaming back, hind legs out
      const hx = 86, hy = 44;
      drawEar(ear(hx - 8, hy - 6, -2.85, 34, 8.4, 0.25, lw * 0.9), true);
      tail(10, 58, 6);
      fill(egg(48, 54, 36, 14, -0.18, 34), WHITE, 0.97);
      shade(40, 60, 26, 7, -0.18);
      outlineArc(48, 54, 36, 14, Math.PI * 1.02, Math.PI * 1.95, -0.18, 0.62);
      outlineArc(48, 54, 36, 14, Math.PI * 0.2, Math.PI * 0.8, -0.18, 0.45);
      foot(14, 70, 14, 0.5);
      paw(80, 60, 4.2, -0.4);
      paw(90, 56, 4, -0.6);
      fill(egg(hx, hy, 14.5, 12, 0.05, 26), WHITE, 0.98);
      outlineArc(hx, hy, 14.5, 12, Math.PI * 0.95, Math.PI * 2.02, 0.05, 0.6);
      drawEar(ear(hx - 3, hy - 9, -2.95, 36, 9.2, -0.25, lw), false);
      face(hx, hy, 1);
      return { strokes: S, box: [-6, 10, 112, 80] };
    }
    case 'ride': {
      // sitting up tall on the lotus pad, front paws raised (the letter is drawn on top)
      const hx = 58, hy = 34;
      drawEar(ear(hx - 5, hy - 10, -1.98, 32, 8.8, -0.2, lw * 0.9), true);
      tail(24, 84, 6);
      fill(egg(46, 74, 23, 24, -0.1, 32), WHITE, 0.97);
      shade(40, 80, 16, 14, -0.1);
      outlineArc(46, 74, 23, 24, Math.PI * 0.62, Math.PI * 1.62, -0.1, 0.62);
      fill(egg(hx, hy, 15, 13, 0.1, 26), WHITE, 0.98);
      outlineArc(hx, hy, 15, 13, Math.PI * 0.95, Math.PI * 2.02, 0.1, 0.6);
      outlineArc(hx, hy, 15, 13, Math.PI * 0.2, Math.PI * 0.62, 0.1, 0.5);
      drawEar(ear(hx + 1, hy - 11, -1.58, 34, 9.4, 0.3, lw), false);
      face(hx, hy, 1);
      paw(64, 56, 4.2, -0.5);
      paw(70, 54, 4, -0.7);
      foot(52, 96, 13, 0);
      return { strokes: S, box: [0, -10, 104, 102] };
    }
  }
}

// ---------------------------------------------------------------------------------------------- raster cache

export interface RabbitSprite { c: HTMLCanvasElement; /** css px per unit */ k: number; /** css px of the unit box origin in the sprite */ ox: number; oy: number; dpr: number }

const cache = new Map<string, RabbitSprite>();

/** Drop every cached sprite (the film's end). */
export function clearRabbitCache(): void {
  for (const sp of cache.values()) { sp.c.width = 0; sp.c.height = 0; }
  cache.clear();
}

/** Paint one pose for a rabbit `px` tall (ears to ground, css px) at `dpr`. Cached. */
export function rabbitSprite(pose: RabbitPose, px: number, dpr: number): RabbitSprite {
  const key = `${pose}|${Math.round(px)}|${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const k = px / 100;
  const { strokes, box } = build(pose, k);
  const pad = 6;
  const cw = (box[2] - box[0]) * k + pad * 2, ch = (box[3] - box[1]) * k + pad * 2;
  const c = mk(cw * dpr, ch * dpr);
  const g = ctxOf(c);
  const ox = pad - box[0] * k, oy = pad - box[1] * k;
  g.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  for (const s of strokes) paintStroke(g, s, { scale: k }); // the context carries the dpr
  const sp = { c, k, ox, oy, dpr };
  if (cache.size > 40) cache.delete(cache.keys().next().value as string);
  cache.set(key, sp);
  return sp;
}

/** The strokes of a pose (the lab's sheet and the stage's sliced paints). */
export function rabbitStrokes(pose: RabbitPose, px: number): Stroke[] {
  return build(pose, px / 100).strokes;
}

/**
 * Draw a pose so that the unit point (ux, uy) lands at (x, y) css px; `sx`/`sy` squash and
 * stretch about that point, `rot` turns about it, `flip` faces left.
 */
export function drawRabbit(g: CanvasRenderingContext2D, pose: RabbitPose, px: number, dpr: number, x: number, y: number,
  o: { ux?: number; uy?: number; sx?: number; sy?: number; rot?: number; flip?: boolean; alpha?: number } = {}): void {
  const sp = rabbitSprite(pose, px, dpr);
  const ux = o.ux ?? 50, uy = o.uy ?? 100;
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  g.scale((o.flip ? -1 : 1) * (o.sx ?? 1), o.sy ?? 1);
  g.drawImage(sp.c, -(sp.ox + ux * sp.k), -(sp.oy + uy * sp.k), sp.c.width / dpr, sp.c.height / dpr);
  g.restore();
}

// ---------------------------------------------------------------------------------------------- props

/** The pestle, pivoting at the paws: angle 0 = struck (down), −0.9 = lifted. Units of the sit pose. */
export function drawPestle(g: CanvasRenderingContext2D, px: number, x: number, y: number, ang: number, flip = false): void {
  const k = px / 100;
  g.save();
  g.translate(x, y);
  g.scale(flip ? -1 : 1, 1);
  g.rotate(ang);
  g.lineCap = 'round';
  // a pale wooden pestle, head down
  g.strokeStyle = '#b48a5a';
  g.lineWidth = Math.max(1.6, 3.2 * k);
  g.beginPath(); g.moveTo(-2 * k, -30 * k); g.lineTo(2 * k, 10 * k); g.stroke();
  g.fillStyle = '#a9804f';
  g.beginPath(); g.ellipse(2.4 * k, 13 * k, 4.2 * k, 5.4 * k, -0.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(27,25,22,.55)';
  g.lineWidth = Math.max(0.7, 0.9 * k);
  g.beginPath(); g.moveTo(-3.4 * k, -30 * k); g.lineTo(0.4 * k, 9 * k); g.stroke();
  g.restore();
}

/** The mortar: a stone bowl, `full` of whole herbs (ochre and malachite dots), `px` wide. */
export function drawMortar(g: CanvasRenderingContext2D, x: number, y: number, px: number, seed = 3): void {
  const r = makeRng(seed);
  const w = px, h = px * 0.62;
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(40,52,70,.12)';
  g.beginPath(); g.ellipse(0, h * 0.02, w * 0.62, h * 0.12, 0, 0, Math.PI * 2); g.fill();
  const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  grd.addColorStop(0, '#c9c2b4'); grd.addColorStop(0.55, '#e4ddcf'); grd.addColorStop(1, '#a9a295');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(-w * 0.5, -h * 0.85);
  g.quadraticCurveTo(-w * 0.48, -h * 0.1, -w * 0.3, 0);
  g.lineTo(w * 0.3, 0);
  g.quadraticCurveTo(w * 0.48, -h * 0.1, w * 0.5, -h * 0.85);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(27,25,22,.55)';
  g.lineWidth = 1;
  g.stroke();
  // the herbs heaped in the rim
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI, rr = r();
    g.fillStyle = i % 3 === 0 ? C.malachite : i % 3 === 1 ? C.ochre : '#7c8f5a';
    g.globalAlpha = 0.8;
    g.beginPath();
    g.ellipse(Math.cos(a) * w * 0.4 * rr, -h * 0.85 - Math.sin(a) * h * 0.18 * rr, 2 + r() * 2.2, 1.4 + r(), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(27,25,22,.3)';
  g.beginPath(); g.ellipse(0, -h * 0.85, w * 0.5, h * 0.1, 0, 0, Math.PI); g.fill();
  g.restore();
}

/** The folded letter (envelope) held in the mouth: `px` wide, with its small round 月 seal (canvas). */
export function drawEnvelope(g: CanvasRenderingContext2D, x: number, y: number, px: number, rot: number, seal: HTMLCanvasElement | null): void {
  const w = px, h = px * 0.56;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = '#f4efe3';
  g.strokeStyle = 'rgba(27,25,22,.6)';
  g.lineWidth = 1;
  g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(27,25,22,.3)';
  g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(0, h * 0.08); g.lineTo(w / 2, -h / 2); g.stroke();
  if (seal) g.drawImage(seal, -h * 0.22, -h * 0.02, h * 0.44, h * 0.44);
  else {
    g.fillStyle = C.cinnabar;
    g.beginPath(); g.arc(0, h * 0.2, h * 0.18, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------- silhouette

/**
 * The rabbit in the moon: a soft maria silhouette, pounding (pestle 0 up … 1 struck), leaning toward
 * the pond (lean 0..1), one ear flicking (flick 0..1). (x, y) is its feet; `s` its height in px.
 */
export function moonRabbitPath(x: number, y: number, s: number, o: { pestle?: number; lean?: number; flick?: number; sneeze?: number } = {}): Path2D {
  const p = new Path2D();
  const k = s / 100;
  const lean = (o.lean ?? 0) * 0.32;
  const sn = o.sneeze ?? 0;
  const X = (u: number, v: number) => {
    // lean rotates the upper body about the feet toward the lower right (toward the pond)
    const dx = u - 50, dy = v - 100;
    const c = Math.cos(lean), si = Math.sin(lean);
    return [x + (dx * c - dy * si) * k, y + (dx * si + dy * c) * k * (1 - 0.06 * sn)] as P2;
  };
  const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
    const [ex, ey] = X(cx, cy);
    p.ellipse(ex, ey, rx * k, ry * k, rot + lean, 0, Math.PI * 2);
    p.closePath();
  };
  // the sneeze turns the head about the neck: wound back −12° (sn < 0), then jerked forward +8°
  const hA = sn < 0 ? -0.21 * -sn : 0.14 * sn;
  const H = (u: number, v: number): [number, number] => {
    const du = u - 58, dv = v - 55, c = Math.cos(hA), si = Math.sin(hA);
    return [58 + du * c - dv * si, 55 + du * si + dv * c];
  };
  ell(42, 72, 28, 24, -0.22);
  ell(58, 62, 13, 17, 0.1);
  { const [hu, hv] = H(67, 42); ell(hu, hv, 15.5, 13.2, 0.18 + hA); }
  ell(16, 78, 6.5, 6);
  ell(50, 94, 14, 4.5);
  const flick = o.flick ?? 0;
  // ears as long ellipses
  const earE = (bx0: number, by0: number, ang0: number, L: number, W: number) => {
    const [bx, by] = H(bx0, by0);
    const ang = ang0 + hA - (sn > 0 ? 0.5 * sn : 0);
    const [ex, ey] = X(bx + Math.cos(ang) * L / 2, by + Math.sin(ang) * L / 2);
    p.ellipse(ex, ey, L / 2 * k, W / 2 * k, ang + lean, 0, Math.PI * 2);
    p.closePath();
  };
  earE(62, 32, -2.02, 33, 8.5);
  earE(68, 31, -1.68 + 0.55 * flick, 35, 9.4);
  // the pestle, held at the paws
  const pa = -0.9 + 0.9 * (o.pestle ?? 0);
  const [px, py] = X(70, 75);
  const len = 42 * k;
  const ang = Math.PI / 2 + pa + lean;
  const tx = px + Math.cos(ang - Math.PI) * len * 0.72, ty = py + Math.sin(ang - Math.PI) * len * 0.72;
  const bx = px + Math.cos(ang) * len * 0.28, by = py + Math.sin(ang) * len * 0.28;
  const nx = -Math.sin(ang) * 1.6 * k, ny = Math.cos(ang) * 1.6 * k;
  p.moveTo(tx + nx, ty + ny); p.lineTo(bx + nx, by + ny); p.lineTo(bx - nx, by - ny); p.lineTo(tx - nx, ty - ny); p.closePath();
  p.ellipse(bx, by, 4 * k, 5 * k, ang - Math.PI / 2, 0, Math.PI * 2);
  p.closePath();
  // the mortar
  const [mx, my] = X(88, 100);
  p.moveTo(mx - 9 * k, my - 13 * k); p.lineTo(mx + 9 * k, my - 13 * k); p.lineTo(mx + 6 * k, my); p.lineTo(mx - 6 * k, my); p.closePath();
  return p;
}

