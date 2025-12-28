import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

/**
 * Enterprise-Grade Login Component
 * Updated to save rcmId and handle Subscription Status redirection.
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
        
        // Basic Validation
        if (!credentials.loginId || !credentials.password) {
            setStatus({ loading: false, error: 'Please enter both User ID and Password.' });
            return;
        }

        setStatus({ loading: true, error: '' });
        const controller = new AbortController();
        const signal = controller.signal;

        try {
            const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, ''); 
            const response = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    loginId: credentials.loginId.trim(),
                    password: credentials.password
                }),
                signal
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Authentication failed.');
            }

            if (data && data.token) {
                // 1. Clear old session
                localStorage.clear();

                // 2. Set new session
                localStorage.setItem('token', data.token);
                
                // 3. ✅ SAVE USER DATA (Fixed to include RCM ID)
                // We map all fields that UserDashboard expects.
                const userObj = {
                    id: data.user.id,
                    email: data.user.email,
                    fullName: data.user.fullName || data.user.full_name,
                    phone: data.user.phone || "",
                    rcmId: data.user.rcmId || data.user.rcm_id || "Not Set", // 👈 ADDED THIS
                    status: data.user.status || 'pending' 
                };

                localStorage.setItem('user', JSON.stringify(userObj));
                localStorage.setItem('userRole', data.user.role || 'USER');

                // 4. ✅ SMART REDIRECT LOGIC
                // If they are an ADMIN, go to Admin Dashboard
                if (data.user.role === 'ADMIN') {
                     navigate('/admin/dashboard', { replace: true });
                } 
                // If they are a USER but NOT ACTIVE, go to Payment
                else if (userObj.status !== 'active') {
                     navigate('/payment-setup', { replace: true });
                } 
                // If Active User, go to Dashboard
                else {
                     navigate('/dashboard', { replace: true });
                }

            } else {
                throw new Error('Server response missing token.');
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                setStatus({ loading: false, error: err.message });
            }
        } finally {
            if (!signal.aborted && status.error) setStatus(prev => ({ ...prev, loading: false }));
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
                        onError={(e) => e.target.style.display = 'none'} 
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