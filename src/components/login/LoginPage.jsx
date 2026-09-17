/**
 * @file LoginPage.jsx
 * @description Dedicated login page component for Google OAuth authentication.
 *              Fixed Rules of Hooks violation by placing all hooks before early returns.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import './LoginPage.css';

const LoginPage = () => {
    // 1. ALL HOOKS CALLED AT THE TOP LEVEL (Zero conditional execution)
    const { user, login, API_URL, loading } = useAuth();
    const [error, setError] = useState('');
    const navigate = useNavigate();

    // 2. useEffect hook for authentication redirect
    useEffect(() => {
        if (user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, navigate]);

    // 3. Conditional returns AFTER all hooks have been invoked
    if (loading) {
        return <LoadingSpinner message="Checking session..." />;
    }

    if (user) {
        return null;
    }

    /**
     * Handles the success callback from the Google Login component.
     * Sends the Google credential ID token to the backend using axios with withCredentials: true
     * to ensure the httpOnly refresh-token cookie is properly stored by the browser.
     * On success, stores the user/token in context and navigates to the dashboard.
     */
    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const response = await axios.post(
                `${API_URL || 'http://localhost:10000'}/api/auth/google`,
                { credential: credentialResponse.credential },
                { withCredentials: true }
            );
            const data = response.data;
            if (data.success && data.accessToken) {
                // Store user and token in AuthContext (which also persists to localStorage)
                login(data.user, data.accessToken);
                // Programmatically navigate to the dashboard, replacing the current history entry
                // so the user cannot "go back" to the login screen.
                navigate('/dashboard', { replace: true });
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Google login failed.';
            setError(errorMessage);
        }
    };

    return (
        <div className="rcmlp-page">
            <div className="rcmlp-field" aria-hidden="true">
                <div className="rcmlp-glow" />
            </div>

            <div className="rcmlp-card">
                <span className="rcmlp-logo-badge">
                    <img
                        src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png"
                        alt="RCM AI"
                        className="rcmlp-logo"
                    />
                </span>
                <h1 className="rcmlp-title">RCM AI Platform</h1>
                <p className="rcmlp-subtitle">Sign in to access your enterprise dashboard and AI tools.</p>

                {error && <div className="rcmlp-error" role="alert">{error}</div>}

                <div className="rcmlp-google-btn">
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError('Google Sign-In unsuccessful.')}
                        theme="outline"
                        shape="pill"
                        size="large"
                        text="continue_with"
                        auto_select={false}
                    />
                </div>

                <p className="rcmlp-fineprint">
                    <ShieldCheck size={13} strokeWidth={2} />
                    Protected by enterprise-grade encryption
                </p>
            </div>
        </div>
    );
};

export default LoginPage;