// The protagonist. PlayerController moves whoever you walk as — the physics (walking, running,
// jumping, the characters' little gifts: speed, springy jumps, gliding, walking on water), emotes,
// being frozen for a mini-game or riding a boat, the soft blob shadow — and feeds a CharacterModel
// (characters/*) its MotionState every frame. The scholar in a moon-white robe with a cinnabar sash
// is built here, as the default model and the fallback for any character without one.
import * as THREE from 'three';
import type { EmoteKind, Player } from '../types';
import type { CharacterModel, MotionState } from '../characters/types';
import type { Ability, CharacterId } from '../../../data/characters';
import { Bag, damp, dampAngle, glowTexture, inked, outlineMaterial, toon } from './kit';
import { NO_REFLECT } from './pond';

export type Emote = EmoteKind;
const EMOTE_DUR: Record<EmoteKind, number> = { eat: 2.1, bow: 1.7, jump: 0.95, wave: 1.9, water: 1.5, throw: 0.9, cast: 1.3, row: 1.5, sit: 2.5, play: 2.8 };

export interface MoveInput {
  /** desired horizontal direction in world space (length 0..1) */
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
}

export interface Physics {
  /** The surface under (x, z) for this walker (includes water when it may walk on it). */
  floorY(x: number, z: number): number;
  /** Push (x, z) out of obstacles and back onto walkable ground; returns the corrected position. */
  resolve(x: number, z: number, r: number, fromX: number, fromZ: number): [number, number];
}

