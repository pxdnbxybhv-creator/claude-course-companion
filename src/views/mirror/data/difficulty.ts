// 水月幻镜 · 镜境 presets, 镜誓 vows, 镜蚀 mutators and 镜印 affixes (GDD §15, §13.1; ⚖ values).
import type { AffixId, MutatorId, VowId } from '../ids';
import type { AffixDef, DifficultyDef, MutatorDef, VowDef } from '../types';

/** Index = DiffIndex (0 闲游 … 5 无相). HP/damage above ×1 ramp in over waves 1–20 (logic dmx). */
export const DIFFS: readonly DifficultyDef[] = [
  { id: 'xianyou', index: 0, hp: 0.7, dmg: 0.6, pay: 0.5, unlock: null, noEliteBefore: 11, teleX: 1.3, enrageAt: 150 },
  { id: 'zhaoying', index: 1, hp: 1, dmg: 1, pay: 1, unlock: null, enrageAt: 90 },
  { id: 'mingjing', index: 2, hp: 1.3, dmg: 1.3, pay: 1.15, unlock: { diff: 1, wave: 20 }, enrageAt: 90, extraEliteFrom: 12 },
  { id: 'youjing', index: 3, hp: 1.6, dmg: 1.6, pay: 1.3, unlock: { diff: 2, wave: 30 }, enrageAt: 90, extraEliteFrom: 12, shotSpeed: 1.15, bossExtraPattern: true },
  { id: 'xuanjing', index: 4, hp: 1.9, dmg: 1.9, pay: 1.45, unlock: { diff: 3, wave: 30 }, enrageAt: 90, extraEliteFrom: 12, shotSpeed: 1.15, bossExtraPattern: true, affixFrom: 11, heal: -20 },
  { id: 'wuxiang', index: 5, hp: 2.2, dmg: 2.2, pay: 1.6, unlock: { diff: 4, wave: 30 }, enrageAt: 90, extraEliteFrom: 12, shotSpeed: 1.15, bossExtraPattern: true, affixFrom: 11, affix2From: 21, heal: -20, twins20: 0.5, mutatorFrom: 11, enemySpeed: 1.08 },
];

/** Vows: `per` is per rank. Total heat is capped at 20. */
export const VOWS: Readonly<Record<VowId, VowDef>> = {
  qunmo: { id: 'qunmo', ranks: 3, heat: 1, per: { budget: 12 } },
  jianyan: { id: 'jianyan', ranks: 3, heat: 1, per: { hp: 12 } },
  lizhao: { id: 'lizhao', ranks: 3, heat: 1, per: { dmg: 10 } },
  jixing: { id: 'jixing', ranks: 2, heat: 1, per: { spd: 6 } },
  qianlin: { id: 'qianlin', ranks: 2, heat: 1, per: { price: 8 } },
  canyue: { id: 'canyue', ranks: 2, heat: 1, per: { heal: -15 } },
  daoxuan: { id: 'daoxuan', ranks: 1, heat: 2, per: { phase4: 1, at: 0.1, dur: 10 } },
  jijing: { id: 'jijing', ranks: 1, heat: 2, per: { len: -15 } },
  guying: { id: 'guying', ranks: 1, heat: 1, per: { cards: 3 } },
  wusuo: { id: 'wusuo', ranks: 1, heat: 1, per: { pickup: -25 } },
};
export const HEAT_MAX = 20;

/**
 * 镜蚀: `v` = [single, double] strength. A mutator runs at x = 0.5 (今日镜), 1, or 2 (repeated in
 * endless); its value is v[0]·x for x ≤ 1 and v[1] at x = 2 (logic mutatorValue).
 */
export const MUTATORS: Readonly<Record<MutatorId, MutatorDef>> = {
  mochao: { id: 'mochao', v: [30, 45], p: { dur: 3, dur2: 5, r: 60 } },
  shuangjing: { id: 'shuangjing', v: [2, 3], p: {} },
  jiying: { id: 'jiying', v: [15, 30], p: {} },
  huiguang: { id: 'huiguang', v: [25, 50], p: { at: 0.5 } },
  suijing: { id: 'suijing', v: [30, 50], p: { n: 2 } },
  anyue: { id: 'anyue', v: [420, 320], p: {} },
  fanzhao: { id: 'fanzhao', v: [1, 2], p: {} },
  houjia: { id: 'houjia', v: [3, 6], p: {} },
};

/** 镜印 affixes (from 玄镜 at wave 11, a second on 无相 from wave 21; always one in endless). */
export const AFFIXES: Readonly<Record<AffixId, AffixDef>> = {
  aegis: { id: 'aegis', p: { armor: 5 } },
  swift: { id: 'swift', p: { speed: 30 } },
  splitting: { id: 'splitting', p: { n: 3, hp: 0.3 } },
  devour: { id: 'devour', p: { heal: 0.2 } },
  mirrored: { id: 'mirrored', p: { at: 0.1, dur: 1 } },
  caller: { id: 'caller', p: { every: 8, n: 4 } },
};
