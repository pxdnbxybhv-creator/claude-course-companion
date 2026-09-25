// 华容道 painting: a rosewood tray on paper with a gap in the bottom rail, and the pieces as carved
// boxwood tiles — the name cut into each one and filled with lacquer. 曹操 is red sandalwood with
// gilded characters. Everything is procedural (seeded) and cached per size.
import { makeRng } from '../../../core/rng';
import { COLS, ROWS, ROLE_NAMES, type Role } from './logic';

/** Rail width, and the room under the tray for the road out, in cells. */
export const FRAME = 0.3;
export const TAIL = 0.72;
export const ASPECT = (COLS + 2 * FRAME) / (ROWS + 2 * FRAME + TAIL);

export const BRUSH_FONT = "'Ma Shan Zheng', 'LXGW WenKai', 'STKaiti', 'KaiTi', serif";
export const TEXT_FONT = "'LXGW WenKai', 'STKaiti', 'KaiTi', serif";

interface Wood { base: string; light: string; dark: string; grain: string; text: string; glint: string }

const WOODS: Record<'cao' | 'general' | 'bing' | 'rail', Wood> = {
  cao: { base: '#80301f', light: '#a04a32', dark: '#5c1d12', grain: 'rgba(40,8,2,0.28)', text: '#ecca82', glint: 'rgba(255,214,150,0.3)' },
  general: { base: '#cfa468', light: '#e4c38d', dark: '#ae844d', grain: 'rgba(110,70,25,0.22)', text: '#2a1c0f', glint: 'rgba(255,246,222,0.55)' },
  bing: { base: '#dcc398', light: '#ecd9b4', dark: '#c3a673', grain: 'rgba(120,85,40,0.18)', text: '#3b2a18', glint: 'rgba(255,248,230,0.55)' },
  rail: { base: '#4a2a1a', light: '#6b3f27', dark: '#2e1810', grain: 'rgba(12,4,0,0.35)', text: '#c9a45f', glint: 'rgba(255,220,170,0.18)' },
};

