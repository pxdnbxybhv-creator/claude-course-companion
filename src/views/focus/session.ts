// The burning stick lives here, not in the view: switching to the garden must not put the incense
// out. This module restores a stored session when the app starts, keeps a one-second clock while
// incense burns, rings the bell when it is done (on whichever tab you are), mirrors the remaining
// time in the page title, and holds a screen wake lock while you watch it burn.
//
// Every browser API that a sandboxed/embedded host may refuse (localStorage, Notification,
// wakeLock) is feature-detected and wrapped — the timer works fully without them.
import { signal } from '@preact/signals';
import type { AmbientKind } from '../../core/types';
import { audio } from '../../audio/engine';
import { logFocus, setSettings, state } from '../../app/store';
import { route } from '../../app/router';
import { tr } from '../../app/i18n';
import { toast } from '../../ui/kit';
import {
  ACTIVE_KEY, type ActiveFocus, decideRestore, finishAt, formatClock, isFinished, light, msToNextSecond, parseActive,
  pause, progress, remainingMs, resume, serialize, toSession,
} from './timer';

export interface Completion {
  session: ActiveFocus;
  finishedAt: number;
  /** False when it burned out while the app was closed. */
  live: boolean;
}

/** The lit (or paused) stick, or null. */
export const active = signal<ActiveFocus | null>(null);
/** Wall clock, updated on every displayed-second change while a stick is lit. */
export const now = signal(Date.now());
/** Set when a stick burns out; the view shows the completion sheet until dismissed. */
export const completion = signal<Completion | null>(null);
/** Progress of the last stick that was put out early (the stub stays in the censer). */
export const restProgress = signal(0);
/** True while the Focus view is on screen (wake lock only then). */
export const viewShown = signal(false);
/** Ask about notifications after the first lighting? (in-page, never on load) */
export const notifyAsk = signal(false);

const NOTIFY_ASKED_KEY = 'banmu.focus.notifyAsked';
/** A stick that burned out longer ago than this is logged without the completion sheet. */
const STALE_DONE_MS = 6 * 3600_000;

// --------------------------------------------------------------------------- storage (never throws)

/** Did the current stick make it into localStorage? (false in sandboxes / private mode) */
let persisted = false;

