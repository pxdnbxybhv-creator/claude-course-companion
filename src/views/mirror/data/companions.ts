// 水月幻镜 · the 13 companions, their 镜技, 天性 and ☆ 别传 as data (GDD §11; every ⚖ applied).
// `extra` is the body's "Other" column; a passive's static stats live in PASSIVES[id].stats.
// computeStats adds both (and never twice). Behaviour lives in engine/content.
import type { AltSkillId, PassiveId, SkillId } from '../ids';
import type { CharacterId, CompanionDef, PassiveDef, SkillDef } from '../types';

const b = (zh: string, en: string) => ({ zh, en });
const MELEE_PEN = [{ match: { scale: 'melee' as const }, pct: -25 }];

export const COMPANIONS: Readonly<Record<CharacterId, CompanionDef>> = {
  scholar: {
    id: 'scholar', hp: 34, armor: 4, speed: 0, dodge: 0, extra: {}, start: 'choice', style: 'ranged', alt: 'more', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'yizi', passive: 'bolan', altSkill: 'tishi', leans: ['dugubaijia'],
    quip: b('书中自有千钟粟。', 'In books there are a thousand bushels.'), verse: b('半亩方塘一鉴开', 'The half-acre pond opens like a mirror'),
  },
  gardener: {
    id: 'gardener', hp: 36, armor: 4, speed: -10, dodge: 0, extra: { regen: 3 }, start: 'hoe', style: 'melee', alt: 'pestle', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'manyuan', passive: 'chunzhong', altSkill: 'cuihua', leans: ['fuyuan', 'huichun', 'mobao'],
    quip: b('春种一粒粟。', 'Sow one grain in spring.'), verse: b('晨兴理荒秽，带月荷锄归', 'Up at dawn to weed; home with the hoe by moonlight'),
  },
  fisher: {
    id: 'fisher', hp: 34, armor: 4, speed: -5, dodge: 0, extra: {}, start: 'rod', style: 'ranged', alt: 'coindart', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'yiwang', passive: 'yuanzhe', altSkill: 'dudiao', leans: ['fuyuan', 'qizhen'],
    quip: b('愿者上钩。', 'Only the willing bite.'), verse: b('孤舟蓑笠翁，独钓寒江雪', 'A lone boat, an old man in a straw cape, fishing the snowy river'),
  },
  musician: {
    id: 'musician', hp: 28, armor: 3, speed: 0, dodge: 0, extra: {}, start: 'qin', style: 'ranged', alt: 'flute', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [...MELEE_PEN, { match: { cls: 'music' }, pct: 20 }], bans: [], skill: 'guangling', passive: 'zhiyin', altSkill: 'gaoshan', leans: ['qinxin', 'fulu'],
    quip: b('知音难觅。', 'A kindred ear is hard to find.'), verse: b('此曲只应天上有', 'Such music belongs in heaven'),
  },
  swordsman: {
    id: 'swordsman', hp: 36, armor: 5, speed: 15, dodge: 10, extra: {}, start: 'qingping', style: 'ranged', alt: 'casket', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: MELEE_PEN, bans: [], skill: 'yijian', passive: 'jianyi', altSkill: 'qinggong', leans: ['xianjian', 'jifeng'],
    quip: b('十步杀一人。', 'One foe every ten paces.'), verse: b('事了拂衣去，深藏身与名', 'The deed done, he shakes his sleeves and goes'),
  },
  taoist: {
    id: 'taoist', hp: 26, armor: 3, speed: 5, dodge: 0, extra: { elem: 5 }, start: 'thunder', style: 'ranged', alt: 'fire', slots: 6, hitbox: 11, dodgeCap: 60,
    wmult: MELEE_PEN, bans: [], skill: 'jiji', passive: 'tongzi', altSkill: 'yufeng', leans: ['fulu', 'xianjian'],
    quip: b('急急如律令！', 'By swift decree!'), verse: b('松下问童子，言师采药去', 'Asked the child beneath the pine; the master is out gathering herbs'),
  },
  painter: {
    id: 'painter', hp: 34, armor: 4, speed: 0, dodge: 0, extra: {}, start: 'brush', style: 'ranged', alt: 'crane', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [{ match: { notCls: 'ink' }, pct: -25 }, { match: { cls: 'ink' }, pct: 35 }], bans: [], skill: 'dianhua', passive: 'chengzhu', altSkill: 'shenbi', leans: ['mobao'],
    quip: b('胸有成竹。', 'The bamboo is already in my heart.'), verse: b('搜尽奇峰打草稿', 'Sketching every strange peak'),
  },
  player: {
    id: 'player', hp: 30, armor: 5, speed: -10, dodge: 0, extra: {}, start: 'gobowl', style: 'ranged', alt: 'rod', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'wei', passive: 'luozi', altSkill: 'tuiyan', leans: ['qizhen', 'mobao', 'fuyuan'],
    quip: b('落子无悔。', 'A stone placed is never taken back.'), verse: b('闲敲棋子落灯花', 'Idly tapping stones as the wick burns down'),
  },
  cat: {
    id: 'cat', hp: 26, armor: 2, speed: 25, dodge: 20, extra: {}, start: 'claw', style: 'melee', alt: 'drunkfist', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: ['heavy', 'bow'], skill: 'pudie', passive: 'jiuming', altSkill: 'maoyue', leans: ['jifeng', 'yueying', 'zuixian'],
    quip: b('喵。（在市中睡着了）', 'Meow. (asleep in the shop)'), verse: b('猫有九命', 'A cat has nine lives'),
  },
  rabbit: {
    id: 'rabbit', hp: 28, armor: 3, speed: 10, dodge: 5, extra: { regen: 3 }, start: 'pestle', style: 'melee', alt: 'moonwheel', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'daoyao', passive: 'yaoxiang', altSkill: 'dengyue', leans: ['huichun', 'yueying'],
    quip: b('捣药去也。', 'Off to pound the elixir.'), verse: b('白兔捣药秋复春', 'The white rabbit pounds, autumn into spring'),
  },
  poet: {
    id: 'poet', hp: 38, armor: 3, speed: 5, dodge: 0, extra: { crit: 15 }, start: 'gourd', style: 'ranged', alt: 'qingping', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'yaoyue', passive: 'baipian', altSkill: 'doujiu', leans: ['zuixian', 'xianjian'],
    quip: b('天子呼来不上船。', 'Even the emperor\'s call won\'t get me on the boat.'), verse: b('举杯邀明月，对影成三人', 'I raise my cup to the moon; with my shadow we make three'),
  },
  guan: {
    id: 'guan', hp: 40, armor: 6, speed: -15, dodge: 0, extra: {}, start: 'yanyue', style: 'melee', alt: 'qingfeng', slots: 5, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: ['hidden'], skill: 'tuodao', passive: 'yibo', altSkill: 'chitu', leans: ['zhongbing', 'jinzhong'],
    quip: b('暗器？关某不屑。', 'Hidden weapons? Beneath Lord Guan.'), verse: b('温酒斩华雄', 'Slaying Hua Xiong before the wine went cold'),
  },
  change: {
    id: 'change', hp: 29, armor: 3, speed: 5, dodge: 15, extra: {}, start: 'moonmirror', style: 'ranged', alt: 'moonwheel', slots: 6, hitbox: 14, dodgeCap: 70,
    wmult: [], bans: [], skill: 'qinghui', passive: 'yinqing', altSkill: 'benyue', leans: ['yueying', 'fulu'],
    quip: b('碧海青天夜夜心。', 'Blue sea, clear sky, a heart every night.'), verse: b('嫦娥应悔偷灵药', 'Chang\'e must regret the elixir she stole'),
  },
};

