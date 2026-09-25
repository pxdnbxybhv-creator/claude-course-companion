// The people of the homestead. The residents you hire and name keep a day of their own: the steward
// sweeps and tells you the news by the names you gave ("旺财今天又挖了个坑"), the cook's stove smokes
// at mealtimes and there is a snack for you once a day, the gardener tends the beds, the student
// reads aloud (and dozes), the young musician practises the flute, the guard stands at the gate and
// salutes. Each greets your companion in their own way. Now and then one of your companions drops by
// to chat about their skill and leaves a gift; on market days a pet seller waits by the gate.
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../../types';
import type { Bag } from '../../kit';
import { inked } from '../../kit';
import { merge, part } from '../../geo';
import { figure, speechMark, talk, type Figure, type FigureSpec, type Hat } from '../../minigames/npc';
import { begin, end } from '../../minigames/ui';
import { home, type Resident } from '../../../../../app/home';
import { earn, record, unlocked } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { CHARACTER, type CharacterId } from '../../../../../data/characters';
import { hashString, makeRng } from '../../../../../core/rng';
import { HOME_PLOT } from '../../../map';
import { Actor } from './actor';
import { Bubble, Fx } from './fx';
import { adopt, renameResidentFlow } from './actions';
import { book, saveBook } from './book';
import { occupancy, placeSpot, route, solidCells, Way, type Spot } from './plot';
import { isRole, LOVE, present, ROLE_DEF, routineAt, SPECIES, visitGift, visitorFor, VISIT_HOURS, type Activity, type Role, type Slot, type Species } from './logic';
import { petPet } from '../../../../../app/home';
import * as snd from './sound';

type Line = { zh: string; en: string; choices?: { zh: string; en: string }[] };

/** The day that decides who visits and whether it is market day (DEV: ?homeday=YYYY-MM-DD to preview). */
function visitDay(): string {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const d = new URLSearchParams(location.search).get('homeday');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return today.value;
}

// ───────────────────────────── looks ─────────────────────────────

const LOOKS: Record<Role, { robe: string[]; trim: string[]; hat: Hat[]; hatColor?: string[]; apron?: string[]; cape?: string[]; beard?: string[]; hair?: string[]; scale?: number }> = {
  steward: { robe: ['#8a6b4a', '#6f5a44', '#7d5f3e'], trim: ['#3c3226', '#4a3b2c'], hat: ['cap', 'scholar'], hatColor: ['#3c3226', '#2f3a44'], beard: ['#d8d2c4', '#3a332c', ''], hair: ['#6d6660', '#2a2420'] },
  cook: { robe: ['#c7684f', '#b9774e', '#d08a6a', '#c0564a'], trim: ['#7a3b2c', '#8a4a30'], hat: ['bun'], apron: ['#efe6d2', '#f3ead8'], hair: ['#2a2420', '#3a2e26'] },
  gardener: { robe: ['#6f8a5a', '#7d8f55', '#5f7d62'], trim: ['#3d4a2e', '#4a3f2c'], hat: ['bamboo'], hatColor: ['#c8a86a', '#d8bb78'], apron: ['#b89a6a', '#a88a5a'], hair: ['#2a2420'] },
  student: { robe: ['#5b8aa6', '#7a9a8a', '#6a8fb0'], trim: ['#2f4a5c', '#34524a'], hat: ['buns'], hair: ['#23201d'], scale: 0.78 },
  musician: { robe: ['#d6a0a8', '#e0b86a', '#c98fa8'], trim: ['#8a3b3b', '#7a4a2a'], hat: ['buns', 'bun'], hair: ['#23201d'], scale: 0.8 },
  guard: { robe: ['#3f5f7a', '#4c4a44', '#5a3a34'], trim: ['#b93a2b', '#c8a24e'], hat: ['cap', 'bamboo'], hatColor: ['#b93a2b', '#2f3a44'], cape: ['#2f3a44', ''], beard: ['', '#23201d'], hair: ['#23201d'] },
};

export function specFor(role: string, look: number): FigureSpec {
  const L = LOOKS[isRole(role) ? role : 'steward'];
  const r = makeRng(look >>> 0);
  const pick = <V,>(a: V[] | undefined): V | undefined => (a && a.length ? a[Math.floor(r() * a.length)] : undefined);
  const skin = ['#f0d9bf', '#e8c9a8', '#f3dcc6', '#dcb894'][Math.floor(r() * 4)];
  const beard = pick(L.beard);
  const cape = pick(L.cape);
  return {
    robe: pick(L.robe)!, trim: pick(L.trim)!, hat: pick(L.hat)!, hatColor: pick(L.hatColor), apron: pick(L.apron),
    cape: cape || undefined, beard: beard || undefined, hair: pick(L.hair), skin, scale: (L.scale ?? 1) * (0.96 + r() * 0.08),
  };
}

/** Companions (as visitors) dressed like themselves. */
const VISITOR_LOOK: Partial<Record<CharacterId, FigureSpec>> = {
  scholar: { robe: '#ece9df', trim: '#4b5a6b', hat: 'scholar', hatColor: '#2f3a44' },
  gardener: { robe: '#7a8f5c', trim: '#3c4a58', apron: '#b99b62', hat: 'bamboo', hatColor: '#d8bb78' },
  fisher: { robe: '#8b8878', trim: '#4d4a40', cape: '#9d8458', hat: 'bamboo', hatColor: '#cbb27a', beard: '#e9e6de', hair: '#d8d2c4' },
  musician: { robe: '#f1e8e5', trim: '#c8aab5', hat: 'bun', hair: '#1f1b1a', skin: '#f6e2d0' },
  swordsman: { robe: '#343a44', trim: '#b08a4a', hat: 'bamboo', hatColor: '#262a31', skin: '#ecd0b3' },
  taoist: { robe: '#a3b4be', trim: '#2c323c', hat: 'bun', scale: 0.8, skin: '#f7e0c9' },
  painter: { robe: '#ddd3bb', trim: '#6b5a44', hat: 'cap', hatColor: '#5f8a6e' },
  player: { robe: '#8e9ba4', trim: '#2f3439', hat: 'scholar', hatColor: '#2f3439' },
  poet: { robe: '#f1f1ec', trim: '#7a96ab', hat: 'bun', beard: '#221f1d', hair: '#221f1d' },
  guan: { robe: '#3f6b54', trim: '#b8913f', skin: '#b5493a', beard: '#1a1918', hat: 'cap', hatColor: '#3a634d' },
  change: { robe: '#f6f2ee', trim: '#e8c3cb', hat: 'bun', hair: '#1c1a1d', skin: '#f8eae0' },
};

// ───────────────────────────── props ─────────────────────────────

type Prop = 'broom' | 'ladle' | 'hoe' | 'can' | 'book' | 'flute' | 'spear' | 'lantern' | 'bowl' | 'ledger';

