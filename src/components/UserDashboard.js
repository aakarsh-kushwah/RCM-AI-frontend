import React from 'react'; // ✅ useState और ChatWindow हटा दिए गए हैं
import { Link, useNavigate } from 'react-router-dom'; 
// import ChatWindow from './ChatWindow'; // ❌ हटा दिया गया
import './UserDashboard.css'; 
// ✅ lucide-react से chat icon जोड़ें
import { MessageSquare } from 'lucide-react'; 

function UserDashboard() {
    const navigate = useNavigate();
    // const [isChatOpen, setIsChatOpen] = useState(false); // ❌ हटा दिया गया
    const token = localStorage.getItem('token'); 
    const userData = JSON.parse(localStorage.getItem('userData'));
    const userName = userData ? userData.fullName || 'RCM User' : 'RCM User';

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userData');
        navigate('/login');
    };

    // ✅ ChatWindow को एक अलग रूट पर खोलें
    const handleChatbotClick = () => {
        navigate('/chat');
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
                    {/* Chatbot Card - Clicks opens the chat route */}
                    <div className="dashboard-card" onClick={handleChatbotClick}> 
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
            {/* ✅ navigate("/chat") का उपयोग करें */}
            <div className="chat-icon" onClick={handleChatbotClick}> 
                <MessageSquare size={28} />
            </div>
            
            {/* ❌ Floating Chat Window को हटा दिया गया है */}
        </div>
    );
}

export default UserDashboard;