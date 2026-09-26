// Two companions' gifts that live in the world itself:
//  - 琴师 (the Qin Player): press E (or the action button) with nothing to do nearby and she plays a
//    phrase on the qin; a little flock of birds flies in from the trees and settles round her to listen,
//    and flies off again when the music has stopped (or she walks away).
//  - 诗仙 (the Poet Immortal): as he walks, whole lines of verse rise beside him in brushed columns
//    and drift off — chosen for where he is, the season and the hour, from many poems, never the same
//    line twice in a row (features/skills/verses.ts).
import * as THREE from 'three';
import { Bag, canvas, canvasTexture } from './kit';
import { NO_REFLECT } from './pond';
import { birdGeometry, instanceAttrs, wingMaterial } from '../features/geo';
import { VerseDeck, seasonOfMonth, verseEnv, type VerseLine } from '../features/skills/verses';
import { regionAt } from '../map';
import { hashString, makeRng } from '../../../core/rng';

const TAU = Math.PI * 2;

interface SongBird { x: number; y: number; z: number; h: number; fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; ft: number; fd: number; delay: number; mode: 'away' | 'in' | 'perch' | 'out'; hop: number; hopT: number; peck: number }

/** The birds that come to listen. One instanced draw, hidden unless called. */
export class SongBirds {
  readonly mesh: THREE.InstancedMesh;
  private birds: SongBird[];
  private anim: ReturnType<typeof wingMaterial>;
  private amp: THREE.InstancedBufferAttribute;
  private listenUntil = 0;
  private cx = 0;
  private cz = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1.15, 1.15, 1.15);
  private rnd = makeRng(0x50b1d5);

  constructor(bag: Bag, private ground: (x: number, z: number) => number, private walkable: (x: number, z: number) => boolean, n = 5) {
    const geo = bag.add(birdGeometry(THREE, { body: '#6d6a63', belly: '#ece3d2', wing: '#3e3a35', tip: '#1b1916', beak: '#c98a3a' }));
    this.amp = instanceAttrs(THREE, geo, n, (i) => i * 1.7).amp;
    this.anim = wingMaterial(THREE, { rate: 34, angle: 0.95, lift: 0.15, fold: 0.2 });
    bag.add(this.anim.material);
    this.mesh = new THREE.InstancedMesh(geo, this.anim.material, n);
    this.mesh.name = 'song-birds';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.layers.set(NO_REFLECT);
    this.birds = Array.from({ length: n }, () => ({ x: 0, y: -99, z: 0, h: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, ft: 0, fd: 1, delay: 0, mode: 'away', hop: 0, hopT: 0, peck: 0 }));
  }

  /** The music has started at (x, z): come and listen for `secs`. */
  call(x: number, z: number, t: number, secs: number): void {
    this.cx = x; this.cz = z;
    this.listenUntil = t + secs;
    this.mesh.visible = true;
    this.birds.forEach((b, i) => {
      if (b.mode === 'perch' || b.mode === 'in') return;
      // from the trees, somewhere up and away
      const a = this.rnd() * TAU, r = 14 + this.rnd() * 6;
      const from = b.mode === 'out' ? [b.x, b.y, b.z] : [x + Math.cos(a) * r, this.ground(x, z) + 5 + this.rnd() * 3, z + Math.sin(a) * r];
      let px = x, pz = z;
      for (let k = 0; k < 10; k++) {
        const pa = (i / this.birds.length) * TAU + this.rnd() * 0.9, pr = 1.3 + this.rnd() * 1.1;
        px = x + Math.cos(pa) * pr; pz = z + Math.sin(pa) * pr;
        if (this.walkable(px, pz)) break;
      }
      this.fly(b, from[0], from[1], from[2], px, this.ground(px, pz), pz, 2.4 + this.rnd() * 1.2, 0.15 + i * 0.35);
      b.mode = 'in';
    });
  }

  get busy(): boolean {
    return this.mesh.visible;
  }

  private fly(b: SongBird, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, fd: number, delay: number) {
    b.fx = fx; b.fy = fy; b.fz = fz; b.tx = tx; b.ty = ty; b.tz = tz; b.ft = 0; b.fd = fd; b.delay = delay;
    b.x = fx; b.y = fy; b.z = fz;
  }

  update(dt: number, t: number, px: number, pz: number): void {
    if (!this.mesh.visible) return;
    this.anim.uniforms.uTime.value = t;
    dt = Math.min(dt, 0.1);
    const leave = t > this.listenUntil || Math.hypot(px - this.cx, pz - this.cz) > 4.5;
    let any = false;
    this.birds.forEach((b, i) => {
      let pitch = 0, yOff = 0;
      if (b.mode === 'perch' && leave) {
        const a = this.rnd() * TAU;
        this.fly(b, b.x, b.y, b.z, b.x + Math.cos(a) * 18, b.y + 7, b.z + Math.sin(a) * 18, 2.6, i * 0.12 + this.rnd() * 0.3);
        b.mode = 'out';
      }
      if (b.mode === 'in' || b.mode === 'out') {
        if (b.delay > 0) { b.delay -= dt; this.amp.setX(i, 0); if (b.mode === 'in') b.y = -99; }
        else {
          b.ft += dt;
          const k = Math.min(1, b.ft / b.fd);
          const ek = b.mode === 'in' ? 1 - (1 - k) * (1 - k) : k * k;
          b.x = b.fx + (b.tx - b.fx) * ek;
          b.z = b.fz + (b.tz - b.fz) * ek;
          b.y = b.fy + (b.ty - b.fy) * ek + Math.sin(k * Math.PI) * 0.8;
          b.h = Math.atan2(b.tx - b.fx, b.tz - b.fz);
          pitch = b.mode === 'in' ? -0.25 * (1 - k) : -0.3;
          this.amp.setX(i, b.mode === 'in' && k > 0.9 ? 0.3 : 1);
          if (k >= 1) {
            if (b.mode === 'in') { b.mode = 'perch'; b.hopT = 0.4 + this.rnd(); b.h = Math.atan2(this.cx - b.x, this.cz - b.z); }
            else { b.mode = 'away'; b.y = -99; }
          }
        }
      } else if (b.mode === 'perch') {
        // listening: face the player, a hop now and then, a little bob of the head to the tune
        this.amp.setX(i, 0);
        b.hopT -= dt;
        if (b.hop > 0) {
          b.hop -= dt * 4;
          yOff = Math.sin(Math.max(0, b.hop) * Math.PI) * 0.06;
        } else if (b.hopT <= 0) {
          b.hopT = 0.6 + this.rnd() * 1.6;
          if (this.rnd() < 0.5) b.peck = 0.3;
          else { b.hop = 1; b.h = Math.atan2(px - b.x, pz - b.z) + (this.rnd() - 0.5) * 0.6; }
        }
        if (b.peck > 0) { b.peck -= dt; pitch = Math.sin((b.peck / 0.3) * Math.PI) * 0.45; }
        else pitch = Math.sin(t * 5 + i) * 0.08;
        b.y = this.ground(b.x, b.z);
      }
      if (b.mode !== 'away') any = true;
      this.e.set(pitch, b.h, 0);
      this.q.setFromEuler(this.e);
      this.v.set(b.x, b.y + 0.05 + yOff, b.z);
      if (b.mode === 'away' || b.y < -50) this.m.makeScale(0, 0, 0);
      else this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.amp.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) this.mesh.visible = false;
  }
}

