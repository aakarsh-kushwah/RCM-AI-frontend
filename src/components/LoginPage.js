import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // 'Link' हटा दिया गया है
import './Login.css'; // इस CSS फ़ाइल का उपयोग किया जा रहा है

const LoginPage = () => {
    const [loginId, setLoginId] = useState(''); 
    const [password, setPassword] = useState('');
    const [error, setError] = useState(''); 
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); 
        
        // Vercel/Render पर सेट किए गए एनवायरनमेंट वेरिएबल का उपयोग करता है
        const apiUrl = `${process.env.REACT_APP_API_URL}/api/auth/login`; 

        try {
            const response = await fetch(apiUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginId, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // यूज़र का टोकन और रोल स्टोर करता है
                localStorage.setItem('token', data.token);
                localStorage.setItem('userRole', data.user.role); 
                
                console.log('Login successful:', data);
                // यूज़र को उसके डैशबोर्ड पर रीडायरेक्ट करता है
                navigate('/dashboard'); 
            } else {
                setError(data.message || 'Login failed. Check your ID/Email and password.');
            }
        } catch (error) {
            console.error('Login error:', error);
            if (error instanceof TypeError && error.message === "Failed to fetch") {
                 setError('A network error occurred. Check if the backend is running.');
            } else {
                 setError(error.message);
            }
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" className="auth-logo" />
                <h2>User Login</h2> {/* टाइटल अपडेट किया गया */}
                
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

                    <button type="submit" className="auth-button">Log In</button>
                </form>


            </div>
        </div>
    );
};
export default LoginPage;

