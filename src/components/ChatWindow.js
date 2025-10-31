import React, { useState, useEffect, useRef } from 'react';
// ✅ नए आइकन्स जोड़े गए
import { SendHorizontal, Mic, X, MoreVertical, Video, ShoppingBag, BookOpen, UserCheck, Award } from 'lucide-react'; 
import './ChatWindow.css'; 

// --- Speech Recognition (वॉइस-टू-टेक्स्ट) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isSpeechApiAvailable = false;
try {
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;
        isSpeechApiAvailable = true;
    }
} catch (error) {
    console.error("Speech Recognition API is not supported in this browser or is blocked.", error);
    isSpeechApiAvailable = false;
}
// ---------------------------------------------


// ✅ नया prop: onNavigateToVideo
// यह फ़ंक्शन App.js से आएगा और वीडियो पेज पर नेविगेट करेगा
function ChatWindow({ token, onClose, onNavigateToVideo }) {
    
    // ✅ मैसेज स्ट्रक्चर अपडेट किया गया: { sender, type, content }
    const [messages, setMessages] = useState([
        { sender: 'BOT', type: 'text', content: 'Hi! I am the RCM AI Assistant. How can I help you today? Ask me about leaders, products, or seminars.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    const [aiMode, setAiMode] = useState('General');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const chatBodyRef = useRef(null);
    const recognitionRef = useRef(recognition);
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);

    // New message aane par apne aap neeche scroll karen
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    // --- वॉयस रिकग्निशन Effect ---
    useEffect(() => {
        if (!isSpeechApiAvailable || !recognitionRef.current) return;
        const rec = recognitionRef.current;
        rec.onstart = () => setIsListening(true);
        rec.onend = () => setIsListening(false);
        rec.onerror = (event) => { console.error('Speech recognition error:', event.error); setIsListening(false); };
        rec.onresult = (event) => setInput(event.results[0][0].transcript);
        return () => rec.stop();
    }, []);

    // --- मेनू के बाहर क्लिक करने पर बंद करें Effect ---
    useEffect(() => {
        function handleClickOutside(event) {
            if (
                menuRef.current && !menuRef.current.contains(event.target) &&
                menuButtonRef.current && !menuButtonRef.current.contains(event.target)
            ) {
                setIsMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuRef, menuButtonRef]);


    // --- माइक बटन ---
    const handleMicClick = () => {
        if (!isSpeechApiAvailable) return alert("Sorry, your browser does not support speech recognition.");
        if (isListening) recognitionRef.current.stop();
        else { setInput(''); recognitionRef.current.start(); }
    };

    // --- सेंड बटन ---
    const handleSend = async () => {
        const messageToSend = input.trim();
        if (!messageToSend || isLoading) return;

        const userMessage = { sender: 'USER', type: 'text', content: messageToSend };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // ⬇️⬇️✅ यही वह लाइन है जिसे ठीक किया गया है ⬇️⬇️
            // यह अब 'proxy' सेटिंग का इस्तेमाल करेगा
            const response = await fetch("/api/chat", { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: messageToSend, mode: aiMode }),
            });
            // ⬆️⬆️✅ कोड फिक्स ⬆️⬆️

            // 404 या 500 एरर को बेहतर तरीके से हैंडल करने के लिए
            if (!response.ok) {
                const errorText = await response.text(); // HTML एरर को टेक्स्ट के रूप में पढ़ें
                // यह 'SyntaxError' को रोकता है
                throw new Error(errorText || `Server error: ${response.statusText}`); 
            }

            const data = await response.json(); // अब यह सुरक्षित है
            
            let botMessage;

            if (data.success) {
                if (typeof data.reply === 'object' && data.reply.type) {
                    botMessage = {
                        sender: 'BOT',
                        type: data.reply.type, 
                        content: data.reply.content
                    };
                } else {
                    botMessage = {
                        sender: 'BOT',
                        type: 'text',
                        content: data.reply.toString()
                    };
                }
            } else {
                botMessage = { sender: 'BOT', type: 'text', content: data.message || 'Sorry, an error occurred.' };
            }
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Chat error:', error);
            let errorMessageText = "Sorry, I couldn't connect to the server.";
            
            // JSON एरर को पहचानें
            if (error instanceof SyntaxError) {
                errorMessageText = "Error: Invalid response from server (Not JSON). Check proxy.";
            } else if (error.message.includes("DOCTYPE")) {
                errorMessageText = "Error: 404 Not Found. Check proxy settings and restart server.";
            }

            const errorMessage = { sender: 'BOT', type: 'text', content: errorMessageText };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- AI मोड बदलना ---
    const handleChangeMode = (newMode) => {
        if (newMode === aiMode) return setIsMenuOpen(false);
        setAiMode(newMode);
        setIsMenuOpen(false);
        setMessages(prev => [...prev, {
            sender: 'BOT',
            type: 'text',
            content: `AI Mode set to: ${newMode}. How can I help?`
        }]);
    };

    // --- वीडियो कार्ड पर क्लिक हैंडलर ---
    const handlePlayVideo = (videoContent) => {
        if (onNavigateToVideo) {
            onNavigateToVideo(videoContent);
            onClose(); // चैट को बंद करें
        }
    };


    return (
        <div className="chat-window">
            {/* --- हेडर --- */}
            <div className="chat-header">
                <div className="avatar-icon">
                    <img 
                        src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                        alt="RCM AI Logo" 
                        className="bot-logo-img" 
                    />
                </div>
                <div className="header-info">
                    <h3>RCM AI Assistant</h3>
                    <p>{isLoading ? 'typing...' : (aiMode === 'General' ? 'online' : aiMode)}</p>
                </div>
                <button 
                    onClick={() => setIsMenuOpen(prev => !prev)} 
                    className="menu-btn"
                    ref={menuButtonRef}
                >
                    <MoreVertical size={24} />
                </button>
            </div>
            
            {/* --- चैट बॉडी --- */}
            <div className="chat-body" ref={chatBodyRef}>
                <div className="chat-background-image"></div>
                
                {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.sender.toLowerCase()}`}>
                        
                        <div className={`message-bubble ${msg.type || 'text'}`}>
                            
                            {/* --- 1. टेक्स्ट मैसेज --- */}
                            {msg.type === 'text' && msg.content}

                            {/* --- 2. वीडियो कार्ड --- */}
                            {msg.type === 'video' && (
                                <div className="card-message">
                                    {msg.content.thumbnailUrl && (
                                        <img src={msg.content.thumbnailUrl} alt={msg.content.title} className="card-image" />
                                    )}
                                    <div className="card-body">
                                        <strong className="card-title">{msg.content.title}</strong>
                                        {msg.content.message && <p>{msg.content.message}</p>}
                                        <button onClick={() => handlePlayVideo(msg.content)} className="card-button video-btn">
                                            <Video size={16} /> Watch Now
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {/* --- 3. प्रोडक्ट कार्ड --- */}
                            {msg.type === 'product' && (
                                <div className="card-message">
                                    {msg.content.image && (
                                        <img src={msg.content.image} alt={msg.content.name} className="card-image" />
                                    )}
                                    <div className="card-body">
                                        <strong className="card-title">{msg.content.name}</strong>
                                        {msg.content.message && <p>{msg.content.message}</p>}
                                        {msg.content.description && <p className="card-description">{msg.content.description}</p>}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                ))}
                {/* --- टाइपिंग इंडिकेटर --- */}
                {isLoading && (
                    <div className="chat-message bot typing-indicator">
                        <div className="message-bubble">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
            </div>

            {/* --- फूटर --- */}
            <div className="chat-footer">
                <div className="input-container">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={isListening ? 'Listening...' : "Message"}
                        disabled={isLoading}
                        className="chat-input"
                    />
                </div>

                {input.trim() ? (
                    <button onClick={handleSend} disabled={isLoading} className="circle-btn send-btn">
                        <SendHorizontal size={22} />
                    </button>
                ) : (
                    <button 
                        onClick={handleMicClick} 
                        className={`circle-btn mic-btn ${isListening ? 'listening' : ''}`} 
                        disabled={isLoading || !isSpeechApiAvailable}
                        title={isSpeechApiAvailable ? "Speak" : "Speech not supported"}
                    >
                        <Mic size={22} />
                    </button>
                )}
            </div>

            {/* --- AI मोड मेनू --- */}
            {isMenuOpen && (
                <div className="mode-menu" ref={menuRef}>
                    <div className="mode-menu-header">Select AI Mode</div>
                    <button onClick={() => handleChangeMode('General')}>
                        <BookOpen size={16} /> General Q&A
                    </button>
                    <button onClick={() => handleChangeMode('Leader Videos')}>
                        <Award size={16} /> Leader Videos
                    </button>
                    <button onClick={() => handleChangeMode('Product Info')}>
                        <ShoppingBag size={16} /> Product Info
                    </button>
                    <button onClick={() => handleChangeMode('Seminar Videos')}>
                        <Video size={16} /> Seminar Videos
                    </button>
                    <button onClick={() => handleChangeMode('Dress Code')}>
                        <UserCheck size={16} /> Dress Code
                    </button>
                    
                    <div className="menu-divider"></div>
                    
                    <button onClick={onClose} className="menu-item-close">
                        <X size={16} /> Close Chat
                    </button>
                </div>
            )}
        </div>
    );
}

export default ChatWindow;