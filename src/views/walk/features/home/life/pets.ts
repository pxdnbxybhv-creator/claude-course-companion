// The pets at home, each with its own mind: the dog runs to greet you, fetches the embroidered ball,
// sits, spins and digs up coins; the tabby naps wherever the sun is and pointedly ignores you; the
// rabbit hops and nibbles; the crane paces the pond and dances; the ducks waddle in a line and go for
// a paddle; the koi circle and crowd to your side; the parrot calls out the homestead's name (or what
// you taught it); the goat grazes, and every so often backs up and butts the fence.
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../../types';
import type { Bag } from '../../kit';
import { inked } from '../../kit';
import { merge, part } from '../../geo';
import { feedPet, home, petPet, type HomeItem, type Pet } from '../../../../../app/home';
import { earn, record } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { hashString, makeRng, type Rng } from '../../../../../core/rng';
import { begin, end } from '../../minigames/ui';
import { Actor, type Mode } from './actor';
import { koiSchool, type KoiSchool } from './models';
import { Bubble, Fx } from './fx';
import { arrivals, feed, renamePetFlow, toggleFollow } from './actions';
import { book, countStroke, saveBook, strokesToday } from './book';
import { nameCard } from './card';
import { clampToPlot, doorOf, fencePoint, freeNear, houses, inPlot, occupancy, PLOT, type Placed, type Spot } from './plot';
import { itemPoint, PERCH_Y as PERCH_BAR, POND_WATER_Y } from '../catalog';
import { digCoins, FOOD_PRICE, hasTrick, hearts, isSpecies, LOVE, SPECIES_DEF, strokeGain, type SpeciesDef, type Species } from './logic';
import { HOME_PLOT } from '../../../map';
import * as snd from './sound';

/** How high a parrot sits on its perch (m above the ground): on the bar. */
export const PERCH_Y = PERCH_BAR + 0.025;

const POEMS = [
  ['床前明月光', 'Before my bed, bright moonlight'],
  ['春眠不觉晓', 'Spring sleep, unaware of dawn'],
  ['白日依山尽', 'The white sun sets behind the hills'],
  ['两个黄鹂鸣翠柳', 'Two orioles sing in the green willow'],
  ['举杯邀明月', 'I raise my cup to the moon'],
  ['鹅鹅鹅，曲项向天歌', 'Goose, goose, goose — neck curved, singing to the sky'],
];

/** The animals' words in English. */
export const WORDS: Record<string, string> = {
  '汪！': 'Woof!', '汪汪！': 'Woof woof!', '哼': 'Hmph', '咕噜咕噜': 'Purr…', '嘎！': 'Quack!', '咚！': 'Thud!', '喵': 'Mew', '喵……': 'Mew…',
  '哈……哈……': 'Pant… pant…', '喵！': 'Meow!', '蹦！': 'Boing!', '唳！': 'Kroo!', '嘎嘎！': 'Quack quack!', '好！': 'Bravo!', '咩！': 'Baa!', '你好你好！': 'Hello hello!', '走走走！': 'Let’s go!', '欢迎回家！': 'Welcome home!',
};

const TEACH = ['恭喜发财', '欢迎回家', '你好你好', '吃了吗', '好看好看', '主人万福'];

export interface Env {
  px: number; pz: number; py: number;
  /** The walker is inside the plot. */
  inside: boolean;
  night: boolean;
  still: boolean;
  t: number;
}

interface Brain {
  uid: string;
  pet: Pet;
  def: SpeciesDef;
  a: Actor;
  rng: Rng;
  anchor: Spot;
  target: Spot | null;
  wait: number;
  plan: string;
  t: number;
  speakCd: number;
  greeted: boolean;
  timer: number;
  aux: Spot | null;
  it: Interactable;
  offIt: () => void;
  label: string;
  trickMode: Mode;
  labelT: number;
  /** The goat's fence: the outward normal where it will butt, and whether it is charging. */
  fn: Spot;
  charging: boolean;
}

const dist = (a: { x: number; z: number }, x: number, z: number) => Math.hypot(a.x - x, a.z - z);

export class HomePets {
  private brains = new Map<string, Brain>();
  private occ = new Set<number>();
  private ponds: Placed[] = [];
  private ring: { x: number; z: number; r: number; y: number } | null = null;
  private catbed: Placed | null = null;
  private perch: Placed | null = null;
  private pen: HomeItem | null = null;
  private ducks: Brain[] = [];
  private koi: KoiSchool;
  private koiState: { rho: number; th: number; w: number; leap: number }[] = [];
  private koiFed = 0;
  private koiIt: { off: () => void; pos: T.Vector3 } | null = null;
  private dummy: T.Object3D;
  private ball: T.Mesh;
  private ballFly: { t: number; from: Spot & { y: number }; to: Spot; holder: Brain | null } | null = null;
  private ground = (x: number, z: number) => this.ctx.groundY(x, z);

  constructor(private bag: Bag, private ctx: WorldCtx, private group: T.Group, private fx: Fx, private bubble: Bubble) {
    const { THREE } = ctx;
    this.dummy = new THREE.Object3D();
    this.koi = koiSchool(bag, 10);
    bag.add(this.koi.mesh, group);
    // the embroidered ball 绣球 for fetch
    this.ball = inked(ctx, merge(THREE, [
      part(THREE, new THREE.IcosahedronGeometry(0.075, 1), '#c8454a'),
      part(THREE, new THREE.TorusGeometry(0.076, 0.012, 4, 14), '#e2b24a', { r: [Math.PI / 2, 0, 0] }),
      part(THREE, new THREE.TorusGeometry(0.076, 0.012, 4, 14), '#e2b24a'),
    ]), { width: 0.006 });
    this.ball.visible = false;
    bag.add(this.ball, group);
  }

