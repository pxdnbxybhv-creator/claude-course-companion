// Single source of truth. State lives in a Preact signal and is persisted to localStorage.
// Views read `state.value` (reactively) and change it only through the actions below.
import { signal, computed, effect } from '@preact/signals';
import type { AppState, DateKey, FocusSession, Habit, Lang, PlantKind, Settings } from '../core/types';
import { PLANT_KINDS } from '../core/types';
import { hashString, uid } from '../core/rng';
import { isValidKey, todayKey } from '../core/date';
import { toggleDay } from '../core/habits';

const STORAGE_KEY = 'banmu.v1';

function defaultLang(): Lang {
  try {
    const l = (navigator.language || 'zh').toLowerCase();
    return l.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

export function defaultSettings(): Settings {
  return {
    lang: defaultLang(),
    sealName: '',
    sound: true,
    volume: 0.7,
    music: true,
    musicVolume: 0.5,
    quality: 'medium',
    ambient: 'none',
    focusMinutes: 30,
    theme: 'auto',
  };
}

export function emptyState(): AppState {
  return { version: 1, habits: [], checkins: {}, notes: {}, focus: [], settings: defaultSettings(), onboarded: false };
}

/** Validate & repair anything loaded from storage or imported from a file. Never throws. */
export function sanitize(raw: unknown): AppState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  const habits: Habit[] = Array.isArray(r.habits)
    ? r.habits
        .filter((h): h is Habit => !!h && typeof h === 'object' && typeof h.id === 'string' && typeof h.name === 'string')
        .map((h) => ({
          id: h.id,
          name: String(h.name).slice(0, 40),
          plant: (PLANT_KINDS as readonly string[]).includes(h.plant) ? h.plant : 'bamboo',
          seed: Number.isFinite(h.seed) ? h.seed >>> 0 : hashString(h.id),
          createdAt: isValidKey(h.createdAt) ? h.createdAt : todayKey(),
          ...(Array.isArray(h.days) && h.days.some((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            ? { days: [...new Set(h.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() }
            : {}),
          ...(h.archived ? { archived: true } : {}),
        }))
    : [];
  const checkins: Record<string, DateKey[]> = {};
  if (r.checkins && typeof r.checkins === 'object') {
    for (const [id, days] of Object.entries(r.checkins)) {
      if (Array.isArray(days)) checkins[id] = [...new Set(days.filter(isValidKey))].sort();
    }
  }
  const notes: Record<DateKey, string> = {};
  if (r.notes && typeof r.notes === 'object') {
    for (const [k, v] of Object.entries(r.notes)) if (isValidKey(k) && typeof v === 'string' && v.trim()) notes[k] = v.slice(0, 280);
  }
  const focus: FocusSession[] = Array.isArray(r.focus)
    ? r.focus.filter((f) => f && Number.isFinite(f.start) && Number.isFinite(f.minutes)).map((f) => ({
        start: f.start, minutes: f.minutes, completed: !!f.completed,
        ...(Number.isFinite(f.burned) ? { burned: Math.max(0, Math.min(f.minutes, f.burned!)) } : {}),
        ...(f.intent ? { intent: String(f.intent).slice(0, 80) } : {}),
      }))
    : [];
  const s = (r.settings ?? {}) as Partial<Settings>;
  const settings: Settings = {
    ...base.settings,
    ...(s.lang === 'zh' || s.lang === 'en' ? { lang: s.lang } : {}),
    sealName: typeof s.sealName === 'string' ? s.sealName.slice(0, 4) : '',
    sound: s.sound !== false,
    music: s.music !== false,
    musicVolume: Number.isFinite(s.musicVolume) ? Math.min(1, Math.max(0, s.musicVolume!)) : base.settings.musicVolume,
    quality: (['low', 'medium', 'high', 'ultra'] as const).includes(s.quality as 'low') ? s.quality! : base.settings.quality,
    volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume!)) : base.settings.volume,
    ambient: ['none', 'rain', 'stream', 'pines', 'qin'].includes(s.ambient as string) ? s.ambient! : 'none',
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto',
    focusMinutes: Number.isFinite(s.focusMinutes) ? Math.min(180, Math.max(1, Math.round(s.focusMinutes!))) : 30,
    ...(s.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lon) ? { location: s.location } : {}),
  };
  return { version: 1, habits, checkins, notes, focus, settings, onboarded: !!r.onboarded };
}

function load(): AppState {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    return txt ? sanitize(JSON.parse(txt)) : emptyState();
  } catch {
    return emptyState();
  }
}

export const state = signal<AppState>(load());

/** Re-renders at local midnight so "today" rolls over while the app is open. */
export const today = signal<DateKey>(todayKey());

/** Re-read the clock now (timers are throttled while a device sleeps). Returns the fresh key. */
export function refreshToday(): DateKey {
  const k = todayKey();
  if (k !== today.value) today.value = k;
  return k;
}

// ----------------------------------------------------------------------------- persistence

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: AppState | null = null;
/** The JSON we last wrote or received, so a change arriving from another tab is not echoed back. */
let lastJSON = '';

function writeNow(): void {
  clearTimeout(saveTimer);
  if (!pending) return;
  const json = JSON.stringify(pending);
  pending = null;
  if (json === lastJSON) return;
  lastJSON = json;
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* private mode / quota — the app keeps working in memory */
  }
}

