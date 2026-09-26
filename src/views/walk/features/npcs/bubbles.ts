// Little speech bubbles over the crowd's heads — a vendor's call, a child's shout, the watchman's
// 「天干物燥，小心火烛」. A small pool of sprites shared by every place (one draw each while showing);
// a bubble follows whoever said it and fades after a few seconds. `{名}` in a bubble becomes what the
// player is called (filled when drawn, never stored). And one name tag (Nameplate) over whoever the
// talk prompt is on.
import type * as T from 'three';
import { Bag, TEXT_FONT } from '../kit';
import { fillName, type NameScope } from '../../../../app/name';

export interface Speaker { x: number; y: number; z: number; top: number }

interface Slot {
  sprite: T.Sprite;
  tex: T.CanvasTexture;
  canvas: HTMLCanvasElement;
  who: Speaker | null;
  life: number;
  age: number;
}

const W = 384, H = 104;

export class Bubbles {
  private slots: Slot[] = [];
  private lastSaid = -99;
  private clock = 0;

  constructor(private bag: Bag, n = 3, private scope: NameScope = 'world') {
    const { THREE } = bag.ctx;
    for (let i = 0; i < n; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 5;
      sprite.center.set(0.5, 0);
      bag.add(sprite);
      this.slots.push({ sprite, tex, canvas, who: null, life: 0, age: 0 });
    }
    bag.frame((dt) => this.step(dt));
  }

  /** Is `who` saying something right now? */
  talking(who: Speaker): boolean {
    return this.slots.some((s) => s.who === who);
  }

  /** Seconds since the last bubble appeared (to keep the chatter sparse). */
  get quiet(): number {
    return this.clock - this.lastSaid;
  }

  /** Show `text` over `who` for `secs`. Returns false when every bubble is busy with someone nearer. */
  say(who: Speaker, text: string, secs = 3, force = false): boolean {
    let slot = this.slots.find((s) => s.who === who) ?? this.slots.find((s) => !s.who);
    if (!slot && force) slot = this.slots.reduce((a, b) => (a.age > b.age ? a : b));
    if (!slot) return false;
    this.draw(slot, fillName(text, this.bag.ctx.lang, this.scope));
    slot.who = who;
    slot.life = secs;
    slot.age = 0;
    slot.sprite.visible = true;
    this.lastSaid = this.clock;
    return true;
  }

  private draw(s: Slot, text: string) {
    const g = s.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.font = `34px ${TEXT_FONT}`;
    const tw = Math.min(W - 40, g.measureText(text).width);
    const bw = tw + 34, bh = 58, x0 = (W - bw) / 2, y0 = 6;
    g.fillStyle = 'rgba(251,245,232,0.95)';
    g.strokeStyle = 'rgba(40,32,26,0.75)';
    g.lineWidth = 3;
    const r = 18;
    g.beginPath();
    g.moveTo(x0 + r, y0);
    g.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r);
    g.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r);
    // the tail, pointing down at the speaker
    g.lineTo(W / 2 + 10, y0 + bh);
    g.lineTo(W / 2 - 2, y0 + bh + 22);
    g.lineTo(W / 2 - 8, y0 + bh);
    g.arcTo(x0, y0 + bh, x0, y0, r);
    g.arcTo(x0, y0, x0 + bw, y0, r);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#2a211b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, y0 + bh / 2 + 2, W - 40);
    s.tex.needsUpdate = true;
  }

  private step(dt: number) {
    this.clock += dt;
    const cam = this.bag.ctx.camera.position;
    for (const s of this.slots) {
      if (!s.who) continue;
      s.age += dt;
      const w = s.who;
      s.sprite.position.set(w.x, w.y + w.top + 0.12, w.z);
      // a constant size on screen, within reason
      const d = Math.max(4, Math.min(26, Math.hypot(cam.x - w.x, cam.z - w.z)));
      const k = 0.1 * d;
      s.sprite.scale.set(k * (W / H) * 0.36, k * 0.36, 1);
      const left = s.life - s.age;
      (s.sprite.material as T.SpriteMaterial).opacity = Math.min(1, s.age * 6, left / 0.4);
      if (left <= 0) { s.who = null; s.sprite.visible = false; }
    }
  }
}

