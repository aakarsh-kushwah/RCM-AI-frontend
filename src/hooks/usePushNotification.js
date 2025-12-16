// src/hooks/usePushNotification.js
import { useEffect } from 'react';
import { requestForToken, onMessageListener } from '../firebase';

const usePushNotification = () => {
  useEffect(() => {
    const registerToken = async () => {
      const token = await requestForToken();
      const authToken = localStorage.getItem('token'); // Get JWT Token

      if (token && authToken) {
        try {
            // Send to YOUR Backend
            await fetch(`${process.env.REACT_APP_API_URL}/api/notifications/save-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ token })
            });
            console.log("✅ Device registered for notifications");
        } catch(e) {
            console.error("❌ Failed to save token", e);
        }
      }
    };

    registerToken();

    // Foreground listener (When app is open)
    onMessageListener().then((payload) => {
      alert(`📢 ${payload.notification.title}\n${payload.notification.body}`);
    });

  }, []);
};

export default usePushNotification;