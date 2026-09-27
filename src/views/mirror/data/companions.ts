// 水月幻镜 · the 13 companions, their 镜技, 天性 and ☆ 别传 as data (GDD §11; every ⚖ applied).
// `extra` is the body's "Other" column; a passive's static stats live in PASSIVES[id].stats.
// computeStats adds both (and never twice). Behaviour lives in engine/content.
import type { AltSkillId, PassiveId, SkillId } from '../ids';
import type { CharacterId, CompanionDef, PassiveDef, SkillDef } from '../types';

const b = (zh: string, en: string) => ({ zh, en });
const MELEE_PEN = [{ match: { scale: 'melee' as const }, pct: -25 }];

export const COMPANIONS: Readonly<Record<CharacterId, CompanionDef>> = {
  scholar: {
    id: 'scholar', hp: 24, armor: 1, speed: 0, dodge: 0, extra: {}, start: 'choice', alt: 'more', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'yizi', passive: 'bolan', altSkill: 'tishi', leans: ['dugubaijia'],
    quip: b('书中自有千钟粟。', 'In books there are a thousand bushels.'), verse: b('半亩方塘一鉴开', 'The half-acre pond opens like a mirror'),
  },
  gardener: {
    id: 'gardener', hp: 26, armor: 2, speed: -10, dodge: 0, extra: { regen: 2 }, start: 'hoe', alt: 'pestle', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'manyuan', passive: 'chunzhong', altSkill: 'cuihua', leans: ['fuyuan', 'huichun', 'mobao'],
    quip: b('春种一粒粟。', 'Sow one grain in spring.'), verse: b('晨兴理荒秽，带月荷锄归', 'Up at dawn to weed; home with the hoe by moonlight'),
  },
  fisher: {
    id: 'fisher', hp: 24, armor: 1, speed: -5, dodge: 0, extra: {}, start: 'rod', alt: 'coindart', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'yiwang', passive: 'yuanzhe', altSkill: 'dudiao', leans: ['fuyuan', 'qizhen'],
    quip: b('愿者上钩。', 'Only the willing bite.'), verse: b('孤舟蓑笠翁，独钓寒江雪', 'A lone boat, an old man in a straw cape, fishing the snowy river'),
  },
  musician: {
    id: 'musician', hp: 18, armor: 0, speed: 0, dodge: 0, extra: {}, start: 'qin', alt: 'flute', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [...MELEE_PEN, { match: { cls: 'music' }, pct: 20 }], bans: [], skill: 'guangling', passive: 'zhiyin', altSkill: 'gaoshan', leans: ['qinxin', 'fulu'],
    quip: b('知音难觅。', 'A kindred ear is hard to find.'), verse: b('此曲只应天上有', 'Such music belongs in heaven'),
  },
  swordsman: {
    id: 'swordsman', hp: 18, armor: 0, speed: 15, dodge: 5, extra: {}, start: 'qingping', alt: 'casket', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: MELEE_PEN, bans: [], skill: 'yijian', passive: 'jianyi', altSkill: 'qinggong', leans: ['xianjian', 'jifeng'],
    quip: b('十步杀一人。', 'One foe every ten paces.'), verse: b('事了拂衣去，深藏身与名', 'The deed done, he shakes his sleeves and goes'),
  },
  taoist: {
    id: 'taoist', hp: 16, armor: 0, speed: 5, dodge: 0, extra: { elem: 3 }, start: 'thunder', alt: 'fire', slots: 6, hitbox: 11, dodgeCap: 60,
    wmult: MELEE_PEN, bans: [], skill: 'jiji', passive: 'tongzi', altSkill: 'yufeng', leans: ['fulu', 'xianjian'],
    quip: b('急急如律令！', 'By swift decree!'), verse: b('松下问童子，言师采药去', 'Asked the child beneath the pine; the master is out gathering herbs'),
  },
  painter: {
    id: 'painter', hp: 24, armor: 1, speed: 0, dodge: 0, extra: {}, start: 'brush', alt: 'crane', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [{ match: { notCls: 'ink' }, pct: -25 }, { match: { cls: 'ink' }, pct: 35 }], bans: [], skill: 'dianhua', passive: 'chengzhu', altSkill: 'shenbi', leans: ['mobao'],
    quip: b('胸有成竹。', 'The bamboo is already in my heart.'), verse: b('搜尽奇峰打草稿', 'Sketching every strange peak'),
  },
  player: {
    id: 'player', hp: 20, armor: 2, speed: -10, dodge: 0, extra: {}, start: 'gobowl', alt: 'rod', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'wei', passive: 'luozi', altSkill: 'tuiyan', leans: ['qizhen', 'mobao', 'fuyuan'],
    quip: b('落子无悔。', 'A stone placed is never taken back.'), verse: b('闲敲棋子落灯花', 'Idly tapping stones as the wick burns down'),
  },
  cat: {
    id: 'cat', hp: 16, armor: 0, speed: 25, dodge: 15, extra: {}, start: 'claw', alt: 'drunkfist', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: ['heavy', 'bow'], skill: 'pudie', passive: 'jiuming', altSkill: 'maoyue', leans: ['jifeng', 'yueying', 'zuixian'],
    quip: b('喵。（在市中睡着了）', 'Meow. (asleep in the shop)'), verse: b('猫有九命', 'A cat has nine lives'),
  },
  rabbit: {
    id: 'rabbit', hp: 18, armor: 1, speed: 10, dodge: 5, extra: { regen: 2 }, start: 'pestle', alt: 'moonwheel', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'daoyao', passive: 'yaoxiang', altSkill: 'dengyue', leans: ['huichun', 'yueying'],
    quip: b('捣药去也。', 'Off to pound the elixir.'), verse: b('白兔捣药秋复春', 'The white rabbit pounds, autumn into spring'),
  },
  poet: {
    id: 'poet', hp: 22, armor: 0, speed: 5, dodge: 0, extra: { crit: 10 }, start: 'gourd', alt: 'qingping', slots: 6, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: [], skill: 'yaoyue', passive: 'baipian', altSkill: 'doujiu', leans: ['zuixian', 'xianjian'],
    quip: b('天子呼来不上船。', 'Even the emperor\'s call won\'t get me on the boat.'), verse: b('举杯邀明月，对影成三人', 'I raise my cup to the moon; with my shadow we make three'),
  },
  guan: {
    id: 'guan', hp: 28, armor: 3, speed: -15, dodge: 0, extra: {}, start: 'yanyue', alt: 'qingfeng', slots: 5, hitbox: 14, dodgeCap: 60,
    wmult: [], bans: ['hidden'], skill: 'tuodao', passive: 'yibo', altSkill: 'chitu', leans: ['zhongbing', 'jinzhong'],
    quip: b('暗器？关某不屑。', 'Hidden weapons? Beneath Lord Guan.'), verse: b('温酒斩华雄', 'Slaying Hua Xiong before the wine went cold'),
  },
  change: {
    id: 'change', hp: 19, armor: 0, speed: 5, dodge: 10, extra: {}, start: 'moonmirror', alt: 'moonwheel', slots: 6, hitbox: 14, dodgeCap: 70,
    wmult: [], bans: [], skill: 'qinghui', passive: 'yinqing', altSkill: 'benyue', leans: ['yueying', 'fulu'],
    quip: b('碧海青天夜夜心。', 'Blue sea, clear sky, a heart every night.'), verse: b('嫦娥应悔偷灵药', 'Chang\'e must regret the elixir she stole'),
  },
};

