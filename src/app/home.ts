// 家园 · the homestead: what stands on your plot, your pets and the people who live there with you.
// Kept under its own localStorage key and carried in backups. Coins are the callers' business:
// they spend() first (app/play.ts), then place, adopt or hire here. The plot and its grid are
// map.ts HOME_PLOT; what each kind of thing is (footprint, price, look) is the homestead's catalog.
import { effect, signal } from '@preact/signals';
import type { DateKey } from '../core/types';
import { backupExtras, today } from './store';

const KEY = 'banmu.home.v1';

/** One thing placed on the plot, on grid cell (i, j) from the plot's north-west corner, turned rot × 90°. */
export interface HomeItem {
  uid: string;
  kind: string;
  i: number;
  j: number;
  rot: 0 | 1 | 2 | 3;
  /** Words the owner wrote on it (a plaque 匾额, a couplet 对联, a sign). */
  text?: string;
  /** A growing thing (the vegetable plot 菜畦): see HomeGrow. */
  grow?: HomeGrow;
}

/**
 * A vegetable plot's season: sown on `sown`; it ripens with the days (plus `boost` stages: watered,
 * or the gardener's 催花). `wet` is the last day it was watered, `reaped` the last harvest.
 */
export interface HomeGrow {
  sown: DateKey;
  boost: number;
  wet?: DateKey;
  reaped?: DateKey;
}

export interface Pet {
  uid: string;
  /** 'dog' | 'cat' | 'rabbit' | 'crane' | 'duck' | 'koi' | … (the catalog decides). */
  species: string;
  name: string;
  since: DateKey;
  /** The last day it was fed ('' never). */
  fed: DateKey | '';
  /** Affection 0…100: feeding and petting raise it; it fades a little on days apart. */
  love: number;
  /** Walks with you out in the world (at most one pet at a time). */
  follow: boolean;
  /** A line it was taught to say (the parrot). */
  line?: string;
}

export interface Resident {
  uid: string;
  /** 'steward' | 'cook' | 'gardener' | 'student' | 'musician' | … (the homestead decides). */
  role: string;
  /** The name you gave them. */
  name: string;
  since: DateKey;
  /** A seed for their looks. */
  look: number;
}

export interface HomeState {
  v: 1;
  /** The name over the gate, e.g. 「半亩山居」. */
  name: string;
  items: HomeItem[];
  pets: Pet[];
  residents: Resident[];
}

export const HOME_LIMITS = { items: 240, pets: 12, residents: 8, name: 12, text: 16, line: 24 };

export function emptyHome(): HomeState {
  return { v: 1, name: '', items: [], pets: [], residents: [] };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);
const isDay = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function sanitizeGrow(g: unknown): HomeGrow | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const r = g as Partial<HomeGrow>;
  if (!isDay(r.sown)) return undefined;
  return { sown: r.sown, boost: int(r.boost, 0, 9), ...(isDay(r.wet) ? { wet: r.wet } : {}), ...(isDay(r.reaped) ? { reaped: r.reaped } : {}) };
}

