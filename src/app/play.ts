// Play progress: counters from games and the 入画 world, quests completed, companions unlocked,
// the character you walk as, and today's three errands. Kept apart from the habit data (its own
// localStorage key) but included in backups.
//
//   record('fish')             — count something that happened (lifetime + today)
//   recordMax('feihua', 12)    — remember a best score
//   flag('bell')               — a one-off achievement
//   visitRegion('lake')        — the world calls this on arrival
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
  /** Today's errands. */
  daily: { day: DateKey; picks: string[]; counts: Record<string, number>; visited: string[] };
}

export function emptyPlay(): PlayState {
  return { v: 1, character: 'scholar', counters: {}, best: {}, flags: {}, done: {}, daily: { day: '', picks: [], counts: {}, visited: [] } };
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
    },
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
  return { ...s, daily: { day, picks: dailyPicksFor(day).map((d) => d.id), counts: {}, visited: [] } };
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

/** The flag a test code sets: every companion can be chosen (their quests stay as they are). */
export const ALL_COMPANIONS_FLAG = 'code:all';
/** Test codes (Settings → 测试码): what each one switches on. */
const TEST_CODES: Record<string, string> = { CZ: ALL_COMPANIONS_FLAG };

/** Companions earned through their quests (what 群贤毕至 counts; a test code doesn't). */
function earnedFrom(p: PlayState): CharacterId[] {
  return CHARACTERS.filter((c) => c.unlock === 'default' || p.done[c.unlock]).map((c) => c.id);
}

function unlockedFrom(p: PlayState): CharacterId[] {
  return p.flags[ALL_COMPANIONS_FLAG] ? CHARACTERS.map((c) => c.id) : earnedFrom(p);
}

/** Can you walk as `id` with this progress (earned, or opened by a test code)? */
export function isUnlockedIn(p: PlayState, id: CharacterId): boolean {
  const c = CHARACTERS.find((x) => x.id === id);
  return !!c && (!!p.flags[ALL_COMPANIONS_FLAG] || c.unlock === 'default' || !!p.done[c.unlock]);
}

/** Characters you can walk as. */
export const unlocked = computed(() => unlockedFrom(play.value));

/** Quest ids finished since the app opened, waiting to be announced (oldest first). */
export const celebrations = signal<string[]>([]);

function evaluate(p: PlayState, a: AppState, day: DateKey): PlayState {
  let next = p;
  // Two passes so that "gather twelve companions" can complete in the same step as the twelfth.
  for (let pass = 0; pass < 2; pass++) {
    for (const q of QUESTS) {
      if (next.done[q.id]) continue;
      if (questValue(q, next, a, day) >= questTarget(q)) {
        next = { ...next, done: { ...next.done, [q.id]: day } };
        celebrations.value = [...celebrations.value, q.id];
      }
    }
  }
  return next;
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

/**
 * A test code typed in Settings. 'CZ' opens every companion. Case, spaces and full-width letters
 * don't matter. Nothing is marked as done: the quests and 群贤毕至 still wait to be earned.
 */
export function redeemCode(raw: string): 'unlocked' | 'already' | 'invalid' {
  const code = raw.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  const key = TEST_CODES[code];
  if (!key) return 'invalid';
  if (play.value.flags[key]) return 'already';
  flag(key);
  return 'unlocked';
}

/** Is a test code in effect (every companion open)? */
export const codeActive = computed(() => !!play.value.flags[ALL_COMPANIONS_FLAG]);

/** Take the test code back: companions go back to what was earned (walk as the scholar if yours was only borrowed). */
export function revokeCode(): void {
  const p = play.value;
  if (!p.flags[ALL_COMPANIONS_FLAG]) return;
  const flags = { ...p.flags };
  delete flags[ALL_COMPANIONS_FLAG];
  const next = { ...p, flags };
  play.value = { ...next, character: earnedFrom(next).includes(p.character) ? p.character : 'scholar' };
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
