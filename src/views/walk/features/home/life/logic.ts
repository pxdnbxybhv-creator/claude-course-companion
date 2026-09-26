// 家园 · life at the homestead, the pure part (no DOM, no three.js): who can be adopted and where
// they live, how affection grows and fades, which tricks it unlocks, the residents' roles and their
// day by the hour, who drops by, and the steward's gossip. Tested in tests/home-life.test.ts.
import type { HomeItem, Pet, Resident } from '../../../../../app/home';
import type { DateKey } from '../../../../../core/types';
import type { CharacterId } from '../../../../../data/characters';
import { diffDays } from '../../../../../core/date';
import { hashString, makeRng } from '../../../../../core/rng';
import { KIND } from '../catalog';

// ───────────────────────────── pets ─────────────────────────────

export type Species = 'dog' | 'cat' | 'rabbit' | 'crane' | 'duck' | 'koi' | 'parrot' | 'goat';
/** The pet homes the builder places (fixed between home-build and home-life). */
export type HouseKind = 'doghouse' | 'catbed' | 'hutch' | 'coop' | 'pond' | 'perch' | 'pen';

export interface SpeciesDef {
  id: Species;
  zh: string;
  en: string;
  /** One brush glyph for its seal. */
  glyph: string;
  house: HouseKind;
  houseZh: string;
  houseEn: string;
  /** How many of this kind one such home holds. */
  perHouse: number;
  price: number;
  /** Affection lost for each day it was not fed. */
  decay: number;
  /** May walk with you out in the world. */
  follows: boolean;
  /** Suggested names for the naming card. */
  names: string[];
  traitZh: string;
  traitEn: string;
}

export const SPECIES: SpeciesDef[] = [
  { id: 'dog', zh: '狗', en: 'Dog', glyph: '犬', house: 'doghouse', houseZh: '狗窝', houseEn: 'doghouse', perHouse: 1, price: 120, decay: 3, follows: true,
    names: ['旺财', '阿黄', '来福', '元宝', '豆豆', '小黑', '大黄', '二哈'], traitZh: '摇尾巴、捡绣球，还爱刨坑。', traitEn: 'Wags, fetches the ball, loves to dig.' },
  { id: 'cat', zh: '狸花猫', en: 'Tabby cat', glyph: '猫', house: 'catbed', houseZh: '猫窝', houseEn: 'cat bed', perHouse: 1, price: 120, decay: 2, follows: true,
    names: ['团子', '花卷', '年糕', '狸狸', '煤球', '小虎', '咪咪', '橘子'], traitZh: '哪里有太阳就睡哪里，爱理不理。', traitEn: 'Naps wherever the sun is; ignores you, mostly.' },
  { id: 'rabbit', zh: '兔', en: 'Rabbit', glyph: '兔', house: 'hutch', houseZh: '兔舍', houseEn: 'hutch', perHouse: 2, price: 80, decay: 3, follows: true,
    names: ['雪球', '小白', '糯米', '汤圆', '棉花', '跳跳'], traitZh: '蹦蹦跳跳，嘴里总在嚼点什么。', traitEn: 'Hops about, always nibbling something.' },
  { id: 'crane', zh: '丹顶鹤', en: 'Crane', glyph: '鹤', house: 'pond', houseZh: '池塘', houseEn: 'pond', perHouse: 1, price: 300, decay: 2, follows: true,
    names: ['九皋', '白羽', '丹顶', '云衣', '鹤鸣', '仙仙'], traitZh: '池边踱步，兴起便翩翩起舞。', traitEn: 'Paces by the pond, and dances when the mood takes it.' },
  { id: 'duck', zh: '鸭', en: 'Duck', glyph: '鸭', house: 'coop', houseZh: '鸭舍', houseEn: 'duck coop', perHouse: 3, price: 60, decay: 3, follows: true,
    names: ['大鹅', '嘎嘎', '鸭梨', '扁扁', '黄黄', '呆呆'], traitZh: '排成一队摇摇摆摆，见水就下。', traitEn: 'Waddles in a line; into any water it sees.' },
  { id: 'koi', zh: '锦鲤', en: 'Koi', glyph: '鲤', house: 'pond', houseZh: '池塘', houseEn: 'pond', perHouse: 5, price: 40, decay: 1, follows: false,
    names: ['红锦', '金鳞', '吉祥', '如意', '朱砂', '锦锦'], traitZh: '池里游来游去，见人便聚过来讨食。', traitEn: 'Circles the pond; crowds over when someone comes near.' },
  { id: 'parrot', zh: '鹦鹉', en: 'Parrot', glyph: '鹦', house: 'perch', houseZh: '鸟架', houseEn: 'perch', perHouse: 1, price: 200, decay: 3, follows: true,
    names: ['翠翠', '巧嘴', '学舌', '小绿', '彩彩', '八哥'], traitZh: '会报家名，也会学你教的话。', traitEn: 'Calls out the homestead’s name, and repeats what you teach it.' },
  { id: 'goat', zh: '山羊', en: 'Goat', glyph: '羊', house: 'pen', houseZh: '羊圈', houseEn: 'goat pen', perHouse: 2, price: 150, decay: 3, follows: true,
    names: ['咩咩', '犟犟', '阿角', '白须', '顶顶', '山羊胡'], traitZh: '啃草，犯倔，时不时去顶篱笆。', traitEn: 'Grazes, sulks, headbutts the fence now and then.' },
];

