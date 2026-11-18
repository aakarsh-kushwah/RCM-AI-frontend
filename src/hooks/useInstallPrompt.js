import { useState, useEffect, useCallback } from 'react';

const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__pwaPrompt || null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  useEffect(() => {
    if (window.__pwaPrompt && !deferredPrompt) {
      setDeferredPrompt(window.__pwaPrompt);
    }

    const handler = (e) => {
      e.preventDefault();
      window.__pwaPrompt = e;
      setDeferredPrompt(e);
    };

    const readyHandler = () => {
      if (window.__pwaPrompt) {
        setDeferredPrompt(window.__pwaPrompt);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('td-pwa-ready', readyHandler);

    // Check if the app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsAppInstalled(true);
    }

    const appInstalledHandler = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
      window.__pwaPrompt = null;
    };
    window.addEventListener('appinstalled', appInstalledHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('td-pwa-ready', readyHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, [deferredPrompt]);

  const promptInstall = useCallback(async () => {
    const promptToUse = deferredPrompt || window.__pwaPrompt;
    if (promptToUse) {
      try {
        promptToUse.prompt();
        const { outcome } = await promptToUse.userChoice;
        if (outcome === 'accepted') {
          setIsAppInstalled(true);
        }
      } catch (err) {
        console.error('Error prompting install:', err);
      }
      setDeferredPrompt(null);
      window.__pwaPrompt = null;
    }
  }, [deferredPrompt]);

  return { deferredPrompt: deferredPrompt || window.__pwaPrompt, isAppInstalled, promptInstall };
};

export default useInstallPrompt;