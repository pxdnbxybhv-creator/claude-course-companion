// The one pet that walks with you through the whole painting: it trots behind, waits when you stop,
// swims or flies where it can (the dog paddles, the duck floats, the crane and the parrot take wing)
// and waits on the shore where it can't (a cat does not swim), catching up in a puff when you get too
// far ahead. It never blocks you. It has its own opinions about your companion: the dog barks at Big
// Ginger, the crane dances with Chang'e, the tabby sits on the scholar's scroll, the parrot recites
// with the poet…
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../../types';
import type { Bag } from '../../kit';
import { home, petPet, type Pet } from '../../../../../app/home';
import { record } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { begin, end } from '../../minigames/ui';
import { CHARACTER, type CharacterId } from '../../../../../data/characters';
import { Actor, type Mode } from './actor';
import { Bubble, Fx } from './fx';
import { learntLine, parrotSays, WORDS } from './pets';
import { yieldPrompt } from './prompt';
import { feed, toggleFollow } from './actions';
import { countStroke, strokesToday } from './book';
import { FOOD_PRICE, hasTrick, hearts, isSpecies, SPECIES_DEF, strokeGain, type Species } from './logic';
import * as snd from './sound';

/** Ways round an obstacle: a little to either side, then more. */
const DEFLECT = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8];
/** Where to land when catching up: rings round the walker (m), and angles off straight behind. */
const CATCH_R = [1.3, 0.8, 1.9, 2.5];
const CATCH_A = [0, 0.5, -0.5, 1.1, -1.1, Math.PI / 2, -Math.PI / 2, Math.PI];
const MAX_SPEED: Record<Exclude<Species, 'koi'>, number> = { dog: 7.5, cat: 6.5, rabbit: 6, crane: 6, duck: 5, parrot: 9, goat: 6.5 };
const SWIMS = new Set(['dog', 'duck']);
const FLIES = new Set(['parrot', 'crane']);
/** How tall the walker is (for the parrot hovering by the head). */
const HEAD: Partial<Record<CharacterId, number>> = { cat: 0.62, rabbit: 0.75 };

interface Reaction { zh: string; en: string; toastZh?: string; toastEn?: string; mode?: Mode; sound?: () => void; /** Goes to stand right in front of you first. */ front?: boolean }

