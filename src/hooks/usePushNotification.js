/**
 * @file usePushNotification.js
 * @description Enterprise-grade, high-scale React Hook for Firebase Cloud Messaging (Web Push).
 * Handles async browser capability detection (isSupported), resilient token syncing,
 * service worker registration guards, and silent background refreshes without uncaught rejections.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';

// ============================================================
// ⚙️ CONFIGURATION & CONSTANTS (Declared outside hook to prevent re-renders)
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDLGr5muEwrOAn9je3fDqVQbRatWmnmJFo",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "rcm-ai-assistance-app.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "rcm-ai-assistance-app",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "rcm-ai-assistance-app.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "944167924646",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:944167924646:web:a13b7916e7e62c26eb1567",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-33RYFBM4V0",
};

const VAPID_KEY = process.env.REACT_APP_VAPID_KEY || "BNJKkgGbvN5ogX9VItoSWONpiH8rGh35N46hu-p8vi__iUVdlgaz8k4kgwUTsscsFCpWwV9QwqVQkGQhr88sNR8";
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const TOKEN_STORAGE_KEY = 'rcm_push_token';
const LAST_SYNC_KEY = 'rcm_push_last_sync';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // Sync token with backend once every 24 hours

// Safe Toast logger fallback
const showToast = (message, type = 'info') => {
  if (typeof window !== 'undefined' && window.toast) {
    window.toast[type]?.(message) || window.toast(message);
  } else {
    console.log(`[Push Notification] (${type}): ${message}`);
  }
};

// Singleton Firebase App instance
const getFirebaseApp = () => {
  return getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
};

// Cached Messaging Instance
let cachedMessaging = null;

const getSafeMessagingInstance = async () => {
  if (typeof window === 'undefined') return null;
  if (cachedMessaging) return cachedMessaging;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Push messaging is not supported in this browser/mode.');
      return null;
    }
    const app = getFirebaseApp();
    cachedMessaging = getMessaging(app);
    return cachedMessaging;
  } catch (err) {
    console.warn('[FCM] Failed to initialize Firebase Messaging:', err?.message || err);
    return null;
  }
};

// ============================================================
// 🚀 HOOK DEFINITION
// ============================================================
const usePushNotification = () => {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const messagingRef = useRef(null);
  const isSyncingRef = useRef(false);

  // 1. Initial Capability Check & Foreground Listener
  useEffect(() => {
    let isMounted = true;
    let unsubscribe = null;

    const initPushEngine = async () => {
      try {
        const messaging = await getSafeMessagingInstance();
        if (!isMounted) return;

        if (messaging) {
          messagingRef.current = messaging;
          setSupported(true);

          // Listen for incoming notifications when the app is in the foreground
          unsubscribe = onMessage(messaging, (payload) => {
            console.log('[FCM] Foreground message received:', payload);
            const title = payload.notification?.title || 'Notification';
            const body = payload.notification?.body || payload.data?.body || 'New message received';
            showToast(`${title}: ${body}`, 'info');
          });
        } else {
          setSupported(false);
        }
      } catch (err) {
        console.warn('[FCM] Initialization caught error:', err.message);
        if (isMounted) setSupported(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initPushEngine();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // 2. Safe Service Worker Registration
  const getOrRegisterServiceWorker = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

    try {
      let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      }
      // Ensure registration is ready
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error('[FCM] Service Worker registration failed:', error);
      return null;
    }
  }, []);

  // 3. Save Device Token to Backend
  const saveTokenToBackend = useCallback(async (token) => {
    const authToken = localStorage.getItem('accessToken');
    if (!token || !authToken) return;

    try {
      const response = await fetch(`${API_URL}/api/notifications/save-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token, platform: 'WEB' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server responded with status ${response.status}`);
      }

      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
      setEnabled(true);
      console.log('✅ Device successfully registered for push notifications');
    } catch (e) {
      console.error('❌ Failed to save push notification token to backend:', e.message);
    }
  }, []);

  // 4. Unsubscribe Token from Backend
  const unsubscribeTokenFromBackend = useCallback(async (token) => {
    const authToken = localStorage.getItem('accessToken');
    if (!token || !authToken) return;

    try {
      const response = await fetch(`${API_URL}/api/notifications/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to unsubscribe');
      }

      console.log('✅ Device unsubscribed from push notifications');
    } catch (e) {
      console.error('❌ Failed to unsubscribe token from backend:', e.message);
    }
  }, []);

  // 5. Silent Token Refresh & Sync (No unhandled rejections)
  const refreshAndSyncToken = useCallback(async () => {
    if (
      !supported ||
      !messagingRef.current ||
      typeof window === 'undefined' ||
      Notification.permission !== 'granted' ||
      isSyncingRef.current ||
      !navigator.onLine
    ) {
      return;
    }

    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
    const isTokenStale = Date.now() - lastSync > SYNC_INTERVAL_MS;

    // Skip network request if token was synced recently
    if (storedToken && !isTokenStale) {
      setEnabled(true);
      return;
    }

    isSyncingRef.current = true;

    try {
      const registration = await getOrRegisterServiceWorker();
      if (!registration) {
        isSyncingRef.current = false;
        return;
      }

      const freshToken = await getToken(messagingRef.current, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (freshToken) {
        if (freshToken !== storedToken || isTokenStale) {
          console.log('[FCM] Syncing token with backend...');
          await saveTokenToBackend(freshToken);
        } else {
          setEnabled(true);
        }
      }
    } catch (error) {
      // Gracefully capture Internal Error / IndexedDB locks without throwing unhandled exceptions
      console.warn('[FCM] Silent token refresh skipped safely:', error?.message || error);
    } finally {
      isSyncingRef.current = false;
    }
  }, [supported, getOrRegisterServiceWorker, saveTokenToBackend]);

  // 6. User Trigger: Enable Notifications
  const enableNotifications = useCallback(async () => {
    if (loading || !supported) {
      showToast('Push notifications are not supported on this device/browser.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const messaging = messagingRef.current || (await getSafeMessagingInstance());
      if (!messaging) {
        showToast('Push messaging service is unavailable.', 'error');
        return;
      }

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult === 'granted') {
        const registration = await getOrRegisterServiceWorker();
        if (!registration) throw new Error('Service Worker failed to activate.');

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (token) {
          await saveTokenToBackend(token);
          showToast('Notifications enabled successfully!', 'success');
        } else {
          showToast('Failed to generate device token. Please retry.', 'error');
        }
      } else if (permissionResult === 'denied') {
        showToast('Notification permission blocked. Please enable it in site settings.', 'warning');
      }
    } catch (error) {
      console.error('[FCM] Error enabling notifications:', error);
      showToast(`Notification error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, supported, getOrRegisterServiceWorker, saveTokenToBackend]);

  // 7. User Trigger: Disable Notifications
  const disableNotifications = useCallback(async () => {
    if (loading || !supported) return;

    setLoading(true);
    try {
      const messaging = messagingRef.current;
      const currentToken = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (currentToken) {
        await unsubscribeTokenFromBackend(currentToken);
        if (messaging) {
          await deleteToken(messaging).catch((err) => console.warn('[FCM] Token deletion warning:', err.message));
        }
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(LAST_SYNC_KEY);
        setEnabled(false);
      }
      showToast('Notifications disabled.', 'info');
    } catch (error) {
      console.error('[FCM] Error disabling notifications:', error);
      showToast(`Error disabling notifications: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, supported, unsubscribeTokenFromBackend]);

  // Sync token whenever permission is granted and component is ready
  useEffect(() => {
    if (permission === 'granted' && supported) {
      refreshAndSyncToken();
    }
  }, [permission, supported, refreshAndSyncToken]);

  // Initialize status from local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(TOKEN_STORAGE_KEY)) {
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