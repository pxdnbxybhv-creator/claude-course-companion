// 水月幻镜 · the 人物 panel's numbers and words (mirror3 d-panel §3, CONTRACTS §4.1). Pure: no DOM (the
// one exception, rememberPanelBase / panelBase, is a guarded localStorage convenience). Everything is read
// through logic (computeStats, maxHp, armorReduction, dodgeCapOf, weaponHit, cooldown …), so the shop, the
// pause sheet, the HUD's 人物 view and the results scroll can never drift from what the engine does.
import { named, type ItemId, type WeaponId } from '../ids';
import type { CharacterId, OwnedWeapon, RunSave, StatId, Stats, Tier, WClass } from '../types';
import { RUN_VER } from '../types';
import { BASE_STATS, CLAMP, COMPANIONS, ITEMS, SETS, STAT_IDS, WEAPONS, WCLASSES } from '../data';
import { clsKey, STAT_FMT, STAT_GROUPS, termLine as termLineOf, termName, type StatGroup } from '../data/glossary';
import {
  armorReduction, classCounts, computeStats, cooldown, dodgeCapOf, mainScale, maxHp, regenPerSec, setTiers, tierCd, weaponHit, weaponSlotsOf,
} from '../logic';
import { perTier, summonCapOf } from '../logic/formulas';
import { describeWeapon, FLAG_TEXT, setSteps } from './describe';
import type { T } from './text';

const tZh: T = (zh) => zh;
const MINUS = '−';

// ───────────────────────────────────────────── numbers
/** 2 decimals at most, trailing zeros dropped, never toFixed (0.855 → 0.86). */
export const num = (x: number): string => {
  const r = Math.round(Math.abs(x) * 100) / 100;
  return (x < 0 && r !== 0 ? MINUS : '') + String(r);
};
/** A signed number: 「+3」 「−1.5」 「0」. */
export const signed = (x: number): string => {
  const r = Math.round(Math.abs(x) * 100) / 100;
  if (r === 0) return '0';
  return (x < 0 ? MINUS : '+') + String(r);
};
/** The neutral value of a stat (what a fresh sheet holds: 墨宝上限 3, 棋子上限 6, else 0). */
export const neutralOf = (id: StatId): number => BASE_STATS[id] ?? 0;
/** Stats read as a count, never with a sign (「棋子上限 6」). */
const COUNT_STATS: ReadonlySet<StatId> = new Set<StatId>(['stones', 'summonCap']);

/** A stat's value as the panel shows it: 「+10%」 · 「+30」 · 「+0.3」 (暴击倍数) · 「6」 (a count). */
export function statValueText(id: StatId, v: number): string {
  const f = STAT_FMT[id];
  if (COUNT_STATS.has(id)) return num(v);
  // 暴击倍数 is an added multiplier: 「+0」, never a bare 「0」 that reads as 「crits deal ×0」
  if (f === 'mult') { const x = signed(v / 100); return x === '0' ? '+0' : x; }
  return signed(v) + (f === 'pct' ? '%' : '');
}
/** A change in a stat, in its own unit: 「+5%」 「−2」 「+0.1」. */
export function statDeltaText(id: StatId, d: number): string {
  const f = STAT_FMT[id];
  if (f === 'mult') return signed(d / 100);
  return signed(d) + (f === 'pct' ? '%' : '');
}

// ───────────────────────────────────────────── weapons
/** A weapon's rough damage per second: one hit with crits averaged in, over its cooldown (paint, turret
 *  and mine get half the 攻速). 神笔 and 砚台 don't hit themselves: what they paint or set down does, every
 *  `every` seconds (half 攻速, as the engine's spawnSummon), and about min(life / cd, 墨宝上限) are out. */