  /** Match the animals to home.value (the one walking with you is not at home). */
  sync(): void {
    const h = home.value;
    this.occ = occupancy(h.items, 0, (it) => it.kind === 'pond');
    this.ponds = houses(h.items, 'pond');
    const want = new Map<string, Pet>();
    for (const p of h.pets) if (!p.follow && isSpecies(p.species) && p.species !== 'koi') want.set(p.uid, p);
    for (const [uid, b] of this.brains) {
      if (!want.has(uid)) { this.drop(b); this.brains.delete(uid); }
    }
    for (const p of want.values()) {
      const b = this.brains.get(p.uid);
      if (b) { b.pet = p; b.anchor = this.anchorFor(p, b.anchor); continue; }
      this.brains.set(p.uid, this.make(p));
    }
    // koi: as many as live in ponds (drawn only when there is a pond)
    const nKoi = this.ponds.length ? h.pets.filter((p) => p.species === 'koi').length : 0;
    this.setKoi(nKoi);
    const p0 = this.ponds[0];
    this.ring = p0 ? { x: p0.x, z: p0.z, r: (Math.min(p0.w, p0.d) / 3) * 1.25, y: this.ground(p0.x, p0.z) + POND_WATER_Y } : null;
    this.catbed = houses(h.items, 'catbed')[0] ?? null;
    this.perch = houses(h.items, 'perch')[0] ?? null;
    this.pen = houses(h.items, 'pen')[0]?.item ?? null;
    this.ducks = [...this.brains.values()].filter((b) => b.def.id === 'duck');
  }

  /** Where a pet is at (x, z), heading: the follower hand-off. */
  where(uid: string): { x: number; z: number; heading: number } | null {
    const b = this.brains.get(uid);
    return b ? { x: b.a.x, z: b.a.z, heading: b.a.heading } : null;
  }

  private anchorFor(p: Pet, prev?: Spot): Spot {
    const d = SPECIES_DEF[p.species as Species];
    const hs = houses(home.value.items, d.house);
    if (!hs.length) return prev ?? { x: HOME_PLOT.x + 3, z: HOME_PLOT.z };
    // several of a kind share their homes in turn
    const same = home.value.pets.filter((x) => x.species === p.species);
    const k = Math.max(0, same.findIndex((x) => x.uid === p.uid));
    const hsel = hs[Math.floor(k / d.perHouse) % hs.length];
    if (d.house === 'pond' || d.house === 'pen') return { x: hsel.x, z: hsel.z };
    if (d.house === 'perch') return itemPoint(hsel.item, 0.12 - (k % 2) * 0.24, 0);
    return doorOf(hsel.item);
  }

  private make(p: Pet): Brain {
    const { THREE } = this.ctx;
    const species = p.species as Exclude<Species, 'koi'>;
    const a = new Actor(this.bag, species, p.uid, this.group);
    const anchor = this.anchorFor(p);
    const rng = makeRng(hashString(`brain:${p.uid}`));
    const from = arrivals.get(p.uid);
    arrivals.delete(p.uid);
    let at = from ?? freeNear(this.occ, anchor.x + rng.range(-1.5, 1.5), anchor.z + rng.range(-1.5, 1.5), 4);
    if (species === 'parrot') at = anchor;
    a.place(at.x, this.ground(at.x, at.z), at.z, rng.range(-Math.PI, Math.PI));
    if (species === 'parrot') a.y += PERCH_Y;
    const pos = new THREE.Vector3(a.x, a.y, a.z);
    const b: Brain = {
      uid: p.uid, pet: p, def: SPECIES_DEF[species], a, rng, anchor, target: null, wait: rng.range(0.5, 3), plan: 'wander', t: 0,
      speakCd: 3, greeted: false, timer: rng.range(20, 40), aux: null, label: '',
      it: null as unknown as Interactable, offIt: () => {}, trickMode: 'sit', fn: { x: 0, z: 0 }, charging: false, labelT: 0,
    };
    const radius = species === 'crane' ? 2.2 : species === 'parrot' ? 2.4 : species === 'goat' ? 2 : 1.7;
    b.it = {
      id: `home-pet:${p.uid}`, position: pos, radius,
      labelZh: '', labelEn: '', actionZh: '摸摸', actionEn: 'Pet',
      act: () => this.menu(b),
    };
    this.relabel(b);
    b.offIt = this.bag.interact(b.it);
    return b;
  }

  private relabel(b: Brain): void {
    const p = home.value.pets.find((x) => x.uid === b.uid) ?? b.pet;
    const n = hearts(p.love);
    const hs = '♥'.repeat(n) + '♡'.repeat(5 - n);
    const key = `${p.name}|${n}`;
    if (key === b.label) return;
    b.label = key;
    b.it.labelZh = `${p.name || b.def.zh} · ${b.def.zh} ${hs}`;
    b.it.labelEn = `${p.name || b.def.en} · ${b.def.en} ${hs}`;
  }

  private drop(b: Brain): void {
    b.offIt();
    if (this.ballFly?.holder === b) { this.ballFly = null; this.ball.visible = false; }
    this.bag.drop(b.a.m.root);
    b.a.dispose();
  }

  private setKoi(n: number): void {
    const s = this.koiState;
    while (s.length < n && s.length < this.koi.mesh.count + 10) {
      const r = makeRng(hashString(`koi:${s.length}`));
      s.push({ rho: r.range(0.35, 1), th: r.range(0, Math.PI * 2), w: r.range(0.25, 0.5) * (r() < 0.5 ? -1 : 1), leap: -1 });
    }
    s.length = Math.min(n, 10);
    this.koi.mesh.count = s.length;
    this.koi.mesh.visible = s.length > 0;
    const pond = this.ponds[0];
    if (pond && s.length && !this.koiIt) {
      const pos = new this.ctx.THREE.Vector3(pond.x, this.ground(pond.x, pond.z), pond.z);
      const off = this.bag.interact({
        id: 'home-koi', position: pos, radius: Math.max(pond.w, pond.d) / 2 + 1.4,
        labelZh: '锦鲤', labelEn: 'Koi', actionZh: `撒鱼食 · ${FOOD_PRICE} 文`, actionEn: `Feed · ${FOOD_PRICE} coins`,
        act: () => this.feedKoi(),
      });
      this.koiIt = { off, pos };
    } else if ((!pond || !s.length) && this.koiIt) {
      this.koiIt.off();
      this.koiIt = null;
    }
    if (this.koiIt && pond) this.koiIt.pos.set(pond.x, this.ground(pond.x, pond.z), pond.z);
  }

