import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

if (!googleClientId) {
  console.error("🚨 CRITICAL ERROR: REACT_APP_GOOGLE_CLIENT_ID is missing from .env file!");
}

// Root element ko select karein
const rootElement = document.getElementById('root');

// Root create karein
const root = ReactDOM.createRoot(rootElement);

// App ko render karein
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
