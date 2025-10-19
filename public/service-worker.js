// public/service-worker.js

// Service Worker Registration Handler
const CACHE_NAME = 'rcm-ai-cache-v1';
const urlsToCache = [
  // Cache root path and index HTML only. 
  // Browser will handle static/js/ and static/css paths automatically.
  '/',
  '/index.html',
];

// Installation: Cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // CRITICAL: Catch errors during caching to prevent SW failure
        return cache.addAll(urlsToCache).catch(error => {
            console.error('Failed to cache required assets. This is normal if assets are not at root:', error);
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
