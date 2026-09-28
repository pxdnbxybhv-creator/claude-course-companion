// 水月幻镜 · every player-facing description, resolved from data (mirror3 CONTRACTS §3, d-text §5).
// The words live in data/say.ts as hand-written sentences with `{slot}`s; this module fills each slot
// from the def at the tier being shown, and generates outright what is pure structure: a weapon's head
// line (damage, cooldown, what it scales with), plain stat items, set steps, detail rows and the codex
// tier rows. Pure: no DOM (node-tested in tests/mirror-text.test.ts). Screens render these outputs and
// never re-derive description text.
import { AFFIXES, COMPANIONS, DIFFS, F, HAZARDS, ITEMS, MONSTERS, MUTATORS, PASSIVES, SETS, SKILLS, VOWS, WEAPONS } from '../data';
import { GLOSSARY, STAT_FMT, clsKey, termLine, termName } from '../data/glossary';
import {
  AFFIX_SAY, ARCH_SAY, COMPANION_SAY, DEED_SAY, DIFF_SAY, FLAG_SAY, FOE_SAY, HAZARD_SAY, ITEM_SAY, K, MUTATOR_SAY, PASSIVE_SAY,
  SKILL_SAY, TITLE_SAY, VOW_SAY, WEAPON_SAY, type Bi,
} from '../data/say';
import { DEED_REG, MONSTER_REG, named } from '../ids';
import type { AffixId, AltSkillId, ArchetypeId, DeedId, EliteId, FixedTitleId, HazardId, ItemId, MonsterId, MutatorId, PassiveId, SkillId, TreasureId, VowId, WeaponId } from '../ids';
import type { CharacterId, DiffIndex, Effect, PerTier, StatId, StatMods, Tier, WClass } from '../types';

type T = (zh: string, en: string) => string;
type Lang = 'zh' | 'en';
const TIERS: readonly Tier[] = [1, 2, 3, 4];

// ───────────────────────────────────────────── number and word formats

/** Round to 2 decimals and drop trailing zeros; a minus is U+2212. Never toFixed. */
export function num(x: number): string {
  const n = Math.round(x * 100) / 100;
  if (Object.is(n, -0) || n === 0) return '0';
  const a = Math.abs(n);
  const body = a >= 1000 && Number.isInteger(a) ? a.toLocaleString('en-US') : String(a);
  return n < 0 ? `−${body}` : body;
}
/** 1.5 → 「+50%」, 0.7 → 「−30%」 (a multiplier as a change). */
const dpct = (v: number) => { const p = Math.round((v - 1) * 100); return p >= 0 ? `+${p}%` : `−${-p}%`; };

