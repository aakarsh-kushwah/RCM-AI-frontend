import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Bot, Zap, Video, Star, TrendingUp, LogOut, 
  LayoutDashboard, ChevronRight, UserCircle, Bell, Settings 
} from 'lucide-react'; 
import './UserDashboard.css'; 

const UserDashboard = () => {
    const [scrolled, setScrolled] = useState(false);
    const navigate = useNavigate(); 
    const location = useLocation();

    // --- Optimization: Memoize User Data ---
    const userData = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch (e) { return {}; }
    }, []);

    const userName = userData.fullName || 'User';
    const rcmId = userData.rcmId || 'Not Linked';

    // --- Performance: Scroll Listener (Throttled effect via CSS transition) ---
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleLogout = () => {
        // Clear critical auth tokens
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login', { replace: true });
    };

    // --- Components ---
    
    // 1. Desktop Sidebar Item
    const SidebarItem = ({ icon, label, path }) => {
        const isActive = location.pathname === path || (path === '/dashboard' && location.pathname === '/');
        return (
            <div 
                className={`sidebar-item ${isActive ? 'active' : ''}`} 
                onClick={() => navigate(path)}
                role="button"
                tabIndex={0}
            >
                <div className="icon-box">{icon}</div>
                <span className="label">{label}</span>
                {isActive && <div className="active-glow" />}
            </div>
        );
    };

    // 2. Mobile Bottom Nav Item
    const BottomNavItem = ({ icon, label, path }) => {
        const isActive = location.pathname === path;
        return (
            <div 
                className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => navigate(path)}
            >
                <div className="nav-icon">{icon}</div>
                <span className="nav-label">{label}</span>
            </div>
        );
    };

    // 3. Feature Card (Optimized)
    const FeatureCard = ({ title, subtitle, icon, color, onClick }) => (
        <div 
            className="feature-card" 
            style={{ '--accent-color': color }}
            onClick={onClick}
        >
            <div className="card-bg-glow" />
            <div className="card-content-wrapper">
                <div className="card-header">
                    <div className="card-icon-wrapper">{icon}</div>
                    <div className="arrow-icon"><ChevronRight size={18} /></div>
                </div>
                <div className="card-text">
                    <h3>{title}</h3>
                    <p>{subtitle}</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="app-container">
            
            {/* --- DESKTOP SIDEBAR (Hidden on Mobile) --- */}
            <aside className="sidebar-desktop">
                <div className="sidebar-header">
                    <div className="brand-logo">
                        <Bot className="brand-icon" size={28} />
                        <span className="brand-name">RCM<span className="highlight">.AI</span></span>
                    </div>
                </div>

                <div className="user-profile-widget">
                    <div className="avatar-ring">
                        <div className="avatar">{userName.charAt(0).toUpperCase()}</div>
                    </div>
                    <div className="user-info">
                        <p className="welcome-text">Welcome back,</p>
                        <h4 className="name-text">{userName.split(' ')[0]}</h4>
                    </div>
                </div>

                <nav className="sidebar-menu">
                    <SidebarItem icon={<LayoutDashboard size={20} />} label="Overview" path="/dashboard" />
                    <SidebarItem icon={<Zap size={20} />} label="AI Assistant" path="/chat" />
                    <SidebarItem icon={<TrendingUp size={20} />} label="Analytics" path="/daily-report" />
                    <SidebarItem icon={<Video size={20} />} label="Training" path="/leaders-videos" />
                </nav>

                <div className="sidebar-footer">
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={18} /> <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* --- MAIN CONTENT AREA --- */}
            <main className="main-viewport">
                
                {/* Header (Adaptive) */}
                <header className={`app-header ${scrolled ? 'glass-mode' : ''}`}>
                    <div className="header-mobile-brand">
                        <Bot className="brand-icon" size={24} />
                        <span>RCM.AI</span>
                    </div>
                    
                    <div className="header-actions">
                        <div className="rcm-id-badge">
                            <UserCircle size={16} />
                            <span>{rcmId}</span>
                        </div>
                        <button className="icon-btn"><Bell size={20} /></button>
                    </div>
                </header>

                <div className="scrollable-content">
                    {/* Hero Banner */}
                    <div className="hero-banner" onClick={() => navigate('/chat')}>
                        <div className="hero-content">
                            <div className="hero-badge">
                                <Zap size={12} fill="currentColor" /> <span>AI 2.0 Live</span>
                            </div>
                            <h1>RCM Intelligence</h1>
                            <p>Instant answers for business growth.</p>
                            <button className="hero-btn">Launch AI <ChevronRight size={16} /></button>
                        </div>
                        <div className="hero-visual">
                            <Bot className="floating-bot" size={120} />
                            <div className="glow-effect"></div>
                        </div>
                    </div>

                    {/* Stats & Tools Grid */}
                    <h2 className="section-title">Quick Actions</h2>
                    <div className="dashboard-grid">
                        <FeatureCard 
                            title="Daily Report"
                            subtitle="Track PV & Consistency"
                            icon={<TrendingUp size={24} />}
                            color="#00f2fe"
                            onClick={() => navigate('/daily-report')}
                        />
                        <FeatureCard 
                            title="Leaders' Zone"
                            subtitle="Premium Video Training"
                            icon={<Video size={24} />}
                            color="#fe8c00"
                            onClick={() => navigate('/leaders-videos')}
                        />
                        <FeatureCard 
                            title="Product Hub"
                            subtitle="Catalog & Guides"
                            icon={<Star size={24} />}
                            color="#4facfe"
                            onClick={() => navigate('/products-videos')}
                        />
                    </div>
                    
                    {/* Padding for Bottom Nav */}
                    <div className="bottom-spacer"></div>
                </div>
            </main>

            {/* --- MOBILE BOTTOM NAVIGATION (Hidden on Desktop) --- */}
            <nav className="bottom-nav-mobile">
                <BottomNavItem icon={<LayoutDashboard size={22} />} label="Home" path="/dashboard" />
                <BottomNavItem icon={<Zap size={22} />} label="AI Chat" path="/chat" />
                <BottomNavItem icon={<TrendingUp size={22} />} label="Stats" path="/daily-report" />
                <BottomNavItem icon={<Settings size={22} />} label="Menu" path="/menu" />
            </nav>

        </div>
    );
};

export default UserDashboard;