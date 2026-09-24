// Small painters for the almanac: the moon (烘云托月), the hero's distant hills, and the ensō.
import { makeNoise2, makeRng, clamp, smoothstep } from '../../core/rng';
import { fillPaper, inkGrainTile } from '../../ink/paper';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number, dpr: number): CanvasRenderingContext2D {
  const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (c.width !== W) c.width = W;
  if (c.height !== H) c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return ctx;
}

// --------------------------------------------------------------------------- moon

export interface MoonPaint {
  /** 0 new → 0.5 full → 1 new. */
  phase: number;
  /** css px, edge of the square canvas. */
  size: number;
  dpr: number;
  dark: boolean;
  /** Southern hemisphere: the lit side is mirrored. */
  south?: boolean;
}

/**
 * The moon as an ink painter leaves it: the disc is bare paper, the night around it is a soft
 * wash, the unlit part a pale veil of ink. Per-pixel sphere shading gives a soft terminator.
 */
export function paintMoon(c: HTMLCanvasElement, o: MoonPaint): void {
  const ctx = sizeCanvas(c, o.size, o.size, o.dpr);
  const N = c.width;
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const R = N * 0.34, cx = N / 2, cy = N / 2;
  const th = o.phase * Math.PI * 2;
  // light direction: phase 0 → behind the moon, 0.25 → from the right (waxing, north), 0.5 → front
  const lx = Math.sin(th) * (o.south ? -1 : 1), lz = -Math.cos(th);
  const noise = makeNoise2(29, 0);
  const lit = o.dark ? [236, 228, 208] : [251, 247, 238];
  const ink = o.dark ? [236, 228, 210] : [27, 25, 22];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (x + 0.5 - cx) / R, ny = (y + 0.5 - cy) / R;
      const rr = nx * nx + ny * ny;
      const k = (y * N + x) * 4;
      const r = Math.sqrt(rr);
      if (r > 1.02) {
        // halo: a wash around the moon (light) / a faint glow (dark)
        const t = clamp((r - 1) / 0.45, 0, 1);
        const a = (1 - smoothstep(0, 1, t)) * (o.dark ? 0.1 : 0.13) * (0.85 + 0.15 * noise(nx * 3, ny * 3));
        const col = o.dark ? lit : ink;
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = a * 255;
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - rr));
      const dot = nx * lx + nz * lz;
      const light = smoothstep(-0.1, 0.16, dot);
      // maria: a few soft darker seas, only faintly
      const sea = clamp(noise(nx * 2.2 + 3, ny * 2.2 - 1) * 1.4 + noise(nx * 5, ny * 5) * 0.35 - 0.1, 0, 1);
      const limb = 1 - Math.pow(r, 6) * 0.25;
      const edge = 1 - smoothstep(0.985, 1.02, r); // anti-aliased rim
      if (o.dark) {
        const litA = (0.93 - sea * 0.16) * limb;
        const a = light * litA + (1 - light) * 0.1;
        d[k] = lit[0]; d[k + 1] = lit[1] - sea * 6; d[k + 2] = lit[2] - sea * 12;
        d[k + 3] = a * edge * 255;
      } else {
        // bare paper where lit (with faint seas), a pale ink veil where dark
        const shade = (1 - light) * 0.2 + light * sea * 0.07 + (1 - limb) * 0.2 * light;
        d[k] = lit[0] * (1 - shade) + ink[0] * shade;
        d[k + 1] = lit[1] * (1 - shade) + ink[1] * shade;
        d[k + 2] = lit[2] * (1 - shade) + ink[2] * shade;
        // the rim blends into the halo wash
        d[k + 3] = edge * 255 + (1 - edge) * 0.13 * 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (!o.dark) {
    // ink sits in the paper: punch a little grain out of the wash
    const g = inkGrainTile('wash');
    const pat = ctx.createPattern(g, 'repeat');
    if (pat) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.rect(0, 0, N, N);
      ctx.arc(cx, cy, R * 1.01, 0, Math.PI * 2, true);
      ctx.fillStyle = pat;
      ctx.fill('evenodd');
      ctx.restore();
    }
  }
}

// --------------------------------------------------------------------------- hero backdrop

const TINTS: Record<Season, [string, string, string]> = {
  // far, middle, near
  spring: ['#6f8f7c', '#50695a', '#2f3a33'],
  summer: ['#6f879a', '#4c6477', '#2c343b'],
  autumn: ['#a08a6c', '#7a6146', '#3a3128'],
  winter: ['#8d9099', '#62656e', '#34353a'],
};

/**
 * Xuan paper with two or three bands of distant hills dissolving into mist at their feet,
 * kept to the right so the term name has the empty paper on the left.
 */
