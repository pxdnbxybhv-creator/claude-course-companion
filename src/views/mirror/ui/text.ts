// 水月幻镜 · UI words and small pure helpers (node-tested in tests/mirror-ui.test.ts). No DOM here.
// Names come from ids.ts (`named`); this file only adds what the screens need around them: stat
// labels, tier words, the pay lines of the results scroll, the lobby's rate words, input maths.
import { DEED_REG, named, lockOf, BOSS_REG, ENDLESS_BOSS_REG, WEAPON_REG, ITEM_REG, MONSTER_REG, ELITE_REG, TREASURE_REG, COMPANION_REG, MAP_REG, ARCHETYPE_REG } from '../ids';
import type { ItemId, WeaponId } from '../ids';
import type { CodexKey, PayBreakdown, StatId, Tier, WClass } from '../types';
import { GLOSSARY, STAT_FMT, clsKey } from '../data/glossary';
import { STAT_IDS } from '../data/stats';
import { WCLASSES } from '../data/weapons';
import { deedLine } from './describe';

export type Lang = 'zh' | 'en';
export type T = (zh: string, en: string) => string;
/** A t() for a fixed language (tests, canvas text). */
export const tFor = (lang: Lang): T => (zh, en) => (lang === 'en' ? en : zh);

// ───────────────────────────────────────────── stats
// Every label comes from the shared glossary (data/glossary.ts): one word per idea on every screen.
/** [zh, en] per stat, read from GLOSSARY (回血, 法术, 造物, 移速, 暴击率, 暴击倍数, 拾取范围 …). */
export const STAT_NAMES: Record<StatId, readonly [string, string]> = Object.fromEntries(
  STAT_IDS.map((id) => [id, [GLOSSARY[id].zh, GLOSSARY[id].en] as const]),
) as Record<StatId, readonly [string, string]>;
/** Stats shown as percentage points (STAT_FMT 'pct'). */
export const PCT_STATS: ReadonlySet<StatId> = new Set<StatId>(STAT_IDS.filter((id) => STAT_FMT[id] === 'pct'));
export const statName = (id: StatId, t: T) => t(STAT_NAMES[id][0], STAT_NAMES[id][1]);
/** A number for display: rounded to 2 decimals, trailing zeros dropped (0.855 → 0.86, 1.50 → 1.5). Never toFixed. */
export function fmtNum(x: number): string {
  const n = Math.round(x * 100) / 100;
  return String(Object.is(n, -0) ? 0 : n);
}
/** A signed number: 「+3」 「−2」 「0」 (U+2212 minus). */
export function fmtSigned(x: number): string {
  const n = Math.round(x * 100) / 100;
  return n > 0 ? `+${fmtNum(n)}` : n < 0 ? `−${fmtNum(-n)}` : '0';
}
/** The magnitude part of a stat value, unsigned: 12 → 「12%」 (pct), 「12」 (flat), 「0.12」 (mult: stored /100). */
function statMag(id: StatId, abs: number): string {
  const f = STAT_FMT[id];
  return f === 'pct' ? `${fmtNum(abs)}%` : f === 'mult' ? fmtNum(abs / 100) : fmtNum(abs);
}
/** 「+5% 攻速」 / 「+5% Attack speed」 / 「+30 射程」 / 「+0.3 暴击倍数」. No units beyond %. */
export function fmtStat(id: StatId, v: number, t: T): string {
  const n = Math.round(v * 100) / 100;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${statMag(id, Math.abs(n))} ${statName(id, t)}`;
}
/** The value alone, for the 人物 panel: 「12%」 / 「40」 / 「3」; 暴击倍数 as 「+0.3」 (a multiplier add-on). */
export function fmtStatValue(id: StatId, v: number): string {
  const n = Math.round(v * 100) / 100;
  if (STAT_FMT[id] === 'mult') return n > 0 ? `+${statMag(id, n)}` : n < 0 ? `−${statMag(id, -n)}` : '0';
  return `${n < 0 ? '−' : ''}${statMag(id, Math.abs(n))}`;
}

// ───────────────────────────────────────────── tiers and classes
export const TIER_ZH = ['', '凡', '灵', '仙', '神'] as const;
export const TIER_EN = ['', 'Common', 'Spirit', 'Immortal', 'Divine'] as const;
/** Roman tier numerals: English only (zh shows the 凡/灵/仙/神 seal and 凡品… in sentences). */
export const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;
export const tierName = (tier: Tier, t: T) => t(TIER_ZH[tier], TIER_EN[tier]);
/** 「凡品」 / "Common" … for sentences. */
export const tierWord = (tier: Tier, t: T) => t(`${TIER_ZH[tier]}品`, TIER_EN[tier]);
/** The tier mark after a weapon name: '' in zh (the seal shows it), 「 II」 in en. */
export const tierMark = (tier: Tier, t: T) => t('', ` ${TIER_ROMAN[tier]}`);
/** [zh, en] per class, read from GLOSSARY (飞剑, 招财 …). */
export const CLASS_NAMES: Record<WClass, readonly [string, string]> = Object.fromEntries(
  WCLASSES.map((c) => [c, [GLOSSARY[clsKey(c)].zh, GLOSSARY[clsKey(c)].en] as const]),
) as Record<WClass, readonly [string, string]>;
export const className = (c: WClass, t: T) => t(CLASS_NAMES[c][0], CLASS_NAMES[c][1]);

/** A registry name in the current language (falls back to the id). */
export function nameOf(id: string, t: T): string {
  const n = named(id);
  return n ? t(n.zh, n.en) : id;
}

// ───────────────────────────────────────────── economy words
/** The rate of the next run in words: 免费 · 全额 · 半额 · 四分之一. */
export function rateWord(rate: number, free: boolean, t: T): string {
  if (free) return t('免费（返照减半）', 'free (half pay)');
  if (rate >= 1) return t('全额', 'full pay');
  if (rate >= 0.5) return t('半额', 'half pay');
  return t('四分之一', 'quarter pay');
}
/** 「×½」 style. */
export function rateMark(rate: number): string {
  return rate >= 1 ? '×1' : rate >= 0.5 ? '×½' : '×¼';
}
const x2 = (n: number) => (Math.round(n * 100) / 100).toString();

export interface PayLine { label: string; value: string; strong?: boolean; note?: string }
/**
 * The results scroll's pay breakdown in plain words (GDD §18.10): base → ×镜境 → ×map → ×heat → cap →
 * today's rate → ceiling → 返照钱; then the coins along the way, first-time bonuses, the fee and the net.
 */
export function payLines(p: PayBreakdown, free: boolean, t: T): PayLine[] {
  const out: PayLine[] = [];
  out.push({ label: t(`已过 ${p.W} 重 · 底数`, `${p.W} waves cleared · base`), value: `${p.base}` });
  if (p.diffX !== 1) out.push({ label: t('× 镜境', '× difficulty'), value: `×${x2(p.diffX)}` });
  if (p.mapX !== 1) out.push({ label: t('× 地图', '× map'), value: `×${x2(p.mapX)}` });
  if (p.heatX !== 1) out.push({ label: t('× 镜誓', '× vows'), value: `×${x2(p.heatX)}` });
  out.push({ label: p.capped ? t('一局最多 70', 'capped at 70 a run') : t('合计', 'gross'), value: `${p.gross}` });
  out.push({
    label: free ? t('今日免费 ×½', 'today’s free run ×½') : t(`此照${rateIndexWord(p.rate)} ${rateMark(p.rate)}`, `this run’s rate ${rateMark(p.rate)}`),
    value: `${p.rated}`,
  });
  if (p.income < p.rated) out.push({ label: t(`今日镜钱余 ${p.room} / 300`, `room left today ${p.room} / 300`), value: `${p.income}`, note: t('过了每日三百文的上限', 'the daily 300 ceiling') });
  out.push({ label: t('返照钱', 'Reflected coins'), value: `+${p.income}`, strong: true });
  if (p.back > 0) out.push({ label: t('退回本钱（不计进账）', 'fee back (a refund, not income)'), value: `+${p.back}` });
  out.push({ label: t('一路铜钱（已入囊）', 'coins along the way (already in your purse)'), value: `+${p.coins}` });
  if (p.firsts > 0) out.push({ label: t('首次奖励', 'first-time bonuses'), value: `+${p.firsts}` });
  if (p.firstsHeld > 0) out.push({ label: t('首次奖励留待他日', 'bonuses held for another day'), value: `${p.firstsHeld}`, note: t('今日已满，改日入镜前补上', 'today is full; paid on a later day') });
  out.push({ label: p.fee ? t('入镜钱', 'entry fee') : t('今日免费', 'today’s free run'), value: p.fee ? `−${p.fee}` : '0' });
  out.push({ label: t('此照净得', 'net for this run'), value: `${p.net >= 0 ? '+' : '−'}${Math.abs(p.net)}`, strong: true });
  return out;
}
function rateIndexWord(rate: number): string {
  return rate >= 1 ? '全额' : rate >= 0.5 ? '半额' : '四分之一';
}

/** The ⓘ sheet's pay-by-waves table (返照钱 on 照影 月湖, full rate, no heat). */
export function payTable(gross: (W: number) => number): { W: number; pay: number }[] {
  return [5, 9, 10, 15, 20, 25, 30, 40, 50].map((W) => ({ W, pay: gross(W) }));
}

// ───────────────────────────────────────────── time and days
/** Whole days between two YYYY-MM-DD keys (b − a), 0 if either is malformed. */
export function daysBetween(a: string, b: string): number {
  const pa = Date.parse(a + 'T00:00:00Z'), pb = Date.parse(b + 'T00:00:00Z');
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return 0;
  return Math.round((pb - pa) / 86_400_000);
}
/**
 * The day a paused run was last in the player's hands (「镜中人已候 N 日」): the later of the day this
 * device last played THIS run (null when unknown or another run's) and the day the run began.
 */
export function waitedSince(played: string | null, started: string): string {
  return played && /^\d{4}-\d{2}-\d{2}$/.test(played) && played > started ? played : started;
}
/** 「0:42」 for the wave timer. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}
/** 「32 分」 / 「32 min」 for real minutes. */
export function fmtMinutes(ms: number, t: T): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  return t(`${m} 分`, `${m} min`);
}

// ───────────────────────────────────────────── input maths
export const STICK_R = 56;
export const STICK_DEAD = 8;
/** The floating stick: drag (dx, dy) px from the anchor → a move vector of length ≤ 1 (dead zone 8). */
export function stickVector(dx: number, dy: number, R = STICK_R, dead = STICK_DEAD): { x: number; y: number; knobX: number; knobY: number } {
  const d = Math.hypot(dx, dy);
  if (d < dead || !Number.isFinite(d)) return { x: 0, y: 0, knobX: d < dead ? dx : 0, knobY: d < dead ? dy : 0 };
  const k = Math.min(1, (d - dead) / (R - dead)) / d;
  const kk = Math.min(d, R) / d;
  return { x: dx * k, y: dy * k, knobX: dx * kk, knobY: dy * kk };
}
/** Keys held → a move vector (WASD / arrows), normalised. */
export function keysVector(held: ReadonlySet<string>): { x: number; y: number } {
  let x = 0, y = 0;
  if (held.has('arrowleft') || held.has('a')) x -= 1;
  if (held.has('arrowright') || held.has('d')) x += 1;
  if (held.has('arrowup') || held.has('w')) y -= 1;
  if (held.has('arrowdown') || held.has('s')) y += 1;
  const d = Math.hypot(x, y);
  return d > 0 ? { x: x / d, y: y / d } : { x: 0, y: 0 };
}
/** The slice of a KeyboardEvent the between-wave screens look at (a plain object in tests). */
export interface KeyLike {
  key: string; repeat?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean;
  target?: { closest?: (sel: string) => unknown } | EventTarget | null;
}
const TYPING = 'input, textarea, select, [contenteditable]';
const CONTROL = 'button, a[href], summary, [role="button"], [role="radio"], [role="option"], [role="tab"]';
const within = (e: KeyLike, sel: string): boolean => {
  const tg = e.target as { closest?: (s: string) => unknown } | null | undefined;
  return !!(tg && typeof tg.closest === 'function' && tg.closest(sel));
};
/**
 * How a between-wave screen treats a key press. 'skip': not the screen's (a sheet is up, a chord, typing,
 * a held key auto-repeating, or Enter / Space on a focused button, which answers for itself, once).
 * 'swallow': an auto-repeat of Enter / Space: eaten, so a held key never clicks a button again and again.
 * 'offer': hand it to the screen, which consumes it (preventDefault) if it acts.
 */
export function screenKeyGate(e: KeyLike, sheetUp: boolean): 'skip' | 'swallow' | 'offer' {
  if (sheetUp || e.metaKey || e.ctrlKey || e.altKey) return 'skip';
  if (within(e, TYPING)) return 'skip';
  const act = e.key === 'Enter' || e.key === ' ';
  if (e.repeat) return act ? 'swallow' : 'skip';
  if (act && within(e, CONTROL)) return 'skip';
  return 'offer';
}

/** The toast after a run is voided (the engine failed before wave 1 was won): what really came back. */
export function voidNote(o: { free: boolean; refunded: number; freeBack: boolean }, t: T): string {
  if (o.refunded > 0) return t(`镜未成：此照作废，本钱 ${o.refunded} 文已退回。`, `The mirror failed: this run is void and your ${o.refunded} coins are back.`);
  if (o.free && o.freeBack) return t('镜未成：此照作废，今日免费仍在。', 'The mirror failed: this run is void; today’s free run is still yours.');
  if (o.free) return t('镜未成：此照作废；今日已补过一次，不再补。', 'The mirror failed: this run is void; today’s one make-good is already used.');
  return t('镜未成：此照作废；今日已退过一次，本钱不再退。', 'The mirror failed: this run is void; today’s one refund is already used, so the fee stays spent.');
}

/** The 技 button drag: below 18 px (or dragged back onto the button) it is a tap / a cancel. */
export const SKILL_DRAG = 18;
export function skillDrag(dx: number, dy: number): { aim: boolean; x: number; y: number } {
  const d = Math.hypot(dx, dy);
  return d < SKILL_DRAG ? { aim: false, x: 0, y: 0 } : { aim: true, x: dx / d, y: dy / d };
}

// ───────────────────────────────────────────── codex (185 pages + the 候签 album)
export type CodexTab = 'wpn' | 'item' | 'mon' | 'boss' | 'char' | 'map' | 'arch' | 'slip';
export const CODEX_TABS: readonly { id: CodexTab; zh: string; en: string }[] = [
  { id: 'wpn', zh: '兵器', en: 'Weapons' }, { id: 'item', zh: '道具', en: 'Items' }, { id: 'mon', zh: '妖魅', en: 'Monsters' },
  { id: 'boss', zh: '首领', en: 'Bosses' }, { id: 'char', zh: '同伴', en: 'Companions' }, { id: 'map', zh: '地图', en: 'Maps' },
  { id: 'arch', zh: '流派', en: 'Builds' }, { id: 'slip', zh: '候签', en: 'Pentads' },
];
/** Every codex page key of a tab, in display order (妖魅 holds monsters, then elites and treasures). */
export function codexKeys(tab: CodexTab): CodexKey[] {
  switch (tab) {
    case 'wpn': return WEAPON_REG.map((w) => `wpn:${w.id}` as CodexKey);
    case 'item': return ITEM_REG.map((w) => `item:${w.id}` as CodexKey);
    case 'mon': return [...MONSTER_REG.map((w) => `mon:${w.id}`), ...ELITE_REG.map((w) => `elite:${w.id}`), ...TREASURE_REG.map((w) => `trs:${w.id}`)] as CodexKey[];
    case 'boss': return BOSS_REG.map((w) => `boss:${w.id}` as CodexKey);
    case 'char': return COMPANION_REG.map((w) => `char:${w.id}` as CodexKey);
    case 'map': return MAP_REG.map((w) => `map:${w.id}` as CodexKey);
    case 'arch': return ARCHETYPE_REG.map((w) => `arch:${w.id}` as CodexKey);
    case 'slip': return [];
  }
}
export const CODEX_TOTAL = (['wpn', 'item', 'mon', 'boss', 'char', 'map', 'arch'] as const).reduce((n, tab) => n + codexKeys(tab).length, 0);
/** A page's registry id (the part after the colon). */
export const pageId = (k: CodexKey) => k.slice(k.indexOf(':') + 1);
/** The atlas id that pictures a codex page (null: 地图 and 流派 draw their own glyphs). */
export function pageAtlas(k: CodexKey): string | null {
  const [kind, id] = [k.slice(0, k.indexOf(':')), pageId(k)];
  switch (kind) {
    case 'wpn': return `wpn:${id}`;
    case 'item': return `item:${id}`;
    case 'mon': case 'trs': return `mon:${id}`;
    case 'elite': return `elite:${id}`;
    case 'boss': return `boss:${id}:0`;
    case 'char': return `char:${id}`;
    default: return null;
  }
}
/** Stage words: 未见 · 见 · 识 · 精. */
export const STAGE_ZH = ['未见', '见', '识', '精'] as const;
export const STAGE_EN = ['unseen', 'seen', 'known', 'mastered'] as const;

/** The riddle-ish hint of a locked weapon or item (its deed), or null when it is open from the start. */
export function lockHint(id: WeaponId | ItemId, t: T): { deed: string; how: string; goal: number } | null {
  const d = lockOf(id);
  if (!d) return null;
  const row = DEED_REG.find((x) => x.id === d)!;
  return { deed: t(row.zh, row.en), how: deedLine(d, t), goal: row.goal };
}

/** Boss display name for an intro (endless ids included). */
export function bossName(id: string, t: T): { name: string; verse: string } {
  const b = BOSS_REG.find((x) => x.id === id) ?? ENDLESS_BOSS_REG.find((x) => x.id === id);
  if (!b) return { name: id, verse: '' };
  return { name: t(b.zh, b.en), verse: t(b.verse, b.verseEn) };
}

/** 今日镜's 节气 modifiers in words (GDD §17.7), by TermModId. Numbers are TERM_MODS' (mirror-text.test checks). */
export const TERM_TEXT: Record<string, readonly [string, string]> = {
  lichun: ['你和敌人的移速都 +10%', 'you and enemies +10% move speed'],
  yushui: ['燃烧伤害 −50%，雷 +50%', 'burns −50%, lightning +50%'],
  jingzhe: ['敌人两批一起来，来得少一半；雷多跳 1 次', 'enemies come two groups at a time, half as often; lightning jumps 1 more'],
  chunfen: ['每重前一半敌人移速 +20%，后一半你的伤害 +20%', 'enemies +20% move speed in the first half of a wave; you +20% damage in the second'],
  qingming: ['处处有水洼；回血 +2', 'puddles everywhere; +2 HP Regen'],
  guyu: ['收成 +10；敌人气血 +10%', '+10 Harvest; enemies +10% HP'],
  lixia: ['每重短 10%', 'waves 10% shorter'],
  xiaoman: ['月华 +20%；商店价格 +10%', 'moonlight +20%; shop prices +10%'],
  mangzhong: ['打倒的敌人有 5% 几率长出一朵回血花', 'kills have a 5% chance to sprout a healing flower'],
  xiazhi: ['每重长 10%；升级多一张卡可挑', 'waves 10% longer; one more level-up card to choose from'],
  xiaoshu: ['回血 −2；攻速 +10%', '−2 HP Regen; +10% attack speed'],
  dashu: ['你和敌人的移速都 −10%；燃烧伤害 +50%', 'you and enemies −10% move speed; burns +50%'],
  liqiu: ['每 20 秒刮一阵风，把所有东西吹动', 'a gust pushes everything every 20 s'],
  chushu: ['每重前 10 秒少受 30% 伤害', 'take 30% less damage for the first 10 s of each wave'],
  bailu: ['闪避 +5%，护甲 −2', '+5% dodge, −2 armour'],
  qiufen: ['精英各掉 2 个镜奁', 'elites drop 2 caskets each'],
  hanlu: ['地上结霜；敌人移速 −10%', 'frost on the ground; enemies −10% move speed'],
  shuangjiang: ['暴击率 +10%；治疗效果 −20%', '+10% crit chance; −20% healing'],
  lidong: ['每重结束，手里的月华多给 5% 利息（最多 25）', 'at wave end, +5% interest on moonlight held (max 25)'],
  xiaoxue: ['敌人子弹慢 20%；敌人气血 +10%', 'enemy shots 20% slower; enemies +10% HP'],
  daxue: ['只看得见身边 520 以内；掉落 +25%', 'you can only see 520 around you; drops +25%'],
  dongzhi: ['月类兵器伤害 +25%；双数重是暗月', 'Moon weapons +25% damage; even waves are dark'],
  xiaohan: ['敌人护甲 +2；火伤害 +25%', 'enemies +2 armour; fire +25%'],
  dahan: ['首领气血 −15%；首领身边的小怪 +50%', 'bosses −15% HP; their adds +50%'],
};

/** 心镜 faces in words (GDD §17.2), by HeartFaceId. Numbers are HEART's (mirror-text.test checks). */
export const HEART_TEXT: Record<string, readonly [string, string]> = {
  heartHp: ['每阶 +2 气血', '+2 HP a rank'], heartRegen: ['每阶 +1 回血', '+1 HP Regen a rank'],
  heartMoon: ['每阶开局多 10 月华', 'start with +10 moonlight a rank'], heartReroll: ['每阶刷新便宜 4%', 'rerolls 4% cheaper a rank'],
  heartArmor: ['每阶 +1 护甲', '+1 armour a rank'], heartDodge: ['每阶 +2% 闪避', '+2% dodge a rank'],
  heartPickup: ['每阶拾取范围 +10%', '+10% pickup range a rank'], heartHarvest: ['每阶 +2 收成', '+2 Harvest a rank'],
  heartRevive: ['每局一次：倒下后带着 30% 气血站起来', 'once a run, get back up with 30% HP'], heartWard: ['每局第一次挨了致命一击，只剩 1 点血，不倒', 'the first lethal hit of a run leaves you at 1 HP'],
  heartStand: ['商店多一个货位', 'one more shop slot'], heartTrade: ['每阶卖兵器多拿 10%', 'weapons sell for +10% a rank'],
  heartKeepsake: ['每阶有 25% 几率开局兵器是灵品', '25% a rank that your starting weapon is Spirit tier'], heartPack: ['开局随机送一件凡品道具', 'start with a random Common item'],
  heartLuck: ['每阶 +4 福缘', '+4 Luck a rank'], heartCrit: ['每阶 +1% 暴击率', '+1% crit chance a rank'],
};

/** 1,234 → 「1,234」; the in-run counters use logic fmtBig for big numbers. */
export const fmtInt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');
