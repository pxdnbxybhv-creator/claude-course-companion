// The homestead's brush: what a catalog builder draws with (catalog.ts Brush), and the bake that
// turns one placed thing into flat vertex arrays in the world — per material family (solid, soft,
// glow, water), ink edge lines, painted boards, and how it behaves (colliders, floors, seats,
// lights, chimneys). The stage (./stage.ts) caches a bake per thing and merges them all into a few
// meshes; the ghost and the catalog's thumbnails bake the same way.
//
// Motion lives in the vertex shader (./mats.ts): every vertex carries aPiv (pivot xyz + rate) and
// aAnim (axis xyz + mode + 8 × the thing's slot), so one draw moves every windmill and swing.
import type * as T from 'three';
import type { Anim, AnimKind, BuildOpts, Brush, Bucket, HomeKind, LabelKind, PartOpts, RoofSpec, V3 } from '../catalog';

export type Three = typeof import('three');

const MODE: Record<AnimKind, number> = { spin: 1, swing: 2, sway: 3, hang: 4 };
export const BUCKETS: Bucket[] = ['solid', 'soft', 'glow', 'water'];

interface Part { g: T.BufferGeometry; bucket: Bucket; edges: number | false; anim?: Anim }

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects one thing's parts in its own frame. */
export class PartBrush implements Brush {
  readonly parts: Part[] = [];
  readonly raw: number[] = [];
  readonly labels: { kind: LabelKind; at: V3; w: number; h: number; ry: number }[] = [];
  readonly colliders: { x: number; z: number; r: number; h: number }[] = [];
  readonly floors: { a: readonly [number, number]; b: readonly [number, number]; hw: number; y: number | ((s: number) => number) }[] = [];
  readonly seats: { x: number; y: number; z: number; heading: number; stand: readonly [number, number] }[] = [];
  readonly lights: [number, number, number, number][] = [];
  readonly smokes: V3[] = [];
  readonly rng: () => number;
  private m4: T.Matrix4;
  private q: T.Quaternion;
  private e: T.Euler;
  private v: T.Vector3;
  private sv: T.Vector3;

  constructor(private THREE: Three, seed: number) {
    this.rng = mulberry(seed);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.sv = new THREE.Vector3();
  }

  private place(g: T.BufferGeometry, at: V3, o: PartOpts): T.BufferGeometry {
    this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ');
    this.q.setFromEuler(this.e);
    const s = o.s ?? [1, 1, 1];
    this.m4.compose(this.v.set(at[0], at[1], at[2]), this.q, this.sv.set(s[0], s[1], s[2]));
    g.applyMatrix4(this.m4);
    return g;
  }

  /** Non-indexed, position/normal/colour only, a flat colour with a little per-face jitter. */
  private tint(geo: T.BufferGeometry, color: string, jitter: number): T.BufferGeometry {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new this.THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    let k = 1;
    for (let i = 0; i < n; i++) {
      if (jitter && i % 3 === 0) k = 1 + (this.rng() - 0.5) * jitter;
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new this.THREE.BufferAttribute(arr, 3));
    return g;
  }

  private push(g: T.BufferGeometry, color: string, o: PartOpts, bucket: Bucket, edges: number | false): void {
    this.parts.push({ g: this.tint(g, color, o.jitter ?? 0.05), bucket: o.bucket ?? bucket, edges: o.edges ?? edges, anim: o.anim });
  }

