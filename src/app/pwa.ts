// Offline support: registers public/sw.js (see the notes there).
//
// Only in the production web build served over http(s): never in dev (it would cache modules
// under HMR), never in the single-file build (`vite build --mode single`, opened from file:// or
// embedded anywhere — it carries everything inline and has no sw.js next to it).

export interface RegisterSWOptions {
  /** The first service worker took control: the app now works offline. */
  onOfflineReady?: () => void;
  /** A newer version replaced the running one (it is used on the next launch). */
  onUpdated?: () => void;
}

/**
 * A short, stable id for this build: a hash of the fingerprinted files index.html references.
 * It changes on every deploy that changes the app, which makes the browser install a fresh worker
 * (and cache) — no build-time plugin needed.
 */
function buildId(): string {
  const refs = Array.from(
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]',
    ),
    (el) => {
      const url = el instanceof HTMLScriptElement ? el.src : el.href;
      return url.slice(url.lastIndexOf('/') + 1);
    },
  )
    .sort()
    .join('|');
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < refs.length; i++) {
    h ^= refs.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function registerSW(options: RegisterSWOptions = {}): void {
  if (!import.meta.env.PROD || import.meta.env.MODE === 'single') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol) || !window.isSecureContext) return;

  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (hadController) options.onUpdated?.();
    else options.onOfflineReady?.();
  });

  const register = () => {
    // Relative URL + scope: works at the site root and under a GitHub Pages sub-path alike.
    sw.register(`./sw.js?v=${buildId()}`, { scope: './' }).catch((err) => {
      console.warn('[半亩] service worker registration failed:', err);
    });
  };
  // Let the first paint and the fonts have the bandwidth; precaching can wait.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