export function weaponDps(run: RunSave, s: Stats, x: Pick<OwnedWeapon, 'id' | 't'>): number {
  return weaponNumbers(run, s, x).dps;
}
export function weaponNumbers(run: RunSave, s: Stats, x: Pick<OwnedWeapon, 'id' | 't'>): { dps: number; cd: number; hit: number; crit: number; critM: number; every: number | null } {
  const def = WEAPONS[x.id];
  const h = weaponHit(run, s, x.id, x.t);
  const half = def.kind === 'paint' || def.kind === 'turret' || def.kind === 'mine';
  const cd = cooldown(tierCd(def, x.t), s.aspd, half);
  const hit = h.raw * h.mult * (1 + h.crit * (h.critM - 1));
  let perSec = 1 / cd, every: number | null = null;
  if (def.kind === 'paint' || def.kind === 'turret') {
    const turret = def.kind === 'turret';
    every = cooldown(turret ? perTier(def.p.atk as number | undefined, x.t, 0.8) : perTier(def.p.atk as never, x.t, 0.7), s.aspd, true);
    const life = perTier(def.p.life as number | undefined, x.t, turret ? 8 : 10);
    const out = Math.min(life / cd, summonCapOf(s));
    const blobs = turret ? perTier(def.p.blobs as never, x.t, 1) : 1;
    perSec = (out * blobs) / every;
  }
  return { dps: hit * perSec, cd, hit: h.raw * h.mult, crit: h.crit, critM: h.critM, every };
}
/** 「每 0.86 秒一下」, or for 神笔 / 砚台 what they put out and how often that strikes. */
export function cadenceText(kind: string, cd: number, every: number | null, t: T): string {
  if (every !== null && kind === 'paint') return t(`每 ${num(cd)} 秒画一只，每只 ${num(every)} 秒打一下`, `paints one every ${num(cd)} s; each strikes every ${num(every)} s`);
  if (every !== null && kind === 'turret') return t(`每 ${num(cd)} 秒放一方，每 ${num(every)} 秒吐一次墨`, `sets one down every ${num(cd)} s; it spits ink every ${num(every)} s`);
  return t(`每 ${num(cd)} 秒一下`, `every ${num(cd)} s`);
}

// ───────────────────────────────────────────── level-card preview
/** Before and after one level-up card, read through computeStats (大橘's 气血 ×0.5 and 嫦娥's 护甲 ×0.75
 *  apply), in the panel's words: 「现在 10% → 15%」, 「少受 6% → 12%」. */
export function levelPreview(run: RunSave, stat: StatId, v: number, t: T = tZh): { before: string; after: string; line: string } {
  const a = computeStats(run);
  const b = computeStats({ ...run, stats: { ...run.stats, [stat]: (run.stats[stat] ?? 0) + v } });
  if (stat === 'armor') {
    const ra = armorReduction(a.armor), rb = armorReduction(b.armor);
    const before = armourWords(ra, t), after = armourWords(rb, t);
    const sameWord = (ra >= 0) === (rb >= 0);
    const tail = sameWord ? `${Math.abs(rb)}%` : after;
    return { before, after, line: `${before} → ${tail}` };
  }
  const shown = (s: Stats): string => {
    if (stat === 'hp') return String(maxHp(s));
    if (stat === 'dodge') return `${num(Math.max(0, Math.min(s.dodge, dodgeCapOf(run))))}%`;
    if (stat === 'speed') return speedValue(s.speed, t).value;
    // no sign on either side: 「现在 0% → 3%」, never 「0% → +3%」 beside a 闪避 card's 「0% → 3%」
    return statValueText(stat, s[stat]).replace(/^\+/, '');
  };
  const before = shown(a), after = shown(b);
  return { before, after, line: t(`现在 ${before} → ${after}`, `Now ${before} → ${after}`) };
}
/** 「少受 6%」 / 「多受 7%」. */
export function armourWords(r: number, t: T = tZh): string {
  return r >= 0 ? t(`少受 ${r}%`, `${r}% less damage`) : t(`多受 ${-r}%`, `${-r}% more damage`);
}
function speedValue(speed: number, t: T): { value: string; word: string | null; sub: string; capped: boolean } {
  const v = Math.max(CLAMP.speedMin, Math.min(CLAMP.speedMax, speed));
  const capped = speed > CLAMP.speedMax || speed < CLAMP.speedMin;
  const n = num(Math.abs(v));
  if (Math.round(v * 100) === 0) return { value: t('常速', 'Normal'), word: null, sub: t('和常人一样快', 'normal speed'), capped };
  if (v > 0) return { value: `+${n}%`, word: null, sub: capped ? t('已到顶', 'at the limit') : t(`比常人快 ${n}%`, `${n}% faster than normal`), capped };
  return { value: `${MINUS}${n}%`, word: null, sub: capped ? t('已到底', 'at the limit') : t(`比常人慢 ${n}%`, `${n}% slower than normal`), capped };
}

