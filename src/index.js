// src/index.js या src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext'; // ✅ AuthProvider इंपोर्ट करें

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <BrowserRouter>
            {/* ✅ AuthProvider को App के ऊपर रैप करें */}
            <AuthProvider> 
                <App />
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);