/** Validate & repair anything loaded or imported. Never throws. */
export function sanitizeHome(raw: unknown): HomeState {
  const base = emptyHome();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<HomeState>;
  const seen = new Set<string>();
  const uidOk = (u: unknown) => { const s = str(u, 24); if (!s || seen.has(s)) return ''; seen.add(s); return s; };
  const items: HomeItem[] = [];
  for (const it of Array.isArray(r.items) ? r.items : []) {
    if (!it || typeof it !== 'object' || items.length >= HOME_LIMITS.items) continue;
    const uid = uidOk(it.uid), kind = str(it.kind, 32);
    if (!uid || !kind) continue;
    const text = str(it.text, HOME_LIMITS.text);
    const grow = sanitizeGrow(it.grow);
    items.push({ uid, kind, i: int(it.i, 0, 255), j: int(it.j, 0, 255), rot: int(it.rot, 0, 3) as HomeItem['rot'], ...(text ? { text } : {}), ...(grow ? { grow } : {}) });
  }
  const pets: Pet[] = [];
  let following = false;
  for (const p of Array.isArray(r.pets) ? r.pets : []) {
    if (!p || typeof p !== 'object' || pets.length >= HOME_LIMITS.pets) continue;
    const uid = uidOk(p.uid), species = str(p.species, 24);
    if (!uid || !species) continue;
    const follow = !!p.follow && !following;
    if (follow) following = true;
    const line = str(p.line, HOME_LIMITS.line);
    pets.push({ uid, species, name: str(p.name, HOME_LIMITS.name), since: isDay(p.since) ? p.since : '1970-01-01', fed: isDay(p.fed) ? p.fed : '', love: int(p.love, 0, 100), follow, ...(line ? { line } : {}) });
  }
  const residents: Resident[] = [];
  for (const m of Array.isArray(r.residents) ? r.residents : []) {
    if (!m || typeof m !== 'object' || residents.length >= HOME_LIMITS.residents) continue;
    const uid = uidOk(m.uid), role = str(m.role, 24);
    if (!uid || !role) continue;
    residents.push({ uid, role, name: str(m.name, HOME_LIMITS.name), since: isDay(m.since) ? m.since : '1970-01-01', look: int(m.look, 0, 2 ** 31 - 1) });
  }
  return { v: 1, name: str(r.name, HOME_LIMITS.name), items, pets, residents };
}

function load(): HomeState {
  try {
    const t = localStorage.getItem(KEY);
    return t ? sanitizeHome(JSON.parse(t)) : emptyHome();
  } catch {
    return emptyHome();
  }
}

export const home = signal<HomeState>(load());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastJSON = '';
function writeNow(s: HomeState) {
  const json = JSON.stringify(s);
  if (json === lastJSON) return;
  lastJSON = json;
  try { localStorage.setItem(KEY, json); } catch { /* storage unavailable — keep it in memory */ }
}
effect(() => {
  const s = home.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeNow(s), 150);
});
if (typeof window !== 'undefined') {
  const flush = () => { clearTimeout(saveTimer); writeNow(home.value); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue || e.newValue === lastJSON) return;
    try { lastJSON = e.newValue; home.value = sanitizeHome(JSON.parse(e.newValue)); } catch { /* ignore */ }
  });
}

let uidSeq = 0;
const newUid = (p: string) => `${p}${Date.now().toString(36)}${(uidSeq++).toString(36)}`;
const set = (fn: (h: HomeState) => HomeState) => { home.value = fn(home.value); };

// ------------------------------------------------------------------------------------ the plot

/** Put a thing on the plot (the caller checks the footprint is free and has paid). Returns its uid, or null when full. */
export function placeItem(kind: string, i: number, j: number, rot: HomeItem['rot'] = 0, text?: string): string | null {
  if (home.value.items.length >= HOME_LIMITS.items) return null;
  const uid = newUid('it');
  const t = str(text, HOME_LIMITS.text);
  set((h) => ({ ...h, items: [...h.items, { uid, kind, i: int(i, 0, 255), j: int(j, 0, 255), rot, ...(t ? { text: t } : {}) }] }));
  return uid;
}

/**
 * Put a thing back exactly as it was — its uid, words and season (undoing a sale). False when that
 * uid already stands or the plot is full. The caller checks the footprint is free.
 */
export function restoreItem(item: HomeItem): boolean {
  const h = home.value;
  if (h.items.length >= HOME_LIMITS.items || h.items.some((x) => x.uid === item.uid)) return false;
  const it = sanitizeHome({ items: [item] }).items[0];
  if (!it) return false;
  set((s) => ({ ...s, items: [...s.items, it] }));
  return true;
}

export function moveItem(uid: string, i: number, j: number, rot: HomeItem['rot']): void {
  set((h) => ({ ...h, items: h.items.map((it) => (it.uid === uid ? { ...it, i: int(i, 0, 255), j: int(j, 0, 255), rot } : it)) }));
}

export function removeItem(uid: string): HomeItem | null {
  const it = home.value.items.find((x) => x.uid === uid) ?? null;
  if (it) set((h) => ({ ...h, items: h.items.filter((x) => x.uid !== uid) }));
  return it;
}

export function setItemText(uid: string, text: string): void {
  const t = str(text, HOME_LIMITS.text);
  set((h) => ({ ...h, items: h.items.map((it) => (it.uid === uid ? { ...it, text: t || undefined } : it)) }));
}