const LADDER: Record<'size' | 'reach' | 'arc', readonly (readonly [number, string, string])[]> = {
  size: [[80, '一小圈', 'a small area'], [150, '一圈', 'a medium area'], [240, '一大圈', 'a large area'], [Infinity, '一大片', 'a huge area']],
  reach: [[160, '近处', 'close'], [300, '中等距离', 'mid-range'], [460, '远处', 'far'], [Infinity, '很远', 'very far']],
  arc: [[70, '前方窄窄一道', 'a narrow arc in front'], [100, '前方', 'in front'], [299, '前方一大片', 'a wide arc in front'], [Infinity, '一整圈', 'all around']],
};
/** The d-text §2.3 distance words: card text never shows a bare distance. */
export function distWord(kind: 'size' | 'reach' | 'arc', v: number, t: T): string {
  const row = LADDER[kind].find(([max]) => v <= max)!;
  return t(row[1], row[2]);
}
const CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
function times(v: number, lang: Lang): string {
  if (lang === 'en') return v === 2 ? 'twice' : v === 3 ? 'three times' : `${num(v)} times`;
  return v === 2 ? '翻倍' : Number.isInteger(v) && v <= 10 ? `变成${CN[v]}倍` : `变成 ${num(v)} 倍`;
}
function faster(v: number, lang: Lang): string {
  if (lang === 'en') return v === 2 ? 'twice as fast' : `${num(v)} times as fast`;
  return v === 2 ? '快一倍' : `快到 ${num(v)} 倍`;
}
function ord(v: number, lang: Lang): string {
  if (lang === 'zh') return num(v);
  const n = Math.round(v), m = n % 100;
  const suf = m >= 11 && m <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suf}`;
}
const statWord = (id: StatId, lang: Lang) => (lang === 'en' ? GLOSSARY[id].en : GLOSSARY[id].zh);
/** A scale's stat names, largest coefficient first: 「近战、护甲」 / "Melee and Armour". */
function scaleNames(sc: StatMods, lang: Lang): string {
  const ids = (Object.keys(sc) as StatId[]).filter((k) => (sc[k] ?? 0) > 0).sort((a, b) => (sc[b] ?? 0) - (sc[a] ?? 0));
  const names = ids.map((id) => statWord(id, lang));
  if (lang === 'zh') return names.join('、');
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ───────────────────────────────────────────── the slot resolver

/** What a slot path resolves to: a number, a per-tier number, a stat block, or ready words. */
type Val = number | PerTier | StatMods | string | undefined;
export type Getter = (path: string) => Val;

const SLOT = /\{([^{}]+)\}/g;
const EXPR = /^(-)?([@=]?[A-Za-z0-9_.]+?)(\*proc)?(?:([+\-*/])(\d+(?:\.\d+)?))?(%)?(?::(size|reach|arc|dpct|up|loss|times|faster|ord|by))?(?:\?([^|]*)\|(.*))?$/;

/** Thrown for a slot that doesn't resolve (tests catch it; screens get the raw text via safeFill). */
export class SlotError extends Error {}

/**
 * Fill every `{slot}` of a template (grammar in data/say.ts). `proc` is the weapon's hidden trigger
 * factor for `*proc`; `tier` picks a per-tier value.
 */
export function fill(tpl: string, get: Getter, lang: Lang, tier: Tier = 1, proc = 1): string {
  return tpl.replace(SLOT, (_all, body: string) => {
    const m = EXPR.exec(body);
    if (!m) throw new SlotError(`bad slot {${body}}`);
    const [, neg, path, star, op, opN, pct, fmt, one, many] = m;
    let v: Val;
    if (path.startsWith('=')) v = Number(path.slice(1));
    else if (path.startsWith('@')) { const n = named(path.slice(1)); if (!n) throw new SlotError(`no name ${path}`); return lang === 'en' ? n.en : n.zh; }
    else v = get(path);
    if (Array.isArray(v)) v = v[tier - 1];
    if (fmt === 'by') {
      if (!v || typeof v !== 'object') throw new SlotError(`{${body}}: not a scale`);
      return scaleNames(v as StatMods, lang);
    }
    if (typeof v === 'string') return v;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new SlotError(`{${body}} = ${String(v)}`);
    let x = v;
    if (neg) x = -x;
    if (star) x *= proc;
    if (op) { const k = Number(opN); x = op === '+' ? x + k : op === '-' ? x - k : op === '*' ? x * k : x / k; }
    if (one !== undefined) return lang === 'en' ? (Math.round(x * 100) === 100 ? one : many) : '';
    switch (fmt) {
      case 'size': case 'reach': case 'arc': return distWord(fmt, x, lang === 'en' ? (_z, e) => e : (z) => z);
      case 'dpct': return dpct(x);
      case 'up': return `${Math.round((x - 1) * 100)}%`;
      case 'loss': return `${Math.round((1 - x) * 100)}%`;
      case 'times': return times(x, lang);
      case 'faster': return faster(x, lang);
      case 'ord': return ord(x, lang);
      default: return pct ? `${num(x * 100)}%` : num(x);
    }
  });
}
/** fill() for both halves, then the current language. */
const fillT = (bi: Bi, get: Getter, t: T, tier: Tier = 1, proc = 1) =>
  t(fill(bi.zh, get, 'zh', tier, proc), fill(bi.en, get, 'en', tier, proc));

/** Follow a dotted path into an object ('when.below', 'scale.spirit', 'p.max'). */
function dig(o: unknown, path: string): Val {
  let cur: unknown = o;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur as Val;
}
/** Shared prefixes every getter understands: F.x, K.x. */
function common(path: string): Val | typeof NONE {
  if (path.startsWith('F.')) return dig(F, path.slice(2));
  if (path.startsWith('K.')) return dig(K, path.slice(2));
  return NONE;
}
const NONE = Symbol('none');
/** fx[i] with convert's k defaulting to 1 (gain = k · source / per). */
function fxGet(fx: readonly Effect[] | undefined, path: string): Val {
  const m = /^f(\d)\.(.+)$/.exec(path);
  if (!m || !fx) return undefined;
  const e = fx[Number(m[1])] as unknown as Record<string, unknown> | undefined;
  if (!e) return undefined;
  if (m[2] === 'k' && e.do === 'convert' && e.k === undefined) return 1;
  return dig(e, m[2]);
}

// ───────────────────────────────────────────── weapons

export interface WeaponDesc {
  /** 「伤害 10 · 0.9 秒一剑」 (generated). */
  head: string;
  /** 「受近战加成」 / "scales with Melee" ('' if none). */
  scales: string;
  /** The rules line at THIS tier. */
  body: string;
  /** 「神品：…」: what 神品 adds; null at IV when IV only raises numbers the body already shows. */
  t4: string | null;
  /** Exact numbers: 「射程 150」「暴击率 10%，暴击打 2 倍」… */
  detail: string[];
  /** Codex: 「一剑刺中：凡品 2 · 灵品 2 · 仙品 2 · 神品 4」. */
  tierRow: string[];
}

const GHOSTS = MONSTER_REG.filter((m) => MONSTERS[m.id].tags.includes('ghost'));

export function weaponGetter(id: WeaponId, tier: Tier): Getter {
  const w = WEAPONS[id], say = WEAPON_SAY[id];
  return (path) => {
    const c = common(path);
    if (c !== NONE) return c;
    if (path === 'ghosts') return undefined; // language-specific: handled in weaponWords
    if (say?.words && path in say.words) return undefined;
    if (path in w.p) return w.p[path];
    if (path === 'cd') return w.cd * F.tierCd[tier - 1];
    if (path === 'dmg') return w.dmg;
    const top = (w as unknown as Record<string, Val>)[path];
    return typeof top === 'number' ? top : undefined;
  };
}
function weaponGet(id: WeaponId, tier: Tier, lang: Lang): Getter {
  const base = weaponGetter(id, tier), say = WEAPON_SAY[id];
  return (path) => {
    if (path === 'ghosts') return GHOSTS.map((m) => (lang === 'en' ? m.en : m.zh)).join(lang === 'en' ? ', ' : '、');
    const words = say?.words?.[path];
    if (words) return lang === 'en' ? words[tier - 1].en : words[tier - 1].zh;
    return base(path);
  };
}
const procOf = (id: WeaponId) => { for (const [below, v] of F.proc) if (WEAPONS[id].cd < below) return v; return 1; };
const fillW = (bi: Bi, id: WeaponId, tier: Tier, t: T) =>
  t(fill(bi.zh, weaponGet(id, tier, 'zh'), 'zh', tier, procOf(id)), fill(bi.en, weaponGet(id, tier, 'en'), 'en', tier, procOf(id)));

/** 「受近战、护甲加成」 / "scales with Melee and Armour" ('' if none). */
export function scalesLine(sc: StatMods, t: T): string {
  const zh = scaleNames(sc, 'zh');
  return zh ? t(`受${zh}加成`, `scales with ${scaleNames(sc, 'en')}`) : '';
}

export function describeWeapon(id: WeaponId, tier: Tier, t: T): WeaponDesc {
  const w = WEAPONS[id], say = WEAPON_SAY[id];
  const cd = w.cd * F.tierCd[tier - 1];
  const dmg = w.dmg[tier - 1];
  const head = t(`伤害 ${num(dmg)} · ${num(cd)} 秒${say.unit}`, `${num(dmg)} damage · every ${num(cd)} s`);
  const body = fillW(say.say, id, tier, t);
  const t4 = tier === 4 && say.num4 ? null : `${termName('tier4', t)}${t('：', ': ')}${fillW(say.say4, id, 4, t)}`;
  const detail: string[] = [];
  for (const [stat, k] of Object.entries(w.scale).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [StatId, number][]) {
    if (k > 0) detail.push(t(`每点${GLOSSARY[stat].zh} +${num(k)} 伤害`, `+${num(k)} damage per ${GLOSSARY[stat].en}`));
  }
  const rangeZh = w.kind === 'orbit' ? '绕身半径' : w.kind === 'pulse' ? '音波半径' : '射程';
  const rangeEn = w.kind === 'orbit' || w.kind === 'pulse' ? 'radius' : 'range';
  if (w.kind !== 'pulse') detail.push(t(`${rangeZh} ${num(w.range)}`, `${rangeEn} ${num(w.range)}`));
  if (w.critX > 0) detail.push(t(`暴击率 ${num(w.crit)}%，暴击打 ${num(w.critX)} 倍`, `${num(w.crit)}% crit chance, crits deal ×${num(w.critX)}`));
  else { const d = named('dotting')!; detail.push(t(`不会暴击（有「${d.zh}」时可以）`, `can't crit (unless you have ${d.en})`)); }
  if (w.knock > 0) detail.push(t(`击退 ${num(w.knock)}`, `knockback ${num(w.knock)}`));
  for (const m of say.more ?? []) detail.push(fillW(m, id, tier, t));
  for (const m of say.more4 ?? []) detail.push(tier === 4 ? fillW(m, id, 4, t) : `${termName('tier4', t)}${t('：', ': ')}${fillW(m, id, 4, t)}`);
  return { head, scales: scalesLine(w.scale, t), body, t4, detail, tierRow: weaponTierRows(id, t) };
}

