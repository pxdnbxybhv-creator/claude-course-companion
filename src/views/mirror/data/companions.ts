// 水月幻镜 · the 13 companions, their 镜技, 天性 and ☆ 别传 as data (GDD §11; every ⚖ applied).
// `extra` is the body's "Other" column; a passive's static stats live in PASSIVES[id].stats.
// computeStats adds both (and never twice). Behaviour lives in engine/content.
import type { AltSkillId, PassiveId, SkillId } from '../ids';
import type { CharacterId, CompanionDef, PassiveDef, SkillDef } from '../types';

const b = (zh: string, en: string) => ({ zh, en });
const MELEE_PEN = [{ match: { scale: 'melee' as const }, pct: -25 }];

export const COMPANIONS: Readonly<Record<CharacterId, CompanionDef>> = {
  scholar: {
    id: 'scholar', hp: 36, armor: 4, speed: 0, dodge: 0, extra: {}, start: 'choice', style: 'ranged', alt: 'more', slots: 6, hitbox: 14, dodgeCap: 60,
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
    wmult: [...MELEE_PEN, { match: { cls: 'music' }, pct: 12 }], bans: [], skill: 'guangling', passive: 'zhiyin', altSkill: 'gaoshan', leans: ['qinxin', 'fulu'],
    quip: b('知音难觅。', 'A kindred ear is hard to find.'), verse: b('此曲只应天上有', 'Such music belongs in heaven'),
  },
  swordsman: {
    id: 'swordsman', hp: 44, armor: 6, speed: 15, dodge: 10, extra: {}, start: 'qingping', style: 'ranged', alt: 'casket', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: MELEE_PEN, bans: [], skill: 'yijian', passive: 'jianyi', altSkill: 'qinggong', leans: ['xianjian', 'jifeng'],
    quip: b('十步杀一人。', 'One foe every ten paces.'), verse: b('事了拂衣去，深藏身与名', 'The deed done, he shakes his sleeves and goes'),
  },
  taoist: {
    id: 'taoist', hp: 28, armor: 3, speed: 5, dodge: 0, extra: { elem: 5 }, start: 'thunder', style: 'ranged', alt: 'fire', slots: 6, hitbox: 11, dodgeCap: 60,
    wmult: MELEE_PEN, bans: [], skill: 'jiji', passive: 'tongzi', altSkill: 'yufeng', leans: ['fulu', 'xianjian'],
    quip: b('急急如律令！', 'By swift decree!'), verse: b('松下问童子，言师采药去', 'Asked the child beneath the pine; the master is out gathering herbs'),
  },
  painter: {
    id: 'painter', hp: 36, armor: 5, speed: 0, dodge: 0, extra: {}, start: 'brush', style: 'ranged', alt: 'crane', slots: 6, hitbox: 14, dodgeCap: 60,
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
    id: 'rabbit', hp: 32, armor: 3, speed: 10, dodge: 5, extra: { regen: 3 }, start: 'pestle', style: 'melee', alt: 'moonwheel', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'daoyao', passive: 'yaoxiang', altSkill: 'dengyue', leans: ['huichun', 'yueying'],
    quip: b('捣药去也。', 'Off to pound the elixir.'), verse: b('白兔捣药秋复春', 'The white rabbit pounds, autumn into spring'),
  },
  poet: {
    id: 'poet', hp: 44, armor: 4, speed: 5, dodge: 0, extra: { crit: 15 }, start: 'gourd', style: 'ranged', alt: 'qingping', slots: 6, hitbox: 14, dodgeCap: 60,
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
  // ─────────────────────────────── m8:hidden · the three mirror-only companions (hidden.md §3.3, §4.3, §5.3)
  yuenv: {
    id: 'yuenv', hp: 30, armor: 3, speed: 10, dodge: 0, extra: {}, start: 'qingfeng', style: 'melee', alt: 'longquan', slots: 6, hitbox: 13, dodgeCap: 60,
    wmult: [{ match: { cls: 'sword' }, pct: 10 }], bans: ['heavy'], skill: 'houqi', passive: 'jingshen', altSkill: 'lunjian', leans: ['jinzhong', 'jifeng'],
    quip: b('见之似好妇，夺之似惧虎。', 'Gentle as a young woman to look at; fierce as a frightened tiger when she strikes.'),
    verse: b('越女天下白，鉴湖五月凉', 'The girls of Yue are the fairest under heaven; Mirror Lake is cool in the fifth month'),
    dodgeMult: 0.5,
  },
  shangui: {
    id: 'shangui', hp: 30, armor: 2, speed: 15, dodge: 10, extra: {}, start: 'claw', style: 'melee', alt: 'crane', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: ['heavy'], skill: 'nvluo', passive: 'youhuang', altSkill: 'chibao', leans: ['jifeng', 'qinxin'],
    quip: b('余处幽篁兮终不见天。', 'I dwell in the deep bamboo and never see the sky.'),
    verse: b('乘赤豹兮从文狸，辛夷车兮结桂旗', 'A red leopard to ride, striped wildcats behind; a magnolia chariot with cassia banners'),
  },
  houyi: {
    id: 'houyi', hp: 36, armor: 3, speed: -5, dodge: 0, extra: {}, start: 'sunbow', style: 'ranged', alt: 'repeater', slots: 6, hitbox: 15, dodgeCap: 60,
    wmult: [...MELEE_PEN, { match: { cls: 'bow' }, pct: 15 }], bans: [], skill: 'sheri', passive: 'mangong', altSkill: 'lianzhu', leans: ['zuixian', 'dugubaijia'],
    quip: b('九日落，一日留。', 'Nine suns fell; one I left in the sky.'),
    verse: b('㸌如羿射九日落', 'Bright as when Yi shot down the nine suns'),
  },
  // ─────────────────────────────── end m8:hidden
};

/** 镜技 (GDD §11.2) and ☆ 别传 (§11.3). Numbers only; engine/content/skills implements them. */
export const SKILLS: Readonly<Record<SkillId | AltSkillId, SkillDef>> = {
  yizi: { id: 'yizi', char: 'scholar', aim: 'cluster', reach: 420, cd: 12, p: { base: 30, k: 1.5, r: 180, draw: 0.35, zone: 5, slow: 40, amp: 25 } },
  manyuan: { id: 'manyuan', char: 'gardener', aim: 'feet', cd: 16, p: { r: 160, life: 12, max: 2, tick: 0.8, n: 4, base: 6, kSpirit: 0.8, kRegen: 0.5, slow: 30, hps: 1.5 } },
  yiwang: { id: 'yiwang', char: 'fisher', aim: 'cluster', reach: 380, cd: 12, p: { r: 150, root: 2, rootElite: 1, amp: 30, ampDur: 4, moonX: 2, attract: 400 } },
  guangling: { id: 'guangling', char: 'musician', aim: 'around', cd: 22, p: { dur: 6, move: 0.7, beat: 0.5, r: 360, base: 10, k: 0.7, slow: 40, slowBoss: 20, charm: 0.1, charmDur: 6 } },
  yijian: { id: 'yijian', char: 'swordsman', aim: 'move', cd: 7, p: { len: 260, iframe: 0.35, streak: 2, spin: 0.6, spinDur: 3, refund: 1, guard: 25, guardDur: 3 } },
  jiji: { id: 'jiji', char: 'taoist', aim: 'cluster', reach: 420, cd: 16, p: { r: 180, dur: 5, pullElite: 0.5, tick: 0.5, n: 2, base: 10, k: 0.8 } },
  dianhua: { id: 'dianhua', char: 'painter', aim: 'arc', reach: 260, cd: 16, p: { deg: 120, r: 260, n: 5, dur: 10, kSpirit: 1, eliteBase: 60, eliteK: 2 } },
  wei: { id: 'wei', char: 'player', aim: 'around', cd: 22, p: { r: 220, close: 1, cap: 30, elitePct: 12, capW: 60, stun: 1 } },
  pudie: { id: 'pudie', char: 'cat', aim: 'strongest', reach: 340, cd: 6, p: { air: 0.4, base: 35, k: 2.5, r: 90, stun: 0.5, reset: 1 } },
  daoyao: { id: 'daoyao', char: 'rabbit', aim: 'around', cd: 16, p: { root: 1.2, dr: 50, pounds: 3, r: 150, base: 15, kRegen: 1.5, kHp: 0.05, knock: 80, heal: 0.15, buff: 20, buffDur: 6, vuln: 20, vulnDur: 4 } },
  yaoyue: { id: 'yaoyue', char: 'poet', aim: 'self', cd: 18, p: { drunk: 100, dur: 6, crit: 40, base: 10, k: 1, chain: 2, hang: 2, hangSlow: 30 } },
  tuodao: { id: 'tuodao', char: 'guan', aim: 'move', cd: 12, p: { back: 180, iframe: 0.3, r: 260, kWeapon: 2, kMelee: 2, knock: 200, stun: 1 } },
  qinghui: { id: 'qinghui', char: 'change', aim: 'land', cd: 18, p: { rise: 2.5, move: 0.7, range: 30, pool: 6, r: 220, base: 40, k: 2, poolDr: 30, poolSlow: 20, poolRegen: 5 } },
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
  // ─────────────────────────────── m8:hidden (hidden.md §3.4, §4.4, §5.4; ☆ §3.6, §4.6, §5.6)
  houqi: { id: 'houqi', char: 'yuenv', aim: 'self', reach: 320, cd: 2.5, input: 'guard', p: {
    win: 0.25, perfect: 0.08, catches: 3, iframe: 0.2, cdCatch: 0.5, cdPerfect: 0.25,
    base: 30, kKit: 1, kMelee: 2.5, perfX: 1.5, stun: 1.2, stunBoss: 0.4, mark: 4,
    reflectX: 3, breakBase: 60, breakKit: 2, breakK: 4, breakStun: 0.6, catchGain: 1, breakGain: 2, cutKnock: 20,
    exposed: 25, exposedDur: 1.2,
    blades: 3, cutLen: 320, cutW: 70, cutIframe: 0.4, cutBase: 80, cutKit: 3, cutK: 6, cutX: 1.5, markX: 2 } },
  nvluo: { id: 'nvluo', char: 'shangui', aim: 'self', reach: 300, cd: 10, input: 'recast', p: {
    n: 5, r: 240, coneDeg: 90, life: 6, slack: 40, taut: 150, cap: 200, per: 100, m0: 0.6, slackX: 0.3, leash: 220,
    base: 15, kKit: 6, k: 1, stun: 0.5, stunTaut: 1.2, pullTo: 50, drag: 6, dragMax: 30, refund: 3 } },
  sheri: { id: 'sheri', char: 'houyi', aim: 'strongest', reach: 900, cd: 7, input: 'hold', p: {
    full: 1.2, sweet0: 0.9, sweet1: 1.1, slip: 1.4, move: 0.4,
    base: 40, kKit: 2.5, kRanged: 3, len: 900, w: 44, minDraw: 0.4,
    sweetX: 2, slipX: 0.5, slipCd: 2, shards: 9, shardPct: 0.25, shardR: 260 } },
  lunjian: { id: 'lunjian', char: 'yuenv', aim: 'self', cd: 6, p: { hold: 1.5, move: 0.5, catches: 6, base: 20, k: 1 } },
  chibao: { id: 'chibao', char: 'shangui', aim: 'strongest', reach: 300, cd: 12, p: { life: 8, base: 10, k: 1.2, every: 0.6, taunt: 1, n: 5 } },
  lianzhu: { id: 'lianzhu', char: 'houyi', aim: 'strongest', reach: 900, cd: 8, p: { n: 3, every: 0.6, deg: 12, draw: 0.7, win: 0.15, lineX: 1.6 } },
  // ─────────────────────────────── end m8:hidden
};

/** 天性 (GDD §11.3). `stats` are static (computeStats); `fx` rides the item interpreter; `p` feeds content. */
export const PASSIVES: Readonly<Record<PassiveId, PassiveDef>> = {
  bolan: { id: 'bolan', char: 'scholar', p: { cards: 5, freeReroll: 1, xp: 20, choices: 3 } },
  chunzhong: { id: 'chunzhong', char: 'gardener', stats: { harvest: 8, aspd: -10 }, p: { grow: 1.08 } },
  // m8 老渔 (balance.md §1.3): +1% 伤害 per 3 福缘, up to +30% (the −5 伤害 is gone)
  yuanzhe: { id: 'yuanzhe', char: 'fisher', stats: { luck: 15, pickup: 40 }, fx: [{ hook: 'cond', do: 'convert', from: 'luck', per: 3, to: ['dmg'], max: 30 }], p: { carp: 0.05, carpMoon: 5 } },
  // m8 (balance.md §1.1, the owner: 琴师 too strong): 范围 +15 → +10, 乐器 +20% → +12% (wmult above), beat wait 0.25 → 0.15 s
  zhiyin: { id: 'zhiyin', char: 'musician', p: { beat: 0.5, wait: 0.15, dmg: 12, area: 10 } },
  // m8 (balance.md §1.3): 剑数 +2, 飞剑 +15% 攻速, and 剑归 (a returning sword heals; ITEMS' returnHeal keeps the larger v, adds the caps)
  jianyi: { id: 'jianyi', char: 'swordsman', stats: { swords: 2 }, fx: [{ hook: 'cond', do: 'stats', stats: { crit: 10, aspd: 15 }, cls: 'flying' }, { hook: 'sword', do: 'returnHeal', v: 1, capPerSec: 3 }], p: {}, },
  tongzi: { id: 'tongzi', char: 'taoist', p: { statusDur: 50, hitbox: 11 } },
  chengzhu: { id: 'chengzhu', char: 'painter', stats: { summonCap: 2 }, fx: [{ hook: 'summon', do: 'life', pct: 50 }], p: { dmg: 35 } },
  luozi: { id: 'luozi', char: 'player', stats: { stones: 2 }, fx: [{ hook: 'shop', do: 'freeReroll', n: 1 }], p: { stonesWave: 1, preview: 1 } },
  // m8 猫步 (balance.md §1.3): +30% 攻速 for 2 s after each dodge (engine/content/field.ts)
  jiuming: { id: 'jiuming', char: 'cat', p: { lives: 8, iframe: 1.5, hpGain: 0.7, dodgeAspd: 30, dodgeDur: 2 } },
  // m8 药力 (balance.md §1.3): +1% 伤害 per 回气 point, up to +30%; her reach is no longer cut
  yaoxiang: { id: 'yaoxiang', char: 'rabbit', stats: { heal: 15 }, fx: [{ hook: 'cond', do: 'convert', from: 'regen', per: 1, to: ['dmg'], max: 30 }], p: { shield: 0.25, decay: 0.02, rangePct: 0 } },
  // m8 诗成 (overflow: crit over 100 → ×2 暴击倍数, logic/formulas.ts critMult) and 酒入豪肠 (each crit heals, capped a second)
  baipian: { id: 'baipian', char: 'poet', p: { drunkX: 2, sway: 10, overflow: 2, critHeal: 1, critHealCap: 8 } },
  yibo: { id: 'yibo', char: 'guan', p: { hitCap: 0.2, per: 3, meleeMax: 10, auraR: 150, aura: 10 } },
  yinqing: { id: 'yinqing', char: 'change', p: { cycle: 16, phases: 8, full: 30, newDmg: -15, newDodge: 15, armorGain: 0.75, fullLuck: 10 } },
  // ─────────────────────────────── m8:hidden (hidden.md §3.5, §4.5, §5.5 in the repo's Cond / convert shapes, PLAN D15)
  jingshen: { id: 'jingshen', char: 'yuenv', fx: [{ hook: 'cond', do: 'convert', from: 'dodge', per: 2, k: 1, to: ['melee'], max: 30 }],
    p: { dodgeHalf: 0.5, critHits: 3, critWin: 2, markCritDmg: 30 } },
  youhuang: { id: 'youhuang', char: 'shangui', p: { nearR: 150, per: 2, max: 20, vuln: 20, vulnDur: 3 } },
  mangong: { id: 'mangong', char: 'houyi', fx: [
    { hook: 'cond', do: 'stats', stats: { dmg: 25, pierce: 1 }, cls: 'bow', when: { k: 'still', s: 0.35 } },
    { hook: 'cond', do: 'stats', stats: { aspd: -10 }, cls: 'bow', when: { k: 'moving', s: 0.35 } }],
    p: { still: 0.35, dmg: 25, pierce: 1, moveAspd: -10, every: 9, sunDraw: 0.5 } },
  // ─────────────────────────────── end m8:hidden
};
