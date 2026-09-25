// The stagehand for 奇遇: one Stage per encounter while it is set up in the world. It owns everything
// the scene adds (a Bag), and has the small tools every scene needs: people (npc.ts figures), words
// that float up in brush, soft light, a drizzle, a borrowed night, a music override, a paper
// curtain between worlds, and the closing card that remembers the encounter and pays its coins.
import './encounters.css';
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../types';
import type { MusicTheme, XZ } from '../../map';
import type { EncounterDef } from '../../../../data/encounters';
import type { CharacterId } from '../../../../data/characters';
import { Bag, BRUSH_FONT, canvasTexture, glowTexture, loadBrush, reducedMotion } from '../kit';
import { figure, talk, type Figure, type FigureSpec } from '../minigames/npc';
import { walkableNear } from '../minigames/cat';
import { begin, end } from '../minigames/ui';
import { earn, flag, markEncounter, play } from '../../../../app/play';
import { makeRng, hashString, type Rng } from '../../../../core/rng';
import { variantFor } from './logic';

export interface Line { zh: string; en: string; choices?: { zh: string; en: string }[] }
export interface Name { zh: string; en: string }
export const L = (zh: string, en: string, choices?: { zh: string; en: string }[]): Line => ({ zh, en, choices });
export const C = (zh: string, en: string) => ({ zh, en });

/** What a scene tells the director about itself. */
export interface Scene {
  /** Where it is: the director takes it down when the walker is well away (and it has not begun). */
  x: number;
  z: number;
  r: number;
  /** Follows the walker (a falling star, the herd-boy on the road): never taken down for distance. */
  roaming?: boolean;
  /** Seconds a finished scene stays up at most (default 240; the walker walking away takes it sooner). */
  linger?: number;
}

export type SceneBuild = (s: Stage) => Scene | Promise<Scene>;

export interface FinishOpts {
  /** One more paragraph for the card (what happened, in this companion's version). */
  zh?: string;
  en?: string;
  /** Extra coins the first time this companion has their own version (default ≈ 40 % of the encounter's). */
  bonus?: number;
  seal?: string;
}

export class Stage {
  readonly bag: Bag;
  readonly group: T.Group;
  readonly rng: Rng;
  /** The walker has begun the encounter (the director keeps it while they are anywhere near). */
  engaged = false;
  finished = false;
  /** The scene gave up for now (the star fell and no wish was made): the director takes it down. */
  abandoned = false;
  private claimed = false;
  private musicHeld = false;
  private nightHeld = false;
  private rain: { stop(): void } | null = null;
  readonly still = reducedMotion();
  /** The scene's own music while the walker takes part (played from the first claim; handed back a little after the end). */
  theme: MusicTheme | null = null;

  constructor(
    readonly ctx: WorldCtx, readonly def: EncounterDef, parent: T.Object3D, readonly day: string,
    private done: (s: Stage) => void, private later: (key: string) => void = () => {},
  ) {
    this.bag = new Bag(ctx);
    this.group = this.bag.add(new ctx.THREE.Group(), parent);
    this.group.name = `qiyu:${def.id}`;
    this.rng = makeRng(hashString(`qiyu-stage:${day}:${def.id}`));
  }

  get THREE() { return this.ctx.THREE; }
  get who(): CharacterId { return this.ctx.player.character; }
  /** This companion's own version, or null. */
  get variant(): CharacterId | null { return variantFor(this.def, this.who); }
  tr(zh: string, en: string): string { return this.ctx.lang === 'zh' ? zh : en; }

  /** A point on open ground near (x, z), y on the ground (or deck). */
  spot(x: number, z: number, maxR = 5): T.Vector3 {
    const p = walkableNear(this.ctx, x, z, maxR);
    return new this.THREE.Vector3(p.x, this.ctx.groundY(p.x, p.z), p.z);
  }
  /** Ground height here. */
  y(x: number, z: number): number { return this.ctx.groundY(x, z); }
  player(): T.Vector3 { return this.ctx.player.position; }
  dist(x: number, z: number): number { const p = this.ctx.player.position; return Math.hypot(p.x - x, p.z - z); }

