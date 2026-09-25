// Play progress: counters from games and the 入画 world, quests completed, companions unlocked,
// the character you walk as, and today's three errands. Kept apart from the habit data (its own
// localStorage key) but included in backups.
//
//   record('fish')             — count something that happened (lifetime + today)
//   recordMax('feihua', 12)    — remember a best score
//   flag('bell')               — a one-off achievement
//   visitRegion('lake')        — the world calls this on arrival
//   earn(30) / spend(120)      — 铜钱 (coins): earned from quests, errands, real check-ins and
//                                incense, games and 奇遇; spent in the homestead and at stalls
//   unlockWaypoint('lake')     — a waypoint stele lit (the map can send you there)
//   markEncounter('zhiyin')    — a 奇遇 happened
//
// Quests are re-evaluated after every change (and whenever habit data changes, for the real-life
// quests); newly finished ones are queued in `celebrations` for the app to announce.
import { computed, effect, signal } from '@preact/signals';
import type { CharacterId } from '../data/characters';
import { CHARACTERS } from '../data/characters';
import { DAILY_POOL, QUESTS, type DailyDef, type QuestDef } from '../data/quests';
import type { AppState, DateKey } from '../core/types';
import { statsFor } from '../core/habits';
import { hashString, makeRng } from '../core/rng';
import { todayKey } from '../core/date';
import { backupExtras, state as appState, today } from './store';

const KEY = 'banmu.play.v1';

export interface PlayState {
  v: 1;
  character: CharacterId;
  /** Lifetime counters. */
  counters: Record<string, number>;
  /** Best-ever values. */
  best: Record<string, number>;
  /** One-off achievements, e.g. 'bell', 'visit:lake', 'klotski:hengdao'. */
  flags: Record<string, true>;
  /** Quest id → the day it was finished. */
  done: Record<string, DateKey>;
  /** Today's errands. `paid`: errands (and 'all') whose coins were already given today. */
  daily: { day: DateKey; picks: string[]; counts: Record<string, number>; visited: string[]; paid: string[] };
  /** 铜钱 in the purse. */
  coins: number;
  /** Real-life deeds already paid in coins (check-ins, incense burnt through); null until first seen. */
  life: { checkins: number; incense: number } | null;
}

export function emptyPlay(): PlayState {
  return { v: 1, character: 'scholar', counters: {}, best: {}, flags: {}, done: {}, daily: { day: '', picks: [], counts: {}, visited: [], paid: [] }, coins: 0, life: null };
}

const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e9) : 0);

/** Validate & repair anything loaded or imported. Never throws. */
export function sanitizePlay(raw: unknown): PlayState {
  const base = emptyPlay();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PlayState>;
  const rec = (o: unknown) => {
    const out: Record<string, number> = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (num(v)) out[k.slice(0, 64)] = num(v);
    return out;
  };
  const flags: Record<string, true> = {};
  if (r.flags && typeof r.flags === 'object') for (const [k, v] of Object.entries(r.flags)) if (v) flags[k.slice(0, 64)] = true;
  const done: Record<string, DateKey> = {};
  if (r.done && typeof r.done === 'object') for (const [k, v] of Object.entries(r.done)) if (typeof v === 'string') done[k] = v;
  const d = (r.daily ?? {}) as Partial<PlayState['daily']>;
  return {
    v: 1,
    character: CHAR_IDS.has(r.character as CharacterId) ? (r.character as CharacterId) : 'scholar',
    counters: rec(r.counters),
    best: rec(r.best),
    flags,
    done,
    daily: {
      day: typeof d.day === 'string' ? d.day : '',
      picks: Array.isArray(d.picks) ? d.picks.filter((p) => typeof p === 'string').slice(0, 3) : [],
      counts: rec(d.counts),
      visited: Array.isArray(d.visited) ? d.visited.filter((p) => typeof p === 'string').slice(0, 12) : [],
      paid: Array.isArray(d.paid) ? d.paid.filter((p) => typeof p === 'string').slice(0, 8) : [],
    },
    coins: Math.floor(num(r.coins)),
    life: r.life && typeof r.life === 'object' ? { checkins: Math.floor(num(r.life.checkins)), incense: Math.floor(num(r.life.incense)) } : null,
  };
}

function load(): PlayState {
  try {
    const t = localStorage.getItem(KEY);
    return t ? sanitizePlay(JSON.parse(t)) : emptyPlay();
  } catch {
    return emptyPlay();
  }
}

