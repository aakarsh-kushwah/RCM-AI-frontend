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
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          rcmId,
          email,
          phone,
          password,
          role: 'USER',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.token) {
          localStorage.setItem('token', data.token);
        }

        // ✅ FIX: Added 'phone' here so PaymentPage can find it later
        localStorage.setItem(
          'user',
          JSON.stringify({
            id: data.userId || data.user?.id,
            email,
            fullName,
            phone, // <--- IMPORTANT ADDITION
          })
        );

        setSuccess('Registration successful! Redirecting to payment setup...');
        setTimeout(() => navigate('/payment-setup'), 2000);
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
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full Name" required />
          <input type="text" value={rcmId} onChange={(e) => setRcmId(e.target.value)} placeholder="RCM ID" required />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" required />
          {/* Ensure this input type is 'tel' or 'number' */}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
          <button type="submit">Register</button>
        </form>
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}
        <p>Already have an account? <Link to="/login" className="auth-link">Login here</Link></p>
      </div>
    </div>
  );
}

export default RegisterPage;