  private feedKoi(): void {
    const koi = home.value.pets.filter((p) => p.species === 'koi');
    if (!koi.length) return;
    const hungry = koi.filter((p) => p.fed !== today.value);
    if (!hungry.length) {
      this.koiFed = 6;
      this.ctx.hud.toast('锦鲤今天吃饱了，还是游过来凑热闹', 'The koi have eaten today — they gather anyway', 2200);
      return;
    }
    // one handful feeds the whole pond
    if (!feed(this.ctx, hungry[0].uid)) return;
    for (const p of hungry.slice(1)) {
      feedPet(p.uid); // the rest eat from the same handful
    }
    this.ctx.player.emote('throw');
    this.koiFed = 10;
    const leap = this.koiState[Math.floor((this.ctx.env.date.getSeconds() + koi.length) % Math.max(1, this.koiState.length))];
    if (leap && hasTrick('koi', Math.max(...koi.map((k) => k.love)), 'leap')) leap.leap = 0;
    record('home-koi');
    this.ctx.hud.toast('锦鲤争食，水面泛起一圈圈涟漪', 'The koi jostle for food; rings spread across the water', 2400);
  }

  // ───────────────────────────── talking to a pet ─────────────────────────────

  private async menu(b: Brain): Promise<void> {
    const ctx = this.ctx;
    if (!begin(ctx, 'talk')) return;
    try {
      const p = home.value.pets.find((x) => x.uid === b.uid);
      if (!p) return;
      const fed = p.fed === today.value;
      const mood = this.moodLine(b, p);
      type C = { zh: string; en: string; run: () => void | Promise<void> };
      const cs: C[] = [];
      cs.push({ zh: '摸摸它', en: 'Stroke', run: () => this.stroke(b) });
      if (!fed) cs.push({ zh: `喂食 · ${FOOD_PRICE} 文`, en: `Feed · ${FOOD_PRICE} coins`, run: () => { if (feed(ctx, b.uid)) this.fed(b); } });
      for (const c of this.trickChoices(b, p)) cs.push(c);
      if (b.def.follows) cs.push({ zh: '带它出门', en: 'Take it along', run: () => toggleFollow(ctx, b.uid) });
      cs.push({ zh: '改个名字', en: 'Rename', run: () => renamePetFlow(ctx, b.uid) });
      const i = await ctx.hud.say({
        nameZh: `${p.name} · ${b.def.zh}`, nameEn: `${p.name} · ${b.def.en}`,
        zh: `${mood.zh}\n亲密 ${'♥'.repeat(hearts(p.love))}${'♡'.repeat(5 - hearts(p.love))}${fed ? ' · 今天吃过了' : ' · 还饿着呢'}`,
        en: `${mood.en}\nAffection ${'♥'.repeat(hearts(p.love))}${'♡'.repeat(5 - hearts(p.love))}${fed ? ' · fed today' : ' · still hungry'}`,
        choices: [...cs.map((c) => ({ zh: c.zh, en: c.en })), { zh: '走开', en: 'Leave' }],
      });
      if (i >= 0 && i < cs.length) await cs[i].run();
    } finally {
      end(ctx, 'talk');
    }
  }

  private moodLine(b: Brain, p: Pet): { zh: string; en: string } {
    const n = p.name || b.def.zh;
    const love = p.love;
    switch (p.species as Species) {
      case 'dog': return love >= 60 ? { zh: `${n}扑到你脚边，尾巴摇成了一朵花。`, en: `${n} throws itself at your feet, tail a blur.` } : { zh: `${n}冲你摇摇尾巴，歪着头看你。`, en: `${n} wags at you and tilts its head.` };
      case 'cat': return love >= 60 ? { zh: `${n}勉为其难地蹭了蹭你的手。`, en: `${n} deigns to rub against your hand.` } : { zh: `${n}眯着眼看了你一眼，又闭上了。`, en: `${n} opens one eye, looks at you, and closes it again.` };
      case 'rabbit': return { zh: `${n}竖起耳朵，鼻子一抽一抽的。`, en: `${n} pricks up its ears, nose twitching.` };
      case 'crane': return { zh: `${n}低头看你，丹顶在阳光下格外鲜红。`, en: `${n} looks down at you, its red crown bright in the sun.` };
      case 'duck': return { zh: `${n}嘎嘎两声，一摇一摆地凑过来。`, en: `${n} quacks twice and waddles over.` };
      case 'parrot': return { zh: `${n}歪着头：「${this.parrotLine(b.uid, 0)}」`, en: `${n} cocks its head: “${this.parrotLine(b.uid, 0)}”` };
      case 'goat': return love >= 50 ? { zh: `${n}用角轻轻顶了顶你，算是打招呼。`, en: `${n} nudges you gently with its horns — hello.` } : { zh: `${n}嚼着草，斜眼看你。`, en: `${n} chews and eyes you sideways.` };
      default: return { zh: `${n}看着你。`, en: `${n} looks at you.` };
    }
  }

  private trickChoices(b: Brain, p: Pet): { zh: string; en: string; run: () => void | Promise<void> }[] {
    const out: { zh: string; en: string; run: () => void | Promise<void> }[] = [];
    const has = (id: string) => hasTrick(p.species, p.love, id);
    switch (p.species as Species) {
      case 'dog':
        out.push({ zh: '丢绣球', en: 'Throw the ball', run: () => this.throwBall(b) });
        if (has('sit')) out.push({ zh: '坐下！', en: 'Sit!', run: () => this.trick(b, 'sit', 4, () => snd.bark(0)) });
        if (has('spin')) out.push({ zh: '转个圈！', en: 'Spin!', run: () => this.trick(b, 'spin', 1.4, () => snd.bark(0)) });
        if (has('dig') && book().dug[b.uid] !== today.value) out.push({ zh: '刨宝去！', en: 'Go dig!', run: () => this.startDig(b) });
        break;
      case 'cat':
        if (has('roll')) out.push({ zh: '翻个肚皮', en: 'Belly up', run: () => this.trick(b, 'roll', 3.2, () => snd.meow(0)) });
        if (has('knead')) out.push({ zh: '踩踩奶', en: 'Knead', run: () => this.trick(b, 'knead', 3, () => snd.meow(0)) });
        break;
      case 'rabbit':
        if (has('beg')) out.push({ zh: '作个揖', en: 'Beg', run: () => this.trick(b, 'beg', 3) });
        if (has('binky')) out.push({ zh: '跳一个', en: 'Binky!', run: () => this.trick(b, 'binky', 0.9) });
        break;
      case 'crane':
        if (has('dance')) out.push({ zh: '跳支舞', en: 'Dance', run: () => this.trick(b, 'dance', 6, () => snd.craneCall(0)) });
        if (has('call')) out.push({ zh: '鹤鸣九皋', en: 'Call', run: () => this.trick(b, 'call', 2.2, () => snd.craneCall(0)) });
        break;
      case 'duck':
        if (has('chorus')) out.push({ zh: '齐声唱', en: 'Chorus', run: () => this.chorus() });
        break;
      case 'parrot':
        if (has('teach')) out.push({ zh: '教它一句话', en: 'Teach it a line', run: () => this.teach(b) });
        if (has('poem')) out.push({ zh: '背首诗', en: 'Recite', run: () => this.speak(b, 2) });
        break;
      case 'goat':
        out.push({ zh: '去顶篱笆', en: 'Butt the fence', run: () => { b.plan = 'butt'; b.t = 0; b.aux = null; } });
        if (has('climb')) out.push({ zh: '蹦一个', en: 'Jump', run: () => this.trick(b, 'climb', 1.4, () => snd.bleat(0)) });
        break;
      default:
        break;
    }
    return out;
  }