/** A growing thing's season changed (sown, watered, ripened, harvested); null clears it. */
export function tendItem(uid: string, grow: HomeGrow | null): void {
  const g = grow ? sanitizeGrow(grow) : undefined;
  set((h) => ({ ...h, items: h.items.map((it) => {
    if (it.uid !== uid) return it;
    const next: HomeItem = { ...it };
    if (g) next.grow = g; else delete next.grow;
    return next;
  }) }));
}

export function setHomeName(name: string): void {
  set((h) => ({ ...h, name: str(name, HOME_LIMITS.name) }));
}

// ------------------------------------------------------------------------------------ pets

export function adoptPet(species: string, name: string): string | null {
  if (home.value.pets.length >= HOME_LIMITS.pets) return null;
  const uid = newUid('pet');
  set((h) => ({ ...h, pets: [...h.pets, { uid, species, name: str(name, HOME_LIMITS.name), since: today.value, fed: '', love: 20, follow: false }] }));
  return uid;
}

export function renamePet(uid: string, name: string): void {
  set((h) => ({ ...h, pets: h.pets.map((p) => (p.uid === uid ? { ...p, name: str(name, HOME_LIMITS.name) } : p)) }));
}

/** Feed a pet (once a day counts): affection rises. True if it was hungry. */
export function feedPet(uid: string): boolean {
  const p = home.value.pets.find((x) => x.uid === uid);
  if (!p || p.fed === today.value) return false;
  set((h) => ({ ...h, pets: h.pets.map((x) => (x.uid === uid ? { ...x, fed: today.value, love: Math.min(100, x.love + 8) } : x)) }));
  return true;
}

/** Stroke a pet: a little affection (the caller rate-limits). */
export function petPet(uid: string, n = 1): void {
  set((h) => ({ ...h, pets: h.pets.map((x) => (x.uid === uid ? { ...x, love: Math.min(100, x.love + n) } : x)) }));
}

/** Set a pet's affection outright (0…100) — the daily settling of affection uses this. */
export function setPetLove(uid: string, love: number): void {
  set((h) => ({ ...h, pets: h.pets.map((x) => (x.uid === uid ? { ...x, love: int(love, 0, 100) } : x)) }));
}

/** Teach a pet a line to say ('' forgets it). */
export function setPetLine(uid: string, line: string): void {
  const t = str(line, HOME_LIMITS.line);
  set((h) => ({ ...h, pets: h.pets.map((x) => {
    if (x.uid !== uid) return x;
    const next: Pet = { ...x };
    if (t) next.line = t; else delete next.line;
    return next;
  }) }));
}

/** This pet walks with you out in the world (any other stops following); null: none does. */
export function setFollower(uid: string | null): void {
  set((h) => ({ ...h, pets: h.pets.map((x) => ({ ...x, follow: x.uid === uid })) }));
}

export function releasePet(uid: string): void {
  set((h) => ({ ...h, pets: h.pets.filter((x) => x.uid !== uid) }));
}

// ------------------------------------------------------------------------------------ residents

export function hireResident(role: string, name: string, look: number): string | null {
  if (home.value.residents.length >= HOME_LIMITS.residents) return null;
  const uid = newUid('npc');
  set((h) => ({ ...h, residents: [...h.residents, { uid, role, name: str(name, HOME_LIMITS.name), since: today.value, look: int(look, 0, 2 ** 31 - 1) }] }));
  return uid;
}

export function renameResident(uid: string, name: string): void {
  set((h) => ({ ...h, residents: h.residents.map((m) => (m.uid === uid ? { ...m, name: str(name, HOME_LIMITS.name) } : m)) }));
}

export function dismissResident(uid: string): void {
  set((h) => ({ ...h, residents: h.residents.filter((m) => m.uid !== uid) }));
}

export function exportHome(): HomeState {
  return home.value;
}
export function importHome(raw: unknown): void {
  home.value = sanitizeHome(raw);
}
export function resetHome(): void {
  home.value = emptyHome();
}

backupExtras.push({ key: 'home', get: exportHome, set: importHome, reset: resetHome });
