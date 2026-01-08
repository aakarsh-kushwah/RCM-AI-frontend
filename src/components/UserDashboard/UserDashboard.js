import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Zap, Video, Star, TrendingUp, LogOut, 
  LayoutDashboard, ChevronRight, UserCircle, Bell, Settings, Bot // Bot import kiya gaya hai
} from 'lucide-react'; 
import './UserDashboard.css'; 

const UserDashboard = () => {
    const navigate = useNavigate(); 
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);

    // --- User Data ---
    const userData = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch (e) { return {}; }
    }, []);

    const userName = userData.fullName || 'User';
    const rcmId = userData.rcmId || 'ID-Pending';

    // --- Strict Dark Mode ---
    useEffect(() => {
        document.documentElement.style.setProperty('background-color', '#000000', 'important');
        document.body.style.setProperty('background-color', '#000000', 'important');
        document.body.style.setProperty('color', '#ffffff', 'important');

        const handleScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login', { replace: true });
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    return (
        <div className="ud-wrapper">
            
            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="ud-sidebar">
                <div className="ud-sidebar-header">
                    <div className="ud-logo-container">
                        <img 
                            src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                            alt="RCM Logo" 
                            className="ud-logo-img"
                        />
                        <span className="ud-gemini-text">RCM AI</span>
                    </div>
                </div>

                <div className="ud-profile">
                    <div className="ud-avatar">{userName.charAt(0).toUpperCase()}</div>
                    <div className="ud-profile-info">
                        <p>Welcome,</p>
                        <h4>{userName.split(' ')[0]}</h4>
                    </div>
                </div>

                <nav className="ud-nav">
                    <div className="ud-nav-item active">
                        <LayoutDashboard size={20} /> <span>Dashboard</span>
                    </div>
                    <div className="ud-nav-item" onClick={() => navigate('/chat')}>
                        <Zap size={20} /> <span>AI Assistant</span>
                    </div>
                    <div className="ud-nav-item" onClick={() => navigate('/daily-report')}>
                        <TrendingUp size={20} /> <span>Analytics</span>
                    </div>
                    <div className="ud-nav-item" onClick={() => navigate('/leaders-videos')}>
                        <Video size={20} /> <span>Training</span>
                    </div>
                </nav>

                <div className="ud-footer">
                    <button className="ud-logout-btn" onClick={handleLogout}>
                        <LogOut size={18} /> <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main className="ud-main">
                
                <header className={`ud-header ${scrolled ? 'glass' : ''}`}>
                    <div className="ud-header-left">
                        <div className="ud-mobile-brand">
                            <img 
                                src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                                alt="Logo" 
                                className="ud-mobile-logo-img"
                            />
                            <span className="ud-gemini-text-small">RCM AI</span>
                        </div>
                        
                        <div className="ud-desktop-greet">
                            <h1>{getGreeting()}, {userName.split(' ')[0]}</h1>
                        </div>
                    </div>

                    <div className="ud-header-right">
                        <div className="ud-id-badge">
                            <UserCircle size={16} />
                            <span>{rcmId}</span>
                        </div>
                        <button className="ud-icon-btn">
                            <Bell size={20} />
                            <div className="ud-dot"></div>
                        </button>
                    </div>
                </header>

                <div className="ud-content">
                    {/* 🔥 Updated Hero Section */}
                    <div className="ud-hero" onClick={() => navigate('/chat')}>
                        <div className="ud-hero-text">
                            {/* Badge removed from here */}
                            <h2>Ask RCM Intelligence</h2>
                            <p>Instant strategies for business growth.</p>
                            <button className="ud-hero-cta">
                                Start Chat <ChevronRight size={16} />
                            </button>
                        </div>
                        
                        {/* 🔥 New Dark Corner Logo (Watermark) */}
                        <Bot className="ud-hero-dark-logo" size={180} />
                    </div>

                    {/* Features Grid */}
                    <h3 className="ud-section-title">Quick Access</h3>
                    <div className="ud-grid">
                        <div className="ud-card cyan" onClick={() => navigate('/daily-report')}>
                            <div className="ud-card-top">
                                <div className="ud-icon-box"><TrendingUp size={22} /></div>
                                <ChevronRight className="ud-arrow" size={18} />
                            </div>
                            <div className="ud-card-btm">
                                <h4>Daily Report</h4>
                                <p>Track consistency</p>
                            </div>
                        </div>

                        <div className="ud-card orange" onClick={() => navigate('/leaders-videos')}>
                            <div className="ud-card-top">
                                <div className="ud-icon-box"><Video size={22} /></div>
                                <ChevronRight className="ud-arrow" size={18} />
                            </div>
                            <div className="ud-card-btm">
                                <h4>Leaders' Zone</h4>
                                <p>Premium Training</p>
                            </div>
                        </div>

                        <div className="ud-card blue" onClick={() => navigate('/products-videos')}>
                            <div className="ud-card-top">
                                <div className="ud-icon-box"><Star size={22} /></div>
                                <ChevronRight className="ud-arrow" size={18} />
                            </div>
                            <div className="ud-card-btm">
                                <h4>Product Hub</h4>
                                <p>Catalog & Guides</p>
                            </div>
                        </div>
                    </div>
                    <div className="ud-spacer"></div>
                </div>
            </main>

            {/* --- MOBILE NAV --- */}
            <nav className="ud-mobile-nav">
                <div className="ud-mn-item active" onClick={() => navigate('/dashboard')}>
                    <LayoutDashboard size={22} />
                    <span>Home</span>
                </div>
                <div className="ud-mn-item" onClick={() => navigate('/chat')}>
                    <div className="ud-fab"><Zap size={22} fill="currentColor" /></div>
                    <span className="ud-fab-text">AI Chat</span>
                </div>
                <div className="ud-mn-item" onClick={() => navigate('/daily-report')}>
                    <TrendingUp size={22} />
                    <span>Stats</span>
                </div>
                <div className="ud-mn-item" onClick={() => navigate('/menu')}>
                    <Settings size={22} />
                    <span>Menu</span>
                </div>
            </nav>

        </div>
    );
};

export default UserDashboard;