  private stroke(b: Brain): void {
    const ctx = this.ctx;
    const p = home.value.pets.find((x) => x.uid === b.uid);
    if (!p) return;
    ctx.player.emote('pet');
    const done = strokesToday(b.uid, today.value);
    const gain = strokeGain(p.love, done);
    if (gain > 0) { petPet(b.uid, gain); countStroke(b.uid, today.value); }
    record('home-pet');
    this.fx.hearts(b.a.x, b.a.y + b.a.m.height, b.a.z, gain > 0 ? 3 : 1);
    const sp = p.species as Species;
    if (sp === 'dog') { snd.bark(0); b.a.happy = 1; this.say(b, '汪！', 1400); }
    else if (sp === 'cat') {
      if (p.love < 30) { this.say(b, '哼', 1200); b.target = null; b.wait = 0; b.a.setMode('idle'); ctx.hud.toast(`${p.name}甩甩尾巴走开了`, `${p.name} flicks its tail and walks off`, 1800); }
      else { snd.meow(0); this.say(b, '咕噜咕噜', 1600); }
    } else if (sp === 'goat') snd.bleat(0);
    else if (sp === 'duck') snd.quack(0, 1);
    else if (sp === 'crane') snd.craneCall(0);
    else if (sp === 'parrot') this.speak(b, 1);
    if (done >= 4) ctx.hud.toast(`${p.name}今天已经被摸够了`, `${p.name} has had enough fuss for today`, 1600);
  }

  private fed(b: Brain): void {
    b.a.setMode('eat');
    b.plan = 'eat'; b.t = 0;
    this.fx.hearts(b.a.x, b.a.y + b.a.m.height, b.a.z, 2);
    this.ctx.player.emote('pet');
  }

  private trick(b: Brain, mode: Mode | 'binky' | 'climb', secs: number, sound?: () => void): void {
    b.plan = 'trick'; b.t = 0; b.timer = secs;
    b.target = null;
    b.trickMode = mode as Mode;
    sound?.();
    record('home-trick');
  }

  private chorus(): void {
    let k = 0;
    for (const b of this.brains.values()) {
      if (b.def.id !== 'duck') continue;
      const bb = b;
      this.bag.later(k * 350, () => { this.say(bb, '嘎！', 900); snd.quack(0, 1); bb.a.setMode('call'); bb.plan = 'trick'; bb.t = 0; bb.timer = 0.8; bb.trickMode = 'call'; });
      k++;
    }
    record('home-trick');
  }

  private async teach(b: Brain): Promise<void> {
    const line = await nameCard(this.ctx, { glyph: '鹦', titleZh: '教它一句话', titleEn: 'Teach it a line', noteZh: '说一遍，它就记住了。', noteEn: 'Say it once and it remembers.', suggestions: TEACH, value: book().lines[b.uid] ?? '' });
    if (!line) return;
    saveBook((x) => { x.lines[b.uid] = line; });
    this.speak(b, 1);
  }

  /** The parrot's line: 0 = the homestead's name (or what it learnt), 1 = what it learnt, 2 = a poem. */
  private parrotLine(uid: string, which: number): string {
    const learnt = book().lines[uid];
    const name = home.value.name;
    if (which === 2) return POEMS[Math.floor(this.ctx.env.date.getMinutes() / 10) % POEMS.length][0];
    if (which === 1 && learnt) return learnt;
    return name ? `「${name}」到了！` : learnt || '欢迎回家！';
  }

  private speak(b: Brain, which: number): void {
    const s = this.parrotLine(b.uid, which);
    this.say(b, s, 2600);
    snd.squawk(0, Math.min(8, s.length));
    b.a.setMode('idle');
  }

  private say(b: Brain, text: string, ms: number): void {
    this.bubble.say(this.ctx.lang === 'zh' ? text : WORDS[text] ?? text, b.a.m.root, b.a.m.height + 0.25, ms);
  }

  private throwBall(b: Brain): void {
    const ctx = this.ctx;
    const pp = ctx.player.position;
    const h = ctx.player.heading;
    let to = clampToPlot({ x: pp.x + Math.sin(h) * 6, z: pp.z + Math.cos(h) * 6 }, 1.4);
    to = freeNear(this.occ, to.x, to.z, 3);
    ctx.player.emote('throw');
    this.ball.visible = true;
    this.ballFly = { t: 0, from: { x: pp.x, y: pp.y + 1.1, z: pp.z }, to, holder: null };
    b.plan = 'fetch'; b.t = 0; b.target = null;
    b.a.happy = 1;
    snd.bark(0);
  }

  private startDig(b: Brain): void {
    const spot = freeNear(this.occ, b.a.x + b.rng.range(-2, 2), b.a.z + b.rng.range(-2, 2), 3);
    b.plan = 'dig'; b.t = 0; b.aux = spot;
  }

  // ───────────────────────────── every frame ─────────────────────────────

