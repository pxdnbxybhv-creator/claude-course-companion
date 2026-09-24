#!/usr/bin/env node
// The brand seal: 半亩 carved in white (白文) into a cinnabar stamp with weathered edges.
//
//   node scripts/make_icons.mjs
//
// Writes public/icon.svg (plain paths, no filters or fonts, so it renders the same everywhere)
// and renders the PNG app icons from it with headless Chromium:
//   public/icon-192.png, public/icon-512.png        purpose "any"      (seal on xuan paper)
//   public/icon-maskable-512.png                    purpose "maskable" (seal inside the safe zone)
//   public/apple-touch-icon.png                     180×180, opaque
//
// Everything is deterministic (seeded), so re-running produces identical files.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const PAPER = '#f1e9d8';
const CINNABAR = '#b93a2b';
const CARVED = '#f8f1e3'; // the paper showing through the carved strokes
const DEEP = '#7e2216'; // mottling where the paste sits thick

// ------------------------------------------------------------------------------------------
// deterministic randomness

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1-D value noise in [-1, 1], periodic with the given period (in lattice units). */
function valueNoise1D(rand, period) {
  const n = Math.max(2, Math.round(period));
  const v = Array.from({ length: n }, () => rand() * 2 - 1);
  return (x) => {
    const xi = Math.floor(x);
    const f = x - xi;
    const a = v[((xi % n) + n) % n];
    const b = v[(((xi + 1) % n) + n) % n];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

// ------------------------------------------------------------------------------------------
// geometry

/** Round the corners of a polygon: each corner becomes a short quadratic arc. */
function roundCorners(poly, r) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const rr = Math.min(r, d1 / 2.2, d2 / 2.2);
    const a = [p1[0] + ((p0[0] - p1[0]) / d1) * rr, p1[1] + ((p0[1] - p1[1]) / d1) * rr];
    const b = [p1[0] + ((p2[0] - p1[0]) / d2) * rr, p1[1] + ((p2[1] - p1[1]) / d2) * rr];
    const steps = 4;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]);
    }
  }
  return out;
}

/** Resample a closed polyline at (roughly) uniform spacing. Returns points with arc length. */
function resample(poly, step) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, s0: total });
    total += len;
  }
  const count = Math.max(8, Math.round(total / step));
  const pts = [];
  let si = 0;
  for (let k = 0; k < count; k++) {
    const s = (k / count) * total;
    while (si < segs.length - 1 && segs[si].s0 + segs[si].len < s) si++;
    const g = segs[si];
    const t = g.len ? (s - g.s0) / g.len : 0;
    pts.push({ x: g.a[0] + (g.b[0] - g.a[0]) * t, y: g.a[1] + (g.b[1] - g.a[1]) * t, s });
  }
  return { pts, total };
}

/**
 * Carve a polygon: round its corners, then push every edge sample along the local normal by
 * fractal noise (a knife never cuts perfectly straight), plus optional chips (bites taken out).
 */
function weather(poly, { seed, corner = 3, amp = 1.2, scale = 14, step = 3, chips = [] }) {
  const rand = mulberry32(seed);
  const { pts, total } = resample(roundCorners(poly, corner), step);
  const nA = valueNoise1D(rand, total / scale);
  const nB = valueNoise1D(rand, total / (scale / 3.2));
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    let nx = next.y - prev.y;
    let ny = -(next.x - prev.x);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    let d = amp * (0.72 * nA((p.s / total) * (total / scale)) + 0.28 * nB((p.s / total) * (total / (scale / 3.2))));
    for (const c of chips) {
      let ds = Math.abs(p.s - c.at * total);
      ds = Math.min(ds, total - ds);
      d -= c.depth * Math.exp(-((ds / c.width) ** 2));
    }
    return [p.x + nx * d, p.y + ny * d];
  });
}

