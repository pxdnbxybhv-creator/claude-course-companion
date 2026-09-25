// The protagonist: a small scholar in a moon-white robe with a cinnabar sash, built from a dozen
// primitives, toon-shaded and outlined in ink. Everything moves procedurally: the walk (legs,
// sleeves, the robe's hem), idle breathing and blinking, a run, a jump, and a few emotes.
import * as THREE from 'three';
import type { Player } from '../types';
import { Bag, damp, dampAngle, glowTexture, inked, outlineMaterial, toon } from './kit';
import { NO_REFLECT } from './pond';

export type Emote = 'eat' | 'bow' | 'jump' | 'wave' | 'water';
const EMOTE_DUR: Record<Emote, number> = { eat: 2.1, bow: 1.7, jump: 0.95, wave: 1.9, water: 1.5 };

export interface MoveInput {
  /** desired horizontal direction in world space (length 0..1) */
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
}

export interface Physics {
  floorY(x: number, z: number): number;
  /** Push (x, z) out of obstacles; returns the corrected position. */
  resolve(x: number, z: number, r: number, fromX: number, fromZ: number): [number, number];
}

function lathe(points: [number, number][], segs = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

export class Scholar implements Player {
  readonly root = new THREE.Group();
  readonly position: THREE.Vector3;
  heading: number;
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
  private shadow: THREE.Mesh;

  private vx = 0;
  private vz = 0;
  private vy = 0;
  private grounded = true;
  private phase = 0;
  private emoteKind: Emote | null = null;
  private emoteT = 0;
  private blinkAt = 2;
  private lookAt = 4;
  private lookYaw = 0;
  private landed = 0;
  private time = 0;
  speed = 0;

  constructor(bag: Bag, x: number, y: number, z: number, heading: number, private reduced: boolean) {
    this.position = this.root.position;
    this.position.set(x, y, z);
    this.heading = heading;
    this.root.name = 'scholar';

    const robe = toon(bag, '#e6e7e0');
    const trim = toon(bag, '#4b5a6b');
    const skin = toon(bag, '#f2dcc3');
    const hair = toon(bag, '#23201d');
    const sash = toon(bag, '#a8463a');
    const jade = toon(bag, '#6f8f7a');
    const blush = bag.add(new THREE.MeshBasicMaterial({ color: '#e7a598', transparent: true, opacity: 0.55 }));
    const ol = outlineMaterial(bag, 0.014);
    const G = <T extends THREE.BufferGeometry>(g: T) => bag.add(g);

    this.root.add(this.body);

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

    // soft blob shadow
    const sh = new THREE.Mesh(G(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), bag.add(new THREE.MeshBasicMaterial({
      map: glowTexture(bag, 64, 1.4), color: '#000000', transparent: true, opacity: 0.3, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })));
    sh.layers.set(NO_REFLECT);
    this.shadow = sh;
    // the texture is white → multiply-ish look by using black colour with alpha from the map
    (sh.material as THREE.MeshBasicMaterial).alphaMap = (sh.material as THREE.MeshBasicMaterial).map;
    (sh.material as THREE.MeshBasicMaterial).map = null;

    this.root.rotation.y = heading;
  }

  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }

  emote(kind: Emote): void {
    if (kind === 'jump' && this.grounded) {
      this.vy = 3.4;
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
  private targetHeading: number | null = null;

  update(dt: number, input: MoveInput, phys: Physics): void {
    this.time += dt;
    const t = this.time;
    const mag = Math.min(1, Math.hypot(input.x, input.z));
    if (mag > 0.25 && this.emoteKind && this.emoteKind !== 'jump') this.emoteKind = null;
    const busy = this.busy;
    const maxSpeed = (input.run ? 4.3 : 2.1) * mag;
    const tx = mag > 0.01 && !busy ? (input.x / Math.max(mag, 1e-6)) * maxSpeed : 0;
    const tz = mag > 0.01 && !busy ? (input.z / Math.max(mag, 1e-6)) * maxSpeed : 0;
    const acc = this.grounded ? 10 : 3;
    this.vx = damp(this.vx, tx, acc, dt);
    this.vz = damp(this.vz, tz, acc, dt);
    const px = this.position.x, pz = this.position.z;
    let nx = px + this.vx * dt, nz = pz + this.vz * dt;
    [nx, nz] = phys.resolve(nx, nz, 0.3, px, pz);
    // no climbing walls: only small steps up while on the ground
    const fNew = phys.floorY(nx, nz);
    if (fNew - this.position.y > (this.grounded ? 0.5 : 0.25)) { nx = px; nz = pz; }
    const moved = Math.hypot(nx - px, nz - pz);
    this.speed = dt > 0 ? moved / dt : 0;
    this.position.x = nx;
    this.position.z = nz;

    // jump & gravity
    if (input.jump && this.grounded) {
      this.vy = 4.1;
      this.grounded = false;
    }
    const floor = phys.floorY(nx, nz);
    if (!this.grounded) {
      this.vy -= 12.5 * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= floor) {
        this.position.y = floor;
        this.grounded = true;
        this.vy = 0;
        this.landed = 1;
      }
    } else {
      // follow the ground; step down gently, fall off edges
      if (floor < this.position.y - 0.35) { this.grounded = false; this.vy = 0; }
      else this.position.y = damp(this.position.y, floor, 25, dt);
    }

    // turn toward travel
    if (moved > 0.002 && mag > 0.05) {
      this.targetHeading = null;
      this.heading = dampAngle(this.heading, Math.atan2(this.vx, this.vz), 12, dt);
    } else if (this.targetHeading !== null) {
      this.heading = dampAngle(this.heading, this.targetHeading, 8, dt);
    }
    this.root.rotation.y = this.heading;

    this.animate(dt, t);

    this.shadow.position.set(this.position.x, floor + 0.03, this.position.z);
    const lift = Math.max(0, this.position.y - floor);
    const s = 0.75 / (1 + lift * 0.8);
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 / (1 + lift);
  }

  private animate(dt: number, t: number): void {
    const v = this.speed;
    const run = v > 3;
    const gait = Math.min(1, v / 2.1);
    this.phase += (v * dt * Math.PI * 2) / (run ? 1.25 : 0.82);
    const s = Math.sin(this.phase);
    const bobK = this.reduced ? 0.3 : 1;
    const air = this.grounded ? 0 : 1;

    // base pose
    let legL = s * 0.55 * gait, legR = -s * 0.55 * gait;
    let armLx = -s * 0.42 * gait, armRx = s * 0.42 * gait;
    let armLz = 0.1 + gait * 0.05, armRz = -0.1 - gait * 0.05;
    let lean = (run ? 0.2 : 0.07) * gait;
    let bodyY = Math.abs(Math.cos(this.phase)) * (run ? 0.05 : 0.03) * gait * bobK;
    let headX = 0, headZ = 0;
    const breath = 1 + Math.sin(t * 1.7) * 0.012 * (1 - gait);
    if (air) {
      legL = -0.45; legR = 0.25;
      armLz = 0.7; armRz = -0.7; armLx = -0.3; armRx = -0.3;
    }
    if (this.landed > 0) {
      this.landed = Math.max(0, this.landed - dt * 4);
      bodyY -= Math.sin(this.landed * Math.PI) * 0.05 * bobK;
    }

    // idle: look around now and then, blink
    if (gait < 0.1 && !this.emoteKind) {
      if (t > this.lookAt) {
        this.lookAt = t + 3 + ((t * 7.13) % 4);
        this.lookYaw = ((Math.floor(t * 3.7) % 3) - 1) * 0.35;
      }
    } else this.lookYaw = 0;
    const blinking = t > this.blinkAt && t < this.blinkAt + 0.12;
    if (t > this.blinkAt + 0.12) this.blinkAt = t + 2.2 + ((t * 5.31) % 3);
    for (const e of this.eyes) e.scale.y = blinking ? 0.15 : 1;

    // emotes
    if (this.emoteKind) {
      const kind = this.emoteKind;
      const dur = EMOTE_DUR[kind];
      this.emoteT += dt;
      const u = this.emoteT / dur;
      if (u >= 1) this.emoteKind = null;
      const env = Math.min(1, u / 0.18, (1 - u) / 0.2);
      const mix = (a: number, b: number) => a + (b - a) * Math.max(0, env);
      if (kind === 'eat') {
        armLx = mix(armLx, -2.05); armRx = mix(armRx, -1.95);
        armLz = mix(armLz, -0.55); armRz = mix(armRz, 0.5);
        headX = mix(0, 0.12 + Math.sin(this.emoteT * 18) * 0.07);
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
        armRz = mix(armRz, -2.45 + Math.sin(this.emoteT * 9) * 0.3);
        headZ = mix(0, 0.12);
      } else if (kind === 'water') {
        armLx = mix(armLx, -1.15 + Math.sin(this.emoteT * 6) * 0.08); armRx = mix(armRx, -1.1 + Math.sin(this.emoteT * 6) * 0.08);
        armLz = mix(armLz, -0.35); armRz = mix(armRz, 0.35);
        lean = mix(lean, 0.28);
        headX = mix(0, 0.3);
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
    // the robe swings a beat behind the legs; the sash ribbon trails
    this.skirt.rotation.z = damp(this.skirt.rotation.z, Math.sin(this.phase - 0.6) * 0.06 * gait, 10, dt);
    this.skirt.rotation.x = damp(this.skirt.rotation.x, -lean * 0.4 - 0.05 * gait, 6, dt);
    this.ribbon.rotation.x = damp(this.ribbon.rotation.x, -0.25 * gait - air * 0.6 + Math.sin(t * 2.3) * 0.05, 5, dt);
  }
}