  /** Someone of the painting standing (or sitting) at `at`, facing `look`. */
  person(spec: FigureSpec, at: T.Vector3, look: XZ, parent: T.Object3D = this.group, solid = true): Figure {
    const f = figure(this.bag, parent, spec, at, Math.atan2(look.x - at.x, look.z - at.z));
    if (solid) this.bag.onDispose(this.ctx.addCollider({ x: at.x, z: at.z, r: 0.35, h: 1.3 }));
    return f;
  }

  /** A few lines from someone (each waits for a tap); resolves with the last choice (−1 if closed). */
  async say(fig: Figure | null, name: Name, lines: Line[]): Promise<number> {
    if (!this.alive) return -1; // the scene was taken down (or the world went) mid-story
    this.engaged = true;
    return talk(this.ctx, fig, name, lines);
  }

  /** Claim the world for the length of a scene (no mini-game starts meanwhile). False if one is running. */
  claim(): boolean {
    if (this.claimed) return true;
    if (!begin(this.ctx, 'qiyu')) return false;
    this.claimed = true;
    this.engaged = true;
    if (this.theme && !this.musicHeld && !this.finished) this.music(this.theme);
    return true;
  }
  unclaim(): void {
    if (!this.claimed) return;
    this.claimed = false;
    end(this.ctx, 'qiyu');
  }

  /** The scene's prompts that are up now (the dev hook lists them). */
  readonly prompts: Interactable[] = [];
  /** A prompt in the world (removed when the scene goes). */
  prompt(i: Interactable): () => void {
    const off = this.bag.interact(i);
    this.prompts.push(i);
    return () => { off(); const k = this.prompts.indexOf(i); if (k >= 0) this.prompts.splice(k, 1); };
  }

  /** Wait (in real time; the scene may be gone when it resolves — check `alive`). */
  wait(ms: number): Promise<void> {
    return new Promise((res) => {
      if (this.bag.disposed) { res(); return; }
      this.bag.later(this.still ? Math.min(ms, 400) : ms, res);
      this.bag.onDispose(() => res());
    });
  }
  get alive(): boolean { return !this.bag.disposed; }

  /** Every frame while the scene is up. */
  frame(fn: (dt: number, t: number) => void): void { this.bag.frame(fn); }

  // ───────────── sound and light

  /** Let the scene have its own music until it goes. */
  music(theme: MusicTheme | null): void {
    try { this.ctx.music.setTheme(theme); this.musicHeld = true; } catch { /* optional */ }
  }
  releaseMusic(): void {
    if (!this.musicHeld) return;
    this.musicHeld = false;
    try { this.ctx.music.release(); } catch { /* optional */ }
  }

  /** Borrow the night (only if it is day now); given back when the scene goes, or with night(false). */
  night(on: boolean): void {
    if (on) {
      if (this.nightHeld || this.ctx.sky.isNight()) return;
      this.nightHeld = true;
      this.ctx.sky.forceNight(true);
    } else if (this.nightHeld) {
      this.nightHeld = false;
      this.ctx.sky.forceNight(false);
    }
  }

  /** A few guqin notes (pentatonic degrees), spaced `gap` ms. */
  qin(degrees: number[], gap = 340, vel = 0.7): void {
    degrees.forEach((d, i) => this.bag.later(i * gap, () => { try { this.ctx.audio.pluck(d, vel); } catch { /* muted */ } }));
  }

  /** A soft round light (a sprite that glows, no real light — no shader recompiles). */
  glow(at: T.Vector3, color: string, size: number, opacity = 0.8, parent: T.Object3D = this.group): T.Sprite {
    const { THREE } = this;
    const tex = this.bag.own(glowTexture(THREE, 64, 0.1));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.position.copy(at);
    s.scale.setScalar(size);
    this.bag.add(s, parent);
    return s;
  }