interface Column { sprite: THREE.Sprite; tex: THREE.CanvasTexture; c: HTMLCanvasElement; age: number; life: number; x: number; y: number; z: number; vx: number; vz: number; spin: number; text: string; night: boolean; h: number }

const COL_W = 128, COL_H = 1024, CHAR = 104;
const BRUSH = '"Ma Shan Zheng", "LXGW WenKai", "KaiTi", "STKaiti", serif';

/**
 * Lines of verse rising beside a walker (the poet): each a vertical column of brushed characters —
 * a whole clause, so it can be read — that fades in a step ahead, rises and drifts off. A handful of
 * sprites, reused; the text comes from a VerseDeck for the place, season and hour.
 */
export class DriftingVerses {
  readonly group = new THREE.Group();
  private pool: Column[] = [];
  private next = 0;
  private wait = 0.6;
  private side = 1;
  private deck: VerseDeck;
  private rnd = makeRng(0x7e45e);
  /** prefers-reduced-motion: the columns fade in and out where they stand. */
  private still = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();

  constructor(bag: Bag, n = 4) {
    this.group.name = 'verses';
    this.deck = new VerseDeck(hashString('poet-walk'));
    for (let i = 0; i < Math.max(3, Math.min(6, n)); i++) {
      const c = canvas(COL_W, COL_H);
      const tex = canvasTexture(bag, c, { mips: false });
      const mat = bag.add(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.layers.set(NO_REFLECT);
      sprite.renderOrder = 4;
      this.group.add(sprite);
      this.pool.push({ sprite, tex, c, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vz: 0, spin: 0, text: '', night: false, h: 1 });
    }
  }

  /** The day's poem: seeds the choice (the lines themselves now come by place, season and hour). */
  setPoem(lines: string[]): void {
    this.deck = new VerseDeck(hashString('poet:' + lines.join('')));
  }

  /** Called every frame: `walking` = the poet is on the move; heading faces +z at 0; `cam` = the camera. */
  update(dt: number, walking: boolean, x: number, y: number, z: number, heading: number, night: number, cam: THREE.Vector3): void {
    dt = Math.min(dt, 0.1);
    let live = false;
    if (walking) {
      this.wait -= dt;
      if (this.wait <= 0) this.spawn(x, y, z, heading, night);
    }
    for (const v of this.pool) {
      if (!v.sprite.visible) continue;
      live = true;
      v.age += dt;
      const k = v.age / v.life;
      if (k >= 1) { v.sprite.visible = false; continue; }
      if (!this.still) { v.x += v.vx * dt; v.z += v.vz * dt; v.y += (k < 0.55 ? 0.1 : 0.34) * dt; }
      v.sprite.position.set(v.x + (this.still ? 0 : Math.sin(v.age * 1.1 + v.spin) * 0.05), v.y, v.z);
      // walked past, a column fades before the camera reaches it (it would fill the view)
      const dc = Math.hypot(v.x - cam.x, v.y - cam.y, v.z - cam.z);
      const near = Math.max(0, Math.min(1, (dc - 1.8) / 1.6));
      const m = v.sprite.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, k / 0.1) * Math.min(1, (1 - k) / 0.35) * near * 0.95;
      m.rotation = this.still ? 0 : Math.sin(v.age * 0.6 + v.spin) * 0.035;
    }
    this.group.visible = live;
  }