  update(dt: number, t: number, env: Env): void {
    this.updateBall(dt);
    let duckIdx = 0;
    let lead: Brain | null = null;
    for (const b of this.brains.values()) {
      b.t += dt;
      b.speakCd -= dt;
      b.a.look = null;
      b.a.aloof = false;
      b.a.sink = 0;
      const pd = dist(b.a, env.px, env.pz);
      if (pd < 5) b.a.lookAt(env.px, env.pz);
      b.a.happy += ((pd < 4 ? 0.8 : 0.25) - b.a.happy) * Math.min(1, dt * 0.8);
      if (b.plan === 'trick') this.trickStep(b, dt);
      else if (b.plan === 'eat') { b.a.halt(dt); b.a.setMode('eat'); if (b.t > 3) { b.plan = 'wander'; b.a.setMode('idle'); } }
      else {
        switch (b.def.id) {
          case 'dog': this.dog(b, dt, env, pd); break;
          case 'cat': this.cat(b, dt, env, pd); break;
          case 'rabbit': this.rabbit(b, dt, env); break;
          case 'crane': this.crane(b, dt, env); break;
          case 'duck': this.duck(b, dt, env, lead, duckIdx); if (!lead) lead = b; duckIdx++; break;
          case 'parrot': this.parrot(b, dt, env, pd); break;
          case 'goat': this.goat(b, dt, env); break;
          default: break;
        }
      }
      b.a.animate(dt, t, env.still);
      b.it.position.set(b.a.x, b.a.y, b.a.z);
      b.labelT -= dt;
      if (b.labelT <= 0) { b.labelT = 1.5; this.relabel(b); }
    }
    this.updateKoi(dt, t, env);
  }

  private wander(b: Brain, dt: number, R: number, speed: number, rest: 'idle' | 'sleep' | 'graze' | 'eat' | 'groom' = 'idle', restFor: [number, number] = [2, 6]): void {
    const a = b.a;
    if (b.target) {
      a.setMode('idle');
      const left = a.walk(dt, b.target.x, b.target.z, speed, this.ground);
      if (left < 0.2 || b.t > 14) { b.target = null; b.wait = b.rng.range(restFor[0], restFor[1]); b.t = 0; a.setMode(rest); }
    } else {
      a.halt(dt);
      b.wait -= dt;
      if (b.wait <= 0) {
        const ang = b.rng.range(0, Math.PI * 2), r = b.rng.range(0.6, R);
        const c = clampToPlot({ x: b.anchor.x + Math.cos(ang) * r, z: b.anchor.z + Math.sin(ang) * r }, 0.8);
        b.target = this.occ.has(this.cellKey(c)) ? freeNear(this.occ, c.x, c.z, 3) : c;
        b.t = 0;
      }
    }
  }

  private cellKey(p: Spot): number {
    return Math.floor(p.x - PLOT.x0) * 256 + Math.floor(p.z - PLOT.z0);
  }

  /** Go home and sleep (at the house's edge nearest the gate). */
  private sleepAtHome(b: Brain, dt: number, env: Env, pd: number): void {
    const a = b.a;
    // the cat curls up in its basket; the rest settle at their door (the goat inside its pen)
    const bed = b.def.id === 'cat' ? this.catbed : null;
    const spot = b.aux ?? (bed ? { x: bed.x, z: bed.z } : { x: b.anchor.x, z: b.anchor.z });
    b.aux = spot;
    const left = a.walk(dt, spot.x, spot.z, 1.1, (x, z) => this.ground(x, z) + (bed && Math.hypot(x - bed.x, z - bed.z) < 0.35 ? 0.2 : 0), 0.1);
    if (left < 0.25) {
      a.setMode(pd < 2 && b.def.id === 'dog' ? 'idle' : 'sleep');
      if (!env.still && a.mode === 'sleep' && Math.sin(env.t * 0.9 + b.uid.length) > 0.995) this.fx.zzz(a.x, a.y + a.m.height * 0.8, a.z);
    } else a.setMode('idle');
  }

  private dog(b: Brain, dt: number, env: Env, pd: number): void {
    const a = b.a;
    if (b.plan === 'fetch') return this.fetchStep(b, dt, env);
    if (b.plan === 'dig') return this.digStep(b, dt);
    if (env.night) return this.sleepAtHome(b, dt, env, pd);
    b.aux = null;
    if (env.inside && pd < 10) {
      if (!b.greeted) { b.greeted = true; snd.bark(pd); this.say(b, '汪汪！', 1300); }
      const dx = a.x - env.px, dz = a.z - env.pz, L = Math.hypot(dx, dz) || 1;
      const want = { x: env.px + (dx / L) * 1.3, z: env.pz + (dz / L) * 1.3 };
      if (pd > 2) { a.setMode('idle'); a.walk(dt, want.x, want.z, pd > 4 ? 3.8 : 2.2, this.ground); b.t = 0; }
      else {
        a.halt(dt);
        a.happy = 1;
        a.heading += Math.atan2(Math.sin(Math.atan2(env.px - a.x, env.pz - a.z) - a.heading), Math.cos(Math.atan2(env.px - a.x, env.pz - a.z) - a.heading)) * Math.min(1, dt * 4);
        a.setMode(b.t > 3 && hasTrick('dog', b.pet.love, 'sit') ? 'sit' : 'idle');
      }
      return;
    }
    if (pd > 14) b.greeted = false;
    this.wander(b, dt, 5, 1.3, b.rng() < 0.3 ? 'sleep' : 'idle', [3, 8]);
  }

