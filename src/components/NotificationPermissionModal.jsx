import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import usePushNotification from '../hooks/usePushNotification';
import './NotificationPermissionModal.css'; // Assuming a CSS file for styles

const NotificationPermissionModal = ({ isOpen, onClose }) => {
  const { enable, supported, permission, loading } = usePushNotification();
  const modalRef = useRef(null);
  const initialFocusRef = useRef(null);

  const handleEnable = async () => {
    await enable();
    sessionStorage.setItem('notification_permission_modal_dismissed', 'true');
    onClose();
  };

  const handleNotNow = () => {
    sessionStorage.setItem('notification_permission_modal_dismissed', 'true');
    onClose();
  };

  const handleEscape = useCallback((event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Focus trap logic
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      initialFocusRef.current = focusableElements?.[0];
      initialFocusRef.current?.focus();
    } else {
      document.removeEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  // Don't show modal if not supported or permission already granted/denied
  if (!supported || permission !== 'default') {
    return null;
  }

  return createPortal(
    <div className="notification-modal-overlay" onClick={handleNotNow}>
      <div
        className="notification-modal-card"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-modal-title"
        onClick={(e) => e.stopPropagation()} // Prevent click through to overlay
      >
        <h2 id="notification-modal-title" className="modal-title">
          <img src="/rcmai_logo.png" alt="RCM AI Logo" className="modal-logo" />
          Stay Connected with RCM-AI
        </h2>
        <p className="modal-description">
          Enable notifications to get important updates, announcements, and personalized content delivered directly to you.
          Never miss out on what matters!
        </p>
        <div className="modal-actions">
          <button
            ref={initialFocusRef}
            className="enable-button"
            onClick={handleEnable}
            disabled={loading}
          >
            {loading ? 'Enabling...' : 'Enable Notifications'}
          </button>
          <button className="not-now-button" onClick={handleNotNow} disabled={loading}>
            Not Now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NotificationPermissionModal;
