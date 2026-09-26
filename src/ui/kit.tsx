// Shared UI primitives. Keep the chrome quiet — the paintings are the stars.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { PlantKind } from '../core/types';
import { PLANT_INFO } from '../ink/plants';
import { useT } from '../app/i18n';
import './ui.css';

/** The sheets open right now, oldest first: Esc closes only the topmost (a letter over an editor). */
const sheetStack: object[] = [];
/** How many sheets are open (the courier's toast waits until there are none). */
export const openSheets = signal(0);

export function Sheet(props: { open: boolean; onClose: () => void; title?: ComponentChildren; children: ComponentChildren; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  useEffect(() => {
    if (!props.open) return;
    const me = {};
    sheetStack.push(me);
    openSheets.value = sheetStack.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetStack[sheetStack.length - 1] === me) props.onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      const at = sheetStack.indexOf(me);
      if (at >= 0) sheetStack.splice(at, 1);
      openSheets.value = sheetStack.length;
      // the page scrolls again only once the last sheet is gone
      if (!sheetStack.length) document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [props.open]);
  if (!props.open) return null;
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.label} tabIndex={-1} ref={ref}>
        <div class="sheet-grip" aria-hidden="true" />
        {props.title !== undefined && (
          <div class="sheet-head">
            <h2 class="brush">{props.title}</h2>
            <button type="button" class="btn btn-ghost btn-icon" onClick={props.onClose} aria-label={t('关闭', 'Close')}>✕</button>
          </div>
        )}
        {props.children}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>(props: { options: { value: T; label: ComponentChildren }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div class="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button type="button" aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" class="toggle" role="switch" aria-checked={props.checked} aria-label={props.label} onClick={() => props.onChange(!props.checked)} />;
}

interface ToastAction { label: string; run: () => void }
const toastMsg = signal<{ text: string; id: number; action?: ToastAction } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;
/**
 * Show a short message at the top of the screen, optionally with one action (e.g. 撤销 · Undo).
 * Returns its id, for dismissToast.
 */
export function toast(text: string, opts: number | { ms?: number; action?: ToastAction } = 2600): number {
  const o = typeof opts === 'number' ? { ms: opts } : opts;
  const id = ++toastSeq;
  toastMsg.value = { text, id, action: o.action };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = null), o.ms ?? (o.action ? 5000 : 2600));
  return id;
}
/** Take a toast down early: that one (by id) if it is still showing, or with no id whatever shows. True if one went. */
export function dismissToast(id?: number): boolean {
  const m = toastMsg.peek();
  if (!m || (id !== undefined && m.id !== id)) return false;
  clearTimeout(toastTimer);
  toastMsg.value = null;
  return true;
}
export function ToastHost() {
  const m = toastMsg.value;
  return (
    <div class="toast-wrap" aria-live="polite">
      {m && (
        <div class={'toast' + (m.action ? ' has-action' : '')} key={m.id}>
          <span>{m.text}</span>
          {m.action && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                m.action!.run();
                toastMsg.value = null;
              }}
            >
              {m.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A hand-drawn-looking horizontal brush line. */
export function InkDivider() {
  return (
    <svg class="ink-divider" viewBox="0 0 400 10" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 6 C 60 3, 120 7, 200 5 S 330 3, 398 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
    </svg>
  );
}

export function PlantGlyph(props: { kind: PlantKind; size?: number }) {
  const s = props.size ?? 40;
  return <span class="plant-glyph" style={{ width: s, height: s, fontSize: s * 0.6 }} aria-hidden="true">{PLANT_INFO[props.kind].zh}</span>;
}
