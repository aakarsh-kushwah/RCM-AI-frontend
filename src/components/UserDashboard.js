import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import ChatWindow from './ChatWindow'; 
import './UserDashboard.css'; 

function UserDashboard() {
    const navigate = useNavigate();
    const [isChatOpen, setIsChatOpen] = useState(false);
    const token = localStorage.getItem('token'); // ✅ Standardized token
    const userData = JSON.parse(localStorage.getItem('userData'));
    const userName = userData ? userData.fullName || 'RCM User' : 'RCM User';

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userData');
        navigate('/login');
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Hello, {userName}! 👋</h1>
                <button onClick={handleLogout} className="logout-btn">
                    Logout
                </button>
            </header>
            
            <main className="dashboard-main">
                <div className="card-grid">
                    {/* Chatbot Card - Clicks open the chat window */}
                    <div className="dashboard-card" onClick={() => setIsChatOpen(true)}>
                        <h3>🤖 AI Chatbot</h3>
                        <p>Ask questions and get instant answers from our AI assistant. Click here to chat!</p>
                    </div>
                    
                    <Link to="/leaders-videos" className="dashboard-card">
                        <h3>🎥 Leaders' Videos</h3>
                        <p>Get inspired by the success stories and trainings from top leaders.</p>
                    </Link>
                    
                    <Link to="/products-videos" className="dashboard-card">
                        <h3>🛍️ Products' Videos</h3>
                        <p>Learn more about RCM products through detailed videos.</p>
                    </Link>
                </div>
            </main>
            
            {/* Floating Chat Icon */}
            <div className="chat-icon" onClick={() => setIsChatOpen(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            
            {/* Floating Chat Window */}
            {isChatOpen && <ChatWindow token={token} onClose={() => setIsChatOpen(false)} />}
        </div>
    );
}

export default UserDashboard;