// src/hooks/usePushNotification.js
import { useState, useEffect } from 'react';
import { requestForToken, onMessageListener } from '../firebase';

const usePushNotification = () => {
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  useEffect(() => {
    const authToken = localStorage.getItem('token');
    const promptShown = localStorage.getItem('notificationPromptShown');

    // Fire polite prompt once after successful login if not already shown/responded
    if (authToken && !promptShown) {
      const timer = setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 1500); // 1.5s delay after login for smooth UX
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // Foreground listener (When app is open)
    onMessageListener().then((payload) => {
      if (payload?.notification) {
        console.log("Foreground notification received:", payload);
      }
    }).catch(err => console.log("Failed to listen foreground notifications", err));
  }, []);

  const handleEnableNotifications = async () => {
    localStorage.setItem('notificationPromptShown', 'true');
    setShowNotificationPrompt(false);

    try {
      const token = await requestForToken();
      const authToken = localStorage.getItem('token');

      if (token && authToken) {
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:10000';
        await fetch(`${API_URL}/api/notifications/save-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ token })
        });
        console.log("✅ Device registered for push notifications successfully");
      }
    } catch (e) {
      console.error("❌ Failed to save push notification token", e);
    }
  };

  const handleDismissNotifications = () => {
    localStorage.setItem('notificationPromptShown', 'true');
    setShowNotificationPrompt(false);
  };

  return {
    showNotificationPrompt,
    handleEnableNotifications,
    handleDismissNotifications
  };
};

export default usePushNotification;