/** 镜技 (GDD §11.2) and ☆ 别传 (§11.3). Numbers only; engine/content/skills implements them. */
export const SKILLS: Readonly<Record<SkillId | AltSkillId, SkillDef>> = {
  yizi: { id: 'yizi', char: 'scholar', aim: 'cluster', reach: 420, cd: 14, p: { base: 30, k: 1.5, r: 180, draw: 0.35, zone: 5, slow: 40, amp: 20 }, text: b('大书「镇」字：30 + 150% 最高伤害属性（r 180），留 5 秒：缓 40%，受伤 +20%', 'A giant \'Hold Fast\' glyph: 30 + 150% of your highest damage stat in r 180; stays 5 s, slowing 40% and +20% damage taken') },
  manyuan: { id: 'manyuan', char: 'gardener', aim: 'feet', cd: 16, p: { r: 160, life: 12, max: 2, tick: 0.8, n: 4, base: 6, kSpirit: 0.8, kRegen: 0.5, slow: 25, hps: 1.5 }, text: b('种花圃（r 160，12 秒，至多 2）：每 0.8 秒花瓣击 4 敌 6 + 80% 造化 + 50% 回气；缓 25%；圃中回 1.5/秒', 'A flowerbed (r 160, 12 s, max 2): petals hit 4 foes for 6 + 80% Spirit + 50% Regen every 0.8 s; slows 25%; you regen 1.5/s inside') },
  yiwang: { id: 'yiwang', char: 'fisher', aim: 'cluster', reach: 380, cd: 15, p: { r: 150, root: 2, rootElite: 1, amp: 25, ampDur: 4, moonX: 2, attract: 400 }, text: b('撒网 r 150：拉至中心并定 2 秒（精英 1 秒），受伤 +25% 4 秒，网中击杀月华 ×2；400 内月华飞来', 'A net of r 150 pulls foes in and roots them 2 s (elites 1 s); +25% damage 4 s; netted kills ×2 moonlight; floor moonlight within 400 flies to you') },
  guangling: { id: 'guangling', char: 'musician', aim: 'around', cd: 22, p: { dur: 6, move: 0.7, beat: 0.5, r: 360, base: 10, k: 0.7, slow: 40, slowBoss: 20, charm: 0.15, charmDur: 6 }, text: b('奏 6 秒（行速 70%）：每拍 r 360 伤 10 + 70% 五行、缓 40%；每秒非精英 15%×福缘 成知音 6 秒', 'A 6 s performance at 70% speed: each beat hits r 360 for 10 + 70% Elemental and slows 40%; each second non-elites have 15% × luck to become kindred ears (allies) for 6 s') },
  yijian: { id: 'yijian', char: 'swordsman', aim: 'move', cd: 8, p: { len: 260, iframe: 0.35, streak: 1.5, spin: 0.4, spinDur: 3, refund: 1 }, text: b('冲刺 260（无敌 0.35 秒），诸剑随行 150%；其后 3 秒环身剑疾旋 40%；冲刺击杀返 1 秒', 'Dash 260 (invulnerable 0.35 s); every sword streaks the path for 150%; then orbiting swords spin fast (40%) for 3 s; a kill in the dash refunds 1 s') },
  jiji: { id: 'jiji', char: 'taoist', aim: 'cluster', reach: 420, cd: 16, p: { r: 180, dur: 5, pullElite: 0.5, tick: 0.5, n: 2, base: 10, k: 0.8 }, text: b('钉符成旋涡（r 180，5 秒）：非首领被吸入（精英 50%）；每 0.5 秒雷击 2 敌 10 + 80% 五行并灼烧', 'A talisman vortex (r 180, 5 s) pulls non-bosses in (elites 50%); every 0.5 s lightning strikes 2 for 10 + 80% Elemental and ignites') },
  dianhua: { id: 'dianhua', char: 'painter', aim: 'arc', reach: 260, cd: 20, p: { deg: 120, r: 260, n: 5, dur: 10, kSpirit: 1, eliteBase: 60, eliteK: 2 }, text: b('卷轴一扫：至多 5 非精英化为墨友 10 秒（其伤害 + 100% 造化）；精英首领受 60 + 200% 造化', 'A sweeping scroll turns up to 5 non-elites into ink allies for 10 s (their damage + 100% Spirit); elites and bosses take 60 + 200% Spirit') },
  wei: { id: 'wei', char: 'player', aim: 'around', cd: 28, p: { r: 220, close: 1, cap: 30, elitePct: 8, capW: 60, stun: 1 }, text: b('八子围 r 220，1 秒合拢：至多 30 非精英被提；精英首领失 8% 当前气血（至多 60×重）并晕 1 秒', 'Eight stones ring r 220 and close in 1 s: up to 30 non-elites are captured; elites and bosses lose 8% current HP (cap 60 × w) and are stunned 1 s') },
  pudie: { id: 'pudie', char: 'cat', aim: 'strongest', reach: 340, cd: 6, p: { air: 0.4, base: 25, k: 2.5, r: 90, stun: 0.5, reset: 1 }, text: b('扑向最强之敌（空中 0.4 秒不可选中）：落地 25 + 250% 近战（r 90）晕 0.5 秒；击杀重置', 'Pounce on the strongest foe (untargetable 0.4 s): 25 + 250% Melee in r 90, stun 0.5 s; a kill resets it') },
  daoyao: { id: 'daoyao', char: 'rabbit', aim: 'around', cd: 16, p: { root: 1.2, dr: 50, pounds: 3, r: 150, base: 15, kRegen: 1.5, kHp: 0.05, knock: 80, heal: 0.15, buff: 20, buffDur: 6 }, text: b('定身 1.2 秒减伤 50%：三捣各 r 150 伤 15 + 150% 回气 + 5% 气血上限；后服药回 15% 气血、+20% 伤害 6 秒', 'Rooted 1.2 s at −50% damage: three pounds of r 150 for 15 + 150% Regen + 5% max HP; then heal 15% and +20% Damage for 6 s') },
  yaoyue: { id: 'yaoyue', char: 'poet', aim: 'self', cd: 18, p: { drunk: 100, dur: 6, crit: 30, base: 10, k: 1, chain: 2, hang: 2, hangSlow: 30 }, text: b('醉满 100；6 秒 +30% 暴击，每暴击发追踪诗字（10 + 100% 远程）连 2 敌；后宿醉 2 秒 −30% 身法', 'Drunk to 100; for 6 s +30% Crit and every crit launches a verse glyph (10 + 100% Ranged) chaining to 2 more; then 2 s hangover at −30% Speed') },
  tuodao: { id: 'tuodao', char: 'guan', aim: 'move', cd: 14, p: { back: 180, iframe: 0.3, r: 260, kWeapon: 2, kMelee: 2, knock: 200, stun: 1 }, text: b('佯退 180（无敌 0.3 秒），回身 360° 横扫 r 260：200% 最强重器 + 200% 近战，击退 200，晕 1 秒', 'Feigned retreat 180 (invulnerable 0.3 s), then a 360° sweep of r 260 for 200% of your best Heavy weapon + 200% Melee, knockback 200, stun 1 s') },
  qinghui: { id: 'qinghui', char: 'change', aim: 'land', cd: 20, p: { rise: 2.5, move: 0.7, range: 30, pool: 6, r: 220, base: 40, k: 2, poolDr: 30, poolSlow: 20, poolRegen: 5 }, text: b('升空 2.5 秒（不可选中，行速 70%，射程 +30%）；落为月池 r 220 6 秒：冲击 40 + 200% 五行，池中敌伤 −30%、慢 20%，你 +5 回气；月转满', 'Rise 2.5 s (untargetable, 70% speed, +30% range), land in a moon pool (r 220, 6 s): 40 + 200% Elemental; foes inside −30% damage, 20% slower; you +5 Regen; the moon turns full') },
  // ☆ 别传
  tishi: { id: 'tishi', char: 'scholar', aim: 'move', cd: 12, p: { n: 7, life: 4, base: 10, k: 1, slow: 30 }, text: b('沿路书七字诗为墙 4 秒：触之 10 + 100% 远程，缓 30%', 'Brush a 7-glyph verse along your path: walls for 4 s dealing 10 + 100% Ranged and slowing 30%') },
  cuihua: { id: 'cuihua', char: 'gardener', aim: 'self', cd: 18, p: { heal: 2, r: 120, root: 1.5 }, text: b('诸花与竹齐放：每株回 2，并定 120 内之敌 1.5 秒', 'Every flower and bamboo blooms: heal 2 per plant and root foes within 120 for 1.5 s') },
  dudiao: { id: 'dudiao', char: 'fisher', aim: 'strongest', reach: 500, cd: 12, p: { charge: 2, base: 50, k: 3, fullX: 2 }, text: b('静立蓄力至 2 秒，钩来 500 内最强之敌：50 + 300% 远程，满蓄翻倍', 'Hold still up to 2 s, then hook the strongest foe within 500: 50 + 300% Ranged, doubled at full charge') },
  gaoshan: { id: 'gaoshan', char: 'musician', aim: 'self', cd: 20, p: { dur: 6, heal: 1, base: 4, k: 0.5 }, text: b('6 秒内乐器每拍两发，每拍回 1，墨鸟啄敌 4 + 50% 五行', 'For 6 s Music weapons fire twice a beat; you heal 1 per beat; ink birds peck for 4 + 50% Elemental') },
  qinggong: { id: 'qinggong', char: 'swordsman', aim: 'move', cd: 9, p: { n: 3, len: 160, within: 1.5, iframe: 0.2 }, text: b('1.5 秒内三次短冲 160（各无敌 0.2 秒），每冲令下一剑必暴', 'Three dashes of 160 within 1.5 s (invulnerable 0.2 s each); each primes a crit') },
  yufeng: { id: 'yufeng', char: 'taoist', aim: 'around', cd: 14, p: { r: 200, dur: 4 }, text: b('旋风 r 200 持续 4 秒：推敌外出，托你越过险地，状态互传', 'A whirlwind of r 200 for 4 s pushes foes out, lifts you over hazards, and spreads statuses') },
  shenbi: { id: 'shenbi', char: 'painter', aim: 'arc', cd: 20, p: { base: 60, k: 3 }, text: b('拖笔一划：墨龙循迹飞 60 + 300% 造化，诸墨宝回满', 'Drag a stroke: an ink dragon flies along it for 60 + 300% Spirit; every ink summon healed to full') },
  tuiyan: { id: 'tuiyan', char: 'player', aim: 'self', cd: 18, p: { dur: 3, slow: 70 }, text: b('3 秒内敌行 30%，你全速；其间落子落于最密处', 'For 3 s foes move at 30% while you keep full speed; stones land on the densest spots') },
  maoyue: { id: 'maoyue', char: 'cat', aim: 'land', reach: 300, cd: 8, p: { r: 100, stun: 0.5, after: 5, attract: 300, extra: 1 }, text: b('远跃 300：落地晕 r 100 0.5 秒；其后 5 秒 300 内月华跃来，击杀 +1', 'Leap up to 300: stun r 100 for 0.5 s; for 5 s moonlight within 300 leaps to you and kills drop +1') },
  dengyue: { id: 'dengyue', char: 'rabbit', aim: 'land', cd: 6, p: { air: 0.8, base: 20, k: 1, r: 180, slow: 20 }, text: b('0.8 秒不可选中之跃：落地 20 + 100% 远程（r 180），留月尘缓 20%', 'A 0.8 s untargetable hop: 20 + 100% Ranged in r 180, leaving moon dust that slows 20%') },
  doujiu: { id: 'doujiu', char: 'poet', aim: 'self', cd: 18, p: { drunk: 50, aspd: 40, dur: 6, pct: 30, n: 3 }, text: b('+50 醉、+40% 攻速 6 秒；每暴击迸诗字，以 30% 击附近 3 敌', '+50 Drunk and +40% Attack speed for 6 s; each crit bursts into verse (30% of the crit to 3 nearby foes)') },
  chitu: { id: 'chitu', char: 'guan', aim: 'move', cd: 20, p: { dur: 5, speed: 60, tick: 0.3, base: 20, k: 1, kArmor: 2 }, text: b('骑赤兔 5 秒：+60% 身法，免缓、定、退；所过之敌每 0.3 秒受 20 + 100% 近战 + 2×护甲', 'Ride Red Hare 5 s at +60% Speed, immune to slow, root and knockback; foes run through take 20 + 100% Melee + 2 × Armour every 0.3 s') },
  benyue: { id: 'benyue', char: 'change', aim: 'self', cd: 20, p: { dur: 3, perSec: 6, base: 10, k: 0.6 }, text: b('浮空 3 秒不可触，月光每秒击 6 敌 10 + 60% 五行', 'Float untouchable 3 s while moonbeams strike 6 foes a second for 10 + 60% Elemental') },
};

