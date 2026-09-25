// Little effects for the homestead's animals and people: rouge hearts when stroked, puffs of earth
// or spray, coins that pop out of a hole, and paper speech bubbles ("汪！", the parrot's line). A
// small fixed pool of sprites, reused; nothing is allocated per frame.
import type * as T from 'three';
import type { Bag } from '../../kit';
import { canvasTexture, glowTexture, reducedMotion, TEXT_FONT } from '../../kit';

type Kind = 'heart' | 'puff' | 'coin' | 'note' | 'z';

interface Particle { s: T.Sprite; m: T.SpriteMaterial; kind: Kind; t: number; life: number; vx: number; vy: number; vz: number; size: number }

export class Fx {
  private pool: Particle[] = [];
  private tex: Record<Kind, T.Texture>;
  private still = reducedMotion();
  private seq = 0;

  constructor(bag: Bag, parent: T.Object3D, size = 14) {
    const { THREE } = bag.ctx;
    const heart = canvasTexture(THREE, 64, 64, (g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(32, 56);
      g.bezierCurveTo(4, 36, 6, 10, 22, 10);
      g.bezierCurveTo(28, 10, 32, 15, 32, 20);
      g.bezierCurveTo(32, 15, 36, 10, 42, 10);
      g.bezierCurveTo(58, 10, 60, 36, 32, 56);
      g.fill();
    });
    const coin = canvasTexture(THREE, 64, 64, (g) => {
      const gr = g.createRadialGradient(24, 22, 2, 32, 32, 28);
      gr.addColorStop(0, '#f3d98f'); gr.addColorStop(0.6, '#c9973f'); gr.addColorStop(1, '#8a6326');
      g.fillStyle = gr;
      g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(90,60,20,0.7)'; g.lineWidth = 3; g.stroke();
      g.clearRect(25, 25, 14, 14);
      g.strokeRect(25, 25, 14, 14);
    });
    const note = canvasTexture(THREE, 64, 64, (g) => {
      g.fillStyle = '#ffffff';
      g.font = `48px ${TEXT_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('♪', 32, 34);
    });
    const z = canvasTexture(THREE, 64, 64, (g) => {
      g.fillStyle = '#ffffff';
      g.font = `bold 44px ${TEXT_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('z', 32, 34);
    });
    const puff = glowTexture(THREE, 64, 0.35);
    this.tex = { heart, puff, coin, note, z };
    for (const t of Object.values(this.tex)) bag.own(t);
    for (let i = 0; i < size; i++) {
      const m = new THREE.SpriteMaterial({ map: heart, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      bag.add(s, parent);
      this.pool.push({ s, m, kind: 'heart', t: 0, life: 0, vx: 0, vy: 0, vz: 0, size: 0.1 });
    }
  }

  private take(): Particle {
    // the oldest (or a free) one
    let best = this.pool[0];
    for (const p of this.pool) {
      if (!p.s.visible) return p;
      if (p.t / p.life > best.t / best.life) best = p;
    }
    return best;
  }

  private emit(kind: Kind, x: number, y: number, z: number, color: string, size: number, life: number, vx: number, vy: number, vz: number): void {
    const p = this.take();
    p.kind = kind;
    p.m.map = this.tex[kind];
    p.m.color.set(color);
    p.m.opacity = 0;
    p.m.needsUpdate = true;
    p.s.position.set(x, y, z);
    p.s.scale.setScalar(size);
    p.s.visible = true;
    p.t = 0; p.life = life; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size;
  }

  private jit(k: number): number {
    // a cheap deterministic wobble (looks, not logic)
    this.seq = (this.seq * 1103515245 + 12345) & 0x7fffffff;
    return ((this.seq / 0x7fffffff) - 0.5) * k;
  }

  hearts(x: number, y: number, z: number, n = 3): void {
    for (let i = 0; i < n; i++) this.emit('heart', x + this.jit(0.25), y + i * 0.08, z + this.jit(0.25), i % 2 ? '#d9575a' : '#c8454a', 0.13 + this.jit(0.04), 1.3 + i * 0.2, this.jit(0.2), 0.45, this.jit(0.2));
  }

  puff(x: number, y: number, z: number, color = '#a88a62', n = 6, up = 0.6): void {
    for (let i = 0; i < n; i++) this.emit('puff', x + this.jit(0.2), y + 0.05, z + this.jit(0.2), color, 0.18 + this.jit(0.08), 0.8 + this.jit(0.3), this.jit(1.2), up + this.jit(0.4), this.jit(1.2));
  }

  /** A slow curl of chimney smoke. */
  smoke(x: number, y: number, z: number): void {
    this.emit('puff', x + this.jit(0.1), y, z + this.jit(0.1), '#d8cfc2', 0.22, 3.2, 0.12 + this.jit(0.1), 0.5, this.jit(0.1));
  }

  coins(x: number, y: number, z: number, n = 5): void {
    for (let i = 0; i < n; i++) this.emit('coin', x + this.jit(0.2), y + 0.1, z + this.jit(0.2), '#ffffff', 0.12, 1.4, this.jit(1.1), 2.2 + this.jit(0.8), this.jit(1.1));
  }

  notes(x: number, y: number, z: number, n = 1, color = '#2f3a44'): void {
    for (let i = 0; i < n; i++) this.emit('note', x + this.jit(0.3), y, z + this.jit(0.3), color, 0.15, 1.8, this.jit(0.3), 0.35, this.jit(0.3));
  }

  zzz(x: number, y: number, z: number): void {
    this.emit('z', x, y, z, '#4a4a58', 0.1, 2.2, 0.08, 0.22, 0.02);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.s.visible = false; continue; }
      const grav = p.kind === 'coin' ? 5 : p.kind === 'puff' && p.life < 3 ? -0.3 : 0;
      p.vy -= grav * dt;
      if (!this.still || p.kind !== 'puff') {
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        p.s.position.z += p.vz * dt;
      }
      if (p.kind === 'puff' && p.life < 3) { p.vx *= 0.94; p.vz *= 0.94; }
      const fadeIn = Math.min(1, p.t * 8);
      p.m.opacity = fadeIn * (1 - k * k) * (p.kind === 'puff' ? 0.55 : 0.95);
      const grow = p.kind === 'puff' ? 1 + k * 1.4 : p.kind === 'heart' ? 1 + Math.sin(k * Math.PI) * 0.3 : 1;
      p.s.scale.setScalar(p.size * grow);
    }
  }
}

// ───────────────────────────── speech bubbles ─────────────────────────────

/** A paper speech bubble over someone (a sprite, redrawn only when the words change). */
export class Bubble {
  readonly sprite: T.Sprite;
  private g: CanvasRenderingContext2D;
  private tex: T.CanvasTexture;
  private text = '';
  private left = 0;
  private follow: T.Object3D | null = null;
  private lift = 0.5;

