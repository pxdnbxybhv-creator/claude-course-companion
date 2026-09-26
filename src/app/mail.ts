// 信 · the mailbox. The box keeps only which letters have arrived and when (and whether they have
// been read); what they say lives in the catalog (src/data/letters.ts), and what has been claimed
// lives in play (`flags['mail:<id>']`), so a claim and its coins are one change.
//
// This is the core the walk's features call (deliver, inBox, claimed, openMail, deliverDue). The
// mail builder adds: claiming (play.claimGift), the first gift on load, the backup registration,
// and the UI (the 信 buttons and the letter sheet).
import { computed, effect, signal } from '@preact/signals';
import type { DateKey } from '../core/types';
import { isValidKey } from '../core/date';
import { LETTER, LETTERS } from '../data/letters';
import { play } from './play';
import { today } from './store';

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

/** Put a catalog letter in the box (once ever). Returns true if it arrived now. */
export function deliver(id: string, o: { read?: boolean } = {}): boolean {
  if (!LETTER[id] || inBox(id)) return false;
  const day = today.value;
  mail.value = { ...mail.value, box: [{ id, at: day, ...(o.read ? { read: day } : {}) }, ...mail.value.box] };
  return true;
}

export function markRead(id: string): void {
  if (!mail.value.box.some((e) => e.id === id && !e.read)) return;
  const day = today.value;
  mail.value = { ...mail.value, box: mail.value.box.map((e) => (e.id === id && !e.read ? { ...e, read: day } : e)) };
}

/** Deliver every letter whose `due` now holds. Returns the ids that arrived. */
export function deliverDue(): string[] {
  const p = play.value, day = today.value;
  const out: string[] = [];
  for (const l of LETTERS) {
    if (!l.due || inBox(l.id)) continue;
    let ok = false;
    try { ok = l.due(p, day); } catch { ok = false; }
    if (ok && deliver(l.id)) out.push(l.id);
  }
  return out;
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
export const _mailForTests = { reset: () => { mail.value = emptyMail(); } };
