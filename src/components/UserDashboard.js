import React, { useState, useEffect, useRef } from 'react';
// ❌ 'axios' hata diya gaya hai (is file mein zaroorat nahin)
// ✅ 'useAuth' hata diya gaya hai (kyonki token/API_URL ki zaroorat nahin)
import { useNavigate } from 'react-router-dom';
import { Menu, X, Bot, Zap, Video, Star, Camera } from 'lucide-react';
import './UserDashboard.css'; 

// =================================================================================
// ❌ VIDEO PLAYER COMPONENTS YAHAN SE HATA DIYE GAYE HAIN
// (Yeh code 'Productsvideo.jsx' aur 'LeadersVideo.jsx' files mein rahega)
// =================================================================================


// =================================================================================
// ⭐️ NAYA: Profile Pic Modal Component
// (Is component mein koi badlaav nahin hai)
// =================================================================================
const ProfileModal = ({ 
    isOpen, 
    onClose, 
    onSave, 
    currentPic, 
    newPicPreview,
    onUploadClick,
    isSaving // ✅ 'isSaving' ko props se le rahe hain
}) => {
    if (!isOpen) return null;

    return (
        <div className="profile-modal-backdrop" onClick={onClose}>
            <div className="profile-modal-content" onClick={e => e.stopPropagation()}>
                <h3 className="profile-modal-title">Profile Picture</h3>
                
                <div className="profile-modal-image-wrapper">
                    <img 
                        src={newPicPreview || currentPic} 
                        alt="Profile Preview" 
                        className="profile-modal-image"
                    />
                </div>

                <div className="profile-modal-actions">
                    <button 
                        className="profile-modal-btn primary"
                        onClick={onUploadClick}
                        disabled={isSaving}
                    >
                        Upload New Photo
                    </button>
                    <button 
                        className="profile-modal-btn secondary"
                        onClick={onSave}
                        disabled={!newPicPreview || isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button 
                        className="profile-modal-btn tertiary"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};


// =================================================================================
// ⭐️ MUKHYA DASHBOARD COMPONENT (Updated)
// =================================================================================

const LoggedOutMessage = () => (
    <div className="logged-out-container">
        <h2 className="logged-out-title">Logged Out Successfully</h2>
        <p className="logged-out-subtitle">Thank you for using RCM AI. Please log in again to access your dashboard.</p>
        <p className="logged-out-note">Note: Since this is a single-file demo, full page redirect is not possible.</p>
    </div>
);

function UserDashboard() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoggedOut, setIsLoggedOut] = useState(false);
    
    const navigate = useNavigate(); 
    const fileInputRef = useRef(null);
    // ❌ 'token' aur 'API_URL' yahan se hata diye gaye hain

    // Profile Pic States
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    // ❌ 'isSavingPic' state hata diya gaya hai (ab zaroorat nahin)
    const [newProfilePicPreview, setNewProfilePicPreview] = useState(null);
    const [userData, setUserData] = useState(() => JSON.parse(localStorage.getItem('userData')) || {});
    const [profilePic, setProfilePic] = useState(''); 
    
    const userName = userData.fullName || 'RCM User';
    const userEmail = userData.email || 'No Email Provided';
    const rcmId = userData.rcmId || 'Not Set';

    useEffect(() => {
        const savedUserData = JSON.parse(localStorage.getItem('userData')) || {};
        setUserData(savedUserData); 
        
        if (savedUserData?.profilePic && savedUserData.profilePic.startsWith('data:image')) {
            setProfilePic(savedUserData.profilePic);
        } else {
            setProfilePic(`https://ui-avatars.com/api/?name=${savedUserData.fullName || 'RCM User'}&background=3b82f6&color=fff&size=100&rounded=true&bold=true`);
        }
    }, []); 

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userData');
        setIsLoggedOut(true);
    };

    // --- Profile Pic Handlers ---
    const handleProfilePicClick = () => {
        setIsProfileModalOpen(true);
    };

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleProfilePicChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result;
                setNewProfilePicPreview(base64String); 
            };
            reader.readAsDataURL(file);
        }
    };

    // ✅ LOCALSTORAGE MEIN SAVE KARNE WALA FUNCTION
    const handleSaveProfilePic = () => {
        if (!newProfilePicPreview) return;

        try {
            setProfilePic(newProfilePicPreview);
            const updatedUserData = { ...userData, profilePic: newProfilePicPreview };
            setUserData(updatedUserData); 
            localStorage.setItem('userData', JSON.stringify(updatedUserData)); 
            handleCloseProfileModal();
            
        } catch (error) {
            console.error("Error saving profile picture to localStorage:", error);
            alert("Error saving picture. Storage may be full.");
        }
    };

    const handleCloseProfileModal = () => {
        setIsProfileModalOpen(false);
        setNewProfilePicPreview(null); 
    };
    // --- End Profile Pic Handlers ---


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
        return <LoggedOutMessage />;
    }

    return (
        <>
            <input 
                type="file"
                ref={fileInputRef}
                onChange={handleProfilePicChange}
                style={{ display: 'none' }}
                accept="image/png, image/jpeg"
            />
            
            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={handleCloseProfileModal}
                onSave={handleSaveProfilePic}
                currentPic={profilePic}
                newPicPreview={newProfilePicPreview}
                onUploadClick={handleUploadClick}
                isSaving={false} // ✅ 'isSavingPic' state ki jagah false bhej rahe hain
            />

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
                            <div className="profile-pic-container" onClick={handleProfilePicClick} title="Change profile picture">
                                <img 
                                    src={profilePic} 
                                    alt="Profile" 
                                    className="user-profile-pic"
                                />
                                <div className="profile-pic-overlay">
                                    <Camera size={24} />
                                </div>
                            </div>
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
                                <h1 className="main-header-title">
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