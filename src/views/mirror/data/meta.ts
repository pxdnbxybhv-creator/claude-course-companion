// 水月幻镜 · 心镜 faces, 今日镜 节气 modifiers, 流派 archetypes and the ⚖2 economy constants
// (GDD §10, §16, §17.2, §17.7). Deeds live in ids.ts (DEED_REG).
import type { ArchetypeId, HeartFaceId, TermModId } from '../ids';
import type { ArchetypeDef, HeartFaceDef, TermModDef } from '../types';

// ─────────────────────────────── 心镜 (§17.2): costs per rank in 镜屑
const C3 = [30, 120, 270] as const;
const C5 = [30, 120, 270, 480, 750] as const;
export const HEART: Readonly<Record<HeartFaceId, HeartFaceDef>> = {
  heartHp: { id: 'heartHp', pair: 1, side: 'A', costs: C5, per: { hp: 2 } },
  heartRegen: { id: 'heartRegen', pair: 1, side: 'B', costs: C3, per: { regen: 1 } },
  heartMoon: { id: 'heartMoon', pair: 2, side: 'A', costs: C3, per: {}, p: { moon: 10 } },
  heartReroll: { id: 'heartReroll', pair: 2, side: 'B', costs: C3, per: {}, p: { reroll: -4 } },
  heartArmor: { id: 'heartArmor', pair: 3, side: 'A', costs: [60, 240], per: { armor: 1 } },
  heartDodge: { id: 'heartDodge', pair: 3, side: 'B', costs: [60, 240], per: { dodge: 2 } },
  heartPickup: { id: 'heartPickup', pair: 4, side: 'A', costs: C3, per: { pickup: 10 } },
  heartHarvest: { id: 'heartHarvest', pair: 4, side: 'B', costs: C3, per: { harvest: 2 } },
  heartRevive: { id: 'heartRevive', pair: 5, side: 'A', costs: [400], per: {}, p: { hpPct: 0.3 } },
  heartWard: { id: 'heartWard', pair: 5, side: 'B', costs: [400], per: {}, p: { hp: 1 } },
  heartStand: { id: 'heartStand', pair: 6, side: 'A', costs: [500], per: {}, p: { slots: 1 } },
  heartTrade: { id: 'heartTrade', pair: 6, side: 'B', costs: C3, per: {}, p: { sell: 10 } },
  heartKeepsake: { id: 'heartKeepsake', pair: 7, side: 'A', costs: [120, 480], per: {}, p: { chance: 25 } },
  heartPack: { id: 'heartPack', pair: 7, side: 'B', costs: [150], per: {}, p: { items: 1 } },
  heartLuck: { id: 'heartLuck', pair: 8, side: 'A', costs: C5, per: { luck: 4 } },
  heartCrit: { id: 'heartCrit', pair: 8, side: 'B', costs: C3, per: { crit: 1 } },
};

// ─────────────────────────────── 今日镜 节气 modifiers (§17.7); index = term index (0 立春)
// `stats`: the player's static stats (computeStats). `p` keys logic reads: enemyHp / enemySpd (%),
// len (%), price (%), moon (%), cards (+n), interest (%) + interestMax, bossHp (%), adds (%),
// armor (enemy +n), anyueEven (1). Everything else in `p` is for engine/content/terms.
export const TERM_MODS: Readonly<Record<TermModId, TermModDef>> = {
  lichun: { id: 'lichun', index: 0, stats: { speed: 10 }, p: { enemySpd: 10 } },
  yushui: { id: 'yushui', index: 1, p: { burn: -50, lightning: 50 } },
  jingzhe: { id: 'jingzhe', index: 2, p: { burst: 2, chains: 1 } },
  chunfen: { id: 'chunfen', index: 3, p: { firstHalfSpd: 20, secondHalfDmg: 20 } },
  qingming: { id: 'qingming', index: 4, stats: { regen: 2 }, p: { puddles: 1 } },
  guyu: { id: 'guyu', index: 5, stats: { harvest: 10 }, p: { enemyHp: 10 } },
  lixia: { id: 'lixia', index: 6, p: { len: -10 } },
  xiaoman: { id: 'xiaoman', index: 7, p: { moon: 20, price: 10 } },
  mangzhong: { id: 'mangzhong', index: 8, p: { flower: 0.05, heal: 3 } },
  xiazhi: { id: 'xiazhi', index: 9, p: { len: 10, cards: 1 } },
  xiaoshu: { id: 'xiaoshu', index: 10, stats: { regen: -2, aspd: 10 }, p: {} },
  dashu: { id: 'dashu', index: 11, stats: { speed: -10 }, p: { enemySpd: -10, burn: 50 } },
  liqiu: { id: 'liqiu', index: 12, p: { gustEvery: 20, push: 60 } },
  chushu: { id: 'chushu', index: 13, p: { dr: 30, first: 10 } },
  bailu: { id: 'bailu', index: 14, stats: { dodge: 5, armor: -2 }, p: {} },
  qiufen: { id: 'qiufen', index: 15, p: { eliteCrates: 2 } },
  hanlu: { id: 'hanlu', index: 16, p: { enemySpd: -10, frost: 1 } },
  shuangjiang: { id: 'shuangjiang', index: 17, stats: { crit: 10, heal: -20 }, p: {} },
  lidong: { id: 'lidong', index: 18, p: { interest: 5, interestMax: 25 } },
  xiaoxue: { id: 'xiaoxue', index: 19, p: { shotSpd: -20, enemyHp: 10 } },
  daxue: { id: 'daxue', index: 20, p: { vision: 520, drops: 25 } },
  dongzhi: { id: 'dongzhi', index: 21, p: { moonWpn: 25, anyueEven: 1 } },
  xiaohan: { id: 'xiaohan', index: 22, p: { armor: 2, fire: 25 } },
  dahan: { id: 'dahan', index: 23, p: { bossHp: -15, adds: 50 } },
};

