// 水月幻镜 · m8 · the 模拟场's tuning layer (sandbox.md §5). SANDBOX owns it. Pure and node-tested.
// Every data table is walked at runtime (so new rows, new `p` / `fx` keys and new F constants appear by
// themselves, D32/D33). An override is an in-place write, by path, onto the real table object, so every
// module reads it with no plumbing; the default is kept per path and restored exactly on endTuning(),
// which then deep-compares every table (Object.is) with the snapshot taken at beginTuning() and falls back to
// a full leaf-by-leaf restore if anything differs. Nothing here is saved: a reload is always pristine.
// The purse's numbers (PAY, REVIVE) are not tunable: nothing in the sandbox pays, and the code never changes pay.
import { hashString } from '../../../core/rng';
import type { RunSave, SandRun, StatId, StatMods } from '../types';
import {
  AFFIXES, BASE_STATS, BOSSES, CARD_STATS, CLAMP, COMPANIONS, DIFFS, ELITES, ENDLESS_BOSS, F, HAZARDS, HEART, ITEMS, MAPS, MASTERY,
  MONSTERS, MUTATORS, PASSIVES, SETS, SKILLS, STAT_IDS, TERM_MODS, TREASURES, VOWS, WEAPONS,
} from '../data';
import { computeStats } from './formulas';

// ───────────────────────────────────────────── the tables
export type TableId =
  | 'COMPANIONS' | 'SKILLS' | 'PASSIVES' | 'WEAPONS' | 'SETS' | 'ITEMS' | 'MONSTERS' | 'ELITES' | 'TREASURES' | 'BOSSES' | 'ENDLESS_BOSS'
  | 'MAPS' | 'HAZARDS' | 'DIFFS' | 'VOWS' | 'MUTATORS' | 'AFFIXES' | 'HEART' | 'TERM_MODS' | 'CARD_STATS' | 'MASTERY' | 'F' | 'CLAMP'
  | 'BASE_STATS';
export interface TunableTable { id: TableId; obj: object; file: string; zh: string; en: string }
const D = 'src/views/mirror/data/';
/** The tables the editor lists, in group order (sandbox.md §4.4). PAY and REVIVE are not here. */
export const TUNABLE: readonly TunableTable[] = [
  { id: 'COMPANIONS', obj: COMPANIONS, file: D + 'companions.ts', zh: '同伴', en: 'Companions' },
  { id: 'SKILLS', obj: SKILLS, file: D + 'companions.ts', zh: '镜技', en: 'Skills' },
  { id: 'PASSIVES', obj: PASSIVES, file: D + 'companions.ts', zh: '天性', en: 'Natures' },
  { id: 'WEAPONS', obj: WEAPONS, file: D + 'weapons.ts', zh: '兵器', en: 'Weapons' },
  { id: 'SETS', obj: SETS, file: D + 'weapons.ts', zh: '套装', en: 'Sets' },
  { id: 'ITEMS', obj: ITEMS, file: D + 'items.ts', zh: '道具', en: 'Items' },
  { id: 'MONSTERS', obj: MONSTERS, file: D + 'monsters.ts', zh: '怪物', en: 'Monsters' },
  { id: 'ELITES', obj: ELITES, file: D + 'monsters.ts', zh: '精英', en: 'Elites' },
  { id: 'TREASURES', obj: TREASURES, file: D + 'monsters.ts', zh: '宝怪', en: 'Treasures' },
  { id: 'BOSSES', obj: BOSSES, file: D + 'bosses.ts', zh: '首领', en: 'Bosses' },
  { id: 'ENDLESS_BOSS', obj: ENDLESS_BOSS, file: D + 'bosses.ts', zh: '无尽首领', en: 'Endless bosses' },
  { id: 'MAPS', obj: MAPS, file: D + 'maps.ts', zh: '地图', en: 'Maps' },
  { id: 'HAZARDS', obj: HAZARDS, file: D + 'maps.ts', zh: '机关', en: 'Hazards' },
  { id: 'DIFFS', obj: DIFFS, file: D + 'difficulty.ts', zh: '镜境', en: 'Difficulties' },
  { id: 'VOWS', obj: VOWS, file: D + 'difficulty.ts', zh: '镜誓', en: 'Vows' },
  { id: 'MUTATORS', obj: MUTATORS, file: D + 'difficulty.ts', zh: '镜蚀', en: 'Mutators' },
  { id: 'AFFIXES', obj: AFFIXES, file: D + 'difficulty.ts', zh: '镜印', en: 'Affixes' },
  { id: 'HEART', obj: HEART, file: D + 'meta.ts', zh: '心镜', en: 'Heart mirror' },
  { id: 'TERM_MODS', obj: TERM_MODS, file: D + 'meta.ts', zh: '节气', en: 'Solar terms' },
  { id: 'CARD_STATS', obj: CARD_STATS, file: D + 'stats.ts', zh: '升级卡', en: 'Level-up cards' },
  { id: 'MASTERY', obj: MASTERY, file: D + 'stats.ts', zh: '心得', en: 'Mastery' },
  { id: 'F', obj: F, file: D + 'stats.ts', zh: '公式', en: 'Formulas' },
  { id: 'CLAMP', obj: CLAMP, file: D + 'stats.ts', zh: '上下限', en: 'Limits' },
  { id: 'BASE_STATS', obj: BASE_STATS, file: D + 'stats.ts', zh: '基础属性', en: 'Base stats' },
];
const TABLE = new Map<string, TunableTable>(TUNABLE.map((t) => [t.id, t]));
export const tableOf = (id: string): TunableTable | undefined => TABLE.get(id);

