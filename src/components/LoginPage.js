import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // इस CSS फ़ाइल का उपयोग किया जा रहा है

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

            console.log('Server response data:', data); 

            if (response.ok) {
                if (data && data.token && typeof data.token === 'string') {
                    localStorage.setItem('token', data.token);
                    
                    if (data.user && data.user.role) {
                        localStorage.setItem('userRole', data.user.role);
                    } else {
                        console.warn('User role not found in response, setting default');
                        localStorage.setItem('userRole', 'user');
                    }
                    
                    console.log('Login successful, token saved.');
                    navigate('/dashboard');

                } else {
                    console.error('Login successful (200 OK) but no valid token in response:', data);
                    setError('Login failed: Server did not provide a valid token.');
                }

            } else {
                setError(data.message || 'Login failed. Check your ID/Email and password.');
            }
        } catch (error) {
            console.error('Login error:', error);
            if (error instanceof TypeError && error.message === "Failed to fetch") {
                 setError('A network error occurred. Check if the backend is running.');
            } else {
                 setError('An unexpected error occurred. Check console.');
         }
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" className="auth-logo" />
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
                        <label htmlFor="password">Password</label>                      <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                    </div>
                    
                    {error && <p className="error-message">{error}</p>}

                    <button type="submit" className="auth-button">Log In</button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;