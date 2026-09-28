// 水月幻镜 · the mirror's meta store (GDD §23): eager and tiny. It imports only *types* from the mirror
// (never the registry), so the game's tables stay in its lazy chunk. It rides along in backups, writes
// through a debounced effect (plus saveMetaNow for the moments that matter), follows other tabs, and
// is the one door from the mirror to the purse (payOwed). The owner's code never touches any of it.
import { batch, effect, signal } from '@preact/signals';
import type { CharacterId } from '../data/characters';
import { CHARACTERS } from '../data/characters';
import type { DateKey } from '../core/types';
import { todayKey } from '../core/date';
import type { Best, MirrorMeta, MirrorSettings, PayDay, RunSave, TutorFlags } from '../views/mirror/types';
import { RUN_VER } from '../views/mirror/types';
import { backupExtras } from './store';
import { earnFrom, play, record } from './play';

export const MIRROR_KEY = 'banmu.mirror.v1';

const CHAR_IDS = new Set<string>(CHARACTERS.map((c) => c.id));
const MAP_IDS = ['lake', 'forest', 'palace'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultMeta(today: DateKey = todayKey()): MirrorMeta {
  return {
    v: 1, ticketsUsed: 0, active: null, deeds: {}, codex: {}, tally: {}, bests: {}, seals: {}, diffMax: 1, mapsOpen: 1, firsts: {},
    dust: 0, heart: { ranks: {}, pick: {}, plain: false }, mastery: {},
    daily: { day: today, best: 0, bonus: false, weekDays: [], weekPaid: null }, slips: {},
    payDay: { day: today, runs: 0, free: false, paid: 0, drops: 0, refunded: false },
    coinsPaid: 0, owed: 0, firstsHeld: 0, lastDay: today,
    lobby: { char: 'scholar', map: 'lake', diff: 1, vows: {} },
    settings: { aim: 'auto', nums: 1, shake: true, left: false, quality: 'auto', tips: true },
    records: {}, titles: [], title: null, rims: [], rim: null,
    tutor: { offered: false, done: false, tips: {} },
  };
}

// ───────────────────────────────────────────── sanitize (shape-level, never throws)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nat = (v: unknown, max = 1e9) => Math.max(0, Math.min(max, Math.floor(fin(v))));
const key = (k: string) => k.length > 0 && k.length <= 80;
const date = (v: unknown, d: DateKey): DateKey => (typeof v === 'string' && DATE.test(v) ? v : d);
function numMap<T extends string>(v: unknown, max = 1e9): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (key(k) && nat(n, max) > 0) out[k as T] = nat(n, max);
  return out;
}
function trueMap<T extends string>(v: unknown): Partial<Record<T, true>> {
  const out: Partial<Record<T, true>> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (key(k) && n === true) out[k as T] = true;
  return out;
}
function strList<T extends string>(v: unknown, max = 64): T[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === 'string' && key(x)))].slice(0, max) : [];
}
/** A run save that at least has the shape of one; logic/save.ts validateRun checks every id on resume. */
function activeShape(v: unknown): RunSave | null {
  if (!isObj(v)) return null;
  // a run saved by a newer build is kept as it is, for that build (session.newerSave)
  if (typeof v.ver === 'number' && v.ver > RUN_VER) return v as unknown as RunSave;
  if (typeof v.ver !== 'number' || typeof v.char !== 'string' || typeof v.map !== 'string' || typeof v.seed !== 'number') return null;
  if (!Array.isArray(v.weapons) || !isObj(v.items) || !isObj(v.pending) || !isObj(v.stats) || !isObj(v.runStats)) return null;
  if (typeof v.wave !== 'number' || !Number.isFinite(v.wave)) return null;
  return v as unknown as RunSave;
}

/** A tip key: lower camel case, 2–16 letters (the known ids and a newer build's). */
const TIP = /^[a-z][A-Za-z]{1,15}$/;
/** The tutorial's flags: `done` implies `offered`; tips are `true` under a well-formed key, at most 32. */
function tutorFlags(v: unknown): TutorFlags {
  const tu = isObj(v) ? v : {};
  const tips: Record<string, true> = {};
  if (isObj(tu.tips)) {
    for (const [k, x] of Object.entries(tu.tips)) {
      if (Object.keys(tips).length >= 32) break;
      if (x === true && TIP.test(k)) tips[k] = true;
    }
  }
  const done = tu.done === true;
  return { offered: tu.offered === true || done, done, tips: tips as TutorFlags['tips'] };
}