// a pet's home is called what the builder's catalog calls it (兔笼, 鸡鸭舍, 水池, 鹦鹉架…)
for (const s of SPECIES) {
  const k = KIND[s.house];
  if (k) { s.houseZh = k.zh; s.houseEn = k.en.toLowerCase(); }
}

export const SPECIES_DEF: Record<Species, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.id, s])) as Record<Species, SpeciesDef>;

export const isSpecies = (s: string): s is Species => s in SPECIES_DEF;

/** Pet food, per meal. */
export const FOOD_PRICE = 5;
/** Affection: a meal, a stroke, a game of fetch, a visitor's treat; strokes that count per pet per day. */
export const LOVE = { feed: 8, stroke: 1, play: 2, treat: 5, strokesPerDay: 4, max: 100 } as const;

/** How many of `species` the homes on the plot can hold. */
export function capacity(items: readonly Pick<HomeItem, 'kind'>[], species: Species): number {
  const d = SPECIES_DEF[species];
  let n = 0;
  for (const it of items) if (it.kind === d.house) n++;
  return n * d.perHouse;
}

export type AdoptBlock = 'house' | 'full' | 'limit' | 'coins';

/** Can one more `species` be adopted? `house`: no home for it yet; `full`: its homes are full. */
export function adoptCheck(
  species: Species,
  items: readonly Pick<HomeItem, 'kind'>[],
  pets: readonly Pick<Pet, 'species'>[],
  o: { coins?: number; limit?: number; price?: number } = {},
): { ok: boolean; block: AdoptBlock | null; capacity: number; count: number } {
  const cap = capacity(items, species);
  const count = pets.filter((p) => p.species === species).length;
  let block: AdoptBlock | null = null;
  if (pets.length >= (o.limit ?? 12)) block = 'limit';
  else if (cap === 0) block = 'house';
  else if (count >= cap) block = 'full';
  else if (o.coins !== undefined && o.coins < (o.price ?? SPECIES_DEF[species].price)) block = 'coins';
  return { ok: !block, block, capacity: cap, count };
}

/**
 * Affection lost since the last settling: one `rate` for every whole day from `marker` (the day decay
 * was last settled, exclusive of today) on which the pet was not fed — never for days before it came
 * home. '' (never settled) loses nothing. At most 60 days are counted.
 */
export function decayLoss(pet: Pick<Pet, 'since' | 'fed'>, marker: DateKey | '', today: DateKey, rate: number): number {
  if (!marker) return 0;
  const start = pet.since > marker ? pet.since : marker;
  const days = Math.min(60, diffDays(start, today));
  if (days <= 0) return 0;
  const fedInside = !!pet.fed && pet.fed >= start && pet.fed < today;
  return Math.max(0, days - (fedInside ? 1 : 0)) * rate;
}

