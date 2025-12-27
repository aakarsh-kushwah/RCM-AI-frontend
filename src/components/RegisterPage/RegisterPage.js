import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './RegisterPage.css'; 

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
      // Robust URL handling
      const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
      
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          rcmId,
          email,
          phone,
          password,
          role: 'USER', // Default role
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // 1. Save Token
        if (data.token) {
          localStorage.setItem('token', data.token);
        }

        // 2. ✅ SAVE USER DATA CORRECTLY
        // We explicitly set 'status' to 'pending' because a new user hasn't paid yet.
        // We also save 'phone' so the Payment Page can pre-fill it.
        const userObj = {
            id: data.userId || data.user?.id,
            email: email,
            fullName: fullName,
            phone: phone,       // Important for Razorpay
            status: 'pending'   // Important for UserProtectedRoute
        };

        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('userRole', 'USER');

        // 3. Redirect to Payment
        setSuccess('Registration successful! Redirecting to payment setup...');
        
        // Short delay to show success message, then move to payment
        setTimeout(() => {
            navigate('/payment-setup', { replace: true });
        }, 1500);

      } else {
        setError(data.message || 'Registration failed.');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-form-card">
        <h1>Create Your Account</h1>
        
        <form onSubmit={handleRegister}>
          <div className="input-group">
            <input 
                type="text" 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)} 
                placeholder="Full Name" 
                required 
            />
          </div>

          <div className="input-group">
            <input 
                type="text" 
                value={rcmId} 
                onChange={(e) => setRcmId(e.target.value)} 
                placeholder="RCM ID" 
                required 
            />
          </div>

          <div className="input-group">
            <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Email Address" 
                required 
            />
          </div>

          <div className="input-group">
            <input 
                type="tel" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="Phone Number" 
                required 
            />
          </div>

          <div className="input-group">
            <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Password" 
                required 
            />
          </div>

          <button type="submit" className="auth-button">Register</button>
        </form>

        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <p className="auth-footer">
            Already have an account? <Link to="/login" className="auth-link">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;