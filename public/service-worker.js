// public/service-worker.js

const CACHE_NAME = 'rcm-ai-cache-v2'; // v2 में अपडेट किया गया ताकि ब्राउज़र नए SW को मजबूरन लोड करे
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  
  // CSS और JS बंडल्स को यहाँ न जोड़ें, वे स्वचालित रूप से कैश हो जाएँगे
];

// Installation: Cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // केवल मुख्य फ़ाइलों को प्री-कैश करें
        return cache.addAll(urlsToCache).catch(error => {
          console.error('Failed to cache initial assets:', error);
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

// Fetch: Serve cached content or fetch from network
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // ✅ CRITICAL FIX: 
  // 1. अगर यह API कॉल है (Render पर जा रही है), तो इसे अनदेखा करें और नेटवर्क को संभालने दें।
  // 2. यह 'chrome-extension' अनुरोधों को भी अनदेखा करता है।
  if (!event.request.url.startsWith(self.location.origin) || requestUrl.pathname.startsWith('/api/')) {
    return event.respondWith(fetch(event.request));
  }

  // 3. अन्य सभी (स्थानीय) अनुरोधों के लिए: नेटवर्क पहले (Stale-While-Revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return fetch(event.request).then(networkResponse => {
        // अगर नेटवर्क से मिलता है, तो इसे कैश में डालें और वापस भेजें
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      }).catch(() => {
        // अगर नेटवर्क विफल होता है (ऑफ़लाइन), तो कैश से वापस भेजें
        return cache.match(event.request);
      });
    })
  );
});

