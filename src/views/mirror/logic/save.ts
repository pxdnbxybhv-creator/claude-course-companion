// 水月幻镜 · the run save: deep validation (with the registry) and version migration (GDD §23).
// src/app/mirror.ts sanitises meta by shape only; this checks every id and number of meta.active.
// A run that can't be validated or migrated settles as 镜碎 ('migrate').
import { COMPANION_REG, HEART_REG, ITEM_REG, MAP_REG, MUTATOR_REG, TERM_MOD_REG, VOW_REG, WEAPON_REG, type ItemId, type WeaponId } from '../ids';
import type { DiffIndex, OwnedWeapon, RunSave, ShopSlot, ShopState, Tier } from '../types';
import { RUN_VER } from '../types';
import { heatOf } from './formulas';
import { VOWS as VOW_DEFS } from '../data';

const CHARS = new Set<string>(COMPANION_REG.map((c) => c.id));
const MAPS = new Set<string>(MAP_REG.map((m) => m.id));
const WEAPONS = new Set<string>(WEAPON_REG.map((w) => w.id));
const ITEMS = new Set<string>(ITEM_REG.map((i) => i.id));
const MUTS = new Set<string>(MUTATOR_REG.map((m) => m.id));
const TERMS = new Set<string>(TERM_MOD_REG.map((m) => m.id));
const VOWS = new Map<string, number>(VOW_REG.map((v) => [v.id, VOW_DEFS[v.id].ranks]));
const FACES = new Set<string>(HEART_REG.map((f) => f.id));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nat = (v: unknown, max = 1e9) => Math.max(0, Math.min(max, Math.floor(fin(v))));
const tier = (v: unknown): Tier | null => (v === 1 || v === 2 || v === 3 || v === 4 ? v : null);

function weapon(v: unknown): OwnedWeapon | null {
  if (!isObj(v) || typeof v.id !== 'string' || !WEAPONS.has(v.id)) return null;
  const t = tier(v.t);
  return t ? { id: v.id as WeaponId, t } : null;
}
function slot(v: unknown): ShopSlot | null {
  if (!isObj(v)) return null;
  const locked = v.locked === true;
  if (v.kind === 'weapon') { const w = weapon(v); return w ? { kind: 'weapon', id: w.id, t: w.t, locked } : null; }
  if (v.kind === 'item' && typeof v.id === 'string' && ITEMS.has(v.id)) return { kind: 'item', id: v.id as ItemId, locked };
  return null;
}
function counts<T extends string>(v: unknown, ok: Set<string>, max = 1e9): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (ok.has(k) && nat(n, max) > 0) out[k as T] = nat(n, max);
  return out;
}
function nums<T extends string>(v: unknown, allowNeg = true): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) {
    const x = fin(n, NaN);
    if (Number.isFinite(x) && (allowNeg || x >= 0) && k.length <= 32) out[k as T] = Math.max(-1e12, Math.min(1e12, x));
  }
  return out;
}

