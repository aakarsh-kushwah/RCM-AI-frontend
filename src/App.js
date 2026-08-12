/**
 * @file App.js
 * @description Root Component - Claude.ai style Google-first onboarding & routing + Professional Push Notification UX.
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Bell, X } from 'lucide-react';

// ==========================================
// 🎨 GLOBAL UI COMPONENTS
// ==========================================
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import InstallAppModal from './components/InstallAppModal.jsx';

// ==========================================
// 🔐 SECURITY & LOGIC
// ==========================================
import UserProtectedRoute from './components/UserProtectedRoute';
import { useAuth } from './context/AuthContext';
import usePushNotification from './hooks/usePushNotification';
import ScrollToTop from './utils/ScrollToTop';

// ==========================================
// ⚡ PERFORMANCE: LAZY LOADING PAGES
// ==========================================
const PaymentPage = lazy(() => import('./components/PaymentPage/PaymentPage'));
const SubscriptionRequired = lazy(() => import('./components/SubscriptionRequired/SubscriptionRequired'));
const UserDashboard = lazy(() => import('./components/UserDashboard/UserDashboard'));
const Productsvideo = lazy(() => import('./components/Productsvideo/Productsvideo'));
const LeadersVideo = lazy(() => import('./components/LeadersVideo/LeadersVideo'));
const ChatWindow = lazy(() => import('./components/chatbot/ChatWindow'));
const VoiceCallPage = lazy(() => import('./components/chatbot/VoiceCall'));
const DailyReport = lazy(() => import('./components/DailyReport/DailyReport'));

// ==========================================
// 🌐 CLAUDE.AI STYLE PUBLIC / PREVIEW HOME (ROOT '/')
// ==========================================
const HomeLandingRoute = () => {
    const { user, login, API_URL, loading } = useAuth();
    const [error, setError] = useState('');

    if (loading) {
        return <LoadingSpinner message="Checking session..." />;
    }

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const response = await fetch(`${API_URL || 'http://localhost:10000'}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: credentialResponse.credential })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Google Auth Failed');
            if (data.success && data.accessToken) {
                login(data.user, data.accessToken);
            }
        } catch (err) {
            setError(err.message || 'Google login failed.');
        }
    };

    if (user) {
        return <UserDashboard />;
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            background: '#121212',
            color: '#fff',
            fontFamily: 'Inter, sans-serif'
        }}>
            <div style={{
                background: '#1e1e1e',
                padding: '2.5rem',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                maxWidth: '400px',
                width: '90%'
            }}>
                <img 
                    src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                    alt="RCM AI" 
                    style={{ height: '48px', width: '48px', objectFit: 'contain', marginBottom: '1.5rem' }}
                />
                <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>RCM AI Platform</h1>
                <p style={{ fontSize: '0.95rem', color: '#a0a0a0', marginBottom: '2rem' }}>Sign in to access your enterprise dashboard and AI tools.</p>
                
                {error && <div style={{ color: '#ff4d4f', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</div>}

                <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError('Google Sign-In unsuccessful.')}
                    theme="filled_black"
                    shape="pill"
                    size="large"
                    text="continue_with"
                />
            </div>
        </div>
    );
};

// ==========================================
// 🔒 SUBSCRIPTION PROTECTION HOC
// ==========================================
const RequireSubscription = ({ children }) => {
    const { user, loading } = useAuth();
    const isApproved = user?.isApproved;

    if (loading) {
        return <LoadingSpinner message="Checking Subscription Status..." />;
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (!isApproved) {
        return <Navigate to="/subscription-required" replace />;
    }

    return children;
};

// ==========================================
// 📞 MEETING ROOM WRAPPER
// ==========================================
const MeetingRoomRoute = ({ showInstallAppModal, setShowInstallAppModal }) => {
    const { roomId } = useParams();

    if (showInstallAppModal) {
        return (
            <InstallAppModal
                isOpen={showInstallAppModal}
                onClose={() => setShowInstallAppModal(false)}
            />
        );
    }

    return (
        <RequireSubscription>
            <div>You are approved and joining meeting: {roomId}</div>
        </RequireSubscription>
    );
};

// ==========================================
// 🚀 MAIN APPLICATION COMPONENT
// ==========================================
function App() {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [showInstallAppModal, setShowInstallAppModal] = useState(false);
    const location = useLocation();
    const { user } = useAuth();

    const {
        showNotificationPrompt,
        handleEnableNotifications,
        handleDismissNotifications
    } = usePushNotification();

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

    useEffect(() => {
        const isMeetingPath = location.pathname.startsWith('/meeting');
        if (isMeetingPath && !user) {
            setShowInstallAppModal(true);
        } else {
            setShowInstallAppModal(false);
        }
    }, [location.pathname, user]);

    return (
        <>
            <ScrollToTop />
            {isOffline && (
                <LoadingSpinner
                    message="Connection Severed. Retrying..."
                    type="offline"
                />
            )}

            {/* 🔔 PROFESSIONAL PUSH NOTIFICATION MODAL (Post-Google Login UX) */}
            {showNotificationPrompt && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 9999,
                    background: '#1f1f1f',
                    color: '#fff',
                    padding: '20px',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    maxWidth: '360px',
                    animation: 'slideUp 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ background: '#0071e3', padding: '8px', borderRadius: '8px', display: 'flex' }}>
                                <Bell size={20} color="#fff" />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Stay Updated</h4>
                        </div>
                        <button 
                            onClick={handleDismissNotifications}
                            style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '0' }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#b0b0b0', lineHeight: '1.4' }}>
                        Enable notifications to stay updated on RCM AI meetings, announcements, and AI summaries.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                            onClick={handleEnableNotifications}
                            style={{
                                flex: 1,
                                background: '#0071e3',
                                color: '#fff',
                                border: 'none',
                                padding: '10px',
                                borderRadius: '6px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Enable
                        </button>
                        <button 
                            onClick={handleDismissNotifications}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                color: '#aaa',
                                border: '1px solid rgba(255,255,255,0.2)',
                                padding: '10px',
                                borderRadius: '6px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Not Now
                        </button>
                    </div>
                </div>
            )}

            <Suspense fallback={<LoadingSpinner message="Loading Neural Interface..." />}>
                <Routes>
                    {/* 🌍 PUBLIC / CLAUDE.AI ROOT ROUTE */}
                    <Route path="/" element={<HomeLandingRoute />} />
                    <Route path="/payment-setup" element={<PaymentPage />} />
                    <Route path="/subscription-required" element={<SubscriptionRequired />} />

                    {/* 📞 DYNAMIC CONFERENCE PATH - INTERCEPTED */}
                    <Route
                        path="/meeting/:roomId"
                        element={
                            <MeetingRoomRoute
                                showInstallAppModal={showInstallAppModal}
                                setShowInstallAppModal={setShowInstallAppModal}
                            />
                        }
                    />

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

                    {/* 🤖 AI ASSISTANT ROUTES */}
                    <Route path="/chat" element={
                        <UserProtectedRoute><ChatWindow /></UserProtectedRoute>
                    } />

                    <Route path="/voice-call" element={
                        <UserProtectedRoute><VoiceCallPage /></UserProtectedRoute>
                    } />

                    {/* ⚠️ 404 HANDLER */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </>
    );
}

export default App;
