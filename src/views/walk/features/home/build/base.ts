// What the homestead has before the owner builds anything: a well-kept lawn painted in warm jade
// and ochre, a low bamboo fence round the plot with a little gate-house in the east side (the
// homestead's name on a plaque over it, a lantern either side), stone slabs in from the path,
// wildflowers and grass along the outside of the fence, and an old tree at the north-west corner.
import type * as T from 'three';
import type { Brush } from '../catalog';
import { GATE_J, GRID, HC, PLOT_X0, PLOT_Z0, bambooFence } from '../catalog';
import { HOME_PLOT } from '../../../map';
import type { Three } from './brush';

const TAU = Math.PI * 2;

/** The plot's bones, drawn in world coordinates (bake it at pose (0, 0, 0)); gy gives the ground. */
export function buildBase(b: Brush, gy: (x: number, z: number) => number): void {
  const x0 = PLOT_X0, z0 = PLOT_Z0, x1 = PLOT_X0 + GRID, z1 = PLOT_Z0 + GRID;
  const gz0 = PLOT_Z0 + GATE_J[0], gz1 = PLOT_Z0 + GATE_J[1] + 1; // the gate's opening (z)
  const fence = (a: [number, number], c: [number, number]) => {
    bambooFence(b, a, c, 0.9, gy);
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / 0.42));
    for (let k = 0; k <= n; k++) b.solid(a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n, 0.24, 0.95);
  };
  fence([x0, z0], [x1, z0]);
  fence([x0, z1], [x1, z1]);
  fence([x0, z0], [x0, z1]);
  fence([x1, z0], [x1, gz0 - 0.15]);
  fence([x1, gz1 + 0.15], [x1, z1]);

  // the gate-house: two posts, a beam, a little tiled roof, the name, two lanterns
  const gx = x1, gzc = (gz0 + gz1) / 2, y = gy(gx, gzc);
  for (const z of [gz0 - 0.1, gz1 + 0.1]) {
    b.box(0.22, 2.65, 0.22, HC.woodDark, [gx, y + 1.3, z]);
    b.box(0.34, 0.2, 0.34, HC.stone, [gx, y + 0.1, z], { edges: false });
    b.box(0.03, 1.6, 0.26, HC.lantern, [gx + 0.13, y + 1.25, z], { edges: false });
    b.solid(gx, z, 0.2, 2.6);
  }
  b.box(0.26, 0.22, gz1 - gz0 + 0.8, HC.woodDark, [gx, y + 2.55, gzc]);
  b.box(0.24, 0.1, gz1 - gz0 + 0.4, HC.vermilion, [gx, y + 2.36, gzc], { edges: false });
  b.roof({ w: gz1 - gz0 + 1.6, d: 1.3, cx: gx, cz: gzc, y: y + 2.66, rise: 0.55, ridge: (gz1 - gz0 + 1.6) / 2, curve: 1.5, curl: 0.16, thick: 0.1, color: HC.tile, under: HC.woodDark, tiles: 0.17 }, { ry: Math.PI / 2 });
  b.box(0.16, 0.14, gz1 - gz0 + 1.4, HC.tileDark, [gx, y + 3.24, gzc], { edges: false });
  // the name board, readable from the path (east) and from inside (west)
  b.box(0.08, 0.5, 1.5, '#2f2620', [gx, y + 2.02, gzc]);
  b.label('name', [gx + 0.045, y + 2.02, gzc], 1.4, 0.42, Math.PI / 2);
  b.label('name', [gx - 0.045, y + 2.02, gzc], 1.4, 0.42, -Math.PI / 2);
  for (const z of [gz0 - 0.1, gz1 + 0.1]) {
    const lx = gx + 0.45, ly = y + 1.95;
    b.beam([gx + 0.1, y + 2.3, z], [lx, y + 2.3, z], 0.04, HC.woodDark, { edges: false });
    b.beam([lx, y + 2.3, z], [lx, ly + 0.2, z], 0.012, HC.ink, { edges: false });
    b.ball(0.17, HC.lantern, [lx, ly, z], { bucket: 'glow', s: [1, 0.86, 1] });
    b.cyl(0.08, 0.09, 0.05, HC.ink, [lx, ly + 0.15, z], { edges: false });
    b.cyl(0.09, 0.08, 0.05, HC.ink, [lx, ly - 0.15, z], { edges: false });
    b.cyl(0.012, 0.035, 0.17, HC.gamboge, [lx, ly - 0.28, z], { edges: false });
    b.light(lx, ly, z, 1.2);
  }

  // stone slabs from the path through the gate
  let k = 0;
  for (let x = x1 + 2.6; x > x1 - 3; x -= 0.95) {
    for (const z of [gzc - 0.5, gzc + 0.5]) {
      const r = ((k++ * 0.618) % 1) - 0.5;
      b.box(0.86, 0.12, 0.88, k % 3 ? HC.slab : HC.stoneWarm, [x + r * 0.08, gy(x, z) + 0.03, z + r * 0.06], { ry: r * 0.12, jitter: 0.1, edges: 40 });
    }
  }

  // wildflowers and grass along the outside of the fence
  const flowers = [HC.rouge, HC.white, HC.gamboge, '#8e7cc3', HC.blossom];
  const tuft = (x: number, z: number, i: number) => {
    const yy = gy(x, z);
    const sw = { kind: 'sway' as const, pivot: [x, yy, z] as const, rate: 0.05 };
    for (let q = 0; q < 3; q++) {
      const a = (q / 3) * TAU + i;
      b.beam([x, yy - 0.02, z], [x + Math.cos(a) * 0.14, yy + 0.32 + (q % 2) * 0.1, z + Math.sin(a) * 0.14], 0.03, q % 2 ? HC.leafLight : HC.leaf, { edges: false, anim: sw });
    }
    if (i % 2 === 0) b.ball(0.055, flowers[i % flowers.length], [x, yy + 0.4, z], { detail: 0, anim: sw });
  };
  let i = 0;
  const side = (ax: number, az: number, cx: number, cz: number, nx: number, nz: number) => {
    const L = Math.hypot(cx - ax, cz - az);
    for (let s = 0.8; s < L - 0.5; s += 1.35 + ((i * 0.37) % 1) * 1.2) {
      const t = s / L, off = 0.35 + ((i * 0.53) % 1) * 0.6;
      const x = ax + (cx - ax) * t + nx * off, z = az + (cz - az) * t + nz * off;
      if (Math.abs(x - x1) < 0.2 && z > gz0 - 1.5 && z < gz1 + 1.5) { i++; continue; }
      tuft(x, z, i++);
    }
  };
  side(x0, z0, x1, z0, 0, -1);
  side(x0, z1, x1, z1, 0, 1);
  side(x0, z0, x0, z1, -1, 0);
  side(x1, z0, x1, z1, 1, 0);

  // the old tree outside the north-west corner, a rock and some ferns at its foot
  const tx = x0 - 2.6, tz = z0 - 2.4, ty = gy(tx, tz);
  const sw = { kind: 'sway' as const, pivot: [tx, ty, tz] as const, rate: 0.0016 };
  const bark = '#6a4a36';
  const T0: [number, number, number][] = [[tx, ty - 0.2, tz], [tx + 0.25, ty + 1.6, tz + 0.1], [tx - 0.1, ty + 3.2, tz + 0.3]];
  for (let q = 1; q < T0.length; q++) b.beam(T0[q - 1], T0[q], 0.62 - q * 0.14, bark, { round: true, edges: false, anim: sw });
  const limbs: [number, number, number][] = [[tx + 2.2, ty + 4.3, tz + 1.2], [tx - 2.0, ty + 4.5, tz + 0.8], [tx + 0.4, ty + 5.2, tz - 1.4], [tx + 1.2, ty + 4.8, tz + 2.4]];
  for (const l of limbs) {
    b.beam(T0[2], l, 0.22, bark, { round: true, edges: false, anim: sw });
    for (let q = 0; q < 3; q++) {
      const a = q * 2.1 + l[0];
      b.ball(1.05 + (q % 2) * 0.3, q % 2 ? HC.leafDark : HC.leaf, [l[0] + Math.cos(a) * 0.7, l[1] + 0.3 + (q % 2) * 0.4, l[2] + Math.sin(a) * 0.7], { anim: sw, lumpy: 0.2, s: [1, 0.78, 1] });
    }
  }
  b.ball(1.4, HC.jade, [tx - 0.2, ty + 5.3, tz + 0.4], { anim: sw, lumpy: 0.2, s: [1.2, 0.7, 1.2] });
  b.solid(tx, tz, 0.5, 5);
  b.ball(0.7, HC.stone, [tx + 1.6, ty + 0.2, tz - 1.2], { s: [1.3, 0.6, 1], lumpy: 0.3 });
  b.solid(tx + 1.6, tz - 1.2, 0.8, 0.8);
}