/** An irregular blob (speck of worn paste, or paper fibre). */
function blob(cx, cy, r, rand, pts = 7) {
  const out = [];
  const rot = rand() * Math.PI * 2;
  const squash = 0.6 + rand() * 0.5;
  for (let i = 0; i < pts; i++) {
    const a = rot + (i / pts) * Math.PI * 2;
    const rr = r * (0.65 + rand() * 0.6);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  return out;
}

const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => {
  const s = r1(v).toFixed(1);
  return (s.endsWith('.0') ? s.slice(0, -2) : s).replace(/^(-?)0\./, '$1.');
};
/** Join numbers the way SVG path data allows: a minus sign or a leading dot needs no space. */
const nums = (arr) => arr.map((v, i) => (i && !/^[-.]/.test(v) && !/\./.test(arr[i - 1]) ? ' ' : i && !/^-/.test(v) && /^\./.test(v) && !/\./.test(arr[i - 1]) ? ' ' : i && !/^-/.test(v) ? ' ' : '') + v).join('');

/** Polygon path in relative coordinates (deltas between rounded points, so nothing drifts). */
function pathD(polys) {
  return polys
    .map((poly) => {
      const pts = poly.map(([x, y]) => [r1(x), r1(y)]);
      const out = [];
      for (let i = 1; i < pts.length; i++) out.push(fmt(pts[i][0] - pts[i - 1][0]), fmt(pts[i][1] - pts[i - 1][1]));
      return `M${nums([fmt(pts[0][0]), fmt(pts[0][1])])}l${nums(out)}z`;
    })
    .join('');
}
/** Smooth closed path through the points (quadratic midpoints), relative — used for blobs. */
function smoothD(polys) {
  return polys
    .map((p) => {
      const n = p.length;
      const mid = (a, b) => [r1((a[0] + b[0]) / 2), r1((a[1] + b[1]) / 2)];
      let cur = mid(p[n - 1], p[0]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const c = [r1(p[i][0]), r1(p[i][1])];
        const m = mid(p[i], p[(i + 1) % n]);
        out.push(fmt(c[0] - cur[0]), fmt(c[1] - cur[1]), fmt(m[0] - cur[0]), fmt(m[1] - cur[1]));
        cur = m;
      }
      const s0 = mid(p[n - 1], p[0]);
      return `M${nums([fmt(s0[0]), fmt(s0[1])])}q${nums(out)}z`;
    })
    .join('');
}

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const quad = (...p) => p;

// ------------------------------------------------------------------------------------------
// the seal (design space: 512 × 512). A tall stamp — 半 over 亩, read top to bottom — the shape
// of a 引首章, so the two characters never merge into one (side by side, 亩半 reads like 畔).

const BODY = { x0: 106, y0: 22, x1: 406, y1: 490 };

function buildSeal() {
  const { x0: B0x, y0: B0y, x1: B1x, y1: B1y } = BODY;
  const M = 40; // red border inside the body
  const GAP = 32; // red channel between the characters
  const X = B0x + M;
  const CW = B1x - B0x - 2 * M; // character width (220)
  const W = 24; // stroke width of the carved lines
  const rs = mulberry32(99);
  // A carver's lines are never quite equal: each stroke gets its own width, ±2 px.
  const jit = () => (rs() - 0.5) * 4;
  const r = (x, y, w, h) => {
    const dx = w > h ? 0 : jit();
    const dy = w > h ? jit() : 0;
    return rect(x - dx / 2, y - dy / 2, w + dx, h + dy);
  };

  // 半: 丷 over 二, the long 丨 through them.
  const t1 = B0y + M;
  const H1 = 158;
  const ban = [
    quad([X + 38, t1], [X + 38 + W, t1], [X + 82, t1 + 42], [X + 82 - W, t1 + 42]),
    quad([X + CW - 38 - W, t1], [X + CW - 38, t1], [X + CW - 82 + W, t1 + 42], [X + CW - 82, t1 + 42]),
    r(X + 18, t1 + 50, CW - 36, W),
    r(X, t1 + 92, CW, W),
    r(X + CW / 2 - W / 2, t1 + 40, W, H1 - 40),
  ];
  // 亩: 亠 over 田.
  const t2 = t1 + H1 + GAP;
  const H2 = B1y - M - t2;
  const f = t2 + 74; // top of 田
  const FH = t2 + H2 - f;
  const mu = [
    r(X + CW / 2 - W / 2, t2 + 2, W, 26),
    r(X, t2 + 36, CW, W),
    r(X + 12, f, W, FH),
    r(X + CW - 12 - W, f, W, FH),
    r(X + CW / 2 - W / 2, f, W, FH),
    r(X + 12, f, CW - 24, W),
    r(X + 12, f + FH / 2 - W / 2, CW - 24, W),
    r(X + 12, f + FH - W, CW - 24, W),
  ];

  const body = weather(rect(B0x, B0y, B1x - B0x, B1y - B0y), {
    seed: 7,
    corner: 18,
    amp: 3.2,
    scale: 40,
    step: 3.5,
    chips: [
      { at: 0.07, depth: 7, width: 9 },
      { at: 0.335, depth: 4.5, width: 14 },
      { at: 0.52, depth: 9, width: 7 },
      { at: 0.61, depth: 3.5, width: 22 },
      { at: 0.86, depth: 6, width: 8 },
    ],
  });

  let seed = 100;
  const strokes = [...ban, ...mu].map((p) => weather(p, { seed: seed++, corner: 4, amp: 1.9, scale: 24, step: 3.2 }));

  const rand = mulberry32(2026);
  // Paste mottling: faint, darker clouds where the seal paste sits thick.
  const mottles = [];
  for (let i = 0; i < 14; i++) {
    mottles.push(blob(B0x + 30 + rand() * (B1x - B0x - 60), B0y + 30 + rand() * (B1y - B0y - 60), 18 + rand() * 38, rand, 9));
  }
  // Worn specks: paper showing through the red, mostly near the rim where a stamp wears first.
  const specks = [];
  for (let i = 0; i < 64; i++) {
    const side = Math.floor(rand() * 4);
    const horiz = side % 2 === 0;
    const along = horiz ? B0x + 14 + rand() * (B1x - B0x - 28) : B0y + 14 + rand() * (B1y - B0y - 28);
    const inset = 7 + Math.pow(rand(), 2.2) * (i < 46 ? 30 : 150);
    const [x, y] =
      side === 0 ? [along, B0y + inset] : side === 1 ? [B1x - inset, along] : side === 2 ? [along, B1y - inset] : [B0x + inset, along];
    specks.push(blob(x, y, 0.8 + Math.pow(rand(), 3) * 3.2, rand, 6));
  }
  // A few red flecks left on the carved strokes (paste that crept into the cut).
  const flecks = [
    blob(X + CW / 2 + 2, t1 + 142, 3, rand, 7),
    blob(X + 24, f + 40, 2.4, rand, 6),
    blob(X + CW - 50, t2 + 52, 2.2, rand, 6),
    blob(X + CW - 40, t1 + 112, 1.8, rand, 6),
  ];

  return [
    `<defs><path id="s" d="${pathD([body])}"/><clipPath id="b"><use href="#s"/></clipPath></defs>`,
    `<use href="#s" fill="${CINNABAR}"/>`,
    `<path fill="${DEEP}" opacity=".06" clip-path="url(#b)" d="${smoothD(mottles)}"/>`,
    `<path fill="${CARVED}" d="${pathD(strokes)}"/>`,
    `<path fill="${CINNABAR}" d="${smoothD(flecks)}"/>`,
    `<path fill="${CARVED}" d="${smoothD(specks)}"/>`,
  ].join('');
}

const seal = buildSeal();
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>半亩 · Half-Acre</title>${seal}</svg>\n`;
mkdirSync(PUBLIC, { recursive: true });
writeFileSync(join(PUBLIC, 'icon.svg'), iconSvg);
console.log(`public/icon.svg  ${(iconSvg.length / 1024).toFixed(1)} KB`);

// ------------------------------------------------------------------------------------------
// PNGs: the seal pressed onto xuan paper, slightly off-square as a hand would stamp it.

/** Composition on a paper square: `scale` = seal height / icon height. */
function onPaper(scale, rotate = -1.6) {
  const k = scale / ((BODY.y1 - BODY.y0) / 512);
  const cy = (BODY.y0 + BODY.y1) / 2;
  const cx = (BODY.x0 + BODY.x1) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><radialGradient id="v" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#b9a47c" stop-opacity=".22"/></radialGradient></defs>` +
    `<rect width="512" height="512" fill="${PAPER}"/><rect width="512" height="512" fill="url(#v)"/>` +
    `<g transform="translate(256 256) rotate(${rotate}) scale(${k}) translate(${-cx} ${-cy})">${seal}</g></svg>`
  );
}

const targets = [
  { file: 'icon-512.png', size: 512, svg: onPaper(0.8) },
  { file: 'icon-192.png', size: 192, svg: onPaper(0.8) },
  // Maskable: everything must sit inside the centred safe circle (radius 40 %). The seal's
  // diagonal is ~1.2 × its height, so a height of 62 % keeps even the corners inside.
  { file: 'icon-maskable-512.png', size: 512, svg: onPaper(0.62) },
  { file: 'apple-touch-icon.png', size: 180, svg: onPaper(0.78) },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const t of targets) {
    await page.setViewportSize({ width: t.size, height: t.size });
    const html = `<!doctype html><html><body style="margin:0">${t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" style="display:block" `)}</body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: join(PUBLIC, t.file), omitBackground: false });
    console.log(`public/${t.file}  ${t.size}×${t.size}`);
  }
} finally {
  await browser.close();
}
