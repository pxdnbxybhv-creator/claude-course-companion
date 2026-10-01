// 水月幻镜 · m8 · rough bot values for items whose worth is in their fx (PLAN D31, §4.I M3). `sim/bot.ts value()`
// sees only computeStats, so an fx item reads as worthless and the sweeps never buy it; BALANCE's value() adds
// `botItemValue(run, id) × count` for held items. Owned by ITEMS; BALANCE calibrates the numbers in Phase 3.
//
// Units are value()'s own: value = 3·ln(1 + dps/need) + ln(ehp) + …, so +10 % damage on a strong build is about
// 3·ln(1.1) ≈ 0.29, and −25 % damage taken is about ln(1/0.75) ≈ 0.29. A class item is worth its full number only
// when every weapon is of its class (× the share of weapons that are). Measured sources: items.md §1 and §R.2.
import type { ItemId } from '../ids';
import type { RunSave, WClass } from '../types';
import { WEAPONS } from '../data';
import { weaponRange } from '../logic/formulas';
import { computeStats } from '../logic';
import { hasDrunk } from '../engine/effects';

/** The full-fit value of each fx item (all weapons of its class, or any build for a generic one). */
export const ITEM_BOT_VALUE: Partial<Record<ItemId, number>> = {
  // on hit / on kill / on dodge (batch b)
  zhancao: 0.28, // sword damage dealt +9.8 % (§R.2)
  taishan: 0.2, // heavy +20 伤害 points (a class cond: value() misses it) and the pin
  yiqi: 0.3, // fist hits: up to +30 % 攻速 while brawling
  jianxue: 0.25, // hidden: damage dealt +5 %, crowd −9.7 %
  baibu: 0.28, // bow damage dealt +10.2 %
  chuge: 0.35, // music: boss −16 %
  liaoyuan: 0.08, // a talisman starter piece (boss −3 %)
  lianhuan: 0.45, // crowd −17 %, damage taken −35 % (generic)
  daoge: 0.1, // random turns, capped at 8
  xianzhi: 0.3, // × the build's dodge share of its cap (see botItemValue)
  // rule benders and the shop (batch a)
  huadi: -0.3, // its +100 攻速 is on the sheet; the cap costs the bot about a third more damage taken (§1)
  chulei: 0, // setPlus is in computeStats (setTiers): value() already sees it
  huobi: 0.05,
  qihuo: 0.1,
  dianshi: 0.1,
  // 月华 and risk (batch c): their stat lines (伤害, 拾取, 疗效) and 劫 are on the sheet / priced by value() already
  pengyue: -0.05, // the bot fetches every pearl, so the ground is never full: 月华 −8 %, boss 0 % (§2.13)
  rulian: 0.08, // chip damage through the crowd
  sanjin: -0.12, // it takes back about 56 % of the spill (§R.2): 月华 lost on every blow
  zhenjiu: -0.1, // every wave starts at 70 % 气血 (refilled in about 14 s at 30)
  mouhu: 0.08, // double 月华 from every elite (the extra 镜印 is the cost)
  // stance and class (batch d)
  jingru: 0, // the bot never stands still (§2.23)
  dongru: 0.03, // it rarely stops for a second, so the burst seldom fires
  duanbing: 0.25, // a melee build in the crowd gets the full +6 护甲 / +18 伤害; a kiter nothing (see botItemValue)
  jibai: 0.3, // ink +60 伤害 (a class cond: value() misses it); the −2 墨宝上限 is on the sheet
  houji: 0.25, // stones that wait: about +40 % a blast
  zuiwo: 0.36, // −30 % damage taken at 醉 100 = ln(1 / 0.7); 0 without the 醉 meter
};

/** The class each class-scoped item leans on (its value × the share of weapons of that class). */
const CLASS_OF: Partial<Record<ItemId, WClass>> = {
  zhancao: 'sword', taishan: 'heavy', yiqi: 'fist', jianxue: 'hidden', baibu: 'bow', chuge: 'music', liaoyuan: 'talisman',
  jibai: 'ink', houji: 'go',
};
/** 画地为牢 on a short-reach kit (mean weapon reach at or below this): the bot must not take it. 短兵相接 is the
 *  opposite: worth its value only on such a kit (the bot kites a long-reach kit at 230+ u and gets nothing). */
export const HUADI_SHORT_REACH = 200;
export const HUADI_SHORT_PENALTY = -1;

/** Share of held weapons that have class c (0 with no weapons). */
function classShare(run: Pick<RunSave, 'weapons'>, c: WClass): number {
  if (!run.weapons.length) return 0;
  let n = 0;
  for (const w of run.weapons) if (WEAPONS[w.id].classes.includes(c)) n++;
  return n / run.weapons.length;
}

/** The bot's rough value of holding one `id` in `run` (0 for items value() already reads through the sheet). */
export function botItemValue(run: RunSave, id: ItemId): number {
  const v = ITEM_BOT_VALUE[id];
  if (v === undefined) return 0;
  const c = CLASS_OF[id];
  if (c) return v * classShare(run, c);
  if (id === 'xianzhi') {
    const s = computeStats(run);
    return v * Math.max(0, Math.min(1, s.dodge / 60));
  }
  if (id === 'huadi' || id === 'duanbing') {
    if (!run.weapons.length) return id === 'huadi' ? v : 0;
    const s = computeStats(run);
    let reach = 0;
    for (const w of run.weapons) reach += weaponRange(WEAPONS[w.id], s);
    const short = reach / run.weapons.length <= HUADI_SHORT_REACH;
    if (id === 'duanbing') return short ? v : 0;
    return short ? HUADI_SHORT_PENALTY : v;
  }
  if (id === 'zuiwo') return hasDrunk(run) ? v : 0;
  if (id === 'dianshi') return run.weapons.some((w) => w.t < 4) ? v : 0;
  if (id === 'qihuo') return run.weapons.every((w) => w.t >= 3) ? v : -v;
  return v;
}