/** What this pet does beside this companion (once in a while, when you stand still). */
function reaction(species: Species, who: CharacterId, name: string): Reaction | null {
  const n = name;
  switch (species) {
    case 'dog':
      if (who === 'cat') return { zh: '汪汪汪！', en: 'Woof woof!', toastZh: `${n}冲着大橘直叫，大橘理都不理。`, toastEn: `${n} barks at Big Ginger, who ignores it completely.`, mode: 'sit', sound: () => snd.bark(0) };
      if (who === 'guan') return { zh: '汪！', en: 'Woof!', toastZh: `${n}对着关公摇尾巴，像个小兵。`, toastEn: `${n} wags at Lord Guan like a little soldier.`, mode: 'sit', sound: () => snd.bark(0, true) };
      if (who === 'gardener') return { zh: '刨刨', en: 'dig dig', toastZh: `${n}帮园丁刨了个坑，说是松土。`, toastEn: `${n} digs a hole to help the gardener — loosening the soil, it says.`, mode: 'dig' };
      if (who === 'rabbit') return { zh: '汪？', en: 'Woof?', toastZh: `${n}好奇地闻了闻玉兔的耳朵。`, toastEn: `${n} sniffs the Jade Rabbit’s ears, curious.`, mode: 'sit' };
      return null;
    case 'cat':
      if (who === 'scholar') return { zh: '喵', en: 'Mew', toastZh: `${n}一屁股坐在了你的书卷上。`, toastEn: `${n} plonks itself down right on your scroll.`, mode: 'sleep', sound: () => snd.meow(0), front: true };
      if (who === 'cat') return { zh: '喵～', en: 'Mrrow~', toastZh: `${n}和大橘碰了碰鼻子。`, toastEn: `${n} and Big Ginger touch noses.`, mode: 'sit', sound: () => snd.meow(0) };
      if (who === 'musician') return { zh: '咕噜咕噜', en: 'purr', toastZh: `${n}靠着琴师打起了呼噜。`, toastEn: `${n} leans against the qin player and purrs.`, mode: 'sleep' };
      if (who === 'fisher') return { zh: '喵？', en: 'Mew?', toastZh: `${n}盯上了渔翁的鱼篓。`, toastEn: `${n} has its eye on the fisherman’s creel.`, mode: 'sit', sound: () => snd.meow(0) };
      return null;
    case 'rabbit':
      if (who === 'rabbit') return { zh: '蹦！', en: 'Hop!', toastZh: `${n}和玉兔一起蹦跶起来。`, toastEn: `${n} and the Jade Rabbit hop together.`, mode: 'beg' };
      if (who === 'change') return { zh: '……', en: '…', toastZh: `${n}依偎在嫦娥脚边。`, toastEn: `${n} snuggles at Chang’e’s feet.`, mode: 'sleep' };
      if (who === 'gardener') return { zh: '嚼嚼', en: 'munch', toastZh: `${n}偷啃园丁篮子里的菜叶。`, toastEn: `${n} nibbles greens from the gardener’s basket.`, mode: 'eat', sound: () => snd.munch(0) };
      return null;
    case 'crane':
      if (who === 'change') return { zh: '♪', en: '♪', toastZh: `${n}随着嫦娥翩翩起舞。`, toastEn: `${n} dances with Chang’e.`, mode: 'dance', sound: () => snd.craneCall(0), front: true };
      if (who === 'taoist') return { zh: '唳——', en: 'Kroo—', toastZh: `道童说：仙鹤是道家的坐骑。${n}不以为然。`, toastEn: `The Taoist child says cranes carry immortals. ${n} is unconvinced.`, mode: 'call', sound: () => snd.craneCall(0) };
      if (who === 'musician' || who === 'poet') return { zh: '♪', en: '♪', mode: 'dance', sound: () => snd.craneCall(0) };
      return null;
    case 'duck':
      if (who === 'fisher') return { zh: '嘎嘎？', en: 'Quack?', toastZh: `${n}围着渔翁的鱼篓打转。`, toastEn: `${n} circles the fisherman’s creel.`, mode: 'idle', sound: () => snd.quack(0, 2) };
      if (who === 'poet') return { zh: '嘎！', en: 'Quack!', toastZh: `诗仙吟道：春江水暖鸭先知。${n}得意地嘎了一声。`, toastEn: `The poet recites: “The duck knows first when spring warms the river.” ${n} quacks, pleased.`, mode: 'call', sound: () => snd.quack(0, 1) };
      return null;
    case 'parrot':
      if (who === 'poet') return { zh: '举杯邀明月！', en: 'Raise a cup to the moon!', toastZh: `${n}跟着诗仙背起了诗。`, toastEn: `${n} recites poetry along with the poet.`, sound: () => snd.squawk(0, 5) };
      if (who === 'musician') return { zh: '♪ ♪ ♪', en: '♪ ♪ ♪', toastZh: `${n}学着琴声吹口哨。`, toastEn: `${n} whistles along with the qin.`, sound: () => snd.squawk(0, 6) };
      if (who === 'player') return { zh: '将军！', en: 'Check!', toastZh: `${n}替棋士喊了一声「将军」。`, toastEn: `${n} shouts “Check!” for the chess master.`, sound: () => snd.squawk(0, 2) };
      if (who === 'guan') return { zh: '关二爷！', en: 'Lord Guan!', sound: () => snd.squawk(0, 3) };
      return null;
    case 'goat':
      if (who === 'swordsman') return { zh: '咩！', en: 'Baa!', toastZh: `${n}要跟侠客比试比试。`, toastEn: `${n} wants a duel with the swordsman.`, mode: 'butt', sound: () => snd.bleat(0) };
      if (who === 'taoist') return { zh: '咩～', en: 'Baa~', toastZh: `${n}啃了一口道童的黄符。`, toastEn: `${n} takes a bite of the Taoist child’s talisman.`, mode: 'eat', sound: () => snd.munch(0) };
      if (who === 'painter') return { zh: '咩', en: 'Baa', toastZh: `${n}摆好了姿势，等画师来画。`, toastEn: `${n} strikes a pose for the painter.`, mode: 'idle' };
      return null;
    default:
      return null;
  }
}

