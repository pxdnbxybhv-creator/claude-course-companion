// Ink on the ground. Watering a plant drops ink on wet paper: a bloom (晕) spreads from the root
// and settles into a dark damp patch that stays for the rest of the day — so even a plant whose
// painting is already complete answers every watering, and you can see from afar which of your
// plants have been tended today. Discs follow the terrain; no three.js lights, a few draw calls.
import * as THREE from 'three';
import { Bag, canvas, canvasTexture } from './kit';
import { NO_REFLECT } from './pond';
import { terrainY } from './site';

/** Wet ink bleeding into paper: a pale centre, a darker ragged tide-line, feathered fibres. */
function bloomCanvas(): HTMLCanvasElement {
  const S = 256, c = canvas(S, S), g = c.getContext('2d')!;
  const cx = S / 2;
  const grd = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grd.addColorStop(0, 'rgba(255,255,255,0.28)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.86, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.93, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // fibres the ink runs along
  let s = 1234567;
  const r = () => ((s = (Math.imul(s ^ (s >>> 13), 1274126177) + 0x6d2b79f5) >>> 0) / 4294967296);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, r0 = cx * (0.8 + r() * 0.1), l = cx * (0.06 + r() * 0.12);
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a + (r() - 0.5) * 0.08) * (r0 + l), cx + Math.sin(a + (r() - 0.5) * 0.08) * (r0 + l));
    g.stroke();
  }
  return c;
}

/** A soft damp patch, uneven like water soaking into paper. */
function wetCanvas(): HTMLCanvasElement {
  const S = 128, c = canvas(S, S), g = c.getContext('2d')!;
  const cx = S / 2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, d = i ? cx * 0.22 : 0;
    const x = cx + Math.cos(a) * d, y = cx + Math.sin(a) * d, R = cx * (i ? 0.62 : 0.8);
    const grd = g.createRadialGradient(x, y, 0, x, y, R);
    grd.addColorStop(0, 'rgba(255,255,255,0.42)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  return c;
}

/** A unit disc whose vertices will be draped over the terrain. */
function discGeometry(bag: Bag, seg = 28, rings = 5): THREE.BufferGeometry {
  // a polar grid (a plain CircleGeometry has one ring and would cut through the hills)
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  pos.push(0, 0, 0); uv.push(0.5, 0.5);
  for (let r = 1; r <= rings; r++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, k = r / rings;
      pos.push(Math.cos(a) * k, 0, Math.sin(a) * k);
      uv.push(0.5 + Math.cos(a) * k * 0.5, 0.5 - Math.sin(a) * k * 0.5);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * seg, b0 = 1 + r * seg;
    for (let i = 0; i < seg; i++) {
      const a = a0 + i, b = a0 + ((i + 1) % seg), c = b0 + i, d = b0 + ((i + 1) % seg);
      idx.push(a, b, c, b, d, c);
    }
  }
  const out = bag.add(new THREE.BufferGeometry());
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

interface Drape { mesh: THREE.Mesh; base: Float32Array; x: number; z: number }

export class InkMarks {
  readonly group = new THREE.Group();
  private bloomTex: THREE.Texture;
  private wetTex: THREE.Texture;
  private unit: THREE.BufferGeometry;
  private blooms: { d: Drape; mat: THREE.MeshBasicMaterial; age: number; life: number; r: number }[] = [];
  private wet = new Map<string, { d: Drape; mat: THREE.MeshBasicMaterial; k: number; want: number; r: number }>();
  private tmp = new THREE.Color();
  private nightInk = new THREE.Color('#2a3140');

  constructor(private bag: Bag, private reduced: boolean) {
    this.group.name = 'ink-marks';
    this.bloomTex = canvasTexture(bag, bloomCanvas(), { mips: false });
    this.wetTex = canvasTexture(bag, wetCanvas(), { mips: false });
    this.unit = discGeometry(bag);
  }

  private drape(x: number, z: number, r: number, map: THREE.Texture, lift: number): { d: Drape; mat: THREE.MeshBasicMaterial } {
    const geo = this.bag.add(this.unit.clone());
    const p = geo.attributes.position as THREE.BufferAttribute;
    const base = new Float32Array(p.array as Float32Array);
    const mat = this.bag.add(new THREE.MeshBasicMaterial({
      map, color: '#1b1916', transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(NO_REFLECT);
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    const d = { mesh, base, x, z };
    this.fit(d, r, lift);
    this.group.add(mesh);
    return { d, mat };
  }

  /** Scale the disc to radius r and lay it on the land. */
  private fit(d: Drape, r: number, lift: number): void {
    const p = d.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < p.count; i++) {
      const x = d.x + d.base[i * 3] * r, z = d.z + d.base[i * 3 + 2] * r;
      a[i * 3] = x; a[i * 3 + 1] = terrainY(x, z) + lift; a[i * 3 + 2] = z;
    }
    p.needsUpdate = true;
  }

  /** Ink dropped on wet paper at (x, z): a ring that spreads to about `r` metres and settles. */
  bloom(x: number, z: number, r = 1.8): void {
    let b = this.blooms.find((q) => q.age >= q.life);
    if (!b) {
      if (this.blooms.length >= 4) b = this.blooms[0];
      else {
        const { d, mat } = this.drape(x, z, 0.2, this.bloomTex, 0.035);
        b = { d, mat, age: 0, life: 1, r };
        this.blooms.push(b);
      }
    }
    b.d.x = x; b.d.z = z;
    b.age = 0;
    b.life = this.reduced ? 1.6 : 2.8;
    b.r = r;
    b.d.mesh.visible = true;
  }

  /** The damp patch under a plant watered today; `strength` grows a little with the streak. */
  setWet(key: string, x: number, z: number, on: boolean, strength = 1, r = 1.1): void {
    let w = this.wet.get(key);
    if (!w) {
      if (!on) return;
      const { d, mat } = this.drape(x, z, r, this.wetTex, 0.028);
      w = { d, mat, k: 0, want: 0, r };
      this.wet.set(key, w);
    }
    w.want = on ? Math.min(1, 0.55 + 0.45 * strength) : 0;
  }

  /** Show the patches at once (the world is built with today's watering already done). */
  settle(): void {
    for (const w of this.wet.values()) { w.k = w.want; w.mat.opacity = w.k * 0.55; w.d.mesh.visible = w.k > 0.01; }
  }

  update(dt: number, night: number): void {
    // at night the ink reads as shadow-blue, never pure black
    const ink = this.tmp.set('#1b1916').lerp(this.nightInk, night);
    for (const b of this.blooms) {
      if (b.age >= b.life) continue;
      b.age += dt;
      const k = Math.min(1, b.age / b.life);
      if (k >= 1) { b.d.mesh.visible = false; continue; }
      const ease = 1 - Math.pow(1 - k, 2.4);
      this.fit(b.d, 0.25 + ease * b.r, 0.035);
      b.mat.opacity = 0.62 * Math.min(1, k * 6) * (1 - k * k);
      b.mat.color.copy(ink);
    }
    for (const w of this.wet.values()) {
      w.mat.color.copy(ink);
      if (Math.abs(w.k - w.want) < 0.002) continue;
      w.k += (w.want - w.k) * Math.min(1, dt * 1.4);
      w.mat.opacity = w.k * 0.55;
      w.d.mesh.visible = w.k > 0.01;
    }
  }
}