export function woodOf(role: Role): Wood {
  return role === 'cao' ? WOODS.cao : role === 'bing' ? WOODS.bing : WOODS.general;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fill the current clip with wood: a soft gradient, then long wavering grain lines. */
function woodGrain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wood: Wood, seed: number, vertical: boolean) {
  const rng = makeRng(seed);
  const g = vertical ? ctx.createLinearGradient(x, y, x + w, y) : ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, wood.light);
  g.addColorStop(0.45, wood.base);
  g.addColorStop(1, wood.dark);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // grain runs along the long side
  const along = vertical ? h : w, across = vertical ? w : h;
  const n = Math.max(6, Math.round(across / 3.2));
  const f1 = rng.range(0.6, 1.4) / along, ph = rng() * 6;
  const knot = rng.chance(0.5) ? { a: rng.range(0.2, 0.8) * along, c: rng.range(0.25, 0.75) * across, r: across * rng.range(0.12, 0.2) } : null;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const c0 = ((i + rng.range(-0.3, 0.3)) / n) * across;
    ctx.beginPath();
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * along;
      let c = c0 + Math.sin(a * f1 * Math.PI * 2 + ph + i * 0.35) * across * 0.035 + Math.sin(a * 0.07 + i) * 0.6;
      if (knot) {
        const d = Math.hypot(a - knot.a, c - knot.c);
        if (d < knot.r * 2.4) c += ((c - knot.c) / (d || 1)) * (knot.r * 2.4 - d) * 0.35;
      }
      const px = vertical ? x + c : x + a, py = vertical ? y + a : y + c;
      if (s) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = wood.grain;
    ctx.globalAlpha = rng.range(0.35, 1);
    ctx.lineWidth = rng.range(0.4, 1.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (knot) {
    const kx = vertical ? x + knot.c : x + knot.a, ky = vertical ? y + knot.a : y + knot.c;
    const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, knot.r);
    kg.addColorStop(0, wood.grain);
    kg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.ellipse(kx, ky, vertical ? knot.r * 0.7 : knot.r, vertical ? knot.r : knot.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Padding (css px) around a tile canvas for its shadow. */
export const tilePad = (cell: number) => Math.ceil(cell * 0.16);

/**
 * One carved tile, as a canvas `(w·cell + 2·pad) × (h·cell + 2·pad)` css px (times dpr), with its
 * contact shadow baked in. `lifted` paints a deeper shadow (the tile being dragged).
 */
export function makeTile(role: Role, w: number, h: number, cell: number, dpr: number, seed: number, lifted = false): HTMLCanvasElement {
  const pad = tilePad(cell);
  const W = w * cell, H = h * cell;
  const c = document.createElement('canvas');
  c.width = Math.ceil((W + pad * 2) * dpr);
  c.height = Math.ceil((H + pad * 2) * dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gap = Math.max(1.5, cell * 0.035);
  const x = pad + gap, y = pad + gap, tw = W - gap * 2, th = H - gap * 2;
  const r = cell * 0.1;
  const wood = woodOf(role);

  // contact shadow
  ctx.save();
  ctx.shadowColor = lifted ? 'rgba(30,14,4,0.5)' : 'rgba(30,14,4,0.42)';
  ctx.shadowBlur = cell * (lifted ? 0.18 : 0.06);
  ctx.shadowOffsetY = cell * (lifted ? 0.07 : 0.025);
  ctx.shadowOffsetX = cell * (lifted ? 0.02 : 0.008);
  roundRect(ctx, x, y, tw, th, r);
  ctx.fillStyle = wood.dark;
  ctx.fill();
  ctx.restore();

  // the wood
  ctx.save();
  roundRect(ctx, x, y, tw, th, r);
  ctx.clip();
  woodGrain(ctx, x, y, tw, th, wood, seed, h > w);
  // bevel: light on the upper-left edges, dark on the lower-right
  const bw = Math.max(1.5, cell * 0.045);
  ctx.lineWidth = bw * 2;
  ctx.strokeStyle = wood.glint;
  ctx.beginPath();
  ctx.moveTo(x, y + th - r);
  ctx.lineTo(x, y);
  ctx.lineTo(x + tw - r, y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,18,4,0.32)';
  ctx.beginPath();
  ctx.moveTo(x + tw, y + r);
  ctx.lineTo(x + tw, y + th);
  ctx.lineTo(x + r, y + th);
  ctx.stroke();
  // a carved panel inside the face (not on the little soldiers)
  if (role !== 'bing') {
    const ins = cell * 0.13;
    roundRect(ctx, x + ins, y + ins, tw - ins * 2, th - ins * 2, r * 0.6);
    ctx.lineWidth = Math.max(1, cell * 0.014);
    ctx.strokeStyle = role === 'cao' ? 'rgba(20,4,0,0.45)' : 'rgba(70,40,12,0.4)';
    ctx.stroke();
    ctx.save();
    ctx.translate(0.8, 0.9);
    ctx.strokeStyle = wood.glint;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // the name, cut in and lacquered
  const name = ROLE_NAMES[role].zh;
  const chars = [...name];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = x + tw / 2, cy = y + th / 2;
  let size: number;
  let pos: { x: number; y: number }[];
  if (role === 'cao') {
    size = cell * 0.74;
    pos = [{ x: cx, y: cy - cell * 0.4 }, { x: cx, y: cy + cell * 0.4 }];
  } else if (role === 'bing') {
    size = cell * 0.5;
    pos = [{ x: cx, y: cy + cell * 0.02 }];
  } else if (h > w) {
    size = cell * 0.5;
    pos = [{ x: cx, y: cy - cell * 0.34 }, { x: cx, y: cy + cell * 0.34 }];
  } else {
    size = cell * 0.5;
    pos = [{ x: cx - cell * 0.36, y: cy + cell * 0.02 }, { x: cx + cell * 0.36, y: cy + cell * 0.02 }];
  }
  ctx.font = `${size}px ${BRUSH_FONT}`;
  chars.forEach((ch, i) => {
    const p = pos[i];
    // the lower lip of the groove catches the light…
    ctx.fillStyle = role === 'cao' ? 'rgba(255,200,140,0.22)' : 'rgba(255,248,228,0.7)';
    ctx.fillText(ch, p.x + size * 0.025, p.y + size * 0.035);
    // …the groove itself is filled with lacquer (or gilt, for 曹操)
    ctx.fillStyle = role === 'cao' ? 'rgba(30,6,2,0.55)' : 'rgba(80,50,20,0.35)';
    ctx.fillText(ch, p.x - size * 0.02, p.y - size * 0.025);
    ctx.fillStyle = wood.text;
    ctx.fillText(ch, p.x, p.y);
  });
  // 关羽's red face, 张飞's black — a dab of opera colour on the generals (脸谱)
  const face: Partial<Record<Role, string>> = { guan: '#b93a2b', zhang: '#1b1916', zhao: '#f1ead8', ma: '#6f8fa6', huang: '#d9a62e' };
  const f = face[role];
  if (f) {
    const rr = cell * 0.055;
    const fx = h > w ? x + tw - cell * 0.2 : x + tw - cell * 0.2;
    const fy = h > w ? y + th - cell * 0.2 : y + th - cell * 0.2;
    ctx.beginPath();
    ctx.arc(fx, fy, rr, 0, Math.PI * 2);
    ctx.fillStyle = f;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60,30,8,0.45)';
    ctx.stroke();
  }
  return c;
}

/** The tray: paper around, a rosewood frame, a sunken floor, the gap in the bottom rail. */
export function paintTray(ctx: CanvasRenderingContext2D, cell: number, seed = 5): void {
  const W = (COLS + 2 * FRAME) * cell;
  const Hf = (ROWS + 2 * FRAME) * cell;
  const fr = FRAME * cell;
  const r = cell * 0.16;
  // the frame
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,6,0.35)';
  ctx.shadowBlur = cell * 0.14;
  ctx.shadowOffsetY = cell * 0.04;
  roundRect(ctx, 1, 1, W - 2, Hf - 2, r);
  ctx.fillStyle = WOODS.rail.dark;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, 1, 1, W - 2, Hf - 2, r);
  ctx.clip();
  woodGrain(ctx, 0, 0, W, Hf, WOODS.rail, seed, false);
  ctx.lineWidth = 2;
  ctx.strokeStyle = WOODS.rail.glint;
  roundRect(ctx, 2, 2, W - 4, Hf - 4, r);
  ctx.stroke();
  ctx.restore();
  // the floor, sunk below the rails
  ctx.save();
  ctx.beginPath();
  ctx.rect(fr, fr, COLS * cell, ROWS * cell);
  ctx.clip();
  const fg = ctx.createLinearGradient(0, fr, 0, fr + ROWS * cell);
  fg.addColorStop(0, '#6a4a30');
  fg.addColorStop(1, '#5a3c26');
  ctx.fillStyle = fg;
  ctx.fillRect(fr, fr, COLS * cell, ROWS * cell);
  woodGrain(ctx, fr, fr, COLS * cell, ROWS * cell, { base: '#6a4a30', light: '#775538', dark: '#4e3321', grain: 'rgba(20,8,2,0.22)', text: '', glint: '' }, seed + 7, true);
  // faint engraved grid, so an empty cell reads as a place
  ctx.strokeStyle = 'rgba(20,8,0,0.22)';
  ctx.lineWidth = 1;
  for (let i = 1; i < COLS; i++) {
    ctx.beginPath();
    ctx.moveTo(fr + i * cell + 0.5, fr);
    ctx.lineTo(fr + i * cell + 0.5, fr + ROWS * cell);
    ctx.stroke();
  }
  for (let j = 1; j < ROWS; j++) {
    ctx.beginPath();
    ctx.moveTo(fr, fr + j * cell + 0.5);
    ctx.lineTo(fr + COLS * cell, fr + j * cell + 0.5);
    ctx.stroke();
  }
  // inner shadow from the rails
  const sh = cell * 0.12;
  const sides: [number, number, number, number, number, number, number, number][] = [
    [fr, fr, COLS * cell, sh, fr, fr, fr, fr + sh],
    [fr, fr, sh, ROWS * cell, fr, fr, fr + sh, fr],
  ];
  for (const [x, y, w, h, x0, y0, x1, y1] of sides) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(10,4,0,0.45)');
    g.addColorStop(1, 'rgba(10,4,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  // the gap in the bottom rail — the pass itself
  const gx = fr + cell, gw = cell * 2;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(gx, fr + ROWS * cell, gw, fr + 2);
  ctx.restore();
  // rail ends at the gap
  for (const ex of [gx, gx + gw]) {
    const g = ctx.createLinearGradient(ex - 3, 0, ex + 3, 0);
    g.addColorStop(0, ex === gx ? 'rgba(0,0,0,0.25)' : 'rgba(255,220,170,0.15)');
    g.addColorStop(1, ex === gx ? 'rgba(255,220,170,0.15)' : 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(ex - 1.5, fr + ROWS * cell, 3, fr);
  }
  // the road out, and its name in cinnabar
  const ty = Hf + TAIL * cell * 0.48;
  ctx.font = `${cell * 0.3}px ${BRUSH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(192,65,47,0.9)';
  const label = '华 容 道';
  ctx.fillText(label, W / 2, ty);
  ctx.strokeStyle = 'rgba(192,65,47,0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + s * cell * 0.62, ty);
    ctx.lineTo(W / 2 + s * cell * 1.3, ty);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Top-left of cell (x, y) in css px. */
export const cellOrigin = (cell: number, x: number, y: number) => ({ x: (FRAME + x) * cell, y: (FRAME + y) * cell });