  box(w: number, h: number, d: number, color: string, at: V3, o: PartOpts = {}): void {
    this.push(this.place(new this.THREE.BoxGeometry(w, h, d), at, o), color, o, 'solid', 30);
  }
  cyl(rTop: number, rBot: number, h: number, color: string, at: V3, o: PartOpts = {}): void {
    this.push(this.place(new this.THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 8), at, o), color, o, 'solid', 50);
  }
  ball(r: number, color: string, at: V3, o: PartOpts & { detail?: number; lumpy?: number } = {}): void {
    const g = new this.THREE.IcosahedronGeometry(r, o.detail ?? 1);
    if (o.lumpy) {
      // the same displacement for every copy of a vertex (the polyhedron is non-indexed)
      const p = g.attributes.position;
      const salt = Math.floor(this.rng() * 1e6);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        let hsh = (Math.round(x * 1000) * 73856093) ^ (Math.round(y * 1000) * 19349663) ^ (Math.round(z * 1000) * 83492791) ^ salt;
        hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
        const k = 1 + ((((hsh >>> 0) % 1000) / 1000) - 0.5) * o.lumpy;
        p.setXYZ(i, x * k, y * k, z * k);
      }
    }
    this.push(this.place(g, at, o), color, o, 'soft', false);
  }
  ring(r: number, tube: number, color: string, at: V3, o: PartOpts = {}): void {
    this.push(this.place(new this.THREE.TorusGeometry(r, tube, 6, o.seg ?? 18), at, o), color, o, 'solid', false);
  }
  beam(a: V3, b: V3, size: number, color: string, o: PartOpts & { round?: boolean } = {}): void {
    const THREE = this.THREE;
    const va = new THREE.Vector3(a[0], a[1], a[2]), vb = new THREE.Vector3(b[0], b[1], b[2]);
    const L = va.distanceTo(vb);
    if (L < 1e-4) return;
    const g = o.round ? new THREE.CylinderGeometry(size / 2, size / 2, L, 6) : new THREE.BoxGeometry(size, L, size);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    this.push(g, color, o, 'solid', o.round ? false : 30);
  }
  disc(r: number, color: string, at: V3, o: PartOpts & { sx?: number; sz?: number } = {}): void {
    const g = new this.THREE.CircleGeometry(r, o.seg ?? 12);
    g.rotateX(-Math.PI / 2);
    g.scale(o.sx ?? 1, 1, o.sz ?? 1);
    this.push(this.place(g, at, o), color, o, 'solid', false);
  }
  lines(pts: number[]): void {
    for (const v of pts) this.raw.push(v);
  }
  label(kind: LabelKind, at: V3, w: number, h: number, ry = 0): void {
    this.labels.push({ kind, at, w, h, ry });
  }
  solid(x: number, z: number, r: number, h = 1): void {
    this.colliders.push({ x, z, r, h });
  }
  solidRect(x0: number, z0: number, x1: number, z1: number, h = 1): void {
    const w = x1 - x0, d = z1 - z0;
    const r = Math.max(0.12, Math.min(0.6, Math.min(w, d) / 2));
    const nx = Math.max(1, Math.ceil((w - 2 * r) / (r * 1.3)) + 1), nz = Math.max(1, Math.ceil((d - 2 * r) / (r * 1.3)) + 1);
    for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
      if (a > 0 && a < nx - 1 && c > 0 && c < nz - 1) continue; // the rim is enough
      const x = nx === 1 ? (x0 + x1) / 2 : x0 + r + ((w - 2 * r) * a) / (nx - 1);
      const z = nz === 1 ? (z0 + z1) / 2 : z0 + r + ((d - 2 * r) * c) / (nz - 1);
      this.colliders.push({ x, z, r, h });
    }
  }
  floor(a: readonly [number, number], b: readonly [number, number], hw: number, y: number | ((s: number) => number)): void {
    this.floors.push({ a, b, hw, y });
  }
  seat(x: number, y: number, z: number, heading: number, stand: readonly [number, number]): void {
    this.seats.push({ x, y, z, heading, stand });
  }
  light(x: number, y: number, z: number, size = 1): void {
    this.lights.push([x, y, z, size]);
  }
  smoke(x: number, y: number, z: number): void {
    this.smokes.push([x, y, z]);
  }

  /**
   * A hip roof (a pyramid when ridge = 0, a gable when the ridge runs the whole width): four sloped
   * slabs, each a grid swept up from the eave to the ridge along t^curve, the corners curled up.
   */
  roof(r: RoofSpec, o: PartOpts = {}): void {
    const THREE = this.THREE;
    const W = r.w / 2, D = r.d / 2, cx = 0, cz = 0;
    const raw0 = this.raw.length;
    const R = Math.min(W, Math.max(0, r.ridge));
    const curve = r.curve ?? 1.4, curl = r.curl ?? 0, th = r.thick ?? 0.12;
    const top = new THREE.Color(r.color), under = new THREE.Color(r.under ?? r.color);
    const pos: number[] = [], col: number[] = [];
    const jit = r.jitter ?? 0.06;
    const tri = (a: number[], b: number[], c: number[], color: T.Color, k: number) => {
      pos.push(...a, ...b, ...c);
      for (let i = 0; i < 3; i++) col.push(color.r * k, color.g * k, color.b * k);
    };
    const NT = 5;
    const yAt = (t: number, corner: number) => r.y + r.rise * Math.pow(t, curve) + curl * (1 - t) * (1 - t) * corner;
    // a face: eave edge e0 → e1, ridge edge r0 → r1 (all [x, z]); columns across, rows up
    const face = (e0: number[], e1: number[], r0: number[], r1: number[], ns: number, tiles: boolean) => {
      const P = (t: number, s: number) => {
        const ex = e0[0] + (e1[0] - e0[0]) * s, ez = e0[1] + (e1[1] - e0[1]) * s;
        const rx = r0[0] + (r1[0] - r0[0]) * s, rz = r0[1] + (r1[1] - r0[1]) * s;
        const corner = Math.pow(Math.max(0, Math.abs(2 * s - 1) - 0.55) / 0.45, 2);
        return [cx + ex + (rx - ex) * t, yAt(t, corner), cz + ez + (rz - ez) * t];
      };
      for (let a = 0; a < NT; a++) for (let b = 0; b < ns; b++) {
        const t0 = a / NT, t1 = (a + 1) / NT, s0 = b / ns, s1 = (b + 1) / ns;
        const p00 = P(t0, s0), p01 = P(t0, s1), p10 = P(t1, s0), p11 = P(t1, s1);
        const k = 1 + (this.rng() - 0.5) * jit;
        tri(p00, p01, p11, top, k); tri(p00, p11, p10, top, k);
        const d = (p: number[]) => [p[0], p[1] - th, p[2]];
        tri(d(p00), d(p11), d(p01), under, 1); tri(d(p00), d(p10), d(p11), under, 1);
      }
      // edge bands: eave (t = 0) and the two sides
      const band = (pa: number[], pb: number[]) => {
        const qa = [pa[0], pa[1] - th, pa[2]], qb = [pb[0], pb[1] - th, pb[2]];
        tri(pa, qa, qb, under, 0.8); tri(pa, qb, pb, under, 0.8);
        tri(pa, qb, qa, under, 0.8); tri(pa, pb, qb, under, 0.8);
      };
      for (let b = 0; b < ns; b++) band(P(0, b / ns), P(0, (b + 1) / ns));
      for (let a = 0; a < NT; a++) { band(P(a / NT, 0), P((a + 1) / NT, 0)); band(P(a / NT, 1), P((a + 1) / NT, 1)); }
      if (tiles && r.tiles) {
        const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
        const n = Math.max(2, Math.round(len / r.tiles));
        const up = R < 0.05 ? NT - 2 : NT - 1; // not up into the apex, where they would crowd into a blot
        for (let b = 1; b < n; b++) {
          const s = b / n;
          for (let a = 0; a < up; a++) {
            const pa = P(a / NT, s), pb = P((a + 1) / NT, s);
            this.raw.push(pa[0], pa[1] + 0.012, pa[2], pb[0], pb[1] + 0.012, pb[2]);
          }
        }
      }
    };
    const ns = Math.max(4, Math.round(r.w / 0.45));
    face([-W, D], [W, D], [-R, 0], [R, 0], ns, true);   // front
    face([W, -D], [-W, -D], [R, 0], [-R, 0], ns, true); // back
    if (R < W - 1e-3) {
      const ms = Math.max(3, Math.round(r.d / 0.45));
      face([W, D], [W, -D], [R, 0], [R, 0], ms, true);   // east
      face([-W, -D], [-W, D], [-R, 0], [-R, 0], ms, true); // west
    } else {
      // gable ends: triangles under the verges
      for (const s of [-1, 1]) {
        const x = cx + s * (W - 0.12);
        const a = [x, r.y - th, cz + D * 0.92], b = [x, r.y - th, cz - D * 0.92], c = [x, r.y + r.rise - th * 1.5, cz];
        if (s > 0) tri(a, b, c, under, 0.9); else tri(a, c, b, under, 0.9);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // turned about its own centre, then moved to (cx, cz): the tile lines too
    const ox = r.cx ?? 0, oz = r.cz ?? 0;
    this.place(g, [ox, 0, oz], o);
    const m = this.m4;
    const v = new THREE.Vector3();
    for (let i = raw0; i < this.raw.length; i += 3) {
      v.set(this.raw[i], this.raw[i + 1], this.raw[i + 2]).applyMatrix4(m);
      this.raw[i] = v.x; this.raw[i + 1] = v.y; this.raw[i + 2] = v.z;
    }
    this.parts.push({ g, bucket: o.bucket ?? 'solid', edges: o.edges ?? 35, anim: o.anim });
  }
}

// ───────────────────────────── baking ─────────────────────────────

export interface Chunk { pos: Float32Array; nor: Float32Array; col: Float32Array; piv: Float32Array; anim: Float32Array }
export interface LineChunk { pos: Float32Array; piv: Float32Array; anim: Float32Array }
export interface WorldLabel { kind: LabelKind; /** corners bl, br, tr, tl */ c: [number, number, number][]; n: [number, number, number] }
export interface Baked {
  buckets: Record<Bucket, Chunk | null>;
  lines: LineChunk | null;
  labels: WorldLabel[];
  colliders: { x: number; z: number; r: number; h: number }[];
  floors: { a: { x: number; z: number }; b: { x: number; z: number }; hw: number; y: number | ((s: number) => number) }[];
  seats: { x: number; y: number; z: number; heading: number; sx: number; sz: number }[];
  lights: [number, number, number, number][];
  smokes: [number, number, number][];
  /** World bounds of everything drawn. */
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  verts: number;
}

export interface Pose { x: number; y: number; z: number; heading: number }

/** Build `kind` and bake it into world arrays at `pose` (slot: its id for the swing uniform). */
export function bake(THREE: Three, kind: HomeKind | { build: HomeKind['build'] }, opts: BuildOpts, seed: number, pose: Pose, slot: number, edges = true): Baked {
  const br = new PartBrush(THREE, seed);
  kind.build(br, opts);
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  const m = new THREE.Matrix4().makeRotationY(pose.heading).setPosition(pose.x, pose.y, pose.z);
  const toW = (x: number, y: number, z: number): [number, number, number] => [pose.x + x * c + z * s, pose.y + y, pose.z - x * s + z * c];
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };

  const animOf = (a: Anim | undefined): [number, number, number, number, number, number, number, number] => {
    if (!a) return [0, 0, 0, 0, 0, 0, 0, 0];
    const p = toW(a.pivot[0], a.pivot[1], a.pivot[2]);
    const ax = a.axis ?? [0, 1, 0];
    const w = [ax[0] * c + ax[2] * s, ax[1], -ax[0] * s + ax[2] * c];
    const l = Math.hypot(w[0], w[1], w[2]) || 1;
    return [p[0], p[1], p[2], a.rate, w[0] / l, w[1] / l, w[2] / l, MODE[a.kind] + 8 * slot];
  };

  // ink edges first (in the thing's frame), then everything moves into the world
  const lineParts: { pos: number[]; anim?: Anim }[] = [];
  if (edges) {
    for (const p of br.parts) {
      if (p.bucket !== 'solid' || p.edges === false) continue;
      const eg = new THREE.EdgesGeometry(p.g, p.edges);
      lineParts.push({ pos: Array.from(eg.attributes.position.array as Float32Array), anim: p.anim });
      eg.dispose();
    }
    if (br.raw.length) lineParts.push({ pos: br.raw });
  }

  const per: Record<Bucket, Part[]> = { solid: [], soft: [], glow: [], water: [] };
  for (const p of br.parts) per[p.bucket].push(p);
  const buckets = {} as Record<Bucket, Chunk | null>;
  let verts = 0;
  for (const b of BUCKETS) {
    const list = per[b];
    let n = 0;
    for (const p of list) n += p.g.attributes.position.count;
    if (!n) { buckets[b] = null; continue; }
    const ch: Chunk = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), col: new Float32Array(n * 3), piv: new Float32Array(n * 4), anim: new Float32Array(n * 4) };
    let o = 0;
    for (const p of list) {
      p.g.applyMatrix4(m);
      const k = p.g.attributes.position.count;
      ch.pos.set(p.g.attributes.position.array as Float32Array, o * 3);
      ch.nor.set(p.g.attributes.normal.array as Float32Array, o * 3);
      ch.col.set(p.g.attributes.color.array as Float32Array, o * 3);
      if (p.anim) {
        const an = animOf(p.anim), ap = an.slice(0, 4), aa = an.slice(4);
        for (let i = 0; i < k; i++) { ch.piv.set(ap, (o + i) * 4); ch.anim.set(aa, (o + i) * 4); }
      }
      o += k;
      p.g.dispose();
    }
    for (let i = 0; i < n; i++) {
      const x = ch.pos[i * 3], y = ch.pos[i * 3 + 1], z = ch.pos[i * 3 + 2];
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      if (z < box.z0) box.z0 = z; if (z > box.z1) box.z1 = z;
    }
    verts += n;
    buckets[b] = ch;
  }

  let lines: LineChunk | null = null;
  let ln = 0;
  for (const l of lineParts) ln += l.pos.length / 3;
  if (ln) {
    lines = { pos: new Float32Array(ln * 3), piv: new Float32Array(ln * 4), anim: new Float32Array(ln * 4) };
    let o = 0;
    for (const l of lineParts) {
      const an = animOf(l.anim), ap = an.slice(0, 4), aa = an.slice(4);
      for (let i = 0; i < l.pos.length; i += 3) {
        const w = toW(l.pos[i], l.pos[i + 1], l.pos[i + 2]);
        lines.pos.set(w, o * 3);
        if (l.anim) { lines.piv.set(ap, o * 4); lines.anim.set(aa, o * 4); }
        o++;
      }
    }
  }

  const labels: WorldLabel[] = br.labels.map((l) => {
    const cr = Math.cos(l.ry), sr = Math.sin(l.ry);
    const corner = (u: number, v: number) => toW(l.at[0] + u * cr, l.at[1] + v, l.at[2] - u * sr);
    const nl = [sr, 0, cr];
    const n: [number, number, number] = [nl[0] * c + nl[2] * s, 0, -nl[0] * s + nl[2] * c];
    return { kind: l.kind, c: [corner(-l.w / 2, -l.h / 2), corner(l.w / 2, -l.h / 2), corner(l.w / 2, l.h / 2), corner(-l.w / 2, l.h / 2)], n };
  });

  return {
    buckets, lines, labels, verts,
    colliders: br.colliders.map((k) => { const w = toW(k.x, 0, k.z); return { x: w[0], z: w[2], r: k.r, h: k.h }; }),
    floors: br.floors.map((f) => {
      const a = toW(f.a[0], 0, f.a[1]), b = toW(f.b[0], 0, f.b[1]);
      const fy = f.y;
      return { a: { x: a[0], z: a[2] }, b: { x: b[0], z: b[2] }, hw: f.hw, y: typeof fy === 'number' ? pose.y + fy : (q: number) => pose.y + fy(q) };
    }),
    seats: br.seats.map((q) => { const w = toW(q.x, q.y, q.z), st = toW(q.stand[0], 0, q.stand[1]); return { x: w[0], y: w[1], z: w[2], heading: q.heading + pose.heading, sx: st[0], sz: st[2] }; }),
    lights: br.lights.map(([x, y, z, k]) => { const w = toW(x, y, z); return [w[0], w[1], w[2], k]; }),
    smokes: br.smokes.map(([x, y, z]) => toW(x, y, z)),
    box,
  };
}

