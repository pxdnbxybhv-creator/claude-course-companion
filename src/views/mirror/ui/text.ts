// 水月幻镜 · UI words and small pure helpers (node-tested in tests/mirror-ui.test.ts). No DOM here.
// Names come from ids.ts (`named`); this file only adds what the screens need around them: stat
// labels, tier words, the pay lines of the results scroll, the lobby's rate words, input maths.
import { DEED_REG, named, lockOf, BOSS_REG, ENDLESS_BOSS_REG, WEAPON_REG, ITEM_REG, MONSTER_REG, ELITE_REG, TREASURE_REG, COMPANION_REG, MAP_REG, ARCHETYPE_REG } from '../ids';
import type { ItemId, WeaponId } from '../ids';
import type { CodexKey, PayBreakdown, StatId, Tier, WClass } from '../types';

export type Lang = 'zh' | 'en';
export type T = (zh: string, en: string) => string;
/** A t() for a fixed language (tests, canvas text). */
export const tFor = (lang: Lang): T => (zh, en) => (lang === 'en' ? en : zh);

// ───────────────────────────────────────────── stats
export const STAT_NAMES: Record<StatId, readonly [string, string]> = {
  hp: ['气血', 'HP'], regen: ['回气', 'Regen'], steal: ['吸血', 'Lifesteal'], dmg: ['伤害', 'Damage'], melee: ['近战', 'Melee'],
  ranged: ['远程', 'Ranged'], elem: ['五行', 'Elemental'], spirit: ['造化', 'Spirit'], aspd: ['攻速', 'Attack speed'], crit: ['暴击', 'Crit'],
  critDmg: ['暴伤', 'Crit damage'], range: ['射程', 'Range'], armor: ['护甲', 'Armour'], dodge: ['闪避', 'Dodge'], speed: ['身法', 'Speed'],
  luck: ['福缘', 'Luck'], harvest: ['收成', 'Harvest'], curse: ['劫数', 'Curse'], pickup: ['拾取', 'Pickup'], summonCap: ['墨宝上限', 'Ink cap'],
  swords: ['剑数', 'Swords'], stones: ['棋子', 'Stones'], knock: ['击退', 'Knockback'], area: ['范围', 'Area'], pierce: ['穿透', 'Pierce'],
  heal: ['疗效', 'Healing'],
};
/** Stats shown as percentage points. */
export const PCT_STATS: ReadonlySet<StatId> = new Set<StatId>(['steal', 'dmg', 'aspd', 'crit', 'dodge', 'speed', 'pickup', 'area', 'heal']);
export const statName = (id: StatId, t: T) => t(STAT_NAMES[id][0], STAT_NAMES[id][1]);
/** 「+5% 攻速」 / 「+5% Attack speed」. */
export function fmtStat(id: StatId, v: number, t: T): string {
  const n = Math.round(v * 10) / 10;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const abs = Math.abs(n);
  return `${sign}${abs}${PCT_STATS.has(id) ? '%' : id === 'range' ? ' u' : ''} ${statName(id, t)}`;
}
/** The value alone, for the stats panel: 「12%」 / 「40 u」 / 「3」. */
export function fmtStatValue(id: StatId, v: number): string {
  const n = Math.round(v * 10) / 10;
  return `${n < 0 ? '−' : ''}${Math.abs(n)}${PCT_STATS.has(id) ? '%' : id === 'range' ? ' u' : ''}`;
}

// ───────────────────────────────────────────── tiers and classes
export const TIER_ZH = ['', '凡', '灵', '仙', '神'] as const;
export const TIER_EN = ['', 'Common', 'Spirit', 'Immortal', 'Divine'] as const;
export const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;
export const tierName = (tier: Tier, t: T) => t(TIER_ZH[tier], TIER_EN[tier]);
export const CLASS_NAMES: Record<WClass, readonly [string, string]> = {
  sword: ['剑', 'Sword'], heavy: ['重器', 'Heavy'], fist: ['拳爪', 'Fist'], hidden: ['暗器', 'Hidden'], bow: ['弓弩', 'Bow'],
  fortune: ['福', 'Fortune'], flying: ['仙剑', 'Flying'], talisman: ['符箓', 'Talisman'], wine: ['酒', 'Wine'], music: ['乐器', 'Music'],
  ink: ['墨宝', 'Ink'], go: ['棋', 'Go'], moon: ['月', 'Moon'],
};
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
  out.push({ label: p.capped ? t('一照至多 70', 'capped at 70 a run') : t('合计', 'gross'), value: `${p.gross}` });
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
  return { deed: t(row.zh, row.en), how: row.look, goal: row.goal };
}

