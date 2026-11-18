/* ==========================================================================
   Team Dekho – service worker
   - Has a fetch handler (required by Chrome for installability).
   - Navigation: network-first, falls back to the cached SPA shell when offline.
   - Static assets (js / css / fonts / images): stale-while-revalidate.
   - /api and every non-GET / cross-origin request is never touched.
   Bump VERSION to force every client to drop old caches.
   ========================================================================== */

const VERSION = 'v3';
const SHELL_CACHE = `td-shell-${VERSION}`;
const ASSET_CACHE = `td-assets-${VERSION}`;
const SHELL_URLS = ['/', '/index.html', '/manifest.json'];
const ASSET_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // allSettled: one missing file must never block the install
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('td-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
  }
}

async function assetHandler(event) {
  const { request } = event;
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(network); // refresh in the background
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  if (ASSET_DESTINATIONS.has(request.destination)) {
    event.respondWith(assetHandler(event));
  }
});