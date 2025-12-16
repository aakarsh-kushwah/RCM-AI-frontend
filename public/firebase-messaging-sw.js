// public/firebase-messaging-sw.js
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

messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/rcmai_logo.png' // Make sure you have a logo.png in public folder
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});