/** Every pet's affection after the days apart (a new array; unchanged pets are the same objects). */
export function settleDecay<P extends Pick<Pet, 'species' | 'since' | 'fed' | 'love'>>(pets: readonly P[], marker: DateKey | '', today: DateKey): P[] {
  return pets.map((p) => {
    const rate = isSpecies(p.species) ? SPECIES_DEF[p.species].decay : 3;
    const loss = decayLoss(p, marker, today, rate);
    return loss ? { ...p, love: Math.max(0, p.love - loss) } : p;
  });
}

/** Love after `strokes` strokes today when `done` already counted (capped per day and at 100). */
export function strokeGain(love: number, done: number): number {
  return done >= LOVE.strokesPerDay ? 0 : Math.min(LOVE.stroke, LOVE.max - love);
}

/** 0–5 hearts for a love value. */
export const hearts = (love: number) => Math.max(0, Math.min(5, Math.round(love / 20)));

export interface Trick { id: string; zh: string; en: string; love: number }

/** What affection unlocks, per species (thresholds in love points). */
export const TRICKS: Record<Species, Trick[]> = {
  dog: [
    { id: 'fetch', zh: '捡绣球', en: 'Fetch', love: 0 },
    { id: 'sit', zh: '坐下', en: 'Sit', love: 30 },
    { id: 'spin', zh: '转圈', en: 'Spin', love: 55 },
    { id: 'dig', zh: '刨宝', en: 'Dig for treasure', love: 80 },
  ],
  cat: [
    { id: 'roll', zh: '翻肚皮', en: 'Belly up', love: 40 },
    { id: 'knead', zh: '踩奶', en: 'Knead', love: 70 },
  ],
  rabbit: [
    { id: 'beg', zh: '作揖', en: 'Beg', love: 35 },
    { id: 'binky', zh: '欢跳', en: 'Binky', love: 65 },
  ],
  crane: [
    { id: 'dance', zh: '起舞', en: 'Dance', love: 30 },
    { id: 'call', zh: '引吭', en: 'Call', love: 60 },
  ],
  duck: [
    { id: 'line', zh: '排队', en: 'Fall in', love: 0 },
    { id: 'chorus', zh: '齐唱', en: 'Chorus', love: 40 },
  ],
  koi: [
    { id: 'gather', zh: '聚首', en: 'Gather', love: 0 },
    { id: 'leap', zh: '跃龙门', en: 'Leap the gate', love: 60 },
  ],
  parrot: [
    { id: 'name', zh: '报家名', en: 'Say the name', love: 0 },
    { id: 'teach', zh: '学舌', en: 'Learn a line', love: 30 },
    { id: 'poem', zh: '背诗', en: 'Recite', love: 70 },
  ],
  goat: [
    { id: 'butt', zh: '顶角', en: 'Headbutt', love: 0 },
    { id: 'climb', zh: '登高', en: 'Climb', love: 50 },
  ],
};

export function tricksFor(species: string, love: number): Trick[] {
  return isSpecies(species) ? TRICKS[species].filter((t) => love >= t.love) : [];
}

export function hasTrick(species: string, love: number, id: string): boolean {
  return tricksFor(species, love).some((t) => t.id === id);
}

/** The next trick affection will unlock (null when all are known). */
export function nextTrick(species: string, love: number): Trick | null {
  return isSpecies(species) ? TRICKS[species].find((t) => love < t.love) ?? null : null;
}

/** The coins a dog digs up (once a day, deterministic per day and dog). */
export function digCoins(day: DateKey, uid: string): number {
  return 12 + Math.floor(makeRng(hashString(`dig:${day}:${uid}`))() * 19);
}

// ───────────────────────────── residents ─────────────────────────────

export type Role = 'steward' | 'cook' | 'gardener' | 'student' | 'musician' | 'guard';

export interface RoleDef {
  id: Role;
  zh: string;
  en: string;
  glyph: string;
  price: number;
  names: string[];
  descZh: string;
  descEn: string;
}

