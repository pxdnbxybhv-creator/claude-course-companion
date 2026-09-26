// 信 · the mailbox. The box keeps only which letters have arrived and when (and whether they have
// been read); what they say lives in the catalog (src/data/letters.ts), and what has been claimed
// lives in play (`flags['mail:<id>']`), so a claim and its coins are one change.
//
// The walk's features call deliver, inBox, claimed, openMail and deliverDue. Claiming goes through
// play.claimGift (one change: the flag, the coins, the companion, the item). The 初见礼 arrives for
// every player once (ensureFirstGift, on load and after an erase or an import); the box rides along
// in backups. The UI (the letter sheet, the 信 buttons, the announcement) is src/views/mail/.
import { computed, effect, signal } from '@preact/signals';
import type { DateKey } from '../core/types';
import { isValidKey } from '../core/date';
import { LETTER, LETTERS, type LetterDef } from '../data/letters';
import { claimGift, play } from './play';
import { backupExtras, today } from './store';

const KEY = 'banmu.mail.v1';

export interface MailEntry { id: string; at: DateKey; read?: DateKey }
export interface MailState { v: 1; box: MailEntry[] }

export const emptyMail = (): MailState => ({ v: 1, box: [] });

/** Keep only catalog letters, once each, with valid dates (at most 200). */
export function sanitizeMail(raw: unknown): MailState {
  const r = (raw ?? {}) as Partial<MailState>;
  const seen = new Set<string>();
  const box: MailEntry[] = [];
  for (const e of Array.isArray(r.box) ? r.box : []) {
    if (!e || typeof e !== 'object') continue;
    const { id, at, read } = e as MailEntry;
    if (typeof id !== 'string' || !LETTER[id] || seen.has(id) || !isValidKey(at)) continue;
    seen.add(id);
    box.push({ id, at, ...(isValidKey(read) ? { read } : {}) });
    if (box.length >= 200) break;
  }
  return { v: 1, box };
}

function load(): MailState {
  try {
    const s = localStorage.getItem(KEY);
    return s ? sanitizeMail(JSON.parse(s)) : emptyMail();
  } catch {
    return emptyMail();
  }
}

export const mail = signal<MailState>(load());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastJSON = '';
function writeNow(s: MailState) {
  const json = JSON.stringify(s);
  if (json === lastJSON) return;
  lastJSON = json;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* storage unavailable — keep the box in memory */
  }
}
effect(() => {
  const s = mail.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeNow(s), 120);
});
if (typeof window !== 'undefined') {
  const flush = () => { clearTimeout(saveTimer); writeNow(mail.value); };
  window.addEventListener('pagehide', flush);
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue || e.newValue === lastJSON) return;
    try {
      lastJSON = e.newValue;
      mail.value = sanitizeMail(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  });
}

/** Letters not yet opened. */
export const unread = computed(() => mail.value.box.filter((e) => !e.read).length);

export const inBox = (id: string): boolean => mail.value.box.some((e) => e.id === id);

/** Has this letter's gift been taken (coins, companion, item, flags)? */
export const claimed = (id: string): boolean => !!play.value.flags[`mail:${id}`];

/**
 * Letters that arrived unread while the app was open (and the first gift on load), oldest first,
 * waiting for the courier's announcement (MailHost shows it once onboarding is done). Not saved.
 */
export const arrivals = signal<string[]>([]);

/** Put a catalog letter in the box (once ever). Returns true if it arrived now. */
export function deliver(id: string, o: { read?: boolean } = {}): boolean {
  if (!LETTER[id] || inBox(id)) return false;
  const day = today.value;
  mail.value = { ...mail.value, box: [{ id, at: day, ...(o.read ? { read: day } : {}) }, ...mail.value.box] };
  if (!o.read) arrivals.value = [...arrivals.value.filter((x) => x !== id), id];
  return true;
}

export function markRead(id: string): void {
  if (arrivals.value.includes(id)) arrivals.value = arrivals.value.filter((x) => x !== id);
  if (!mail.value.box.some((e) => e.id === id && !e.read)) return;
  const day = today.value;
  mail.value = { ...mail.value, box: mail.value.box.map((e) => (e.id === id && !e.read ? { ...e, read: day } : e)) };
}

/**
 * Deliver every letter whose `due` now holds. Returns the ids that arrived. A letter whose gift the
 * play record already holds (an older backup without the box) comes back already read.
 */
export function deliverDue(): string[] {
  const p = play.value, day = today.value;
  const out: string[] = [];
  for (const l of LETTERS) {
    if (!l.due || inBox(l.id)) continue;
    let ok = false;
    try { ok = l.due(p, day); } catch { ok = false; }
    if (ok && deliver(l.id, { read: claimed(l.id) })) out.push(l.id);
  }
  return out;
}

/** The first letter: 嫦娥's 初见礼, carrying 玉兔 and 300 文. */
export const FIRST_GIFT = 'chujian';

/**
 * The 初见礼 reaches every player, new or old, once: if the box lacks it, it arrives (already read
 * when its gift was taken, e.g. an older backup whose play holds the flag). After 清空一切 it comes
 * again to the empty purse. It never writes play: only claiming does.
 */
export function ensureFirstGift(): boolean {
  if (inBox(FIRST_GIFT)) return false;
  return deliver(FIRST_GIFT, { read: claimed(FIRST_GIFT) });
}

/** Does taking this letter do anything (coins, a companion, an item, flags)? Otherwise it is only read. */
export function hasGift(l: LetterDef | undefined): boolean {
  const a = l?.attach;
  return !!l && (!!(a && ((a.coins ?? 0) > 0 || a.character || a.item)) || !!l.sets?.length);
}

/**
 * Take what a letter carries: 'ok' (just now), 'already' (taken before), 'none' (not in the box, or
 * nothing to take). One play change, so a double tap or a second tab never pays twice.
 */
export function claimLetter(id: string): 'ok' | 'already' | 'none' {
  const l = LETTER[id];
  if (!l || !inBox(id)) return 'none';
  markRead(id);
  if (!hasGift(l)) return 'none';
  if (claimed(id)) return 'already';
  return claimGift(id, l.attach ?? {}, l.sets ?? []) ? 'ok' : 'already';
}

/** The mail sheet: closed (null), the box ('list'), or one letter (its id). */
export const mailUi = signal<null | 'list' | string>(null);
export function openMail(id?: string): void {
  if (id && inBox(id)) markRead(id);
  mailUi.value = id ?? 'list';
}
export function closeMail(): void {
  mailUi.value = null;
}

/** Tests: the box as it is, and a way to empty it. */
export const _mailForTests = { reset: () => { mail.value = emptyMail(); arrivals.value = []; } };

// After an import or an erase the other stores (play among them) are set in turn: the first gift and
// the due letters are looked at once they all are, so the order the stores registered in never matters.
let settleQueued = false;
function settle(): void {
  if (settleQueued) return;
  settleQueued = true;
  queueMicrotask(() => {
    settleQueued = false;
    ensureFirstGift();
    deliverDue();
  });
}

// It rides along in backups (replaced in place on a hot reload, so it is never registered twice).
const extra = {
  key: 'mail',
  get: (): MailState => mail.value,
  set: (raw: unknown) => { mail.value = sanitizeMail(raw); arrivals.value = []; settle(); },
  reset: () => { mail.value = emptyMail(); arrivals.value = []; settle(); },
};
const at = backupExtras.findIndex((b) => b.key === extra.key);
if (at >= 0) backupExtras[at] = extra; else backupExtras.push(extra);

// on load: the 初见礼 (every player, once), and whatever else has fallen due since the last visit
ensureFirstGift();
deliverDue();
