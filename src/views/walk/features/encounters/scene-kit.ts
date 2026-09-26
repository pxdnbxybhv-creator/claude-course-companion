// Small moves the 奇遇 scenes share: the people's clothes, walking someone somewhere, putting a thing
// in a hand, vanishing in a puff, the 「奇」 mark over whoever has a story, the prompt to talk.
import type * as T from 'three';
import type { Interactable } from '../../types';
import type { XZ } from '../../map';
import { speechMark, type Figure, type FigureSpec } from '../minigames/npc';
import { burst } from '../props';
import type { Stage } from './stage';

/** Clothes for the people of the encounters: warm, living colours, never grey. */
export const WEAR = {
  woodcutter: { robe: '#7b6a4c', trim: '#4a3b28', hat: 'bamboo', hatColor: '#c9a45e', skin: '#e2b894', beard: '#3a3128', cape: '#a08a5a' },
  foxLady: { robe: '#f4efe6', trim: '#b9c9cf', hat: 'bun', hair: '#1c1a19', skin: '#f6e3d3' },
  sageA: { robe: '#e9e0cc', trim: '#6b8f7a', hat: 'bun', hair: '#e8e4dc', beard: '#efece6', sit: true },
  sageB: { robe: '#c9a35e', trim: '#7a4a2a', hat: 'bun', hair: '#dcd6cc', beard: '#e6e1d8', sit: true },
  boy: { robe: '#d4553a', trim: '#f0d9a0', hat: 'buns', scale: 0.72 },
  merchant: { robe: '#3d5a73', trim: '#d9a62e', hat: 'cap', hatColor: '#23201d', beard: '#2a2520' },
  thief: { robe: '#2b2622', trim: '#6b4a33', hat: 'cap', hatColor: '#1b1916' },
  boatman: { robe: '#5f8a6e', trim: '#2f3b30', hat: 'scholar', hatColor: '#23201d', beard: '#2a2520' },
  immortal: { robe: '#efe3c6', trim: '#b83a4b', hat: 'bun', hair: '#d8d2c6', beard: '#ece8e0', skin: '#f2b8a0', sit: true },
  monkBroom: { robe: '#c98a3c', trim: '#7a4a1f', hat: 'bald', skin: '#e9c49c' },
  monkScroll: { robe: '#b7773a', trim: '#5c3a1c', hat: 'bald', skin: '#ecc9a4' },
  elder: { robe: '#9c7a4f', trim: '#5f8a6e', hat: 'bun', hair: '#d9d3c8', beard: '#ebe6dc' },
  villagerW: { robe: '#e59a8a', trim: '#5f8a6e', hat: 'bun', apron: '#f1e6cf' },
  villagerM: { robe: '#8fae6a', trim: '#6b4a33', hat: 'bamboo', hatColor: '#c9a45e' },
  moonOld: { robe: '#e8ddc2', trim: '#c0412f', hat: 'bun', hair: '#f2efe8', beard: '#f5f2ec', sit: true },
  herdBoy: { robe: '#6f9a5a', trim: '#e0c07a', hat: 'buns', scale: 0.7, sit: true },
} satisfies Record<string, FigureSpec>;

/**
 * Open, level ground near (x, z): walkable, and flat within `r` metres (no stair, wall foot or bank),
 * and `ok` (e.g. off a path), searched in widening rings out to `maxR`; falls back to the nearest
 * walkable point.
 */
export function flatSpot(s: Stage, x: number, z: number, maxR = 8, r = 1.2, ok?: (x: number, z: number) => boolean): T.Vector3 {
  const { ctx } = s;
  const flat = (px: number, pz: number) => {
    if (!ctx.isWalkable(px, pz) || (ok && !ok(px, pz))) return false;
    const y0 = ctx.groundY(px, pz);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const qx = px + Math.cos(a) * r, qz = pz + Math.sin(a) * r;
      if (!ctx.isWalkable(qx, qz) || Math.abs(ctx.groundY(qx, qz) - y0) > 0.18) return false;
    }
    return true;
  };
  for (let d = 0; d <= maxR; d += 0.75) {
    const n = d === 0 ? 1 : Math.ceil((d * Math.PI * 2) / 0.9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (flat(px, pz)) return new s.THREE.Vector3(px, ctx.groundY(px, pz), pz);
    }
  }
  return s.spot(x, z, maxR);
}

/** The 「奇」 mark over whoever has a story to tell (turn it off once they have told it). */
export function mark(s: Stage, f: Figure): { set(on: boolean): void } {
  return speechMark(s.bag, f, '奇');
}

/** Put a thing in someone's right hand. */
export function inHand(f: Figure, o: T.Object3D, dx = 0, dy = -0.04, dz = 0.06): void {
  o.position.copy(f.hand).add(new (o.position.constructor as typeof T.Vector3)(dx, dy, dz));
  f.armR.add(o);
}

/** Raise the right arm (pointing, lifting a cup) — k 0..1 of the way up. */
export function raiseArm(f: Figure, k: number, forward = 0.9): void {
  f.armR.userData.posed = k > 0;
  f.armR.rotation.x = -forward * k;
  f.armR.rotation.z = -0.18 - 1.1 * k;
}

/** The walk each figure is on now (a newer walk on the same figure ends the older one). */
const walking = new WeakMap<Figure, () => void>();

/**
 * Walk someone to (x, z) at `speed` m/s (they stride and follow the ground). Resolves true on
 * arrival — or false when a newer walk on the same figure took over, or the scene went.
 */
