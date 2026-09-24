/* 半亩 · Half-Acre — service worker: an offline-first, cache-first app shell.
 *
 * Registered by src/app/pwa.ts as `sw.js?v=<build id>` (web build only, never in the single-file
 * build). The build id is derived from the fingerprinted assets index.html references, so every
 * deploy that changes the app installs a fresh worker with its own versioned cache.
 *
 *   install   fetch index.html, discover everything it needs (scripts, stylesheets, icons, and the
 *             fonts inside the stylesheets) and precache it; hashed files already cached by the
 *             previous version are copied instead of downloaded. Then skipWaiting.
 *   activate  delete this app's older caches, claim open clients.
 *   fetch     same-origin GETs inside the scope are answered from the cache first. The app shell
 *             (navigations) is served from the cache instantly and revalidated in the background:
 *             a changed index.html is stored only once all of its assets are cached, so the next
 *             launch gets the new version and still works offline.
 *
 * Everything is resolved against the registration scope, so the app works from a sub-path
 * (e.g. https://user.github.io/repo/).
 */
'use strict';

const SCOPE = self.registration.scope;
const VERSION = new URL(self.location.href).searchParams.get('v') || '0';
const PREFIX = `banmu:${new URL(SCOPE).pathname}:`;
const CACHE = PREFIX + VERSION;
const INDEX = new URL('./', SCOPE).href;

// Static files outside the build graph (public/). Missing ones are skipped, not fatal.
const EXTRAS = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

/** Content-hashed build output (e.g. assets/main-DMVhBhU7.js) never changes. */
const isImmutable = (url) => /\/assets\/[^/]+-[\w-]{8,}\.\w+$/.test(new URL(url).pathname);
const inScope = (url) => url.startsWith(SCOPE);

/** Chrome refuses redirected responses for navigations; rebuild them as plain responses. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Everything a page needs: src/href in index.html, and url(...) inside its stylesheets. */
async function discover(html, cache) {
  const urls = new Set();
  for (const m of html.matchAll(/\s(?:src|href)\s*=\s*["']([^"'#]+)["']/g)) {
    const url = new URL(m[1], INDEX).href;
    if (inScope(url)) urls.add(url);
  }
  for (const url of [...urls]) {
    if (!/\.css(\?|$)/.test(url)) continue;
    const res = await fetchInto(cache, url);
    const css = await res.clone().text();
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      if (m[2].startsWith('data:')) continue;
      const ref = new URL(m[2], url).href;
      if (inScope(ref)) urls.add(ref);
    }
  }
  return urls;
}

/** Put url into cache: reuse an immutable copy from any cache, otherwise download it. */
async function fetchInto(cache, url) {
  const have = await cache.match(url);
  if (have) return have;
  if (isImmutable(url)) {
    const old = await caches.match(url);
    if (old) {
      await cache.put(url, old.clone());
      return old;
    }
  }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await cache.put(url, res.clone());
  return res;
}

/** Cache index.html and everything it references; index.html goes in last. */
async function cacheShell(cache, res) {
  const html = await res.clone().text();
  const urls = await discover(html, cache);
  await Promise.all([...urls].map((u) => fetchInto(cache, u)));
  await cache.put(INDEX, await clean(res));
  return html;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch(INDEX, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`index.html: ${res.status}`);
      await cacheShell(cache, res);
      await Promise.all(EXTRAS.map((u) => fetchInto(cache, new URL(u, SCOPE).href).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/**
 * This worker's cache for runtime writes — or null once a newer worker has activated and deleted
 * it (a superseded worker may still be finishing a request; it must not resurrect its cache).
 */
async function liveCache() {
  return (await caches.has(CACHE)) ? caches.open(CACHE) : null;
}

/** Fetch a fresh index.html; store it only after all of its assets are cached. */
async function revalidateShell() {
  const res = await fetch(INDEX, { cache: 'no-cache' });
  const cache = await liveCache();
  if (!res.ok || !cache) return clean(res);
  const [fresh, cached] = await Promise.all([res.clone().text(), cache.match(INDEX).then((r) => r && r.text())]);
  if (fresh !== cached) await cacheShell(cache, res.clone());
  return clean(res);
}

async function serveShell(event) {
  const own = await liveCache();
  const cached = (own && (await own.match(INDEX))) || (await caches.match(INDEX));
  const update = revalidateShell();
  if (cached) {
    event.waitUntil(update.catch(() => {}));
    return cached;
  }
  try {
    return await update;
  } catch (err) {
    return (await caches.match(INDEX)) || Response.error();
  }
}

async function cacheFirst(request) {
  const own = await liveCache();
  const hit = (own && (await own.match(request))) || (await caches.match(request));
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    const cache = await liveCache();
    if (cache) await cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !inScope(request.url) || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    // The app is a single page with a hash router: any navigation to it gets the shell.
    const rel = url.pathname.slice(new URL(SCOPE).pathname.length);
    if (rel === '' || rel === 'index.html') event.respondWith(serveShell(event));
    return;
  }
  event.respondWith(cacheFirst(request));
});

// Focus-timer notifications shown through the worker (Android needs this): a tap brings the app
// back — the open window if there is one, otherwise a new one on the focus view.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((c) => inScope(c.url));
      if (win) return win.focus();
      const target = event.notification.data && event.notification.data.url;
      return self.clients.openWindow(new URL(target || './#focus', SCOPE).href);
    })(),
  );
});