export const ROLES: RoleDef[] = [
  { id: 'steward', zh: '管家', en: 'Steward', glyph: '管', price: 300, names: ['福伯', '忠叔', '老周', '顺伯', '陈管家', '德叔'], descZh: '晨起扫院，把一日见闻说给你听。', descEn: 'Sweeps the yard at dawn and tells you the day’s news.' },
  { id: 'cook', zh: '厨娘', en: 'Cook', glyph: '厨', price: 260, names: ['王嫂', '桂花婶', '李大娘', '巧姑', '刘妈', '阿香'], descZh: '炊烟一起，每日留一碟点心给你。', descEn: 'Chimney smoke at mealtimes, and a snack for you each day.' },
  { id: 'gardener', zh: '花匠', en: 'Gardener', glyph: '花', price: 240, names: ['老陈', '花伯', '阿木', '石头', '青山', '老树'], descZh: '侍弄花圃菜畦，浇水松土。', descEn: 'Tends the beds and the vegetable rows.' },
  { id: 'student', zh: '书童', en: 'Student', glyph: '书', price: 200, names: ['墨儿', '砚童', '小书', '琴儿', '松烟', '竹生'], descZh: '摇头晃脑地背书，背着背着就睡着了。', descEn: 'Reads aloud, swaying — and dozes off halfway.' },
  { id: 'musician', zh: '琴童', en: 'Young Musician', glyph: '笛', price: 220, names: ['阿笛', '小韵', '清音', '玉箫', '鸣鸣', '商商'], descZh: '天天练笛，吹得一天比一天好听。', descEn: 'Practises the flute every day, a little better each time.' },
  { id: 'guard', zh: '护院', en: 'Guard', glyph: '护', price: 280, names: ['阿福', '大虎', '铁柱', '石敢', '张勇', '二牛'], descZh: '守在门口，见你回来便抱拳行礼。', descEn: 'Stands at the gate and salutes when you come home.' },
];

export const ROLE_DEF: Record<Role, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<Role, RoleDef>;
export const isRole = (s: string): s is Role => s in ROLE_DEF;

export type Activity = 'sweep' | 'report' | 'cook' | 'eat' | 'wash' | 'tend' | 'water' | 'read' | 'play' | 'flute' | 'guard' | 'patrol' | 'rest' | 'chat' | 'away' | 'sleep';
/** Where on the plot an activity happens (resolved against what is built there). */
export type Place = 'gate' | 'yard' | 'kitchen' | 'beds' | 'study' | 'pond' | 'fence' | 'house';

export interface Slot { from: number; to: number; act: Activity; at: Place }

/** Each role's day, hour by hour (from ≤ hour < to; the night slot wraps past midnight). */
export const ROUTINES: Record<Role, Slot[]> = {
  steward: [
    { from: 6, to: 9, act: 'sweep', at: 'yard' },
    { from: 9, to: 12, act: 'report', at: 'gate' },
    { from: 12, to: 13, act: 'eat', at: 'kitchen' },
    { from: 13, to: 17, act: 'sweep', at: 'fence' },
    { from: 17, to: 21, act: 'report', at: 'yard' },
    { from: 21, to: 6, act: 'sleep', at: 'house' },
  ],
  cook: [
    { from: 5, to: 8, act: 'cook', at: 'kitchen' },
    { from: 8, to: 10, act: 'away', at: 'gate' },
    { from: 10, to: 13, act: 'cook', at: 'kitchen' },
    { from: 13, to: 16, act: 'wash', at: 'pond' },
    { from: 16, to: 19, act: 'cook', at: 'kitchen' },
    { from: 19, to: 22, act: 'chat', at: 'yard' },
    { from: 22, to: 5, act: 'sleep', at: 'house' },
  ],
  gardener: [
    { from: 5, to: 11, act: 'tend', at: 'beds' },
    { from: 11, to: 13, act: 'eat', at: 'kitchen' },
    { from: 13, to: 17, act: 'tend', at: 'beds' },
    { from: 17, to: 20, act: 'water', at: 'beds' },
    { from: 20, to: 5, act: 'sleep', at: 'house' },
  ],
  student: [
    { from: 7, to: 11, act: 'read', at: 'study' },
    { from: 11, to: 12, act: 'eat', at: 'kitchen' },
    { from: 12, to: 15, act: 'play', at: 'yard' },
    { from: 15, to: 18, act: 'read', at: 'study' },
    { from: 18, to: 21, act: 'read', at: 'house' },
    { from: 21, to: 7, act: 'sleep', at: 'house' },
  ],
  musician: [
    { from: 8, to: 11, act: 'flute', at: 'study' },
    { from: 11, to: 12, act: 'eat', at: 'kitchen' },
    { from: 12, to: 14, act: 'rest', at: 'pond' },
    { from: 14, to: 18, act: 'flute', at: 'yard' },
    { from: 18, to: 22, act: 'flute', at: 'pond' },
    { from: 22, to: 8, act: 'sleep', at: 'house' },
  ],
  guard: [
    { from: 6, to: 12, act: 'guard', at: 'gate' },
    { from: 12, to: 13, act: 'eat', at: 'kitchen' },
    { from: 13, to: 22, act: 'guard', at: 'gate' },
    { from: 22, to: 6, act: 'patrol', at: 'fence' },
  ],
};