// ───────────────────────────────────────────── the change since the wave just won (per viewer)
const BASE_KEY = 'banmu.mirror.panelBase';
/** What the sheet looked like just before a wave began: the 「和上一重比」 strip compares against it. */
export interface PanelBase {
  seed: number;
  /** The wave that was about to start (it is "the last wave" once it is won: run.wave === at). */
  at: number;
  stats: Stats;
  cap: number;
  weapons: { id: WeaponId; t: Tier }[];
  items: Partial<Record<ItemId, number>>;
  dps: number[];
  sets: Partial<Record<WClass, number>>;
}
export function makePanelBase(run: RunSave): PanelBase {
  const s = computeStats(run);
  return {
    seed: run.seed, at: run.wave + 1, stats: s, cap: dodgeCapOf(run),
    weapons: run.weapons.map((x) => ({ id: x.id, t: x.t })), items: { ...run.items },
    dps: run.weapons.map((x) => weaponDps(run, s, x)), sets: { ...setTiers(run) },
  };
}
/** Keep the sheet as the next wave starts (never in the save: a per-device convenience). */
export function rememberPanelBase(run: RunSave): void {
  try { localStorage.setItem(BASE_KEY, JSON.stringify(makePanelBase(run))); } catch { /* storage unavailable */ }
}
/** The kept sheet, when it belongs to this run and the wave just won; else null (the strip hides). */
export function panelBase(run: RunSave): PanelBase | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as PanelBase;
    if (!b || typeof b !== 'object' || b.seed !== run.seed || b.at !== run.wave || !b.stats || !Array.isArray(b.weapons)) return null;
    for (const k of STAT_IDS) if (typeof b.stats[k] !== 'number') return null;
    return b;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────── the view
