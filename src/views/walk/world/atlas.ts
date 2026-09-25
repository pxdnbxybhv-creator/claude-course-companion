// 舆图 — the map of the world, painted on paper in ink from map.ts and the baked land: hills as
// washes with a few 米点 and ridge strokes, the lotus lake and the river in pale wash, paths as
// fine broken lines, each place named in brush (faint with a ？ until you have been there), and a
// cinnabar mark for where you stand. Pure Canvas 2D; no three.js.
import { LAKE, PATHS, REGIONS, WORLD_RADIUS, type RegionId } from '../map';
import { RIVER_SAMPLES, POOL, terrain } from './terrain';
import { makeRng } from '../../../core/rng';

export interface AtlasOpts {
  visited: ReadonlySet<RegionId>;
  player: { x: number; z: number; heading: number } | null;
  lang: 'zh' | 'en';
}

/** World → canvas pixels for a square canvas of side S. */
export function atlasScale(S: number): { k: number; c: number } {
  return { k: (S * 0.44) / WORLD_RADIUS, c: S / 2 };
}

/** The land shading is the slow part: cache it per size. */
let landCache: { S: number; c: HTMLCanvasElement } | null = null;

function landLayer(S: number): HTMLCanvasElement {
  if (landCache && landCache.S === S) return landCache.c;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const T = terrain();
  const { k, c: o } = atlasScale(S);
  const N = Math.min(240, Math.round(S / 2.5));
  const img = g.createImageData(N, N);
  const R = (S / 2) / k; // world metres covered to the canvas edge
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N * 2 - 1) * R, z = ((j + 0.5) / N * 2 - 1) * R;
    const h = T.height(x, z);
    // light from the north-west (the painter's habit), shade on the far slopes
    const e = 2;
    const dx = T.height(x + e, z) - T.height(x - e, z), dz = T.height(x, z + e) - T.height(x, z - e);
    const shade = Math.max(0, (dx + dz) * 0.35);
    const up = Math.min(1, Math.max(0, h / 30));
    const r = Math.hypot(x, z);
    const rim = Math.min(1, Math.max(0, (r - WORLD_RADIUS + 8) / 30));
    const a = Math.min(0.75, up * 0.35 + shade * 0.5 + rim * 0.25);
    const p = (j * N + i) * 4;
    img.data[p] = 52; img.data[p + 1] = 58; img.data[p + 2] = 60;
    img.data[p + 3] = Math.round(a * 255);
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = N;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.85;
  g.drawImage(tmp, 0, 0, S, S);
  g.globalAlpha = 1;
  // 米点 on the hills and a few ridge strokes on the high ground
  const rng = makeRng(77);
  for (let n = 0; n < 1600; n++) {
    const x = rng.range(-WORLD_RADIUS - 30, WORLD_RADIUS + 30), z = rng.range(-WORLD_RADIUS - 30, WORLD_RADIUS + 30);
    const h = T.height(x, z);
    if (h < 5 || rng() > h / 30) continue;
    g.fillStyle = `rgba(30,32,30,${rng.range(0.15, 0.45)})`;
    g.beginPath();
    g.ellipse(o + x * k, o + z * k, rng.range(1.2, 2.6) * (S / 600), rng.range(0.6, 1.2) * (S / 600), 0, 0, Math.PI * 2);
    g.fill();
  }
  landCache = { S, c };
  return c;
}

