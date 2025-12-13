import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const LoginPage = () => {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        const apiUrl = `${process.env.REACT_APP_API_URL}/api/auth/login`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginId, password }),
            });

            const data = await response.json();

            if (response.ok) {
                if (data && data.token) {
                    localStorage.setItem('token', data.token);

                    if (data.user) {
                        const userObj = {
                            id: data.user.id,
                            email: data.user.email,
                            fullName: data.user.fullName || data.user.full_name,
                            phone: data.user.phone || "", // ✅ Ensures phone is saved
                        };

                        localStorage.setItem('user', JSON.stringify(userObj));
                        localStorage.setItem('userRole', data.user.role || 'USER');
                    }
                    navigate('/dashboard');
                } else {
                    setError("Login failed: Token missing.");
                }
            } else {
                setError(data.message || "Invalid login credentials.");
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("Network error. Please check your server.");
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <img src="/rcmai_logo.png" alt="RCM Logo" className="auth-logo" />
                <h2>User Login</h2>
                <form onSubmit={handleLogin}>
                    <div className="input-group">
                        <label>RCM ID / Email</label>
                        <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} required />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="auth-button">Log In</button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;