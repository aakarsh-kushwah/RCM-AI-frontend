import React from 'react';
import { Routes, Route } from 'react-router-dom';

// --- Component Imports ---
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import UserDashboard from './components/UserDashboard';
import UserProtectedRoute from './components/UserProtectedRoute'; 

// ✅ NEW: सीधे VideoPage को इंपोर्ट करें
import VideoPage from './components/VideoPage'; 

function App() {
    return (
        <Routes>
            
            {/* 1. PUBLIC ROUTES */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            
            {/* 2. USER PROTECTED ROUTES */}
            <Route path="/dashboard" element={<UserProtectedRoute><UserDashboard /></UserProtectedRoute>} />
            
            {/* ✅ UPDATED ROUTES: सीधे VideoPage का उपयोग करें */}
            <Route 
                path="/leaders-videos" 
                element={
                    <UserProtectedRoute>
                        <VideoPage pageTitle="Leaders' Videos" videoType="leaders" />
                    </UserProtectedRoute>
                } 
            />
            <Route 
                path="/products-videos" 
                element={
                    <UserProtectedRoute>
                        <VideoPage pageTitle="Products' Videos" videoType="products" />
                    </UserProtectedRoute>
                } 
            />

            {/* 3. FALLBACK ROUTE */}
            <Route path="*" element={<h1>404: Page Not Found</h1>} />
        </Routes>
    );
}

export default App;