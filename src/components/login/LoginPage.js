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
                    
                    // --- YAHAN UPDATE KIYA GAYA HAI ---
                    // 1. चेक करें कि 'data.user' ऑब्जेक्ट मौजूद है
                    if (data.user) {
                        // 2. पूरे 'data.user' ऑब्जेक्ट को JSON string बनाकर सेव करें
                        //    Dashboard इसी 'userData' को ढूंढेगा
                        localStorage.setItem('userData', JSON.stringify(data.user));
                        
                        // 3. 'userRole' को भी 'data.user' से ही सेट करें
                        localStorage.setItem('userRole', data.user.role || 'user');
                        if (!data.user.role) {
                            console.warn('User role not found in response, setting default');
                        }
                    } else {
                        // अगर 'data.user' नहीं मिला तो डिफ़ॉल्ट सेट करें
                        console.warn('User object not found in response, setting defaults');
                        localStorage.setItem('userRole', 'user');
                        localStorage.removeItem('userData'); // पुराना डेटा हटा दें
                    }
                    // --- UPDATE YAHAN KHATAM HUA ---
                    
                    console.log('Login successful, token and user data saved.');
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
                        <label htmlFor="password">Password</label>                        <input
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