// 桃源 · 二期: the 特写's overlays (spec §4.6), in DOM over the painting: the letterbox bars, the ink
// vignette, the ink dip that hides the cut to the seat, the ink → colour bleed (a copy of fx.ts's
// `.ty-ink` recipe with no white flash before it; a plain fade on 低, under reduced motion or without
// backdrop-filter), the white-out of a lifted lid, the fake shallow focus of 高, the warm light of the
// hero shot, the vertical title card with the cook's seal, the cook's voice as subtitles, 「山外 · 秋」,
// the skip chip, and the reaction bubble with its puff (which outlives the 特写 by a moment).
//
// Every timer here is real time. Owner: P (特写).
import './pv.css';
import type { WorldCtx } from '../../../types';
import { h } from '../../minigames/ui';
import type { Line, Taste } from './types';

const ease = (t: number) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };

/** backdrop-filter is there (the ink bleed and the focus ring need it). */
export function supportsBackdrop(): boolean {
  try { return CSS.supports('backdrop-filter', 'grayscale(1)') || CSS.supports('-webkit-backdrop-filter', 'grayscale(1)'); } catch { return false; }
}

const fill = (s: string) => s.replace(/\{名\}/g, '');
const pick = (ctx: WorldCtx, l: Line) => fill(ctx.lang === 'zh' ? l.zh : l.en);

/** A stage direction said alone: （……） — drawn as narration, with no name. */
export const isNarr = (zh: string) => zh.startsWith('（') && zh.endsWith('）');

export interface PvDom {
  readonly root: HTMLDivElement;
  /** The bars slide in (or out). */
  bars(on: boolean): void;
  /** Show the skip chip; `fn` runs on a tap anywhere, Esc, or the chip. */
  skippable(fn: () => void): void;
  /** A short dip to ink and back (`ms` all told); `mid` runs at its darkest. Resolves when it has cleared. */
  dip(ms: number, mid?: () => void): Promise<void>;
  /** The ink → colour bleed from the centre over `secs` (plain: a fade up from ink). */
  inkBleed(secs: number, plain: boolean): void;
  /** The steam's white-out: 0 → 0.8 → 0 over `secs`. */
  whiteout(secs: number): void;
  ring(on: boolean): void;
  warm(on: boolean): void;
  season(label: Line | null): void;
  /** The vertical title card (the seal lands `sealAt` s later: the caller knocks). */
  title(o: { name: Line; caption: Line; seal: string; rise: boolean } | null): void;
  seal(): void;
  /** A subtitle: the speaker's name (null: none) and the line; null clears it. */
  sub(who: Line | null, line: Line | null): void;
  close(): void;
}