/** 「伤害：凡品 10 · 灵品 16 · 仙品 26 · 神品 42」, then one row per `rows` slot. */
export function weaponTierRows(id: WeaponId, t: T): string[] {
  const w = WEAPONS[id], say = WEAPON_SAY[id];
  const tw = (x: Tier) => t(GLOSSARY[`tier${x}` as 'tier1'].zh.slice(0, 1), ['', 'I', 'II', 'III', 'IV'][x]);
  const row = (label: string, vals: string[]) => `${label}${t('：', ': ')}${vals.map((v, i) => `${tw((i + 1) as Tier)} ${v}`).join(' · ')}`;
  const out = [row(t('伤害', 'Damage'), w.dmg.map((x) => num(x)))];
  for (const [slot, label] of say.rows ?? []) {
    out.push(row(t(label.zh, label.en), TIERS.map((x) => fill(`{${slot}}`, weaponGet(id, x, 'zh'), 'zh', x, procOf(id)))));
  }
  return out;
}

// ───────────────────────────────────────────── items

function statsLine(s: StatMods | undefined, sign: 1 | -1, t: T): string {
  if (!s) return '';
  const parts: string[] = [];
  for (const [id, v] of Object.entries(s) as [StatId, number][]) {
    if (!v || Math.sign(v) !== sign) continue;
    const f = STAT_FMT[id];
    const mag = f === 'pct' ? `${num(Math.abs(v))}%` : f === 'mult' ? num(Math.abs(v) / 100) : num(Math.abs(v));
    parts.push(t(`${GLOSSARY[id].zh} ${v > 0 ? '+' : '−'}${mag}`, `${v > 0 ? '+' : '−'}${mag} ${GLOSSARY[id].en}`));
  }
  return parts.join(t('，', ', '));
}
export function itemGetter(id: ItemId): Getter {
  const x = ITEMS[id];
  return (path) => {
    const c = common(path);
    if (c !== NONE) return c;
    if (path.startsWith('s.')) return x.stats?.[path.slice(2) as StatId];
    if (/^f\d\./.test(path)) return fxGet(x.fx, path);
    if (path === 'curse') return x.curse ?? 0;
    if (path === 'max') return x.max;
    return undefined;
  };
}
const end = (s: string, t: T) => (!s ? '' : /[。.!！]$/.test(s) ? s : s + t('。', '.'));