const PW = 512, PH = 76;

/**
 * One name tag over whoever the talk prompt is on (one sprite shared by every place: one draw while
 * shown). Before you have met: their epithet, faint; after: their title and name in ink, with a
 * cinnabar dot. Redrawn only when the text changes.
 */
export class Nameplate {
  private sprite: T.Sprite;
  private tex: T.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private owner: string | null = null;
  private who: Speaker | null = null;
  private text = '';
  private met = false;
  private on = true;
  private fade = 0;

  constructor(private bag: Bag) {
    const { THREE } = bag.ctx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = PW; this.canvas.height = PH;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.sprite.visible = false;
    this.sprite.renderOrder = 6;
    this.sprite.center.set(0.5, 0);
    this.sprite.name = 'npc-nameplate';
    bag.add(this.sprite);
    bag.frame((dt) => this.step(dt));
  }

  /** Put the tag over `who` for `owner` (a place's crowd), reading `text`. */
  show(owner: string, who: Speaker, text: string, met: boolean): void {
    if (this.who !== who) this.fade = 0;
    this.owner = owner;
    this.who = who;
    if (text !== this.text || met !== this.met) { this.text = text; this.met = met; this.draw(); }
  }

  /** Take it down, if `owner` put it up. */
  hide(owner: string): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.who = null;
    this.sprite.visible = false;
  }

  /** Shown this frame or not (a bubble over the same head takes its place). */
  hold(owner: string, on: boolean): void {
    if (this.owner === owner) this.on = on;
  }

  /** DEV: what it reads, and over whom. */
  get state(): { text: string; met: boolean; visible: boolean } {
    return { text: this.text, met: this.met, visible: this.sprite.visible };
  }

  private draw() {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, PW, PH);
    g.font = `${this.met ? 36 : 32}px ${TEXT_FONT}`;
    const tw = Math.min(PW - 70, g.measureText(this.text).width);
    const bw = tw + (this.met ? 58 : 36), bh = 52, x0 = (PW - bw) / 2, y0 = 12, r = 10;
    g.fillStyle = this.met ? 'rgba(248,241,226,0.92)' : 'rgba(248,241,226,0.72)';
    g.strokeStyle = this.met ? 'rgba(40,32,26,0.7)' : 'rgba(40,32,26,0.35)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x0 + r, y0);
    g.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r);
    g.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r);
    g.arcTo(x0, y0 + bh, x0, y0, r);
    g.arcTo(x0, y0, x0 + bw, y0, r);
    g.closePath();
    g.fill();
    g.stroke();
    let tx = PW / 2;
    if (this.met) {
      // a small cinnabar seal before the name
      g.fillStyle = '#b93a2b';
      g.fillRect(x0 + 14, y0 + bh / 2 - 7, 14, 14);
      tx += 11;
    }
    g.fillStyle = this.met ? '#2a211b' : 'rgba(42,33,27,0.7)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.text, tx, y0 + bh / 2 + 2, PW - 70);
    this.tex.needsUpdate = true;
  }

  private step(dt: number) {
    const w = this.who;
    if (!w) return;
    this.fade = Math.min(1, this.fade + dt * 4);
    const cam = this.bag.ctx.camera.position;
    this.sprite.position.set(w.x, w.y + w.top + 0.16, w.z);
    const d = Math.max(3, Math.min(20, Math.hypot(cam.x - w.x, cam.z - w.z)));
    const k = 0.1 * d * 0.36;
    this.sprite.scale.set(k * (PW / PH), k, 1);
    (this.sprite.material as T.SpriteMaterial).opacity = this.fade;
    this.sprite.visible = this.on;
  }
}