/** A general reaction when the walker uses their skill. */
function skillReaction(species: Species): { zh: string; mode: Mode | 'binky'; sound: () => void } {
  switch (species) {
    case 'dog': return { zh: '汪汪！', mode: 'spin', sound: () => snd.bark(0) };
    case 'cat': return { zh: '喵！', mode: 'sit', sound: () => snd.meow(0) };
    case 'rabbit': return { zh: '蹦！', mode: 'binky', sound: () => {} };
    case 'crane': return { zh: '唳！', mode: 'dance', sound: () => snd.craneCall(0) };
    case 'duck': return { zh: '嘎嘎！', mode: 'call', sound: () => snd.quack(0, 2) };
    case 'parrot': return { zh: '好！', mode: 'fly', sound: () => snd.squawk(0, 1) };
    default: return { zh: '咩！', mode: 'shake', sound: () => snd.bleat(0) };
  }
}

export class Follower {
  private a: Actor | null = null;
  private pet: Pet | null = null;
  private fx: Fx;
  private bubble: Bubble;
  private it: Interactable | null = null;
  private offIt: (() => void) | null = null;
  private stillT = 0;
  private reactCd = 12;
  private trick: { mode: Mode | 'binky'; t: number; go?: { x: number; z: number } } | null = null;
  private waiting = false;
  private toasted = new Set<string>();
  private lastEmote: string | null = null;
  private wp: T.Vector3;
  private lastPx = 0;
  private labelT = 0;
  private lastPz = 0;
  /** How long the walker has stood still (s). */
  private stillFor = 0;
  /** Seconds until the next try at catching up (when far behind). */
  private catchCd = 0;
  /** Catch up at once (after a journey to another region). */
  private snapSoon = false;
  /** The height to stand at (x, z) for this animal: bound once, handed to Actor.walk every frame. */
  private floorFn = (x: number, z: number): number => (this.a ? this.floor(this.a.species, x, z) ?? this.ctx.groundY(x, z) : this.ctx.groundY(x, z));

  constructor(private bag: Bag, private ctx: WorldCtx, private handoff: (uid: string) => { x: number; z: number; heading: number } | null) {
    this.fx = new Fx(bag, ctx.scene, 10);
    this.bubble = new Bubble(bag, ctx.scene);
    this.wp = new ctx.THREE.Vector3();
    bag.onDispose(ctx.onRegion(() => { this.snapSoon = true; this.rebind(); }));
  }

  get uid(): string | null { return this.pet?.uid ?? null; }

  private w(zh: string): string { return this.ctx.lang === 'zh' ? zh : WORDS[zh] ?? zh; }

  where(): { x: number; z: number } | null {
    return this.a ? { x: this.a.x, z: this.a.z } : null;
  }

  sync(): void {
    const p = home.value.pets.find((x) => x.follow && isSpecies(x.species) && x.species !== 'koi') ?? null;
    if (p && this.pet && p.uid === this.pet.uid) { this.pet = p; this.relabel(); return; }
    if (this.a) this.leave();
    this.pet = p;
    if (!p) return;
    const species = p.species as Exclude<Species, 'koi'>;
    const a = new Actor(this.bag, species, p.uid, this.ctx.scene);
    // start where it stood at home, or beside you
    const from = this.handoff(p.uid);
    const pp = this.ctx.player.position;
    const h = this.ctx.player.heading;
    const at = from && Math.hypot(from.x - pp.x, from.z - pp.z) < 20 ? from : { x: pp.x - Math.sin(h) * 1.4 + Math.cos(h) * 0.5, z: pp.z - Math.cos(h) * 1.4 - Math.sin(h) * 0.5, heading: h };
    a.place(at.x, this.floor(species, at.x, at.z) ?? pp.y, at.z, at.heading);
    this.a = a;
    this.fx.puff(a.x, a.y, a.z, '#f0e6d2', 4, 0.4);
    this.it = this.prompt();
    this.relabel();
    this.rebind();
  }