/** Merge bucket chunks into one geometry (position, normal, color, aPiv, aAnim). */
export function mergeChunks(THREE: Three, chunks: Chunk[]): T.BufferGeometry | null {
  let n = 0;
  for (const c of chunks) n += c.pos.length / 3;
  if (!n) return null;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), piv = new Float32Array(n * 4), anim = new Float32Array(n * 4);
  let o = 0;
  for (const c of chunks) {
    const k = c.pos.length / 3;
    pos.set(c.pos, o * 3); nor.set(c.nor, o * 3); col.set(c.col, o * 3); piv.set(c.piv, o * 4); anim.set(c.anim, o * 4);
    o += k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPiv', new THREE.BufferAttribute(piv, 4));
  g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 4));
  g.computeBoundingSphere();
  return g;
}

export function mergeLines(THREE: Three, chunks: LineChunk[]): T.BufferGeometry | null {
  let n = 0;
  for (const c of chunks) n += c.pos.length / 3;
  if (!n) return null;
  const pos = new Float32Array(n * 3), piv = new Float32Array(n * 4), anim = new Float32Array(n * 4);
  let o = 0;
  for (const c of chunks) {
    const k = c.pos.length / 3;
    pos.set(c.pos, o * 3); piv.set(c.piv, o * 4); anim.set(c.anim, o * 4);
    o += k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPiv', new THREE.BufferAttribute(piv, 4));
  g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 4));
  g.computeBoundingSphere();
  return g;
}

/** Everything a bake drew, as one static geometry (the ghost): all buckets, no motion. */
export function flatGeometry(THREE: Three, b: Baked): T.BufferGeometry | null {
  const list = BUCKETS.map((k) => b.buckets[k]).filter((c): c is Chunk => !!c);
  return mergeChunks(THREE, list);
}
