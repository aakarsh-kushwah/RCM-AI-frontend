/* eslint-disable no-restricted-globals */

/* =========================================================
   RCM AI Assistant – Production Service Worker
   ========================================================= */

const CACHE_NAME = "rcm-ai-v2";

// App shell (safe to cache)
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/rcmai_logo.png"
];

/* ================= INSTALL ================= */
self.addEventListener("install", (event) => {
  self.skipWaiting(); // 🔥 activate immediately

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
});

/* ================= ACTIVATE ================= */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // 🧹 Clear old caches
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
            return null;
          })
        )
      ),

      // 🔥 Take control immediately
      self.clients.claim(),
    ])
  );
});

/* ================= FETCH ================= */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* 🚫 NEVER intercept these */
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("razorpay") ||
    url.hostname.includes("checkout.razorpay.com") ||
    request.method !== "GET"
  ) {
    return; // browser handles it
  }

  /* 🔄 React Router navigation fix */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  /* 📦 Cache-first for static assets */
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => {
          // 📴 Offline fallback
          if (request.destination === "document") {
            return caches.match("/index.html");
          }
        });
    })
  );
});

/* ================= MESSAGE ================= */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