  private relabel(): void {
    if (!this.it || !this.pet) return;
    const d = SPECIES_DEF[this.pet.species as Species];
    const n = hearts(this.pet.love);
    const hs = '♥'.repeat(n) + '♡'.repeat(5 - n);
    this.it.labelZh = `${this.pet.name || d.zh} · ${d.zh} ${hs}`;
    this.it.labelEn = `${this.pet.name || d.en} · ${d.en} ${hs}`;
  }

  /** Its prompt (it gives way to every other one: see ./prompt). */
  private prompt(): Interactable {
    const old = this.it;
    return {
      id: 'home-follower', position: new this.ctx.THREE.Vector3(), radius: 0,
      labelZh: old?.labelZh ?? '', labelEn: old?.labelEn ?? '', actionZh: '摸摸', actionEn: 'Pet',
      act: () => this.menu(),
    };
  }

  /**
   * The core remembers a prompt's region by where it was first seen (keyed by the object): register
   * a fresh one as we travel, or it would stay tied to the region the walk began in.
   */
  private rebind(): void {
    this.offIt?.();
    this.offIt = null;
    if (!this.it || !this.a) return;
    this.it = this.prompt();
    this.offIt = this.bag.interact(this.it);
  }

  private leave(): void {
    this.offIt?.();
    this.offIt = null;
    this.it = null;
    if (this.a) {
      this.fx.puff(this.a.x, this.a.y, this.a.z, '#f0e6d2', 4, 0.4);
      this.bag.drop(this.a.m.root);
      this.a.dispose();
    }
    this.a = null;
    this.trick = null;
  }

  /**
   * Where this animal can be at (x, z): its height there, or null where it can't go (open water
   * for a cat). A bridge or a deck over the water is ground to everyone.
   */
  private floor(species: string, x: number, z: number): number | null {
    const g = this.ctx.groundY(x, z);
    const w = this.ctx.waterAt(x, z);
    if (w !== null && g < w + 0.3) {
      if (SWIMS.has(species)) return w - (species === 'dog' ? 0.24 : 0.1);
      if (FLIES.has(species)) return w + 0.9;
      return null;
    }
    return g;
  }

  /** Open water at (x, z) (not a bridge or a deck over it). */
  private wet(x: number, z: number): boolean {
    const w = this.ctx.waterAt(x, z);
    return w !== null && this.ctx.groundY(x, z) < w + 0.3;
  }

  /** Catch up in a puff: somewhere it can stand near the walker (behind, beside, ahead), else at their feet. */
  private catchUp(): boolean {
    const a = this.a;
    if (!a) return false;
    const pl = this.ctx.player;
    const P = pl.position, h = pl.heading;
    const sp = a.species;
    const flier = sp === 'parrot';
    let x = P.x, z = P.z, y: number | null = flier ? P.y + (HEAD[pl.character] ?? 1.3) + 0.35 : null;
    if (!flier) {
      found: for (const r of CATCH_R) {
        for (const off of CATCH_A) {
          const ang = h + Math.PI + off;
          const cx = P.x + Math.sin(ang) * r, cz = P.z + Math.cos(ang) * r;
          const cy = this.floor(sp, cx, cz);
          if (cy === null || Math.abs(cy - P.y) > 1.2 || !this.ctx.isWalkable(cx, cz)) continue;
          x = cx; z = cz; y = cy;
          break found;
        }
      }
      // nowhere good round about (a narrow bridge, a jetty): right where you stand
      if (y === null) y = this.floor(sp, P.x, P.z) ?? (pl.grounded ? P.y : null);
    }
    if (y === null) return false;
    this.fx.puff(a.x, a.y, a.z, '#f0e6d2', 3, 0.4);
    a.place(x, y, z, h);
    this.fx.puff(a.x, a.y, a.z, '#f0e6d2', 4, 0.5);
    this.trick = null;
    this.waiting = false;
    return true;
  }

