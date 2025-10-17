import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './UserAuth.css'; 

function LoginPage() {
    const [loginId, setLoginId] = useState(''); 
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginId, password }), 
            });
            
            const data = await response.json();

            if (response.ok && data.token) {
                // ✅ Store standardized token and user data
                localStorage.setItem('token', data.token); 
                localStorage.setItem('userRole', data.user.role);
                localStorage.setItem('userData', JSON.stringify(data.user));
                
                navigate('/dashboard');
            } else {
                setError(data.message || 'Login failed. Check your RCM ID/Email and password.');
            }
        } catch (err) {
            setError('An error occurred. Check server connection.');
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-form-card">
                <h1>Welcome Back</h1>
                <form onSubmit={handleLogin}>
                    <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="RCM ID / Email" required /><br />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required /><br />
                    <button type="submit">Login</button>
                </form>
                {error && <p className="error-message">{error}</p>}
                <p>Don't have an account? <Link to="/register">Register here</Link></p>
                {/* Agar Admin portal alag hai, toh yahan Admin link nahi hoga */}
            </div>
        </div>
    );
}
export default LoginPage;