import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import ChatWindow from './ChatWindow'; 
import './UserDashboard.css'; 

// आइकन्स (वैकल्पिक, लेकिन अच्छे लुक के लिए)
import { MessageSquare, LogOut } from 'lucide-react';

function UserDashboard() {
    const navigate = useNavigate();
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    const token = localStorage.getItem('token'); 
    const userData = JSON.parse(localStorage.getItem('userData'));
    const userName = userData ? userData.fullName || 'RCM User' : 'RCM User';

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userData');
        navigate('/login');
    };

    /**
     * ✅ प्रोडक्शन फ़ीचर:
     * यह फ़ंक्शन ChatWindow से कमांड लेता है और यूज़र को 
     * सीधे सही वीडियो पेज पर, सही वीडियो के साथ भेजता है।
     */
    const handleNavigateToVideo = (videoContent) => {
        // AI बैकएंड से उम्मीद है कि वह बताएगा कि यह किस टाइप का वीडियो है।
        const videoType = videoContent.videoType || 'leaders'; // डिफ़ॉल्ट 'leaders'

        const targetPath = videoType === 'products' 
            ? '/products-videos' 
            : '/leaders-videos';

        // वीडियो पेज पर जाएँ और 'state' के ज़रिए वीडियो डेटा पास करें
        navigate(targetPath, { state: { selectedVideo: videoContent } });
        
        // वीडियो पर जाने के बाद चैट को बंद कर दें
        setIsChatOpen(false);
    };
    
    // ✅ --- 1. यह है आपका समाधान ---
    // यह फ़ंक्शन चैट को बंद करता है, लॉगइन पर नहीं भेजता।
    const handleCloseChat = () => {
        setIsChatOpen(false);
        // (यहाँ कोई navigate('/login') नहीं है)
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Hello, {userName}! 👋</h1>
                <button onClick={handleLogout} className="logout-btn">
                    <LogOut size={16} /> Logout
                </button>
            </header>
            
            <main className="dashboard-main">
                <h2>Your Tools</h2>
                <div className="card-grid">
                    <div className="dashboard-card" onClick={() => setIsChatOpen(true)}>
                        <h3>🤖 AI Chatbot</h3>
                        <p>Ask questions and get instant answers from our AI assistant.</p>
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
            
            <div className="chat-icon" onClick={() => setIsChatOpen(true)} title="Open AI Chat">
                <MessageSquare size={28} />
            </div>
            
            {/* ✅ ChatWindow को दोनों सही props पास किए गए */}
            {isChatOpen && (
                <ChatWindow 
                    token={token} 
                    onClose={handleCloseChat} // ✅ यह 'लॉगिन' पर नहीं भेजेगा
                    onNavigateToVideo={handleNavigateToVideo} 
                />
            )}
        </div>
    );
}

export default UserDashboard;

