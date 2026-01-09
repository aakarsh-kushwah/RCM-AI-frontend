import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import './Login.css';

// 🔥 CLOUDINARY DIRECT VIDEO URL (Optimized)
const VIDEO_URL = "https://res.cloudinary.com/dhxlwuyjt/video/upload/q_auto/R_C_M_WORLd_BHILWARA_1080P_online-video-cutter.com_1_fay1i8.mp4";

const LoginPage = () => {
    const [credentials, setCredentials] = useState({ loginId: '', password: '' });
    const [status, setStatus] = useState({ loading: false, error: '' });
    const [mounted, setMounted] = useState(false);
    
    const navigate = useNavigate();

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
        if (status.error) setStatus(prev => ({ ...prev, error: '' }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        
        if (!credentials.loginId || !credentials.password) {
            setStatus({ loading: false, error: 'Please enter details.' });
            return;
        }

        setStatus({ loading: true, error: '' });
        const controller = new AbortController();

        try {
            const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, ''); 
            const response = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    loginId: credentials.loginId.trim(),
                    password: credentials.password
                }),
                signal: controller.signal
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || 'Access Denied');

            if (data && data.token) {
                localStorage.clear();
                localStorage.setItem('token', data.token);
                
                const userObj = {
                    id: data.user.id,
                    email: data.user.email,
                    fullName: data.user.fullName,
                    rcmId: data.user.rcmId || "Not Set",
                    status: data.user.status || 'pending' 
                };

                localStorage.setItem('user', JSON.stringify(userObj));
                localStorage.setItem('userRole', data.user.role || 'USER');

                const target = data.user.role === 'ADMIN' ? '/admin/dashboard' : 
                               userObj.status !== 'active' ? '/payment-setup' : 
                               '/dashboard';
                
                navigate(target, { replace: true });
            } else {
                throw new Error('Invalid Token.');
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                setStatus({ loading: false, error: err.message });
            }
        }
    };

    return (
        <div className="full-screen-layout">
            
            {/* 🎥 BACKGROUND VIDEO (Cloudinary) */}
            <div className="video-wrapper">
                <video 
                    autoPlay 
                    loop 
                    muted 
                    playsInline 
                    className="fullscreen-video"
                >
                    {/* ✅ Cloudinary URL */}
                    <source src={VIDEO_URL} type="video/mp4" />
                    Your browser does not support video.
                </video>
                {/* Dark Overlay for text readability */}
                <div className="dark-overlay"></div>
            </div>

            {/* 💎 INVISIBLE FORM CARD */}
            <div className={`invisible-card ${mounted ? 'card-active' : ''}`}>
                
                <div className="inv-header">
                    <img 
                        src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                        alt="Logo" 
                        className="inv-logo"
                    />
                    <h2>Welcome Back</h2>
                    <p>Enter your credentials to continue</p>
                </div>

                <form onSubmit={handleLogin} className="inv-form">
                    
                    <div className="inv-input-group">
                        <Mail size={20} className="inv-icon" />
                        <input 
                            name="loginId"
                            type="text" 
                            value={credentials.loginId} 
                            onChange={handleInputChange} 
                            placeholder="Email or RCM ID"
                            disabled={status.loading}
                            autoComplete="off"
                        />
                    </div>

                    <div className="inv-input-group">
                        <Lock size={20} className="inv-icon" />
                        <input 
                            name="password"
                            type="password" 
                            value={credentials.password} 
                            onChange={handleInputChange} 
                            placeholder="Password"
                            disabled={status.loading}
                        />
                    </div>

                    <div className="inv-options">
                        <label className="checkbox-style">
                            <input type="checkbox" /> <span>Remember me</span>
                        </label>
                        <span className="link-hover">Forgot Password?</span>
                    </div>

                    {status.error && (
                        <div className="inv-error">
                            {status.error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        className={`inv-btn ${status.loading ? 'loading-state' : ''}`}
                        disabled={status.loading}
                    >
                        {status.loading ? <Loader2 className="spinner" size={22} /> : (
                            <>Login <ArrowRight size={20} /></>
                        )}
                    </button>

                </form>

                <div className="inv-footer">
                    New here? <span onClick={() => navigate('/register')}>Create Account</span>
                </div>

                <div className="inv-badge">
                    <ShieldCheck size={12} /> Secure Connection
                </div>

            </div>
        </div>
    );
};

export default LoginPage;