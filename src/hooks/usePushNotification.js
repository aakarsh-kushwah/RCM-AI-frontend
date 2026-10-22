import { useState, useEffect, useRef, useCallback } from 'react';
import { getMessaging, getToken, deleteToken, onMessage } from 'firebase/messaging';
import { initializeApp } from 'firebase/app';

// Placeholder for toast utility - replace with actual toast implementation
const showToast = (message, type = 'info') => {
  console.log(`Toast (${type}): ${message}`);
};

const usePushNotification = () => {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState(() => 'Notification' in window ? Notification.permission : 'default');
  const [enabled, setEnabled] = useState(false); // Indicates if push is active and token saved
  const [loading, setLoading] = useState(true);
  const messagingRef = useRef(null);
  const isRefreshingTokenRef = useRef(false);

  // Firebase config should come from environment variables
  const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "",
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "rcm-ai-assistance-app.firebaseapp.com",
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "rcm-ai-assistance-app",
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "rcm-ai-assistance-app.appspot.com",
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "152036931077",
    appId: process.env.REACT_APP_FIREBASE_APP_ID || "",
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-33RYFBM4V0",
  };

  const VAPID_KEY = process.env.REACT_APP_VAPID_KEY || "BNJKkgGbvN5ogX9VItoSWONpiH8rGh35N46hu-p8vi__iUVdlgaz8k4kgwUTsscsFCpWwV9QwqVQkGQhr88sNR8";
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  // Check support for Notifications and Service Workers, handle iOS Safari
  useEffect(() => {
    const isNotificationSupported = 'Notification' in window;
    const isServiceWorkerSupported = 'serviceWorker' in navigator;
    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && !navigator.standalone;

    const isPushSupported = isNotificationSupported && isServiceWorkerSupported && !isIOSSafari;
    setSupported(isPushSupported);

    if (isPushSupported && firebaseConfig.apiKey) {
      try {
        const app = initializeApp(firebaseConfig);
        messagingRef.current = getMessaging(app);
        setLoading(false);
      } catch (error) {
        console.error("Error initializing Firebase Messaging:", error);
        setSupported(false);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }

    // Foreground message listener
    let unsubscribe = null;
    if (messagingRef.current) {
      unsubscribe = onMessage(messagingRef.current, (payload) => {
        console.log("Foreground message received:", payload);
        if (payload.notification) {
          showToast(payload.notification.body, 'info');
        } else if (payload.data) {
          showToast(payload.data.body || 'You have a new message', 'info');
        }
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };

  }, [firebaseConfig.apiKey]);

  // Function to register service worker
  const registerServiceWorker = useCallback(async () => {
    if (!supported) return null;
    try {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log("Service Worker registered:", registration);
      return registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      showToast("Failed to register service worker for notifications.", 'error');
      return null;
    }
  }, [supported]);

  // Function to save token to backend
  const saveTokenToBackend = useCallback(async (token) => {
    const authToken = localStorage.getItem('accessToken');
    if (!token || !authToken) return;

    try {
      const response = await fetch(`${API_URL}/api/notifications/save-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token, platform: "WEB" })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save token to backend');
      }
      localStorage.setItem('rcm_push_token', token);
      localStorage.setItem('rcm_push_last_sync', Date.now().toString());
      setEnabled(true);
      showToast("Notifications enabled!", 'success');
      console.log("✅ Device registered for push notifications successfully");
    } catch (e) {
      console.error("❌ Failed to save push notification token to backend", e);
      showToast(`Error enabling notifications: ${e.message}`, 'error');
    }
  }, [API_URL]);

  // Function to unsubscribe token from backend
  const unsubscribeTokenFromBackend = useCallback(async (token) => {
    const authToken = localStorage.getItem('accessToken');
    if (!token || !authToken) return;

    try {
      const response = await fetch(`${API_URL}/api/notifications/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to unsubscribe token from backend');
      }
      showToast("Notifications disabled.", 'info');
      console.log("✅ Device unsubscribed from push notifications successfully");
    } catch (e) {
      console.error("❌ Failed to unsubscribe push notification token from backend", e);
      showToast(`Error disabling notifications: ${e.message}`, 'error');
    }
  }, [API_URL]);

  // Enable Push Notifications
  const enableNotifications = useCallback(async () => {
    if (loading || !supported || !messagingRef.current) return;

    setLoading(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult === 'granted') {
        const registration = await registerServiceWorker();
        if (!registration) throw new Error("Service Worker not registered.");

        const currentToken = await getToken(messagingRef.current, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        if (currentToken) {
          await saveTokenToBackend(currentToken);
        } else {
          showToast("No push token received. Please try again.", 'error');
          console.log('No registration token available. Request permission to generate one.');
        }
      } else if (permissionResult === 'denied') {
        showToast("Notification permission denied. Please enable it in your browser settings.", 'warning');
      } else { // default
        showToast("Notification permission dismissed.", 'info');
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      showToast(`Error enabling notifications: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, supported, VAPID_KEY, registerServiceWorker, saveTokenToBackend]);

  // Disable Push Notifications
  const disableNotifications = useCallback(async () => {
    if (loading || !supported || !messagingRef.current) return;

    setLoading(true);
    try {
      const currentToken = localStorage.getItem('rcm_push_token');
      if (currentToken) {
        await unsubscribeTokenFromBackend(currentToken);
        await deleteToken(messagingRef.current);
        localStorage.removeItem('rcm_push_token');
        localStorage.removeItem('rcm_push_last_sync');
        setEnabled(false);
      }
      showToast("Notifications have been successfully turned off.", 'success');
    } catch (error) {
      console.error("Error disabling notifications:", error);
      showToast(`Error disabling notifications: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, supported, unsubscribeTokenFromBackend]);

  // Silent token refresh and sync on app load / login
  useEffect(() => {
    const refreshAndSyncToken = async () => {
      if (!supported || !messagingRef.current || permission !== 'granted' || isRefreshingTokenRef.current) return;

      isRefreshingTokenRef.current = true; // Prevent multiple simultaneous refreshes
      const storedToken = localStorage.getItem('rcm_push_token');
      const lastSync = parseInt(localStorage.getItem('rcm_push_last_sync') || '0', 10);
      const twentyFourHours = 24 * 60 * 60 * 1000;

      try {
        const registration = await navigator.serviceWorker.ready;
        const newToken = await getToken(messagingRef.current, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

        if (newToken && (newToken !== storedToken || (Date.now() - lastSync > twentyFourHours))) {
          console.log("Silently refreshing or syncing push token.");
          await saveTokenToBackend(newToken);
        } else if (!newToken && storedToken) {
          console.warn("Lost FCM token but a stored token exists. Attempting to re-enable.");
          await enableNotifications();
        } else if (newToken && !storedToken) {
          console.log("New FCM token found, but no stored token. Saving.");
          await saveTokenToBackend(newToken);
        } else if (storedToken && newToken === storedToken && Date.now() - lastSync <= twentyFourHours) {
          console.log("FCM token is current and recently synced.");
          setEnabled(true);
        }
      } catch (error) {
        console.error("Error during silent token refresh/sync:", error);
      } finally {
        isRefreshingTokenRef.current = false;
      }
    };

    if (permission === 'granted') {
      refreshAndSyncToken();
    }
  }, [supported, permission, VAPID_KEY, saveTokenToBackend, enableNotifications]);

  // Initial check for existing token to set `enabled` state
  useEffect(() => {
    if (localStorage.getItem('rcm_push_token')) {
      setEnabled(true);
    }
  }, []);

  return {
    supported,
    permission,
    enabled,
    loading,
    enable: enableNotifications,
    disable: disableNotifications,
  };
};

export default usePushNotification;