/** Validate a saved run (ids, tiers, numbers). null when it can't be trusted. Never throws. */
export function validateRun(raw: unknown): RunSave | null {
  try {
    if (!isObj(raw)) return null;
    const r = raw;
    if (typeof r.char !== 'string' || !CHARS.has(r.char)) return null;
    if (typeof r.map !== 'string' || !MAPS.has(r.map)) return null;
    const diff = nat(r.diff, 5) as DiffIndex;
    if (typeof r.ver !== 'number') return null;
    const weapons = Array.isArray(r.weapons) ? r.weapons.map(weapon).filter((w): w is OwnedWeapon => !!w).slice(0, 6) : [];
    const p = isObj(r.pending) ? r.pending : {};
    const start = Array.isArray(p.start) ? p.start.filter((id): id is WeaponId => typeof id === 'string' && WEAPONS.has(id)).slice(0, 4) : null;
    if (!weapons.length && !(start && start.length)) return null;
    let shop: ShopState | null = null;
    if (isObj(r.shop) && Array.isArray(r.shop.slots)) {
      shop = { wave: nat(r.shop.wave, 1e6), k: nat(r.shop.k, 1e6), free: nat(r.shop.free, 99), slots: r.shop.slots.slice(0, 6).map(slot) };
    }
    const vows = counts<keyof RunSave['vows'] & string>(r.vows, new Set(VOWS.keys()), 3);
    for (const k in vows) vows[k as keyof typeof vows] = Math.min(vows[k as keyof typeof vows] ?? 0, VOWS.get(k) ?? 1);
    const hearts = Array.isArray(p.hearts) ? p.hearts.filter((h): h is 'boss' | 'flower' => h === 'boss' || h === 'flower').slice(0, 9) : [];
    const byWeapon: RunSave['byWeapon'] = {};
    if (isObj(r.byWeapon)) for (const [k, v] of Object.entries(r.byWeapon)) if (WEAPONS.has(k) && isObj(v)) byWeapon[k as WeaponId] = { dmg: Math.max(0, fin(v.dmg)), kills: nat(v.kills) };
    const run: RunSave = {
      ver: fin(r.ver, 0),
      ticket: nat(r.ticket), free: r.free === true, runIndex: Math.max(1, nat(r.runIndex, 999)),
      rate: [0.25, 0.5, 1].includes(fin(r.rate)) ? fin(r.rate) : 0.25,
      startedDay: typeof r.startedDay === 'string' && DATE.test(r.startedDay) ? r.startedDay : '1970-01-01',
      seed: fin(r.seed) >>> 0, char: r.char as RunSave['char'], map: r.map as RunSave['map'], diff, vows, heat: heatOf(vows),
      daily: r.daily === true, plain: r.plain === true, heart: counts(r.heart, FACES, 9),
      wave: nat(r.wave, 9999), inWave: r.inWave === null || r.inWave === undefined ? null : nat(r.inWave, 9999),
      interruptions: nat(r.interruptions, 3), lvl: Math.max(1, nat(r.lvl, 9999)), xp: nat(r.xp, 1e9),
      moon: nat(r.moon, 1e9), store: nat(r.store, 1e9), harvest: Math.max(-1e6, Math.min(1e6, Math.floor(fin(r.harvest)))),
      stats: nums(r.stats), weapons, items: counts<ItemId>(r.items, ITEMS, 999), shop,
      pending: { start: start && start.length ? start : null, cards: nat(p.cards, 999), cardK: nat(p.cardK, 999), crates: nat(p.crates, 999), hearts },
      drunk: Math.max(0, fin(r.drunk)), lives: nat(r.lives, 9),
      once: Array.isArray(r.once) ? r.once.filter((x): x is string => typeof x === 'string').slice(0, 16) : [],
      mutators: Array.isArray(r.mutators) ? r.mutators.filter((m): m is RunSave['mutators'][number] => typeof m === 'string' && MUTS.has(m)).slice(0, 32) : [],
      term: typeof r.term === 'string' && TERMS.has(r.term) ? (r.term as RunSave['term']) : null,
      coins: nat(r.coins, 20), runStats: nums(r.runStats), byWeapon,
      lastBuy: typeof r.lastBuy === 'string' && (WEAPONS.has(r.lastBuy) || ITEMS.has(r.lastBuy)) ? (r.lastBuy as RunSave['lastBuy']) : null,
      ms: Math.max(0, fin(r.ms)),
    };
    // 破镜重圆 and the tutorial: optional, written only when set (older saves lack them)
    if (r.revived === true) run.revived = true;
    if (r.tutorial === true) run.tutorial = true;
    if (typeof r.downAt === 'number' && Number.isFinite(r.downAt) && r.downAt >= 1) run.downAt = nat(r.downAt, 9999);
    return run;
  } catch {
    return null;
  }
}

/** Upgrade an older save to RUN_VER, or null when it can't be (the run then settles as 镜碎). */
export function migrateRun(run: RunSave): RunSave | null {
  if (run.ver === RUN_VER) return run;
  // v1 → v2 (round 5): nothing to convert. The bump exists so an older build refuses a run that may hold
  // 镜宝 ids it does not know (it would drop them silently) and asks for a reload instead (newerSave).
  if (run.ver === 1) return { ...run, ver: RUN_VER };
  // A newer save (from a later build) is not ours to run.
  return null;
}
