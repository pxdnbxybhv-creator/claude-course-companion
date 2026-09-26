// 桃源 · the stagehand and the cast. StoryStage is the encounters' Stagehand (a Bag, the claim, lines,
// waits, words in the air) with the valley's own helpers: lines spoken by villagers or by the walker's
// companion, camera moves, props. The Cast gives the thirteen villagers (folk.ts) their bodies: one
// persistent figure each, standing where the story (text.ts STAGING) or their day's routine puts them,
// walking there when you might see it, each with a talk prompt that moves with them and a speech mark
// while they have something to say.
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../types';
import type { CharacterId } from '../../../../data/characters';
import { CHARACTER } from '../../../../data/characters';
import { play } from '../../../../app/play';
import { Bag, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { figure, speechMark, talk, type Figure, type FigureSpec } from '../minigames/npc';
import { Stagehand } from '../encounters/stage';
import { G, L, W, Y_T, standAt, waterAt, walkAt } from './places';
import { engine } from './engine';
import type { TaoyuanWorld } from './world';
import type { VillagerHandle, VillagerKey } from './hooks';
import { VILLAGERS, VILLAGER_KEYS, labelOf, metFlag, nameOf, talkKey, type Prop, type Spot } from './folk';
import type { Line, SLine, Variants } from './text';

type XYZ = { x: number; y: number; z: number };

/** World point of a valley-local spot (y on what one stands on there, or on the water). */
export function worldAt(x: number, z: number): XYZ {
  const w = W(x, z);
  const wy = waterAt(x, z);
  return { x: w.x, y: Y_T + (wy !== null && !walkAt(x, z) ? wy : standAt(x, z)), z: w.z };
}

/** A walkable spot near (x, z) (local), searching outward; the spot itself if nothing better. */
export function snap(x: number, z: number): { x: number; z: number } {
  if (walkAt(x, z)) return { x, z };
  for (let r = 0.3; r < 4; r += 0.3) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (walkAt(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

// ───────────────────────────── the stage

export class StoryStage extends Stagehand {
  constructor(ctx: WorldCtx, parent: T.Object3D, readonly tv: TaoyuanWorld, readonly cast: Cast) {
    super(ctx, parent, 'taoyuan:story', 'taoyuan-story', 'taoyuan');
  }

  /** A companion's name (as a speaker). */
  companionName(who: CharacterId = this.who): Line {
    const c = CHARACTER[who];
    return { zh: c?.zh ?? '', en: c?.en ?? '' };
  }

  /** One line from someone (a villager, the companion, or no one); resolves with the choice (−1: closed). */
  async line(l: SLine, who: CharacterId = this.who): Promise<number> {
    if (!this.alive) return -1;
    this.engaged = true;
    if (l.by === 'narr') return this.ctx.hud.say({ nameZh: '', nameEn: '', zh: l.zh, en: l.en, choices: l.choices });
    if (l.by === 'me') {
      const n = this.companionName(who);
      return this.ctx.hud.say({ nameZh: n.zh, nameEn: n.en, zh: l.zh, en: l.en, choices: l.choices });
    }
    const k = l.by;
    const met = !!play.peek().flags[metFlag(k)];
    const n = nameOf(k, met);
    return talk(this.ctx, this.cast.fig(k), n, [l]);
  }

  /** Lines in a row; resolves with the last choice (−1 if closed or the world went). */
  async lines(ls: readonly SLine[] | undefined, who: CharacterId = this.who): Promise<number> {
    let last = -1;
    for (const l of ls ?? []) {
      if (!this.alive) return -1;
      last = await this.line(l, who);
    }
    return last;
  }

  /** This companion's variant lines of a beat (none for the rest). */
  async variant(v: Variants, who: CharacterId): Promise<void> {
    const ls = v[who];
    if (ls) await this.lines(ls, who);
  }

  /** The camera to `to`, looking at `look`, for a while (not awaited: a newer move ends it). */
  shot(to: XYZ, look: XYZ, secs = 1.2, hold = 30): Promise<void> {
    return engine(this.ctx).cinematic({ to, look, secs: this.still ? 0.01 : secs, hold });
  }
  /** Look at a villager from a little in front of them and above. */
  shotOn(k: VillagerKey, secs = 1.2, hold = 30, d = 3.4): Promise<void> {
    const f = this.cast.fig(k);
    if (!f) return Promise.resolve();
    const r = f.root.position;
    const p = this.ctx.player.position;
    // from the walker's side of them, a little to one side
    let dx = p.x - r.x, dz = p.z - r.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const to = { x: r.x + dx * d - dz * 1.1, y: r.y + 1.7, z: r.z + dz * d + dx * 1.1 };
    return this.shot(to, { x: r.x, y: r.y + f.height * 0.8, z: r.z }, secs, hold);
  }
  endShot(): void { engine(this.ctx).endCinematic(); }

  /** Hold the walker still (for camera work); undone by free() or when the stage goes. */
  hold(on: boolean): void {
    try { this.ctx.player.freeze(on); } catch { /* the world went */ }
  }
}

// ───────────────────────────── props

const WOOD = '#8a6b4a', WOOD_L = '#b8946a', STRAW = '#c9a86a';

/** A villager's hand prop (one mesh, no outline), in the right hand's local space. */
function propMesh(ctx: WorldCtx, kind: Prop): T.Object3D | null {
  const TH = ctx.THREE;
  const P: T.BufferGeometry[] = [];
  switch (kind) {
    case 'staff': case 'cane':
      P.push(part(TH, new TH.CylinderGeometry(0.018, 0.022, kind === 'staff' ? 1.35 : 0.95, 6), kind === 'staff' ? '#6e5236' : WOOD, { p: [0, kind === 'staff' ? -0.2 : -0.1, 0.02] }));
      if (kind === 'staff') P.push(part(TH, new TH.SphereGeometry(0.035, 6, 5), '#5a4028', { p: [0, 0.47, 0.02] }));
      break;
    case 'ladle':
      P.push(part(TH, new TH.CylinderGeometry(0.012, 0.012, 0.42, 5), WOOD_L, { p: [0, -0.05, 0.05], r: [0.5, 0, 0] }));
      P.push(part(TH, new TH.SphereGeometry(0.06, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), WOOD, { p: [0, -0.24, 0.16] }));
      break;
    case 'basket':
      P.push(part(TH, new TH.CylinderGeometry(0.16, 0.11, 0.14, 10, 1, true), STRAW, { p: [0, -0.12, 0.08] }));
      P.push(part(TH, new TH.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#6f9a4a', { p: [0, -0.07, 0.08], s: [1, 0.4, 1] }));
      P.push(part(TH, new TH.TorusGeometry(0.12, 0.01, 4, 10, Math.PI), STRAW, { p: [0, -0.06, 0.08] }));
      break;
    case 'shuttle':
      P.push(part(TH, new TH.BoxGeometry(0.04, 0.03, 0.2), WOOD_L, { p: [0, -0.02, 0.06] }));
      break;
    case 'firewood':
      for (let i = 0; i < 4; i++) P.push(part(TH, new TH.CylinderGeometry(0.025, 0.025, 0.6, 5), i % 2 ? '#7a5a3a' : '#8e6c48', { p: [-0.04 + (i % 2) * 0.05, 0.02, -0.02 + i * 0.03], r: [0, 0, Math.PI / 2 + (i - 1.5) * 0.08] }));
      break;
    case 'gourd':
      P.push(part(TH, new TH.SphereGeometry(0.07, 8, 6), '#c9a24e', { p: [0, -0.12, 0.05] }));
      P.push(part(TH, new TH.SphereGeometry(0.045, 8, 6), '#c9a24e', { p: [0, -0.02, 0.05] }));
      P.push(part(TH, new TH.TorusGeometry(0.03, 0.006, 4, 8), '#8a2f24', { p: [0, 0.02, 0.05], r: [Math.PI / 2, 0, 0] }));
      break;
    case 'switch':
      P.push(part(TH, new TH.CylinderGeometry(0.007, 0.01, 0.8, 4), '#7e9a52', { p: [0, 0.1, 0.1], r: [0.8, 0, 0] }));
      break;
    case 'zither':
      P.push(part(TH, new TH.BoxGeometry(0.9, 0.05, 0.2), '#4a3526', { p: [0.3, 0.05, 0.22], r: [0, 0.3, 0] }));
      break;
    case 'plane':
      P.push(part(TH, new TH.BoxGeometry(0.07, 0.06, 0.22), WOOD_L, { p: [0, -0.05, 0.08] }));
      P.push(part(TH, new TH.BoxGeometry(0.02, 0.05, 0.03), WOOD, { p: [0, 0.0, 0.02] }));
      break;
    case 'hoe':
      P.push(part(TH, new TH.CylinderGeometry(0.014, 0.016, 1.1, 5), WOOD_L, { p: [0, 0.05, 0.03] }));
      P.push(part(TH, new TH.BoxGeometry(0.12, 0.02, 0.1), '#5f6a6e', { p: [0, 0.58, 0.08] }));
      break;
    case 'sprig':
      P.push(part(TH, new TH.CylinderGeometry(0.006, 0.008, 0.3, 4), '#5a3a2a', { p: [0, 0.02, 0.05] }));
      for (let i = 0; i < 4; i++) P.push(part(TH, new TH.IcosahedronGeometry(0.03, 0), i % 2 ? '#f7a8b8' : '#fbe3ea', { p: [Math.sin(i * 2) * 0.03, 0.08 + i * 0.04, 0.05 + Math.cos(i * 2) * 0.03] }));
      break;
    case 'kite':
      return null; // flown on a string (see the kite below)
  }
  return inked(ctx, merge(TH, P), { width: 0 });
}

// ───────────────────────────── the cast

interface Member {
  key: VillagerKey;
  fig: Figure;
  prop: T.Object3D | null;
  sit: boolean;
  mark: { set(on: boolean): void };
  /** Where they are (local) and where they are going. */
  at: { x: number; z: number };
  face: { x: number; z: number } | null;
  target: Spot | null;
  walk: { to: { x: number; z: number }; speed: number; done: (arrived: boolean) => void } | null;
  /** The story moves them itself for now (their routine waits). */
  scripted: boolean;
  /** Walking out of the valley (B6): hidden on arrival, whatever the routine says meanwhile. */
  leaving: boolean;
  shown: boolean;
  prompt: Interactable;
  promptOff: (() => void) | null;
  hulls: T.Object3D[];
  /** 夭夭: her own see-through materials. */
  ghostMats?: T.Material[];
}

export interface CastOpts {
  /** What talking to them does (the story's chat, the case's testimony…). */
  onTalk(k: VillagerKey): void | Promise<void>;
  /** A prompt of the story's own on this villager for now (「随行」…): its labels, or null for the chat. */
  promptFor(k: VillagerKey): { label: Line; action: Line; act(): void | Promise<void> } | null;
  /** Their mark shows (they have something to say). */
  marked(k: VillagerKey): boolean;
}

/** The thirteen, bodied (built once the valley is). */
export class Cast {
  private members = new Map<VillagerKey, Member>();
  private kite: { obj: T.Object3D; line: T.Line; pos: Float32Array } | null = null;
  readonly still = reducedMotion();
  private offFrame: (() => void) | null = null;
  private ghostFade: { dissolved: boolean; near: boolean; puff: number } = { dissolved: false, near: false, puff: 0 };

  constructor(readonly bag: Bag, readonly ctx: WorldCtx, readonly tv: TaoyuanWorld, private opts: CastOpts) {}

  get built(): boolean { return this.members.size > 0; }

  /** Give them bodies (once), at their spots. */
  build(spots: (k: VillagerKey) => Spot | null): void {
    if (this.built) return;
    for (const k of VILLAGER_KEYS) this.make(k, spots(k));
    this.buildKite();
    this.offFrame = this.ctx.onFrame((dt, t) => this.frame(dt, t));
    this.bag.onDispose(() => { this.offFrame?.(); this.offFrame = null; });
  }

  fig(k: VillagerKey): Figure | null { return this.members.get(k)?.fig ?? null; }
  isShown(k: VillagerKey): boolean { return !!this.members.get(k)?.shown; }

  private spec(k: VillagerKey, sit: boolean): FigureSpec {
    return { ...VILLAGERS[k].look, sit: VILLAGERS[k].look.sit || sit };
  }

  private make(k: VillagerKey, spot: Spot | null): Member {
    const ctx = this.ctx;
    const TH = ctx.THREE;
    const s = spot ? snap(spot.x, spot.z) : { x: 0, z: 0 };
    const sit = !!spot?.sit;
    const w = worldAt(s.x, s.z);
    const face = spot?.face ?? null;
    const heading = face ? Math.atan2(face.x - s.x, face.z - s.z) : 0;
    const parent = ctx.regionGroup('taoyuan');
    const fig = figure(this.bag, parent, this.spec(k, sit), new TH.Vector3(w.x, w.y, w.z), heading);
    fig.root.name = `ty.${k}`;
    const prop = propMesh(ctx, VILLAGERS[k].prop);
    if (prop) { prop.position.copy(fig.hand).add(new TH.Vector3(0, -0.04, 0.06)); fig.armR.add(prop); }
    const mark = speechMark(this.bag, fig, VILLAGERS[k].mark);
    const old = this.members.get(k);
    const m: Member = old ?? {
      key: k, fig, prop, sit, mark, at: s, face, target: spot, walk: null, scripted: false, leaving: false, shown: !!spot, hulls: [],
      prompt: {
        id: `ty.${k}`, position: new TH.Vector3(w.x, w.y, w.z), radius: 2.2, labelZh: '', labelEn: '', actionZh: '搭话', actionEn: 'Talk',
        act: () => this.act(k),
      },
      promptOff: null,
    };
    Object.assign(m, { fig, prop, sit, mark });
    m.hulls = [];
    fig.root.traverse((o) => { if (o.name === 'outline') m.hulls.push(o); });
    fig.root.visible = m.shown;
    if (VILLAGERS[k].ghost) this.ghostify(m);
    this.members.set(k, m);
    return m;
  }

  /** 夭夭: see-through (her own copies of the materials), no outlines. */
  private ghostify(m: Member): void {
    const mats: T.Material[] = [];
    m.fig.root.traverse((o) => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      if (o.name === 'outline') { o.visible = false; return; }
      const src = mesh.material as T.Material;
      const c = src.clone();
      c.transparent = true;
      c.opacity = 0.75;
      c.depthWrite = false;
      mesh.material = c;
      mats.push(c);
    });
    m.ghostMats = mats;
    this.bag.onDispose(() => { for (const c of mats) c.dispose(); });
    m.hulls = [];
  }

  /** Rebuild someone seated ↔ standing (the figure is built one way or the other). */
  private reseat(m: Member, sit: boolean): void {
    if (m.sit === sit) return;
    const { x, z } = m.at;
    const heading = m.fig.root.rotation.y;
    m.fig.dispose();
    for (const c of m.ghostMats ?? []) c.dispose();
    m.ghostMats = undefined;
    const f = this.make(m.key, { x, z, sit, face: m.face ?? undefined });
    f.fig.root.rotation.y = heading;
  }

  /** The kite over 小满 on the terrace (a paper diamond on a string). */
  private buildKite(): void {
    const TH = this.ctx.THREE;
    const g = merge(TH, [
      part(TH, new TH.ConeGeometry(0.32, 0.9, 4, 1), '#f4efe4', { r: [0, Math.PI / 4, 0], s: [1, 1, 0.08] }),
      part(TH, new TH.BoxGeometry(0.05, 0.6, 0.02), '#d8583a', { p: [0, -0.7, 0] }),
    ]);
    const obj = inked(this.ctx, g, { width: 0 });
    obj.name = 'ty.kite';
    const pos = new Float32Array(6);
    const lg = new TH.BufferGeometry();
    lg.setAttribute('position', new TH.BufferAttribute(pos, 3));
    const line = new TH.Line(lg, new TH.LineBasicMaterial({ color: '#3a332c', transparent: true, opacity: 0.55 }));
    line.frustumCulled = false;
    const parent = this.ctx.regionGroup('taoyuan');
    this.bag.add(obj, parent);
    this.bag.add(line, parent);
    this.kite = { obj, line, pos };
  }
  private kiteFlying = true;
  /** 小满 drops the string (B2): the kite drifts off. */
  dropKite(): void { this.kiteFlying = false; }

  /** Where someone should be now (null: not about). Walks there when it might be seen, else is there. */
  setSpot(k: VillagerKey, spot: Spot | null, o: { instant?: boolean } = {}): void {
    const m = this.members.get(k);
    if (!m) return;
    const same = spot && m.target ? spot.x === m.target.x && spot.z === m.target.z && !!spot.sit === !!m.target.sit : spot === m.target;
    m.target = spot;
    if (m.scripted || m.leaving) return;
    // (nothing changed: leave them be — unless they should be seen and are not)
    if (same && !o.instant && m.shown === !!spot) return;
    this.apply(m, !!o.instant);
  }
  /** Walk someone out of the valley (toward the mouth), and away. */
  leave(k: VillagerKey, x: number, z: number): void {
    const m = this.members.get(k);
    if (!m || !m.shown) return;
    m.leaving = true;
    m.scripted = false;
    void this.walkTo(k, x, z, 1.3).then(() => { m.leaving = false; this.hide(k); });
  }

  private apply(m: Member, instant: boolean): void {
    const spot = m.target;
    if (!spot) {
      m.walk?.done(false);
      m.walk = null;
      m.shown = false;
      m.fig.root.visible = false;
      return;
    }
    const s = snap(spot.x, spot.z);
    const d = Math.hypot(s.x - m.at.x, s.z - m.at.z);
    const p = L(this.ctx.player.position.x, this.ctx.player.position.z);
    const seen = this.tv.isInside() && m.shown && (Math.hypot(p.x - m.at.x, p.z - m.at.z) < 24 || Math.hypot(p.x - s.x, p.z - s.z) < 24);
    const wantSit = !!spot.sit || !!VILLAGERS[m.key].look.sit;
    if (!instant && seen && d > 0.2 && d < 26 && !wantSit && !m.sit) {
      // walk there (straight: the valley's lanes are open)
      void this.walkTo(m.key, s.x, s.z, 1.35).then((ok) => { if (ok) this.settle(m, spot); });
      return;
    }
    m.walk?.done(false);
    m.walk = null;
    m.at = { x: s.x, z: s.z };
    m.face = spot.face ?? null;
    this.reseat(m, wantSit);
    this.put(m);
    m.shown = true;
    m.fig.root.visible = true;
    if (spot.face) m.fig.root.rotation.y = Math.atan2(spot.face.x - s.x, spot.face.z - s.z);
    m.fig.faceTo = null;
  }
  private settle(m: Member, spot: Spot): void {
    m.face = spot.face ?? null;
    if (spot.face) m.fig.faceTo = W(spot.face.x, spot.face.z);
    if (spot.sit && !m.sit) this.reseat(m, true);
  }
  private put(m: Member): void {
    const w = worldAt(m.at.x, m.at.z);
    m.fig.root.position.set(w.x, w.y, w.z);
  }

  /** The story takes someone over (true) — their routine waits — or gives them back (false). */
  script(k: VillagerKey, on: boolean): void {
    const m = this.members.get(k);
    if (!m || m.leaving) return;
    const was = m.scripted;
    m.scripted = on;
    if (!on && was) this.apply(m, false);
  }

  /** Put someone somewhere now (local), shown, facing a point (local). */
  stand(k: VillagerKey, x: number, z: number, face?: { x: number; z: number }, sit = false): void {
    const m = this.members.get(k);
    if (!m) return;
    m.walk?.done(false);
    m.walk = null;
    const s = snap(x, z);
    m.at = s;
    m.face = face ?? null;
    this.reseat(m, sit || !!VILLAGERS[k].look.sit);
    this.put(m);
    m.shown = true;
    m.fig.root.visible = true;
    if (face) m.fig.root.rotation.y = Math.atan2(face.x - s.x, face.z - s.z);
    m.fig.faceTo = null;
  }
  hide(k: VillagerKey): void {
    const m = this.members.get(k);
    if (!m) return;
    m.walk?.done(false);
    m.walk = null;
    m.shown = false;
    m.fig.root.visible = false;
  }
  /** Face someone toward the walker (or a local point). */
  face(k: VillagerKey, to?: { x: number; z: number }): void {
    const m = this.members.get(k);
    if (!m) return;
    m.fig.faceTo = to ? W(to.x, to.z) : { x: this.ctx.player.position.x, z: this.ctx.player.position.z };
  }

  /** Walk someone to (x, z) local; resolves true on arrival, false if interrupted. */
  walkTo(k: VillagerKey, x: number, z: number, speed = 1.3): Promise<boolean> {
    const m = this.members.get(k);
    if (!m) return Promise.resolve(false);
    m.walk?.done(false);
    if (m.sit) this.reseat(m, false);
    m.shown = true;
    m.fig.root.visible = true;
    return new Promise((res) => {
      let settled = false;
      const done = (ok: boolean) => { if (settled) return; settled = true; if (m.walk?.done === done) m.walk = null; m.fig.walking = 0; res(ok); };
      m.walk = { to: { x, z }, speed, done };
      this.bag.onDispose(() => done(false));
    });
  }

  /** Where someone is (world). */
  position(k: VillagerKey): XYZ {
    const r = this.members.get(k)?.fig.root.position;
    return r ? { x: r.x, y: r.y, z: r.z } : { x: G.x, y: Y_T, z: G.z };
  }
  /** Local position. */
  local(k: VillagerKey): { x: number; z: number } {
    const m = this.members.get(k);
    return m ? { ...m.at } : { x: 0, z: 0 };
  }

  /** What the case (or anyone) may do with a villager's figure. */
  handle(k: VillagerKey): VillagerHandle | null {
    const m = this.members.get(k);
    if (!m) return null;
    return {
      key: k,
      get root() { return m.fig.root; },
      position: () => this.position(k),
      place: (w) => {
        if (!w) { this.script(k, false); return; }
        this.script(k, true);
        const l = L(w.x, w.z);
        this.stand(k, l.x, l.z, w.face ? L(w.face.x, w.face.z) : undefined);
      },
    };
  }

  /** Refresh the prompts' labels and marks (after met / talk counts change). */
  relabel(): void {
    for (const m of this.members.values()) this.label(m);
  }
  private label(m: Member): void {
    const sp = this.opts.promptFor(m.key);
    const f = play.peek().flags;
    const lab = sp ? sp.label : labelOf(m.key, !!f[metFlag(m.key)]);
    const act = sp ? sp.action : { zh: '搭话', en: 'Talk' };
    if (m.prompt.labelZh !== lab.zh || m.prompt.actionZh !== act.zh || m.prompt.labelEn !== lab.en) {
      Object.assign(m.prompt, { labelZh: lab.zh, labelEn: lab.en, actionZh: act.zh, actionEn: act.en });
    }
  }

  private async act(k: VillagerKey): Promise<void> {
    const sp = this.opts.promptFor(k);
    if (sp) { await sp.act(); return; }
    await this.opts.onTalk(k);
  }

  private acc = 0;
  private frame(dt: number, t: number): void {
    const ctx = this.ctx;
    const inside = this.tv.isInside();
    const p = ctx.player.position;
    this.acc += dt;
    const relabel = this.acc > 0.5;
    if (relabel) this.acc = 0;
    for (const m of this.members.values()) {
      // walking
      const w = m.walk;
      if (w) {
        const dx = w.to.x - m.at.x, dz = w.to.z - m.at.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.06) { m.at = { x: w.to.x, z: w.to.z }; this.put(m); w.done(true); }
        else {
          const step = Math.min(d, w.speed * dt);
          m.at = { x: m.at.x + (dx / d) * step, z: m.at.z + (dz / d) * step };
          this.put(m);
          const want = Math.atan2(dx, dz);
          let dd = want - m.fig.root.rotation.y;
          dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          m.fig.root.rotation.y += dd * Math.min(1, dt * 6);
          m.fig.faceTo = null;
          m.fig.walking = Math.min(1, w.speed / 1.6);
        }
      }
      // the prompt stands in front of them; live only while they are shown and the walker is inside
      // the prompt stands on the walker's side of them (never behind a wall they face)
      const r = m.fig.root;
      let ux = p.x - r.position.x, uz = p.z - r.position.z;
      const ul = Math.hypot(ux, uz);
      if (ul > 0.01) { ux /= ul; uz /= ul; } else { ux = Math.sin(r.rotation.y); uz = Math.cos(r.rotation.y); }
      m.prompt.position.set(r.position.x + ux * 0.7, r.position.y, r.position.z + uz * 0.7);
      const want = inside && m.shown && !m.walk;
      if (want && !m.promptOff) m.promptOff = ctx.addInteractable(m.prompt);
      else if (!want && m.promptOff) { m.promptOff(); m.promptOff = null; }
      if (relabel) this.label(m);
      // outlines only near (four draws fewer each, further off)
      const d = Math.hypot(p.x - r.position.x, p.z - r.position.z);
      const near = d < 13;
      for (const h of m.hulls) if (h.visible !== near) h.visible = near;
      // (a hand prop too small to see from afar: one draw fewer)
      if (m.prop) m.prop.visible = d < 20;
      m.mark.set(m.shown && inside && this.opts.marked(m.key));
    }
    this.kiteFrame(dt, t);
    this.ghostFrame(dt, t);
  }

  private kiteT = 0;
  private tmp: T.Vector3 | null = null;
  private kiteFrame(dt: number, t: number): void {
    const k = this.kite;
    const m = this.members.get('xiaoman');
    if (!k || !m) return;
    const flying = m.shown && this.kiteFlying && Math.hypot(m.at.x + 0.6, m.at.z - 31) < 3;
    if (!flying && !this.kiteFlying) {
      // dropped: it drifts up and away, then is gone
      this.kiteT += dt;
      k.obj.position.y += dt * 1.2;
      k.obj.position.x -= dt * 0.8;
      k.line.visible = false;
      k.obj.visible = this.kiteT < 12;
      return;
    }
    k.obj.visible = k.line.visible = flying;
    if (!flying) return;
    const r = m.fig.root.position;
    const sway = this.still ? 0 : Math.sin(t * 0.7) * 0.8;
    k.obj.position.set(r.x - 3 + sway, r.y + 9 + (this.still ? 0 : Math.sin(t * 1.1) * 0.4), r.z - 7);
    k.obj.rotation.z = this.still ? 0 : Math.sin(t * 0.9) * 0.25;
    const h = (this.tmp ??= new this.ctx.THREE.Vector3());
    m.fig.armR.localToWorld(h.copy(m.fig.hand));
    k.pos[0] = h.x; k.pos[1] = h.y; k.pos[2] = h.z;
    k.pos[3] = k.obj.position.x; k.pos[4] = k.obj.position.y - 0.4; k.pos[5] = k.obj.position.z;
    k.line.geometry.attributes.position.needsUpdate = true;
  }

  /** 夭夭 at dawn: petals drift round her; walk away and she comes apart into petals. */
  private ghostFrame(dt: number, _t: number): void {
    const m = this.members.get('yaoyao');
    const fx = this.tv.fx;
    if (!m || !m.shown || m.scripted || !fx) return;
    const r = m.fig.root.position, p = this.ctx.player.position;
    const d = Math.hypot(p.x - r.x, p.z - r.z);
    const g = this.ghostFade;
    if (d < 10) g.near = true;
    if ((g.puff -= dt) <= 0 && d < 26) {
      g.puff = 2.8;
      void fx.petalBurst({ x: r.x, y: r.y + 0.9, z: r.z }, { n: 10, up: 0.5, spread: 0.5, lit: true });
    }
    if (g.near && d > 16) {
      g.near = false;
      g.dissolved = true;
      void fx.petalBurst({ x: r.x, y: r.y + 0.9, z: r.z }, { n: 140, up: 1.4, spread: 0.7, lit: true, wind: { x: 0, z: 1.4 } });
      this.hide('yaoyao');
    }
  }
  /** 夭夭 came apart this visit: she stays away until the next way in. */
  get yaoyaoGone(): boolean { return this.ghostFade.dissolved; }
  resetYaoyao(): void { this.ghostFade = { dissolved: false, near: false, puff: 0 }; }

  dispose(): void {
    for (const m of this.members.values()) { m.promptOff?.(); m.promptOff = null; m.walk?.done(false); }
    this.offFrame?.();
    this.offFrame = null;
    this.members.clear();
  }
}

/** Keep a record of a talk: the counter (ever and today). */
export function talkCount(k: VillagerKey): { total: number; today: number } {
  const p = play.peek();
  return { total: p.counters[talkKey(k)] ?? 0, today: p.daily.counts[talkKey(k)] ?? 0 };
}
