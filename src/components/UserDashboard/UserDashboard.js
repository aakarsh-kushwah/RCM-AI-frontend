import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Zap, Video, Star, TrendingUp, LogOut, 
  LayoutDashboard, ChevronRight, Bell, Settings, Sparkles, Search 
} from 'lucide-react'; 
import './UserDashboard.css'; 

const UserDashboard = () => {
    const navigate = useNavigate(); 
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);

    const userData = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch (e) { return {}; }
    }, []);

    const userName = userData.fullName || 'Creator';
    const userRole = userData.role || 'Partner';

    useEffect(() => {
        document.documentElement.style.setProperty('background-color', '#0e121e', 'important');
        document.body.style.setProperty('background-color', '#0e121e', 'important');
        
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
        <div className="g-layout">
            
            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="g-sidebar">
                <div className="g-logo-box">
                    <img 
                        src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                        alt="Logo" 
                        className="g-logo-img"
                    />
                    <span className="g-brand-text">RCM <span className="g-gradient-text">AI</span></span>
                </div>

                <div className="g-user-card">
                    <div className="g-avatar">{userName.charAt(0).toUpperCase()}</div>
                    <div className="g-user-meta">
                        <span className="g-user-role">{userRole}</span>
                        <span className="g-user-name">{userName.split(' ')[0]}</span>
                    </div>
                </div>

                <nav className="g-nav">
                    <div className={`g-nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`} onClick={() => navigate('/dashboard')}>
                        <LayoutDashboard size={20} /> <span>Overview</span>
                    </div>
                    <div className={`g-nav-item ${location.pathname === '/chat' ? 'active' : ''}`} onClick={() => navigate('/chat')}>
                        <Zap size={20} /> <span>Gemini Chat</span>
                    </div>
                    <div className={`g-nav-item ${location.pathname === '/daily-report' ? 'active' : ''}`} onClick={() => navigate('/daily-report')}>
                        <TrendingUp size={20} /> <span>Analytics</span>
                    </div>
                    <div className={`g-nav-item ${location.pathname === '/leaders-videos' ? 'active' : ''}`} onClick={() => navigate('/leaders-videos')}>
                        <Video size={20} /> <span>Academy</span>
                    </div>
                </nav>

                <div className="g-footer">
                    <button className="g-logout" onClick={handleLogout}>
                        <LogOut size={18} /> <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main className="g-main">
                
                {/* Header */}
                <header className={`g-header ${scrolled ? 'glass' : ''}`}>
                    <div className="g-header-left">
                        {/* Mobile Logo (Bada kar diya gaya hai CSS me) */}
                        <div className="g-mobile-brand">
                            <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="Logo" />
                            <span className="g-gradient-text">RCM.AI</span>
                        </div>
                        <div className="g-desktop-search">
                            <Search size={16} className="search-icon" />
                            <input type="text" placeholder="Search training, reports..." />
                        </div>
                    </div>

                    <div className="g-header-right">
                        <div className="g-status">
                            <span className="g-dot"></span> Online
                        </div>
                        <button className="g-icon-btn">
                            <Bell size={20} />
                            <span className="g-badge"></span>
                        </button>
                    </div>
                </header>

                <div className="g-content">
                    
                    {/* Hero Section */}
                    <section className="g-hero" onClick={() => navigate('/chat')}>
                        <div className="g-hero-glow"></div>
                        <div className="g-hero-inner">
                            <div className="g-pill">
                                <Sparkles size={14} className="spin" /> 
                                <span>Gemini Engine Active</span>
                            </div>
                            <h1>{getGreeting()}, <br /><span className="g-gradient-text">{userName.split(' ')[0]}</span></h1>
                            <p>Unlock insights about your business growth.</p>
                            
                            <div className="g-fake-input">
                                <span>Ask about RCM plans or products...</span>
                                <div className="g-send-btn"><Sparkles size={16} /></div>
                            </div>
                        </div>
                    </section>

                    {/* Cards */}
                    <h3 className="g-section-title">Your Dashboard</h3>
                    <div className="g-grid">
                        <div className="g-card" onClick={() => navigate('/daily-report')}>
                            <div className="g-card-icon cyan"><TrendingUp size={24} /></div>
                            <div className="g-card-text">
                                <h4>Analytics</h4>
                                <p>Track PV & Growth</p>
                            </div>
                            <ChevronRight className="g-arrow" />
                        </div>

                        <div className="g-card" onClick={() => navigate('/leaders-videos')}>
                            <div className="g-card-icon orange"><Video size={24} /></div>
                            <div className="g-card-text">
                                <h4>Academy</h4>
                                <p>Leader Training</p>
                            </div>
                            <ChevronRight className="g-arrow" />
                        </div>

                        <div className="g-card" onClick={() => navigate('/products-videos')}>
                            <div className="g-card-icon purple"><Star size={24} /></div>
                            <div className="g-card-text">
                                <h4>Products</h4>
                                <p>Visual Catalog</p>
                            </div>
                            <ChevronRight className="g-arrow" />
                        </div>
                    </div>
                    
                    <div className="g-spacer"></div>
                </div>
            </main>

            {/* --- UPDATED MOBILE DOCK (No Blue Button) --- */}
            <nav className="g-dock">
                <div className={`dock-item ${location.pathname === '/dashboard' ? 'active' : ''}`} onClick={() => navigate('/dashboard')}>
                    <LayoutDashboard size={24} />
                </div>
                
                {/* Chat Icon Added Normally */}
                <div className={`dock-item ${location.pathname === '/chat' ? 'active' : ''}`} onClick={() => navigate('/chat')}>
                    <Zap size={24} />
                </div>

                <div className={`dock-item ${location.pathname === '/daily-report' ? 'active' : ''}`} onClick={() => navigate('/daily-report')}>
                    <TrendingUp size={24} />
                </div>

                <div className={`dock-item ${location.pathname === '/leaders-videos' ? 'active' : ''}`} onClick={() => navigate('/leaders-videos')}>
                    <Video size={24} />
                </div>
                
                <div className={`dock-item ${location.pathname === '/menu' ? 'active' : ''}`} onClick={() => navigate('/menu')}>
                    <Settings size={24} />
                </div>
            </nav>

        </div>
    );
};

export default UserDashboard;