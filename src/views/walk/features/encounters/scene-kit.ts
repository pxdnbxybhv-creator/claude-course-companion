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

/** Walk someone to (x, z) at `speed` m/s (they stride and follow the ground); resolves on arrival. */
export function walkTo(s: Stage, f: Figure, x: number, z: number, speed = 1.3): Promise<void> {
  return new Promise((res) => {
    const r = f.root;
    let done = false;
    const finish = () => { if (done) return; done = true; f.walking = 0; res(); };
    s.bag.onDispose(finish);
    const off = s.ctx.onFrame((dt) => {
      if (done) { off(); return; }
      const dx = x - r.position.x, dz = z - r.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) { off(); finish(); return; }
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
