import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';

// --- Component Imports ---
import UserProtectedRoute from './components/UserProtectedRoute'; 

// --- Lazy Loading Pages ---

// Public
const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginPage = lazy(() => import('./components/login/LoginPage'));
const RegisterPage = lazy(() => import('./components/RegisterPage/RegisterPage'));
const PaymentPage = lazy(() => import('./components/PaymentPage/PaymentPage'));

// Protected
const UserDashboard = lazy(() => import('./components/UserDashboard/UserDashboard'));
const Productsvideo = lazy(() => import('./components/Productsvideo/Productsvideo')); 
const LeadersVideo = lazy(() => import('./components/LeadersVideo/LeadersVideo')); 
const ChatWindow = lazy(() => import('./components/chatbot/ChatWindow'));

// ✅ NEW: DailyReport Component Import kiya
const DailyReport = lazy(() => import('./components/DailyReport/DailyReport'));

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

                {/* ✅ NEW: Daily Report Route Add kiya */}
                <Route 
                    path="/daily-report" 
                    element={
                        <UserProtectedRoute>
                            <DailyReport />
                        </UserProtectedRoute>
                    } 
                />
                
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