/** 镜技 (GDD §11.2) and ☆ 别传 (§11.3). Numbers only; engine/content/skills implements them. */
export const SKILLS: Readonly<Record<SkillId | AltSkillId, SkillDef>> = {
  yizi: { id: 'yizi', char: 'scholar', aim: 'cluster', reach: 420, cd: 14, p: { base: 30, k: 1.5, r: 180, draw: 0.35, zone: 5, slow: 40, amp: 20 } },
  manyuan: { id: 'manyuan', char: 'gardener', aim: 'feet', cd: 16, p: { r: 160, life: 12, max: 2, tick: 0.8, n: 4, base: 6, kSpirit: 0.8, kRegen: 0.5, slow: 25, hps: 1.5 } },
  yiwang: { id: 'yiwang', char: 'fisher', aim: 'cluster', reach: 380, cd: 15, p: { r: 150, root: 2, rootElite: 1, amp: 25, ampDur: 4, moonX: 2, attract: 400 } },
  guangling: { id: 'guangling', char: 'musician', aim: 'around', cd: 22, p: { dur: 6, move: 0.7, beat: 0.5, r: 360, base: 10, k: 0.7, slow: 40, slowBoss: 20, charm: 0.15, charmDur: 6 } },
  yijian: { id: 'yijian', char: 'swordsman', aim: 'move', cd: 8, p: { len: 260, iframe: 0.35, streak: 1.5, spin: 0.4, spinDur: 3, refund: 1 } },
  jiji: { id: 'jiji', char: 'taoist', aim: 'cluster', reach: 420, cd: 16, p: { r: 180, dur: 5, pullElite: 0.5, tick: 0.5, n: 2, base: 10, k: 0.8 } },
  dianhua: { id: 'dianhua', char: 'painter', aim: 'arc', reach: 260, cd: 20, p: { deg: 120, r: 260, n: 5, dur: 10, kSpirit: 1, eliteBase: 60, eliteK: 2 } },
  wei: { id: 'wei', char: 'player', aim: 'around', cd: 28, p: { r: 220, close: 1, cap: 30, elitePct: 8, capW: 60, stun: 1 } },
  pudie: { id: 'pudie', char: 'cat', aim: 'strongest', reach: 340, cd: 6, p: { air: 0.4, base: 25, k: 2.5, r: 90, stun: 0.5, reset: 1 } },
  daoyao: { id: 'daoyao', char: 'rabbit', aim: 'around', cd: 16, p: { root: 1.2, dr: 50, pounds: 3, r: 150, base: 15, kRegen: 1.5, kHp: 0.05, knock: 80, heal: 0.15, buff: 20, buffDur: 6 } },
  yaoyue: { id: 'yaoyue', char: 'poet', aim: 'self', cd: 18, p: { drunk: 100, dur: 6, crit: 30, base: 10, k: 1, chain: 2, hang: 2, hangSlow: 30 } },
  tuodao: { id: 'tuodao', char: 'guan', aim: 'move', cd: 14, p: { back: 180, iframe: 0.3, r: 260, kWeapon: 2, kMelee: 2, knock: 200, stun: 1 } },
  qinghui: { id: 'qinghui', char: 'change', aim: 'land', cd: 20, p: { rise: 2.5, move: 0.7, range: 30, pool: 6, r: 220, base: 40, k: 2, poolDr: 30, poolSlow: 20, poolRegen: 5 } },
  // ☆ 别传
  tishi: { id: 'tishi', char: 'scholar', aim: 'move', cd: 12, p: { n: 7, life: 4, base: 10, k: 1, slow: 30 } },
  cuihua: { id: 'cuihua', char: 'gardener', aim: 'self', cd: 18, p: { heal: 2, r: 120, root: 1.5 } },
  dudiao: { id: 'dudiao', char: 'fisher', aim: 'strongest', reach: 500, cd: 12, p: { charge: 2, base: 50, k: 3, fullX: 2 } },
  gaoshan: { id: 'gaoshan', char: 'musician', aim: 'self', cd: 20, p: { dur: 6, heal: 1, base: 4, k: 0.5 } },
  qinggong: { id: 'qinggong', char: 'swordsman', aim: 'move', cd: 9, p: { n: 3, len: 160, within: 1.5, iframe: 0.2 } },
  yufeng: { id: 'yufeng', char: 'taoist', aim: 'around', cd: 14, p: { r: 200, dur: 4 } },
  shenbi: { id: 'shenbi', char: 'painter', aim: 'arc', cd: 20, p: { base: 60, k: 3 } },
  tuiyan: { id: 'tuiyan', char: 'player', aim: 'self', cd: 18, p: { dur: 3, slow: 70 } },
  maoyue: { id: 'maoyue', char: 'cat', aim: 'land', reach: 300, cd: 8, p: { r: 100, stun: 0.5, after: 5, attract: 300, extra: 1 } },
  dengyue: { id: 'dengyue', char: 'rabbit', aim: 'land', cd: 6, p: { air: 0.8, base: 20, k: 1, r: 180, slow: 20 } },
  doujiu: { id: 'doujiu', char: 'poet', aim: 'self', cd: 18, p: { drunk: 50, aspd: 40, dur: 6, pct: 30, n: 3 } },
  chitu: { id: 'chitu', char: 'guan', aim: 'move', cd: 20, p: { dur: 5, speed: 60, tick: 0.3, base: 20, k: 1, kArmor: 2 } },
  benyue: { id: 'benyue', char: 'change', aim: 'self', cd: 20, p: { dur: 3, perSec: 6, base: 10, k: 0.6 } },
};