  private fetchStep(b: Brain, dt: number, env: Env): void {
    const a = b.a;
    const f = this.ballFly;
    if (!f) { b.plan = 'wander'; return; }
    a.happy = 1;
    if (f.t < 1 && !f.holder) { a.halt(dt); a.look = f.to; a.setMode('idle'); return; } // watching it fly
    if (!f.holder) {
      a.setMode('idle');
      const left = a.walk(dt, f.to.x, f.to.z, 4.4, this.ground, 0.25);
      if (left < 0.3) { f.holder = b; snd.bark(0); }
      return;
    }
    // bring it back
    const dx = a.x - env.px, dz = a.z - env.pz, L = Math.hypot(dx, dz) || 1;
    const left = a.walk(dt, env.px + (dx / L) * 0.9, env.pz + (dz / L) * 0.9, 3.4, this.ground, 0.2);
    if (left < 0.25 || b.t > 20) {
      f.holder = null;
      this.ballFly = null;
      this.ball.position.set(a.x + Math.sin(a.heading) * 0.35, this.ground(a.x, a.z) + 0.075, a.z + Math.cos(a.heading) * 0.35);
      this.bag.later(1800, () => { if (!this.ballFly) this.ball.visible = false; });
      b.plan = 'trick'; b.t = 0; b.timer = 2.5;
      b.trickMode = 'sit';
      const p = home.value.pets.find((x) => x.uid === b.uid);
      if (p && strokesToday(b.uid, today.value) < LOVE.strokesPerDay) { petPet(b.uid, LOVE.play); countStroke(b.uid, today.value); }
      this.fx.hearts(a.x, a.y + a.m.height, a.z, 2);
      this.say(b, '汪！', 1200);
      snd.bark(0);
      record('home-fetch');
    }
  }

  private updateBall(dt: number): void {
    const f = this.ballFly;
    if (!f) return;
    f.t += dt / 0.8;
    if (f.holder) {
      const a = f.holder.a;
      this.ball.position.set(a.x + Math.sin(a.heading) * 0.42, a.y + 0.43, a.z + Math.cos(a.heading) * 0.42);
      return;
    }
    const k = Math.min(1, f.t);
    const gy = this.ground(f.to.x, f.to.z) + 0.075;
    this.ball.position.set(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (gy - f.from.y) * k + Math.sin(k * Math.PI) * 1.6, f.from.z + (f.to.z - f.from.z) * k);
    this.ball.rotation.x += dt * 8;
    if (k >= 1 && f.t < 1 + dt * 1.3) this.fx.puff(f.to.x, gy - 0.07, f.to.z, '#b89a6a', 3, 0.3);
  }

  private digStep(b: Brain, dt: number): void {
    const a = b.a;
    const spot = b.aux!;
    if (dist(a, spot.x, spot.z) > 0.3 && b.t < 10) { a.setMode('idle'); a.walk(dt, spot.x, spot.z, 2.6, this.ground, 0.2); b.timer = 2.6; return; }
    a.halt(dt);
    a.setMode('dig');
    b.timer -= dt;
    if (Math.floor(b.timer * 6) !== Math.floor((b.timer + dt) * 6)) this.fx.puff(a.x + Math.sin(a.heading) * 0.25, a.y, a.z + Math.cos(a.heading) * 0.25, '#9c7a52', 2, 0.9);
    if (b.timer <= 0) {
      const n = digCoins(today.value, b.uid);
      saveBook((x) => { x.dug[b.uid] = today.value; });
      earn(n);
      record('home-dig');
      this.fx.coins(a.x + Math.sin(a.heading) * 0.3, a.y, a.z + Math.cos(a.heading) * 0.3, 6);
      snd.chime();
      snd.bark(0);
      this.say(b, '汪汪！', 1500);
      this.ctx.hud.toast(`${b.pet.name}刨出了 ${n} 文铜钱！`, `${b.pet.name} dug up ${n} coins!`, 2600);
      b.plan = 'wander'; b.t = 0; b.aux = null;
    }
  }

  private trickStep(b: Brain, dt: number): void {
    const a = b.a;
    const mode = b.trickMode as string;
    a.halt(dt);
    b.timer -= dt;
    if (mode === 'binky' || mode === 'climb') {
      const k = 1 - Math.max(0, b.timer) / (mode === 'binky' ? 0.9 : 1.4);
      a.lift = Math.sin(Math.min(1, k * (mode === 'climb' ? 2 : 1)) * Math.PI) * (mode === 'binky' ? 0.35 : 0.5) * (mode === 'climb' ? Math.abs(Math.sin(k * Math.PI * 2)) : 1);
      if (mode === 'binky') a.heading += dt * 7;
      a.setMode('idle');
    } else a.setMode(b.trickMode);
    if (b.timer <= 0) { a.lift = 0; a.setMode('idle'); b.plan = 'wander'; b.t = 0; b.target = null; b.wait = 1; }
  }

  private cat(b: Brain, dt: number, env: Env, pd: number): void {
    const a = b.a;
    if (env.night) return this.sleepAtHome(b, dt, env, pd);
    if (pd < 2.6) { a.lookAt(env.px, env.pz); a.aloof = b.pet.love < 60; }
    // sunny spots: along the south fence and beside things, where the sun lingers
    if (!b.target && b.wait <= 0) {
      const sunny = [
        { x: PLOT.x0 + 2 + b.rng() * (HOME_PLOT.size - 4), z: PLOT.z1 - 1.2 },
        { x: b.anchor.x + b.rng.range(-2.5, 2.5), z: b.anchor.z + b.rng.range(0.8, 2.5) },
        { x: HOME_PLOT.x + b.rng.range(-6, 6), z: HOME_PLOT.z + b.rng.range(-6, 6) },
      ];
      const s = sunny[Math.floor(b.rng() * sunny.length)];
      b.target = freeNear(this.occ, s.x, s.z, 3);
      b.t = 0;
    }
    if (b.target) {
      a.setMode('idle');
      const left = a.walk(dt, b.target.x, b.target.z, 0.8, this.ground);
      if (left < 0.2 || b.t > 25) { b.target = null; b.wait = b.rng.range(20, 40); b.t = 0; a.setMode('sleep'); }
    } else {
      a.halt(dt);
      b.wait -= dt;
      // wake for a wash before moving on
      if (b.wait < 4 && a.mode === 'sleep') a.setMode('groom');
    }
  }

  private rabbit(b: Brain, dt: number, env: Env): void {
    if (env.night) return this.sleepAtHome(b, dt, env, 9);
    this.wander(b, dt, 3.5, 1.4, 'eat', [1.5, 4.5]);
  }

  /** The first pond: its centre, its water's radius and the water's surface height (set by sync). */
  private pondRing(): { x: number; z: number; r: number; y: number } | null {
    return this.ring;
  }

