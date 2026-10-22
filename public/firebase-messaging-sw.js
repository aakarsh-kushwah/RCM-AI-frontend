// public/firebase-messaging-sw.js

self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click Received.', event);

  event.notification.close(); 

  if (event.action === "dismiss") {
    return;
  }

  const payloadData = event.notification.data || {};
  const fcmMessageData = payloadData.FCM_MSG?.data || {};
  const fcmOptions = payloadData.FCM_MSG?.fcmOptions || {};

  let targetUrl = payloadData.url || fcmMessageData.url || fcmOptions.link || "/dashboard";

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = self.location.origin + targetUrl;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      const currentOrigin = new URL(self.location.origin).origin;
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (new URL(client.url).origin === currentOrigin) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDLGr5muEwrOAn9je3fDqVQbRatWmnmJFo",
  authDomain: "rcm-ai-assistance-app.firebaseapp.com",
  projectId: "rcm-ai-assistance-app",
  storageBucket: "rcm-ai-assistance-app.firebasestorage.app",
  messagingSenderId: "944167924646",
  appId: "1:944167924646:web:a13b7916e7e62c26eb1567",
  measurementId: "G-33RYFBM4V0"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message.', payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new message.',
    icon: '/rcm-logo-192.png',
    badge: '/badge-72x72.png',
    image: payload.data?.imageUrl || undefined,
    data: {
      url: payload.data?.url || payload.notification?.click_action || '/dashboard',
      FCM_MSG: payload
    }
  };

  if (!payload.notification) {
    return self.registration.showNotification(notificationTitle, notificationOptions);
  }
  return Promise.resolve();
});