/** 天性 (GDD §11.3). `stats` are static (computeStats); `fx` rides the item interpreter; `p` feeds content. */
export const PASSIVES: Readonly<Record<PassiveId, PassiveDef>> = {
  bolan: { id: 'bolan', char: 'scholar', p: { cards: 5, freeReroll: 1, xp: 10, choices: 3 } },
  chunzhong: { id: 'chunzhong', char: 'gardener', stats: { harvest: 8, aspd: -15 }, p: { grow: 1.08 } },
  yuanzhe: { id: 'yuanzhe', char: 'fisher', stats: { luck: 15, pickup: 40, dmg: -5 }, p: { carp: 0.05, carpMoon: 5 } },
  zhiyin: { id: 'zhiyin', char: 'musician', p: { beat: 0.5, wait: 0.25, dmg: 20, area: 15 } },
  jianyi: { id: 'jianyi', char: 'swordsman', stats: { swords: 1 }, fx: [{ hook: 'cond', do: 'stats', stats: { crit: 10 }, cls: 'flying' }], p: {}, },
  tongzi: { id: 'tongzi', char: 'taoist', p: { statusDur: 50, hitbox: 11 } },
  chengzhu: { id: 'chengzhu', char: 'painter', stats: { summonCap: 2 }, fx: [{ hook: 'summon', do: 'life', pct: 50 }], p: { dmg: 35 } },
  luozi: { id: 'luozi', char: 'player', stats: { stones: 2, aspd: -10 }, fx: [{ hook: 'shop', do: 'freeReroll', n: 1 }], p: { stonesWave: 1, preview: 1 } },
  jiuming: { id: 'jiuming', char: 'cat', p: { lives: 8, iframe: 1.5, hpGain: 0.5 } },
  yaoxiang: { id: 'yaoxiang', char: 'rabbit', stats: { heal: 15 }, p: { shield: 0.25, decay: 0.02, rangePct: -15 } },
  baipian: { id: 'baipian', char: 'poet', p: { drunkX: 2, sway: 10 } },
  yibo: { id: 'yibo', char: 'guan', p: { hitCap: 0.2, per: 3, meleeMax: 10, auraR: 150, aura: 10 } },
  yinqing: { id: 'yinqing', char: 'change', p: { cycle: 16, phases: 8, full: 30, newDmg: -15, newDodge: 15, armorGain: 0.75, fullLuck: 10 } },
};