const inSlot = (s: Slot, h: number) => (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to);

/** What a resident of `role` is doing at `hour` (0…24, fractional). */
export function routineAt(role: string, hour: number): Slot {
  const h = ((hour % 24) + 24) % 24;
  const list = isRole(role) ? ROUTINES[role] : ROUTINES.steward;
  return list.find((s) => inSlot(s, h)) ?? list[0];
}

/** The hour the current slot started (for smooth arrivals) and how far into it we are, 0…1. */
export function slotProgress(s: Slot, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const len = ((s.to - s.from + 24) % 24) || 24;
  const into = ((h - s.from + 24) % 24);
  return Math.max(0, Math.min(1, into / len));
}

/** Is someone visible in the yard (not asleep indoors, not out on an errand)? The guard never sleeps. */
export const present = (s: Slot) => s.act !== 'sleep' && s.act !== 'away';

// ───────────────────────────── visitors ─────────────────────────────

/**
 * Who drops by today (one of your companions, never the one you walk as), or null. The same all day;
 * about two days in three. They come in the daytime (8:00–20:00).
 */
export function visitorFor(day: DateKey, unlocked: readonly CharacterId[], current: CharacterId): CharacterId | null {
  const pool = unlocked.filter((c) => c !== current);
  if (!pool.length) return null;
  const rng = makeRng(hashString(`visit:${day}`));
  if (rng() > 0.68) return null;
  return pool[Math.floor(rng() * pool.length)];
}

export const VISIT_HOURS = { from: 8, to: 20 };

/** What a visitor leaves: coins, and sometimes a treat (every pet +LOVE.treat). */
export function visitGift(day: DateKey, id: CharacterId): { coins: number; treat: boolean } {
  const rng = makeRng(hashString(`gift:${day}:${id}`));
  return { coins: 20 + Math.floor(rng() * 5) * 10, treat: rng() < 0.4 };
}

// ───────────────────────────── the steward's news ─────────────────────────────

