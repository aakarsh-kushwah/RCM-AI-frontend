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
// ✅ Dono video components ko alag-alag import karein
const Productsvideo = lazy(() => import('./components/Productsvideo')); 
const LeadersVideo = lazy(() => import('./components/LeadersVideo')); // ✅ Naya component import
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
                
                {/* ✅ Leaders Video route wapas add kiya gaya hai */}
                <Route 
                    path="/leaders-videos" 
                    element={
                        <UserProtectedRoute>
                            <LeadersVideo pageTitle="Leaders' Videos" />
                        </UserProtectedRoute>
                    } 
                />

                <Route 
                    path="/products-videos" 
                    element={
                        <UserProtectedRoute>
                            <Productsvideo pageTitle="Products' Videos" />
                        </UserProtectedRoute>
                    } 
                />
                
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