/** 天性 (GDD §11.3). `stats` are static (computeStats); `fx` rides the item interpreter; `p` feeds content. */
export const PASSIVES: Readonly<Record<PassiveId, PassiveDef>> = {
  bolan: { id: 'bolan', char: 'scholar', p: { cards: 5, freeReroll: 1, xp: 10, choices: 3 }, text: b('升级 5 选；每市首次刷新免费；经验 +10%；自选起手兵器', '5 cards per level; first reroll in each shop free; +10% XP; picks his starting weapon'), cost: b('无，他是基准', 'None; he is the baseline') },
  chunzhong: { id: 'chunzhong', char: 'gardener', stats: { harvest: 8, aspd: -15 }, p: { grow: 1.08 }, text: b('+8 收成；收成每重增 8%', '+8 Harvest; Harvest grows 8% per wave'), cost: b('−15% 攻速', '−15% Attack speed') },
  yuanzhe: { id: 'yuanzhe', char: 'fisher', stats: { luck: 15, pickup: 40, dmg: -5 }, p: { carp: 0.05, carpMoon: 5 }, text: b('+15 福缘，+40% 拾取；5%（随福缘）击杀为金鲤 +5 月华', '+15 Luck, +40% Pickup; 5% of kills (luck-scaled) are a golden carp worth +5 moonlight'), cost: b('−5% 伤害', '−5% Damage') },
  zhiyin: { id: 'zhiyin', char: 'musician', p: { beat: 0.5, wait: 0.25, dmg: 20, area: 15 }, text: b('乐器踏拍而发（至多等 0.25 秒），+20% 伤害，+15% 范围', 'Music weapons fire on the beat (≤ 0.25 s wait), +20% damage, +15% Area'), cost: b('近战兵器 −25%', '−25% for weapons that scale on Melee') },
  jianyi: { id: 'jianyi', char: 'swordsman', stats: { swords: 1 }, fx: [{ hook: 'cond', do: 'stats', stats: { crit: 10 }, cls: 'flying' }], p: {}, text: b('+1 剑数；仙剑 +10% 暴击', '+1 Swords; Flying swords +10% Crit'), cost: b('近战兵器 −25%', '−25% for weapons that scale on Melee') },
  tongzi: { id: 'tongzi', char: 'taoist', p: { statusDur: 50, hitbox: 11 }, text: b('状态持续 +50%；受击范围 r 11', 'Statuses last 50% longer; hitbox r 11'), cost: b('近战兵器 −25%', '−25% for weapons that scale on Melee') },
  chengzhu: { id: 'chengzhu', char: 'painter', stats: { summonCap: 2 }, fx: [{ hook: 'summon', do: 'life', pct: 50 }], p: { dmg: 35 }, text: b('+2 墨宝上限；墨宝存续 +50%，伤害 +35%', '+2 Ink cap; ink summons last 50% longer and deal +35%'), cost: b('非墨宝兵器 −25%', 'Non-ink weapons −25%') },
  luozi: { id: 'luozi', char: 'player', stats: { stones: 2, aspd: -10 }, fx: [{ hook: 'shop', do: 'freeReroll', n: 1 }], p: { stonesWave: 1, preview: 1 }, text: b('+2 棋子；棋子留至重末；每市 +1 免费刷新；预见下一重精英与险地', '+2 Stones; stones last the wave; +1 free reroll per shop; the shop previews the next elite and hazards'), cost: b('−10% 攻速', '−10% Attack speed') },
  jiuming: { id: 'jiuming', char: 'cat', p: { lives: 8, iframe: 1.5, hpGain: 0.5 }, text: b('一局 8 次（每重至多 1 次）致命一击留 1 气血并无敌 1.5 秒；猫步 +15% 闪避', '8 times a run (once a wave) a lethal hit leaves 1 HP and 1.5 s invulnerable; cat\'s pace: +15% Dodge'), cost: b('气血所得 ×0.5；不持重器、弓弩', 'HP gains ×0.5; no Heavy or Bow weapons') },
  yaoxiang: { id: 'yaoxiang', char: 'rabbit', stats: { heal: 15 }, p: { shield: 0.25, decay: 0.02, rangePct: -15 }, text: b('溢疗化为月盾（至多气血上限 25%，每秒 −2%）；疗效 +15%', 'Overheal becomes a moon shield (≤ 25% of max HP, −2%/s); healing +15%'), cost: b('−15% 射程', '−15% Range') },
  baipian: { id: 'baipian', char: 'poet', p: { drunkX: 2, sway: 10 }, text: b('无酒器亦有醉意，积醉翻倍', 'The Drunk meter without a Wine weapon, gaining twice as fast'), cost: b('自动瞄准摇摆 ±10°', 'Auto-aim sways ±10°') },
  yibo: { id: 'yibo', char: 'guan', p: { hitCap: 0.2, per: 3, meleeMax: 10, auraR: 150, aura: 10 }, text: b('单击至多损气血上限 20%；每过 3 重 +1 近战（至多 +10）；150 内敌伤 −10%', 'No hit takes over 20% of max HP; +1 Melee per 3 waves cleared (max +10); foes within 150 deal −10%'), cost: b('5 兵器位；市中不见暗器', '5 weapon slots; Hidden weapons never appear in his shop') },
  yinqing: { id: 'yinqing', char: 'change', p: { cycle: 16, phases: 8, full: 30, newDmg: -15, newDodge: 15, armorGain: 0.75, fullLuck: 10 }, text: b('16 秒月相八变：满月 +30% 伤害 至新月 −15% 伤害 +15% 闪避；浮越地面险地', 'A 16 s cycle of 8 phases: full moon +30% Damage to new moon −15% Damage +15% Dodge; floats over ground hazards'), cost: b('护甲所得 ×0.75', 'Armour gains ×0.75') },
};