function readStored(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function writeStored(s: ActiveFocus | null): void {
  try {
    if (s) localStorage.setItem(ACTIVE_KEY, serialize(s));
    else localStorage.removeItem(ACTIVE_KEY);
    persisted = !!s;
  } catch {
    persisted = false; /* the session lives in memory only */
  }
}
function flag(key: string, set?: boolean): boolean {
  try {
    if (set) localStorage.setItem(key, '1');
    return localStorage.getItem(key) === '1';
  } catch {
    return !!set;
  }
}

// --------------------------------------------------------------------------- clock

let tickTimer: ReturnType<typeof setTimeout> | undefined;

function schedule(): void {
  clearTimeout(tickTimer);
  const s = active.value;
  const t = Date.now();
  now.value = t;
  updateTitle();
  if (!s) return;
  if (isFinished(s, t)) {
    finish(finishAt(s) ?? t, true);
    return;
  }
  if (s.pausedAt !== null) return; // nothing moves while paused
  tickTimer = setTimeout(schedule, Math.max(16, msToNextSecond(s, t) + 5));
}

function set(s: ActiveFocus | null): void {
  active.value = s;
  writeStored(s);
  schedule();
  syncWakeLock();
}

// --------------------------------------------------------------------------- title

let baseTitle: string | null = null;
function updateTitle(): void {
  if (typeof document === 'undefined') return;
  const s = active.value;
  if (!s) {
    if (baseTitle !== null) document.title = baseTitle;
    baseTitle = null;
    return;
  }
  if (baseTitle === null) baseTitle = document.title;
  const clock = formatClock(remainingMs(s, now.value));
  document.title = s.pausedAt !== null
    ? `${tr('暂停', 'Paused')} ${clock} · ${tr('一炷香', 'Focus')}`
    : `${clock} · ${tr('一炷香', 'Focus')}`;
}

// --------------------------------------------------------------------------- wake lock

interface Sentinel { release(): Promise<void>; released?: boolean; addEventListener?(t: string, f: () => void): void }
let lock: Sentinel | null = null;
let lockPending = false;

function syncWakeLock(): void {
  const want = !!active.value && active.value.pausedAt === null && viewShown.value && document.visibilityState === 'visible';
  if (want && !lock && !lockPending) {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    lockPending = true;
    try {
      wl.request('screen').then(
        (s) => {
          lockPending = false;
          lock = s;
          s.addEventListener?.('release', () => { if (lock === s) lock = null; });
          // State may have changed while we waited.
          if (!(active.value && active.value.pausedAt === null && viewShown.value)) releaseLock();
        },
        () => { lockPending = false; },
      );
    } catch {
      lockPending = false;
    }
  } else if (!want && lock) releaseLock();
}
function releaseLock(): void {
  const l = lock;
  lock = null;
  try {
    l?.release().catch(() => {});
  } catch {
    /* already released */
  }
}

// --------------------------------------------------------------------------- notifications

function canNotify(): boolean {
  try {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/** Show the in-page "may I tell you when it's done?" line once, after the first lighting. */
function maybeOfferNotify(): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    if (flag(NOTIFY_ASKED_KEY)) return;
    notifyAsk.value = true;
  } catch {
    /* no notifications here */
  }
}

export function answerNotify(yes: boolean): void {
  notifyAsk.value = false;
  flag(NOTIFY_ASKED_KEY, true);
  if (!yes) return;
  try {
    const r = Notification.requestPermission();
    r?.catch?.(() => {});
  } catch {
    /* refused by the host */
  }
}

function notifyDone(s: ActiveFocus): void {
  if (typeof document === 'undefined' || document.visibilityState === 'visible' || !canNotify()) return;
  const title = tr('一炷香已燃尽', 'Your incense has burned out');
  const body = s.intent
    ? tr(`此香为「${s.intent}」而燃 · ${s.minutes} 分钟`, `${s.intent} · ${s.minutes} minutes`)
    : tr(`静坐了 ${s.minutes} 分钟。`, `${s.minutes} quiet minutes.`);
  const opts: NotificationOptions = { body, tag: 'banmu-focus', icon: './icon-192.png' };
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      try {
        window.focus();
        if (route.value !== 'focus') location.hash = '#focus';
      } catch { /* ignore */ }
      n.close();
    };
  } catch {
    // Android Chrome only allows notifications through a service worker.
    try {
      navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.showNotification(title, opts)).catch(() => {});
    } catch {
      /* give up quietly */
    }
  }
}

// --------------------------------------------------------------------------- audio

function soundPrefs(): void {
  const st = state.value.settings;
  audio.setEnabled(st.sound);
  audio.setVolume(st.volume);
}