export function describeItem(id: ItemId, t: T): { body: string; detail: string[]; curse: number } {
  const x = ITEMS[id], say = ITEM_SAY[id], get = itemGetter(id);
  const pos = statsLine(x.stats, 1, t), neg = statsLine(x.stats, -1, t);
  const parts = say?.say ? [pos, fillT(say.say, get, t), neg] : [[pos, neg].filter(Boolean).join(t('，', ', '))];
  const curse = x.curse ?? 0;
  // a bare stat line reads like a label (「近战 +2」); sentences end with a stop
  let body = !say?.say && !curse ? parts[0] : parts.filter(Boolean).map((p) => end(p, t)).join(t('', ' '));
  if (curse) body += t(`劫数 +${curse}。`, `${body ? ' ' : ''}Curse +${curse}.`);
  const detail: string[] = [];
  // what each stat it gives does, in the glossary's plain words (a newcomer's first question)
  for (const id of Object.keys(x.stats ?? {}) as StatId[]) detail.push(`${termName(id, t)}${t('：', ': ')}${termLine(id, t)}`);
  for (const m of say?.more ?? []) detail.push(fillT(m, get, t));
  if (x.max === 1) detail.push(t('只能带 1 个', 'max 1'));
  else if (x.max > 1) detail.push(t(`最多带 ${x.max} 个`, `max ${x.max}`));
  if (x.from) detail.push(t(`第 ${x.from} 重起才会在商店出现`, `in shops from wave ${x.from}`));
  if (curse) detail.push(t(`${termName('curse', t)}（${termLine('curse', t)}）`, `${termName('curse', t)} (${termLine('curse', t)})`));
  return { body, detail, curse };
}