/** Repair anything loaded or imported into a valid MirrorMeta; junk becomes defaultMeta(). Never throws. */
export function sanitizeMirror(raw: unknown, today: DateKey = todayKey()): MirrorMeta {
  const base = defaultMeta(today);
  try {
    if (!isObj(raw)) return base;
    const r = raw;
    const bests: MirrorMeta['bests'] = {};
    if (isObj(r.bests)) for (const [k, b] of Object.entries(r.bests)) {
      if (!key(k) || !isObj(b)) continue;
      const best: Best = { wave: nat(b.wave, 9999), heat: nat(b.heat, 20), at: date(b.at, today) };
      bests[k as keyof MirrorMeta['bests']] = best;
    }
    const codex: MirrorMeta['codex'] = {};
    if (isObj(r.codex)) for (const [k, s] of Object.entries(r.codex)) if (key(k) && (s === 1 || s === 2 || s === 3)) codex[k as keyof MirrorMeta['codex']] = s;
    const h = isObj(r.heart) ? r.heart : {};
    const pick: Record<number, 'A' | 'B'> = {};
    if (isObj(h.pick)) for (const [k, s] of Object.entries(h.pick)) { const n = Number(k); if (n >= 1 && n <= 8 && (s === 'A' || s === 'B')) pick[n] = s; }
    const d = isObj(r.daily) ? r.daily : {};
    const slips: Record<number, DateKey> = {};
    if (isObj(r.slips)) for (const [k, s] of Object.entries(r.slips)) { const n = Number(k); if (Number.isInteger(n) && n >= 0 && n < 72 && typeof s === 'string' && DATE.test(s)) slips[n] = s; }
    const pd = isObj(r.payDay) ? r.payDay : {};
    const payDay: PayDay = {
      day: date(pd.day, base.payDay.day), runs: nat(pd.runs, 999), free: pd.free === true, paid: nat(pd.paid, 300), drops: nat(pd.drops, 30), refunded: pd.refunded === true,
    };
    const lb = isObj(r.lobby) ? r.lobby : {};
    const st = isObj(r.settings) ? r.settings : {};
    const settings: MirrorSettings = {
      aim: st.aim === 'manual' ? 'manual' : 'auto',
      nums: st.nums === 0 || st.nums === 2 ? st.nums : 1,
      shake: st.shake !== false, // on unless turned off: big moments only (a hard blow you take, boss slams and phases; ≤ 3 px); reduced motion removes it
      left: st.left === true,
      quality: st.quality === 'low' || st.quality === 'mid' || st.quality === 'high' ? st.quality : 'auto',
      tips: st.tips !== false, // 新手提示: on unless turned off
    };
    const lastDay = date(r.lastDay, base.lastDay);
    const titles = strList<MirrorMeta['titles'][number]>(r.titles);
    const rims = strList<MirrorMeta['rims'][number]>(r.rims, 16);
    return {
      v: 1,
      ticketsUsed: nat(r.ticketsUsed),
      active: activeShape(r.active),
      deeds: numMap(r.deeds),
      codex,
      tally: numMap(r.tally),
      bests,
      seals: trueMap(r.seals),
      diffMax: nat(r.diffMax, 5) as MirrorMeta['diffMax'] || 1,
      mapsOpen: Math.max(1, nat(r.mapsOpen, 3)) as MirrorMeta['mapsOpen'],
      firsts: trueMap(r.firsts),
      dust: nat(r.dust),
      heart: { ranks: numMap(h.ranks, 9), pick, plain: h.plain === true },
      mastery: numMap<CharacterId>(r.mastery),
      daily: {
        day: date(d.day, base.daily.day), best: nat(d.best, 9999), bonus: d.bonus === true,
        weekDays: strList<DateKey>(d.weekDays, 14).filter((x) => DATE.test(x)), weekPaid: typeof d.weekPaid === 'string' && DATE.test(d.weekPaid) ? d.weekPaid : null,
      },
      slips,
      payDay,
      coinsPaid: nat(r.coinsPaid),
      owed: nat(r.owed, 1e6),
      firstsHeld: nat(r.firstsHeld, 1e4),
      lastDay,
      lobby: {
        char: typeof lb.char === 'string' && CHAR_IDS.has(lb.char) ? (lb.char as CharacterId) : 'scholar',
        map: MAP_IDS.includes(lb.map as (typeof MAP_IDS)[number]) ? (lb.map as MirrorMeta['lobby']['map']) : 'lake',
        diff: nat(lb.diff, 5) as MirrorMeta['lobby']['diff'],
        vows: numMap(lb.vows, 3),
      },
      settings,
      records: (() => { const o: MirrorMeta['records'] = {}; if (isObj(r.records)) for (const [k, v] of Object.entries(r.records)) if (key(k) && fin(v) > 0) o[k as keyof MirrorMeta['records']] = Math.min(1e15, fin(v)); return o; })(),
      titles,
      title: typeof r.title === 'string' && titles.includes(r.title as MirrorMeta['titles'][number]) ? (r.title as MirrorMeta['title']) : null,
      rims,
      rim: typeof r.rim === 'string' && rims.includes(r.rim as MirrorMeta['rims'][number]) ? (r.rim as MirrorMeta['rim']) : null,
      tutor: tutorFlags(r.tutor),
    };
  } catch {
    return base;
  }
}