/** After a reload the ambient bed can only restart on the next user gesture. */
function resumeAmbientOnGesture(): void {
  if (typeof window === 'undefined') return;
  const go = () => {
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
    const s = active.value;
    if (!s || s.pausedAt !== null) return;
    soundPrefs();
    audio.unlock().then(() => {
      if (active.value && active.value.pausedAt === null) audio.setAmbient(state.value.settings.ambient);
    }).catch(() => {});
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

// --------------------------------------------------------------------------- actions

/** Set when lit from the keyboard, so the view can move focus to the new controls. */
export let litByKeyboard = false;

/** Light a stick. Call from the click handler (user gesture) so audio can start. */
export function lightIncense(minutes: number, intent?: string, byKeyboard = false): void {
  if (active.value) return;
  litByKeyboard = byKeyboard;
  const s = light(minutes, intent, Date.now());
  completion.value = null;
  restProgress.value = 0;
  set(s);
  if (state.value.settings.focusMinutes !== s.minutes) setSettings({ focusMinutes: s.minutes });
  soundPrefs();
  const ambient = state.value.settings.ambient;
  audio.unlock().then(() => {
    audio.knock();
    if (active.value === s) audio.setAmbient(ambient);
  }).catch(() => {});
  maybeOfferNotify();
}

export function togglePause(): void {
  const s = active.value;
  if (!s) return;
  const t = Date.now();
  if (isFinished(s, t)) return schedule();
  if (s.pausedAt === null) {
    set(pause(s, t));
    audio.setAmbient('none');
  } else {
    set(resume(s, t));
    soundPrefs();
    audio.unlock().then(() => audio.setAmbient(state.value.settings.ambient)).catch(() => {});
  }
}

/** Put the stick out early; it is logged as not completed. */
export function extinguish(): void {
  const s = active.value;
  if (!s) return;
  const t = Date.now();
  if (isFinished(s, t)) return schedule();
  restProgress.value = progress(s, t);
  set(null);
  audio.setAmbient('none');
  logFocus(toSession(s, false, t));
}

export function chooseAmbient(kind: AmbientKind): void {
  setSettings({ ambient: kind });
  const s = active.value;
  if (s && s.pausedAt === null) {
    soundPrefs();
    audio.unlock().then(() => audio.setAmbient(kind)).catch(() => {});
  }
}

export function dismissCompletion(): void {
  completion.value = null;
}

function finish(finishedAt: number, live: boolean): void {
  const s = active.value;
  if (!s) return;
  // Another tab may already have logged this stick: only the tab that still finds it in storage does.
  const stored = parseActive(readStored());
  const mine = !persisted || stored?.start === s.start;
  active.value = null;
  if (mine) writeStored(null);
  schedule();
  syncWakeLock();
  completion.value = { session: s, finishedAt, live };
  if (!mine) return;
  logFocus(toSession(s, true));
  if (live) {
    audio.bell();
    audio.setAmbient('none');
    notifyDone(s);
    if (route.value !== 'focus') toast(tr('一炷香已燃尽', 'Your incense has burned out'), 4000);
  }
}

// --------------------------------------------------------------------------- start-up

function restore(): void {
  const t = Date.now();
  const d = decideRestore(readStored(), t);
  switch (d.kind) {
    case 'none':
      if (d.clear) writeStored(null);
      return;
    case 'resume':
      set(d.session);
      if (d.session.pausedAt === null) resumeAmbientOnGesture();
      return;
    case 'finished':
      active.value = d.session;
      persisted = true;
      finish(d.finishedAt, false);
      // Long ago (another day, most likely): log it quietly instead of greeting with a sheet.
      if (t - d.finishedAt > STALE_DONE_MS) completion.value = null;
      if (route.value !== 'focus' || !completion.value) toast(tr('离开时，一炷香已燃尽，已记入香迹', 'Your incense burned out while you were away'), 4000);
      return;
    case 'stale':
      writeStored(null);
      logFocus(toSession(d.session, false, t));
      return;
  }
}

if (typeof window !== 'undefined') {
  restore();
  document.addEventListener('visibilitychange', () => {
    schedule();
    syncWakeLock();
  });
  // Keep several open tabs in step: lighting, pausing or putting out in one shows in the others.
  window.addEventListener('storage', (e) => {
    if (e.key !== ACTIVE_KEY) return;
    const next = parseActive(e.newValue);
    const cur = active.value;
    if (!next) {
      if (cur) {
        // The other tab finished or put it out; it already logged it.
        active.value = null;
        schedule();
        syncWakeLock();
      }
      return;
    }
    active.value = next;
    persisted = true;
    schedule();
    syncWakeLock();
  });
  // Title follows language changes.
  let lastLang = state.value.settings.lang;
  state.subscribe((st) => {
    if (st.settings.lang !== lastLang) {
      lastLang = st.settings.lang;
      updateTitle();
    }
  });
  viewShown.subscribe(() => syncWakeLock());
}