  /** A warm pool of lamplight on the ground (a flat additive disc). */
  pool(at: T.Vector3, color = '#ffb86b', r = 3, opacity = 0.35): T.Mesh {
    const { THREE } = this;
    const tex = this.bag.own(glowTexture(THREE, 64, 0.05));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, at.y + 0.05, at.z);
    m.renderOrder = 2;
    this.bag.add(m, this.group);
    return m;
  }

  /** Words brushed into the air: they rise a little and fade. Returns the sprite. */
  words(text: string, at: T.Vector3, o: { color?: string; size?: number; life?: number; rise?: number; vertical?: boolean; stay?: boolean } = {}): T.Sprite {
    const { THREE } = this;
    const chars = [...text];
    const vertical = o.vertical ?? false;
    const cell = 72;
    const w = vertical ? cell + 16 : cell * chars.length + 16;
    const h = vertical ? cell * chars.length + 16 : cell + 16;
    const paint = (g: CanvasRenderingContext2D) => {
      g.clearRect(0, 0, w, h);
      g.font = `${cell * 0.86}px ${BRUSH_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255,244,220,0.9)';
      g.shadowBlur = 10;
      g.fillStyle = o.color ?? '#1d1916';
      chars.forEach((c, i) => {
        const x = vertical ? w / 2 : 8 + cell * (i + 0.5);
        const y = vertical ? 8 + cell * (i + 0.5) : h / 2 + 2;
        g.fillText(c, x, y);
      });
    };
    const tex = canvasTexture(THREE, w, h, paint);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    // brushed, not in a fallback face: if the brush font is still on its way, paint again when it lands
    let ready = true;
    try { ready = !document.fonts || document.fonts.check('64px "Ma Shan Zheng"', text); } catch { /* assume it is */ }
    if (!ready) {
      void loadBrush(text).then(() => {
        if (!this.alive || !s.parent) return;
        const g = (tex.image as HTMLCanvasElement).getContext('2d');
        if (g) { paint(g); tex.needsUpdate = true; }
      });
    }
    const size = o.size ?? 0.34;
    s.scale.set((w / cell) * size, (h / cell) * size, 1);
    s.position.copy(at);
    s.renderOrder = 5;
    this.bag.add(s, this.group);
    if (o.stay) return s;
    const life = o.life ?? 3.2, rise = o.rise ?? 0.8;
    const y0 = at.y;
    let age = 0;
    let off: (() => void) | null = this.ctx.onFrame((dt) => {
      age += dt;
      const k = Math.min(1, age / life);
      s.position.y = y0 + (this.still ? 0 : rise * (1 - Math.pow(1 - k, 2)));
      mat.opacity = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      if (k >= 1) { off?.(); off = null; this.bag.drop(s); }
    });
    this.bag.onDispose(() => { off?.(); off = null; });
    return s;
  }

  /** A soft drizzle round the walker (ink streaks), with the rain bed; returns a stopper. */
  drizzle(n = 240): { stop(): void } {
    if (this.rain) return this.rain;
    const { THREE, ctx } = this;
    const pos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#5d564c', transparent: true, opacity: 0, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    this.bag.add(lines, ctx.scene);
    const rng = makeRng(hashString(`rain:${this.def.id}`));
    const B = 11, H = 9, len = 0.42, slant = 0.12;
    const drops = new Float32Array(n * 3);
    const p0 = ctx.player.position;
    for (let i = 0; i < n; i++) { drops[i * 3] = p0.x + (rng() - 0.5) * 2 * B; drops[i * 3 + 1] = p0.y + rng() * H; drops[i * 3 + 2] = p0.z + (rng() - 0.5) * 2 * B; }
    let target = 0.42, alpha = 0;
    let prev: string | null = null;
    try { prev = ctx.audio.stats().ambient; if (prev === 'none') ctx.audio.setAmbient('rain'); } catch { /* muted */ }
    const still = this.still;
    this.bag.frame((dt) => {
      alpha += (target - alpha) * Math.min(1, dt * 1.5);
      mat.opacity = alpha;
      lines.visible = alpha > 0.01;
      if (!lines.visible) return;
      const p = ctx.player.position;
      const fall = still ? 0 : 9 * dt;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        let x = drops[j], y = drops[j + 1], z = drops[j + 2];
        y -= fall;
        x -= fall * slant;
        if (y < p.y - 1 || Math.abs(x - p.x) > B || Math.abs(z - p.z) > B) {
          x = p.x + (rng() - 0.5) * 2 * B; z = p.z + (rng() - 0.5) * 2 * B; y = p.y + H * (0.6 + rng() * 0.4);
        }
        drops[j] = x; drops[j + 1] = y; drops[j + 2] = z;
        const k = i * 6;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        pos[k + 3] = x + len * slant; pos[k + 4] = y + len; pos[k + 5] = z;
      }
      geo.attributes.position.needsUpdate = true;
    });
    const stopBed = () => { try { if (prev === 'none') ctx.audio.setAmbient('none'); } catch { /* muted */ } prev = null; };
    this.bag.onDispose(stopBed);
    this.rain = { stop: () => { target = 0; stopBed(); } };
    return this.rain;
  }

  /** A paper curtain: fade to paper (with a line of text), do `mid`, fade back. */
  async curtain(zh: string, en: string, mid: () => void | Promise<void>, hold = 1400): Promise<void> {
    const el = document.createElement('div');
    el.className = 'qy-curtain';
    const p = document.createElement('p');
    p.textContent = this.tr(zh, en);
    el.appendChild(p);
    const off = this.ctx.hud.mount(el);
    this.bag.onDispose(off);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    await this.wait(950);
    await mid();
    await this.wait(hold);
    el.classList.remove('is-on');
    await this.wait(950);
    off();
  }

  /** A golden haze at the edges of the view (a dream); returns a remover. */
  haze(): () => void {
    const el = document.createElement('div');
    el.className = 'qy-dream';
    const off = this.ctx.hud.mount(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      el.classList.remove('is-on');
      setTimeout(off, 1700);
    };
    this.bag.onDispose(() => { gone = true; off(); });
    return remove;
  }

  abandon(): void { this.abandoned = true; }

  private doneFns: (() => void)[] = [];
  /** Run when the encounter is complete (e.g. take down the prompt of someone who has vanished). */
  whenDone(fn: () => void): void { this.doneFns.push(fn); }

  /** Something that will come of this on another day (see later.ts), e.g. 'fox'. */
  put(key: string): void { this.later(key); }

  // ───────────── the end

  /**
   * The encounter is complete: remember it (the 奇遇录), pay its coins the first time, a bonus the
   * first time this companion has their own version, and show the closing card with its note.
   */
  finish(o: FinishOpts = {}): void {
    if (this.finished || !this.alive) return;
    this.finished = true;
    this.unclaim();
    const d = this.def;
    const first = markEncounter(d.id, d.coins);
    let paid = first ? d.coins : 0;
    const v = this.variant;
    const vKey = v ? `qyv:${d.id}:${v}` : '';
    if (v && !play.value.flags[vKey]) {
      flag(vKey);
      const b = Math.max(0, Math.round(o.bonus ?? d.coins * 0.4));
      if (b) { earn(b); paid += b; }
    }
    const coinsZh = paid ? `\n\n得钱 ${paid} 文` : '';
    const coinsEn = paid ? `\n\n+${paid} coins` : '';
    const extraZh = o.zh ? `\n\n${o.zh}` : '';
    const extraEn = o.en ? `\n\n${o.en}` : '';
    this.ctx.hud.showCard({
      titleZh: `奇遇 · ${d.zh}`,
      titleEn: `Encounter · ${d.en}`,
      bodyZh: `${d.noteZh}${extraZh}${coinsZh}`,
      bodyEn: `${d.noteEn}${extraEn}${coinsEn}`,
      seal: o.seal ?? '奇',
    });
    // the scene's music lingers a little, then the place has its own back
    if (this.musicHeld) this.bag.later(9000, () => this.releaseMusic());
    for (const fn of this.doneFns.splice(0)) fn();
    this.done(this);
  }

  dispose(): void {
    this.unclaim();
    this.releaseMusic();
    this.night(false);
    this.rain?.stop();
    this.bag.dispose();
  }
}
