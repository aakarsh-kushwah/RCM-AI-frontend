/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'rcm-ai-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  
  '/favicon.ico',
];

// 1. Install Event: ऐप इंस्टॉल होते ही कैश खोलें और फ़ाइलें डालें
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Fetch Event: (यह सबसे ज़रूरी है)
self.addEventListener('fetch', (event) => {
  
  // ✅ --- यही वह नया फिक्स है ---
  // अगर यह एक API रिक्वेस्ट है, तो सर्विस वर्कर कुछ नहीं करेगा
  // और ब्राउज़र को इसे नॉर्मल तरीके से हैंडल करने देगा।
  if (event.request.url.includes('/api/')) {
    return; // सर्विस वर्कर को रोकें
  }
  // --- फिक्स खत्म ---

  // बाकी सभी रिक्वेस्ट (जैसे CSS, JS, Images) के लिए कैश का इस्तेमाल करें
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 1. अगर कैश में है, तो कैश से जवाब दें
        if (response) {
          return response;
        }

        // 2. अगर कैश में नहीं है, तो नेटवर्क पर जाएँ
        return fetch(event.request).then(
          (networkResponse) => {
            // 3. जवाब मिलने पर, उसे कैश में डालें और फिर जवाब दें
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(() => {
          // ऑफ़लाइन होने पर, यहाँ एक फ़ॉलबैक पेज दिखा सकते हैं
        });
      })
  );
});

// 3. Activate Event: पुराने कैश को साफ़ करें
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    })
  );
});