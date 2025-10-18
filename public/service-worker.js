// Service Worker Registration Handler
const CACHE_NAME = 'rcm-ai-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // ✅ FIX: Use root path for assets, remove %PUBLIC_URL%
  '/logo192.png' 
];

// Installation: Cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // CRITICAL: .catch is added to handle failed fetches without breaking SW registration
        return cache.addAll(urlsToCache).catch(error => {
            console.error('Failed to cache required assets:', error);
        });
      })
  );
});

// Activation: Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch: Serve cached content when offline, or fetch from network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