  private crane(b: Brain, dt: number, env: Env): void {
    const a = b.a;
    const ring = this.pondRing();
    const c = ring ?? { x: b.anchor.x, z: b.anchor.z, r: 1, y: 0 };
    if (env.night) {
      const ang = Math.atan2(HOME_PLOT.gate.z - c.z, HOME_PLOT.gate.x - c.x) + 0.6;
      const spot = { x: c.x + Math.cos(ang) * (c.r + 0.6), z: c.z + Math.sin(ang) * (c.r + 0.6) };
      if (a.walk(dt, spot.x, spot.z, 0.5, this.ground) < 0.2) a.setMode('sleep'); else a.setMode('idle');
      return;
    }
    b.timer -= dt;
    if (b.plan === 'dance') {
      a.halt(dt); a.setMode('dance');
      if (b.t > 7) { b.plan = 'wander'; b.t = 0; a.setMode('idle'); b.timer = b.rng.range(40, 70); }
      return;
    }
    if (b.timer <= 0 && hasTrick('crane', b.pet.love, 'dance')) { b.plan = 'dance'; b.t = 0; snd.craneCall(dist(a, env.px, env.pz)); return; }
    if (!b.target && b.wait <= 0) {
      const ang = Math.atan2(a.z - c.z, a.x - c.x) + b.rng.range(0.5, 1.4) * (b.rng() < 0.5 ? -1 : 1);
      const r = c.r + b.rng.range(0.5, 1.2);
      b.target = clampToPlot({ x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r });
      b.t = 0;
    }
    if (b.target) {
      a.setMode('idle');
      if (a.walk(dt, b.target.x, b.target.z, 0.5, this.ground) < 0.2 || b.t > 16) { b.target = null; b.wait = b.rng.range(2, 5); a.setMode('graze'); }
    } else { a.halt(dt); b.wait -= dt; }
  }

  private duck(b: Brain, dt: number, env: Env, lead: Brain | null, idx: number): void {
    const a = b.a;
    const ring = this.pondRing();
    const water = ring ? ring.y - 0.03 : 0;
    const inPond = (x: number, z: number) => !!ring && Math.hypot(x - ring.x, z - ring.z) < ring.r - 0.25;
    const ground = (x: number, z: number) => (inPond(x, z) ? water : this.ground(x, z));
    if (env.night) { b.aux = b.aux ?? freeNear(this.occ, b.anchor.x + 0.8 + idx * 0.35, b.anchor.z + 0.9, 3); if (a.walk(dt, b.aux.x, b.aux.z, 0.9, this.ground) < 0.2) a.setMode('sleep'); else a.setMode('idle'); return; }
    b.aux = null;
    if (lead) {
      // fall in behind the one ahead
      const ahead = this.ducks[idx - 1] ?? lead;
      const tx = ahead.a.x - Math.sin(ahead.a.heading) * 0.5, tz = ahead.a.z - Math.cos(ahead.a.heading) * 0.5;
      const d = dist(a, tx, tz);
      if (d > 0.12) a.walk(dt, tx, tz, Math.min(2.2, ahead.a.speed * 1.15 + d * 0.8), ground, 0.05); else a.halt(dt);
    } else {
      // the leader: a stroll by the coop, then a paddle in the pond (if there is one), and back
      if (b.plan !== 'pond' && b.plan !== 'land') { b.plan = 'land'; b.timer = b.rng.range(15, 30); }
      b.timer -= dt;
      if (b.plan === 'land') {
        this.wander(b, dt, 3, 0.8, 'idle', [1, 3]);
        if (b.timer <= 0 && ring) { b.plan = 'pond'; b.timer = b.rng.range(25, 45); b.target = null; }
        else if (b.timer <= 0) b.timer = b.rng.range(15, 30);
      } else {
        if (!b.target || dist(a, b.target.x, b.target.z) < 0.3) {
          const ang = b.rng.range(0, Math.PI * 2), r = b.rng.range(0, Math.max(0.2, ring!.r - 0.6));
          b.target = { x: ring!.x + Math.cos(ang) * r, z: ring!.z + Math.sin(ang) * r };
        }
        a.walk(dt, b.target.x, b.target.z, 0.7, ground, 0.1);
        if (b.timer <= 0) { b.plan = 'land'; b.timer = b.rng.range(15, 30); b.target = null; }
      }
    }
    if (inPond(a.x, a.z)) { a.setMode('swim'); a.sink = 0.05; a.y = water; }
    else if (a.mode === 'swim') a.setMode('idle');
  }

  private parrot(b: Brain, dt: number, env: Env, pd: number): void {
    const a = b.a;
    const perch = this.perch;
    const at = perch ? b.anchor : HOME_PLOT;
    a.x = at.x; a.z = at.z;
    a.y = this.ground(at.x, at.z) + (perch ? PERCH_Y : 0);
    a.speed = 0;
    if (pd < 5) a.heading += Math.atan2(Math.sin(Math.atan2(env.px - a.x, env.pz - a.z) - a.heading), Math.cos(Math.atan2(env.px - a.x, env.pz - a.z) - a.heading)) * Math.min(1, dt * 2);
    if (env.night && pd > 3) { a.setMode('sleep'); return; }
    if (a.mode === 'sleep') a.setMode('idle');
    if (pd < 4.5 && b.speakCd <= 0 && !this.bubble.busy) {
      b.speakCd = 10 + b.rng() * 6;
      const learnt = book().lines[b.uid];
      this.speak(b, learnt && b.rng() < 0.5 ? 1 : hasTrick('parrot', b.pet.love, 'poem') && b.rng() < 0.25 ? 2 : 0);
    }
  }