export function paintHeroBackdrop(c: HTMLCanvasElement, w: number, h: number, dpr: number, season: Season, seed: number): void {
  const ctx = sizeCanvas(c, w, h, dpr);
  ctx.scale(dpr, dpr);
  fillPaper(ctx, w, h, 11);
  const rng = makeRng(seed);
  const tint = TINTS[season];
  const layers = [
    { base: 0.7, amp: 0.3, alpha: 0.13, x0: 0.34, col: tint[0], soft: 5 },
    { base: 0.8, amp: 0.22, alpha: 0.17, x0: 0.5, col: tint[1], soft: 4 },
    { base: 0.93, amp: 0.13, alpha: 0.2, x0: 0.62, col: tint[2], soft: 3 },
  ];
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const noise = makeNoise2(seed + li * 17, 0);
    // two or three rounded peaks, the tallest toward the right
    const peaks = Array.from({ length: rng.int(2, 3) }, (_, i) => ({
      x: L.x0 + (1 - L.x0) * (0.2 + 0.7 * ((i + rng.range(0.1, 0.9)) / 3)),
      hgt: rng.range(0.5, 1),
      wid: rng.range(0.1, 0.2),
    }));
    const ridge = (u: number) => {
      let v = 0;
      for (const p of peaks) {
        const q = (u - p.x) / p.wid;
        v = Math.max(v, p.hgt * Math.exp(-q * q * 0.9));
      }
      // fade out to the left: the paper stays empty
      const fade = smoothstep(L.x0 - 0.2, L.x0 + 0.15, u);
      return (v * 0.85 + 0.15 * (0.5 + 0.5 * noise(u * 9, li))) * fade + noise(u * 30, li + 5) * 0.02;
    };
    // paint at a third of the resolution and scale up: soft, bled edges for free
    const ds = 3;
    const lw = Math.ceil((w * dpr) / ds), lh = Math.ceil((h * dpr) / ds);
    const lc = document.createElement('canvas');
    lc.width = lw; lc.height = lh;
    const lx = lc.getContext('2d')!;
    const sx = lw / w, sy = lh / h;
    const topY = h * (L.base - L.amp);
    const footY = h * L.base;
    lx.beginPath();
    lx.moveTo(0, lh);
    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const y = footY - ridge(u) * h * L.amp;
      lx.lineTo(u * w * sx, y * sy);
    }
    lx.lineTo(lw, lh);
    lx.closePath();
    const g = lx.createLinearGradient(0, topY * sy, 0, Math.min(h, footY + h * 0.08) * sy);
    g.addColorStop(0, hexA(L.col, L.alpha));
    g.addColorStop(0.35, hexA(L.col, L.alpha * 0.8));
    g.addColorStop(1, hexA(L.col, 0));
    lx.fillStyle = g;
    lx.fill();
    // grain: the wash pools unevenly in the fibres
    const pat = lx.createPattern(inkGrainTile('wash'), 'repeat');
    if (pat) {
      lx.globalCompositeOperation = 'destination-out';
      lx.globalAlpha = 0.6;
      lx.fillStyle = pat;
      lx.fillRect(0, 0, lw, lh);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(lc, 0, 0, w, h);
    ctx.restore();
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`;
}

// --------------------------------------------------------------------------- ensō

/**
 * An ensō (圆相) as an SVG path in a 100×100 box: one brush turn, heavy at the start, tapering
 * and breaking into dry streaks as it closes — never quite meeting itself.
 */
export function ensoPath(seed = 3): string {
  const rng = makeRng(seed);
  const n = 64;
  const a0 = -Math.PI * 0.62 + rng.range(-0.15, 0.15);
  const sweep = Math.PI * 2 * rng.range(0.86, 0.92);
  const cx = 50, cy = 50, R = 40;
  const outer: string[] = [], inner: string[] = [];
  let wob = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + sweep * t;
    wob += rng.gauss() * 0.12;
    wob *= 0.85;
    const r = R * (1 + 0.035 * Math.sin(t * Math.PI * 2 + 1) + wob * 0.02) + (t > 0.8 ? (t - 0.8) * 6 : 0);
    // width: a blot at 起笔, a full body, then 收笔 tapering to a thread
    const w = 7.5 * (t < 0.06 ? 0.75 + t * 4 : 1) * (1 - smoothstep(0.55, 1, t) * 0.85) + 0.5;
    const ox = cx + Math.cos(a) * (r + w / 2), oy = cy + Math.sin(a) * (r + w / 2);
    const ix = cx + Math.cos(a) * (r - w / 2), iy = cy + Math.sin(a) * (r - w / 2);
    outer.push(`${ox.toFixed(2)} ${oy.toFixed(2)}`);
    inner.push(`${ix.toFixed(2)} ${iy.toFixed(2)}`);
  }
  inner.reverse();
  return `M${outer.join('L')}L${inner.join('L')}Z`;
}
