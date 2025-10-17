import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './UserAuth.css'; 

function RegisterPage() {
    const [fullName, setFullName] = useState('');
    const [rcmId, setRcmId] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            // Register API call (assuming role: 'USER' is passed by default)
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, rcmId, email, phone, password, role: 'USER' }), 
            });
            const data = await response.json();
            
            if (response.ok) {
                setSuccess('Registration successful! Redirecting to login...');
                setTimeout(() => navigate('/login'), 2000);
            } else {
                setError(data.message || 'Registration failed.');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-form-card">
                <h1>Create Your Account</h1>
                <form onSubmit={handleRegister}>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full Name" required /><br />
                    <input type="text" value={rcmId} onChange={(e) => setRcmId(e.target.value)} placeholder="RCM ID" required /><br />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" required /><br />
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" required /><br />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required /><br />
                    <button type="submit">Register</button>
                </form>
                {error && <p className="error-message">{error}</p>}
                {success && <p className="success-message">{success}</p>}
                <p>Already have an account? <Link to="/login">Login here</Link></p>
            </div>
        </div>
    );
}
export default RegisterPage;