// ───────────────────────────────────────────── paths
export type Seg = string | number;
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** Path grammar: TABLE, then `.ident`, `["non-ident key"]` or `[index]`: WEAPONS.qingfeng.dmg[2], F.bossK["10"]. */
export function parsePath(p: string): Seg[] | null {
  const m0 = /^([A-Za-z_$][\w$]*)/.exec(p);
  if (!m0) return null;
  const out: Seg[] = [m0[1]];
  let i = m0[1].length;
  while (i < p.length) {
    if (p[i] === '.') {
      const m = /^[A-Za-z_$][\w$]*/.exec(p.slice(i + 1));
      if (!m) return null;
      out.push(m[0]);
      i += 1 + m[0].length;
    } else if (p[i] === '[') {
      const rest = p.slice(i);
      const n = /^\[(\d+)\]/.exec(rest);
      if (n) { out.push(Number(n[1])); i += n[0].length; continue; }
      const s = /^\["((?:[^"\\]|\\.)*)"\]/.exec(rest);
      if (!s) return null;
      try { out.push(JSON.parse(`"${s[1]}"`) as string); } catch { return null; }
      i += s[0].length;
    } else return null;
  }
  return out;
}
export function fmtPath(s: readonly Seg[]): string {
  return s.map((x, i) => (typeof x === 'number' ? `[${x}]` : i === 0 ? x : IDENT.test(x) ? `.${x}` : `[${JSON.stringify(x)}]`)).join('');
}

type Obj = Record<string | number, unknown>;
const isObj = (o: unknown): o is Obj => !!o && typeof o === 'object';
function parentOf(segs: readonly Seg[]): { parent: Obj; key: Seg } | null {
  const t = TABLE.get(segs[0] as string);
  if (!t || segs.length < 2) return null;
  let o: unknown = t.obj;
  for (let i = 1; i < segs.length - 1; i++) {
    if (!isObj(o)) return null;
    o = o[segs[i]];
  }
  return isObj(o) ? { parent: o, key: segs[segs.length - 1] } : null;
}
function read(segs: readonly Seg[]): unknown {
  const t = TABLE.get(segs[0] as string);
  if (!t) return undefined;
  let o: unknown = t.obj;
  for (let i = 1; i < segs.length; i++) {
    if (!isObj(o)) return undefined;
    o = o[segs[i]];
  }
  return o;
}

// ───────────────────────────────────────────── the walk (leaves, aliases, badges)
export type Badge = 'live' | 'spawn' | 'wave' | 'shop' | 'run' | 'none';
export interface Leaf {
  /** The path of the leaf's first occurrence (depth first, in table order). */
  path: string;
  segs: readonly Seg[];
  table: TableId;
  /** The other paths that reach the same value (a shared object in the source: MELEE_PEN, the 心镜 cost arrays). */
  aliases: readonly string[];
  /** Structural: shown, not editable (a term's index, a heart face's pair, a boss's wave, a map's music). */
  ro: boolean;
  /** When a change bites (sandbox.md §4.5). */
  badge: Badge;
  kind: 'number' | 'boolean';
  /** Counts, slots, tiers, waves: an edit is rounded. */
  int: boolean;
}