type Line = { zh: string; en: string };
const PET_NEWS: Record<Species, [string, string][]> = {
  dog: [['{n}今天又挖了个坑，正好挖在花圃边上。', '{n} dug another hole today — right beside the flower bed.'], ['{n}追着一只蝴蝶跑了半个院子。', '{n} chased a butterfly across half the yard.'], ['{n}把护院的鞋叼走了，至今下落不明。', '{n} made off with somebody’s shoe; its whereabouts remain unknown.']],
  cat: [['{n}在屋脊上晒了一下午太阳，叫也叫不下来。', '{n} spent the afternoon sunning on the roof ridge and would not come down.'], ['{n}又把桌上的茶杯推下去了，一脸无辜。', '{n} pushed a teacup off the table again, looking perfectly innocent.']],
  rabbit: [['{n}啃了两根萝卜，还装作不是它干的。', '{n} ate two radishes and is pretending it wasn’t her.'], ['{n}在篱笆底下刨了个洞，差点跑出去。', '{n} dug under the fence and nearly got out.']],
  crane: [['{n}清早在池边跳了一支舞，邻家孩子扒着篱笆看。', '{n} danced by the pond at dawn; the neighbours’ children watched over the fence.'], ['{n}单脚立了一个时辰，一动不动，像幅画。', '{n} stood on one leg for an hour without moving, like a painting.']],
  duck: [['{n}领着鸭子们在院里巡了三圈。', '{n} led the ducks round the yard three times.'], ['{n}下水洗了个澡，上岸抖了厨娘一身水。', '{n} took a bath and shook it all over the cook.']],
  koi: [['池里的{n}跃出水面，溅了一地水花。', '{n} leapt clean out of the pond and splashed everyone.'], ['{n}一见人影就游过来张嘴，怕是又饿了。', '{n} swims up gaping whenever anyone comes by — hungry again, no doubt.']],
  parrot: [['{n}今天学会了一句新话，逢人便说。', '{n} learnt a new phrase today and tells everyone.'], ['{n}学我咳嗽，学得一模一样。', '{n} imitates my cough — exactly.']],
  goat: [['{n}又去顶篱笆了，篱笆说它还能再撑几天。', '{n} has been butting the fence again; the fence says it can hold out a few more days.'], ['{n}爬上了柴堆，下不来了，咩咩直叫。', '{n} climbed the woodpile and couldn’t get down.']],
};
const PEOPLE_NEWS: Record<Role, [string, string][]> = {
  steward: [],
  cook: [['{n}说今晚做桂花糖藕。', '{n} says it’s sweet lotus root with osmanthus tonight.'], ['{n}腌的咸菜开坛了，香得很。', '{n} opened the pickle jar — it smells wonderful.']],
  gardener: [['{n}说花圃里的新芽冒头了。', '{n} says the new shoots are up in the beds.'], ['{n}修了一上午的篱笆。', '{n} spent the morning mending the fence.']],
  student: [['{n}背书背到一半，趴在桌上睡着了。', '{n} fell asleep on the desk halfway through a lesson.'], ['{n}今天写了一页大字，写得有模有样。', '{n} wrote a page of big characters today — not bad at all.']],
  musician: [['{n}的笛子吹得比昨天好听些了。', '{n}’s flute sounds a little better than yesterday.'], ['{n}吹了一曲《梅花三弄》，鸟都停下来听。', '{n} played “Three Variations on Plum Blossom” and the birds stopped to listen.']],
  guard: [['{n}夜里巡了三遍院子，太平无事。', '{n} walked the fence three times last night; all quiet.'], ['{n}说门口来过一个货郎，被他打发走了。', '{n} says a pedlar came by the gate and was sent on his way.']],
};

/**
 * The steward's report: two or three bits of news about your pets and people by the names you gave
 * them (the same all day). The steward's own name is left out.
 */
export function stewardNews(
  day: DateKey,
  pets: readonly Pick<Pet, 'uid' | 'species' | 'name'>[],
  people: readonly Pick<Resident, 'uid' | 'role' | 'name'>[],
  homeName = '',
): Line[] {
  const rng = makeRng(hashString(`news:${day}`));
  const pool: Line[] = [];
  for (const p of pets) {
    const t = isSpecies(p.species) ? PET_NEWS[p.species] : [];
    if (!t.length) continue;
    const [zh, en] = t[Math.floor(rng() * t.length)];
    const n = p.name || (isSpecies(p.species) ? SPECIES_DEF[p.species].zh : '');
    pool.push({ zh: zh.replace('{n}', n), en: en.replace('{n}', p.name || 'the ' + (isSpecies(p.species) ? SPECIES_DEF[p.species].en.toLowerCase() : 'pet')) });
  }
  for (const m of people) {
    const t = isRole(m.role) ? PEOPLE_NEWS[m.role] : [];
    if (!t.length) continue;
    const [zh, en] = t[Math.floor(rng() * t.length)];
    pool.push({ zh: zh.replace('{n}', m.name || ROLE_DEF[m.role as Role].zh), en: en.replace('{n}', m.name || 'the ' + ROLE_DEF[m.role as Role].en.toLowerCase()) });
  }
  // shuffle (deterministically) and keep up to three
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = pool.slice(0, 3);
  if (!out.length) {
    const hn = homeName ? `「${homeName}」` : '院里';
    out.push({ zh: `${hn}清清静静的。要不要养只猫狗？门口常有宠物贩子来转悠。`, en: 'All quiet here. How about a cat or a dog? A pet seller often comes by the gate.' });
  }
  return out;
}
