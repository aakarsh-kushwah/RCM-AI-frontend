import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

/**
 * Enterprise-Grade Login Component
 * * Features:
 * - Request Cancellation (AbortController)
 * - Loading State Management
 * - Comprehensive Error Handling
 * - Accessibility (ARIA)
 * - Secure Storage Handling
 */
const LoginPage = () => {
    // State Management
    const [credentials, setCredentials] = useState({ loginId: '', password: '' });
    const [status, setStatus] = useState({ loading: false, error: '' });
    
    const navigate = useNavigate();

    // Reset error on input change for better UX
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
        if (status.error) setStatus(prev => ({ ...prev, error: '' }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        // 1. Basic Validation
        if (!credentials.loginId || !credentials.password) {
            setStatus({ loading: false, error: 'Please enter both User ID and Password.' });
            return;
        }

        // 2. Set Loading State
        setStatus({ loading: true, error: '' });
        
        // 3. Setup AbortController for cleanup
        const controller = new AbortController();
        const signal = controller.signal;

        try {
            // robust URL construction
            const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, ''); 
            const apiUrl = `${baseUrl}/api/auth/login`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    loginId: credentials.loginId.trim(),
                    password: credentials.password
                }),
                signal // Attach signal
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Authentication failed. Please check your credentials.');
            }

            // 4. Successful Login & Data Integrity Check
            if (data && data.token) {
                // Clear existing artifacts first
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('userRole');

                // Persist new session
                localStorage.setItem('token', data.token);

                if (data.user) {
                    const userObj = {
                        id: data.user.id,
                        email: data.user.email,
                        // Nullish coalescing for safety
                        fullName: data.user.fullName || data.user.full_name || 'User',
                        phone: data.user.phone || "", 
                    };

                    localStorage.setItem('user', JSON.stringify(userObj));
                    localStorage.setItem('userRole', data.user.role || 'USER');
                }

                // 5. Navigation
                navigate('/dashboard', { replace: true });
            } else {
                throw new Error('Server response missing authentication token.');
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Login Failure:", err);
                setStatus({ 
                    loading: false, 
                    error: err.message || "Network error. Please try again later." 
                });
            }
        } finally {
            // Only turn off loading if we haven't navigated away (handled implicitly by unmount)
            if (!signal.aborted) {
                // We don't set loading false here because if successful, we navigate away.
                // If failed, we set loading false in the catch block or here.
                 if (status.error) setStatus(prev => ({ ...prev, loading: false }));
            }
        }
        
        return () => controller.abort();
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <img 
                        src="/rcmai_logo.png" 
                        alt="RCM AI Logo" 
                        className="auth-logo" 
                        onError={(e) => e.target.style.display = 'none'} // Graceful fallback
                    />
                    <h2>Welcome Back</h2>
                    <p className="auth-subtitle">Sign in to your dashboard</p>
                </div>

                <form onSubmit={handleLogin} className="auth-form">
                    <div className="input-group">
                        <label htmlFor="loginId">RCM ID / Email</label>
                        <input 
                            id="loginId"
                            name="loginId"
                            type="text" 
                            value={credentials.loginId} 
                            onChange={handleInputChange} 
                            placeholder="Enter your ID or Email"
                            disabled={status.loading}
                            autoComplete="username"
                            required 
                        />
                    </div>
                    
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input 
                            id="password"
                            name="password"
                            type="password" 
                            value={credentials.password} 
                            onChange={handleInputChange} 
                            placeholder="Enter your password"
                            disabled={status.loading}
                            autoComplete="current-password"
                            required 
                        />
                    </div>

                    {/* Accessibility-friendly error message */}
                    {status.error && (
                        <div className="error-message" role="alert" aria-live="polite">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                            {status.error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        className={`auth-button ${status.loading ? 'loading' : ''}`}
                        disabled={status.loading}
                    >
                        {status.loading ? (
                            <span className="spinner"></span>
                        ) : (
                            'Log In'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;