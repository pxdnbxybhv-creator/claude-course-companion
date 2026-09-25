// The cast of 入画 — who you can walk the painting as. The scholar is yours from the start;
// every other companion joins you when you finish a quest (see quests.ts).

export type CharacterId =
  | 'scholar'    // 书生 — the default
  | 'gardener'   // 园丁
  | 'fisher'     // 渔翁
  | 'musician'   // 琴师
  | 'swordsman'  // 侠客
  | 'taoist'     // 道童
  | 'painter'    // 画师
  | 'player'     // 棋士
  | 'cat'        // 大橘
  | 'rabbit'     // 玉兔
  | 'poet'       // 诗仙
  | 'guan'       // 关公
  | 'change';    // 嫦娥

/** A small perk that makes each character play a little differently in the walk. */
export type Ability =
  | { kind: 'none' }
  | { kind: 'speed'; factor: number }         // walks/runs faster
  | { kind: 'jump'; factor: number }          // jumps higher
  | { kind: 'fish'; factor: number }          // bites come sooner, easier reel
  | { kind: 'glide' }                         // floats down slowly after a jump
  | { kind: 'grow' }                          // watering adds petals and a little extra sparkle
  | { kind: 'music' }                         // plays a phrase on emote that draws birds and koi
  | { kind: 'aim'; factor: number }           // steadier aim in 投壶
  | { kind: 'float' };                        // may walk on water (lake, river, pond)

export interface CharacterDef {
  id: CharacterId;
  zh: string;
  en: string;
  /** Short title shown under the name, e.g. 「荷锄晨归」. */
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  /** The quest that unlocks this character, or 'default'. */
  unlock: 'default' | string;
  ability: Ability;
  abilityZh: string;
  abilityEn: string;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'scholar', zh: '书生', en: 'Scholar', titleZh: '负笈远游', titleEn: 'Travelling with books', descZh: '白衣书生，走进了自己的画里。', descEn: 'A scholar in white who has stepped into his own painting.', unlock: 'default', ability: { kind: 'none' }, abilityZh: '心平气和', abilityEn: 'Even-tempered' },
  { id: 'gardener', zh: '园丁', en: 'Gardener', titleZh: '带月荷锄归', titleEn: 'Home with the hoe by moonlight', descZh: '草帽、水壶，花木见了他就精神。', descEn: 'Straw hat and watering can; plants perk up when he passes.', unlock: 'q-water', ability: { kind: 'grow' }, abilityZh: '浇水时落花更盛', abilityEn: 'Watering brings a shower of petals' },
  { id: 'fisher', zh: '渔翁', en: 'Old Fisherman', titleZh: '独钓寒江雪', titleEn: 'Fishing alone in the snowy river', descZh: '蓑衣斗笠，一竿风月。', descEn: 'Straw cape, bamboo hat, a rod full of wind and moon.', unlock: 'q-fish', ability: { kind: 'fish', factor: 1.8 }, abilityZh: '鱼更易上钩', abilityEn: 'Fish bite sooner' },
  { id: 'musician', zh: '琴师', en: 'Qin Player', titleZh: '高山流水', titleEn: 'High mountains, flowing water', descZh: '背一张古琴，所到之处，鸟也停下来听。', descEn: 'A guqin on her back; birds stop to listen.', unlock: 'q-incense', ability: { kind: 'music' }, abilityZh: '抚琴引来鸟与鱼', abilityEn: 'Her playing draws birds and koi' },
  { id: 'swordsman', zh: '侠客', en: 'Wandering Swordsman', titleZh: '十步杀一人，千里不留行', titleEn: 'A thousand miles without a trace', descZh: '一剑一笠，步履如风。', descEn: 'One sword, one hat, feet like the wind.', unlock: 'q-streak7', ability: { kind: 'speed', factor: 1.35 }, abilityZh: '身轻如燕，跑得更快', abilityEn: 'Light as a swallow — runs faster' },
  { id: 'taoist', zh: '道童', en: 'Taoist Child', titleZh: '松下问童子', titleEn: 'Asked the child beneath the pine', descZh: '拂尘一扫，跳得比谁都高。', descEn: 'A flick of the whisk, and a jump higher than anyone.', unlock: 'q-bell', ability: { kind: 'jump', factor: 1.6 }, abilityZh: '跳得更高', abilityEn: 'Jumps higher' },
  { id: 'painter', zh: '画师', en: 'Painter', titleZh: '搜尽奇峰打草稿', titleEn: 'Sketching every strange peak', descZh: '走遍山水，才画得出山水。', descEn: 'Only one who has walked every landscape can paint one.', unlock: 'q-explore', ability: { kind: 'speed', factor: 1.15 }, abilityZh: '识途，走得更快', abilityEn: 'Knows the way — walks faster' },
  { id: 'player', zh: '棋士', en: 'Board-game Master', titleZh: '闲敲棋子落灯花', titleEn: 'Idly tapping stones as the wick burns down', descZh: '手谈一局，胜负皆可。', descEn: 'A hand-talk game, win or lose.', unlock: 'q-chess', ability: { kind: 'aim', factor: 1.5 }, abilityZh: '投壶更准', abilityEn: 'Steadier aim at pitch-pot' },
  { id: 'cat', zh: '大橘', en: 'Big Ginger', titleZh: '园中一霸', titleEn: 'Boss of the garden', descZh: '终于轮到你当猫了。', descEn: 'Finally, you get to be the cat.', unlock: 'q-cat', ability: { kind: 'jump', factor: 1.35 }, abilityZh: '猫步轻盈，跳得高', abilityEn: 'Springy — jumps high' },
  { id: 'rabbit', zh: '玉兔', en: 'Jade Rabbit', titleZh: '捣药月宫', titleEn: 'Pounding herbs on the moon', descZh: '从月亮上跳下来的兔子。', descEn: 'A rabbit who hopped down from the moon.', unlock: 'q-mooncake', ability: { kind: 'glide' }, abilityZh: '跳起后缓缓飘落', abilityEn: 'Floats down after a jump' },
  { id: 'poet', zh: '诗仙', en: 'Poet Immortal', titleZh: '举杯邀明月', titleEn: 'Raising a cup to invite the moon', descZh: '斗酒诗百篇，走路也带着诗。', descEn: 'A hundred poems per jug of wine.', unlock: 'q-feihua', ability: { kind: 'speed', factor: 1.1 }, abilityZh: '所到之处诗句飘落', abilityEn: 'Verses drift where he walks' },
  { id: 'guan', zh: '关公', en: 'Lord Guan', titleZh: '华容道义释曹操', titleEn: 'Letting Cao Cao go at Huarong Pass', descZh: '红脸长髯，青龙偃月。', descEn: 'Red face, long beard, the Green Dragon blade.', unlock: 'q-klotski', ability: { kind: 'speed', factor: 1.25 }, abilityZh: '赤兔之速', abilityEn: 'The speed of Red Hare' },
  { id: 'change', zh: '嫦娥', en: "Chang'e", titleZh: '碧海青天夜夜心', titleEn: 'Blue sea, clear sky, a heart every night', descZh: '集齐同伴之后，月亮上的人也来了。', descEn: 'When every companion has joined you, the lady of the moon comes too.', unlock: 'q-all', ability: { kind: 'float' }, abilityZh: '凌波微步，可行于水上', abilityEn: 'Walks on water' },
];

export const CHARACTER: Record<CharacterId, CharacterDef> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<CharacterId, CharacterDef>;
