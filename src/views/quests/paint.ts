// Canvas helpers for the quest book: a small paint queue (so a page of portraits and seals never
// stalls a frame), cached seal impressions, faint seal outlines, a portrait fallback, and an ink
// wash bloom for the celebration.
import { makeSeal, sealReady, SEAL_RED } from '../../ink/seal';
import { paintStroke } from '../../ink/brush';
import { fillPaper } from '../../ink/paper';
import { hashString, makeRng, makeNoise2 } from '../../core/rng';
import { CHARACTER } from '../../data/characters';
// The portrait painter directly (not the characters index, which also carries the 3D models):
// the celebration lives in the main bundle.
import { paintPortrait } from '../walk/characters/portrait';
import { sealLook } from './helpers';

// ------------------------------------------------------------------------------------ queue

type Job = { run: () => void; dead: boolean };
const queue: Job[] = [];
let pumping = false;

function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 10) {
    const j = queue.shift()!;
    if (j.dead) continue;
    try {
      j.run();
    } catch (e) {
      console.warn('[quests] paint failed', e);
    }
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

/** Run `run` on a later frame, a few at a time. Returns a cancel function. */
export function enqueuePaint(run: () => void): () => void {
  const j: Job = { run, dead: false };
  queue.push(j);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return () => void (j.dead = true);
}

export const dprOf = () => Math.min(2.5, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

// ------------------------------------------------------------------------------------ seals

const sealCache = new Map<string, HTMLCanvasElement>();

/** A seal impression, cached per text & size. Waits for the seal fonts first. */
export async function getSeal(text: string, size: number, dpr: number): Promise<HTMLCanvasElement> {
  const look = sealLook(text);
  const key = `${text}|${size}|${dpr}`;
  const hit = sealCache.get(key);
  if (hit) return hit;
  await sealReady(text);
  const c = makeSeal(text, { size, dpr, style: look.style, shape: look.shape, wear: 0.45, seed: hashString('album:' + text) });
  if (sealCache.size > 80) sealCache.delete(sealCache.keys().next().value as string);
  sealCache.set(key, c);
  return c;
}

/** Faint outline of a seal not yet earned: the stone's face drawn in a thin cinnabar hairline, the glyphs a ghost. */
export function paintSealOutline(canvas: HTMLCanvasElement, text: string): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width, H = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const look = sealLook(text);
  const s = Math.min(W, H);
  const cx = W / 2, cy = H / 2;
  const a = look.shape === 'oval' ? s * 0.33 : s * 0.46, b = s * 0.46;
  g.save();
  g.strokeStyle = SEAL_RED;
  g.globalAlpha = 0.32;
  g.lineWidth = Math.max(1, s * 0.012);
  g.setLineDash([s * 0.035, s * 0.03]);
  g.beginPath();
  if (look.shape === 'square') {
    const r = s * 0.06;
    g.roundRect ? g.roundRect(cx - a, cy - b, a * 2, b * 2, r) : g.rect(cx - a, cy - b, a * 2, b * 2);
  } else g.ellipse(cx, cy, a, b, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // the ghost of the characters
  const chars = Array.from(text).slice(0, 4);
  g.globalAlpha = 0.1;
  g.fillStyle = SEAL_RED;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fs = chars.length === 1 ? s * 0.56 : s * 0.36;
  g.font = `${fs}px 'Ma Shan Zheng','LXGW WenKai',serif`;
  if (chars.length <= 1) g.fillText(chars[0] ?? '', cx, cy);
  else if (chars.length === 2) {
    g.fillText(chars[0], cx, cy - fs * 0.52);
    g.fillText(chars[1], cx, cy + fs * 0.52);
  } else {
    // right column first, top to bottom (traditional reading order)
    const pos = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
    chars.forEach((ch, i) => g.fillText(ch, cx + pos[i][0] * fs * 0.52, cy + pos[i][1] * fs * 0.52));
  }
  g.restore();
}

// ------------------------------------------------------------------------------------ portraits

/**
 * A companion's round-fan portrait. Uses the characters module's painter; if that is missing or
 * fails, paints a simple ink silhouette with the name's first glyph.
 */
export function paintCompanion(canvas: HTMLCanvasElement, id: string, locked: boolean): void {
  if (typeof paintPortrait === 'function') {
    try {
      paintPortrait(canvas, id, locked);
      if (hasInk(canvas)) return;
    } catch (e) {
      console.warn('[quests] portrait failed, using fallback', e);
    }
  }
  paintFallbackPortrait(canvas, id, locked);
}

function hasInk(canvas: HTMLCanvasElement): boolean {
  try {
    const g = canvas.getContext('2d');
    if (!g) return false;
    const { width: W, height: H } = canvas;
    const d = g.getImageData(Math.floor(W / 2) - 2, Math.floor(H / 2) - 2, 4, 4).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  } catch {
    return true;
  }
}

export function paintFallbackPortrait(canvas: HTMLCanvasElement, id: string, locked: boolean): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width, H = canvas.height;
  const R = Math.min(W, H) / 2 - 1;
  const cx = W / 2, cy = H / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  fillPaper(g, W, H, 5 + id.length);
  // a figure: head and a robe, in one wash
  const k = R / 50;
  const tone = locked ? 0.12 : 0.34;
  paintStroke(g, { kind: 'wash', tone, birth: 0, seed: hashString(id), pts: [
    { x: cx - 30 * k, y: cy + 52 * k, w: 3 * k }, { x: cx - 22 * k, y: cy + 8 * k, w: 1 }, { x: cx - 8 * k, y: cy - 2 * k, w: 1 },
    { x: cx + 8 * k, y: cy - 2 * k, w: 1 }, { x: cx + 22 * k, y: cy + 8 * k, w: 1 }, { x: cx + 30 * k, y: cy + 52 * k, w: 1 },
  ] });
  paintStroke(g, { kind: 'dot', tone: locked ? 0.16 : 0.6, birth: 0, seed: hashString(id) + 1, pts: [{ x: cx, y: cy - 16 * k, w: 22 * k }] });
  const name = CHARACTER[id as keyof typeof CHARACTER]?.zh ?? '?';
  g.fillStyle = locked ? 'rgba(27,25,22,0.18)' : 'rgba(27,25,22,0.82)';
  g.font = `${R * 0.42}px 'Ma Shan Zheng','LXGW WenKai',serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(locked ? '?' : Array.from(name)[0], cx + R * 0.52, cy - R * 0.42);
  g.restore();
  g.strokeStyle = 'rgba(27,25,22,0.28)';
  g.lineWidth = Math.max(1, R * 0.012);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
}

// ------------------------------------------------------------------------------------ paper & wash

/** Paper for a page-sized canvas (always xuan paper, in dark mode too — it is a painting). */
export function paintPaper(canvas: HTMLCanvasElement, seed: number): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  fillPaper(g, canvas.width, canvas.height, seed);
}

/**
 * An ink wash blooming on paper: a big pale irregular blot with a darker heart and a few splashes.
 * Transparent canvas; the celebration scales it up with CSS.
 */
export function paintBloom(canvas: HTMLCanvasElement, seed: number, moon = false): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width, H = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const rng = makeRng(seed);
  const nz = makeNoise2(seed);
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2;
  const blob = (r: number, tone: number, s: number, rough: number, color?: string) => {
    const pts = [];
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + rough * nz.fbm(Math.cos(a) * 1.4 + s, Math.sin(a) * 1.4 + s, 3);
      pts.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k * 0.94, w: i === 0 ? r * 0.12 : 1 });
    }
    paintStroke(g, { kind: 'wash', tone, color, birth: 0, seed: seed + s * 7, pts });
  };
  if (moon) {
    blob(R * 0.9, 0.16, 1, 0.14, '#3d5a73');
    blob(R * 0.7, 0.14, 2, 0.1, '#3d5a73');
  } else {
    blob(R * 0.9, 0.14, 1, 0.26);
    blob(R * 0.74, 0.16, 2, 0.2);
    blob(R * 0.58, 0.12, 3, 0.16);
  }
  // splashes flung from the drop
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = R * (0.8 + rng() * 0.18);
    paintStroke(g, { kind: 'dot', tone: 0.18 + rng() * 0.3, birth: 0, seed: seed + 100 + i, color: moon ? '#3d5a73' : undefined,
      pts: [{ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, w: R * (0.012 + rng() * 0.03) }] });
  }
}