/** Write any debounced change immediately (used when the page is being hidden or closed). */
export function flushSave(): void {
  writeNow();
}

effect(() => {
  pending = state.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 150);
});

if (typeof window !== 'undefined') {
  try {
    lastJSON = localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    /* storage unavailable */
  }
  setInterval(refreshToday, 30_000);
  const wake = () => refreshToday();
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
    else refreshToday();
  });
  window.addEventListener('pagehide', flushSave);
  // Another tab saved: adopt its state instead of overwriting it with ours on our next write.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue || e.newValue === lastJSON) return;
    try {
      lastJSON = e.newValue;
      pending = null;
      clearTimeout(saveTimer);
      const next = sanitize(JSON.parse(e.newValue));
      state.value = next;
      // The effect above queued our copy of what we just received; mark it as already written.
      pending = null;
      clearTimeout(saveTimer);
      lastJSON = e.newValue;
    } catch {
      /* ignore malformed writes from elsewhere */
    }
  });
}

/** True when the user has made anything of their own (habits, including archived ones, notes or incense). */
export function hasUserData(s: AppState = state.value): boolean {
  return s.habits.length > 0 || Object.keys(s.notes).length > 0 || s.focus.length > 0;
}

export const lang = computed(() => state.value.settings.lang);
export const activeHabits = computed(() => state.value.habits.filter((h) => !h.archived));

function update(fn: (s: AppState) => AppState) {
  state.value = fn(state.value);
}

// --------------------------------------------------------------------------- actions

export function addHabit(input: { name: string; plant: PlantKind; days?: number[] }): Habit {
  const id = uid();
  const habit: Habit = {
    id,
    name: input.name.trim().slice(0, 40) || '…',
    plant: input.plant,
    seed: hashString(id + input.name),
    createdAt: refreshToday(),
    ...(input.days && input.days.length && input.days.length < 7 ? { days: [...input.days].sort() } : {}),
  };
  update((s) => ({ ...s, habits: [...s.habits, habit], checkins: { ...s.checkins, [id]: [] } }));
  return habit;
}

export function editHabit(id: string, patch: Partial<Pick<Habit, 'name' | 'plant' | 'days' | 'archived'>>): void {
  update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
}

export function deleteHabit(id: string): void {
  update((s) => {
    const checkins = { ...s.checkins };
    delete checkins[id];
    return { ...s, habits: s.habits.filter((h) => h.id !== id), checkins };
  });
}

export function moveHabit(id: string, delta: number): void {
  update((s) => {
    const hs = [...s.habits];
    const i = hs.findIndex((h) => h.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= hs.length) return s;
    [hs[i], hs[j]] = [hs[j], hs[i]];
    return { ...s, habits: hs };
  });
}

/** Toggle a habit for a day (default today). Returns true if it is now done. */
export function toggleCheckin(id: string, day: DateKey = refreshToday()): boolean {
  let nowDone = false;
  update((s) => {
    const days = toggleDay(s.checkins[id] ?? [], day);
    nowDone = days.includes(day);
    return { ...s, checkins: { ...s.checkins, [id]: days } };
  });
  return nowDone;
}

export function setNote(day: DateKey, text: string): void {
  update((s) => {
    const notes = { ...s.notes };
    if (text.trim()) notes[day] = text.slice(0, 280);
    else delete notes[day];
    return { ...s, notes };
  });
}

export function logFocus(session: FocusSession): void {
  update((s) => ({ ...s, focus: [...s.focus, session].slice(-2000) }));
}

export function setSettings(patch: Partial<Settings>): void {
  update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function setOnboarded(): void {
  update((s) => ({ ...s, onboarded: true }));
}

/**
 * Other stores that want to ride along in backups (e.g. play progress) register here, so the
 * backup file stays one file without this module importing them. `reset` empties the store: an
 * erase calls it, and so does an import whose backup has nothing for that key (an older backup
 * replaces everything too, not just what it knew about).
 */
export const backupExtras: { key: string; get(): unknown; set(raw: unknown): void; reset(): void }[] = [];

export function exportJSON(): string {
  const extras = Object.fromEntries(backupExtras.map((b) => [b.key, b.get()]));
  return JSON.stringify({ app: 'banmu', exportedAt: new Date().toISOString(), ...state.value, ...extras }, null, 2);
}

/** Replace all data with an imported backup. Returns false if the file is not a 半亩 backup. */
export function importJSON(text: string): boolean {
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.habits)) return false;
    state.value = sanitize(raw);
    for (const b of backupExtras) {
      if (b.key in raw) b.set((raw as Record<string, unknown>)[b.key]);
      else b.reset();
    }
    return true;
  } catch {
    return false;
  }
}

/** Erase everything but the settings: the garden and every store that rides along in backups. */
export function resetAll(): void {
  state.value = { ...emptyState(), settings: state.value.settings, onboarded: true };
  for (const b of backupExtras) b.reset();
}

/** Replace state wholesale (used by demo seeding and tests). */
export function replaceState(next: AppState): void {
  state.value = sanitize(next);
}