  private spawn(x: number, y: number, z: number, heading: number, night: number): void {
    const v = this.pool[this.next++ % this.pool.length];
    const d = new Date();
    const line: VerseLine = this.deck.next({
      region: regionAt(x, z),
      season: verseEnv.season ?? seasonOfMonth(d.getMonth() + 1),
      hour: d.getHours() + d.getMinutes() / 60,
      night: night > 0.5,
    });
    // the second clause of a couplet follows sooner; a new poem after a breath
    this.wait = line.at % 2 === 0 && line.at + 1 < line.of ? 1.9 : 2.8;
    v.text = line.text;
    v.night = night > 0.5;
    this.paint(v);
    const n = [...line.text].length;
    const hgt = (COL_H / COL_W) * 0.3;
    v.sprite.scale.set(0.3, hgt, 1);
    v.h = n;
    // a step or two ahead, off to one side (alternating, like the two halves of a couplet), about head high
    this.side = -this.side;
    const side = this.side * (0.95 + this.rnd() * 0.35);
    const ahead = 1.3 + this.rnd() * 1.1;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    v.x = x + fx * ahead + fz * side; v.z = z + fz * ahead - fx * side;
    v.y = y + 0.8 + ((n * CHAR) / COL_H) * hgt * 0.5;
    v.vx = fz * side * 0.06; v.vz = -fx * side * 0.06;
    v.age = 0; v.life = 5.2 + this.rnd() * 0.8; v.spin = this.rnd() * Math.PI * 2;
    v.sprite.visible = true;
    // the brush face for these characters may still be on its way: paint again once it is here
    try {
      const want = v.text;
      document.fonts?.load(`64px "Ma Shan Zheng"`, want).then(() => { if (v.text === want && v.sprite.visible) this.paint(v); }).catch(() => {});
    } catch { /* no font loading API */ }
  }

  private paint(v: Column): void {
    const g = v.c.getContext('2d');
    if (!g) return;
    const chars = [...v.text];
    g.clearRect(0, 0, COL_W, COL_H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `92px ${BRUSH}`;
    const top = (COL_H - chars.length * CHAR) / 2;
    // a soft halo of paper (by day) or lamplight (by night) under the ink, so a line reads against leaves
    g.save();
    g.shadowColor = v.night ? 'rgba(255,184,107,0.85)' : 'rgba(251,243,226,0.95)';
    g.shadowBlur = 16;
    g.fillStyle = v.night ? 'rgba(255,214,160,0.55)' : 'rgba(251,243,226,0.8)';
    g.lineWidth = 12;
    g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle;
    chars.forEach((ch, i) => { g.strokeText(ch, COL_W / 2, top + CHAR * (i + 0.5)); });
    g.restore();
    g.fillStyle = v.night ? '#fff3dc' : '#1d1916';
    chars.forEach((ch, i) => {
      g.globalAlpha = 0.86 + ((i * 29) % 7) / 50;
      g.fillText(ch, COL_W / 2, top + CHAR * (i + 0.5));
    });
    g.globalAlpha = 1;
    v.tex.needsUpdate = true;
  }
}
