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

            console.log("Login response:", data);

            if (response.ok) {
                if (data && data.token) {
                    // Save token
                    localStorage.setItem('token', data.token);

                    // Save user — SAME KEY AS REGISTER PAGE
                    if (data.user) {
                        const userObj = {
                            id: data.user.id,
                            email: data.user.email,
                            fullName: data.user.fullName || data.user.full_name,
                            phone: data.user.phone || "",
                        };

                        localStorage.setItem('user', JSON.stringify(userObj));

                        localStorage.setItem('userRole', data.user.role || 'USER');
                    } else {
                        console.warn("User data missing from backend");
                    }

                    console.log("Login successful → redirecting");
                    navigate('/dashboard');
                } else {
                    setError("Login failed: Token missing in server response.");
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
                <img
                    src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png"
                    alt="RCM AI Logo"
                    className="auth-logo"
                />
                <h2>User Login</h2>

                <form onSubmit={handleLogin}>
                    <div className="input-group">
                        <label htmlFor="loginId">RCM ID / Email</label>
                        <input
                            id="loginId"
                            type="text"
                            value={loginId}
                            onChange={(e) => setLoginId(e.target.value)}
                            placeholder="Enter your ID or Email"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    {error && <p className="error-message">{error}</p>}

                    <button type="submit" className="auth-button">
                        Log In
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