export function walkTo(s: Stage, f: Figure, x: number, z: number, speed = 1.3): Promise<boolean> {
  walking.get(f)?.();
  return new Promise((res) => {
    const r = f.root;
    let done = false;
    let off: () => void = () => {};
    const finish = (arrived: boolean) => {
      if (done) return;
      done = true;
      off();
      if (walking.get(f) === cancel) { walking.delete(f); f.walking = 0; }
      res(arrived);
    };
    const cancel = () => finish(false);
    walking.set(f, cancel);
    s.bag.onDispose(cancel);
    off = s.ctx.onFrame((dt) => {
      if (done) return;
      const dx = x - r.position.x, dz = z - r.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) { finish(true); return; }
      const step = Math.min(d, speed * dt);
      r.position.x += (dx / d) * step;
      r.position.z += (dz / d) * step;
      r.position.y = s.ctx.groundY(r.position.x, r.position.z);
      const want = Math.atan2(dx, dz);
      let dd = want - r.rotation.y;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      r.rotation.y += dd * Math.min(1, dt * 6);
      f.faceTo = null;
      f.walking = Math.min(1, speed / 1.6);
    });
    s.bag.onDispose(off);
  });
}

/**
 * Petals, motes, sparks as Points that never swell into a blob at the lens: nearer than about two
 * metres a point stops growing, and inside about a metre and a half it fades out.
 */
export function nearFade(mat: T.PointsMaterial): T.PointsMaterial {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <logdepthbuf_vertex>', 'gl_PointSize = min(gl_PointSize, size * scale * 0.5);\n\tvNear = smoothstep(0.7, 1.6, -mvPosition.z);\n\t#include <logdepthbuf_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vNear;');
  };
  mat.customProgramCacheKey = () => 'qiyu-near-fade';
  return mat;
}

/** Vanish in a puff of paper-white (and optionally a colour), fading out. */
export function vanish(s: Stage, o: T.Object3D, color = '#f4efe4', ms = 700): Promise<void> {
  const at = new s.THREE.Vector3();
  o.getWorldPosition(at);
  at.y += 0.6;
  burst(s.bag, at, color, 18, { speed: 1.4, size: 0.035, life: 1.2 });
  const s0 = o.scale.clone();
  return new Promise((res) => {
    let t = 0;
    const off = s.ctx.onFrame((dt) => {
      t += dt * 1000;
      const k = Math.min(1, t / ms);
      o.scale.set(s0.x * (1 - k * 0.9), s0.y * (1 + k * 0.25) * (1 - k), s0.z * (1 - k * 0.9));
      if (k >= 1) { off(); o.visible = false; res(); }
    });
    s.bag.onDispose(() => { off(); res(); });
  });
}

/** Appear out of a puff (grow from nothing). */
export function appear(s: Stage, o: T.Object3D, ms = 600): void {
  const s0 = o.scale.clone();
  o.scale.setScalar(0.001);
  o.visible = true;
  const at = new s.THREE.Vector3();
  o.getWorldPosition(at);
  at.y += 0.4;
  burst(s.bag, at, '#f4efe4', 12, { speed: 1.1, size: 0.03, life: 1 });
  let t = 0;
  const off = s.ctx.onFrame((dt) => {
    t += dt * 1000;
    const k = Math.min(1, t / ms);
    const e = 1 - Math.pow(1 - k, 3);
    o.scale.set(s0.x * e, s0.y * e, s0.z * e);
    if (k >= 1) off();
  });
  s.bag.onDispose(off);
}

/** A talk prompt in front of someone (it follows them if they move). */
export function talkPrompt(s: Stage, f: Figure, o: Omit<Interactable, 'position' | 'radius' | 'id'> & { id?: string; radius?: number; d?: number }): () => void {
  const pos = new s.THREE.Vector3();
  const place = () => {
    const r = f.root;
    const d = o.d ?? 0.9;
    pos.set(r.position.x + Math.sin(r.rotation.y) * d, r.position.y, r.position.z + Math.cos(r.rotation.y) * d);
  };
  place();
  s.frame(place);
  return s.prompt({ ...o, id: o.id ?? `qiyu-${s.def.id}`, position: pos, radius: o.radius ?? 2.2 });
}

/** The walker's hand (or a point in front of their chest when this companion has none). */
export function handOf(s: Stage, out: T.Vector3): T.Vector3 {
  const p = s.ctx.player.position, h = s.ctx.player.heading;
  return out.set(p.x + Math.sin(h) * 0.35, p.y + 0.8, p.z + Math.cos(h) * 0.35);
}

/** Face the walker toward a point. */
export function faceWalker(s: Stage, to: XZ): void {
  const p = s.ctx.player.position;
  s.ctx.player.teleport(p.x, p.z, Math.atan2(to.x - p.x, to.z - p.z), p.y);
}

/** Face a figure toward the walker. */
export function faceMe(s: Stage, f: Figure): void {
  f.faceTo = { x: s.ctx.player.position.x, z: s.ctx.player.position.z };
}

/** Bob and sway (laughing, drunk, dancing) for `secs`. */
export function sway(s: Stage, o: T.Object3D, secs: number, amp = 0.08, rate = 7): void {
  if (s.still) return;
  const y0 = o.position.y, rz = o.rotation.z;
  let t = 0;
  const off = s.ctx.onFrame((dt) => {
    t += dt;
    const k = t < secs ? 1 : 0;
    o.position.y = y0 + Math.abs(Math.sin(t * rate)) * amp * k;
    o.rotation.z = rz + Math.sin(t * rate * 0.5) * amp * 0.8 * k;
    if (t >= secs) { o.position.y = y0; o.rotation.z = rz; off(); }
  });
  s.bag.onDispose(off);
}