// ───────────────────────────────────────────── load / save
export const storageOk = signal(true);
let lastJSON = '';
function load(): MirrorMeta {
  try {
    const t = localStorage.getItem(MIRROR_KEY);
    lastJSON = t ?? '';
    return t ? sanitizeMirror(JSON.parse(t)) : defaultMeta();
  } catch {
    storageOk.value = false;
    return defaultMeta();
  }
}
/**
 * Is there a storage to talk to? In a sandboxed iframe without allow-same-origin even *reading* the
 * `localStorage` identifier throws (a bare `typeof` does not stop that), so it is asked inside a try.
 */
function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}
function boot(): MirrorMeta {
  if (hasStorage()) return load();
  storageOk.value = false; // the lobby shows 「此处不能存档，关页即失」; the run still plays in memory
  return defaultMeta();
}
export const mirror = signal<MirrorMeta>(boot());

function writeNow(m: MirrorMeta): void {
  const json = JSON.stringify(m);
  if (json === lastJSON) return;
  lastJSON = json;
  try {
    localStorage.setItem(MIRROR_KEY, json);
    if (!storageOk.value) storageOk.value = true;
  } catch {
    storageOk.value = false; // sandboxed iframe or private mode: the run still plays, the lobby warns
  }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
effect(() => {
  const m = mirror.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeNow(m), 120);
});
/** Write the meta now (entering, every shop action, wave start/end, settlement). */
export function saveMetaNow(): void {
  clearTimeout(saveTimer);
  if (hasStorage()) writeNow(mirror.value);
}
/** Update and write at once. */
export function updateMeta(fn: (m: MirrorMeta) => MirrorMeta): void {
  mirror.value = fn(mirror.value);
  saveMetaNow();
}

if (typeof window !== 'undefined') {
  const flush = () => saveMetaNow();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('storage', (e) => {
    if (e.key !== MIRROR_KEY || !e.newValue || e.newValue === lastJSON) return;
    try {
      lastJSON = e.newValue;
      mirror.value = sanitizeMirror(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  });
}

// ───────────────────────────────────────────── the purse
/** Where src/app/play.ts keeps the purse (its own debounced write lands 120 ms later). */
const PLAY_KEY = 'banmu.play.v1';
/**
 * Write the purse now, before meta records a money move (入镜's fee and ticket, 镜碎's refund and
 * counters, a void refund, a payout), so a hard kill in between can never leave meta ahead of the purse.
 * CHANGE REQUEST pending: once play.ts exports savePlayNow(), call that here instead.
 */
export function flushPlay(): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(PLAY_KEY, JSON.stringify(play.value));
  } catch {
    /* storage unavailable: the purse lives in memory, as play.ts does */
  }
}
/**
 * The only door from the mirror to the purse: what meta owes goes in with its counter in one write
 * (earnFrom counts it as today's 「幻镜」 income), then meta records it as paid.
 */
export function payOwed(): void {
  const n = Math.floor(mirror.value.owed);
  if (n <= 0) return;
  batch(() => {
    earnFrom('mirror', n);
    record('mirror:coin', n);
  });
  flushPlay();
  updateMeta((m) => ({ ...m, coinsPaid: m.coinsPaid + n, owed: Math.max(0, m.owed - n) }));
}
/** Meta ↔ counters['mirror:coin'], both ways (whichever write the tab died between). Same rule as logic/economy reconcileCoins. */
export function reconcileCoinsMeta(m: MirrorMeta, coinCounter: number): MirrorMeta {
  const c = Math.max(0, Math.floor(coinCounter));
  if (c > m.coinsPaid) return { ...m, owed: Math.max(0, m.owed - (c - m.coinsPaid)), coinsPaid: c };
  if (c < m.coinsPaid) return { ...m, owed: m.owed + (m.coinsPaid - c), coinsPaid: c };
  return m;
}
/** On load (and after an import): make meta and the coin counter agree, then pay what is owed. */
export function reconcileMirror(): void {
  const c = play.value.counters['mirror:coin'] ?? 0;
  const m = mirror.value;
  const next = reconcileCoinsMeta(m, c);
  if (next !== m) updateMeta(() => next);
  payOwed();
}

// It rides along in backups (replaced in place on a hot reload, so it is never registered twice).
let settleQueued = false;
function settleSoon(): void {
  if (settleQueued) return;
  settleQueued = true;
  queueMicrotask(() => { settleQueued = false; reconcileMirror(); });
}
const extra = {
  key: 'mirror',
  get: (): MirrorMeta => mirror.value,
  set: (raw: unknown) => { mirror.value = sanitizeMirror(raw); saveMetaNow(); settleSoon(); },
  reset: () => { mirror.value = defaultMeta(); saveMetaNow(); },
};
const at = backupExtras.findIndex((b) => b.key === extra.key);
if (at >= 0) backupExtras[at] = extra; else backupExtras.push(extra);

if (typeof window !== 'undefined') reconcileMirror();
