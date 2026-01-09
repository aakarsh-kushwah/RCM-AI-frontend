import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Hash, Mail, Phone, Lock, ArrowRight } from 'lucide-react';
import './RegisterPage.css';

// 🔥 CLOUDINARY DIRECT VIDEO URL (Optimized)
const VIDEO_URL = "https://res.cloudinary.com/dhxlwuyjt/video/upload/q_auto/R_C_M_WORLd_BHILWARA_1080P_online-video-cutter.com_1_fay1i8.mp4";

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    rcmId: '',
    email: '',
    phone: '',
    password: ''
  });
  
  const [status, setStatus] = useState({ loading: false, error: '', success: '' });
  const [mounted, setMounted] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (status.error) setStatus({ ...status, error: '' });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.password || !formData.rcmId) {
       setStatus({ ...status, error: 'All fields are required.' });
       return;
    }
    setStatus({ loading: true, error: '', success: '' });

    try {
      const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, role: 'USER' }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.token) localStorage.setItem('token', data.token);
        const userObj = {
            id: data.userId || data.user?.id,
            email: formData.email,
            fullName: formData.fullName,
            phone: formData.phone,
            rcmId: formData.rcmId,
            status: 'pending'
        };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('userRole', 'USER');
        setStatus({ loading: false, error: '', success: 'Account created! Redirecting...' });
        setTimeout(() => { navigate('/payment-setup', { replace: true }); }, 1500);
      } else {
        setStatus({ loading: false, error: data.message || 'Registration failed.', success: '' });
      }
    } catch (err) {
      setStatus({ loading: false, error: 'Server error.', success: '' });
    }
  };

  return (
    <div className="compact-layout">
        
        {/* 🎥 FIXED VIDEO BACKGROUND */}
        <div className="fixed-video-bg">
            <video autoPlay loop muted playsInline className="bg-video-fill">
                {/* ✅ Cloudinary URL */}
                <source src={VIDEO_URL} type="video/mp4" />
            </video>
            <div className="video-tint"></div>
        </div>

        {/* 💎 GLASS CARD */}
        <div className={`compact-card register-card-height ${mounted ? 'show-card' : ''}`}>
            
            <div className="c-header">
                <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="Logo" className="c-logo" />
                <h3>Create Account</h3>
            </div>

            <form onSubmit={handleRegister} className="c-form">
                
                <div className="c-input-box">
                    <User size={16} className="c-icon" />
                    <input name="fullName" type="text" value={formData.fullName} onChange={handleChange} placeholder="Full Name" disabled={status.loading} />
                </div>
                <div className="c-input-box">
                    <Hash size={16} className="c-icon" />
                    <input name="rcmId" type="text" value={formData.rcmId} onChange={handleChange} placeholder="RCM ID" disabled={status.loading} />
                </div>
                <div className="c-input-box">
                    <Mail size={16} className="c-icon" />
                    <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email" disabled={status.loading} />
                </div>
                <div className="c-input-box">
                    <Phone size={16} className="c-icon" />
                    <input name="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="Phone" disabled={status.loading} />
                </div>
                <div className="c-input-box">
                    <Lock size={16} className="c-icon" />
                    <input name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Password" disabled={status.loading} />
                </div>

                {status.error && <div className="c-error">{status.error}</div>}
                {status.success && <div className="c-success">{status.success}</div>}

                <button type="submit" className={`c-btn ${status.loading ? 'loading' : ''}`} disabled={status.loading}>
                    {status.loading ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
                </button>
            </form>

            <div className="c-footer">
                Already a member? <span onClick={() => navigate('/login')}>Login Here</span>
            </div>
        </div>
    </div>
  );
}

export default RegisterPage;