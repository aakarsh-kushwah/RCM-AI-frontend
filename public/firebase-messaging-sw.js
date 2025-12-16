// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 1. YOUR CONFIG (Ensure these keys are correct)
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

  // ✅ SAFE HANDLING: Checks for both Notification and Data payloads
  const title = payload.notification?.title || payload.data?.title || "New Message";
  const body = payload.notification?.body || payload.data?.body || "You have a new notification.";

  const notificationOptions = {
    body: body,
    icon: '/rcmai_logo.png' // Ensure this image exists!
  };

  return self.registration.showNotification(title, notificationOptions);
});