export function paintAtlas(canvas: HTMLCanvasElement, o: AtlasOpts): void {
  const S = canvas.width;
  const g = canvas.getContext('2d');
  if (!g) return;
  const { k, c } = atlasScale(S);
  const X = (x: number) => c + x * k, Z = (z: number) => c + z * k;
  const u = S / 600;
  g.clearRect(0, 0, S, S);
  // paper
  g.fillStyle = '#f1e9d8';
  g.fillRect(0, 0, S, S);
  g.drawImage(landLayer(S), 0, 0);
  // the edge of the world dissolves in mist
  const mist = g.createRadialGradient(c, c, WORLD_RADIUS * k * 0.92, c, c, S * 0.72);
  mist.addColorStop(0, 'rgba(241,233,216,0)');
  mist.addColorStop(0.35, 'rgba(241,233,216,0.75)');
  mist.addColorStop(1, 'rgba(241,233,216,1)');
  g.fillStyle = mist;
  g.fillRect(0, 0, S, S);

  g.lineCap = 'round';
  g.lineJoin = 'round';
  // water: the lake, the river, the pool, the half-acre pond
  const wash = 'rgba(108,128,138,0.28)';
  g.fillStyle = wash;
  g.beginPath(); g.ellipse(X(LAKE.x), Z(LAKE.z), LAKE.rx * k, LAKE.rz * k, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(30,34,36,0.55)';
  g.lineWidth = 1.4 * u;
  g.stroke();
  const RS = RIVER_SAMPLES;
  for (let i = 1; i < RS.length; i++) {
    const a = RS[i - 1], b = RS[i];
    if (a.upper !== b.upper) continue;
    g.strokeStyle = wash;
    g.lineWidth = Math.max(1.5 * u, b.w * 2 * k);
    g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); g.stroke();
  }
  for (const side of [-1, 1]) {
    g.strokeStyle = 'rgba(30,34,36,0.45)';
    g.lineWidth = 0.9 * u;
    g.beginPath();
    let open = false;
    for (let i = 0; i < RS.length; i++) {
      const s = RS[i];
      if (i > 0 && RS[i - 1].upper !== s.upper) open = false;
      const x = X(s.x - s.tz * side * s.w), z = Z(s.z + s.tx * side * s.w);
      if (!open) { g.moveTo(x, z); open = true; } else g.lineTo(x, z);
    }
    g.stroke();
  }
  g.fillStyle = wash;
  g.beginPath(); g.arc(X(POOL.x), Z(POOL.z), POOL.r * k, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(X(0), Z(0), 6.6 * k, 4.3 * k, 0, 0, Math.PI * 2); g.fill();
  // ripple strokes on the lake
  const rng = makeRng(12);
  g.strokeStyle = 'rgba(30,34,36,0.25)';
  g.lineWidth = 0.8 * u;
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, d = rng.range(0.2, 0.8);
    const x = LAKE.x + Math.cos(a) * LAKE.rx * d, z = LAKE.z + Math.sin(a) * LAKE.rz * d;
    g.beginPath(); g.moveTo(X(x - 3), Z(z)); g.quadraticCurveTo(X(x), Z(z - 1), X(x + 3), Z(z)); g.stroke();
  }
  // paths: fine broken lines
  g.strokeStyle = 'rgba(92,64,40,0.6)';
  g.lineWidth = 1.2 * u;
  g.setLineDash([5 * u, 4 * u]);
  for (const p of PATHS) {
    g.beginPath();
    p.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z))));
    g.stroke();
  }
  g.setLineDash([]);
  // the garden wall
  g.strokeStyle = 'rgba(30,28,26,0.6)';
  g.lineWidth = 1.2 * u;
  g.beginPath(); g.ellipse(X(0), Z(-3.2), 24.5 * k, 19.7 * k, 0, 0, Math.PI * 2); g.stroke();

  // places
  for (const r of REGIONS) {
    const seen = o.visited.has(r.id);
    const x = X(r.center.x), z = Z(r.center.z);
    const name = o.lang === 'zh' ? r.zh : r.en;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fs = (o.lang === 'zh' ? 30 : 20) * u;
    g.font = o.lang === 'zh' ? `${fs}px "Ma Shan Zheng", "LXGW WenKai", serif` : `italic ${fs}px "Cormorant Garamond", Georgia, serif`;
    // a soft paper halo so the name reads over the washes
    g.fillStyle = 'rgba(241,233,216,0.7)';
    g.beginPath(); g.ellipse(x, z, fs * (o.lang === 'zh' ? r.zh.length * 0.62 : name.length * 0.28) + 8 * u, fs * 0.72, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = seen ? 'rgba(27,25,22,0.95)' : 'rgba(27,25,22,0.28)';
    g.fillText(seen ? name : o.lang === 'zh' ? `${r.zh}？` : `${name} ?`, x, z);
    if (seen) {
      // a tiny seal: been here
      g.fillStyle = 'rgba(185,58,43,0.85)';
      const sx = x + fs * (o.lang === 'zh' ? r.zh.length * 0.55 : name.length * 0.26) + 6 * u, sz = z - fs * 0.35;
      g.fillRect(sx, sz, 9 * u, 9 * u);
    }
  }

  // you are here
  if (o.player) {
    const px = X(o.player.x), pz = Z(o.player.z);
    const h = o.player.heading; // facing (sin h, cos h) in x/z
    const fx = Math.sin(h), fz = Math.cos(h);
    g.fillStyle = 'rgba(185,58,43,0.18)';
    g.beginPath(); g.arc(px, pz, 12 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b93a2b';
    g.beginPath();
    g.moveTo(px + fx * 11 * u, pz + fz * 11 * u);
    g.lineTo(px - fz * 5.5 * u - fx * 5 * u, pz + fx * 5.5 * u - fz * 5 * u);
    g.lineTo(px - fx * 2 * u, pz - fz * 2 * u);
    g.lineTo(px + fz * 5.5 * u - fx * 5 * u, pz - fx * 5.5 * u - fz * 5 * u);
    g.closePath();
    g.fill();
  }
  // north
  g.fillStyle = 'rgba(27,25,22,0.7)';
  g.font = `${20 * u}px "Ma Shan Zheng", "LXGW WenKai", serif`;
  g.textAlign = 'center';
  g.fillText(o.lang === 'zh' ? '北' : 'N', S - 34 * u, 34 * u);
  g.strokeStyle = 'rgba(27,25,22,0.5)';
  g.lineWidth = 1.2 * u;
  g.beginPath(); g.moveTo(S - 34 * u, 48 * u); g.lineTo(S - 34 * u, 70 * u); g.stroke();
}

/** Which place a tap (canvas pixels) lands on. */
export function atlasHit(S: number, px: number, py: number): RegionId | null {
  const { k, c } = atlasScale(S);
  let best: RegionId | null = null, bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(px - (c + r.center.x * k), py - (c + r.center.z * k));
    const reach = Math.max(r.radius * k, 34 * (S / 600));
    if (d < reach && d < bd) { bd = d; best = r.id; }
  }
  return best;
}