/** Mount the 特写's overlay layer (a `.mg.is-game.mg-pv` in the minigames' layer). */
export function mountPvDom(ctx: WorldCtx): PvDom {
  const root = h('div', 'mg is-game mg-pv');
  root.lang = ctx.lang === 'zh' ? 'zh' : 'en';
  root.setAttribute('role', 'presentation');
  const vig = h('div', 'tyl-pv-vig', undefined, root);
  void vig;
  const ink = h('div', 'tyl-pv-ink', undefined, root);
  ink.style.display = 'none';
  const white = h('div', 'tyl-pv-white', undefined, root);
  const ring = h('div', 'tyl-pv-ring', undefined, root);
  const warm = h('div', 'tyl-pv-warm', undefined, root);
  const season = h('div', 'tyl-pv-season', undefined, root);
  const title = h('div', 'tyl-pv-title', undefined, root);
  const sub = h('div', 'tyl-pv-sub', undefined, root);
  let subNow: Line | null = null;
  sub.setAttribute('aria-live', 'polite');
  h('div', 'tyl-pv-bar is-top', undefined, root);
  h('div', 'tyl-pv-bar is-bottom', undefined, root);
  const dipEl = h('div', 'tyl-pv-dip', undefined, root);
  const skip = h('button', 'tyl-pv-skip', ctx.lang === 'zh' ? '略过' : 'Skip', root);
  skip.type = 'button';
  skip.setAttribute('aria-label', ctx.lang === 'zh' ? '略过 · Skip' : 'Skip');

  let off: (() => void) | null = ctx.hud.mount(root);
  let raf = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };
  let onSkip: (() => void) | null = null;
  const tap = (e: Event) => { e.preventDefault(); e.stopPropagation(); onSkip?.(); };
  const key = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    onSkip?.();
  };
  root.addEventListener('pointerdown', tap);
  window.addEventListener('keydown', key, true);
  requestAnimationFrame(() => root.classList.add('is-on'));

  const anim = (el: HTMLElement, frames: Keyframe[], ms: number): Promise<void> => {
    try {
      const a = el.animate(frames, { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
      return a.finished.then(() => undefined, () => undefined);
    } catch {
      return new Promise((r) => later(ms, r));
    }
  };

  const dom: PvDom = {
    root,
    bars(on) { root.classList.toggle('is-bars', on); },
    skippable(fn) { onSkip = fn; root.classList.add('is-skip'); },
    dip(ms, mid) {
      const half = Math.max(40, ms / 2);
      return new Promise<void>((done) => {
        void anim(dipEl, [{ opacity: 0 }, { opacity: 0.94 }], half).then(() => {
          try { mid?.(); } catch (e) { console.error('[walk] taoyuan 特写 dip', e); }
          // (one frame at the darkest: the teleport and the camera cut land under it)
          requestAnimationFrame(() => { void anim(dipEl, [{ opacity: 0.94 }, { opacity: 0 }], half).then(done); });
        });
      });
    },
    inkBleed(secs, plain) {
      cancelAnimationFrame(raf);
      if (plain || !supportsBackdrop()) {
        ink.style.display = 'none';
        void anim(dipEl, [{ opacity: 0.55 }, { opacity: 0 }], Math.max(120, secs * 1000));
        return;
      }
      ink.style.display = '';
      ink.style.setProperty('--r', '0%');
      const t0 = performance.now();
      const step = () => {
        const k = (performance.now() - t0) / (secs * 1000);
        ink.style.setProperty('--r', `${(ease(k) * 125).toFixed(1)}%`);
        if (k < 1) raf = requestAnimationFrame(step);
        else ink.style.display = 'none';
      };
      raf = requestAnimationFrame(step);
    },
    whiteout(secs) {
      void anim(white, [{ opacity: 0 }, { opacity: 0.8, offset: 0.45 }, { opacity: 0 }], secs * 1000);
    },
    ring(on) { ring.classList.toggle('is-on', on); },
    warm(on) { warm.classList.toggle('is-on', on); },
    season(label) {
      if (label) season.textContent = pick(ctx, label);
      season.classList.toggle('is-on', !!label);
    },
    title(o) {
      if (!o) { title.classList.remove('is-on'); return; }
      title.textContent = '';
      title.classList.toggle('is-rise', o.rise);
      h('div', 'tyl-pv-name', pick(ctx, o.name), title);
      h('div', 'tyl-pv-cap', pick(ctx, o.caption), title);
      const s = h('div', 'tyl-pv-seal', o.seal, title);
      s.setAttribute('aria-hidden', 'true');
      void title.offsetWidth;
      title.classList.add('is-on');
    },
    seal() { title.querySelector('.tyl-pv-seal')?.classList.add('is-on'); },
    sub(who, line) {
      if (!line) { subNow = null; sub.classList.remove('is-on'); return; }
      // (the same line again — carried on into the next shot — is left as it is: no second announcement)
      if (subNow === line && sub.classList.contains('is-on')) return;
      subNow = line;
      sub.textContent = '';
      const narr = isNarr(line.zh);
      if (who && !narr) h('b', '', pick(ctx, who), sub);
      h('span', '', pick(ctx, line), sub);
      sub.classList.add('is-on');
    },
    close() {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      onSkip = null;
      root.removeEventListener('pointerdown', tap);
      window.removeEventListener('keydown', key, true);
      off?.();
      off = null;
    },
  };
  return dom;
}

/**
 * The companion's reaction (spec §3.7): a bubble with their name (a stage direction alone is drawn
 * as narration, no name), and the taste's puff — steam, a petal pop, crumbs, a pink blush, a leaf.
 * It stays `ms` and then fades, on its own (the 特写 may already be over). Returns a remover.
 */
export function sayBubble(ctx: WorldCtx, who: Line | null, line: Line, taste: Taste, ms = 2600): () => void {
  const wrap = h('div', 'mg tyl-pv-sayer');
  wrap.lang = ctx.lang === 'zh' ? 'zh' : 'en';
  const narr = isNarr(line.zh);
  const box = h('div', 'tyl-pv-say' + (narr ? ' is-narr' : ''), undefined, wrap);
  box.setAttribute('role', 'status');
  if (who && !narr) h('b', '', pick(ctx, who), box);
  h('span', '', narr ? pick(ctx, line) : ctx.lang === 'zh' ? `「${fill(line.zh)}」` : `“${fill(line.en)}”`, box);
  if (taste === '酒') h('div', 'tyl-pv-blush', undefined, wrap);
  else {
    const puff = h('div', `tyl-pv-puff is-${taste}`, undefined, box);
    const n = taste === '茶' ? 1 : taste === '热' ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const p = h('i', '', undefined, puff);
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * (taste === '热' ? 0.35 : 0.6);
      const r = taste === '热' ? 34 + i * 6 : taste === '茶' ? 60 : 26 + (i % 3) * 8;
      p.style.setProperty('--dx', `${(Math.cos(a) * r).toFixed(0)}px`);
      p.style.setProperty('--dy', `${(Math.sin(a) * r - (taste === '脆' ? -10 : 0)).toFixed(0)}px`);
      p.style.setProperty('--rot', `${(i * 47) % 180}deg`);
      p.style.animationDelay = `${i * 60}ms`;
    }
  }
  let off: (() => void) | null = ctx.hud.mount(wrap);
  requestAnimationFrame(() => box.classList.add('is-on'));
  const t1 = setTimeout(() => box.classList.remove('is-on'), ms);
  const t2 = setTimeout(() => remove(), ms + 400);
  function remove(): void {
    clearTimeout(t1);
    clearTimeout(t2);
    off?.();
    off = null;
  }
  return remove;
}
