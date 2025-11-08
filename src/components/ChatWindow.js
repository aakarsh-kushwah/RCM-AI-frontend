import React, { useState, useEffect, useRef, useCallback } from 'react';
// ✅ Calculator icons hata diye gaye
import { SendHorizontal, Mic, X, Volume2, VolumeX } from 'lucide-react'; 
import './ChatWindow.css'; 

// --- Speech Recognition ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isSpeechApiAvailable = false;
try {
    if (SpeechRecognition) {
        recognition = new SpeechRecognition(); 
        recognition.continuous = false;
        recognition.lang = 'hi-IN'; // Default Hindi
        recognition.interimResults = false;
        isSpeechApiAvailable = true;
    }
} catch (error) {
    console.error("Speech Recognition API is not supported in this browser.", error);
    isSpeechApiAvailable = false;
}

// =======================================================
// Mukhya ChatWindow Component
// =======================================================
function ChatWindow({ onClose }) {
    const [messages, setMessages] = useState([
        // ✅ Role 'assistant' (OpenAI/Groq standard)
        { role: 'assistant', type: 'text', content: 'Hi! I am the RCM AI Assistant. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isMuted, setIsMuted] = useState(true); 
    
    // ❌ Calculator state hata diya gaya
    
    const chatBodyRef = useRef(null);
    const recognitionRef = useRef(recognition);

    // Auto-scroll
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    // Speech Recognition setup (Unchanged)
    useEffect(() => {
        if (!isSpeechApiAvailable || !recognitionRef.current) return;
        const rec = recognitionRef.current;
        rec.onstart = () => setIsListening(true);
        rec.onend = () => setIsListening(false);
        rec.onerror = (event) => { console.error('Speech recognition error:', event.error); setIsListening(false); };
        rec.onresult = (event) => setInput(event.results[0][0].transcript);
        return () => { if (rec) rec.stop(); };
    }, []);

    // --- Awaaz (TTS) (Unchanged) ---
    const [voices, setVoices] = useState([]);
    useEffect(() => {
        const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
        loadVoices();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const speak = useCallback((text) => {
        const synth = window.speechSynthesis;
        if (isMuted || !text || typeof text !== 'string' || !synth) return;
        synth.cancel(); 
        const cleanText = text.replace(/\*\*|---|(\(https?:\/\/[^\s]+\))/g, ' ').replace(/\n/g, ' ');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        let bestVoice = voices.find(v => v.name === 'Google हिन्दी' && v.lang === 'hi-IN') ||
                        voices.find(v => v.name.includes('Microsoft') && v.lang === 'hi-IN') ||
                        voices.find(v => v.lang === 'hi-IN');
        if (bestVoice) utterance.voice = bestVoice; 
        else utterance.lang = 'hi-IN'; 
        synth.speak(utterance);
    }, [isMuted, voices]);

    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (!isMuted && lastMessage && lastMessage.role === 'assistant' && lastMessage.type === 'text') {
            speak(lastMessage.content);
        }
    }, [messages, isMuted, speak]);

    useEffect(() => {
        const synth = window.speechSynthesis;
        return () => { if (synth) synth.cancel(); };
    }, []);

    // Mic button (Unchanged)
    const handleMicClick = () => {
        if (!isSpeechApiAvailable) return alert("Sorry, your browser does not support speech recognition.");
        if (isListening) {
            recognitionRef.current.stop();
        } else { 
            window.speechSynthesis.cancel(); 
            setInput(''); 
            recognitionRef.current.start(); 
        }
    };

    // --- Mute / Unmute (Unchanged) ---
    const toggleMute = () => {
        setIsMuted(prev => !prev);
        if (!isMuted) {
            window.speechSynthesis.cancel(); 
        }
    };

    // --- ✅ UPDATED: API Call Function ---
    // (Yeh ab reusable nahi hai, seedha handleSend mein hai)

    // --- ✅ UPDATED: Send Button (AI Chat) ---
    const handleSend = async () => {
        const messageToSend = input.trim();
        if (!messageToSend || isLoading) return;

        const token = localStorage.getItem('token'); 
        if (!token) {
            console.error("Chat Error: No token found.");
            setMessages(prev => [...prev, { role: 'assistant', type: 'text', content: 'Error: You are not authorized. Please log in again.' }]);
            return;
        }

        const API_URL = process.env.REACT_APP_API_URL;
        if (!API_URL) {
            console.error("CRITICAL: REACT_APP_API_URL is not set.");
            setMessages(prev => [...prev, { role: 'assistant', type: 'text', content: 'Configuration error.' }]);
            return;
        }

        window.speechSynthesis.cancel(); 
        const userMessage = { role: 'user', type: 'text', content: messageToSend };
        
        // ✅ History ko API call ke liye taiyaar karein
        // Hum 'role' (user/assistant) ka istemaal kar rahe hain
        const historyForAPI = messages.map(msg => ({
            role: msg.role, // 'user' ya 'assistant'
            content: msg.content
        }));

        // UI ko naye message se update karein
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        
        // --- API Call Logic ---
        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                
                // ✅ --- YEH HAI MUKHYA FIX --- ✅
                // 'message' (naya sawaal) aur 'chatHistory' (puraani chat) dono bhej rahe hain
                body: JSON.stringify({ 
                    message: messageToSend,
                    chatHistory: historyForAPI // <-- YEH HAI MEMORY FIX
                }), 
                // --- FIX ENDS ---
            });
            
            if (response.status === 403) throw new Error('Token is invalid or expired. Please log in again.');
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`); 

            const data = await response.json(); 
            
            let botMessage;
            if (data.success) {
                // 'data.reply' hamesha ek object hona chahiye { type: '...', content: '...' }
                if (typeof data.reply === 'object' && data.reply !== null && data.reply.content) {
                    botMessage = {
                        role: 'assistant',
                        type: data.reply.type || 'text', // Type ko follow karein
                        content: data.reply.content
                    };
                    
                    // ❌ Calculator logic hata diya gaya
                    
                } else {
                    botMessage = { role: 'assistant', type: 'text', content: "Sorry, I received an unclear response." };
                }
            } else {
                botMessage = { role: 'assistant', type: 'text', content: data.reply.content || 'Sorry, an error occurred.' };
            }
            
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Chat API error:', error);
            let errorMessageText = error.message || "Sorry, I couldn't connect to the server.";
            if (error.message.includes("Failed to fetch")) errorMessageText = "Cannot connect to server.";
            setMessages(prev => [...prev, { role: 'assistant', type: 'text', content: errorMessageText }]);
        } finally {
            setIsLoading(false);
        }
    };

    // ❌ handleCalculateCommission function hata diya gaya

    return (
        <div className="chat-window">
            {/* ❌ Calculator Modal JSX hata diya gaya */}
            
            {/* --- Header (Unchanged) --- */}
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
                    <p>{isLoading ? 'typing...' : 'online'}</p>
                </div>
                <button 
                    onClick={toggleMute} 
                    className="menu-btn"
                    title={isMuted ? "Turn sound on" : "Turn sound off"}
                >
                    {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                </button>
                <button 
                    onClick={onClose} 
                    className="close-btn-header"
                >
                    <X size={24} />
                </button>
            </div>
            
            {/* --- Chat Body (Updated) --- */}
            <div className="chat-body" ref={chatBodyRef}>
                <div className="chat-background-image"></div>
                
                {messages.map((msg, index) => (
                    // ✅ Role ko 'bot' ya 'user' set karein
                    <div key={index} className={`chat-message ${msg.role === 'user' ? 'user' : 'bot'}`}>
                        <div className={`message-bubble ${msg.type || 'text'}`}>
                            
                            {/* Sirf text render karein, calculator logic hata diya gaya */}
                            <div 
                                className="text-content" 
                                dangerouslySetInnerHTML={{ __html: String(msg.content).replace(/\n/g, '<br />') }} 
                            />
                            
                        </div>
                    </div>
                ))}

                {/* --- Typing Indicator (Unchanged) --- */}
                {isLoading && (
                    <div className="chat-message bot typing-indicator">
                        <div className="message-bubble">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Footer (Unchanged) --- */}
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
        </div>
    );
}

export default ChatWindow;