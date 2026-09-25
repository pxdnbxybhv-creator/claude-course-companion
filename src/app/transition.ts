// Page transitions: the new page spreads in like ink dropped on xuan paper, from the point the
// user tapped, while the old page fades out beneath it.
//
// Uses the View Transitions API where available (Chrome/Edge 111+, Safari 18+). Elsewhere the
// incoming view plays the same ink-bleed mask as a CSS animation (see app.css). Reduced motion gets
// a short cross-fade.

export interface Origin { x: number; y: number }

type VT = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };
type DocVT = Document & { startViewTransition?: (cb: () => Promise<void> | void) => VT };

function originOf(from?: Origin | Event): Origin {
  if (from && 'x' in from && typeof (from as Origin).x === 'number' && !(from instanceof Event)) return from as Origin;
  const e = from as (MouseEvent & { detail?: number }) | undefined;
  // A real pointer position (keyboard "clicks" report 0,0 with detail 0).
  if (e && 'clientX' in e && (e.clientX || e.clientY) && e.detail !== 0) return { x: e.clientX, y: e.clientY };
  const t = e?.currentTarget as Element | null | undefined;
  if (t && 'getBoundingClientRect' in t) {
    const r = t.getBoundingClientRect();
    if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: innerWidth / 2, y: innerHeight / 2 };
}

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

let seq = 0;

/** Run a state update inside a page transition. The update must change the route synchronously. */
export function transition(update: () => void, from?: Origin | Event): void {
  const root = document.documentElement;
  const o = originOf(from);
  // How far the ink must spread to cover the whole screen from the origin.
  const reach = Math.hypot(Math.max(o.x, innerWidth - o.x), Math.max(o.y, innerHeight - o.y));
  root.style.setProperty('--vt-x', `${Math.round(o.x)}px`);
  root.style.setProperty('--vt-y', `${Math.round(o.y)}px`);
  root.style.setProperty('--vt-reach', `${Math.round(reach + 80)}px`);
  root.dataset.vtSeq = String(++seq % 4); // varies the blot shape a little each time
  const doc = document as DocVT;
  const reduced = reducedMotion();
  root.toggleAttribute('data-vt-reduced', reduced);
  if (!doc.startViewTransition) {
    root.setAttribute('data-vt-fallback', '');
    update();
    window.scrollTo(0, 0);
    return;
  }
  root.removeAttribute('data-vt-fallback');
  try {
    doc.startViewTransition(async () => {
      update();
      // Let Preact flush the re-render (it batches on a microtask) before the new state is captured.
      await new Promise((r) => setTimeout(r, 0));
      window.scrollTo(0, 0);
    });
  } catch {
    update();
    window.scrollTo(0, 0);
  }
}
