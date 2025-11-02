import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoadingSpinner from './components/LoadingSpinner'; // ✅ एक लोडिंग कंपोनेंट

// --- Component Imports ---
import UserProtectedRoute from './components/UserProtectedRoute'; 

// ✅ LAZY LOADING: कंपोनेंट्स को तभी इंपोर्ट करें जब उनकी ज़रूरत हो
// इससे आपका ऐप "Production Ready" और बहुत तेज़ हो जाता है

// पब्लिक पेज
const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const RegisterPage = lazy(() => import('./components/RegisterPage'));
const PaymentPage = lazy(() => import('./components/PaymentPage'));

// प्रोटेक्टेड पेज
const UserDashboard = lazy(() => import('./components/UserDashboard'));
const VideoPage = lazy(() => import('./components/VideoPage')); 

function App() {
    return (
        // ✅ Suspense: जब तक पेज लोड हो रहा है, यह लोडिंग स्पिनर दिखाएगा
        <Suspense fallback={<LoadingSpinner />}>
            <Routes>
                
                {/* 1. PUBLIC ROUTES */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/payment-setup" element={<PaymentPage />} />

                
                {/* 2. USER PROTECTED ROUTES */}
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

                {/* 3. FALLBACK ROUTE */}
                {/* 404: Page Not Found - यूज़र को वापस डैशबोर्ड पर भेजें */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </Suspense>
    );
}

export default App;
