// 桃源 · 二期: a dish's painted top (spec §4.6, §3.9). One function paints the food's surface seen from
// above — the congee's skin and its sinking petals, the lacy edge in the iron pan, the crooked red dots,
// the violet glaze — into a w × w square: at 512 for the 3D dish's CanvasTexture (P), at 160 for the
// 食单's thumbnails and the menu card's tiles (cached as data URLs, at most 17).
//
// The warmth is painted in (a soft highlight, the steam-side light): the 特写 adds no lights. Every
// stroke draws from a generator seeded by the dish, so a top repaints the same each time.
// Owner: F (food). P imports paintTop.
import { hashString, makeRng, type Rng } from '../../../../../core/rng';
import type { DishId } from './types';

export interface PaintOpts {
  /** 新醅's 醴 variant (milky, no froth). */
  li?: boolean;
  /** A festival serving (新糕's red dots at 春节 and 元宵: on red paper). */
  festival?: boolean;
  /** Paint the vessel's rim round the food (the thumbnails; the 3D dish has its own vessel). */
  vessel?: boolean;
}

const TAU = Math.PI * 2;
type G = CanvasRenderingContext2D;

/** What the food sits in, seen from above (the thumbnails' rim). */
type Vessel = { rim: string; lip: string } | null;
const WHITE = { rim: '#ece6d8', lip: '#fbf8f1' };
const CELADON = { rim: '#b9c9b0', lip: '#dfe8d6' };
const EARTH = { rim: '#8a5a3a', lip: '#a77252' };
const IRON = { rim: '#2b2724', lip: '#4a443e' };
const GREY = { rim: '#8f8c86', lip: '#b7b3aa' };
const CLAY = { rim: '#9a5b3c', lip: '#bd7a55' };
const BAMBOO = { rim: '#b08a4f', lip: '#cfae6f' };
const DARK = { rim: '#2e2a30', lip: '#4b4550' };
const VESSEL: Record<DishId, Vessel> = {
  zhou: WHITE, bing: IRON, gao: BAMBOO, tangbing: EARTH, jishu: CLAY, sunzu: CELADON, xinpei: GREY, weiyu: CLAY,
  taocha: CELADON, zisu: WHITE, taojiao: CELADON, shengao: DARK, zhiyu: null,
  's-aigao': BAMBOO, 's-heye': null, 's-guiyu': WHITE, 's-junge': CLAY,
};

/** Paint the top of `dish` into a w × w square of `g` (a centred disc on a transparent ground). */
export function paintTop(g: G, w: number, dish: DishId, o: PaintOpts = {}): void {
  g.save();
  g.clearRect(0, 0, w, w);
  const vessel = o.vessel ? VESSEL[dish] : null;
  // work in a ±100 square for the food's disc (±125 with a rim round it)
  const span = o.vessel ? 125 : 100;
  g.translate(w / 2, w / 2);
  g.scale(w / 2 / span, w / 2 / span);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const r = makeRng(hashString(`tyl:top:${dish}${o.li ? ':li' : ''}`));
  if (vessel) rim(g, vessel);
  if (o.vessel && !vessel) ground(g, dish);
  g.save();
  g.beginPath();
  g.arc(0, 0, 100, 0, TAU);
  g.clip();
  PAINT[dish](g, r, o);
  light(g);
  g.restore();
  g.restore();
}

// ───────────────────────────── the thumbnails (the 食单 at 160 px; the menu card shows them at 96)

const thumbs = new Map<DishId, string>();

/** A dish's thumbnail if it has been painted already (the 食单 paints the rest through its queue). */
export const thumbCached = (dish: DishId): string | null => thumbs.get(dish) ?? null;

/**
 * A dish's thumbnail (with its vessel) as a data URL, painted once and cached; '' without a DOM. A
 * variant (醴, the festival cake) is painted fresh each time and not cached.
 */
export function thumbOf(dish: DishId, px = 160, o: { li?: boolean; festival?: boolean } = {}): string {
  const plain = !o.li && !o.festival;
  const hit = plain ? thumbs.get(dish) : undefined;
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  try {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const g = c.getContext('2d');
    if (!g) return '';
    paintTop(g, px, dish, { ...o, vessel: true });
    const url = c.toDataURL('image/png');
    if (plain) thumbs.set(dish, url);
    return url;
  } catch {
    return '';
  }
}

// ───────────────────────────── shared strokes