/** Alias prefixes: an object first met at `to`, met again at `from`. */
interface AliasPair { from: string; to: string }
interface Walked { leaves: Leaf[]; byPath: Map<string, Leaf>; pairs: AliasPair[] }
let walked: Walked | null = null;

const RO: readonly RegExp[] = [
  /^TERM_MODS\.[^.[]+\.index$/, /^HEART\.[^.[]+\.pair$/, /^DIFFS\[\d+\]\.index$/, /^BOSSES\.[^.[]+\.wave$/, /^MAPS\.[^.[]+\.music\./,
  // money stays out of the sandbox (PLAN D30): pay multipliers, the endless coin rate and the 心镜 shard costs
  /^DIFFS\[\d+\]\.pay$/, /^MAPS\.[^.[]+\.pay$/, /^F\.endless\.coinX$/, /^HEART\.[^.[]+\.costs\[\d+\]$/,
];
const INT_KEYS = new Set([
  'n', 'max', 'slots', 'ranks', 'tier', 't', 'wave', 'from', 'to', 'pack', 'count', 'lives', 'cards', 'choices', 'pierce', 'stones',
  'swords', 'summonCap', 'index', 'pair', 'mutatorFrom', 'mutatorEvery', 'stackMax', 'stack', 'jumps', 'chains', 'shots', 'bounces',
]);
const SHOP_F = new Set(['shopOdds', 'itemOdds', 'priceSlope', 'weaponSlope', 'tierMult', 'rerollSlope', 'rerollBase', 'weaponRoll', 'fullWeaponRoll', 'classLean', 'copyLean', 'sellFrac', 'pawnFrac']);
const RUN_F = new Set(['startMoon']);
const SPAWN_F = new Set(['heavyInk']);
function badgeFor(t: TableId, segs: readonly Seg[]): Badge {
  const k1 = segs[1], k2 = segs[2];
  switch (t) {
    case 'MONSTERS': case 'ELITES': case 'TREASURES': return 'spawn';
    case 'HEART': return k2 === 'costs' ? 'none' : 'run';
    case 'MASTERY': return 'run';
    case 'WEAPONS': return k2 === 'price' ? 'shop' : 'wave';
    case 'ITEMS': return k2 === 'price' || k2 === 'tier' ? 'shop' : 'wave';
    case 'COMPANIONS': return k2 === 'slots' ? 'run' : 'wave';
    case 'F': {
      const k = String(k1);
      if (SHOP_F.has(k) || /^school/.test(k)) return 'shop';
      if (RUN_F.has(k)) return 'run';
      if (SPAWN_F.has(k)) return 'spawn';
      return 'wave';
    }
    default: return 'wave';
  }
}

function walk(): Walked {
  if (walked) return walked;
  const leaves: Leaf[] = [];
  const byPath = new Map<string, Leaf>();
  const pairs: AliasPair[] = [];
  const seen = new Map<object, string>();
  const visit = (t: TableId, o: unknown, segs: Seg[]): void => {
    if (typeof o === 'number' || typeof o === 'boolean') {
      const path = fmtPath(segs);
      const last = segs[segs.length - 1];
      const leaf: Leaf = {
        path, segs: segs.slice(), table: t, aliases: [], ro: RO.some((r) => r.test(path)), badge: badgeFor(t, segs),
        kind: typeof o === 'number' ? 'number' : 'boolean',
        int: typeof o === 'number' && Number.isInteger(o) && typeof last === 'string' && INT_KEYS.has(last),
      };
      leaves.push(leaf);
      byPath.set(path, leaf);
      return;
    }
    if (!isObj(o)) return;
    const here = fmtPath(segs);
    const first = seen.get(o);
    if (first !== undefined) { pairs.push({ from: here, to: first }); return; }
    seen.set(o, here);
    if (Array.isArray(o)) o.forEach((x, i) => visit(t, x, [...segs, i]));
    else for (const k of Object.keys(o)) visit(t, o[k], [...segs, k]);
  };
  for (const tb of TUNABLE) visit(tb.id, tb.obj, [tb.id]);
  // each leaf inside a shared object lists the other paths to it
  for (const leaf of leaves) {
    const al = new Set<string>();
    let frontier = [leaf.path];
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const next: string[] = [];
      for (const p of frontier) for (const pr of pairs) {
        if (p === pr.to || p.startsWith(pr.to + '.') || p.startsWith(pr.to + '[')) {
          const q = pr.from + p.slice(pr.to.length);
          if (q !== leaf.path && !al.has(q)) { al.add(q); next.push(q); }
        }
      }
      frontier = next;
    }
    leaf.aliases = [...al];
  }
  walked = { leaves, byPath, pairs };
  return walked;
}
/** Every editable leaf (numbers and booleans), depth first, with its aliases, read-only flag and badge. Memoised
 *  (re-walked at each beginTuning, so rows added since show). The value is read with valueOf(path). */
export function leaves(): readonly Leaf[] { return walk().leaves; }
/** The first path of a value reached through a shared object (an alias path maps back to it). */
export function canonPath(path: string): string {
  const w = walk();
  if (w.byPath.has(path)) return path;
  let p = path;
  for (let i = 0; i < 6; i++) {
    const pr = w.pairs.find((x) => p === x.from || p.startsWith(x.from + '.') || p.startsWith(x.from + '['));
    if (!pr) break;
    p = pr.to + p.slice(pr.from.length);
    if (w.byPath.has(p)) return p;
  }
  return p;
}
export function leafOf(path: string): Leaf | undefined { return walk().byPath.get(canonPath(path)); }
export function aliasesOf(path: string): string[] {
  const c = canonPath(path);
  const l = walk().byPath.get(c);
  if (!l) return [];
  return [c, ...l.aliases].filter((p) => p !== path);
}

// ───────────────────────────────────────────── StatMods maps (keys may be added or removed)
const STAT_MAPS: readonly RegExp[] = [
  /^COMPANIONS\.[^.[]+\.extra$/, /^PASSIVES\.[^.[]+\.stats$/, /^ITEMS\.[^.[]+\.stats$/, /^SETS\.[^.[]+\.tiers\[\d+\]\.stats$/,
  /^TERM_MODS\.[^.[]+\.stats$/, /^HEART\.[^.[]+\.per$/,
];
const STAT_SET = new Set<string>(STAT_IDS);
/** Is `path` a StatId key of a StatMods map the editor may add to (COMPANIONS.*.extra, ITEMS.*.stats, …)? */
export function isStatMapKey(path: string): boolean {
  const segs = parsePath(path);
  if (!segs || segs.length < 3) return false;
  const key = segs[segs.length - 1];
  return typeof key === 'string' && STAT_SET.has(key) && STAT_MAPS.some((r) => r.test(fmtPath(segs.slice(0, -1))));
}

// ───────────────────────────────────────────── the session state
interface Override { segs: readonly Seg[]; path: string; def: unknown; had: boolean; madeMap: boolean }
let active = false;
let snap: Record<string, unknown> | null = null;
/** Overrides by canonical path, in order of first write. */
const over = new Map<string, Override>();

/** Deep equality with Object.is on leaves (Infinity, −0 and NaN exact). */
export function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isObj(a) || !isObj(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
}
function tablesNow(): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const t of TUNABLE) o[t.id] = t.obj;
  return o;
}

/** Enter tuning: snapshot every table (structuredClone keeps the shared objects shared) and clear the overrides. */
export function beginTuning(): void {
  if (active) endTuning();
  snap = structuredClone(tablesNow());
  over.clear();
  walked = null;
  active = true;
}
export function tuningActive(): boolean { return active; }

export type SetResult = 'ok' | 'ro' | 'missing' | 'type' | 'inactive';
const HP_TABLES = new Set<TableId>(['MONSTERS', 'ELITES', 'TREASURES', 'COMPANIONS']);
/** Keep a value inside what the engine can run: cd ≥ 0.05, r ≥ 1, a body's 气血 ≥ 1, odds and weights ≥ 0. */
function clampFor(segs: readonly Seg[], v: number, int: boolean): number {
  const k = segs[segs.length - 1];
  const t = segs[0] as TableId;
  let x = int ? Math.round(v) : v;
  if (k === 'cd') x = Math.max(0.05, x);
  // fields whose type is a small literal union: the applied source must still typecheck
  else if (k === 'tier' && (t === 'ITEMS' || t === 'WEAPONS')) x = Math.min(4, Math.max(1, Math.round(x)));
  else if (k === 'slots' && t === 'COMPANIONS') x = Math.min(6, Math.max(5, Math.round(x)));
  else if (k === 'diff' && t === 'DIFFS') x = Math.min(5, Math.max(0, Math.round(x)));
  else if (k === 'r') x = Math.max(1, x);
  else if (k === 'hp' && segs.length === 3 && HP_TABLES.has(t)) x = Math.max(1, x);
  else if (k === 'chance' || k === 'weight') x = Math.max(0, x);
  if (t === 'F' && (segs[1] === 'shopOdds' || segs[1] === 'itemOdds')) x = Math.max(0, x);
  return x;
}

/**
 * Write one leaf in place (the first write keeps its default). `null` puts the default back. Only inside
 * beginTuning()…endTuning(). Numbers must be finite; the type must match the leaf; read-only fields refuse.
 * In a StatMods map (COMPANIONS.*.extra, PASSIVES.*.stats, ITEMS.*.stats, SETS.*.tiers[i].stats,
 * TERM_MODS.*.stats, HEART.*.per) a StatId key may be added (its default is null: absent) and removed again.
 */
export function setValue(path: string, v: number | boolean | null): SetResult {
  if (!active) return 'inactive';
  const raw = parsePath(path);
  if (!raw) return 'missing';
  const cpath = canonPath(fmtPath(raw));
  const segs = parsePath(cpath)!;
  const leaf = walk().byPath.get(cpath);
  const statKey = !leaf && isStatMapKey(cpath);
  if (!leaf && !statKey && !over.has(cpath)) return 'missing';
  if (leaf?.ro) return 'ro';
  if (v !== null) {
    if (leaf && typeof v !== (leaf.kind === 'number' ? 'number' : 'boolean')) return 'type';
    if (!leaf && typeof v !== 'number') return 'type';
    if (typeof v === 'number' && !Number.isFinite(v)) return 'type';
  }
  let pp = parentOf(segs);
  let madeMap = false;
  if (!pp && statKey && v !== null) {
    // the StatMods map itself is absent (a companion with no extra, a term without stats): make it, and
    // remember to delete it on restore
    const host = parentOf(segs.slice(0, -1));
    if (!host) return 'missing';
    host.parent[host.key] = {};
    madeMap = true;
    pp = parentOf(segs);
  }
  if (!pp) return 'missing';
  const { parent, key } = pp;
  let o = over.get(cpath);
  if (!o) {
    if (v === null) return 'ok'; // already the default
    const had = Object.prototype.hasOwnProperty.call(parent, key);
    o = { segs, path: cpath, def: had ? parent[key] : null, had, madeMap };
    over.set(cpath, o);
  }
  if (v === null) { putBack(o); over.delete(cpath); return 'ok'; }
  parent[key] = typeof v === 'number' ? clampFor(segs, v, !!leaf?.int) : v;
  return 'ok';
}
function putBack(o: Override): void {
  const pp = parentOf(o.segs);
  if (!pp) return;
  if (o.had) pp.parent[pp.key] = o.def;
  else delete pp.parent[pp.key];
  if (o.madeMap) {
    const host = parentOf(o.segs.slice(0, -1));
    if (host && isObj(host.parent[host.key]) && Object.keys(host.parent[host.key] as Obj).length === 0) delete host.parent[host.key];
  }
}

export function valueOf(path: string): unknown {
  const s = parsePath(path);
  return s ? read(s) : undefined;
}
/** The default of a path: the value at beginTuning() (null for a StatMods key that was absent). */
export function defaultOf(path: string): unknown {
  const s = parsePath(path);
  if (!s) return undefined;
  const c = canonPath(fmtPath(s));
  const o = over.get(c);
  if (o) return o.had ? o.def : null;
  if (snap) {
    let x: unknown = snap[s[0] as string];
    for (const seg of parsePath(c)!.slice(1)) { if (!isObj(x)) return null; x = x[seg]; }
    return x === undefined ? null : x;
  }
  const v = read(parsePath(c)!);
  return v === undefined ? null : v;
}

export interface Change { path: string; table: TableId; file: string; default: number | boolean | null; value: number | boolean | null; aliases: string[] }
/** Only the values that differ from their default (Object.is), in order of first write. */
export function changes(): readonly Change[] {
  const out: Change[] = [];
  for (const o of over.values()) {
    const cur = read(o.segs);
    const def = o.had ? o.def : null;
    const val = cur === undefined ? null : cur;
    if (Object.is(val, def)) continue;
    const t = TABLE.get(o.segs[0] as string)!;
    out.push({ path: o.path, table: t.id, file: t.file, default: def as number | boolean | null, value: val as number | boolean | null, aliases: aliasesOf(o.path) });
  }
  return out;
}

/** Every override back to its default; still tuning. */
export function resetAll(): void {
  for (const o of [...over.values()].reverse()) putBack(o);
  over.clear();
}

/** Put the snapshot back leaf by leaf (deleting keys the snapshot lacks). Returns how many values it fixed. */
function fullRestore(live: unknown, want: unknown): number {
  if (!isObj(live) || !isObj(want)) return 0;
  let n = 0;
  for (const k of Object.keys(live)) {
    if (!Object.prototype.hasOwnProperty.call(want, k)) { delete live[k]; n++; continue; }
    const a = live[k], b = want[k];
    if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) n += fullRestore(a, b);
    else if (!Object.is(a, b)) { live[k] = isObj(b) ? structuredClone(b) : b; n++; }
  }
  for (const k of Object.keys(want)) if (!Object.prototype.hasOwnProperty.call(live, k)) { live[k] = structuredClone(want[k]); n++; }
  if (Array.isArray(live) && Array.isArray(want) && live.length !== want.length) { live.length = want.length; n++; }
  return n;
}

/**
 * Leave tuning: every override back in reverse order of first write, then a deep Object.is check of every
 * table against the snapshot; if anything differs (a write behind the layer's back, an alias written through
 * two paths), a full leaf-by-leaf restore from the snapshot. `exact` is true when no fallback was needed.
 */
export function endTuning(): { restored: number; exact: boolean } {
  if (!active) return { restored: 0, exact: true };
  const restored = over.size;
  resetAll();
  let exact = true;
  if (snap && !same(tablesNow(), snap)) {
    exact = false;
    let n = 0;
    for (const t of TUNABLE) n += fullRestore(t.obj, snap[t.id]);
    try { console.warn('[mirror] tuning restore', n); } catch { /* no console */ }
  }
  snap = null;
  active = false;
  walked = null;
  return { restored, exact };
}

// ───────────────────────────────────────────── the fingerprint
function fmtVal(v: unknown): string {
  return typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : String(v);
}
/**
 * The pristine tables' fingerprint: a hash of every leaf `path=value` (the snapshot while tuning). `except`
 * leaves out paths (and their aliases), so an apply can prove it touched nothing else. `live` hashes the tables
 * as they are now even while tuning (the verify step's stand-in for an applied source).
 */
export function dataHash(o: { except?: readonly string[]; live?: boolean } = {}): string {
  const skip = new Set<string>();
  for (const p of o.except ?? []) { const s = parsePath(p); if (s) skip.add(canonPath(fmtPath(s))); }
  const parts: string[] = [];
  for (const l of walk().leaves) {
    if (skip.has(l.path)) continue;
    let v: unknown;
    if (snap && !o.live) { v = snap[l.table]; for (const s of l.segs.slice(1)) v = isObj(v) ? v[s] : undefined; }
    else v = read(l.segs);
    parts.push(`${l.path}=${fmtVal(v)}`);
  }
  return 'h:' + (hashString(parts.join('\n')) >>> 0).toString(16).padStart(8, '0');
}

// ───────────────────────────────────────────── the run-level what-ifs (RunSave.sand, sandbox.md §5.4)
export interface SheetRow { id: StatId; mode: 'add' | 'set'; v: number }
/**
 * The run's SandRun from the dock's sheet rows. A 劫数 row goes into `curse` (curseOf adds it, so enemies scale
 * and the player's 劫 damage follows); every other row goes into `sheet` (applySheet: after the gain factors,
 * before clampSheet). 设为 on 劫数 is exact against the run as it is now.
 */
export function sandOf(run: RunSave, rows: readonly SheetRow[]): SandRun {
  const sheet = rows.filter((r) => r.id !== 'curse' && STAT_SET.has(r.id) && Number.isFinite(r.v)).map((r) => ({ id: r.id, mode: r.mode, v: r.v }));
  let curse = 0;
  for (const r of rows) {
    if (r.id !== 'curse' || !Number.isFinite(r.v)) continue;
    if (r.mode === 'add') curse += r.v;
    else curse = r.v - computeStats({ ...run, sand: { sheet: [], curse: 0 } }).curse;
  }
  return { sheet, curse };
}
/** The run with its sandbox rows applied (a real run never carries `sand`: validateRun drops it). */
export function withSheet(run: RunSave, rows: readonly SheetRow[]): RunSave {
  return { ...run, sand: sandOf(run, rows) };
}
/** Add stats to a StatMods-like record (for 「写进同伴底子」 previews). */
export function statDelta(base: StatMods, id: StatId, v: number): StatMods {
  return { ...base, [id]: (base[id] ?? 0) + v };
}