/** Boss display name for an intro (endless ids included). */
export function bossName(id: string, t: T): { name: string; verse: string } {
  const b = BOSS_REG.find((x) => x.id === id) ?? ENDLESS_BOSS_REG.find((x) => x.id === id);
  if (!b) return { name: id, verse: '' };
  return { name: t(b.zh, b.en), verse: t(b.verse, b.verseEn) };
}

/** 今日镜's 节气 modifiers in words (GDD §17.7), by TermModId. */
export const TERM_TEXT: Record<string, readonly [string, string]> = {
  lichun: ['众皆身法 +10%', 'everyone +10% speed'],
  yushui: ['灼烧 −50%，雷 +50%', 'burns −50%, lightning +50%'],
  jingzhe: ['妖群成双而来，间隔加倍；雷符连锁 +1', 'groups come in double bursts half as often; 雷符 chains +1'],
  chunfen: ['前半重敌速 +20%，后半重你伤害 +20%', 'enemies +20% speed in the first half; you +20% damage in the second'],
  qingming: ['处处水洼；回气 +2', 'puddles everywhere; +2 regen'],
  guyu: ['收成 +10；敌气血 +10%', '+10 harvest; enemies +10% HP'],
  lixia: ['每重短 10%', 'waves 10% shorter'],
  xiaoman: ['月华 +20%；物价 +10%', 'moonlight +20%; prices +10%'],
  mangzhong: ['5% 击破处生出疗伤之花', '5% of kills sprout a healing flower'],
  xiazhi: ['每重长 10%；升级多一张牌', 'waves 10% longer; +1 card choice'],
  xiaoshu: ['回气 −2；攻速 +10%', '−2 regen; +10% attack speed'],
  dashu: ['众皆身法 −10%；灼烧 +50%', 'everyone −10% speed; burns +50%'],
  liqiu: ['每 20 秒一阵风推动万物', 'a gust pushes everything every 20 s'],
  chushu: ['每重前 10 秒受伤 −30%', 'take −30% damage for the first 10 s of each wave'],
  bailu: ['闪避 +5%，护甲 −2', '+5% dodge, −2 armour'],
  qiufen: ['精怪掉两只镜奁', 'elites drop 2 caskets'],
  hanlu: ['霜地；敌速 −10%', 'frost patches; enemies −10% speed'],
  shuangjiang: ['暴击 +10%；疗效 −20%', '+10% crit; −20% healing'],
  lidong: ['每重结束，所持月华生息 5%（至多 25）', '+5% interest on moonlight held at wave end (max 25)'],
  xiaoxue: ['敌弹 −20% 速；敌气血 +10%', 'enemy shots −20% speed; enemies +10% HP'],
  daxue: ['视野半径 520；掉落 ×1.25', 'vision radius 520; drops ×1.25'],
  dongzhi: ['月类兵器 +25%；逢双数重暗月', 'moon weapons +25%; dark moon on even waves'],
  xiaohan: ['敌护甲 +2；火 +25%', 'enemies +2 armour; fire +25%'],
  dahan: ['首领气血 −15%；小妖 +50%', 'bosses −15% HP; adds +50%'],
};

/** 心镜 faces in words (GDD §17.2), by HeartFaceId. */
export const HEART_TEXT: Record<string, readonly [string, string]> = {
  heartHp: ['每阶 +2 气血', '+2 HP a rank'], heartRegen: ['每阶 +1 回气', '+1 regen a rank'],
  heartMoon: ['每阶开局 +10 月华', 'start with +10 moonlight a rank'], heartReroll: ['每阶重抽 −4%', 'rerolls −4% a rank'],
  heartArmor: ['每阶 +1 护甲', '+1 armour a rank'], heartDodge: ['每阶 +2% 闪避', '+2% dodge a rank'],
  heartPickup: ['每阶 +10% 拾取', '+10% pickup a rank'], heartHarvest: ['每阶 +2 收成', '+2 harvest a rank'],
  heartRevive: ['每照一次，倒下后以 30% 气血复起', 'once a run, rise again at 30% HP'], heartWard: ['每照头一次致命伤只剩 1 点气血', 'the first lethal hit of a run leaves you at 1 HP'],
  heartStand: ['镜市多一个货位', 'one more shop slot'], heartTrade: ['每阶卖兵器 +10%', 'weapons sell for +10% a rank'],
  heartKeepsake: ['每阶 25% 起手兵器为二阶', '25% a rank that the starting weapon is tier II'], heartPack: ['开局随得一件凡品', 'start with a random common item'],
  heartLuck: ['每阶 +4 福缘', '+4 luck a rank'], heartCrit: ['每阶 +1% 暴击', '+1% crit a rank'],
};

/** 1,234 → 「1,234」; the in-run counters use logic fmtBig for big numbers. */
export const fmtInt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');
