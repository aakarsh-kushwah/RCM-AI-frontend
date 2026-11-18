import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { initInstallPrompt } from './hooks/useInstallPrompt';
import App from './App';

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

if (!googleClientId) {
  console.error('🚨 CRITICAL ERROR: REACT_APP_GOOGLE_CLIENT_ID is missing from .env file!');
}

/* Start listening for install events before React mounts, so no event is ever missed. */
initInstallPrompt();

/* Service worker: required for the app to be installable.
   Registered in production builds (set REACT_APP_ENABLE_SW=true to test it in dev). */
const swEnabled =
  process.env.NODE_ENV === 'production' || process.env.REACT_APP_ENABLE_SW === 'true';

if (swEnabled && 'serviceWorker' in navigator) {
  const register = () =>
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.log('SW registration failed: ', err);
    });

  // `load` may already have fired by the time this module runs
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

root.render(
  <GoogleOAuthProvider clientId={googleClientId}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </GoogleOAuthProvider>
);