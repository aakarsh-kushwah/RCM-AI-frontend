/**
 * @file App.js
 * @description Root Component - Handles routing, protected routes, and global UX
 *              (offline status, push notification prompts, install app modal).
 *              The login flow has been refactored into a dedicated /login route.
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Bell, X } from 'lucide-react';

// ==========================================
// 🎨 GLOBAL UI COMPONENTS
// ==========================================
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import InstallAppModal from './components/InstallAppModal.jsx';
import RootRedirector from './components/RootRedirector';
import LoginPage from './components/login/LoginPage';

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
const ChannelVideos = lazy(() => import('./components/Channels/ChannelVideos'));
const ChatWindow = lazy(() => import('./components/chatbot/ChatWindow'));
const VoiceCallPage = lazy(() => import('./components/chatbot/VoiceCall'));
const DailyReport = lazy(() => import('./components/DailyReport/DailyReport'));

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
        return <Navigate to="/login" replace />;
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
                    {/* 🌍 ROOT ROUTE - Redirects based on auth status */}
                    <Route path="/" element={<RootRedirector />} />

                    {/* 🔐 LOGIN ROUTE - Public route for unauthenticated users */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* 💳 PUBLIC PAGES */}
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

                    <Route path="/channels-videos" element={
                        <UserProtectedRoute><ChannelVideos pageTitle="Official Channels Videos" /></UserProtectedRoute>
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