  constructor(bag: Bag, parent: T.Object3D) {
    const { THREE } = bag.ctx;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    this.g = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false });
    this.sprite = new THREE.Sprite(m);
    this.sprite.renderOrder = 5;
    this.sprite.center.set(0.5, 0);
    this.sprite.visible = false;
    bag.add(this.sprite, parent);
  }

  /** Say `text` over `obj` (its world position plus `lift` m) for `ms`. */
  say(text: string, obj: T.Object3D, lift: number, ms = 2600): void {
    this.follow = obj;
    this.lift = lift;
    this.left = ms / 1000;
    if (text !== this.text) this.draw(text);
    this.sprite.visible = true;
  }

  get busy(): boolean { return this.left > 0; }

  hide(): void { this.left = 0; this.sprite.visible = false; }

  private draw(text: string): void {
    this.text = text;
    const g = this.g;
    const W = 512, H = 128;
    g.clearRect(0, 0, W, H);
    g.font = `44px ${TEXT_FONT}`;
    const tw = Math.min(W - 40, g.measureText(text).width);
    const bw = tw + 44, bh = 74, x0 = (W - bw) / 2, y0 = 8;
    g.fillStyle = 'rgba(247,241,229,0.96)';
    g.strokeStyle = 'rgba(33,29,26,0.7)';
    g.lineWidth = 3;
    g.beginPath();
    const r = 26;
    g.moveTo(x0 + r, y0);
    g.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r);
    g.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r);
    g.lineTo(W / 2 + 12, y0 + bh);
    g.lineTo(W / 2, y0 + bh + 26);
    g.lineTo(W / 2 - 4, y0 + bh);
    g.arcTo(x0, y0 + bh, x0, y0, r);
    g.arcTo(x0, y0, x0 + bw, y0, r);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#211d1a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, y0 + bh / 2 + 2, W - 60);
    this.tex.needsUpdate = true;
    // keep the letters the same size whatever the length: the sprite is as wide as the canvas
    this.sprite.scale.set(1.6, 0.4, 1);
  }

  update(dt: number, pos: T.Vector3): void {
    if (!this.sprite.visible) return;
    this.left -= dt;
    if (this.left <= 0 || !this.follow) { this.sprite.visible = false; return; }
    this.follow.getWorldPosition(pos);
    this.sprite.position.set(pos.x, pos.y + this.lift, pos.z);
    (this.sprite.material as T.SpriteMaterial).opacity = Math.min(1, this.left * 3);
  }
}
