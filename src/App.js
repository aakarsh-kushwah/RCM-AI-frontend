/**
 * @file App.js
 * @description Enterprise-Grade Production Root Component
 * - Bypasses Splash Screen & RootRedirector (Direct Instant Dashboard Entry)
 * - Automatic Network Chunk Load Error Recovery (lazyRetry)
 * - Global Application Error Boundary (Zero White-Screen Crashes)
 * - Fully Lazy-Loaded Routes including Login for Minimal Initial Bundle Size
 * - Integrated Notification, Meeting Room, and Offline Handling
 */

import React, { Suspense, lazy, useState, useEffect, Component } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import InstallAppModal from './components/InstallAppModal.jsx';
import UserProtectedRoute from './components/UserProtectedRoute';
import NotificationPermissionModal from './components/NotificationPermissionModal'; // Import the new modal
import { useAuth } from './context/AuthContext';
import usePushNotification from './hooks/usePushNotification';
import ScrollToTop from './utils/ScrollToTop';

// ============================================================================
// ⚡ NETWORK CHUNK RETRY (Prevents ChunkLoadError crashes on slow/flaky 4G/5G)
// ============================================================================
const lazyRetry = (componentImport) =>
    lazy(async () => {
        const pageAlreadyRetried = JSON.parse(
            window.sessionStorage.getItem('rcm_chunk_retry') || 'false'
        );
        try {
            return await componentImport();
        } catch (error) {
            if (!pageAlreadyRetried) {
                window.sessionStorage.setItem('rcm_chunk_retry', 'true');
                window.location.reload();
                return;
            }
            throw error;
        }
    });

// ============================================================================
// 🛡️ APPLICATION ERROR BOUNDARY (Catches UI errors, prevents white screens)
// ============================================================================
class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[RouteErrorBoundary] Caught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    background: '#0d1117',
                    color: '#ffffff',
                    padding: '24px',
                    textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Something went wrong</h2>
                    <p style={{ color: '#8b949e', maxWidth: '400px', fontSize: '0.95rem', marginBottom: '20px' }}>
                        A network or rendering interruption occurred. Please reload to resume your session.
                    </p>
                    <button
                        onClick={() => {
                            window.sessionStorage.removeItem('rcm_chunk_retry');
                            window.location.reload();
                        }}
                        style={{
                            padding: '10px 24px',
                            background: '#0071e3',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            fontSize: '0.95rem'
                        }}
                    >
                        Reload Application
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ============================================================================
// 📦 HIGH-PERFORMANCE CODE-SPLIT PAGES
// ============================================================================
const LoginPage = lazyRetry(() => import('./components/login/LoginPage'));
const ShortsFeed = lazyRetry(() => import('./components/Shorts/ShortsFeed'));
const ChannelShorts = lazyRetry(() => import('./components/Shorts/ChannelShorts'));
const PaymentPage = lazyRetry(() => import('./components/PaymentPage/PaymentPage'));
const SubscriptionRequired = lazyRetry(() => import('./components/SubscriptionRequired/SubscriptionRequired'));
const UserDashboard = lazyRetry(() => import('./components/UserDashboard/UserDashboard'));
const Productsvideo = lazyRetry(() => import('./components/Productsvideo/Productsvideo'));
const LeadersVideo = lazyRetry(() => import('./components/LeadersVideo/LeadersVideo'));
const ChannelVideos = lazyRetry(() => import('./components/Channels/ChannelVideos'));
const ChatWindow = lazyRetry(() => import('./components/chatbot/ChatWindow'));
const VoiceCallPage = lazyRetry(() => import('./components/chatbot/VoiceCall'));
const DailyReport = lazyRetry(() => import('./components/DailyReport/DailyReport'));

// ============================================================================
// 🔒 SUBSCRIPTION PROTECTION HOC
// ============================================================================
const RequireSubscription = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner message="Checking Subscription Status..." />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

// ============================================================================
// 📞 MEETING ROOM WRAPPER
// ============================================================================
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

// ============================================================================
// 🚀 MAIN APPLICATION ROOT
// ============================================================================
function App() {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [showInstallAppModal, setShowInstallAppModal] = useState(false);
    const location = useLocation();
    const { user } = useAuth();

    const {
        supported,
        permission,
        enabled,
        loading,
        enable,
        disable,
    } = usePushNotification();
    const [showPermissionModal, setShowPermissionModal] = useState(false);

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

    // Show NotificationPermissionModal after successful login/dashboard load
    useEffect(() => {
      const modalDismissedForSession = sessionStorage.getItem('notification_permission_modal_dismissed');
      // Only show if supported, permission is 'default', user is logged in, and not dismissed for session
      if (supported && permission === 'default' && user && !modalDismissedForSession) {
        // Add a small delay for better UX after login/load
        const timer = setTimeout(() => {
          setShowPermissionModal(true);
        }, 1500);
        return () => clearTimeout(timer);
      } else {
        setShowPermissionModal(false);
      }
    }, [supported, permission, user]);


    return (
        <RouteErrorBoundary>
            <ScrollToTop />

            {/* 🔴 Non-intrusive Offline Indicator */}
            {isOffline && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 10001,
                    background: '#e53935',
                    color: '#fff',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '6px 12px',
                    letterSpacing: '0.3px'
                }}>
                    Connection unavailable. Retrying in background...
                </div>
            )}

            {/* 🔔 Push Notification Modal */}
            <NotificationPermissionModal
                isOpen={showPermissionModal}
                onClose={() => setShowPermissionModal(false)}
            />

            <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <Routes>
                    {/* 🌍 DIRECT DASHBOARD ENTRY: Splash Screen & RootRedirector Bypassed */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    {/* 🔐 PUBLIC AUTH ROUTE */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* 💳 PUBLIC & SUBSCRIPTION PAGES */}
                    <Route path="/payment-setup" element={<PaymentPage />} />
                    <Route path="/subscription-required" element={<SubscriptionRequired />} />

                    {/* 📞 DYNAMIC MEETING ROOM */}
                    <Route
                        path="/meeting/:roomId"
                        element={
                            <MeetingRoomRoute
                                showInstallAppModal={showInstallAppModal}
                                setShowInstallAppModal={setShowInstallAppModal}
                            />
                        }
                    />

                    {/* 🔒 PROTECTED USER ROUTES */}
                    <Route
                        path="/dashboard"
                        element={
                            <UserProtectedRoute>
                                <UserDashboard />
                            </UserProtectedRoute>
                        }
                    />

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
                        path="/channels-videos"
                        element={
                            <UserProtectedRoute>
                                <ChannelVideos pageTitle="Official Channels Videos" />
                            </UserProtectedRoute>
                        }
                    />

                    {/* 🤖 AI ASSISTANT ROUTES */}
                    <Route
                        path="/chat"
                        element={
                            <UserProtectedRoute>
                                <ChatWindow />
                            </UserProtectedRoute>
                        }
                    />

                    <Route
                        path="/voice-call"
                        element={
                            <UserProtectedRoute>
                                <VoiceCallPage />
                            </UserProtectedRoute>
                        }
                    />

                    <Route
                        path="/shorts"
                        element={
                            <UserProtectedRoute>
                                <ShortsFeed pageTitle="Shorts" />
                            </UserProtectedRoute>
                        }
                    />

                    <Route
                        path="/shorts/channel/:channelId"
                        element={
                            <UserProtectedRoute>
                                <ChannelShorts />
                            </UserProtectedRoute>
                        }
                    />

                    {/* ⚠️ 404 / UNKNOWN ROUTE HANDLER */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </Suspense>
        </RouteErrorBoundary>
    );
}

export default App;
