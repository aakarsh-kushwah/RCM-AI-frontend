import React from 'react';
import { Routes, Route } from 'react-router-dom';

// --- User Component Imports ---
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import UserDashboard from './components/UserDashboard';
import LeadersVideosPage from './components/LeadersVideosPage';
import ProductsVideosPage from './components/ProductsVideosPage';
import UserProtectedRoute from './components/UserProtectedRoute'; // User Protection

function App() {
  return (
    <Routes>
      
      {/* 1. PUBLIC ROUTES */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {/* 2. USER PROTECTED ROUTES */}
      <Route path="/dashboard" element={<UserProtectedRoute><UserDashboard /></UserProtectedRoute>} />
      <Route path="/leaders-videos" element={<UserProtectedRoute><LeadersVideosPage /></UserProtectedRoute>} />
      <Route path="/products-videos" element={<UserProtectedRoute><ProductsVideosPage /></UserProtectedRoute>} />

      {/* 3. FALLBACK ROUTE */}
      <Route path="*" element={<h1>404: Page Not Found</h1>} />
    </Routes>
  );
}

export default App;