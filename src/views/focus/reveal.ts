// Bring the painting (and the clock under it) back into view — after lighting from a scrolled
// setup, resuming, or lighting another. Everything the burning layout needs fits one screen.
export function revealStage(opts: { blur?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (opts.blur) {
    // Dismiss the soft keyboard left up by the intention field.
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur();
  }
  let reduce = false;
  try {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* old browsers */
  }
  requestAnimationFrame(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
}