// ───────────────────────────────────────────── 镜技, 天性, companions

function skillGetter(id: SkillId | AltSkillId): Getter {
  const s = SKILLS[id];
  return (path) => {
    const c = common(path);
    if (c !== NONE) return c;
    if (path in s.p) return s.p[path];
    if (path === 'cd') return s.cd;
    if (path === 'reach') return s.reach;
    return undefined;
  };
}
export function describeSkill(id: SkillId | AltSkillId, t: T): { gist: string; body: string; detail: string[]; cd: number } {
  const s = SKILLS[id], say = SKILL_SAY[id], get = skillGetter(id);
  return { gist: fillT(say.gist, get, t), body: fillT(say.say, get, t), detail: (say.more ?? []).map((m) => fillT(m, get, t)), cd: s.cd };
}

function banNames(ch: CharacterId, lang: Lang): string {
  // en: 'Hidden weapon' → 'Hidden' (the template says "no {bans} weapons")
  return COMPANIONS[ch].bans.map((c) => (lang === 'en' ? GLOSSARY[clsKey(c)].en.replace(/ weapon$/, '') : GLOSSARY[clsKey(c)].zh)).join(lang === 'en' ? ' or ' : '、');
}
/** The companion's weapon multipliers as signed percents: w.melee (main scale), w.notInk, w.ink, w.music. */
function wmultOf(ch: CharacterId, key: string): number | undefined {
  for (const { match, pct } of COMPANIONS[ch].wmult) {
    if (key === 'melee' && match.scale === 'melee') return pct;
    if (key === 'notInk' && match.notCls === 'ink') return pct;
    if (key === 'ink' && match.cls === 'ink') return pct;
    if (key === 'music' && match.cls === 'music') return pct;
  }
  return undefined;
}
function passiveGet(id: PassiveId, lang: Lang): Getter {
  const p = PASSIVES[id], ch = p.char;
  return (path) => {
    const c = common(path);
    if (c !== NONE) return c;
    if (path === 'bans') return banNames(ch, lang);
    if (path.startsWith('s.')) return p.stats?.[path.slice(2) as StatId];
    if (/^f\d\./.test(path)) return fxGet(p.fx, path);
    if (path.startsWith('w.')) return wmultOf(ch, path.slice(2));
    if (path.startsWith('c0.')) return dig(COMPANIONS.scholar, path.slice(3));
    if (path.startsWith('c.')) return dig(COMPANIONS[ch], path.slice(2));
    if (path in p.p) return p.p[path];
    return undefined;
  };
}
const fillP = (bi: Bi, id: PassiveId, t: T) => t(fill(bi.zh, passiveGet(id, 'zh'), 'zh'), fill(bi.en, passiveGet(id, 'en'), 'en'));