  private goat(b: Brain, dt: number, env: Env): void {
    const a = b.a;
    const pen = this.pen;
    // inside its pen (if it has one): wander, graze, and butt the back rail; else the plot's fence
    const local = (lx: number, lz: number) => (pen ? itemPoint(pen, lx, lz) : { x: b.anchor.x + lx, z: b.anchor.z + lz });
    if (env.night) {
      const bed = b.aux ?? (b.aux = local(0.6, -0.3));
      if (a.walk(dt, bed.x, bed.z, 0.8, this.ground) < 0.2) a.setMode('sleep'); else a.setMode('idle');
      return;
    }
    if (b.plan !== 'butt' && b.aux) b.aux = null;
    b.timer -= dt;
    if (b.plan === 'butt') {
      if (!b.aux) {
        if (pen) {
          const lx = b.rng.range(-0.2, 0.9);
          b.aux = local(lx, -0.9);
          const back = local(lx, 0.5), hit = local(lx, -0.5);
          b.fn = { x: back.x, z: back.z };
          b.target = hit;
        } else {
          const f = fencePoint(a.x, a.z);
          b.aux = { x: f.x, z: f.z };
          b.fn = { x: f.x - f.nx * 2, z: f.z - f.nz * 2 };
          b.target = { x: f.x - f.nx * 0.45, z: f.z - f.nz * 0.45 };
        }
        b.t = 0;
        b.charging = false;
      }
      const back = b.fn, hit = b.target!;
      if (!b.charging && b.t < 6 && dist(a, back.x, back.z) > 0.2) {
        a.setMode('idle');
        a.walk(dt, back.x, back.z, 1.0, this.ground, 0.15);
        return;
      }
      if (!b.charging) { b.charging = true; b.t = 0; }
      a.setMode(b.t < 0.7 ? 'idle' : 'butt'); // a moment to glare, then charge
      if (b.t < 0.7) { a.halt(dt); a.heading += Math.atan2(Math.sin(Math.atan2(hit.x - a.x, hit.z - a.z) - a.heading), Math.cos(Math.atan2(hit.x - a.x, hit.z - a.z) - a.heading)) * Math.min(1, dt * 6); return; }
      const left = a.walk(dt, hit.x, hit.z, 3.2, this.ground, 0.08);
      if (left < 0.12 || b.t > 6) {
        b.charging = false;
        const pd = dist(a, env.px, env.pz);
        snd.thump(pd);
        this.fx.puff(b.aux.x, a.y, b.aux.z, '#b09a78', 5, 0.5);
        this.say(b, '咚！', 1100);
        b.plan = 'trick'; b.t = 0; b.timer = 1.3; b.trickMode = 'shake';
        b.aux = null; b.target = null;
        this.bag.later(1400, () => snd.bleat(pd));
        b.wait = 0;
      }
      return;
    }
    if (b.timer <= 0) { b.plan = 'butt'; b.timer = b.rng.range(25, 50); b.aux = null; return; }
    // wander (inside the pen) and graze
    if (b.target) {
      a.setMode('idle');
      const left = a.walk(dt, b.target.x, b.target.z, 0.6, this.ground);
      if (left < 0.15 || b.t > 12) { b.target = null; b.wait = b.rng.range(4, 9); b.t = 0; a.setMode('graze'); }
    } else {
      a.halt(dt);
      b.wait -= dt;
      if (b.wait <= 0) { b.target = pen ? local(b.rng.range(-0.8, 1.0), b.rng.range(-0.3, 0.5)) : clampToPlot(local(b.rng.range(-2.5, 2.5), b.rng.range(-2.5, 2.5))); b.t = 0; }
    }
  }

  private updateKoi(dt: number, t: number, env: Env): void {
    const n = this.koiState.length;
    if (!n) return;
    const ring = this.pondRing();
    if (!ring) return;
    this.koi.uniforms.uTime.value = t;
    this.koiFed = Math.max(0, this.koiFed - dt);
    const R = Math.max(0.3, ring.r - 0.3);
    const near = Math.hypot(env.px - ring.x, env.pz - ring.z) < ring.r + 2.4;
    const gather = near || this.koiFed > 0;
    const pa = Math.atan2(env.pz - ring.z, env.px - ring.x);
    // the pond's water is opaque: the koi swim right at the surface, backs and fins breaking it
    const water = ring.y + 0.004;
    const d = this.dummy;
    for (let i = 0; i < n; i++) {
      const k = this.koiState[i];
      let x: number, z: number, heading: number;
      if (gather) {
        // crowd to the side you stand on, jostling
        const th = pa + Math.sin(t * 0.8 + i * 1.7) * 0.5;
        const rr = R * (0.55 + 0.35 * ((i * 0.37) % 1)) + Math.sin(t * 1.3 + i) * 0.08;
        x = ring.x + Math.cos(th) * rr; z = ring.z + Math.sin(th) * rr;
        heading = Math.atan2(env.px - x, env.pz - z) + Math.sin(t * 2 + i) * 0.4;
      } else {
        k.th += k.w * dt;
        const rr = R * k.rho;
        x = ring.x + Math.cos(k.th) * rr; z = ring.z + Math.sin(k.th) * rr;
        heading = Math.atan2(-Math.sin(k.th) * Math.sign(k.w), Math.cos(k.th) * Math.sign(k.w));
      }
      let y = water, pitch = 0;
      if (k.leap >= 0) {
        k.leap += dt / 1.1;
        const q = Math.min(1, k.leap);
        y += Math.sin(q * Math.PI) * 0.7;
        pitch = (0.5 - q) * 2.2;
        if (k.leap >= 1) { k.leap = -1; this.fx.puff(x, water, z, '#e8f0ee', 5, 0.8); }
      }
      d.position.set(x, y, z);
      d.rotation.set(-pitch, heading, 0, 'YXZ');
      d.scale.setScalar(0.62);
      d.updateMatrix();
      this.koi.mesh.setMatrixAt(i, d.matrix);
    }
    this.koi.mesh.instanceMatrix.needsUpdate = true;
  }

  get count(): number { return this.brains.size; }

  /** DEV: a snapshot of every animal's state. */
  debug(): { uid: string; plan: string; mode: string; x: number; z: number; t: number }[] {
    return [...this.brains.values()].map((b) => ({ uid: b.uid, plan: b.plan, mode: b.a.mode, x: +b.a.x.toFixed(2), z: +b.a.z.toFixed(2), t: +b.t.toFixed(1) }));
  }
  get ballState(): unknown { return this.ballFly ? { t: this.ballFly.t, to: this.ballFly.to, held: !!this.ballFly.holder } : null; }

  dispose(): void {
    for (const b of this.brains.values()) this.drop(b);
    this.brains.clear();
    this.koiIt?.off();
  }

  /** Is (x, z) inside the plot? (the walker at home) */
  static inside(x: number, z: number): boolean { return inPlot(x, z, -0.5); }
}
