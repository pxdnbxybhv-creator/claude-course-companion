// Shared bits for the in-world mini-games: tiny DOM overlays in paper and ink (mounted through
// ctx.hud.mount), a hold-to-charge input that works with a finger, a mouse, Space or E, one game at
// a time, a brief music override, the walker's ability, and the region's own theme.
import './minigames.css';
import type { WorldCtx } from '../../types';
import type { Bag } from '../kit';
import { CHARACTER, type Ability } from '../../../../data/characters';
import { REGION, type MusicTheme } from '../../map';

export const tr = (ctx: WorldCtx, zh: string, en: string) => (ctx.lang === 'zh' ? zh : en);

/** A small element builder. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent?.appendChild(el);
  return el;
}

export interface Panel {
  root: HTMLDivElement;
  close(): void;
}

/** A full-screen overlay layer (pointer-transparent except its interactive parts) for a game. */
export function panel(bag: Bag, cls: string): Panel {
  const root = h('div', `mg ${cls}`);
  root.lang = bag.ctx.lang === 'zh' ? 'zh' : 'en';
  let off: (() => void) | null = bag.ctx.hud.mount(root);
  const close = () => { off?.(); off = null; };
  bag.onDispose(close);
  return { root, close };
}

/** A round brush-lettered button. */
export function button(parent: HTMLElement, glyph: string, sub: string, cls = ''): HTMLButtonElement {
  const b = h('button', `mg-btn ${cls}`, undefined, parent);
  b.type = 'button';
  h('span', 'mg-btn-glyph', glyph, b);
  h('small', 'mg-btn-sub', sub, b);
  return b;
}

export interface Hold {
  /** Held right now (finger, mouse, Space, E or Enter). */
  readonly down: boolean;
  /** Pressed since the last check (consumes it). */
  pressed(): boolean;
  /** Released since the last check (consumes it). */
  released(): boolean;
  dispose(): void;
}

/** Hold-to-charge input on an element plus the keyboard (Space / E / Enter). */
export function hold(el: HTMLElement): Hold {
  let down = false, p = false, r = false;
  const press = (e: Event) => { e.preventDefault(); if (!down) { down = true; p = true; } };
  const release = () => { if (down) { down = false; r = true; } };
  const isKey = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter';
  const kd = (e: KeyboardEvent) => { if (isKey(e) && !e.repeat) { e.preventDefault(); e.stopPropagation(); press(e); } };
  const ku = (e: KeyboardEvent) => { if (isKey(e)) { e.preventDefault(); e.stopPropagation(); release(); } };
  el.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keydown', kd, true);
  window.addEventListener('keyup', ku, true);
  return {
    get down() { return down; },
    pressed() { const v = p; p = false; return v; },
    released() { const v = r; r = false; return v; },
    dispose() {
      el.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
    },
  };
}

/** Escape (or the ✕) to leave a game. */
export function onEscape(fn: () => void): () => void {
  const k = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); fn(); } };
  window.addEventListener('keydown', k, true);
  return () => window.removeEventListener('keydown', k, true);
}

/** A small ✕ in the corner of a game. */
export function closeButton(parent: HTMLElement, ctx: WorldCtx, fn: () => void): HTMLButtonElement {
  const b = h('button', 'mg-x', '×', parent);
  b.type = 'button';
  b.setAttribute('aria-label', tr(ctx, '离开', 'Leave'));
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

// ───────────────────────────── one game at a time ─────────────────────────────

const playing = new WeakMap<WorldCtx, string>();

/** Claim the world for a game; false if another one is running. */
export function begin(ctx: WorldCtx, id: string): boolean {
  if (playing.has(ctx)) return false;
  playing.set(ctx, id);
  return true;
}

export function end(ctx: WorldCtx, id: string): void {
  if (playing.get(ctx) === id) playing.delete(ctx);
}

export function busy(ctx: WorldCtx): boolean {
  return playing.has(ctx);
}

// ───────────────────────────── music, abilities ─────────────────────────────

/** The theme the core plays in the region the player is in now. */
export function regionTheme(ctx: WorldCtx): MusicTheme | null {
  const r = ctx.currentRegion?.();
  return r ? REGION[r].theme : null;
}

/** Override the music briefly; returns a restore. */
export function withTheme(ctx: WorldCtx, theme: MusicTheme | null): () => void {
  try { ctx.music?.setTheme(theme); } catch { /* the music is optional */ }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try { ctx.music?.setTheme(regionTheme(ctx)); } catch { /* ignore */ }
  };
}

export function ability(ctx: WorldCtx): Ability {
  return CHARACTER[ctx.player.character]?.ability ?? { kind: 'none' };
}

/** Is the day's hour night in the world now? */
export function night(ctx: WorldCtx): boolean {
  try { return ctx.sky.isNight(); } catch { return false; }
}

/** A floating line of text over the world ("贯耳!", "+10"), for juice. */
export function pop(p: Panel, text: string, cls = ''): void {
  const el = h('div', `mg-pop ${cls}`, text, p.root);
  setTimeout(() => el.remove(), 1400);
}