/** The lawn inside the fence: warm jade grass with ochre patches, clover and tiny flowers. */
export function paintLawn(size = 512, seed = 7): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  grd.addColorStop(0, '#b3c774');
  grd.addColorStop(1, '#9db463');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // soft washes: ochre earth, deeper jade
  for (let k = 0; k < 70; k++) {
    const x = rnd() * size, y = rnd() * size, r = 10 + rnd() * 46;
    const col = k % 3 === 0 ? 'rgba(196, 170, 104, 0.22)' : k % 3 === 1 ? 'rgba(104, 146, 74, 0.2)' : 'rgba(170, 196, 110, 0.25)';
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grass strokes
  for (let k = 0; k < 2600; k++) {
    const x = rnd() * size, y = rnd() * size, l = 3 + rnd() * 6, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(84, 124, 58, 0.35)' : 'rgba(150, 180, 92, 0.4)';
    g.lineWidth = 0.8 + rnd() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // clover and small flowers
  const fl = ['#f4efe2', '#f0c24e', '#e08aa0', '#f4efe2'];
  for (let k = 0; k < 90; k++) {
    const x = rnd() * size, y = rnd() * size;
    g.fillStyle = fl[k % fl.length];
    g.globalAlpha = 0.85;
    g.beginPath(); g.arc(x, y, 1.2 + rnd() * 1.3, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  // a darker band by the fence
  const edge = g.createLinearGradient(0, 0, 0, size);
  edge.addColorStop(0, 'rgba(70, 100, 50, 0.22)'); edge.addColorStop(0.04, 'rgba(70, 100, 50, 0)');
  edge.addColorStop(0.96, 'rgba(70, 100, 50, 0)'); edge.addColorStop(1, 'rgba(70, 100, 50, 0.22)');
  g.fillStyle = edge; g.fillRect(0, 0, size, size);
  const edge2 = g.createLinearGradient(0, 0, size, 0);
  edge2.addColorStop(0, 'rgba(70, 100, 50, 0.22)'); edge2.addColorStop(0.04, 'rgba(70, 100, 50, 0)');
  edge2.addColorStop(0.96, 'rgba(70, 100, 50, 0)'); edge2.addColorStop(1, 'rgba(70, 100, 50, 0.22)');
  g.fillStyle = edge2; g.fillRect(0, 0, size, size);
  return c;
}

/** The lawn's mesh: a grid draped on the ground just above it. */
export function lawnGeometry(THREE: Three, gy: (x: number, z: number) => number): T.BufferGeometry {
  const N = GRID * 2;
  const g = new THREE.PlaneGeometry(HOME_PLOT.size, HOME_PLOT.size, N, N);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + HOME_PLOT.x, z = p.getZ(i) + HOME_PLOT.z;
    p.setXYZ(i, x, gy(x, z) + 0.025, z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
