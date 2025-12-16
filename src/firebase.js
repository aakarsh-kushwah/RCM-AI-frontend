import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDLGr5muEwrOAn9je3fDqVQbRatWmnmJFo",
  authDomain: "rcm-ai-assistance-app.firebaseapp.com",
  projectId: "rcm-ai-assistance-app",
  storageBucket: "rcm-ai-assistance-app.firebasestorage.app",
  messagingSenderId: "944167924646",
  appId: "1:944167924646:web:a13b7916e7e62c26eb1567",
  measurementId: "G-33RYFBM4V0"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Your VAPID Key
const VAPID_KEY = "BNJKkgGbvN5ogX9VItoSWONpiH8rGh35N46hu-p8vi__iUVdlgaz8k4kgwUTsscsFCpWwV9QwqVQkGQhr88sNR8"; 

// src/firebase.js
// ... imports and config stay the same ...

export const requestForToken = async () => {
  try {
    // 1. Register the Service Worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log("⚠️ SW Registered. Status:", registration.installing ? "Installing" : "Active");

    // 2. CRITICAL FIX: Wait for it to be fully "Active"
    // This line pauses code execution until the browser confirms the SW is ready to work.
    const serviceWorker = await navigator.serviceWorker.ready;
    console.log("✅ SW is now Active!", serviceWorker);

    // 3. NOW it is safe to get the token
    const currentToken = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration 
    });

    if (currentToken) {
      return currentToken;
    } else {
      console.log('No registration token available.');
      return null;
    }
  } catch (err) {
    console.error('An error occurred while retrieving token. ', err);
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });