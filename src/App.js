import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoadingSpinner from './components/LoadingSpinner';

// --- Component Imports ---
import UserProtectedRoute from './components/UserProtectedRoute'; 

// --- Lazy Loading Pages ---

// Public
const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const RegisterPage = lazy(() => import('./components/RegisterPage'));
const PaymentPage = lazy(() => import('./components/PaymentPage'));

// Protected
const UserDashboard = lazy(() => import('./components/UserDashboard'));
const VideoPage = lazy(() => import('./components/VideoPage')); 
const LiveCallUI = lazy(() => import('./components/LiveCallUI')); 
// ✅ 1. ChatWindow ko bhi ek page ki tarah lazy load karein
const ChatWindow = lazy(() => import('./components/ChatWindow'));

function App() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <Routes>
                
                {/* --- PUBLIC ROUTES --- */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/payment-setup" element={<PaymentPage />} />

                
                {/* --- USER PROTECTED ROUTES --- */}
                <Route 
                    path="/dashboard" 
                    element={
                        <UserProtectedRoute>
                            <UserDashboard />
                        </UserProtectedRoute>
                    } 
                />
                
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
                
                <Route 
                    path="/live-call" 
                    element={
                        <UserProtectedRoute>
                            <LiveCallUI />
                        </UserProtectedRoute>
                    } 
                />
                
                {/* ✅ 2. Yahaan naya CHAT route joda gaya hai */}
                <Route 
                    path="/chat" 
                    element={
                        <UserProtectedRoute>
                            <ChatWindow />
                        </UserProtectedRoute>
                    } 
                />

                {/* 3. FALLBACK ROUTE */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </Suspense>
    );
}

export default App;