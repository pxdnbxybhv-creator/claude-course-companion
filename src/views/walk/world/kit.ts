// Small shared helpers for the 3D world: disposal bag, toon & outline materials, canvas textures.
import * as THREE from 'three';
import type { Season } from '../../../ink/scene-types';

/**
 * The warm palette of the world (青绿山水 with restraint): pigments for everyone who paints in it.
 * Use these rather than inventing near-greys — 冷清 (cold and desolate) is the enemy.
 */
export const WARM = {
  /** xuan paper, the ground of everything */
  paper: '#f1e9d8',
  /** a whitewashed wall in daylight (warm white, never blue-white) */
  wall: '#f3ecdc',
  /** ink: near-black with a brown heart */
  ink: '#1b1916',
  /** thin ink wash / a shadow: warm ink-brown, never blue-grey */
  shadow: '#5a4636',
  /** 朱 vermilion: pillars, railings, seals */
  vermilion: '#c0412f',
  /** 胭脂 rouge: plum and peach blossom, lanterns' silk */
  rouge: '#c8506a',
  /** 藤黄 gamboge: chrysanthemum, gold leaf, sunlit willow */
  gamboge: '#e2a72e',
  /** 赭石 ochre: earth, bark, the foot of hills */
  ochre: '#b27a48',
  /** 石绿 jade green: foliage, moss, lotus leaves */
  jade: '#5f9c7c',
  /** tender yellow-green of new leaves and grass */
  leaf: '#a4b964',
  /** 花青 indigo-teal: roof tiles' glaze, far hills, deep water */
  indigo: '#2f5f73',
  /** 石青 azurite: the blue of the far ridges */
  azure: '#6e93a8',
  /** dark roof tiles: blue-black */
  tile: '#2e3239',
  /** timber: warm brown */
  wood: '#7a4e32',
  /** lantern light and lit windows */
  lantern: '#ffb86b',
  /** moonlight on things */
  moon: '#dfe6fa',
  /** the night sky overhead */
  night: '#0b1130',
} as const;

/**
 * The meadow by season — the garden's lawn and the open country around it share it, so they meet
 * without a seam. Painted grass: tender yellow-green leaning to jade (the golden light and the
 * ochre washes on it warm it enough — start it any yellower and it reads olive), snow-pale in winter.
 */
export const LAWN: Record<Season, string> = { spring: '#a4cf9c', summer: '#9ac595', autumn: '#a7c89f', winter: '#e8e8e2' };

/**
 * What the night does to the land (a multiplier on the lit ground): deep and dark, but keeping the
 * grass's own hue (a moonlit 黛 blue-green, not a flat slate), so the lanterns' amber pools and the
 * lit windows carry the warmth. The land and the lawn also darken their hollows by night (land.ts,
 * ground.ts), so the moonlit ground has a shape.
 */
export const NIGHT_LAND = '#7790a0';

/** Everything the world allocates goes in here so unmounting frees all GPU memory. */
export class Bag {
  private items = new Set<{ dispose(): void }>();
  add<T extends { dispose(): void }>(x: T): T {
    this.items.add(x);
    return x;
  }
  dispose(): void {
    for (const it of this.items) {
      try { it.dispose(); } catch { /* already gone */ }
    }
    this.items.clear();
  }
}

export const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function canvasTexture(bag: Bag, c: HTMLCanvasElement, o: { repeat?: boolean; flipY?: boolean; mips?: boolean } = {}): THREE.CanvasTexture {
  const t = bag.add(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (o.flipY === false) t.flipY = false;
  if (o.mips === false) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const gradients = new WeakMap<Bag, THREE.DataTexture>();
/** Three soft bands: shade, half-light, light — the flat washes of a painted figure. */
export function toonGradient(bag: Bag): THREE.DataTexture {
  const hit = gradients.get(bag);
  if (hit) return hit;
  const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  const t = bag.add(new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat));
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  gradients.set(bag, t);
  return t;
}

export function toon(bag: Bag, color: THREE.ColorRepresentation, o: { vertexColors?: boolean; side?: THREE.Side; emissive?: THREE.ColorRepresentation } = {}): THREE.MeshToonMaterial {
  return bag.add(new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(bag),
    vertexColors: !!o.vertexColors,
    side: o.side ?? THREE.FrontSide,
    ...(o.emissive !== undefined ? { emissive: new THREE.Color(o.emissive) } : {}),
  }));
}

/** Inverted-hull ink outline: back faces pushed out along the normal. */
export function outlineMaterial(bag: Bag, width: number, color: THREE.ColorRepresentation = '#1b1916'): THREE.MeshBasicMaterial {
  const m = bag.add(new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: width };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => 'outline';
  return m;
}

/** A mesh plus its outline hull sharing the same geometry. */
export function inked(geo: THREE.BufferGeometry, mat: THREE.Material, outline: THREE.Material | null): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  if (outline) {
    const o = new THREE.Mesh(geo, outline);
    o.name = 'outline';
    m.add(o);
  }
  return m;
}

/** Crisp ink lines along the hard edges of architecture (勾勒). */
export function edgeLines(bag: Bag, geo: THREE.BufferGeometry, mat: THREE.LineBasicMaterial, angle = 28): THREE.LineSegments {
  const e = bag.add(new THREE.EdgesGeometry(geo, angle));
  return new THREE.LineSegments(e, mat);
}

/** Give a geometry a flat vertex colour and strip it to position/normal/color so it can be merged. */
export function tint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    let k = 1;
    if (jitter) {
      s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
      k = 1 + ((s / 4294967296) - 0.5) * jitter;
    }
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** A soft radial glow sprite texture (white; tint with the material colour). */
export function glowTexture(bag: Bag, size = 128, falloff = 1): THREE.CanvasTexture {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25 * falloff, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return canvasTexture(bag, c);
}

export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export function hexLerp(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