// ─────────────────────────────── 流派 (§10)
export const ARCHETYPES: Readonly<Record<ArchetypeId, ArchetypeDef>> = {
  mobao: { id: 'mobao', weapons: ['brush', 'inkstone', 'crane'], keys: ['xuan', 'duanyan', 'splash', 'inkbamboo', 'inkcrane', 'inkpool', 'dotting'], capstone: 'inkdragon', scales: ['spirit', 'summonCap', 'aspd'], flagship: ['painter', 'gardener', 'player'] },
  xianjian: { id: 'xianjian', weapons: ['qingping', 'casket', 'peach', 'seven'], keys: ['tassel', 'swordqi', 'swordheart', 'washpool', 'yujian', 'swordtomb'], capstone: 'wanjian', scales: ['ranged', 'swords', 'crit'], flagship: ['swordsman', 'poet', 'taoist'] },
  zhongbing: { id: 'zhongbing', weapons: ['yanyue', 'hoe', 'pestle'], keys: ['whetstone', 'dragblade', 'backwater'], capstone: 'needle', scales: ['melee', 'area', 'knock'], flagship: ['guan'] },
  jinzhong: { id: 'jinzhong', weapons: ['yanyue', 'pestle'], keys: ['guardmirror', 'thorns', 'ironbone', 'goldenbell', 'atease'], capstone: 'needle', scales: ['armor'], flagship: ['guan', 'gardener'] },
  fulu: { id: 'fulu', weapons: ['thunder', 'fire', 'gourd', 'peach', 'moonmirror'], keys: ['cinnabar', 'yellowpaper', 'fivethunder'], capstone: 'samadhi', scales: ['elem'], flagship: ['taoist'] },
  qinxin: { id: 'qinxin', weapons: ['qin', 'flute'], keys: ['lingering', 'boya', 'atease'], capstone: 'ambush', scales: ['elem', 'area'], flagship: ['musician'] },
  zuixian: { id: 'zuixian', weapons: ['gourd', 'drunkfist', 'sunbow', 'qingfeng'], keys: ['eagle', 'dukang', 'nightcup'], capstone: 'jiangjinjiu', scales: ['crit', 'critDmg'], flagship: ['poet'] },
  fuyuan: { id: 'fuyuan', weapons: ['hoe', 'rod', 'coindart'], keys: ['basket', 'coinstring', 'luckycat', 'miser', 'abacus', 'lots'], capstone: 'treasurebowl', scales: ['harvest', 'luck'], flagship: ['fisher', 'gardener'] },
  huichun: { id: 'huichun', weapons: ['pestle', 'hoe'], keys: ['tea', 'ginseng', 'cushion', 'physician'], capstone: 'penglai', scales: ['regen', 'heal'], flagship: ['rabbit', 'gardener'] },
  qizhen: { id: 'qizhen', weapons: ['gobowl'], keys: ['gomanual', 'capture', 'atease', 'xuan'], capstone: 'capture', scales: ['spirit', 'stones'], flagship: ['player'] },
  yueying: { id: 'yueying', weapons: ['moonwheel', 'moonmirror'], keys: ['amulet', 'moonsoul', 'osmanthus'], capstone: 'watermoon', scales: ['dodge'], flagship: ['change', 'cat'] },
  jifeng: { id: 'jifeng', weapons: ['longquan', 'claw', 'moonwheel'], keys: ['sandals', 'chasewind', 'lingbo'], capstone: 'watermoon', scales: ['speed'], flagship: ['swordsman', 'cat'] },
  jiehuo: { id: 'jiehuo', weapons: [], keys: ['cuthair', 'burnboats', 'yanwang', 'delusion', 'innerdemon', 'crackedmirror'], capstone: null, scales: ['curse', 'dmg'], flagship: ['scholar'] },
  dugubaijia: { id: 'dugubaijia', weapons: [], keys: ['versatile', 'dugu', 'cushion'], capstone: 'dugu', scales: ['dmg'], flagship: ['scholar'] },
};

// ─────────────────────────────── ⚖2 economy (§16; exactly sim/econ.js)
export const PAY = {
  FEE: 20,
  /** 返照钱 base: 1.5 a wave to 10, 1 a wave to 30, +5 per boss at 10/20/30, ½ a wave in endless (floor), +5 per endless boss (max 3). */
  early: 1.5, earlyTo: 10, mid: 1, midTo: 30, boss: 5, endless: 0.5, endlessMax: 30, endlessBoss: 5, endlessBossMax: 3,
  RUN_CAP: 70,
  CEIL: 300,
  heatPer: 0.02,
  /** 铜钱 drops. */
  COIN_RUN: 20,
  COIN_DAY: 30,
  wave: 0.05,
  elite: 0.15,
  pixiu: 0.12,
  bossBig: 0.08,
  bossSmall: 0.5,
  endlessX: 0.5,
  luckCap: 100,
  luckDiv: 200,
  /** First-time bonuses: first kill of each boss, first 照破 of each map × 镜境. */
  firstBoss: 10,
  firstClear: 20,
  /** 七日镜: wave 10 of 今日镜 on 4 of the last 7 days → +100 镜屑 once a week. */
  weekDust: 100,
  weekNeed: 4,
  rest: 3,
} as const;
/** Rate by the day's run index n (the free run is n = 1). */
export const rateOf = (n: number): number => (n <= 1 ? 0.5 : n <= 3 ? 1 : n <= 5 ? 0.5 : 0.25);