const ROLE_PROPS: Record<Role, Prop[]> = {
  steward: ['broom', 'ledger', 'bowl'],
  cook: ['ladle', 'bowl'],
  gardener: ['hoe', 'can', 'bowl'],
  student: ['book', 'bowl'],
  musician: ['flute', 'bowl'],
  guard: ['spear', 'lantern', 'bowl'],
};

const PROP_FOR: Partial<Record<Activity, Prop>> = {
  sweep: 'broom', report: 'ledger', cook: 'ladle', eat: 'bowl', wash: 'bowl', tend: 'hoe', water: 'can', read: 'book', flute: 'flute', guard: 'spear', patrol: 'lantern',
};

function propGeo(THREE: WorldCtx['THREE'], p: Prop): T.BufferGeometry {
  const wood = '#8a6b4a', straw = '#c9a45a';
  switch (p) {
    case 'broom': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.014, 0.014, 1.0, 5), wood, { p: [0, -0.1, 0] }),
      part(THREE, new THREE.ConeGeometry(0.12, 0.34, 7), straw, { p: [0, -0.7, 0], r: [Math.PI, 0, 0] }),
    ]);
    case 'ladle': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4), wood, { p: [0, -0.18, 0.05], r: [0.4, 0, 0] }),
      part(THREE, new THREE.SphereGeometry(0.05, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#6b5a4a', { p: [0, -0.4, 0.14] }),
    ]);
    case 'hoe': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.014, 0.014, 1.1, 5), wood, { p: [0, -0.1, 0] }),
      part(THREE, new THREE.BoxGeometry(0.16, 0.1, 0.02), '#5a5550', { p: [0, 0.44, 0.07], r: [0.3, 0, 0] }),
    ]);
    case 'can': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), '#4f7a86', { p: [0, -0.12, 0.05] }),
      part(THREE, new THREE.CylinderGeometry(0.008, 0.014, 0.2, 4), '#4f7a86', { p: [0, -0.1, 0.17], r: [1.0, 0, 0] }),
    ]);
    case 'book': return merge(THREE, [
      part(THREE, new THREE.BoxGeometry(0.2, 0.02, 0.14), '#3d5f7a', { p: [-0.05, -0.02, 0.12], r: [-0.9, 0, 0] }),
      part(THREE, new THREE.BoxGeometry(0.19, 0.024, 0.13), '#f3ead6', { p: [-0.05, -0.01, 0.12], r: [-0.9, 0, 0] }),
    ]);
    case 'ledger': return merge(THREE, [
      part(THREE, new THREE.BoxGeometry(0.16, 0.2, 0.025), '#8a3b2c', { p: [0, -0.05, 0.1], r: [-0.4, 0, 0] }),
      part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), '#23201d', { p: [0.04, -0.04, 0.14], r: [0, 0, 0.4] }),
    ]);
    case 'flute': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.011, 0.011, 0.5, 5), '#b8913f', { p: [0.1, 0.02, 0.16], r: [0, 0, Math.PI / 2] }),
      part(THREE, new THREE.TorusGeometry(0.012, 0.004, 3, 6), '#b93a2b', { p: [0.3, 0.02, 0.16], r: [0, Math.PI / 2, 0] }),
    ]);
    case 'spear': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.016, 0.016, 2.0, 5), '#5a3a28', { p: [0, 0.55, 0] }),
      part(THREE, new THREE.ConeGeometry(0.035, 0.2, 5), '#c8c4b8', { p: [0, 1.65, 0] }),
      part(THREE, new THREE.ConeGeometry(0.07, 0.14, 7), '#c0392b', { p: [0, 1.48, 0], r: [Math.PI, 0, 0] }),
    ]);
    case 'lantern': return merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), wood, { p: [0, -0.05, 0.12], r: [0.6, 0, 0] }),
      part(THREE, new THREE.SphereGeometry(0.1, 8, 6), '#f0b060', { p: [0, -0.28, 0.3], s: [1, 1.2, 1] }),
    ]);
    case 'bowl':
    default: return merge(THREE, [
      part(THREE, new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#e8e2d2', { p: [0, 0.0, 0.1] }),
      part(THREE, new THREE.CylinderGeometry(0.004, 0.004, 0.16, 3), '#5a3a28', { p: [0.03, 0.04, 0.1], r: [0.5, 0, 0.3] }),
    ]);
  }
}

// ───────────────────────────── residents ─────────────────────────────

interface Person {
  res: Resident;
  role: Role;
  fig: Figure;
  props: Map<Prop, T.Mesh>;
  prop: Prop | null;
  slot: Slot | null;
  spot: Spot;
  x: number; z: number;
  walking: boolean;
  it: Interactable;
  off: () => void;
  mark: { set(on: boolean): void };
  t: number;
  cd: number;
  saluted: boolean;
  salT: number;
  hailed: boolean;
  face: { x: number; z: number };
  slotT: number;
  stoveSet: boolean;
  patrol: number;
  stove: T.Mesh | null;
  /** The way round what is built to `spot`. */
  way: Way;
}

const GUARD_HAIL: Partial<Record<CharacterId, string>> = { guan: '关二爷！', change: '仙子回来了！', cat: '大橘回来啦', rabbit: '玉兔回来啦', swordsman: '大侠！' };

const SNACKS = [
  ['桂花糕', 'osmanthus cake'], ['葱油饼', 'a scallion pancake'], ['芝麻汤圆', 'sesame rice balls'], ['红豆糕', 'red-bean cake'],
  ['荷叶饭', 'rice steamed in a lotus leaf'], ['酒酿圆子', 'sweet rice-wine dumplings'], ['烤红薯', 'a roast sweet potato'],
];
const SNACK_COINS = 12;

const READING = [
  ['人之初，性本善。性相近，习相远。', 'At the start, people are good by nature; by nature close, by habit far apart.'],
  ['学而时习之，不亦说乎？', 'To learn and practise it in time — is that not a joy?'],
  ['天地玄黄，宇宙洪荒。', 'Heaven dark, earth yellow; the cosmos vast and wild.'],
  ['三人行，必有我师焉。', 'Walking with two others, I will surely find a teacher.'],
  ['温故而知新，可以为师矣。', 'Review the old to learn the new, and you may teach.'],
];

export class People {
  private list = new Map<string, Person>();
  private occ = new Set<number>();
  private solid = new Set<number>();
  private ground = (x: number, z: number) => this.ctx.groundY(x, z);
  private smoke: Fx;
  private bubble: Bubble;
  private wp: T.Vector3;

  constructor(private bag: Bag, private ctx: WorldCtx, private group: T.Group, private fx: Fx, private hour: () => number, private newsFor: () => Line[]) {
    this.smoke = new Fx(bag, group, 8);
    this.bubble = new Bubble(bag, group);
    this.wp = new ctx.THREE.Vector3();
  }

