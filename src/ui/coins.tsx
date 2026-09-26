// 铜钱 · the purse, shown wherever coins matter (the walk's HUD, the quest book, the homestead's
// shop). A round coin with a square hole, drawn in CSS, and the count; and coinToast, a small
// 「+N 文」 that drifts up the page when a game pays (the 3D HUD floats its own).
import { coins } from '../app/play';
import { useT } from '../app/i18n';
import { lang } from '../app/store';
import './coins.css';

/** Formats 12345 as 12,345. */
export const fmtCoins = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');

/** A coin glyph (decorative). */
export function CoinIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return <i class="coin-icon" style={{ width: `${s}px`, height: `${s}px` }} aria-hidden="true" />;
}

/** The purse: a coin and the count (live). `value` shows a price instead of the purse. */
export function CoinBadge(props: { value?: number; class?: string; size?: number }) {
  const t = useT();
  const n = props.value ?? coins.value;
  return (
    <span class={'coin-badge num ' + (props.class ?? '')} aria-label={t(`铜钱 ${n}`, `${n} coins`)}>
      <CoinIcon size={props.size} />
      <span>{fmtCoins(n)}</span>
    </span>
  );
}

// ------------------------------------------------------------------------------------ toast

let host: HTMLDivElement | null = null;
let live: HTMLDivElement | null = null;
/** The toasts still on screen: where each was placed (its centre) and how tall it is. */
const active: { el: HTMLElement; y: number; h: number }[] = [];
const GAP = 8;

function ensureHost(): HTMLDivElement {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.className = 'coin-toasts';
  live = document.createElement('div');
  live.className = 'visually-hidden';
  live.setAttribute('aria-live', 'polite');
  host.appendChild(live);
  document.body.appendChild(host);
  return host;
}

/**
 * 「+N 文」 with a spinning coin, drifting up and away (about two seconds). By default it rises in
 * the upper middle of the screen; `from` starts it over an element (or a point in the viewport).
 * `note` is one short line of why (「胜「棋友」」, 「新拼一图」…). Screen readers hear it once.
 */
export function coinToast(n: number, opts: { note?: string; from?: Element | { x: number; y: number } | null } = {}): void {
  const k = Math.floor(n);
  if (typeof document === 'undefined' || !(k > 0)) return;
  const zh = lang.value !== 'en';
  const root = ensureHost();
  const el = document.createElement('div');
  el.className = 'coin-toast';
  el.setAttribute('aria-hidden', 'true');
  const coin = document.createElement('i');
  coin.className = 'coin-icon coin-toast-coin';
  const amt = document.createElement('b');
  amt.className = 'num';
  amt.textContent = `+${fmtCoins(k)}`;
  const unit = document.createElement('span');
  unit.className = 'coin-toast-unit';
  unit.textContent = zh ? '文' : k === 1 ? 'coin' : 'coins';
  el.append(coin, amt, unit);
  if (opts.note) {
    const note = document.createElement('small');
    note.textContent = opts.note;
    el.appendChild(note);
  }
  // where it starts: over an element, a point, or the upper middle; later ones stack below
  let x = window.innerWidth / 2;
  let y = Math.max(96, window.innerHeight * 0.3);
  const f = opts.from;
  if (f && 'getBoundingClientRect' in f) {
    const r = f.getBoundingClientRect();
    if (r.width || r.height) { x = r.left + r.width / 2; y = r.top + Math.min(r.height / 2, 40); }
  } else if (f && 'x' in f) { x = f.x; y = f.y; }
  // measured (it sizes to its content, up to the screen's width less a margin) before it is placed
  el.style.left = '0px';
  el.style.top = '0px';
  root.appendChild(el);
  const w = el.offsetWidth || 160;
  const h = el.offsetHeight || 48;
  const half = w / 2 + 12;
  x = window.innerWidth <= half * 2 ? window.innerWidth / 2 : Math.max(half, Math.min(window.innerWidth - half, x));
  for (const a of active) y = Math.max(y, a.y + (a.h + h) / 2 + GAP);
  y = Math.max(h / 2 + 64, Math.min(window.innerHeight - h / 2 - 16, y));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  const slot = { el, y, h };
  active.push(slot);
  if (live) live.textContent = zh ? `得钱 ${k} 文${opts.note ? '，' + opts.note : ''}` : `${k} coin${k === 1 ? '' : 's'}${opts.note ? ', ' + opts.note : ''}`;
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    const i = active.indexOf(slot);
    if (i >= 0) active.splice(i, 1);
    el.remove();
  };
  el.addEventListener('animationend', (e) => { if (e.target === el) done(); });
  setTimeout(done, 2600);
}