function lathe(points: [number, number][], segs = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

/** The scholar (书生), as a CharacterModel: origin at the feet, facing −z. */
export class ScholarModel implements CharacterModel {
  readonly root = new THREE.Group();
  readonly height = 1.3;
  private bag = new Bag();
  private body = new THREE.Group();
  private skirt = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private ribbon = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private phase = 0;
  private blinkAt = 2;
  private lookAt = 4;
  private lookYaw = 0;
  private landed = 0;
  private wasGrounded = true;

  constructor(private reduced: boolean) {
    const bag = this.bag;
    this.root.name = 'scholar';
    // built facing +z; turned round to face −z like every character model
    const turn = new THREE.Group();
    turn.rotation.y = Math.PI;
    this.root.add(turn);
    const root = turn;
    const robe = toon(bag, '#e6e7e0');
    const trim = toon(bag, '#4b5a6b');
    const skin = toon(bag, '#f2dcc3');
    const hair = toon(bag, '#23201d');
    const sash = toon(bag, '#a8463a');
    const jade = toon(bag, '#6f8f7a');
    const blush = bag.add(new THREE.MeshBasicMaterial({ color: '#e7a598', transparent: true, opacity: 0.55 }));
    const ol = outlineMaterial(bag, 0.014);
    const G = <T extends THREE.BufferGeometry>(g: T) => bag.add(g);

    root.add(this.body);

    // legs & shoes (mostly hidden by the robe; they peek out when stepping)
    for (const [leg, sx] of [[this.legL, 1], [this.legR, -1]] as const) {
      leg.position.set(0.075 * sx, 0.34, 0);
      const shin = new THREE.Mesh(G(new THREE.CylinderGeometry(0.045, 0.04, 0.28, 8).translate(0, -0.14, 0)), trim);
      const shoe = inked(G(new THREE.SphereGeometry(1, 12, 8)), hair, ol);
      shoe.scale.set(0.055, 0.04, 0.095);
      shoe.position.set(0, -0.31, 0.025);
      leg.add(shin, shoe);
      this.body.add(leg);
    }

    // lower robe: a bell of cloth hung from the waist
    this.skirt.position.y = 0.62;
    const skirtGeo = G(lathe([[0.0, -0.53], [0.25, -0.53], [0.245, -0.49], [0.215, -0.33], [0.18, -0.16], [0.148, -0.02], [0.13, 0.02], [0, 0.02]], 22));
    this.skirt.add(inked(skirtGeo, robe, ol));
    const hem = new THREE.Mesh(G(new THREE.TorusGeometry(0.246, 0.018, 6, 26).rotateX(Math.PI / 2)), trim);
    hem.position.y = -0.505;
    this.skirt.add(hem);
    this.body.add(this.skirt);

    // torso with crossed collar and sash
    this.torso.position.y = 0.6;
    const torsoGeo = G(lathe([[0, 0], [0.135, 0], [0.15, 0.1], [0.152, 0.2], [0.13, 0.27], [0.07, 0.31], [0.045, 0.34], [0, 0.34]], 20));
    this.torso.add(inked(torsoGeo, robe, ol));
    const collarGeo = G(new THREE.BoxGeometry(0.028, 0.2, 0.02));
    const c1 = new THREE.Mesh(collarGeo, trim);
    c1.position.set(0.02, 0.22, 0.128); c1.rotation.set(-0.35, 0, -0.62);
    const c2 = new THREE.Mesh(collarGeo, trim);
    c2.position.set(-0.035, 0.24, 0.118); c2.rotation.set(-0.4, 0, 0.55);
    c2.scale.y = 0.7;
    this.torso.add(c1, c2);
    const sashRing = new THREE.Mesh(G(new THREE.TorusGeometry(0.143, 0.03, 8, 24).rotateX(Math.PI / 2)), sash);
    sashRing.position.y = 0.03;
    this.torso.add(sashRing);
    this.ribbon.position.set(0.06, 0.02, 0.13);
    const rib = new THREE.Mesh(G(new THREE.BoxGeometry(0.035, 0.22, 0.012).translate(0, -0.11, 0)), sash);
    const rib2 = rib.clone(); rib2.position.x = 0.04; rib2.rotation.z = 0.12; rib2.scale.y = 0.8;
    this.ribbon.add(rib, rib2);
    this.torso.add(this.ribbon);
    this.body.add(this.torso);

    // arms: wide sleeves, small hands
    const sleeveGeo = G(new THREE.CylinderGeometry(0.05, 0.1, 0.36, 12).translate(0, -0.18, 0));
    const cuffGeo = G(new THREE.TorusGeometry(0.095, 0.014, 6, 16).rotateX(Math.PI / 2));
    const handGeo = G(new THREE.SphereGeometry(0.043, 10, 8));
    for (const [arm, sx] of [[this.armL, 1], [this.armR, -1]] as const) {
      arm.position.set(0.155 * sx, 0.86, 0);
      const sleeve = inked(sleeveGeo, robe, ol);
      const cuff = new THREE.Mesh(cuffGeo, trim);
      cuff.position.y = -0.355;
      const hand = new THREE.Mesh(handGeo, skin);
      hand.position.y = -0.385;
      arm.add(sleeve, cuff, hand);
      this.body.add(arm);
    }

    // head: face, hair cap, bun with a jade pin, dot eyes, a little blush
    this.head.position.y = 0.93;
    const face = inked(G(new THREE.SphereGeometry(0.17, 22, 16)), skin, ol);
    face.position.y = 0.15;
    const cap = inked(G(new THREE.SphereGeometry(0.178, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair, ol);
    cap.position.y = 0.15;
    cap.rotation.x = -0.38;
    const bun = inked(G(new THREE.SphereGeometry(0.075, 14, 10)), hair, ol);
    bun.position.set(0, 0.34, -0.05);
    const pin = new THREE.Mesh(G(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6).rotateZ(Math.PI / 2)), jade);
    pin.position.copy(bun.position);
    pin.rotation.y = 0.3;
    this.head.add(face, cap, bun, pin);
    const eyeGeo = G(new THREE.SphereGeometry(0.019, 8, 6));
    for (const sx of [1, -1]) {
      const eye = new THREE.Mesh(eyeGeo, hair);
      eye.position.set(0.058 * sx, 0.135, 0.155);
      eye.scale.z = 0.5;
      this.eyes.push(eye);
      const b = new THREE.Mesh(eyeGeo, blush);
      b.position.set(0.098 * sx, 0.09, 0.135);
      b.scale.set(1.3, 0.7, 0.4);
      this.head.add(eye, b);
    }
    this.body.add(this.head);

  }

  update(dt: number, s: MotionState): void {
    const t = s.t;
    const v = s.speed;
    const run = s.running && v > 3;
    const gait = s.riding ? 0 : Math.min(1, v / 2.1);
    this.phase += (v * dt * Math.PI * 2) / (run ? 1.25 : 0.82);
    const sn = Math.sin(this.phase);
    const bobK = this.reduced ? 0.3 : 1;
    const air = s.grounded || s.riding ? 0 : 1;
    if (s.grounded && !this.wasGrounded) this.landed = 1;
    this.wasGrounded = s.grounded;

    let legL = sn * 0.55 * gait, legR = -sn * 0.55 * gait;
    let armLx = -sn * 0.42 * gait, armRx = sn * 0.42 * gait;
    let armLz = 0.1 + gait * 0.05, armRz = -0.1 - gait * 0.05;
    let lean = (run ? 0.2 : 0.07) * gait;
    let bodyY = Math.abs(Math.cos(this.phase)) * (run ? 0.05 : 0.03) * gait * bobK;
    let headX = 0, headZ = 0;
    const breath = 1 + Math.sin(t * 1.7) * 0.012 * (1 - gait);
    if (air) {
      legL = -0.45; legR = 0.25;
      armLz = 0.7; armRz = -0.7; armLx = -0.3; armRx = -0.3;
      if (s.vy < -0.5 && s.vy > -1.6) { armLz = 1.3; armRz = -1.3; } // gliding: sleeves spread like wings
    }
    if (this.landed > 0) {
      this.landed = Math.max(0, this.landed - dt * 4);
      bodyY -= Math.sin(this.landed * Math.PI) * 0.05 * bobK;
    }
    const sitting = s.riding || s.emote === 'sit';
    if (sitting) {
      legL = -1.45; legR = -1.35;
      bodyY -= 0.3;
      armLx = -0.5; armRx = -0.5; armLz = -0.2; armRz = 0.2;
    }

    if (gait < 0.1 && !s.emote) {
      if (t > this.lookAt) {
        this.lookAt = t + 3 + ((t * 7.13) % 4);
        this.lookYaw = ((Math.floor(t * 3.7) % 3) - 1) * 0.35;
      }
    } else this.lookYaw = 0;
    const blinking = t > this.blinkAt && t < this.blinkAt + 0.12;
    if (t > this.blinkAt + 0.12) this.blinkAt = t + 2.2 + ((t * 5.31) % 3);
    for (const e of this.eyes) e.scale.y = blinking ? 0.15 : 1;

    if (s.emote) {
      const kind = s.emote;
      const u = s.emoteT;
      const et = u * EMOTE_DUR[kind];
      const env = Math.min(1, u / 0.18, (1 - u) / 0.2);
      const mix = (a: number, b: number) => a + (b - a) * Math.max(0, env);
      if (kind === 'eat') {
        armLx = mix(armLx, -2.05); armRx = mix(armRx, -1.95);
        armLz = mix(armLz, -0.55); armRz = mix(armRz, 0.5);
        headX = mix(0, 0.12 + Math.sin(et * 18) * 0.07);
      } else if (kind === 'bow') {
        const deep = Math.sin(Math.min(1, u * 1.15) * Math.PI);
        armLx = mix(armLx, -1.35); armRx = mix(armRx, -1.35);
        armLz = mix(armLz, -0.6); armRz = mix(armRz, 0.6);
        lean = mix(lean, 0.45 * deep + 0.05);
        headX = mix(0, 0.25 * deep);
      } else if (kind === 'jump') {
        armLx = mix(armLx, -2.7); armRx = mix(armRx, -2.7);
        armLz = mix(armLz, 0.45); armRz = mix(armRz, -0.45);
      } else if (kind === 'wave') {
        armRx = mix(armRx, -0.25);
        armRz = mix(armRz, -2.45 + Math.sin(et * 9) * 0.3);
        headZ = mix(0, 0.12);
      } else if (kind === 'water') {
        armLx = mix(armLx, -1.15 + Math.sin(et * 6) * 0.08); armRx = mix(armRx, -1.1 + Math.sin(et * 6) * 0.08);
        armLz = mix(armLz, -0.35); armRz = mix(armRz, 0.35);
        lean = mix(lean, 0.28);
        headX = mix(0, 0.3);
      } else if (kind === 'throw') {
        const k = u < 0.45 ? u / 0.45 : 1;
        armRx = mix(armRx, u < 0.45 ? 0.9 * k : -2.3);
        armLx = mix(armLx, -0.6);
        lean = mix(lean, u < 0.45 ? -0.08 : 0.22);
      } else if (kind === 'cast') {
        armLx = mix(armLx, u < 0.4 ? -2.6 : -1.1); armRx = mix(armRx, u < 0.4 ? -2.6 : -1.15);
        armLz = mix(armLz, -0.3); armRz = mix(armRz, 0.3);
        lean = mix(lean, u < 0.4 ? -0.1 : 0.18);
      } else if (kind === 'row') {
        const c = Math.sin(et * 4.2);
        armLx = mix(armLx, -1.2 + c * 0.55); armRx = mix(armRx, -1.2 + c * 0.55);
        armLz = mix(armLz, -0.3); armRz = mix(armRz, 0.3);
        lean = mix(lean, 0.12 + c * 0.14);
      } else if (kind === 'play') {
        armLx = mix(armLx, -1.05 + Math.sin(et * 7) * 0.06); armRx = mix(armRx, -1.0 + Math.sin(et * 5.3 + 1) * 0.08);
        armLz = mix(armLz, -0.45 + Math.sin(et * 3.1) * 0.12); armRz = mix(armRz, 0.45 + Math.sin(et * 4.1) * 0.12);
        headX = mix(0, 0.22);
        headZ = mix(0, Math.sin(et * 1.3) * 0.12);
      }
    }

    const k = 14;
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, k, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, k, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, armLx, k, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armRx, k, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, armLz, k, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, armRz, k, dt);
    this.body.rotation.x = damp(this.body.rotation.x, lean, 8, dt);
    this.body.position.y = damp(this.body.position.y, bodyY, 20, dt);
    this.torso.scale.y = breath;
    this.head.rotation.x = damp(this.head.rotation.x, headX, 10, dt);
    this.head.rotation.z = damp(this.head.rotation.z, headZ, 10, dt);
    this.head.rotation.y = damp(this.head.rotation.y, this.lookYaw, 3, dt);
    this.skirt.rotation.z = damp(this.skirt.rotation.z, Math.sin(this.phase - 0.6) * 0.06 * gait, 10, dt);
    this.skirt.rotation.x = damp(this.skirt.rotation.x, -lean * 0.4 - 0.05 * gait - (sitting ? 0.9 : 0), 6, dt);
    this.ribbon.rotation.x = damp(this.ribbon.rotation.x, -0.25 * gait - air * 0.6 + Math.sin(t * 2.3) * 0.05, 5, dt);
  }

  dispose(): void {
    this.bag.dispose();
  }
}

/** Per-character tuning from their ability (data/characters.ts). */
export interface Gifts { speed: number; jump: number; glide: boolean; float: boolean }
export function giftsOf(a: Ability): Gifts {
  return {
    speed: a.kind === 'speed' ? a.factor : 1,
    jump: a.kind === 'jump' ? Math.pow(a.factor, 0.75) : 1,
    glide: a.kind === 'glide',
    float: a.kind === 'float',
  };
}

export class PlayerController implements Player {
  readonly root = new THREE.Group();
  readonly position: THREE.Vector3;
  heading: number;
  character: CharacterId = 'scholar';
  gifts: Gifts = { speed: 1, jump: 1, glide: false, float: false };
  model: CharacterModel;
  private holder = new THREE.Group();
  private shadow: THREE.Mesh;
  private vx = 0;
  private vz = 0;
  vy = 0;
  grounded = true;
  private emoteKind: EmoteKind | null = null;
  private emoteT = 0;
  private time = 0;
  private targetHeading: number | null = null;
  private frozen = false;
  private riding: THREE.Object3D | null = null;
  private jumped = false;
  speed = 0;
  running = false;
  /** Called after teleport() so the camera can snap along. */
  onTeleport: (() => void) | null = null;
  /** Set by the world: the surface under a point for this walker. */
  floorAt: (x: number, z: number) => number = () => 0;
  private motion: MotionState = { speed: 0, running: false, grounded: true, vy: 0, emote: null, emoteT: 0, t: 0, riding: false };
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpS = new THREE.Vector3();

  constructor(bag: Bag, x: number, y: number, z: number, heading: number, model: CharacterModel) {
    this.position = this.root.position;
    this.position.set(x, y, z);
    this.heading = heading;
    this.root.name = 'player';
    // models face −z; the heading convention faces +z at 0
    this.holder.rotation.y = Math.PI;
    this.root.add(this.holder);
    this.model = model;
    this.holder.add(model.root);
    this.root.rotation.y = heading;

    const sh = new THREE.Mesh(bag.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), bag.add(new THREE.MeshBasicMaterial({
      color: '#000000', transparent: true, opacity: 0.3, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })));
    (sh.material as THREE.MeshBasicMaterial).alphaMap = glowTexture(bag, 64, 1.4);
    sh.layers.set(NO_REFLECT);
    this.shadow = sh;
  }

  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }

  /** Swap who you walk as; the old model is disposed. */
  setModel(model: CharacterModel, id: CharacterId, gifts: Gifts): void {
    this.holder.remove(this.model.root);
    try { this.model.dispose(); } catch (e) { console.warn('[walk] model dispose', e); }
    this.model = model;
    this.holder.add(model.root);
    this.character = id;
    this.gifts = gifts;
  }

  /** Where the camera looks (above the feet). */
  get eyeHeight(): number {
    return Math.min(1.05, Math.max(0.45, this.model.height * 0.73));
  }

  emote(kind: EmoteKind): void {
    if (kind === 'jump' && this.grounded && !this.frozen) {
      this.vy = 3.4 * this.gifts.jump;
      this.grounded = false;
    }
    this.emoteKind = kind;
    this.emoteT = 0;
  }

  get busy(): boolean {
    return this.emoteKind !== null && this.emoteKind !== 'jump' && this.emoteKind !== 'wave';
  }

  face(x: number, z: number): void {
    this.targetHeading = Math.atan2(x - this.position.x, z - this.position.z);
  }

  teleport(x: number, z: number, heading?: number, y?: number): void {
    this.position.set(x, y ?? this.floorAt(x, z), z);
    if (heading !== undefined) { this.heading = heading; this.root.rotation.y = heading; this.targetHeading = null; }
    this.vx = this.vz = this.vy = 0;
    this.grounded = y === undefined;
    if (y !== undefined && Math.abs(y - this.floorAt(x, z)) < 0.05) this.grounded = true;
    this.onTeleport?.();
  }

  freeze(on: boolean): void {
    this.frozen = on;
    this.vx = this.vz = 0;
    if (!on) { this.vy = 0; this.grounded = false; }
  }

  ride(obj: THREE.Object3D | null): void {
    this.riding = obj;
    this.vx = this.vz = this.vy = 0;
    if (!obj) { this.grounded = false; }
  }

  get isFrozen(): boolean {
    return this.frozen || this.riding !== null;
  }

  update(dt: number, input: MoveInput, phys: Physics): void {
    this.time += dt;
    let floor: number;
    if (this.riding) {
      this.riding.updateWorldMatrix(true, false);
      this.riding.matrixWorld.decompose(this.tmpV, this.tmpQ, this.tmpS);
      this.position.copy(this.tmpV);
      this.tmpE.setFromQuaternion(this.tmpQ, 'YXZ');
      this.heading = this.tmpE.y;
      this.speed = 0;
      floor = this.position.y;
      this.grounded = true;
    } else if (this.frozen) {
      this.speed = 0;
      floor = phys.floorY(this.position.x, this.position.z);
      if (this.targetHeading !== null) this.heading = dampAngle(this.heading, this.targetHeading, 8, dt);
    } else {
      floor = this.walk(dt, input, phys);
    }
    this.root.rotation.y = this.heading;

    // the emote clock
    if (this.emoteKind) {
      this.emoteT += dt;
      if (this.emoteT >= EMOTE_DUR[this.emoteKind]) this.emoteKind = null;
    }
    const m = this.motion;
    m.speed = this.speed;
    m.running = this.running;
    m.grounded = this.grounded;
    m.vy = this.vy;
    m.emote = this.emoteKind;
    m.emoteT = this.emoteKind ? Math.min(1, this.emoteT / EMOTE_DUR[this.emoteKind]) : 0;
    m.t = this.time;
    m.riding = this.riding !== null;
    try { this.model.update(dt, m); } catch (e) { console.error('[walk] character update failed', e); }

    this.shadow.position.set(this.position.x, floor + 0.03, this.position.z);
    const lift = Math.max(0, this.position.y - floor);
    const s = (0.75 * Math.min(1.25, Math.max(0.6, this.model.height / 1.3))) / (1 + lift * 0.8);
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 / (1 + lift);
  }

  private walk(dt: number, input: MoveInput, phys: Physics): number {
    const mag = Math.min(1, Math.hypot(input.x, input.z));
    if (mag > 0.25 && this.emoteKind && this.emoteKind !== 'jump') this.emoteKind = null;
    const busy = this.busy;
    this.running = input.run;
    const maxSpeed = (input.run ? 4.3 : 2.1) * mag * this.gifts.speed;
    const tx = mag > 0.01 && !busy ? (input.x / Math.max(mag, 1e-6)) * maxSpeed : 0;
    const tz = mag > 0.01 && !busy ? (input.z / Math.max(mag, 1e-6)) * maxSpeed : 0;
    const acc = this.grounded ? 10 : 3;
    this.vx = damp(this.vx, tx, acc, dt);
    this.vz = damp(this.vz, tz, acc, dt);
    const px = this.position.x, pz = this.position.z;
    let nx = px + this.vx * dt, nz = pz + this.vz * dt;
    [nx, nz] = phys.resolve(nx, nz, 0.3, px, pz);
    // no scrambling up cliffs: on the ground, a rise steeper than ~35° stops you (slide along it)
    const f0 = phys.floorY(px, pz);
    const tooSteep = (x: number, z: number) => {
      const rise = phys.floorY(x, z) - f0;
      const run = Math.hypot(x - px, z - pz);
      return rise > (this.grounded ? 0.5 : 0.25) || (this.grounded && rise > 0.05 && rise > run * 0.72);
    };
    if (tooSteep(nx, nz)) {
      if (!tooSteep(nx, pz)) nz = pz;
      else if (!tooSteep(px, nz)) nx = px;
      else { nx = px; nz = pz; }
    }
    const moved = Math.hypot(nx - px, nz - pz);
    this.speed = dt > 0 ? moved / dt : 0;
    this.position.x = nx;
    this.position.z = nz;

    if (input.jump && this.grounded) {
      this.vy = 4.1 * this.gifts.jump;
      this.grounded = false;
      this.jumped = true;
    }
    const floor = phys.floorY(nx, nz);
    if (!this.grounded) {
      this.vy -= 12.5 * dt;
      // the jade rabbit floats down
      if (this.gifts.glide && this.vy < -1.3) this.vy = damp(this.vy, -1.3, 10, dt);
      this.position.y += this.vy * dt;
      if (this.position.y <= floor) {
        this.position.y = floor;
        this.grounded = true;
        this.vy = 0;
        this.jumped = false;
      }
    } else {
      if (floor < this.position.y - 0.35) { this.grounded = false; this.vy = 0; }
      else this.position.y = damp(this.position.y, floor, 25, dt);
    }
    void this.jumped;

    if (moved > 0.002 && mag > 0.05) {
      this.targetHeading = null;
      this.heading = dampAngle(this.heading, Math.atan2(this.vx, this.vz), 12, dt);
    } else if (this.targetHeading !== null) {
      this.heading = dampAngle(this.heading, this.targetHeading, 8, dt);
    }
    return floor;
  }
}