  private async menu(): Promise<void> {
    const ctx = this.ctx;
    const pet = this.pet;
    const a = this.a;
    if (!pet || !a || !begin(ctx, 'talk')) return;
    try {
      const p = home.value.pets.find((x) => x.uid === pet.uid) ?? pet;
      const d = SPECIES_DEF[p.species as Species];
      const fed = p.fed === today.value;
      const trick = this.trickFor(p);
      const cs: { zh: string; en: string; run: () => void }[] = [
        { zh: '摸摸它', en: 'Stroke', run: () => this.stroke(p) },
      ];
      if (!fed) cs.push({ zh: `喂食 · ${FOOD_PRICE} 文`, en: `Feed · ${FOOD_PRICE} coins`, run: () => { if (feed(ctx, p.uid)) { this.start('eat', 3); this.fx.hearts(a.x, a.y + a.m.height, a.z, 2); } } });
      if (trick) cs.push({ zh: trick.zh, en: trick.en, run: () => { this.start(trick.mode, trick.secs); trick.sound?.(); record('home-trick'); } });
      cs.push({ zh: '让它先回家', en: 'Send it home', run: () => toggleFollow(ctx, p.uid) });
      const i = await ctx.hud.say({
        nameZh: `${p.name} · ${d.zh}`, nameEn: `${p.name} · ${d.en}`,
        zh: `${p.name}跟着你走了一路，${fed ? '精神得很。' : '肚子有点饿了。'}`,
        en: `${p.name} has followed you all the way — ${fed ? 'full of beans.' : 'and is getting hungry.'}`,
        choices: [...cs.map((c) => ({ zh: c.zh, en: c.en })), { zh: '走吧', en: 'Let’s go' }],
      });
      if (i >= 0 && i < cs.length) cs[i].run();
    } finally {
      end(ctx, 'talk');
    }
  }

  private trickFor(p: Pet): { zh: string; en: string; mode: Mode | 'binky'; secs: number; sound?: () => void } | null {
    const has = (id: string) => hasTrick(p.species, p.love, id);
    switch (p.species as Species) {
      case 'dog': return has('spin') ? { zh: '转个圈！', en: 'Spin!', mode: 'spin', secs: 1.4, sound: () => snd.bark(0) } : has('sit') ? { zh: '坐下！', en: 'Sit!', mode: 'sit', secs: 3.5, sound: () => snd.bark(0) } : null;
      case 'cat': return has('roll') ? { zh: '翻个肚皮', en: 'Belly up', mode: 'roll', secs: 3, sound: () => snd.meow(0) } : null;
      case 'rabbit': return has('binky') ? { zh: '跳一个', en: 'Binky!', mode: 'binky', secs: 0.9 } : has('beg') ? { zh: '作个揖', en: 'Beg', mode: 'beg', secs: 3 } : null;
      case 'crane': return has('dance') ? { zh: '跳支舞', en: 'Dance', mode: 'dance', secs: 6, sound: () => snd.craneCall(0) } : null;
      case 'duck': return { zh: '叫两声', en: 'Quack', mode: 'call', secs: 1.2, sound: () => snd.quack(0, 2) };
      case 'parrot': return { zh: '说句话', en: 'Say something', mode: 'call', secs: 1, sound: () => { const l = learntLine(p.uid); this.bubble.say(parrotSays(this.ctx.lang, l, l ? 1 : 3, this.ctx.env.date.getMinutes()), this.a!.m.root, this.a!.m.height + 0.25, 2200); snd.squawk(0, 4); } };
      case 'goat': return { zh: '顶一下', en: 'Headbutt', mode: 'butt', secs: 1, sound: () => snd.thump(0) };
      default: return null;
    }
  }