  sync(): void {
    const h = home.value;
    this.occ = occupancy(h.items, 0);
    this.solid = solidCells(h.items);
    const want = new Map(h.residents.map((m) => [m.uid, m]));
    for (const [uid, p] of this.list) if (!want.has(uid)) { this.drop(p); this.list.delete(uid); }
    for (const m of want.values()) {
      const p = this.list.get(m.uid);
      if (p) { p.res = m; this.label(p); p.slot = null; p.way.reset(); continue; }
      this.list.set(m.uid, this.make(m));
    }
  }

  private make(m: Resident): Person {
    const { THREE } = this.ctx;
    const role: Role = isRole(m.role) ? m.role : 'steward';
    const spec = specFor(role, m.look);
    const start = placeSpot(home.value.items, this.occ, 'gate', 0);
    const fig = figure(this.bag, this.group, spec, new THREE.Vector3(start.x, this.ctx.groundY(start.x, start.z), start.z), -Math.PI / 2);
    const props = new Map<Prop, T.Mesh>();
    for (const pr of ROLE_PROPS[role]) {
      const mesh = inked(this.ctx, propGeo(THREE, pr), { width: 0 });
      mesh.position.copy(fig.hand);
      mesh.visible = false;
      this.bag.add(mesh, fig.armR);
      props.set(pr, mesh);
    }
    let stove: T.Mesh | null = null;
    if (role === 'cook') {
      // a clay stove with a pot, where the cooking happens (its smoke is the homestead's chimney)
      stove = inked(this.ctx, merge(THREE, [
        part(THREE, new THREE.CylinderGeometry(0.32, 0.38, 0.55, 9), '#a8654a', { p: [0, 0.27, 0] }),
        part(THREE, new THREE.CylinderGeometry(0.22, 0.2, 0.08, 9), '#3a3632', { p: [0, 0.58, 0] }),
        part(THREE, new THREE.SphereGeometry(0.2, 9, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#3a3632', { p: [0, 0.62, 0], r: [Math.PI, 0, 0] }),
        part(THREE, new THREE.BoxGeometry(0.16, 0.14, 0.05), '#e07a3a', { p: [0, 0.14, 0.34] }),
      ]), { width: 0.01 });
      stove.visible = false;
      this.bag.add(stove, this.group);
    }
    const it: Interactable = { id: `home-res:${m.uid}`, position: new THREE.Vector3(start.x, fig.root.position.y, start.z), radius: 1.9, labelZh: '', labelEn: '', actionZh: '说话', actionEn: 'Talk', act: () => this.talkTo(p) };
    const p: Person = {
      res: m, role, fig, props, prop: null, slot: null, spot: start, x: start.x, z: start.z, walking: false, it, off: () => {},
      mark: speechMark(this.bag, fig, role === 'cook' ? '食' : '闻'), t: 0, cd: 2 + (m.look % 5), saluted: false, salT: -1, hailed: false, face: { x: 0, z: 0 }, slotT: 0, stoveSet: false, patrol: m.look % 7, stove, way: new Way(),
    };
    p.mark.set(false);
    this.label(p);
    p.off = this.bag.interact(it);
    return p;
  }

  private label(p: Person): void {
    const r = ROLE_DEF[p.role];
    p.it.labelZh = `${r.zh} · ${p.res.name}`;
    p.it.labelEn = `${p.res.name} · ${r.en}`;
  }

  private drop(p: Person): void {
    p.off();
    this.bag.drop(p.fig.root);
    if (p.stove) this.bag.drop(p.stove);
  }

  private hold(p: Person, prop: Prop | null): void {
    if (p.prop === prop) return;
    if (p.prop) p.props.get(p.prop)!.visible = false;
    p.prop = prop && p.props.has(prop) ? prop : null;
    if (p.prop) p.props.get(p.prop)!.visible = true;
    // reset the arms
    p.fig.armR.rotation.set(0, 0, -0.18);
    p.fig.armL.rotation.set(0, 0, 0.18);
  }

  update(dt: number, t: number, still: boolean, px: number, pz: number, night: boolean): void {
    const hour = this.hour();
    const g = this.ground;
    const items = home.value.items;
    let k = 0;
    for (const p of this.list.values()) {
      k++;
      p.t += dt;
      p.cd -= dt;
      p.slotT -= dt;
      const slot = p.slot && p.slotT > 0 ? p.slot : routineAt(p.role, hour);
      if (p.slotT <= 0) p.slotT = 1;
      if (slot !== p.slot) {
        const first = p.slot === null && p.t < 1;
        p.slot = slot;
        // (by the gate the guard has the post; the rest stand to one side)
        const salt = slot.at === 'gate' ? (p.role === 'guard' ? 0 : 1 + (k % 3)) : k;
        p.spot = slot.act === 'patrol' ? placeSpot(items, this.occ, 'fence', p.patrol) : placeSpot(items, this.occ, slot.at, salt);
        p.walking = true;
        p.stoveSet = false;
        this.hold(p, null);
        // when the world opens they are already about their business
        if (first) { p.x = p.spot.x; p.z = p.spot.z; }
      }
      const shown = present(slot);
      p.fig.root.visible = shown;
      p.it.radius = shown ? 1.9 : 0;
      if (p.stove) p.stove.visible = shown && slot.act === 'cook' && p.stoveSet;
      if (!shown) { p.mark.set(false); continue; }
      const f = p.fig;
      const pd = Math.hypot(px - p.x, pz - p.z);
      // walk to where the hour wants them (the patrol goes round the fence), round what is built
      const d = Math.hypot(p.spot.x - p.x, p.spot.z - p.z);
      if (d > 0.08) {
        p.way.to(this.solid, p.x, p.z, p.spot.x, p.spot.z, 0.05);
        const w = p.way.next(p.x, p.z);
        const dx = w.x - p.x, dz = w.z - p.z, dw = Math.hypot(dx, dz) || 1;
        const v = Math.min(dw, (slot.act === 'play' ? 2.2 : 1.25) * dt);
        p.x += (dx / dw) * v; p.z += (dz / dw) * v;
        p.face.x = w.x; p.face.z = w.z; f.faceTo = p.face;
        f.root.position.set(p.x, g(p.x, p.z) + (still ? 0 : Math.abs(Math.sin(p.t * 7)) * 0.03), p.z);
        this.hold(p, slot.act === 'patrol' ? 'lantern' : null);
        f.armL.rotation.x = still ? 0 : Math.sin(p.t * 7) * 0.3;
        f.armR.rotation.x = still ? 0 : -Math.sin(p.t * 7) * 0.3;
      } else {
        if (p.walking) { p.walking = false; p.t = 0; }
        f.root.position.set(p.x, g(p.x, p.z), p.z);
        if (slot.act === 'patrol' && p.t > 6) { p.patrol += 1; p.spot = placeSpot(items, this.occ, 'fence', p.patrol); p.walking = true; }
        if (slot.act === 'play' && p.t > 3) { p.spot = placeSpot(items, this.occ, 'yard', k + Math.floor(t)); p.walking = true; }
        this.work(p, slot.act, dt, t, still, pd, night);
      }
      p.it.position.set(p.x, f.root.position.y, p.z);
      // the gate guard salutes as you come in or go out
      if (p.role === 'guard' && slot.act === 'guard') {
        if (pd < 3.2 && !p.saluted) { p.saluted = true; p.salT = 0; if (!this.bubble.busy) this.bubble.say(this.ctx.lang === 'zh' ? GUARD_HAIL[this.ctx.player.character] ?? '回来啦！' : 'Welcome back!', f.root, f.height + 0.45, 1800); }
        if (pd > 6) p.saluted = false;
      }
      // the steward has news, the cook a snack: they call out once as you come near
      if (!p.hailed && pd < 6 && !this.bubble.busy && ((p.role === 'steward' && book().news !== today.value) || (p.role === 'cook' && book().snack !== today.value))) {
        p.hailed = true;
        f.wave();
        const zh = this.ctx.lang === 'zh';
        this.bubble.say(p.role === 'steward' ? (zh ? '今天有新鲜事！' : 'News today!') : (zh ? '点心出锅啦！' : 'Snacks are ready!'), f.root, f.height + 0.45, 2400);
      }
      // something to tell you
      if (p.role === 'steward') p.mark.set(book().news !== today.value && pd < 16);
      else if (p.role === 'cook') p.mark.set(book().snack !== today.value && pd < 16);
      else p.mark.set(false);
    }
    this.smoke.update(dt);
    this.bubble.update(dt, this.wp);
  }

  private work(p: Person, act: Activity, dt: number, t: number, still: boolean, pd: number, night: boolean): void {
    const f = p.fig;
    this.hold(p, PROP_FOR[act] ?? null);
    const s = still ? 0 : 1;
    const aR = f.armR.rotation, aL = f.armL.rotation;
    if (pd < 4) { p.face.x = this.ctx.player.position.x; p.face.z = this.ctx.player.position.z; f.faceTo = p.face; }
    else f.faceTo = null;
    switch (act) {
      case 'sweep':
        aR.set(-0.5 + Math.sin(t * 3) * 0.35 * s, Math.sin(t * 3) * 0.5 * s, -0.3);
        aL.set(-0.6 + Math.sin(t * 3) * 0.3 * s, 0, 0.3);
        if (!still && pd < 14 && Math.floor(t * 3 / Math.PI) !== Math.floor((t - dt) * 3 / Math.PI)) { snd.swish(pd); this.fx.puff(p.x + Math.sin(f.root.rotation.y) * 0.6, f.root.position.y, p.z + Math.cos(f.root.rotation.y) * 0.6, '#c8b494', 1, 0.2); }
        break;
      case 'cook': {
        aR.set(-0.9 + Math.sin(t * 2.4) * 0.15 * s, Math.cos(t * 2.4) * 0.3 * s, -0.25);
        const st = p.stove!;
        if (!p.stoveSet) {
          // the stove stands beside her spot, toward the middle of the plot
          p.stoveSet = true;
          const dx = HOME_PLOT.x - p.x, dz = HOME_PLOT.z - p.z, L = Math.hypot(dx, dz) || 1;
          const sx = p.x + (dx / L) * 0.8, sz = p.z + (dz / L) * 0.8;
          st.position.set(sx, this.ctx.groundY(sx, sz), sz);
        }
        if (!still && Math.floor(t * 1.4) !== Math.floor((t - dt) * 1.4)) this.smoke.smoke(st.position.x, st.position.y + 0.75, st.position.z);
        if (pd < 7 && p.cd <= 0) { p.cd = 5; snd.sizzle(pd); }
        p.face.x = st.position.x; p.face.z = st.position.z; f.faceTo = p.face;
        break;
      }
      case 'tend':
        aR.set(-0.3 - Math.max(0, Math.sin(t * 2.2)) * 1.1 * s, 0, -0.2);
        aL.set(-0.4 - Math.max(0, Math.sin(t * 2.2)) * 0.8 * s, 0, 0.2);
        break;
      case 'water':
        aR.set(-0.8, 0, -0.15 + Math.sin(t * 1.5) * 0.1 * s);
        if (!still && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.fx.puff(p.x + Math.sin(f.root.rotation.y) * 0.5, f.root.position.y + 0.1, p.z + Math.cos(f.root.rotation.y) * 0.5, '#bcd7e0', 1, 0.1);
        break;
      case 'read':
        aR.set(-0.9, 0, -0.3); aL.set(-0.9, 0, 0.3);
        f.head.rotation.x = Math.sin(t * 2.2) * 0.12 * s + (night ? 0.3 : 0);
        if (pd < 10 && p.cd <= 0 && !this.bubble.busy) {
          p.cd = 8;
          const line = READING[Math.floor(t / 8) % READING.length];
          // reading aloud, swaying — and now and then dozing off mid-line
          const doze = Math.floor(t / 8) % 4 === 3;
          const zh = this.ctx.lang === 'zh';
          this.bubble.say(doze ? (zh ? `${line[0].slice(0, 4)}……呼……` : 'Zzz…') : zh ? line[0].split('，')[0] : line[1].split(/[,;]/)[0], f.root, f.height + 0.45, 2600);
        }
        break;
      case 'flute':
        aR.set(-1.35, 0.35, -0.2); aL.set(-1.25, -0.35, 0.2);
        if (!still && Math.floor(t * 1.2) !== Math.floor((t - dt) * 1.2)) this.fx.notes(p.x, f.root.position.y + f.height + 0.1, p.z, 1, '#8a3b3b');
        if (pd < 12 && p.cd <= 0) { p.cd = 7 + (p.res.look % 3); const days = Math.max(0, Math.round((Date.parse(today.value) - Date.parse(p.res.since)) / 864e5)); snd.flute(pd, Math.min(1, 0.3 + days * 0.05), Math.floor(t)); }
        break;
      case 'guard': {
        aR.set(-0.15, 0, -0.1);
        if (p.salT >= 0) {
          p.salT += dt;
          const k = Math.sin(Math.min(1, p.salT / 1.4) * Math.PI);
          aL.set(-1.2 * k, 0, 0.3 + 0.4 * k); // fist in palm
          f.head.rotation.x = 0.25 * k;
          if (p.salT > 1.4) p.salT = -1;
        }
        break;
      }
      case 'eat':
        aR.set(-0.6 - Math.max(0, Math.sin(t * 1.8)) * 0.8 * s, 0, -0.3);
        aL.set(-0.7, 0, 0.3);
        break;
      case 'wash':
        aR.set(-0.9 + Math.sin(t * 3) * 0.2 * s, 0, -0.2); aL.set(-0.9 - Math.sin(t * 3) * 0.2 * s, 0, 0.2);
        f.head.rotation.x = 0.3;
        break;
      case 'report':
        aR.set(-0.5, 0, -0.3); aL.set(-0.3 + Math.sin(t * 0.8) * 0.2 * s, 0, 0.3);
        break;
      default:
        break;
    }
  }

  private async talkTo(p: Person): Promise<void> {
    const ctx = this.ctx;
    if (!begin(ctx, 'talk')) return;
    try {
      const name = { zh: `${ROLE_DEF[p.role].zh} · ${p.res.name}`, en: `${p.res.name} · ${ROLE_DEF[p.role].en}` };
      const lines = this.lines(p);
      const last = lines[lines.length - 1];
      last.choices = [...(last.choices ?? []), { zh: '改个名字', en: 'Rename' }, { zh: p.role === 'steward' ? '辛苦了' : '好', en: p.role === 'steward' ? 'Thank you' : 'All right' }];
      const i = await talk(ctx, p.fig, name, lines);
      const nChoices = last.choices.length;
      if (i === nChoices - 2) await renameResidentFlow(ctx, p.res.uid);
      else if (i >= 0 && i < nChoices - 2) this.choose(p, i);
    } finally {
      end(ctx, 'talk');
    }
  }

  /** What they say (by role, the hour, your companion and the names you gave). */
  private lines(p: Person): Line[] {
    const who = this.ctx.player.character;
    const slot = p.slot ?? routineAt(p.role, this.hour());
    const h = this.hour();
    const hello = h < 11 ? ['早啊！', 'Good morning!'] : h < 18 ? ['回来啦！', 'Welcome back!'] : ['天黑了，路上可好走？', 'It’s dark — was the road all right?'];
    const out: Line[] = [];
    const guest = GREET[p.role]?.[who];
    if (guest) out.push({ zh: guest[0], en: guest[1] });
    else out.push({ zh: hello[0], en: hello[1] });
    switch (p.role) {
      case 'steward': {
        const news = this.newsFor();
        out.push({ zh: '今日院里的事，我都记着呢：', en: 'Here is what happened about the place today:' });
        for (const n of news) out.push({ zh: n.zh, en: n.en });
        saveBook((b) => { b.news = today.value; });
        break;
      }
      case 'cook': {
        const snack = SNACKS[(Math.floor(Date.parse(today.value) / 864e5) + p.res.look) % SNACKS.length];
        if (book().snack !== today.value) out.push({ zh: `刚出锅的${snack[0]}，给你留了一份。`, en: `Fresh ${snack[1]} — I kept some for you.`, choices: [{ zh: '尝一口', en: 'Have some' }] });
        else out.push({ zh: slot.act === 'cook' ? '饭还在锅里，再等等。' : '明天再给你做点好吃的。', en: slot.act === 'cook' ? 'It’s still on the stove — a little longer.' : 'I’ll make you something nice tomorrow.' });
        break;
      }
      case 'gardener':
        out.push(home.value.items.some((it) => /^(farm|flowers|mums)$/.test(it.kind))
          ? { zh: '花圃菜畦我天天照看着，缺水我就浇。', en: 'I see to the beds every day, and water them when they’re dry.' }
          : { zh: '院里要是有块菜畦就好了，我给你种点青菜。', en: 'If there were a vegetable bed here I’d grow you some greens.' });
        break;
      case 'student': {
        const line = READING[Math.floor(Date.parse(today.value) / 864e5) % READING.length];
        out.push({ zh: `「${line[0]}」……先生，我背得对吗？`, en: `“${line[1]}” … Did I get it right?`, choices: [{ zh: '一字不差', en: 'Word perfect' }, { zh: '再背一遍', en: 'Once more' }] });
        break;
      }
      case 'musician':
        out.push({ zh: '我给你吹一段新学的曲子！', en: 'Let me play you the tune I just learnt!', choices: [{ zh: '好听', en: 'Lovely' }, { zh: '还要多练', en: 'Keep practising' }] });
        break;
      case 'guard':
        out.push(slot.act === 'patrol' ? { zh: '夜里我巡着呢，你安心睡。', en: 'I’m on watch tonight — sleep easy.' } : { zh: '门口有我守着，放心！', en: 'I’ve got the gate. Don’t you worry!' });
        break;
      default: break;
    }
    return out;
  }

  private choose(p: Person, i: number): void {
    const ctx = this.ctx;
    if (p.role === 'cook' && i === 0 && book().snack !== today.value) {
      saveBook((b) => { b.snack = today.value; });
      ctx.player.emote('eat');
      earn(SNACK_COINS);
      record('home-snack');
      ctx.hud.toast(`又香又暖，省了一顿饭钱 · +${SNACK_COINS} 文`, `Warm and delicious — a meal’s worth saved · +${SNACK_COINS} coins`, 2600);
    } else if (p.role === 'musician') {
      const days = Math.max(0, Math.round((Date.parse(today.value) - Date.parse(p.res.since)) / 864e5));
      snd.flute(0, i === 0 ? Math.min(1, 0.5 + days * 0.05) : 0.3, p.res.look + days);
      this.fx.notes(p.x, p.fig.root.position.y + p.fig.height + 0.1, p.z, 3, '#8a3b3b');
      ctx.hud.toast(i === 0 ? `${p.res.name}高兴得脸都红了` : `${p.res.name}鼓起腮帮子：我再练练！`, i === 0 ? `${p.res.name} blushes with delight` : `${p.res.name} puffs out his cheeks: I’ll practise more!`, 2200);
    } else if (p.role === 'student') {
      ctx.hud.toast(i === 0 ? `${p.res.name}得意地摇头晃脑` : `${p.res.name}又从头背了一遍，背到一半打了个哈欠`, i === 0 ? `${p.res.name} sways his head, very pleased` : `${p.res.name} starts again from the top — and yawns halfway`, 2400);
    }
  }

  dispose(): void {
    for (const p of this.list.values()) this.drop(p);
    this.list.clear();
  }

  get count(): number { return this.list.size; }
}

/** How each role greets a particular companion (instead of the usual hello). */
const GREET: Partial<Record<Role, Partial<Record<CharacterId, [string, string]>>>> = {
  steward: { change: ['仙子驾到，寒舍蓬荜生辉！', 'An immortal at our door — this humble house shines!'], guan: ['关将军！快请上座。', 'General Guan! Please, take the seat of honour.'], cat: ['哎哟，大橘也回来了？', 'Oh my, Big Ginger’s back too?'] },
  cook: { cat: ['大橘也来啦？给你留了条小鱼干。', 'Big Ginger! I saved you a little dried fish.'], guan: ['关二爷，来碗酒暖暖身子！', 'Lord Guan, a bowl of wine to warm you!'], rabbit: ['玉兔乖，吃根胡萝卜？', 'Sweet Jade Rabbit — a carrot?'], poet: ['诗仙又来讨酒喝啦？', 'Come for more wine, Poet?'] },
  gardener: { gardener: ['同行啊！你这锄头使得顺手。', 'A fellow gardener! That hoe suits you.'], rabbit: ['哎，别啃我的菜！', 'Hey — don’t nibble my greens!'] },
  student: { scholar: ['先生！「学而时习之」怎么讲？', 'Sir! What does “learn and practise it in time” mean?'], poet: ['诗仙！能给我题一首诗吗？', 'Poet! Would you write me a poem?'], painter: ['画师，教我画竹子吧！', 'Painter, teach me to paint bamboo!'] },
  musician: { musician: ['琴师姐姐！教教我吧！', 'Teacher! Please teach me!'], poet: ['我给诗仙伴奏！', 'I’ll play while you recite, Poet!'] },
  guard: { guan: ['关……关二爷！小的给您磕头了！', 'L-Lord Guan! Your humble servant bows!'], swordsman: ['阁下好身手，改日切磋切磋？', 'Fine moves, sir — a friendly bout some day?'], taoist: ['小道长，门口的符是您贴的？', 'Little master, did you put the talisman on the gate?'] },
};

// ───────────────────────────── comings and goings ─────────────────────────────

/** Along the path from the garden (off in the distance), up to the gate, just inside it. */
const OFFSTAGE: Spot = { x: -34.6, z: -14 };
const PATH_BEND: Spot = { x: -35.2, z: -16.8 };
const GATE_OUT: Spot = { x: HOME_PLOT.gate.x + 1.3, z: HOME_PLOT.gate.z + 0.2 };
const GATE_IN: Spot = { x: HOME_PLOT.gate.x - 1.1, z: HOME_PLOT.gate.z };

/** A figure walking a list of points (in or out through the gate). */
class Stroll {
  pts: Spot[] = [];
  k = 0;
  get done(): boolean { return this.k >= this.pts.length; }
  set(pts: Spot[]): void { this.pts = pts; this.k = 0; }
  /** Step (x, z) along at `v` m/s; writes the new position into `at`, returns the point headed for. */
  step(at: { x: number; z: number }, v: number, dt: number): Spot | null {
    let left = v * dt;
    while (this.k < this.pts.length && left > 0) {
      const p = this.pts[this.k];
      const dx = p.x - at.x, dz = p.z - at.z, d = Math.hypot(dx, dz);
      if (d <= left) { at.x = p.x; at.z = p.z; left -= d; this.k++; continue; }
      at.x += (dx / d) * left; at.z += (dz / d) * left;
      left = 0;
    }
    return this.pts[this.k] ?? null;
  }
}

// ───────────────────────────── the visitor ─────────────────────────────

/**
 * Today's visitor: one of your companions drops by (8:00–20:00), chats about their skill, leaves a
 * gift. They walk in through the gate when the hour comes, and out again when it is over.
 */
export class Visitor {
  private fig: Figure | null = null;
  private animal: Actor | null = null;
  private who: CharacterId | null = null;
  private off: (() => void) | null = null;
  private mark: { set(on: boolean): void } | null = null;
  private leaving = false;
  private pos: T.Vector3;
  private at: Spot;
  private state: 'away' | 'in' | 'here' | 'out' = 'away';
  /** The day they came (they come once a day). */
  private came = '';
  private walk = new Stroll();
  private me = { x: 0, z: 0 };
  private face = { x: 0, z: 0 };

  constructor(private bag: Bag, private ctx: WorldCtx, private group: T.Group, private fx: Fx, private hour: () => number) {
    this.pos = new ctx.THREE.Vector3();
    this.at = { x: HOME_PLOT.x + 4.5, z: HOME_PLOT.z + 2.2 };
  }

  /** Come or go as the hour says (called once a second; `first` when the world opens: already here). */
  check(first = false): void {
    const h = this.hour();
    const open = h >= VISIT_HOURS.from && h < VISIT_HOURS.to;
    if (open && this.state === 'away' && this.came !== visitDay()) this.come(first);
    else if (!open && (this.state === 'here' || this.state === 'in')) this.go();
  }

  private come(first: boolean): void {
    const day = visitDay();
    const who = visitorFor(day, unlocked.value, this.ctx.player.character);
    this.came = day;
    if (!who) return;
    this.clear();
    const occ = occupancy(home.value.items, 1);
    this.at = placeSpotFree(occ, { x: HOME_PLOT.x + 4.5, z: HOME_PLOT.z + 2.2 });
    this.who = who;
    this.leaving = false;
    const start = first ? this.at : OFFSTAGE;
    const y = this.ctx.groundY(start.x, start.z);
    this.me.x = start.x; this.me.z = start.z;
    this.pos.set(start.x, y, start.z);
    if (who === 'cat' || who === 'rabbit') {
      const a = new Actor(this.bag, who === 'cat' ? 'cat' : 'rabbit', `visitor:${who}`, this.group, who === 'cat' ? 3 : 0);
      a.place(start.x, y, start.z, Math.PI / 2);
      this.animal = a;
    } else {
      const spec = VISITOR_LOOK[who] ?? VISITOR_LOOK.scholar!;
      this.fig = figure(this.bag, this.group, spec, this.pos.clone(), Math.PI / 2);
      this.mark = speechMark(this.bag, this.fig, '礼');
      this.mark.set(false);
    }
    if (first) { this.arrived(); return; }
    this.state = 'in';
    this.walk.set([OFFSTAGE, PATH_BEND, GATE_OUT, GATE_IN, ...route(solidCells(home.value.items), GATE_IN.x, GATE_IN.z, this.at.x, this.at.z)]);
  }

  private arrived(): void {
    this.state = 'here';
    const who = this.who!;
    if (this.animal) { this.animal.setMode(who === 'cat' ? 'sleep' : 'eat'); this.animal.heading = Math.PI / 2; }
    if (this.fig) { this.fig.walking = 0; this.face.x = this.at.x + 1; this.face.z = this.at.z; this.fig.faceTo = this.face; }
    this.mark?.set(book().gift !== today.value);
    const c = CHARACTER[who];
    this.pos.set(this.me.x, this.ctx.groundY(this.me.x, this.me.z), this.me.z);
    this.off = this.bag.interact({
      id: 'home-visitor', position: this.pos, radius: 2, labelZh: `${c.zh} · 来访`, labelEn: `${c.en} · visiting`, actionZh: '寒暄', actionEn: 'Chat',
      act: () => this.chat(),
    });
  }

  /** Time to go: out through the gate and away down the path. */
  private go(): void {
    this.off?.();
    this.off = null;
    this.mark?.set(false);
    this.leaving = true;
    this.state = 'out';
    const back = route(solidCells(home.value.items), this.me.x, this.me.z, GATE_IN.x, GATE_IN.z);
    this.walk.set([...back, GATE_OUT, PATH_BEND, OFFSTAGE]);
    if (this.fig) this.fig.wave();
  }

  /** Take the figure (or the animal) away. */
  private clear(): void {
    this.off?.();
    this.off = null;
    if (this.fig) this.bag.drop(this.fig.root);
    if (this.animal) { this.bag.drop(this.animal.m.root); this.animal.dispose(); }
    this.fig = null; this.animal = null; this.mark = null; this.who = null;
    this.state = 'away';
  }

  private async chat(): Promise<void> {
    const ctx = this.ctx;
    const who = this.who;
    if (!who || this.leaving || !begin(ctx, 'talk')) return;
    try {
      const c = CHARACTER[who];
      const sk = c.skill;
      const name = { zh: c.zh, en: c.en };
      const lines: Line[] = [
        { zh: `路过你家，进来坐坐。${home.value.name ? `「${home.value.name}」，好名字！` : '收拾得真好。'}`, en: `I was passing and dropped in. ${home.value.name ? `“${home.value.name}” — a fine name!` : 'You keep a lovely place.'}` },
        { zh: `我的「${sk.zh}」你见过吗？${sk.descZh}`, en: `Have you seen my “${sk.en}”? ${sk.descEn}` },
      ];
      const pets = home.value.pets;
      if (pets.length) {
        const p = pets[Math.floor(Date.parse(today.value) / 864e5) % pets.length];
        lines.push({ zh: `你家${p.name}真可爱，${who === 'cat' ? '就是见了我有点紧张。' : '我都舍不得走了。'}`, en: `${p.name} is adorable${who === 'cat' ? ' — if a bit nervous around me.' : '. I hardly want to leave.'}` });
      }
      const fresh = book().gift !== today.value;
      if (fresh) lines.push({ zh: '一点心意，收下吧。', en: 'A little something — please take it.' });
      if (this.animal) {
        await ctx.hud.say({ nameZh: name.zh, nameEn: name.en, zh: who === 'cat' ? '喵～（大橘在你家院子里晒太阳，赖着不走。）' : '（玉兔在院里啃着菜叶，冲你眨眨眼。）', en: who === 'cat' ? 'Mrrow~ (Big Ginger is sunning himself in your yard and has no plans to leave.)' : '(The Jade Rabbit nibbles greens in your yard and winks at you.)' });
      } else await talk(ctx, this.fig, name, lines);
      if (fresh) {
        const g = visitGift(today.value, who);
        saveBook((b) => { b.gift = today.value; });
        earn(g.coins);
        record('home-visit');
        this.fx.coins(this.pos.x, this.pos.y + 0.8, this.pos.z, 5);
        snd.chime();
        let msg = { zh: `${c.zh}留下了 ${g.coins} 文`, en: `${c.en} left you ${g.coins} coins` };
        if (g.treat && pets.length) {
          for (const p of pets) petPet(p.uid, LOVE.treat);
          msg = { zh: `${msg.zh}，还给宠物们带了零嘴`, en: `${msg.en}, and treats for the pets` };
        }
        ctx.hud.toast(msg.zh, msg.en, 2800);
        this.mark?.set(false);
      }
      if (this.fig) this.fig.wave();
    } finally {
      end(ctx, 'talk');
    }
  }

  update(dt: number, t: number, still: boolean): void {
    if (this.state === 'in' || this.state === 'out') {
      const next = this.walk.step(this.me, this.animal ? 1.6 : 1.3, dt);
      const y = this.ctx.groundY(this.me.x, this.me.z);
      if (this.fig) {
        this.fig.root.position.set(this.me.x, y, this.me.z);
        this.fig.walking = next ? 1 : 0;
        if (next) { this.face.x = next.x; this.face.z = next.z; this.fig.faceTo = this.face; }
      }
      if (this.animal) {
        const a = this.animal;
        const ox = a.x, oz = a.z;
        a.x = this.me.x; a.z = this.me.z; a.y = y;
        a.speed = Math.hypot(a.x - ox, a.z - oz) / Math.max(1e-4, dt);
        if (a.speed > 0.1) a.heading = Math.atan2(a.x - ox, a.z - oz);
        a.setMode('idle');
      }
      if (this.walk.done) {
        if (this.state === 'in') this.arrived();
        else { this.fx.puff(this.me.x, y, this.me.z, '#f0e6d2', 4, 0.5); this.clear(); }
      }
    }
    if (this.animal) this.animal.animate(dt, t, still);
  }

  get present(): string | null { return this.state === 'away' ? null : `${this.who}:${this.state}`; }

  dispose(): void {
    this.off?.();
  }
}

function placeSpotFree(occ: Set<number>, s: Spot): Spot {
  const x0 = HOME_PLOT.x - HOME_PLOT.size / 2, z0 = HOME_PLOT.z - HOME_PLOT.size / 2;
  for (let r = 0; r < 6; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
    const i = Math.floor(s.x - x0) + a, j = Math.floor(s.z - z0) + b;
    if (!occ.has(i * 256 + j)) return { x: x0 + i + 0.5, z: z0 + j + 0.5 };
  }
  return s;
}

// ───────────────────────────── the pet seller ─────────────────────────────

/**
 * On market days (7:00–19:00) a pet seller comes up the path with a carrying pole of baskets, sets
 * down by the gate, and goes home again when the market is over; today one kind is cheaper.
 */
export class Seller {
  private fig: Figure | null = null;
  private cart: T.Mesh | null = null;
  private off: (() => void) | null = null;
  readonly at: Spot;
  private special: Species = 'dog';
  private state: 'away' | 'in' | 'here' | 'out' = 'away';
  private walk = new Stroll();
  private me = { x: 0, z: 0 };
  private face = { x: 0, z: 0 };
  private pos: T.Vector3;

  constructor(private bag: Bag, private ctx: WorldCtx, private group: T.Group, private hour: () => number) {
    // by the fence beside the path, a few steps short of the gate (clear of the ledger board, the
    // old farmer and the stele), his baskets set out at the path's edge
    this.at = { x: HOME_PLOT.gate.x + 1.3, z: HOME_PLOT.gate.z + 5.2 };
    this.pos = new ctx.THREE.Vector3();
  }

  /** Market days: two in three, 7:00–19:00. */
  static comes(day: string, hour: number): boolean {
    return makeRng(hashString(`market:${day}`))() < 0.67 && hour >= 7 && hour < 19;
  }

  /** Come or go as the hour says (called once a second; `first` when the world opens: already here). */
  check(first = false): void {
    const open = Seller.comes(visitDay(), this.hour());
    if (open && this.state === 'away') this.come(first);
    else if (!open && (this.state === 'here' || this.state === 'in')) this.go();
  }

  private come(first: boolean): void {
    const { THREE } = this.ctx;
    const r = makeRng(hashString(`seller:${visitDay()}`));
    this.special = SPECIES[Math.floor(r() * SPECIES.length)].id;
    const start = first ? this.at : OFFSTAGE;
    this.me.x = start.x; this.me.z = start.z;
    const y = this.ctx.groundY(start.x, start.z);
    this.fig = figure(this.bag, this.group, { robe: '#b8793f', trim: '#5a3a24', apron: '#d8c79a', hat: 'bamboo', hatColor: '#d8b870', beard: '#3a322a' }, new THREE.Vector3(start.x, y, start.z), Math.PI * 0.85);
    speechMark(this.bag, this.fig, '宠');
    // a carrying pole with two baskets, one with a pup peeping out
    this.cart = inked(this.ctx, merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.26, 0.2, 0.34, 10), '#c9a45a', { p: [-0.7, 0.17, 0.3] }),
      part(THREE, new THREE.CylinderGeometry(0.26, 0.2, 0.34, 10), '#c9a45a', { p: [0.7, 0.17, 0.3] }),
      part(THREE, new THREE.TorusGeometry(0.2, 0.02, 4, 12), '#8a6b4a', { p: [-0.7, 0.45, 0.3], r: [0, 0, 0] }),
      part(THREE, new THREE.TorusGeometry(0.2, 0.02, 4, 12), '#8a6b4a', { p: [0.7, 0.45, 0.3] }),
      part(THREE, new THREE.CylinderGeometry(0.02, 0.02, 1.8, 5), '#8a6b4a', { p: [0, 0.64, 0.3], r: [0, 0, Math.PI / 2] }),
      // a pup's head in one basket, a rabbit's ears in the other
      part(THREE, new THREE.SphereGeometry(0.1, 8, 6), '#c98d45', { p: [-0.7, 0.4, 0.3] }),
      part(THREE, new THREE.SphereGeometry(0.04, 6, 4), '#8e5a2a', { p: [-0.78, 0.46, 0.3], s: [0.6, 1.3, 0.9] }),
      part(THREE, new THREE.SphereGeometry(0.04, 6, 4), '#8e5a2a', { p: [-0.62, 0.46, 0.3], s: [0.6, 1.3, 0.9] }),
      part(THREE, new THREE.SphereGeometry(0.025, 5, 5), '#f5f1e8', { p: [0.66, 0.46, 0.3], s: [0.8, 3, 0.5] }),
      part(THREE, new THREE.SphereGeometry(0.025, 5, 5), '#f5f1e8', { p: [0.74, 0.46, 0.3], s: [0.8, 3, 0.5] }),
    ]), { width: 0.01 });
    this.bag.add(this.cart, this.group);
    if (first) { this.setDown(); return; }
    this.shoulder();
    this.state = 'in';
    this.walk.set([OFFSTAGE, PATH_BEND, { x: this.at.x + 1.2, z: this.at.z - 0.6 }, this.at]);
  }

  /** The pole on his shoulder (walking). */
  private shoulder(): void {
    if (!this.cart || !this.fig) return;
    this.fig.root.add(this.cart);
    this.cart.position.set(0, this.fig.height * 0.8 - 0.64, -0.3);
    this.cart.rotation.set(0, 0, 0);
  }

  /** Set the baskets down beside him and open for business. */
  private setDown(): void {
    const fig = this.fig!, cart = this.cart!;
    this.group.add(cart);
    const y = this.ctx.groundY(this.at.x, this.at.z);
    cart.position.set(this.at.x + 0.75, this.ctx.groundY(this.at.x + 0.75, this.at.z), this.at.z);
    cart.rotation.set(0, Math.PI / 2, 0);
    fig.root.position.set(this.at.x, y, this.at.z);
    fig.walking = 0;
    this.face.x = this.at.x + 3; this.face.z = this.at.z - 0.8; // toward the path
    fig.faceTo = this.face;
    this.state = 'here';
    this.pos.set(this.at.x, y, this.at.z);
    this.off = this.bag.interact({ id: 'home-seller', position: this.pos, radius: 2.2, labelZh: '宠物贩', labelEn: 'Pet seller', actionZh: '看看', actionEn: 'Browse', act: () => this.browse() });
  }

  /** The market is over: pole up, and off home. */
  private go(): void {
    this.off?.();
    this.off = null;
    this.shoulder();
    this.me.x = this.at.x; this.me.z = this.at.z;
    this.state = 'out';
    this.walk.set([{ x: this.at.x + 1.2, z: this.at.z - 0.6 }, PATH_BEND, OFFSTAGE]);
  }

  update(dt: number): void {
    if (this.state !== 'in' && this.state !== 'out') return;
    const fig = this.fig;
    if (!fig) return;
    const next = this.walk.step(this.me, 1.2, dt);
    fig.root.position.set(this.me.x, this.ctx.groundY(this.me.x, this.me.z), this.me.z);
    fig.walking = next ? 0.8 : 0;
    if (next) { this.face.x = next.x; this.face.z = next.z; fig.faceTo = this.face; }
    if (!this.walk.done) return;
    if (this.state === 'in') this.setDown();
    else {
      this.bag.drop(fig.root);
      if (this.cart) this.bag.drop(this.cart);
      this.fig = null; this.cart = null;
      this.state = 'away';
    }
  }

  get present(): string | null { return this.state === 'away' ? null : this.state; }

  private async browse(): Promise<void> {
    const ctx = this.ctx;
    if (!this.fig || this.state !== 'here' || !begin(ctx, 'talk')) return;
    let pick: Species | null = null;
    let price = 0;
    try {
      const sp = SPECIES.find((s) => s.id === this.special)!;
      const off = Math.round(sp.price * 0.8);
      const list = SPECIES.map((s) => ({ s, price: s.id === this.special ? off : s.price }));
      const i = await talk(ctx, this.fig, { zh: '宠物贩', en: 'Pet seller' }, [
        { zh: '瞧一瞧看一看！小狗小猫、兔子鸭子，还有会说话的鹦鹉！', en: 'Come and see! Puppies, kittens, rabbits, ducks — and a talking parrot!' },
        { zh: `今天${sp.zh}便宜，只要 ${off} 文。先说好：得有窝才能领回去。`, en: `The ${sp.en.toLowerCase()} is cheap today — only ${off}. Mind you, it needs a home of its own first.`, choices: [...list.map((x) => ({ zh: `${x.s.zh} · ${x.price} 文`, en: `${x.s.en} · ${x.price}` })), { zh: '只是看看', en: 'Just looking' }] },
      ]);
      if (i >= 0 && i < list.length) { pick = list[i].s.id; price = list[i].price; }
    } finally {
      end(ctx, 'talk');
    }
    if (pick) await adopt(ctx, pick, price, { x: GATE_IN.x - 0.2, z: GATE_IN.z + 0.8 }); // in through the gate
  }

  dispose(): void {
    this.off?.();
  }
}
