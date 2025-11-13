import React, { useState, useEffect } from 'react'; // ❌ 'useRef' yahan se hata diya gaya hai
import { useNavigate } from 'react-router-dom';
import { Menu, X, Bot, Zap, Video, Star } from 'lucide-react'; // ❌ 'Camera' hata diya gaya hai
import './UserDashboard.css'; 

// =================================================================================
// ❌ VIDEO PLAYER COMPONENTS YAHAN SE HATA DIYE GAYE HAIN
// (Yeh code 'Productsvideo.jsx' aur 'LeadersVideo.jsx' files mein rahega)
// =================================================================================


// =================================================================================
// ❌ Profile Pic Modal Component YAHAN SE HATA DIYA GAYA HAI
// =================================================================================


// =================================================================================
// ⭐️ MUKHYA DASHBOARD COMPONENT (Updated)
// =================================================================================

const LoggedOutMessage = () => (
    <div className="logged-out-container">
        <h2 className="logged-out-title">Logged Out Successfully</h2>
        <p className="logged-out-subtitle">Thank you for using RCM AI. Please log in again to access your dashboard.</p>
        <p className="logged-out-note">Login page redirect is handled by routing.</p>
    </div>
);

function UserDashboard() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoggedOut, setIsLoggedOut] = useState(false);
    
    const navigate = useNavigate(); 
    // ❌ fileInputRef (useRef) hata diya gaya hai

    // ❌ Profile Pic States hata diye gaye hain
    const [userData, setUserData] = useState(() => JSON.parse(localStorage.getItem('userData')) || {});
    
    const userName = userData.fullName || 'RCM User';
    const userEmail = userData.email || 'No Email Provided';
    const rcmId = userData.rcmId || 'Not Set';

    useEffect(() => {
        const savedUserData = JSON.parse(localStorage.getItem('userData')) || {};
        setUserData(savedUserData); 
    }, []); 

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userData');
        setIsLoggedOut(true);
    };

    // ❌ Sabhi Profile Pic Handlers hata diye gaye hain

    const DashboardCard = ({ title, description, icon, cta, onClick, cardId }) => {
        return (
            <div onClick={onClick} className={`dashboard-card-wrapper ${cardId || ''}`}>
                <div className="dashboard-card-content">
                    <div className="dashboard-card-header">
                        {icon}
                        <span className="ai-ready-badge">
                            <Zap className="icon-xxs" />
                            AI Ready
                        </span>
                    </div>
                    <h3 className="dashboard-card-title">{title}</h3>
                    <p className="dashboard-card-description">{description}</p>
                    {cta && <span className="dashboard-card-cta">{cta} &rarr;</span>}
                </div>
            </div>
        );
    };

    if (isLoggedOut) {
        // Asli redirect ab ProtectedRoute handle karega
        return <LoggedOutMessage />; 
    }

    return (
        <>
            {/* ❌ Input aur Modal JSX hata diya gaya hai */}

            <div className="dashboard-container">
                {isSidebarOpen && (
                    <div
                        className="sidebar-overlay"
                        onClick={() => setIsSidebarOpen(false)}
                    ></div>
                )}

                <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
                    <div className="sidebar-content">
                        <div className="sidebar-header">
                            <h2 className="sidebar-logo">RCM AI</h2>
                            <button
                                className="sidebar-close-btn"
                                onClick={() => setIsSidebarOpen(false)}
                                aria-label="Close Sidebar"
                            >
                                <X className="icon-small" />
                            </button>
                        </div>
                        
                        <div className="user-profile">
                            {/* ❌ Pic Container Hata Diya Gaya Hai */}
                            <div className="user-profile-details">
                                <h4 className="user-profile-name">{userName}</h4>
                                <p className="user-profile-email">{userEmail}</p>
                                <p className="user-profile-id">ID: {rcmId}</p>
                            </div>
                        </div>

                    </div>

                    <div className="sidebar-footer">
                        <button onClick={handleLogout} className="logout-button">
                            Logout
                        </button>
                    </div>
                </aside>

                <div className="main-content">
                    
                    <header className="main-header">
                        <div className="main-header-left">
                            <button
                                className="mobile-menu-btn"
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Open Menu"
                            >
                                <Menu className="icon-small" />
                            </button>
                            <div className="header-logo">
                                <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" />
                            </div>
                            <div className="header-title-wrapper">
                                <h1 className="main-header-title gemini-text-gradient">
                                    RCM AI Hub
                                </h1>
                                <p className="main-header-tagline">Your Business, Amplified</p>
                            </div>
                        </div>
                        <div className="main-header-right"></div>
                    </header>
                    
                    <main className="dashboard-main">
                        <div className="dashboard-grid">
                            <div
                                className="ai-assistant-card-wrapper"
                                onClick={() => navigate('/chat')} 
                            >
                                <div className="ai-assistant-card-content">
                                    <div className="ai-assistant-card-header">
                                        <Bot className="icon-medium-white" />
                                        <span className="ai-assistant-card-badge">SMART TOOL</span>
                                    </div>
                                    <h3 className="ai-assistant-card-title">AI ASSISTANT</h3>
                                    <p className="ai-assistant-card-description">
                                        Instant answers and expert guidance tailored for your business needs.
                                    </p>
                                    <div className="ai-assistant-card-footer">
                                        <span className="ai-assistant-card-cta">
                                            Launch &rarr;
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <DashboardCard
                                cardId="leaders-card"
                                title="Leaders' Videos"
                                description="In-depth training and inspiring talks from our top-performing business leaders."
                                icon={<Video className="icon-medium-orange" />}
                                cta="Watch Training"
                                onClick={() => navigate('/leaders-videos')}
                            />

                            <DashboardCard
                                cardId="products-card"
                                title="Products' Videos"
                                description="Comprehensive video guides to help you understand and explain RCM's product range."
                                icon={<Star className="icon-medium-green" />}
                                cta="Explore Products"
                                onClick={() => navigate('/products-videos')}
                            />
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}

export default UserDashboard;