  private stroke(p: Pet): void {
    const a = this.a;
    if (!a) return;
    this.ctx.player.emote('pet');
    const gain = strokeGain(p.love, strokesToday(p.uid, today.value));
    if (gain > 0) { petPet(p.uid, gain); countStroke(p.uid, today.value); }
    record('home-pet');
    this.fx.hearts(a.x, a.y + a.m.height, a.z, gain > 0 ? 3 : 1);
    const sp = p.species as Species;
    if (sp === 'dog') snd.bark(0); else if (sp === 'cat') snd.meow(0); else if (sp === 'goat') snd.bleat(0); else if (sp === 'duck') snd.quack(0, 1); else if (sp === 'parrot') snd.squawk(0, 2); else if (sp === 'crane') snd.craneCall(0);
    a.happy = 1;
  }

  private start(mode: Mode | 'binky', secs: number): void {
    this.trick = { mode, t: secs };
  }

  update(dt: number, t: number, still: boolean): void {
    const a = this.a, pet = this.pet;
    if (!a || !pet) { this.fx.update(dt); return; }
    const ctx = this.ctx;
    const pl = ctx.player;
    const P = pl.position;
    const sp = a.species;
    const h = pl.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const side = sp === 'parrot' ? 0.45 : sp === 'duck' || sp === 'rabbit' ? -0.5 : 0.55;
    const tx = P.x - fx * 1.3 + fz * side, tz = P.z - fz * 1.3 - fx * side;
    const pd = Math.hypot(a.x - P.x, a.z - P.z);
    const pv = Math.hypot(P.x - this.lastPx, P.z - this.lastPz) / Math.max(1e-4, dt);
    this.lastPx = P.x; this.lastPz = P.z;
    a.look = null;
    a.sink = 0;

    // far behind (a journey, a boat, a flight): catch up in a puff, landing where it can stand
    const flier = sp === 'parrot';
    this.catchCd -= dt;
    const far = pd > 16 || (!flier && Math.abs(a.y - P.y) > 5 && pl.grounded) || (this.snapSoon && pd > 6);
    if (far && this.catchCd <= 0) {
      this.catchCd = 0.3;
      if (this.catchUp()) this.snapSoon = false;
    } else if (this.snapSoon && pd <= 6) this.snapSoon = false;

    // a trick or a reaction in progress
    if (this.trick?.go) {
      // first go and stand in front of you
      const g = this.trick.go;
      if (a.walk(dt, g.x, g.z, 2, this.floorFn, 0.1) < 0.15) {
        this.trick.go = undefined;
        a.heading = Math.atan2(P.x - a.x, P.z - a.z);
      } else a.setMode('idle');
    } else if (this.trick) {
      this.trick.t -= dt;
      a.halt(dt);
      if (this.trick.mode === 'binky') { a.lift = Math.sin(Math.max(0, Math.min(1, 1 - this.trick.t / 0.9)) * Math.PI) * 0.35; a.heading += dt * 7; a.setMode('idle'); }
      else a.setMode(this.trick.mode);
      if (this.trick.t <= 0) { this.trick = null; a.lift = 0; a.setMode('idle'); }
    } else if (flier) {
      this.fly(dt, t, P, h, pd);
    } else {
      this.walk(dt, tx, tz, pd, P.x, P.z);
    }

    // stand still with them a while, and they do their thing
    const standing = pv < 0.2 && pd < 3 && pl.grounded && !pl.isFrozen && (pl.emoting === null || pl.emoting === 'sit');
    this.stillT = standing ? this.stillT + dt : 0;
    this.reactCd -= dt;
    if (!this.trick && this.stillT > 3.5 && this.reactCd <= 0) this.react();
    // your skill startles or delights it
    if (pl.emoting === 'skill' && this.lastEmote !== 'skill' && !this.trick) {
      const r = skillReaction(sp);
      this.bubble.say(this.w(r.zh), a.m.root, a.m.height + 0.25, 1400);
      r.sound();
      this.start(r.mode, r.mode === 'binky' ? 0.9 : 1.6);
    }
    this.lastEmote = pl.emoting;

    if (!this.trick && a.speed < 0.1 && pd < 2.8) a.lookAt(P.x, P.z);
    a.happy += ((pd < 3 ? 0.9 : 0.5) - a.happy) * Math.min(1, dt);
    a.animate(dt, t, still);
    // its prompt: once you stop beside it, and only when nothing else is in reach (./prompt). The
    // qin player standing still would rather play, unless the animal is right in front of them.
    this.stillFor = pv < 0.3 && !pl.isFrozen ? this.stillFor + dt : 0;
    if (this.it) {
      const ahead = Math.cos(Math.atan2(a.x - P.x, a.z - P.z) - h) > 0.4;
      const qin = CHARACTER[pl.character].ability.kind === 'music' && this.stillFor > 1 && !ahead;
      yieldPrompt(this.it, this.stillFor > 0.35 && pd < (flier ? 1.6 : 2.6) && !qin && pl.grounded, P.x, P.y, P.z, a.x, a.z, h);
    }
    this.fx.update(dt);
    this.bubble.update(dt, this.wp);
    this.labelT -= dt;
    if (this.labelT <= 0) { this.labelT = 2; const p = home.value.pets.find((x) => x.uid === pet.uid); if (p && p.love !== pet.love) { this.pet = p; this.relabel(); } }
  }