export function describePassive(id: PassiveId, t: T): { gist: string; body: string; cost: string | null } {
  const say = PASSIVE_SAY[id];
  return { gist: fillP(say.gist, id, t), body: fillP(say.say, id, t), cost: say.cost ? fillP(say.cost, id, t) : null };
}
/** The select card's first line (d-panel §5.5), in glossary words. */
export function companionGist(id: CharacterId, t: T): string {
  return fillP(COMPANION_SAY[id], COMPANIONS[id].passive, t);
}
/** 流派 chips and the codex 流派 page. */
export function archLine(id: ArchetypeId, t: T): string {
  const x = ARCH_SAY[id];
  return x ? t(x.zh, x.en) : '';
}

// ───────────────────────────────────────────── class sets

/** Every rule flag in SETS, in words (tested: none missing). */
export const FLAG_TEXT: Record<string, { zh: string; en: string }> = Object.fromEntries(
  Object.entries(FLAG_SAY).map(([k, v]) => [k, { zh: fill(v.zh, () => undefined, 'zh'), en: fill(v.en, () => undefined, 'en') }]),
);
/**
 * A class's 2 / 4 / 6 steps in plain words, generated from SETS: stats are the totals at that step
 * (「共」), flags accumulate (乐器's area flags replace each other: the engine takes the largest).
 */
export function setSteps(cls: WClass, t: T): { n: 2 | 4 | 6; text: string }[] {
  const tiers = SETS[cls].tiers;
  const out: { n: 2 | 4 | 6; text: string }[] = [];
  let prevStats: StatMods = {};
  tiers.forEach((st, i) => {
    const parts: string[] = [];
    for (const [id, v] of Object.entries(st.stats) as [StatId, number][]) {
      const f = STAT_FMT[id];
      const mag = f === 'pct' ? `${num(v)}%` : f === 'mult' ? num(v / 100) : num(v);
      const had = (prevStats[id] ?? 0) !== 0 && prevStats[id] !== v;
      parts.push(t(`${GLOSSARY[id].zh}${had ? '共' : ''} +${mag}`, `+${mag} ${GLOSSARY[id].en}${had ? ' in total' : ''}`));
    }
    const flags = tiers.slice(0, i + 1).flatMap((x) => x.flags ?? []);
    const area = flags.filter((f) => f.startsWith('musicArea')).pop();
    for (const f of flags) {
      if (f.startsWith('musicArea') && f !== area) continue;
      const w = FLAG_TEXT[f];
      if (w) parts.push(t(w.zh, w.en));
    }
    prevStats = st.stats;
    out.push({ n: ([2, 4, 6] as const)[i], text: parts.join(t('，', ', ')) });
  });
  return out;
}

// ───────────────────────────────────────────── 镜境, 镜誓, 镜蚀, 镜印

export function vowLine(id: VowId, t: T): string {
  const v = VOWS[id], say = VOW_SAY[id];
  const line = fillT(say, (p) => v.per[p], t);
  return v.ranks > 1 ? t(`每层：${line}`, `per rank: ${line}`) : line;
}
export function diffLine(i: DiffIndex, t: T): string {
  const d = DIFFS[i];
  return fillT(DIFF_SAY[i], (p) => (d as unknown as Record<string, Val>)[p], t);
}
export function mutatorLine(id: MutatorId, v: number, t: T): string {
  const m = MUTATORS[id];
  return fillT(MUTATOR_SAY[id], (p) => (p === 'v' ? v : m.p[p]), t);
}
export function affixLine(id: AffixId, t: T): string {
  const a = AFFIXES[id];
  return fillT(AFFIX_SAY[id], (p) => a.p[p], t);
}
export function deedLine(id: DeedId, t: T): string {
  const d = DEED_REG.find((x) => x.id === id)!;
  return fillT(DEED_SAY[id], (p) => (p === 'goal' ? d.goal : p === 'alt' ? ('alt' in d ? d.alt.goal : undefined) : undefined), t);
}
export function titleLine(id: FixedTitleId, t: T): string {
  return fillT(TITLE_SAY[id], () => undefined, t);
}

// ───────────────────────────────────────────── monsters and hazards (codex)

export function foeTip(id: MonsterId | EliteId | TreasureId, t: T): string | null {
  const x = FOE_SAY[id];
  return x ? t(x.zh, x.en) : null;
}
export function hazardTip(id: HazardId, t: T): string | null {
  const x = HAZARD_SAY[id];
  return x ? fillT(x, (p) => HAZARDS[id].p[p], t) : null;
}
