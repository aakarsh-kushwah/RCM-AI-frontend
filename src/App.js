/**
 * @file App.js
 * @description Root Component - The Brain of the Application.
 * @architecture Scalable Single Page Application (SPA)
 * @features Lazy Loading, Network Detection, Smart Splash Screen, Push Notifications
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// ==========================================
// 🎨 GLOBAL UI COMPONENTS
// ==========================================
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner'; // Next-Gen Loader
import SplashScreen from './components/SplashScreen/SplashScreen';     // App-Like Entry

// ==========================================
// 🔐 SECURITY & LOGIC
// ==========================================
import UserProtectedRoute from './components/UserProtectedRoute';
import usePushNotification from './hooks/usePushNotification';

// ==========================================
// ⚡ PERFORMANCE: LAZY LOADING PAGES
// (Code split hone se app fast load hoti hai)
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
const DailyReport = lazy(() => import('./components/DailyReport/DailyReport'));

// ==========================================
// 🛠️ UTILITY: SCROLL TO TOP
// (Page change hone par scroll top par le jaye)
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
    // --- 1. STATE MANAGEMENT ---
    const [showSplash, setShowSplash] = useState(true); // Splash Screen Control
    const [isOffline, setIsOffline] = useState(!navigator.onLine); // Network Monitor

    // --- 2. HOOKS INITIALIZATION ---
    usePushNotification(); // Initialize Notification Service

    // --- 3. EFFECTS: NETWORK MONITORING ---
    useEffect(() => {
        const handleOffline = () => setIsOffline(true);
        const handleOnline = () => setIsOffline(false);

        // Listeners add karein
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        // Cleanup (Memory Leak Prevention)
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    // --- 4. RENDER PHASE: SPLASH SCREEN ---
    // Jab tak app fully ready nahi hoti, Splash Screen dikhayein
    if (showSplash) {
        return <SplashScreen onComplete={() => setShowSplash(false)} />;
    }

    return (
        <>
            {/* Utility to handle scroll behavior */}
            <ScrollToTop />

            {/* --- 🔴 CRITICAL: OFFLINE MODE --- */}
            {/* Agar internet chala jaye, to Red Alert Spinner dikhayein */}
            {isOffline && (
                <LoadingSpinner 
                    message="Connection Severed. Retrying..." 
                    type="offline" 
                />
            )}

            {/* --- 🔵 MAIN APP CONTENT --- */}
            {/* Suspense ensure karta hai ki heavy pages load hote waqt UI freeze na ho */}
            <Suspense fallback={<LoadingSpinner message="Loading Neural Interface..." />}>
                <Routes>
                    
                    {/* =========================================
                        🌍 PUBLIC ROUTES
                       ========================================= */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/payment-setup" element={<PaymentPage />} />

                    
                    {/* =========================================
                        🔒 PROTECTED ROUTES (High Security)
                       ========================================= */}
                    
                    {/* Dashboard */}
                    <Route 
                        path="/dashboard" 
                        element={
                            <UserProtectedRoute>
                                <UserDashboard />
                            </UserProtectedRoute>
                        } 
                    />

                    {/* Analytics */}
                    <Route 
                        path="/daily-report" 
                        element={
                            <UserProtectedRoute>
                                <DailyReport />
                            </UserProtectedRoute>
                        } 
                    />
                    
                    {/* Academy: Leaders */}
                    <Route 
                        path="/leaders-videos" 
                        element={
                            <UserProtectedRoute>
                                <LeadersVideo pageTitle="Leaders' Videos" />
                            </UserProtectedRoute>
                        } 
                    />

                    {/* Academy: Products */}
                    <Route 
                        path="/products-videos" 
                        element={
                            <UserProtectedRoute>
                                <Productsvideo pageTitle="Products' Videos" />
                            </UserProtectedRoute>
                        } 
                    />
                    
                    {/* AI Assistant */}
                    <Route 
                        path="/chat" 
                        element={
                            <UserProtectedRoute>
                                <ChatWindow />
                            </UserProtectedRoute>
                        } 
                    />

                    {/* =========================================
                        ⚠️ ERROR HANDLING (404)
                       ========================================= */}
                    {/* Unknown paths ko dashboard par redirect karein */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />

                </Routes>
            </Suspense>
        </>
    );
}

export default App;