  private walk(dt: number, tx: number, tz: number, pd: number, px: number, pz: number): void {
    const a = this.a!;
    const sp = a.species;
    const dT = Math.hypot(tx - a.x, tz - a.z);
    if (pd < 0.75) {
      // never in the way: step aside
      const dx = a.x - px, dz = a.z - pz, L = Math.hypot(dx, dz) || 1;
      tx = px + (dx / L) * 1.1; tz = pz + (dz / L) * 1.1;
    } else if (dT < 0.5 && pd < 2.2) {
      a.halt(dt);
      // turn to you (a quarter turn off, as a companion stands)
      const want = Math.atan2(px - a.x, pz - a.z) + (this.stillT > 3 ? 0 : 0.6);
      a.heading += Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading)) * Math.min(1, dt * 3);
      this.idlePose();
      return;
    }
    const v = Math.min(MAX_SPEED[sp], 1.2 + dT * 1.6);
    // one step ahead: may it go there?
    const L = Math.max(1e-3, Math.hypot(tx - a.x, tz - a.z));
    const nx = a.x + ((tx - a.x) / L) * 0.35, nz = a.z + ((tz - a.z) / L) * 0.35;
    const y = this.floor(sp, nx, nz);
    if (y === null) {
      // the shore: wait here, watching
      a.halt(dt);
      if (!this.waiting) { this.waiting = true; if (pd > 3) this.bubble.say(sp === 'cat' ? this.w('喵……') : '……', a.m.root, a.m.height + 0.25, 1600); }
      a.setMode(sp === 'goat' || sp === 'rabbit' ? 'idle' : 'sit');
      a.lookAt(px, pz);
      return;
    }
    this.waiting = false;
    // a tree, a post or a wall in the way on land: step round it (or brush past, never stuck)
    if (!this.wet(nx, nz) && !this.ctx.isWalkable(nx, nz)) {
      const base = Math.atan2(tx - a.x, tz - a.z);
      for (const off of DEFLECT) {
        const ang = base + off;
        const ox = a.x + Math.sin(ang) * 0.5, oz = a.z + Math.cos(ang) * 0.5;
        if (this.wet(ox, oz) || !this.ctx.isWalkable(ox, oz) || this.floor(sp, ox, oz) === null) continue;
        tx = a.x + Math.sin(ang) * 1.2; tz = a.z + Math.cos(ang) * 1.2;
        break;
      }
    }
    const inWater = this.wet(a.x, a.z);
    a.setMode(inWater ? (sp === 'crane' ? 'fly' : 'swim') : 'idle');
    a.walk(dt, tx, tz, v, this.floorFn, 0.2);
    if (inWater && sp === 'dog' && Math.sin(dt * 999 + a.x) > 0.97) this.fx.puff(a.x, a.y + 0.2, a.z, '#eef4f2', 1, 0.3);
  }

  private idlePose(): void {
    const a = this.a!;
    const sp = a.species;
    const k = this.stillT;
    if (this.wet(a.x, a.z)) { a.setMode(sp === 'crane' ? 'fly' : 'swim'); return; }
    if (k < 3) { a.setMode('idle'); return; }
    a.setMode(sp === 'dog' ? 'sit' : sp === 'cat' ? (k > 12 ? 'sleep' : 'groom') : sp === 'rabbit' ? 'eat' : sp === 'goat' ? 'graze' : sp === 'crane' ? 'graze' : 'idle');
  }

  private fly(dt: number, t: number, P: T.Vector3, h: number, pd: number): void {
    const a = this.a!;
    const head = HEAD[this.ctx.player.character] ?? 1.3;
    // hover by your shoulder, a little behind, bobbing
    const tx = P.x - Math.sin(h) * 0.35 + Math.cos(h) * 0.42, tz = P.z - Math.cos(h) * 0.35 - Math.sin(h) * 0.42;
    const ty = P.y + head + 0.28 + Math.sin(t * 2.4) * 0.05;
    const k = Math.min(1, dt * (pd > 3 ? 5 : 3.2));
    const ox = a.x, oz = a.z;
    a.x += (tx - a.x) * k; a.z += (tz - a.z) * k; a.y += (ty - a.y) * k;
    a.speed = Math.hypot(a.x - ox, a.z - oz) / Math.max(1e-4, dt);
    const want = a.speed > 0.4 ? Math.atan2(a.x - ox, a.z - oz) : h;
    a.heading += Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading)) * Math.min(1, dt * 5);
    a.lift = 0;
    a.setMode('fly');
  }

  private react(): void {
    const a = this.a, pet = this.pet;
    if (!a || !pet) return;
    this.reactCd = 22 + (pet.uid.length % 5) * 3;
    const who = this.ctx.player.character;
    const r = reaction(pet.species as Species, who, pet.name || SPECIES_DEF[pet.species as Species].zh);
    if (!r) {
      // no special opinion: an idle little moment of its own
      if (pet.species === 'dog') { this.bubble.say(this.w('哈……哈……'), a.m.root, a.m.height + 0.25, 1500); }
      else if (pet.species === 'parrot') { this.bubble.say(parrotSays(this.ctx.lang, learntLine(pet.uid), 3, this.ctx.env.date.getMinutes()), a.m.root, a.m.height + 0.25, 1800); snd.squawk(0, 3); }
      return;
    }
    this.bubble.say(ctxLang(this.ctx) === 'zh' ? r.zh : r.en, a.m.root, a.m.height + 0.25, 2200);
    r.sound?.();
    if (r.mode) {
      this.start(r.mode, r.mode === 'sleep' ? 6 : r.mode === 'dance' ? 6 : 2.5);
      const P = this.ctx.player.position, h = this.ctx.player.heading;
      const d = a.species === 'crane' ? 1.4 : 0.55;
      if (r.front && this.trick) this.trick.go = { x: P.x + Math.sin(h) * d, z: P.z + Math.cos(h) * d };
    }
    const key = `${pet.uid}:${who}`;
    if (r.toastZh && !this.toasted.has(key)) {
      this.toasted.add(key);
      this.ctx.hud.toast(r.toastZh, r.toastEn ?? '', 3200);
    }
  }

  dispose(): void {
    this.leave();
  }
}

const ctxLang = (ctx: WorldCtx) => ctx.lang;