function rim(g: G, v: NonNullable<Vessel>): void {
  const grd = g.createRadialGradient(-30, -34, 20, 0, 0, 124);
  grd.addColorStop(0, v.lip);
  grd.addColorStop(0.82, v.lip);
  grd.addColorStop(1, v.rim);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 122, 0, TAU);
  g.fill();
  // the lip's inner shadow and a thin ink line, as a brush would put it
  g.strokeStyle = 'rgba(40, 30, 20, 0.28)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 102, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(27, 25, 22, 0.55)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.arc(0, 0, 121, 0, TAU);
  g.stroke();
}

/** No vessel (the fish over its embers, the lotus parcel): a faint ground shadow instead. */
function ground(g: G, dish: DishId): void {
  const grd = g.createRadialGradient(4, 6, 60, 4, 6, 124);
  grd.addColorStop(0, dish === 'zhiyu' ? 'rgba(60, 40, 30, 0.35)' : 'rgba(40, 60, 40, 0.28)');
  grd.addColorStop(1, 'rgba(40, 40, 30, 0)');
  g.fillStyle = grd;
  g.fillRect(-125, -125, 250, 250);
}

/** The painted warmth: a soft light from the upper left, the far edge a shade darker. */
function light(g: G): void {
  const hi = g.createRadialGradient(-38, -42, 4, -38, -42, 90);
  hi.addColorStop(0, 'rgba(255, 246, 222, 0.34)');
  hi.addColorStop(1, 'rgba(255, 246, 222, 0)');
  g.fillStyle = hi;
  g.fillRect(-100, -100, 200, 200);
  const edge = g.createRadialGradient(0, 0, 70, 0, 0, 102);
  edge.addColorStop(0, 'rgba(30, 20, 10, 0)');
  edge.addColorStop(1, 'rgba(30, 20, 10, 0.22)');
  g.fillStyle = edge;
  g.fillRect(-100, -100, 200, 200);
}

function fill(g: G, c0: string, c1: string, c2 = c1): void {
  const grd = g.createRadialGradient(-20, -24, 6, 0, 0, 104);
  grd.addColorStop(0, c0);
  grd.addColorStop(0.7, c1);
  grd.addColorStop(1, c2);
  g.fillStyle = grd;
  g.fillRect(-100, -100, 200, 200);
}

/** An irregular soft blob (a taro chunk, a bead, a mushroom cap). */
function blob(g: G, r: Rng, x: number, y: number, rx: number, ry: number, rot: number, color: string, wobble = 0.14): void {
  const n = 14;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (i === n ? 0 : r.range(-wobble, wobble));
    const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** A rounded block (a cake square, a noodle piece, a sliver). */
function block(g: G, x: number, y: number, w: number, h: number, rot: number, color: string, round = 4): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = color;
  g.beginPath();
  const rr = Math.min(round, w / 2, h / 2);
  g.moveTo(-w / 2 + rr, -h / 2);
  g.arcTo(w / 2, -h / 2, w / 2, h / 2, rr);
  g.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
  g.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr);
  g.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr);
  g.closePath();
  g.fill();
  g.restore();
}

/** A single peach petal (the notched tip outward). */
function petal(g: G, x: number, y: number, rot: number, s: number, color: string, alpha = 1): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-s * 0.7, -s * 0.25, -s * 0.55, -s * 0.95, -s * 0.14, -s);
  g.lineTo(0, -s * 0.84);
  g.lineTo(s * 0.14, -s);
  g.bezierCurveTo(s * 0.55, -s * 0.95, s * 0.7, -s * 0.25, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(190, 80, 100, 0.35)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(0, -s * 0.1);
  g.lineTo(0, -s * 0.6);
  g.stroke();
  g.restore();
}

/** A five-petalled blossom. */
function blossom(g: G, x: number, y: number, s: number, rot: number, color = '#f3b6c4', alpha = 1): void {
  for (let i = 0; i < 5; i++) petal(g, x, y, rot + (i / 5) * TAU, s, color, alpha);
  g.fillStyle = `rgba(200, 120, 40, ${0.8 * alpha})`;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rot;
    g.beginPath();
    g.arc(x + Math.cos(a) * s * 0.18, y + Math.sin(a) * s * 0.18, s * 0.05, 0, TAU);
    g.fill();
  }
}

