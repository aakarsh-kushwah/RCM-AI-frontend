// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 1. YOUR CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDLGr5muEwrOAn9je3fDqVQbRatWmnmJFo",
  authDomain: "rcm-ai-assistance-app.firebaseapp.com",
  projectId: "rcm-ai-assistance-app",
  storageBucket: "rcm-ai-assistance-app.firebasestorage.app",
  messagingSenderId: "944167924646",
  appId: "1:944167924646:web:a13b7916e7e62c26eb1567",
  measurementId: "G-33RYFBM4V0"
};

// 2. INITIALIZE
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 3. BACKGROUND LISTENER
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const title = payload.data.title || "New Message";
  const body = payload.data.body || "You have a new notification.";
  const icon = payload.data.icon || '/rcmai_logo.png';
  const image = payload.data.imageUrl || null; // <--- Get the Image URL

  const notificationOptions = {
    body: body,
    icon: icon,
    image: image, // <--- This adds the Big Picture banner!
    data: { url: payload.data.url || '/' }
  };

  return self.registration.showNotification(title, notificationOptions);
});

// 4. ✅ CLICK LISTENER (Fixes the "Click to Open" issue)
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click Received.', event);

  event.notification.close(); // Close the popup

  // Open the app or focus if already open
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Try to find an existing open tab
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        // Check if your site is open
        if (client.url.includes('localhost') || client.url.includes('rcmai.in')) {
            return client.focus();
        }
      }
      // 2. If no tab is open, open a new one
      if (clients.openWindow) {
        // Use the URL sent in data, or default to root
        const urlToOpen = event.notification.data?.url || '/';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});