export type Tone = 'up' | 'down' | 'plain';
export type BodyId = 'hp' | 'armor' | 'dodge' | 'speed';
export interface DeltaChip { text: string; tone: Tone; aria: string }
export interface TileView {
  id: BodyId;
  label: string;
  /** A word before the big number (「少受」), or null. */
  word: string | null;
  value: string;
  sub: string;
  tone: Tone;
  delta: DeltaChip | null;
  /** The plain line a tap opens (the glossary's). */
  gloss: string;
}
export interface RowView { id: StatId; label: string; value: string; tone: Tone; tag: string | null; delta: DeltaChip | null; gloss: string }
export interface GroupView { id: StatGroup; label: string; gloss: string; rows: RowView[]; folded: RowView[] }
export interface WeaponRowView {
  i: number; id: WeaponId; t: Tier; name: string; roman: string; tierWord: string; classes: string;
  dps: number; cd: number; hit: number; critM: number; crit: number;
  /** 「每 0.86 秒一下 · 受近战加成」. */
  line: string;
  /** Expanded: the rules line, the 神品 line, the numbers. */
  body: string; t4: string | null; detail: string[];
  delta: DeltaChip | null;
}
export interface SetRowView {
  cls: WClass; name: string; count: number; tier: -1 | 0 | 1 | 2;
  active: string | null;
  /** 「再 2 把（凑满 4 把）：暴击率 +10%」, or null at 6. */
  next: string | null;
  dugu: boolean;
}
export interface ItemView { id: ItemId; n: number; tier: Tier; name: string }
export interface PanelView {
  char: CharacterId;
  wave: number;
  level: number;
  slots: number;
  tiles: TileView[];
  groups: GroupView[];
  hiddenCount: number;
  weapons: WeaponRowView[];
  sets: SetRowView[];
  items: ItemView[];
  /** 「和上一重比」 chips, or null without a matching base. */
  delta: DeltaChip[] | null;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;
const TIER_TERM = ['', 'tier1', 'tier2', 'tier3', 'tier4'] as const;
/** 「灵品」 / "Spirit" (the glossary's tier words). */
export const tierWord = (tier: Tier, t: T): string => termName(TIER_TERM[tier], t);
const statLabel = (id: StatId, t: T) => termName(id, t);
const statGloss = (id: StatId, t: T) => termLineOf(id, t);
const nameOf = (id: string, t: T) => { const n = named(id); return n ? t(n.zh, n.en) : id; };

function tone(id: StatId, d: number): Tone {
  if (Math.abs(d) < 1e-9 || id === 'curse') return 'plain';
  return d > 0 ? 'up' : 'down';
}
function chip(id: StatId, d: number, t: T): DeltaChip | null {
  if (Math.abs(d) < 0.005) return null;
  const text = statDeltaText(id, d);
  const abs = statDeltaText(id, Math.abs(d)).replace(/^[+−]/, '');
  return { text, tone: tone(id, d), aria: d > 0 ? t(`比上一重多 ${abs}`, `${abs} more than last wave`) : t(`比上一重少 ${abs}`, `${abs} less than last wave`) };
}

/** Is a row worth a line (d-panel §3.3): off its neutral value, used by an owned weapon, or always read. */
export function relevance(run: Pick<RunSave, 'weapons'>, s: Stats, id: StatId): boolean {
  if (id === 'crit' || id === 'aspd') return true;
  if (Math.abs(s[id] - neutralOf(id)) > 1e-9) return true;
  const defs = run.weapons.map((x) => WEAPONS[x.id]);
  if (defs.some((d) => (d.scale[id] ?? 0) !== 0)) return true;
  if (id === 'swords') return defs.some((d) => d.classes.includes('flying'));
  if (id === 'stones') return defs.some((d) => d.classes.includes('go'));
  if (id === 'summonCap') return defs.some((d) => d.classes.includes('ink'));
  return false;
}

/**
 * Does this stat help what you hold? Said on the level-up card and the item card, where the choice is
 * made (the 人物 rows say it too): 「你的神笔受这项加成」, 「你现在的兵器用不上」, 「你的兵器都不会暴击」. `on`:
 * helps; false: it does nothing for your weapons yet. null: nothing worth saying.
 */
export function statFit(run: Pick<RunSave, 'weapons' | 'items'>, stat: StatId, t: T, named = false): { text: string; on: boolean } | null {
  if (!run.weapons.length) return null;
  if (stat === 'crit' || stat === 'critDmg') {
    const canCrit = run.weapons.some((x) => WEAPONS[x.id].critX > 0) || (run.items.dotting ?? 0) > 0;
    return canCrit ? null : { text: t('你的兵器都不会暴击', "your weapons can't crit"), on: false };
  }
  const users = run.weapons.filter((x) => (WEAPONS[x.id].scale[stat] ?? 0) !== 0);
  const what = named ? t(`受${statLabel(stat, t)}加成`, `scales with ${statLabel(stat, t)}`) : t('受这项加成', 'scales with this');
  if (users.length) {
    const uniq = [...new Set(users.map((x) => x.id))];
    return uniq.length === 1 && users.length === 1
      ? { text: t(`你的${nameOf(uniq[0], t)}${what}`, `your ${nameOf(uniq[0], t)} ${what}`), on: true }
      : { text: t(`${users.length} 把兵器${what}`, `${users.length} of your weapons ${named ? `scale with ${statLabel(stat, t)}` : 'scale with this'}`), on: true };
  }
  const cls: WClass | null = stat === 'swords' ? 'flying' : stat === 'stones' ? 'go' : stat === 'summonCap' ? 'ink' : null;
  const typed = stat === 'melee' || stat === 'ranged' || stat === 'elem' || stat === 'spirit';
  if (typed || (cls && !run.weapons.some((x) => WEAPONS[x.id].classes.includes(cls)))) {
    return { text: named ? t(`你现在的兵器用不上${statLabel(stat, t)}`, `none of your weapons use ${statLabel(stat, t)} yet`) : t('你现在的兵器用不上', 'none of your weapons use this yet'), on: false };
  }
  return null;
}
/** The same for an item card: the first stat it gives that helps; else, when nothing it gives helps, why. */
export function itemFit(run: Pick<RunSave, 'weapons' | 'items'>, id: ItemId, t: T): { text: string; on: boolean } | null {
  const st = ITEMS[id]?.stats ?? {};
  const ids = (Object.keys(st) as StatId[]).filter((k) => (st[k] ?? 0) > 0);
  const fits = ids.map((k) => statFit(run, k, t, true)).filter((f): f is { text: string; on: boolean } => !!f);
  const on = fits.find((f) => f.on);
  if (on) return on;
  return fits.length && fits.length === ids.length ? fits[0] : null;
}

/** The words of one set step: describe.setSteps (generated from SETS + FLAG_TEXT), with a SETS fallback. */
export function setStepText(cls: WClass, tier: 0 | 1 | 2, t: T): string {
  const n = ([2, 4, 6] as const)[tier];
  const fromText = setSteps(cls, t).find((x) => x.n === n)?.text;
  if (fromText) return fromText;
  const def = SETS[cls].tiers[tier];
  const parts = (Object.keys(def.stats) as StatId[]).map((k) => `${statLabel(k, t)} ${statDeltaText(k, def.stats[k] ?? 0)}`);
  for (const f of def.flags ?? []) {
    const w = FLAG_TEXT[f];
    if (w) parts.push(t(w.zh, w.en));
  }
  return parts.join(t('，', ', '));
}

/** The whole 人物 panel for a run, in words. `base`: the sheet before the wave just won (the change strip). */
export function panelView(run: RunSave, base?: PanelBase | null, t: T = tZh): PanelView {
  const s = computeStats(run);
  const cap = dodgeCapOf(run);
  const b = base ?? null;
  const bs = b?.stats ?? null;

  // ── body tiles
  const hpNow = maxHp(s);
  const regen = regenPerSec(s);
  const rNow = armorReduction(s.armor);
  const dodgeShown = Math.max(0, Math.min(s.dodge, cap));
  const spd = speedValue(s.speed, t);
  const bodyChip = (id: BodyId, d: number, unit: string): DeltaChip | null => {
    if (!bs || Math.abs(d) < 0.005) return null;
    const abs = num(Math.abs(d)) + unit;
    return { text: signed(d) + unit, tone: d > 0 ? 'up' : 'down', aria: d > 0 ? t(`比上一重多 ${abs}`, `${abs} more than last wave`) : t(`比上一重少 ${abs}`, `${abs} less than last wave`) };
  };
  const tiles: TileView[] = [
    {
      id: 'hp', label: statLabel('hp', t), word: null, value: String(hpNow),
      sub: regen > 0 ? t(`每秒回 ${num(Math.round(regen * 10) / 10)} 点血`, `heals ${num(Math.round(regen * 10) / 10)} a second`) : t('不会自己回血', 'no natural healing'),
      tone: 'plain', delta: bs ? bodyChip('hp', hpNow - maxHp(bs), '') : null, gloss: statGloss('hp', t),
    },
    {
      id: 'armor', label: t(`护甲 ${num(Math.round(s.armor * 10) / 10)}`, `Armour ${num(Math.round(s.armor * 10) / 10)}`),
      word: rNow >= 0 ? t('少受', 'take') : t('多受', 'take'), value: rNow >= 0 ? `${rNow}%` : `${-rNow}%`,
      sub: rNow >= 0 ? t('每次挨打的伤害', 'less damage per hit') : t('护甲是负的，挨打更疼', 'more damage per hit'),
      tone: rNow < 0 ? 'down' : 'plain', delta: bs ? armourChip(rNow, armorReduction(bs.armor), t) : null, gloss: statGloss('armor', t),
    },
    {
      id: 'dodge', label: statLabel('dodge', t), word: null, value: `${num(dodgeShown)}%`,
      sub: s.dodge > cap ? t(`已到顶，多出的 ${num(s.dodge - cap)}% 没用`, `capped; the extra ${num(s.dodge - cap)}% is wasted`) : t(`最多 ${cap}%`, `cap ${cap}%`),
      tone: 'plain', delta: bs && b ? bodyChip('dodge', dodgeShown - Math.max(0, Math.min(bs.dodge, b.cap)), '%') : null, gloss: statGloss('dodge', t),
    },
    {
      id: 'speed', label: statLabel('speed', t), word: null, value: spd.value, sub: spd.sub,
      tone: s.speed < 0 ? 'down' : 'plain',
      delta: bs ? bodyChip('speed', clampSpeed(s.speed) - clampSpeed(bs.speed), '%') : null, gloss: statGloss('speed', t),
    },
  ];

  // ── grouped rows
  const scalers = (id: StatId) => run.weapons.filter((x) => (WEAPONS[x.id].scale[id] ?? 0) !== 0);
  let hiddenCount = 0;
  const groups: GroupView[] = STAT_GROUPS.filter((g) => g.id !== 'body').map((g) => {
    const rows: RowView[] = [], folded: RowView[] = [];
    for (const id of g.stats) {
      const d = s[id] - neutralOf(id);
      const users = scalers(id);
      const uniq = [...new Set(users.map((x) => x.id))];
      const tag = uniq.length === 0 ? null
        : uniq.length === 1 && users.length === 1 ? t(`你的${nameOf(uniq[0], t)}受这项加成`, `your ${nameOf(uniq[0], t)} scales with this`)
          : t(`${users.length} 把兵器受这项加成`, `${users.length} weapons scale with this`);
      const row: RowView = {
        id, label: statLabel(id, t), value: statValueText(id, s[id]), tone: tone(id, d), tag,
        delta: bs ? chip(id, s[id] - bs[id], t) : null, gloss: statGloss(id, t),
      };
      (relevance(run, s, id) ? rows : folded).push(row);
    }
    hiddenCount += folded.length;
    return { id: g.id, label: t(g.zh, g.en), gloss: t(g.plainZh, g.plainEn), rows, folded };
  });

  // ── weapons
  const weapons: WeaponRowView[] = run.weapons.map((x, i) => {
    const def = WEAPONS[x.id];
    const n = weaponNumbers(run, s, x);
    const desc = describeWeapon(x.id, x.t, t);
    const ms = mainScale(def);
    const scales = desc.scales || (ms ? t(`受${statLabel(ms, t)}加成`, `scales with ${statLabel(ms, t)}`) : '');
    const detail: string[] = [];
    detail.push(n.critM > 1
      ? t(`一下约 ${Math.round(n.hit)} 点伤害，暴击时打 ${num(n.critM)} 倍（算上你的加成，暴击率 ${Math.round(n.crit * 100)}%）`, `about ${Math.round(n.hit)} a hit; crits hit ×${num(n.critM)} (${Math.round(n.crit * 100)}% chance with your bonuses)`)
      : t(`一下约 ${Math.round(n.hit)} 点伤害，不会暴击`, `about ${Math.round(n.hit)} a hit; cannot crit`));
    const perPoint: string[] = [];
    for (const k of Object.keys(def.scale) as StatId[]) {
      const c = def.scale[k] ?? 0;
      if (!c) continue;
      const add = c * s[k];
      perPoint.push(t(`每点${statLabel(k, t)} +${num(c)} 伤害`, `+${num(c)} damage per ${statLabel(k, t)}`));
      detail.push(add >= 0
        ? t(`每点${statLabel(k, t)} +${num(c)} 伤害；你现在 ${num(s[k])} 点，每下多 ${num(add)}`, `+${num(c)} damage per point of ${statLabel(k, t)}; you have ${num(s[k])}, adding ${num(add)} a hit`)
        : t(`每点${statLabel(k, t)} +${num(c)} 伤害；你现在 ${num(s[k])} 点，每下少 ${num(-add)}`, `+${num(c)} damage per point of ${statLabel(k, t)}; you have ${num(s[k])}, taking ${num(-add)} off a hit`));
    }
    // describe's own lines, minus the per-point ones already said above with your numbers
    for (const line of desc.detail) {
      if (perPoint.includes(line)) continue;
      if (def.critX > 0 && line === t(`暴击率 ${num(def.crit)}%，暴击打 ${num(def.critX)} 倍`, `${num(def.crit)}% crit chance, crits deal ×${num(def.critX)}`)) {
        detail.push(t(`兵器自带暴击率 ${num(def.crit)}%，暴击打 ${num(def.critX)} 倍`, `base crit ${num(def.crit)}%, crits deal ×${num(def.critX)}`));
        continue;
      }
      detail.push(line);
    }
    let delta: DeltaChip | null = null;
    if (b) {
      const j = b.weapons.findIndex((y) => y.id === x.id && y.t === x.t);
      if (j >= 0 && typeof b.dps[j] === 'number') {
        const d = Math.round(n.dps) - Math.round(b.dps[j]);
        if (d !== 0) delta = { text: signed(d), tone: d > 0 ? 'up' : 'down', aria: d > 0 ? t(`比上一重多 ${d}`, `${d} more than last wave`) : t(`比上一重少 ${-d}`, `${-d} less than last wave`) };
      }
    }
    return {
      i, id: x.id, t: x.t, name: nameOf(x.id, t), roman: ROMAN[x.t], tierWord: termName(TIER_TERM[x.t], t),
      classes: def.classes.map((c) => termName(clsKey(c), t)).join(' · '),
      dps: n.dps, cd: n.cd, hit: n.hit, critM: n.critM, crit: n.crit,
      line: [cadenceText(def.kind, n.cd, n.every, t), scales].filter(Boolean).join(' · '),
      body: desc.body, t4: desc.t4, detail, delta,
    };
  });

  // ── sets
  const cnt = classCounts(run);
  const tiers = setTiers(run);
  const dugu = (run.items.dugu ?? 0) > 0 && run.weapons.length === 1;
  const sets: SetRowView[] = WCLASSES.filter((c) => (cnt[c] ?? 0) > 0)
    .map((c) => {
      const count = cnt[c] ?? 0;
      const tier = (tiers[c] ?? -1) as -1 | 0 | 1 | 2;
      const need = tier >= 2 ? 0 : ([2, 4, 6] as const)[tier + 1];
      return {
        cls: c, name: termName(clsKey(c), t), count, tier,
        active: tier >= 0 ? setStepText(c, tier as 0 | 1 | 2, t) : null,
        next: tier >= 2 ? null : t(`再 ${need - count} 把（凑满 ${need} 把）：${setStepText(c, (tier + 1) as 0 | 1 | 2, t)}`, `${need - count} more (for ${need}): ${setStepText(c, (tier + 1) as 0 | 1 | 2, t)}`),
        dugu,
      };
    })
    .sort((a, b2) => b2.count - a.count);

  // ── items
  const items: ItemView[] = (Object.keys(run.items) as ItemId[])
    .filter((id) => (run.items[id] ?? 0) > 0 && ITEMS[id])
    .map((id) => ({ id, n: run.items[id] ?? 0, tier: ITEMS[id].tier as Tier, name: nameOf(id, t) }))
    .sort((a, b2) => b2.tier - a.tier);

  return {
    char: run.char, wave: run.wave, level: run.lvl, slots: weaponSlotsOf(run),
    tiles, groups, hiddenCount, weapons, sets, items,
    delta: b ? deltaStrip(run, s, cap, b, t) : null,
  };
}
const clampSpeed = (v: number) => Math.max(CLAMP.speedMin, Math.min(CLAMP.speedMax, v));
/** The armour tile's change, said as what it was: 「原来少受 6%」 (a bare −13% next to 「多受 7%」 misleads). */
function armourChip(now: number, was: number, t: T): DeltaChip | null {
  if (now === was) return null;
  const w = armourWords(was, t);
  return { text: t(`原来${w}`, `was ${w}`), tone: now > was ? 'up' : 'down', aria: t(`上一重是${w}`, `last wave: ${w}`) };
}

/** 「和上一重比」: body, then the other stats that moved, gear in and out, sets reached, new items. */
export function deltaStrip(run: RunSave, s: Stats, cap: number, b: PanelBase, t: T = tZh): DeltaChip[] {
  const out: DeltaChip[] = [];
  const bs = b.stats;
  const push = (text: string, d: number, aria?: string) => out.push({ text, tone: d > 0 ? 'up' : d < 0 ? 'down' : 'plain', aria: aria ?? text });
  const dh = maxHp(s) - maxHp(bs);
  if (dh) push(`${statLabel('hp', t)} ${signed(dh)}`, dh);
  const da = s.armor - bs.armor;
  if (Math.abs(da) >= 0.05) push(`${statLabel('armor', t)} ${signed(Math.round(da * 10) / 10)}`, da);
  const dd = Math.max(0, Math.min(s.dodge, cap)) - Math.max(0, Math.min(bs.dodge, b.cap));
  if (Math.abs(dd) >= 0.05) push(`${statLabel('dodge', t)} ${signed(dd)}%`, dd);
  const dsp = clampSpeed(s.speed) - clampSpeed(bs.speed);
  if (Math.abs(dsp) >= 0.05) push(`${statLabel('speed', t)} ${signed(dsp)}%`, dsp);
  for (const g of STAT_GROUPS) {
    if (g.id === 'body') continue;
    for (const id of g.stats) {
      const d = s[id] - bs[id];
      if (Math.abs(d) < 0.005) continue;
      out.push({ text: `${statLabel(id, t)} ${statDeltaText(id, d)}`, tone: tone(id, d), aria: `${statLabel(id, t)} ${statDeltaText(id, d)}` });
    }
  }
  // weapons: new, merged up, sold
  const ids = new Set<WeaponId>([...run.weapons.map((x) => x.id), ...b.weapons.map((x) => x.id)]);
  for (const id of ids) {
    const now = run.weapons.filter((x) => x.id === id).map((x) => x.t).sort((p, q) => q - p);
    const was = b.weapons.filter((x) => x.id === id).map((x) => x.t).sort((p, q) => q - p);
    const nowLeft = [...now], wasLeft: Tier[] = [];
    for (const tw of was) { const j = nowLeft.indexOf(tw); if (j >= 0) nowLeft.splice(j, 1); else wasLeft.push(tw); }
    const nm = nameOf(id, t);
    if (nowLeft.length && wasLeft.length) {
      push(t(`${nm} ${tierWord(wasLeft[0], t)} → ${tierWord(nowLeft[0], t)}`, `${nm} ${ROMAN[wasLeft[0]]} → ${ROMAN[nowLeft[0]]}`), 1);
      for (const tw of nowLeft.slice(1)) push(t(`新兵器 ${nm}（${tierWord(tw, t)}）`, `new ${nm} ${ROMAN[tw]}`), 1);
    } else if (nowLeft.length) {
      for (const tw of nowLeft) push(t(`新兵器 ${nm}（${tierWord(tw, t)}）`, `new ${nm} ${ROMAN[tw]}`), 1);
    } else if (wasLeft.length) {
      push(t(`卖了 ${nm}`, `sold ${nm}`), 0);
    }
  }
  // sets reached
  const tiers = setTiers(run);
  for (const c of WCLASSES) {
    const now = tiers[c] ?? -1, was = b.sets[c] ?? -1;
    if (now > was) push(t(`${termName(clsKey(c), t)} 凑满 ${[2, 4, 6][now]} 把`, `${termName(clsKey(c), t)} set of ${[2, 4, 6][now]}`), 1);
  }
  // new items
  for (const id of Object.keys(run.items) as ItemId[]) {
    const d = (run.items[id] ?? 0) - (b.items[id] ?? 0);
    if (d > 0) push(t(`新道具 ${nameOf(id, t)}${d > 1 ? ` ×${d}` : ''}`, `new ${nameOf(id, t)}${d > 1 ? ` ×${d}` : ''}`), 1);
  }
  return out;
}

// ───────────────────────────────────────────── the select sheet's companion card
/** A bare run for a companion (no gear, no 心镜): what computeStats gives it on the first step in. */
export function companionRun(char: CharacterId): RunSave {
  return {
    ver: RUN_VER, ticket: 0, free: true, runIndex: 0, rate: 1, startedDay: '2000-01-01', seed: 1, char, map: 'lake', diff: 0, vows: {}, heat: 0,
    daily: false, plain: true, heart: {}, wave: 0, inWave: null, interruptions: 0, lvl: 1, xp: 0, moon: 0, store: 0, harvest: 0, stats: {},
    weapons: [], items: {}, shop: null, pending: { start: null, cards: 0, cardK: 0, crates: 0, hearts: [] }, drunk: 0, lives: 0, once: [],
    mutators: [], term: null, coins: 0, runStats: {}, byWeapon: {}, lastBuy: null, ms: 0,
  };
}
const BODY_OF = (s: Stats): Record<BodyId, number> => ({ hp: maxHp(s), armor: s.armor, dodge: s.dodge, speed: s.speed });
let bodyRange: Record<BodyId, [number, number]> | null = null;
/** 1–5 dots for a companion's body number against the other twelve (no offsets, 0 armour is one dot). */
export function bodyDots(id: BodyId, v: number): number {
  if (!bodyRange) {
    const all = (Object.keys(COMPANIONS) as CharacterId[]).map((c) => BODY_OF(computeStats(companionRun(c))));
    bodyRange = {} as Record<BodyId, [number, number]>;
    for (const k of ['hp', 'armor', 'dodge', 'speed'] as BodyId[]) bodyRange[k] = [Math.min(...all.map((x) => x[k])), Math.max(...all.map((x) => x[k]))];
  }
  const [lo, hi] = bodyRange[id];
  if (hi <= lo) return 3;
  return 1 + Math.round((4 * (Math.max(lo, Math.min(hi, v)) - lo)) / (hi - lo));
}
/** Body tiles for the select card, plus the dots and the companion's other starting stats (「另有：回血 2」). */
export function companionView(char: CharacterId, t: T = tZh): { tiles: (TileView & { dots: number })[]; extra: string } {
  const run = companionRun(char);
  const v = panelView(run, null, t);
  const s = computeStats(run);
  const body = BODY_OF(s);
  const tiles = v.tiles.map((x) => ({ ...x, dots: bodyDots(x.id, body[x.id]) }));
  const extra = STAT_IDS.filter((id) => !['hp', 'armor', 'dodge', 'speed'].includes(id) && Math.abs(s[id] - neutralOf(id)) > 1e-9)
    .map((id) => `${statLabel(id, t)} ${statValueText(id, s[id])}`)
    .join(t('，', ', '));
  return { tiles, extra };
}
