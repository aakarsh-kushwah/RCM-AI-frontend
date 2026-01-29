/**
 * @file App.js
 * @description Root Component - The Brain of the Application.
 * @architecture Scalable Single Page Application (SPA)
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// ==========================================
// 🎨 GLOBAL UI COMPONENTS
// ==========================================
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import SplashScreen from './components/SplashScreen/SplashScreen';

// ==========================================
// 🔐 SECURITY & LOGIC
// ==========================================
import UserProtectedRoute from './components/UserProtectedRoute';
import usePushNotification from './hooks/usePushNotification';

// ==========================================
// ⚡ PERFORMANCE: LAZY LOADING PAGES
// ==========================================

// --- Public Access ---
const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginPage = lazy(() => import('./components/login/LoginPage'));
const RegisterPage = lazy(() => import('./components/RegisterPage/RegisterPage'));
const PaymentPage = lazy(() => import('./components/PaymentPage/PaymentPage'));

// --- Secured User Access ---
const UserDashboard = lazy(() => import('./components/UserDashboard/UserDashboard'));
const Productsvideo = lazy(() => import('./components/Productsvideo/Productsvideo'));
const LeadersVideo = lazy(() => import('./components/LeadersVideo/LeadersVideo'));
const ChatWindow = lazy(() => import('./components/chatbot/ChatWindow'));
const VoiceCallPage = lazy(() => import('./components/chatbot/VoiceCall')); // 🆕 NEW SEPARATE COMPONENT
const DailyReport = lazy(() => import('./components/DailyReport/DailyReport'));

// ==========================================
// 🛠️ UTILITY: SCROLL TO TOP
// ==========================================
const ScrollToTop = () => {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
};

// ==========================================
// 🚀 MAIN APPLICATION COMPONENT
// ==========================================
function App() {
    const [showSplash, setShowSplash] = useState(true);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    usePushNotification();

    useEffect(() => {
        const handleOffline = () => setIsOffline(true);
        const handleOnline = () => setIsOffline(false);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    if (showSplash) {
        return <SplashScreen onComplete={() => setShowSplash(false)} />;
    }

    return (
        <>
            <ScrollToTop />
            {isOffline && (
                <LoadingSpinner 
                    message="Connection Severed. Retrying..." 
                    type="offline" 
                />
            )}

            <Suspense fallback={<LoadingSpinner message="Loading Neural Interface..." />}>
                <Routes>
                    {/* 🌍 PUBLIC ROUTES */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/payment-setup" element={<PaymentPage />} />

                    {/* 🔒 PROTECTED ROUTES */}
                    <Route path="/dashboard" element={
                        <UserProtectedRoute><UserDashboard /></UserProtectedRoute>
                    } />

                    <Route path="/daily-report" element={
                        <UserProtectedRoute><DailyReport /></UserProtectedRoute>
                    } />
                    
                    <Route path="/leaders-videos" element={
                        <UserProtectedRoute><LeadersVideo pageTitle="Leaders' Videos" /></UserProtectedRoute>
                    } />

                    <Route path="/products-videos" element={
                        <UserProtectedRoute><Productsvideo pageTitle="Products' Videos" /></UserProtectedRoute>
                    } />
                    
                    {/* 🤖 AI ASSISTANT ROUTES (Separated) */}
                    <Route path="/chat" element={
                        <UserProtectedRoute><ChatWindow /></UserProtectedRoute>
                    } />

                    {/* 🆕 Dedicated Voice Call Route */}
                    <Route path="/voice-call" element={
                        <UserProtectedRoute><VoiceCallPage /></UserProtectedRoute>
                    } />

                    {/* ⚠️ 404 HANDLER */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </Suspense>
        </>
    );
}

export default App;