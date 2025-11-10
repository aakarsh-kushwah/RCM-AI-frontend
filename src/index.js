import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';

// Root element ko select karein
const rootElement = document.getElementById('root');

// Root create karein
const root = ReactDOM.createRoot(rootElement);

// App ko render karein
root.render(
  <React.StrictMode>
    {/* BrowserRouter poore app ko wrap karega taaki routing har jagah kaam kare */}
    <BrowserRouter>
      {/* AuthProvider app ko wrap karega taaki user auth state har jagah available ho */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);