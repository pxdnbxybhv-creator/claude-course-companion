// An animal on the move: where it is, where it faces, how fast it goes, and how its body shows it —
// a trot, a hop, a waddle, a stalk, a nap, a dance. Shared by the pets at home, the one that walks
// with you, and the animal visitors. No allocations per frame.
import type * as T from 'three';
import type { Bag } from '../../kit';
import { petModel, type PetModel } from './models';
import type { Species } from './logic';

export type Mode = 'idle' | 'sleep' | 'sit' | 'spin' | 'dig' | 'roll' | 'beg' | 'dance' | 'call' | 'graze' | 'butt' | 'fly' | 'swim' | 'groom' | 'eat' | 'knead' | 'shake';

/** Radians of gait per metre, and leg swing per m/s. */
const STRIDE: Record<Exclude<Species, 'koi'>, [number, number]> = {
  dog: [13, 0.45], cat: [15, 0.5], rabbit: [0, 0], crane: [5.5, 0.45], duck: [26, 0.9], parrot: [30, 0.9], goat: [10, 0.4],
};

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Actor {
  readonly m: PetModel;
  x = 0; z = 0; y = 0;
  heading = 0;
  speed = 0;
  /** Extra height (a hop, a flight), m. */
  lift = 0;
  mode: Mode = 'idle';
  modeT = 0;
  /** 0…1 how pleased (tail, ears). */
  happy = 0.3;
  /** A point to look at (head turns), or null. Set it with lookAt() (no allocation). */
  look: { x: number; z: number } | null = null;
  private lookPt = { x: 0, z: 0 };
  /** Looks away from `look` instead (the cat). */
  aloof = false;
  /** Drawn a little lower (swimming). */
  sink = 0;
  private phase = 0;
  private hopT = 0;
  private seed: number;

  constructor(bag: Bag, readonly species: Exclude<Species, 'koi'>, seed: string, parent: T.Object3D, coat?: number) {
    this.m = petModel(bag, species, seed, coat);
    bag.add(this.m.root, parent);
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    this.seed = (h & 0xffff) / 0xffff * TAU;
  }

  lookAt(x: number, z: number): void {
    this.lookPt.x = x; this.lookPt.z = z;
    this.look = this.lookPt;
  }

  place(x: number, y: number, z: number, heading = this.heading): void {
    this.x = x; this.y = y; this.z = z; this.heading = heading;
    this.speed = 0;
  }

  setMode(m: Mode): void {
    if (this.mode !== m) { this.mode = m; this.modeT = 0; }
  }

  /**
   * Step toward (tx, tz) at up to `v` m/s (turning first when facing away). The rabbit moves in
   * hops. Returns the distance still to go. `ground(x, z)` gives the height to stand at.
   */
  walk(dt: number, tx: number, tz: number, v: number, ground: (x: number, z: number) => number, stop = 0.15): number {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d <= stop) { this.halt(dt); return d; }
    const want = Math.atan2(dx, dz);
    const diff = wrap(want - this.heading);
    const turn = Math.min(1, dt * (this.species === 'crane' ? 3.5 : 7));
    this.heading = wrap(this.heading + diff * turn);
    const facing = Math.max(0, Math.cos(diff));
    let target = v * facing * Math.min(1, d / 0.6 + 0.3);
    if (this.species === 'rabbit') {
      // hops: 0.3 s in the air, a short pause between
      this.hopT += dt;
      const cycle = 0.42;
      const k = (this.hopT % cycle) / 0.3;
      if (k <= 1) { this.lift = Math.sin(k * Math.PI) * 0.1; target = Math.max(target, v * 0.9 * facing); }
      else { this.lift = 0; target = 0; }
    }
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    const step = Math.min(d, this.speed * dt);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    this.y = ground(this.x, this.z);
    return d - step;
  }

  halt(dt: number): void {
    this.speed += (0 - this.speed) * Math.min(1, dt * 8);
    if (this.species === 'rabbit') { this.lift *= 0.7; this.hopT = 0; }
  }

  /** Pose the body for this frame and write the transform. */
  animate(dt: number, t: number, still: boolean): void {
    const m = this.m, p = m.pose, body = m.body;
    const sp = this.species;
    this.modeT += dt;
    const [stride, amp] = STRIDE[sp];
    this.phase += dt * this.speed * stride;
    const s = Math.sin(this.phase);
    const moving = this.speed > 0.08;
    let bob = moving ? Math.abs(Math.cos(this.phase)) * Math.min(0.03, this.speed * 0.02) : 0;
    let pitch = 0, roll = 0, squash = 1, drop = 0, spin = 0;
    p.legs = moving ? s * Math.min(0.7, this.speed * amp + 0.15) : p.legs * 0.8;
    p.wings = sp === 'crane' || sp === 'parrot' || sp === 'duck' ? -0.05 : 0;
    p.fold = 1;
    const breath = still ? 0 : Math.sin(t * 2.2 + this.seed);
    // tail: a dog wags with its whole heart, a cat sways, the rest twitch
    const wagRate = sp === 'dog' ? 6 + this.happy * 10 : sp === 'cat' ? 1.4 : 3;
    const wagAmp = sp === 'dog' ? 0.15 + this.happy * 0.45 : sp === 'cat' ? 0.3 : 0.12;
    p.tail = still ? 0 : Math.sin(t * wagRate + this.seed) * wagAmp;
    p.head = still ? 0 : breath * 0.03;
    // look at (or pointedly away from) someone
    let wantYaw = 0;
    if (this.look) {
      const a = wrap(Math.atan2(this.look.x - this.x, this.look.z - this.z) - this.heading);
      wantYaw = Math.max(-0.85, Math.min(0.85, a));
      if (this.aloof) wantYaw = -Math.sign(a || 1) * 0.7;
    } else if (!still) wantYaw = Math.sin(t * 0.35 + this.seed) * 0.25;
    p.yaw += (wantYaw - p.yaw) * Math.min(1, dt * 4);

    if (sp === 'duck' && moving) roll = s * 0.16; // the waddle
    if (sp === 'crane' && moving) p.head = 0.12 + Math.sin(this.phase * 2) * 0.1; // the head bobs with each step
    if (sp === 'cat' && moving) p.tail = -0.1 + p.tail * 0.3;

    const k = this.modeT;
    switch (this.mode) {
      case 'sleep':
        p.legs *= 0.3;
        if (sp === 'dog') { drop = 0.13; p.head = 0.32; p.tail = 0.9; squash = 0.9; }
        else if (sp === 'cat') { drop = 0.1; p.head = 0.28; p.tail = 1.3; squash = 0.88; }
        else if (sp === 'rabbit') { drop = 0.035; p.head = 0.2; }
        else if (sp === 'duck') { drop = 0.04; p.head = 0.5; p.yaw = 2.4; }
        else if (sp === 'crane') { p.head = 1.25; p.legs = 0; }
        else if (sp === 'goat') { drop = 0.26; p.head = 0.35; }
        else if (sp === 'parrot') { p.head = 0.85; p.yaw = 1.6; }
        squash *= 1 + breath * 0.02;
        break;
      case 'sit':
        pitch = -0.42; drop = 0.07; p.head = -0.15;
        break;
      case 'beg':
        pitch = -1.0; drop = -0.02; p.legs = 0.7; p.head = -0.3;
        break;
      case 'roll':
        roll = 1.45; drop = 0.07; p.legs = still ? 0 : Math.sin(t * 7) * 0.5; p.yaw = Math.sin(t * 2) * 0.4;
        break;
      case 'knead':
        drop = 0.05; p.legs = still ? 0 : Math.sin(t * 14) * 0.3; p.head = 0.2;
        break;
      case 'spin':
        spin = still ? 0 : k * 9;
        p.legs = Math.sin(t * 18) * 0.5; bob = Math.abs(Math.sin(t * 9)) * 0.04;
        break;
      case 'dig':
        pitch = 0.3; p.head = 0.45; p.legs = still ? 0.3 : Math.sin(t * 22) * 0.7;
        break;
      case 'dance':
        p.fold = sp === 'crane' || sp === 'parrot' || sp === 'duck' ? 0 : 1;
        p.wings = 0.35 + (still ? 0 : Math.sin(t * 5) * 0.55);
        bob = still ? 0 : Math.abs(Math.sin(t * 2.6)) * (sp === 'crane' ? 0.18 : 0.08);
        p.head = -0.25 + (still ? 0 : Math.sin(t * 2.6) * 0.3);
        p.legs = still ? 0 : Math.sin(t * 5.2) * 0.35;
        spin = still ? 0 : Math.sin(k * 0.8) * 1.2;
        break;
      case 'call':
        p.head = -0.8; p.fold = 0.5; p.wings = 0.25;
        break;
      case 'graze':
      case 'eat':
        p.head = (sp === 'crane' ? 1.0 : sp === 'goat' ? 0.55 : 0.6) + (still ? 0 : Math.sin(t * 11) * 0.07);
        break;
      case 'groom':
        p.head = 0.55 + (still ? 0 : Math.sin(t * 9) * 0.12); p.yaw = 0.7;
        break;
      case 'butt':
        pitch = 0.2; p.head = 0.55;
        break;
      case 'shake':
        p.yaw = still ? 0 : Math.sin(t * 16) * 0.5; p.head = 0.2;
        break;
      case 'fly':
        p.fold = 0; p.wings = still ? 0.3 : Math.sin(t * (sp === 'crane' ? 6 : 26)) * 0.8 + 0.1;
        p.legs = sp === 'crane' ? 0.9 : 0.3; bob = still ? 0 : Math.sin(t * 3) * 0.04;
        break;
      case 'swim':
        p.legs = still ? 0 : Math.sin(t * (sp === 'dog' ? 12 : 8)) * 0.6;
        bob = still ? 0 : Math.sin(t * 2 + this.seed) * 0.012;
        if (sp === 'dog') { pitch = -0.25; p.head = -0.35; }
        roll = 0;
        break;
      default:
        break;
    }
    if (sp === 'parrot' && this.mode === 'idle' && !still) {
      // a parrot never sits quite still: a bob, a head-tilt, now and then a flutter
      bob += Math.max(0, Math.sin(t * 3.1 + this.seed)) * 0.012;
      p.yaw = Math.sin(t * 0.9 + this.seed) * 0.6;
      if (Math.sin(t * 0.37 + this.seed) > 0.96) { p.fold = 0.3; p.wings = Math.sin(t * 30) * 0.5; }
    }

    const root = m.root;
    root.position.set(this.x, this.y - this.sink, this.z);
    root.rotation.y = this.heading + spin;
    body.position.y = bob + this.lift - drop;
    body.rotation.set(pitch, 0, roll);
    body.scale.set(1, squash, 1);
    m.apply();
  }

  dispose(): void {
    this.m.dispose();
  }
}