function dots(g: G, r: Rng, n: number, color: string, rMin: number, rMax: number, area = 92): void {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * area;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, r.range(rMin, rMax), 0, TAU);
    g.fill();
  }
}

/** Glints on a wet surface (the beads, the broth's fat). */
function glints(g: G, r: Rng, n: number, area = 80, size = 3): void {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * area;
    g.fillStyle = `rgba(255, 252, 240, ${r.range(0.45, 0.85)})`;
    g.beginPath();
    g.ellipse(Math.cos(a) * d, Math.sin(a) * d, size * r.range(0.6, 1.2), size * 0.5, -0.6, 0, TAU);
    g.fill();
  }
}

/** A scallion ring. */
function ring(g: G, x: number, y: number, s: number): void {
  g.strokeStyle = '#6f9a4a';
  g.lineWidth = s * 0.34;
  g.beginPath();
  g.arc(x, y, s, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(220, 240, 190, 0.8)';
  g.lineWidth = s * 0.12;
  g.beginPath();
  g.arc(x, y, s * 0.9, 3.6, 5.2);
  g.stroke();
}

// ───────────────────────────── the seventeen tops

const PAINT: Record<DishId, (g: G, r: Rng, o: PaintOpts) => void> = {
  // 桃花粥: pale congee with a thin skin, five petals sinking, a thread of honey
  zhou(g, r) {
    fill(g, '#f7f2e6', '#ece3cf', '#ddd0b4');
    g.strokeStyle = 'rgba(200, 185, 150, 0.35)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const y = r.range(-70, 70);
      g.moveTo(-80, y);
      g.bezierCurveTo(-30, y + r.range(-14, 14), 20, y + r.range(-14, 14), 80, y + r.range(-8, 8));
      g.stroke();
    }
    dots(g, r, 60, 'rgba(255, 255, 250, 0.55)', 1, 2.6, 85);
    // the honey thread
    g.strokeStyle = 'rgba(214, 160, 60, 0.75)';
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(-58, 30);
    g.bezierCurveTo(-30, -10, 10, 50, 40, 10);
    g.bezierCurveTo(55, -8, 30, -30, 12, -18);
    g.stroke();
    // five petals, two of them half under
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = r.range(18, 64);
      petal(g, Math.cos(a) * d, Math.sin(a) * d, r() * TAU, r.range(17, 22), '#f0a0b3', i < 2 ? 0.5 : 0.95);
    }
  },
  // 鹅蛋葱饼: a golden disc with a lacy brown edge in the black pan, scallion flecks, the oil shining
  bing(g, r) {
    fill(g, '#3a3430', '#26221f', '#171513');
    // the oil
    g.fillStyle = 'rgba(210, 170, 80, 0.18)';
    g.beginPath();
    g.arc(0, 0, 92, 0, TAU);
    g.fill();
    // the lacy edge: a ring of brown holes and crisp bits
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * TAU + r.range(-0.03, 0.03), d = r.range(70, 84);
      blob(g, r, Math.cos(a) * d, Math.sin(a) * d, r.range(5, 9), r.range(3, 6), a, `rgba(${r.int(120, 160)}, ${r.int(70, 95)}, 30, 0.9)`, 0.3);
    }
    const cake = g.createRadialGradient(-14, -16, 8, 0, 0, 76);
    cake.addColorStop(0, '#f1d489');
    cake.addColorStop(0.7, '#e1b152');
    cake.addColorStop(1, '#b77a2c');
    g.fillStyle = cake;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU, d = 72 + (i === 40 ? 0 : r.range(-3, 3));
      if (i === 0) g.moveTo(Math.cos(a) * d, Math.sin(a) * d); else g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    g.fill();
    // browned patches and scallion
    for (let i = 0; i < 16; i++) blob(g, r, r.range(-55, 55), r.range(-55, 55), r.range(6, 13), r.range(4, 9), r() * TAU, 'rgba(170, 105, 40, 0.28)', 0.3);
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 62;
      block(g, Math.cos(a) * d, Math.sin(a) * d, r.range(4, 8), r.range(2.4, 3.6), r() * TAU, r.chance(0.3) ? '#a8c878' : '#4f8a3a', 1.2);
    }
    glints(g, r, 10, 88, 4);
  },
  // 新糕: four white squares on the steamer's slats, each with a slightly crooked red dot
  gao(g, r, o) {
    fill(g, '#d8bd86', '#c4a164', '#a58146');
    g.strokeStyle = 'rgba(120, 90, 40, 0.4)';
    g.lineWidth = 2;
    for (let x = -100; x <= 100; x += 9) { g.beginPath(); g.moveTo(x, -100); g.lineTo(x + 4, 100); g.stroke(); }
    g.strokeStyle = 'rgba(120, 90, 40, 0.25)';
    for (let y = -90; y <= 90; y += 30) { g.beginPath(); g.moveTo(-100, y); g.lineTo(100, y + 2); g.stroke(); }
    if (o.festival) block(g, 0, 0, 120, 120, 0.78, '#c23b2b', 3);
    const at: [number, number][] = [[-30, -30], [30, -30], [-30, 30], [30, 30]];
    for (const [x, y] of at) {
      block(g, x + 2, y + 3, 50, 50, r.range(-0.08, 0.08), 'rgba(80, 60, 30, 0.25)', 7);
      block(g, x, y, 50, 50, r.range(-0.08, 0.08), '#fbf7ec', 7);
      block(g, x - 6, y - 6, 30, 30, 0, 'rgba(255, 255, 255, 0.5)', 6);
      g.fillStyle = o.festival ? '#d42a1c' : '#c8402f';
      g.beginPath();
      g.ellipse(x + r.range(-6, 6), y + r.range(-6, 6), o.festival ? 6.5 : 5, o.festival ? 5.5 : 4, r() * TAU, 0, TAU);
      g.fill();
    }
  },
  // 汤饼: torn pieces, thick and thin, in clear broth; two scallion rings; beads of fat
  tangbing(g, r) {
    fill(g, '#e9d3a2', '#d8b779', '#b8904f');
    for (let i = 0; i < 11; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 60;
      const x = Math.cos(a) * d, y = Math.sin(a) * d, rot = r() * TAU, w = r.range(26, 42), h = r.range(12, 22);
      block(g, x + 2, y + 2, w, h, rot, 'rgba(150, 110, 50, 0.35)', 6);
      block(g, x, y, w, h, rot, r.chance(0.5) ? '#f6ecd4' : '#efe0bf', 6);
      block(g, x - 2, y - 2, w * 0.5, h * 0.35, rot, 'rgba(255, 255, 250, 0.5)', 3);
    }
    for (let i = 0; i < 18; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 86;
      g.strokeStyle = 'rgba(255, 240, 200, 0.7)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, r.range(2, 5), 0, TAU);
      g.stroke();
    }
    ring(g, 26, -44, 7);
    ring(g, 40, -34, 6);
  },
  // 鸡黍: golden millet under glazed chicken, a dark crust at the pot's edge
  jishu(g, r) {
    fill(g, '#e8c25a', '#d9a73e', '#7a4a1c');
    dots(g, r, 420, 'rgba(250, 220, 120, 0.8)', 1.4, 2.6, 94);
    dots(g, r, 160, 'rgba(170, 120, 30, 0.6)', 1.2, 2.2, 94);
    g.strokeStyle = 'rgba(70, 35, 10, 0.75)';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(0, 0, 96, 0, TAU);
    g.stroke();
    const pieces: [number, number, number, number][] = [[-18, -10, 34, 22], [24, 14, 30, 20], [-6, 34, 26, 17], [30, -30, 24, 16]];
    for (const [x, y, rx, ry] of pieces) {
      const rot = r() * TAU;
      blob(g, r, x + 3, y + 4, rx, ry, rot, 'rgba(90, 50, 15, 0.4)', 0.1);
      blob(g, r, x, y, rx, ry, rot, '#b86e2c', 0.1);
      blob(g, r, x - 4, y - 4, rx * 0.6, ry * 0.5, rot, 'rgba(236, 170, 90, 0.8)', 0.12);
      blob(g, r, x + rx * 0.3, y + ry * 0.2, rx * 0.35, ry * 0.3, rot, 'rgba(90, 40, 12, 0.55)', 0.2);
    }
    glints(g, r, 12, 50, 3);
  },
  // 笋菹: pale shoot slivers heaped on a small dish, a few beads of brine
  sunzu(g, r) {
    fill(g, '#e3e8dc', '#cbd6c6', '#aebca8');
    for (let i = 0; i < 34; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 46;
      const rot = r.range(-0.6, 0.6) + (i % 2 ? 0.9 : -0.4);
      block(g, Math.cos(a) * d + 1.5, Math.sin(a) * d + 2, r.range(34, 58), r.range(5, 8), rot, 'rgba(120, 110, 60, 0.3)', 3);
      block(g, Math.cos(a) * d, Math.sin(a) * d, r.range(34, 58), r.range(5, 8), rot, r.chance(0.5) ? '#f1e7bf' : '#e6d79e', 3);
    }
    glints(g, r, 9, 70, 2.4);
  },
  // 新醅: cloudy white brew with green froth and a few floating grains (醴: milky, no froth)
  xinpei(g, r, o) {
    if (o.li) {
      fill(g, '#fbf6ec', '#f0e6d4', '#dccbb0');
      dots(g, r, 14, 'rgba(255, 252, 240, 0.9)', 2.4, 4, 70);
      dots(g, r, 10, 'rgba(210, 190, 150, 0.6)', 1.6, 2.6, 60);
      return;
    }
    fill(g, '#eeebe0', '#dcd9ca', '#bcb8a6');
    // the green froth ("green ants"): clustered bubbles
    for (let i = 0; i < 160; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 70;
      const x = Math.cos(a) * d + Math.cos(a * 3) * 10, y = Math.sin(a) * d;
      g.fillStyle = `rgba(${r.int(120, 160)}, ${r.int(160, 190)}, ${r.int(110, 140)}, ${r.range(0.35, 0.7)})`;
      g.beginPath();
      g.arc(x, y, r.range(1.6, 4.4), 0, TAU);
      g.fill();
    }
    dots(g, r, 12, 'rgba(250, 245, 225, 0.95)', 2, 3, 80);
  },
  // 煨芋: a charred taro split open, floury white inside; ash dust; an ember's glow
  weiyu(g, r) {
    fill(g, '#b9744f', '#a0603f', '#7a4128');
    const glow = g.createRadialGradient(62, 50, 4, 62, 50, 60);
    glow.addColorStop(0, 'rgba(255, 150, 60, 0.6)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    g.fillStyle = glow;
    g.fillRect(-100, -100, 200, 200);
    blob(g, r, 2, 4, 64, 44, -0.35, 'rgba(40, 25, 15, 0.45)', 0.06);
    blob(g, r, 0, 0, 62, 42, -0.35, '#2e2520', 0.08);
    blob(g, r, -2, -2, 50, 30, -0.35, '#51403a', 0.1);
    // the split: floury inside
    blob(g, r, -4, -4, 38, 20, -0.35, '#f3ece0', 0.16);
    blob(g, r, -9, -8, 20, 9, -0.35, 'rgba(255, 255, 255, 0.7)', 0.2);
    dots(g, r, 70, 'rgba(210, 205, 195, 0.55)', 0.8, 2, 90);
    dots(g, r, 8, 'rgba(255, 120, 40, 0.8)', 1.2, 2.4, 90);
  },
  // 桃花茶: honey-gold tea, three soft blossoms
  taocha(g, r) {
    fill(g, '#efc766', '#d9a43c', '#a5712a');
    g.strokeStyle = 'rgba(255, 235, 170, 0.45)';
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(-12, -8, i * 22, 0.2, 2.6); g.stroke(); }
    const at: [number, number, number][] = [[-28, -18, 20], [30, 6, 18], [-4, 38, 16]];
    for (const [x, y, s] of at) blossom(g, x, y, s, r() * TAU, '#f5c1cc', 0.92);
  },
  // 紫苏乌梅饮: violet in a white cup, one perilla leaf (the 特写 turns it to rose)
  zisu(g, r) {
    fill(g, '#8a5a9a', '#6b3f7a', '#4a2757');
    g.save();
    g.translate(12, -6);
    g.rotate(-0.7);
    g.fillStyle = '#5a3b5e';
    g.beginPath();
    g.moveTo(0, -46);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, y = -46 + t * 92, w = Math.sin(t * Math.PI) * 30 + (i % 2 ? 3 : -2);
      g.lineTo(w, y);
    }
    for (let i = 12; i >= 0; i--) {
      const t = i / 12, y = -46 + t * 92, w = Math.sin(t * Math.PI) * 30 + (i % 2 ? 3 : -2);
      g.lineTo(-w, y);
    }
    g.fill();
    g.strokeStyle = 'rgba(160, 200, 120, 0.7)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -44); g.lineTo(0, 46); g.stroke();
    for (let i = -3; i <= 3; i++) {
      g.beginPath(); g.moveTo(0, i * 11); g.lineTo(18, i * 11 - 10); g.moveTo(0, i * 11); g.lineTo(-18, i * 11 - 10); g.stroke();
    }
    g.restore();
    glints(g, r, 5, 70, 3);
  },
  // 桃胶蜜羹: amber beads in clear syrup, catching the light
  taojiao(g, r) {
    fill(g, '#f3e2b8', '#e2c98e', '#c7a666');
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 72;
      const x = Math.cos(a) * d, y = Math.sin(a) * d, s = r.range(8, 15);
      blob(g, r, x + 2, y + 2, s, s * 0.8, r() * TAU, 'rgba(150, 90, 20, 0.25)', 0.2);
      blob(g, r, x, y, s, s * 0.8, r() * TAU, `rgba(${r.int(205, 225)}, ${r.int(120, 150)}, ${r.int(30, 50)}, 0.85)`, 0.2);
      g.fillStyle = 'rgba(255, 250, 230, 0.8)';
      g.beginPath();
      g.arc(x - s * 0.35, y - s * 0.3, s * 0.22, 0, TAU);
      g.fill();
    }
  },
  // 桑葚糕: three millet squares under a violet glaze on a dark plate, a purple drip
  shengao(g, r) {
    fill(g, '#3d3840', '#2d2a30', '#1d1b20');
    const at: [number, number][] = [[-30, -18], [26, -24], [0, 30]];
    for (const [x, y] of at) {
      const rot = r.range(-0.3, 0.3);
      block(g, x + 3, y + 4, 46, 46, rot, 'rgba(0, 0, 0, 0.4)', 5);
      block(g, x, y, 46, 46, rot, '#d9c08a', 5);
      block(g, x, y - 3, 44, 42, rot, '#5b2a63', 6);
      block(g, x - 6, y - 9, 22, 14, rot, 'rgba(190, 120, 200, 0.45)', 5);
      blob(g, r, x + 18, y + 22, 5, 7, 0, '#4a1f52', 0.1);
    }
    dots(g, r, 5, 'rgba(90, 30, 100, 0.9)', 2, 4, 80);
  },
  // 柳枝炙鱼: a small fish on a willow skewer, the skin charred, embers below
  zhiyu(g, r) {
    fill(g, '#4a3a33', '#2f2622', '#1c1714');
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 92;
      const e = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r.range(6, 14));
      e.addColorStop(0, `rgba(255, ${r.int(110, 170)}, 50, 0.85)`);
      e.addColorStop(1, 'rgba(255, 120, 40, 0)');
      g.fillStyle = e;
      g.fillRect(-100, -100, 200, 200);
    }
    g.save();
    g.rotate(-0.5);
    // the willow twig
    block(g, 0, 0, 200, 5, 0, '#8a7048', 2.5);
    // the fish
    g.fillStyle = '#6b5a45';
    g.beginPath();
    g.moveTo(-60, 0);
    g.bezierCurveTo(-40, -26, 30, -24, 50, 0);
    g.bezierCurveTo(30, 24, -40, 26, -60, 0);
    g.fill();
    g.beginPath();
    g.moveTo(46, 0); g.lineTo(72, -16); g.lineTo(66, 0); g.lineTo(72, 16); g.closePath();
    g.fill();
    // the char
    g.strokeStyle = 'rgba(25, 18, 12, 0.85)';
    g.lineWidth = 4;
    for (let x = -36; x <= 30; x += 12) { g.beginPath(); g.moveTo(x, -16); g.lineTo(x + 8, 16); g.stroke(); }
    g.fillStyle = 'rgba(240, 210, 160, 0.35)';
    g.beginPath(); g.ellipse(-8, -8, 26, 6, -0.05, 0, TAU); g.fill();
    g.fillStyle = '#f0e8d8';
    g.beginPath(); g.arc(-46, -4, 3.4, 0, TAU); g.fill();
    g.fillStyle = '#1b1916';
    g.beginPath(); g.arc(-46, -4, 1.6, 0, TAU); g.fill();
    g.restore();
  },
  // 艾糕: three glossy green cakes on a bamboo leaf, a saucer of honey
  's-aigao'(g, r) {
    fill(g, '#eae3d0', '#d9d0b8', '#c1b597');
    g.save();
    g.rotate(0.4);
    g.fillStyle = '#7d9a4f';
    g.beginPath();
    g.moveTo(-96, 0);
    g.quadraticCurveTo(0, -46, 96, 0);
    g.quadraticCurveTo(0, 46, -96, 0);
    g.fill();
    g.strokeStyle = 'rgba(210, 230, 170, 0.6)';
    g.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-86, i * 4); g.quadraticCurveTo(0, i * 10, 86, i * 4); g.stroke(); }
    g.restore();
    const at: [number, number][] = [[-30, -8], [8, 12], [42, -14]];
    for (const [x, y] of at) {
      blob(g, r, x + 3, y + 4, 22, 19, 0, 'rgba(40, 50, 20, 0.35)', 0.06);
      blob(g, r, x, y, 22, 19, 0, '#3f6b33', 0.06);
      blob(g, r, x - 7, y - 7, 8, 5, -0.6, 'rgba(210, 240, 190, 0.6)', 0.1);
    }
    g.fillStyle = '#f2ead6';
    g.beginPath(); g.arc(-40, 52, 20, 0, TAU); g.fill();
    g.fillStyle = '#dfa33c';
    g.beginPath(); g.arc(-40, 52, 14, 0, TAU); g.fill();
    glints(g, r, 1, 1, 3);
  },
  // 荷叶饭: the lotus leaf opened in four flaps, the rice studded with pickled shoots
  's-heye'(g, r) {
    fill(g, '#6f9458', '#557a42', '#3d5c30');
    g.strokeStyle = 'rgba(200, 225, 160, 0.5)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100); g.stroke();
    }
    blob(g, r, 2, 3, 56, 54, 0, 'rgba(30, 40, 20, 0.35)', 0.06);
    blob(g, r, 0, 0, 56, 54, 0, '#f3eee0', 0.06);
    for (let i = 0; i < 140; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 50;
      block(g, Math.cos(a) * d, Math.sin(a) * d, 5, 2.6, r() * TAU, 'rgba(210, 200, 175, 0.8)', 1.3);
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 40;
      block(g, Math.cos(a) * d, Math.sin(a) * d, r.range(9, 13), r.range(5, 7), r() * TAU, '#e3cf85', 2);
    }
  },
  // 桂花糖芋: brown malt syrup, soft taro chunks, gold flecks of osmanthus
  's-guiyu'(g, r) {
    fill(g, '#b0683a', '#8d4c24', '#6a3515');
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 56;
      const x = Math.cos(a) * d, y = Math.sin(a) * d, s = r.range(14, 20);
      blob(g, r, x + 2, y + 3, s, s * 0.85, r() * TAU, 'rgba(60, 25, 5, 0.4)', 0.16);
      blob(g, r, x, y, s, s * 0.85, r() * TAU, '#cdb9b4', 0.16);
      blob(g, r, x - 4, y - 4, s * 0.5, s * 0.35, 0, 'rgba(240, 230, 230, 0.6)', 0.2);
    }
    for (let i = 0; i < 40; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 86;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      g.fillStyle = '#f0b53a';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.57) * 1.6, y + Math.sin(k * 1.57) * 1.6, 1.5, 0, TAU); g.fill(); }
    }
    glints(g, r, 7, 80, 3);
  },
  // 菌子羹: brown broth, sliced mushrooms, slivers of ginger
  's-junge'(g, r) {
    fill(g, '#9a7650', '#7a5a3a', '#57401f');
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 62;
      const x = Math.cos(a) * d, y = Math.sin(a) * d, rot = r() * TAU;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = 'rgba(40, 25, 10, 0.4)';
      g.beginPath(); g.ellipse(2, 3, 18, 10, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#5a3c24';
      g.beginPath(); g.ellipse(0, 0, 18, 10, 0, Math.PI, TAU); g.fill();
      g.fillStyle = '#d9c7a4';
      g.beginPath(); g.ellipse(0, 0, 16, 6, 0, 0, Math.PI); g.fill();
      block(g, 0, 8, 6, 12, 0, '#d9c7a4', 2);
      g.strokeStyle = 'rgba(120, 90, 60, 0.6)';
      g.lineWidth = 0.8;
      for (let k = -12; k <= 12; k += 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k * 0.8, 5); g.stroke(); }
      g.restore();
    }
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 76;
      block(g, Math.cos(a) * d, Math.sin(a) * d, r.range(18, 26), 3.2, r() * TAU, '#ecd98e', 1.5);
    }
    glints(g, r, 14, 84, 3);
  },
};
