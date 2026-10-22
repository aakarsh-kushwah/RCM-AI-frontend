// public/firebase-messaging-sw.js

// IMPORTANT: The notificationclick listener must be registered BEFORE importScripts
// to ensure it takes priority over Firebase's internal listener.
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click Received.', event);

  event.notification.close(); // Close the popup

  if (event.action === "dismiss") {
    return;
  }

  const payloadData = event.notification.data || {};
  const fcmMessageData = payloadData.FCM_MSG?.data || {};
  const fcmOptions = payloadData.FCM_MSG?.fcmOptions || {};

  // Resolve target URL in order of priority
  let targetUrl = payloadData.url || fcmMessageData.url || fcmOptions.link || "/dashboard";

  // Ensure the URL is absolute
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = self.location.origin + targetUrl;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      const currentOrigin = new URL(self.location.origin).origin;
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (new URL(client.url).origin === currentOrigin) {
          // If a window with the same origin is open, focus it and navigate
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // If no tab from the same origin is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 1. YOUR CONFIG (These will be replaced by environment variables in a later step)
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
  measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
};

// 2. INITIALIZE
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Add skipWaiting and clients.claim
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

// 3. BACKGROUND LISTENER - Do NOT show a second notification manually.
// The backend already sends the "notification" key, so the browser shows the notification.
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message (notification handled by browser).', payload);
  // No need to show notification manually here, as the backend sends a "notification" key.
  // However, we can use this to set up actions or specific data for the notification if needed.
  // For example, if the backend sends a 'data' payload without a 'notification' payload,
  // we would construct and show the notification here.
  // Since the instruction is to NOT show a second notification, this block is mostly for logging
  // and for potential future data-only message handling.

  // If the backend sends a data message, and we want to customize its display, we would do it here.
  // But for "notification" messages, the browser handles display based on manifest and payload.
  // To ensure the custom actions and badge are applied, we will check if a 'notification' property exists
  // in the payload, and if not, we would construct the notification here.
  // Given the instruction "Do NOT show a second notification manually in onBackgroundMessage",
  // we will ensure this does not create a new notification if a 'notification' key is present.
  // However, to ensure actions are added, we might need to recreate the notification with actions.
  // The prompt says "The backend already sends the 'notification' key, so the browser shows the notification (icon /rcm-logo-192.png, badge /badge-72x72.png, big image, actions Open App / Dismiss)."
  // This implies the browser's default handling *should* include these, but service worker can enhance it.
  // Let's create a notification with the required actions and badge if it's a data-only message or to ensure actions are present.

  const notificationTitle = payload.notification?.title || payload.data?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new message.',
    icon: '/rcm-logo-192.png', // Default icon path
    badge: '/badge-72x72.png', // Default badge path
    image: payload.data?.imageUrl || undefined,
    data: {
      url: payload.data?.url || payload.notification?.click_action || '/dashboard',
      FCM_MSG: payload // Pass the full payload for comprehensive URL resolution on click
    },
    actions: [
      { action: 'open_app', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  // Only show notification if it's a data message OR if the backend notification doesn't implicitly handle actions/badge
  // For now, adhering strictly to "Do NOT show a second notification manually in onBackgroundMessage".
  // If we need to add actions, we'll need to override or ensure the backend sends them in the 'notification' key directly.
  // As per FCM docs, actions and badge can be part of the 'notification' payload directly.
  // Assuming the backend handles this, this block remains for data-only messages if needed.
  // If the 'notification' key is present, the browser will handle displaying it.
  // If only 'data' is present, we need to display it.
  if (!payload.notification) {
    return self.registration.showNotification(notificationTitle, notificationOptions);
  }
  return Promise.resolve(); // If notification key is present, let browser handle it.
});