export const play = signal<PlayState>(load());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastJSON = '';
function writeNow(s: PlayState) {
  const json = JSON.stringify(s);
  if (json === lastJSON) return;
  lastJSON = json;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* storage unavailable — keep playing in memory */
  }
}
effect(() => {
  const s = play.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeNow(s), 120);
});
if (typeof window !== 'undefined') {
  const flush = () => { clearTimeout(saveTimer); writeNow(play.value); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue || e.newValue === lastJSON) return;
    try {
      lastJSON = e.newValue;
      play.value = sanitizePlay(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  });
}

// ------------------------------------------------------------------------------------ daily

/** Three errands for the day, the same all day long. */
export function dailyPicksFor(day: DateKey): DailyDef[] {
  const rng = makeRng(hashString('daily:' + day));
  const pool = [...DAILY_POOL];
  const out: DailyDef[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

function rollDaily(s: PlayState, day: DateKey): PlayState {
  if (s.daily.day === day) return s;
  return { ...s, daily: { day, picks: dailyPicksFor(day).map((d) => d.id), counts: {}, visited: [], paid: [] } };
}

// ------------------------------------------------------------------------------------ quests

/** Progress 0..target for a quest, given play and habit data. */
export function questValue(q: QuestDef, p: PlayState, a: AppState, day: DateKey = todayKey()): number {
  const g = q.goal;
  switch (g.kind) {
    case 'counter': return p.counters[g.key] ?? 0;
    case 'best': return p.best[g.key] ?? 0;
    case 'flag': return p.flags[g.key] ? 1 : 0;
    case 'flags': return Object.keys(p.flags).filter((k) => k.startsWith(g.prefix)).length;
    case 'streak': {
      let m = 0;
      for (const h of a.habits) m = Math.max(m, statsFor(h, a.checkins[h.id] ?? [], day).best);
      return m;
    }
    case 'incense': return a.focus.filter((f) => f.completed).length;
    case 'companions': return earnedFrom(p).length;
  }
}

export function questTarget(q: QuestDef): number {
  const g = q.goal;
  return g.kind === 'flag' ? 1 : g.target;
}

/** The flag set by a code: every companion and every waypoint is open (their quests stay as they are). */
export const ALL_COMPANIONS_FLAG = 'code:all';

/** Companions earned through their quests (what 群贤毕至 counts; a code doesn't). */
function earnedFrom(p: PlayState): CharacterId[] {
  return CHARACTERS.filter((c) => c.unlock === 'default' || p.done[c.unlock]).map((c) => c.id);
}

function unlockedFrom(p: PlayState): CharacterId[] {
  return p.flags[ALL_COMPANIONS_FLAG] ? CHARACTERS.map((c) => c.id) : earnedFrom(p);
}

/** Can you walk as `id` with this progress? */
export function isUnlockedIn(p: PlayState, id: CharacterId): boolean {
  const c = CHARACTERS.find((x) => x.id === id);
  return !!c && (!!p.flags[ALL_COMPANIONS_FLAG] || c.unlock === 'default' || !!p.done[c.unlock]);
}

/** Characters you can walk as. */
export const unlocked = computed(() => unlockedFrom(play.value));

/** Quest ids finished since the app opened, waiting to be announced (oldest first). */
export const celebrations = signal<string[]>([]);

// ------------------------------------------------------------------------------------ coins

/** Coins for finishing a quest: a companion's is worth more than a seal's. */
export function questCoins(q: QuestDef): number {
  return 'character' in q.reward ? 120 : 80;
}
/** Coins for each of today's errands, and for doing all three. */
export const ERRAND_COINS = 30;
export const ERRANDS_ALL_COINS = 60;
/** Coins for each real check-in and each stick of incense burnt all the way through. */
export const CHECKIN_COINS = 5;
export const INCENSE_COINS = 15;
/** The first time the purse sees your habit history it pays for at most this many past deeds. */
const BACKPAY_MAX = 300;

function lifeCounts(a: AppState): { checkins: number; incense: number } {
  let checkins = 0;
  for (const d of Object.values(a.checkins)) checkins += d.length;
  return { checkins, incense: a.focus.filter((f) => f.completed).length };
}

/** Coins that fell due: new check-ins and incense, and today's errands just finished. */
function payDue(p: PlayState, a: AppState, day: DateKey): PlayState {
  let coins = p.coins;
  const now = lifeCounts(a);
  let life = p.life;
  if (!life) {
    // first sight of an existing history: a little back pay, capped
    coins += Math.min(BACKPAY_MAX, now.checkins * CHECKIN_COINS + now.incense * INCENSE_COINS);
    life = now;
  } else {
    if (now.checkins > life.checkins) coins += (now.checkins - life.checkins) * CHECKIN_COINS;
    if (now.incense > life.incense) coins += (now.incense - life.incense) * INCENSE_COINS;
    // the mark only rises: undoing a check-in takes no coins back, and redoing it pays nothing extra
    life = { checkins: Math.max(life.checkins, now.checkins), incense: Math.max(life.incense, now.incense) };
  }
  let daily = p.daily;
  if (daily.day === day) {
    const picks = dailyPicksFor(day);
    const paid = [...daily.paid];
    for (const d of picks) {
      if (!paid.includes(d.id) && (daily.counts[d.key] ?? 0) >= d.target) { paid.push(d.id); coins += ERRAND_COINS; }
    }
    if (!paid.includes('all') && picks.every((d) => paid.includes(d.id))) { paid.push('all'); coins += ERRANDS_ALL_COINS; }
    if (paid.length !== daily.paid.length) daily = { ...daily, paid };
  }
  if (coins === p.coins && life === p.life && daily === p.daily) return p;
  return { ...p, coins, life, daily };
}

function evaluate(p: PlayState, a: AppState, day: DateKey): PlayState {
  let next = p;
  // Two passes so that "gather twelve companions" can complete in the same step as the twelfth.
  for (let pass = 0; pass < 2; pass++) {
    for (const q of QUESTS) {
      if (next.done[q.id]) continue;
      if (questValue(q, next, a, day) >= questTarget(q)) {
        next = { ...next, done: { ...next.done, [q.id]: day }, coins: next.coins + questCoins(q) };
        celebrations.value = [...celebrations.value, q.id];
      }
    }
  }
  return payDue(next, a, day);
}

function update(fn: (p: PlayState) => PlayState): void {
  const day = today.value;
  const cur = rollDaily(play.value, day);
  play.value = evaluate(fn(cur), appState.value, day);
}

// Real-life quests (streaks, incense) complete as the habit data changes.
if (typeof window !== 'undefined') {
  let first = true;
  effect(() => {
    const a = appState.value;
    const day = today.value;
    if (first) {
      first = false;
      // Don't announce quests already satisfied by old data on the very first load; just mark them.
      const before = celebrations.value;
      play.value = evaluate(rollDaily(play.value, day), a, day);
      celebrations.value = before;
      return;
    }
    const p = play.peek();
    const next = evaluate(rollDaily(p, day), a, day);
    if (next !== p) play.value = next;
  });
}

// ------------------------------------------------------------------------------------ actions

/** Count something that happened (lifetime and today). */
export function record(key: string, n = 1): void {
  update((p) => ({
    ...p,
    counters: { ...p.counters, [key]: (p.counters[key] ?? 0) + n },
    daily: { ...p.daily, counts: { ...p.daily.counts, [key]: (p.daily.counts[key] ?? 0) + n } },
  }));
}

/** Remember a best score (only ever goes up). */
export function recordMax(key: string, value: number): void {
  if ((play.value.best[key] ?? 0) >= value) return;
  update((p) => ({ ...p, best: { ...p.best, [key]: value } }));
}

/** A one-off achievement. */
export function flag(key: string): void {
  if (play.value.flags[key]) return;
  update((p) => ({ ...p, flags: { ...p.flags, [key]: true } }));
}

/** The world calls this whenever the player arrives somewhere. */
export function visitRegion(id: string): void {
  update((p) => {
    const flags = p.flags[`visit:${id}`] ? p.flags : { ...p.flags, [`visit:${id}`]: true as const };
    if (p.daily.visited.includes(id)) return { ...p, flags };
    return {
      ...p,
      flags,
      daily: { ...p.daily, visited: [...p.daily.visited, id], counts: { ...p.daily.counts, visits: (p.daily.counts.visits ?? 0) + 1 } },
    };
  });
}

/** Walk as someone else (only unlocked characters). */
export function selectCharacter(id: CharacterId): boolean {
  if (!unlocked.value.includes(id)) return false;
  play.value = { ...play.value, character: id };
  return true;
}

// ------------------------------------------------------------------------------------ codes

// Codes are kept as salted hashes, never as text.
const CODE_SALTS = ['banmu·印', 'banmu·钱'];
const codeKey = (raw: string) => {
  const c = raw.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  return c ? CODE_SALTS.map((salt) => hashString(salt + c).toString(36)).join('.') : '';
};
const CODES = new Set<string>(['1d7uzn2.qrfdbd']);
/** Tests only: accept another code. */
export function _acceptCodeForTests(raw: string): void {
  CODES.add(codeKey(raw));
}
/** What a code grants: the flag, and coins the first time. */
export const CODE_COINS = 99999;

/** A code typed in Settings. Case, spaces and full-width letters don't matter. */
export function redeemCode(raw: string): 'ok' | 'already' | 'invalid' {
  const k = codeKey(raw);
  if (!k || !CODES.has(k)) return 'invalid';
  if (play.value.flags[ALL_COMPANIONS_FLAG]) return 'already';
  update((p) => ({ ...p, flags: { ...p.flags, [ALL_COMPANIONS_FLAG]: true }, coins: p.coins + CODE_COINS }));
  return 'ok';
}

/** Is a code in effect? */
export const codeActive = computed(() => !!play.value.flags[ALL_COMPANIONS_FLAG]);

/** Take a code back: companions and waypoints go back to what was earned (the coins stay). */
export function revokeCode(): void {
  const p = play.value;
  if (!p.flags[ALL_COMPANIONS_FLAG]) return;
  const flags = { ...p.flags };
  delete flags[ALL_COMPANIONS_FLAG];
  const next = { ...p, flags };
  play.value = { ...next, character: earnedFrom(next).includes(p.character) ? p.character : 'scholar' };
}

// ------------------------------------------------------------------------------------ purse

/** Add coins (a reward). */
export function earn(n: number): void {
  const k = Math.floor(n);
  if (!(k > 0)) return;
  update((p) => ({ ...p, coins: Math.min(1e9, p.coins + k) }));
}

/** Pay coins if there are enough; false (and nothing taken) otherwise. */
export function spend(n: number): boolean {
  const k = Math.max(0, Math.floor(n));
  if (play.value.coins < k) return false;
  if (k) update((p) => ({ ...p, coins: p.coins - k }));
  return true;
}

/** Coins in the purse. */
export const coins = computed(() => play.value.coins);

// ------------------------------------------------------------------------------------ waypoints & 奇遇

/** Is a waypoint lit (the garden's always is; a code lights them all)? */
export function waypointOpen(p: PlayState, id: string): boolean {
  return id === 'garden' || !!p.flags[ALL_COMPANIONS_FLAG] || !!p.flags[`wp:${id}`];
}

/** Light a waypoint stele (the world calls this when the walker reaches it). True if it was new. */
export function unlockWaypoint(id: string): boolean {
  if (waypointOpen(play.value, id)) return false;
  flag(`wp:${id}`);
  return true;
}

/** Has this 奇遇 happened before? */
export function encounterMet(p: PlayState, id: string): boolean {
  return !!p.flags[`qy:${id}`];
}

/** A 奇遇 happened: remembered (for the 奇遇录) and, the first time, its coins paid. Returns whether it was the first time. */
export function markEncounter(id: string, coinsFirst = 0): boolean {
  if (encounterMet(play.value, id)) return false;
  update((p) => ({ ...p, flags: { ...p.flags, [`qy:${id}`]: true }, coins: p.coins + Math.max(0, Math.floor(coinsFirst)) }));
  record('qiyu');
  return true;
}

/** Today's errands with progress. */
export const daily = computed(() => {
  const p = play.value;
  const day = today.value;
  const picks = dailyPicksFor(day);
  const counts = p.daily.day === day ? p.daily.counts : {};
  return picks.map((d) => ({ def: d, value: Math.min(d.target, counts[d.key] ?? 0), done: (counts[d.key] ?? 0) >= d.target }));
});

/** Take the oldest celebration off the queue (the announcer calls this after showing it). */
export function nextCelebration(): string | undefined {
  const [head, ...rest] = celebrations.value;
  celebrations.value = rest;
  return head;
}

export function exportPlay(): PlayState {
  return play.value;
}

export function importPlay(raw: unknown): void {
  play.value = sanitizePlay(raw);
}

export function resetPlay(): void {
  play.value = emptyPlay();
}

backupExtras.push({ key: 'play', get: exportPlay, set: importPlay });
