// src/components/ChatWindow.js

import React, { useState, useEffect, useRef } from 'react';
// ✅ फालतू आइकन्स (MoreVertical, BookOpen, UserCheck, Award) हटा दिए गए हैं
import { SendHorizontal, Mic, X, Video, ShoppingBag, Calculator, Volume2, VolumeX } from 'lucide-react'; 
import './ChatWindow.css'; 
import CommissionCalculator from './CommissionCalculator'; // कैलकुलेटर कंपोनेंट

// --- Speech Recognition ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isSpeechApiAvailable = false;
try {
    if (SpeechRecognition) {
        // ✅ --- यह है आपका 100% एरर फिक्स ---
        // 'SpeechShorthand' की जगह 'SpeechRecognition'
        recognition = new SpeechRecognition(); 
        // ------------------------------------
        recognition.continuous = false;
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;
        isSpeechApiAvailable = true;
    }
} catch (error) {
    console.error("Speech Recognition API is not supported in this browser.", error);
    isSpeechApiAvailable = false;
}

function ChatWindow({ token, onClose, onNavigateToVideo }) {
    const [messages, setMessages] = useState([
        { sender: 'BOT', type: 'text', content: 'Hi! I am the RCM AI Assistant. How can I help you today? Ask me about leaders, products, or seminars.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    // ✅ TTS (आवाज़) के लिए स्टेट
    const [isMuted, setIsMuted] = useState(true); // डिफ़ॉल्ट रूप से म्यूट

    const chatBodyRef = useRef(null);
    const recognitionRef = useRef(recognition);
    // ❌ menuRef और menuButtonRef को हटा दिया गया है

    // Auto-scroll
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    // Speech Recognition setup
    useEffect(() => {
        if (!isSpeechApiAvailable || !recognitionRef.current) return;
        const rec = recognitionRef.current;
        rec.onstart = () => setIsListening(true);
        rec.onend = () => setIsListening(false);
        rec.onerror = (event) => { console.error('Speech recognition error:', event.error); setIsListening(false); };
        rec.onresult = (event) => setInput(event.results[0][0].transcript);
        return () => { if (rec) rec.stop(); };
    }, []);

    // ❌ handleClickOutside useEffect को हटा दिया गया है


    // --- आवाज़ (TTS) के लिए 'speak' फ़ंक्शन ---
    
    // आवाज़ों को लोड करने के लिए हेल्पर
    const [voices, setVoices] = useState([]);
    useEffect(() => {
        const loadVoices = () => {
            const availableVoices = window.speechSynthesis.getVoices();
            setVoices(availableVoices);
        };
        loadVoices();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const speak = (text) => {
        const synth = window.speechSynthesis;
        if (isMuted || !text || !synth) return;

        synth.cancel(); // पुराना कुछ भी बोल रहा हो तो रोकें

        const cleanText = text
            .replace(/\*\*/g, '') // Bold
            .replace(/---/g, '')  // Line
            .replace(/\n/g, ' ')   // New line
            .replace(/(https?:\/\/[^\s]+)/g, ' link '); // URLs

        const utterance = new SpeechSynthesisUtterance(cleanText);

        // --- Sabse Achhi Voice Dhoondhne ka Logic ---
        let bestVoice = voices.find(v => v.name === 'Google हिन्दी' && v.lang === 'hi-IN');
        if (!bestVoice) {
            bestVoice = voices.find(v => v.name.includes('Microsoft') && v.lang === 'hi-IN');
        }
        if (!bestVoice) {
            bestVoice = voices.find(v => v.lang === 'hi-IN');
        }

        if (bestVoice) {
            utterance.voice = bestVoice; 
        } else {
            utterance.lang = 'hi-IN'; 
        }
        
        utterance.rate = 1.0; 
        utterance.pitch = 1.0;

        synth.speak(utterance);
    };

    // जब भी नया मैसेज आए, उसे बोलें (अगर BOT का है)
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (!isMuted && lastMessage && lastMessage.sender === 'BOT' && lastMessage.type === 'text') {
            speak(lastMessage.content);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, isMuted, voices]); // voices को dependency में जोड़ा गया

    // चैट बंद होने पर आवाज़ बंद करें
    useEffect(() => {
        const synth = window.speechSynthesis;
        return () => {
            if (synth) synth.cancel();
        };
    }, []);


    // --- माइक बटन ---
    const handleMicClick = () => {
        if (!isSpeechApiAvailable) return alert("Sorry, your browser does not support speech recognition.");
        if (isListening) {
            recognitionRef.current.stop();
        } else { 
            window.speechSynthesis.cancel(); // बोलना बंद करें
            setInput(''); 
            recognitionRef.current.start(); 
        }
    };

    // --- सेंड बटन (AI Chat) ---
    const handleSend = async () => {
        const messageToSend = input.trim();
        if (!messageToSend || isLoading) return;

        window.speechSynthesis.cancel(); // बोलना बंद करें

        const userMessage = { sender: 'USER', type: 'text', content: messageToSend };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const API_URL = process.env.REACT_APP_API_URL;

        if (!API_URL) {
             console.error("CRITICAL: REACT_APP_API_URL is not set in .env file.");
             setIsLoading(false);
             setMessages(prev => [...prev, {
                 sender: 'BOT', type: 'text', content: 'Configuration error: API URL is missing.'
             }]);
             return;
        }

        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: messageToSend }), // 'mode' हटा दिया गया है
            });
            
            if (!response.ok) {
                throw new Error(await response.text()); 
            }

            const data = await response.json(); 
            
            let replyFromAI = data.reply;
            let botMessage;
            
            if (data.success) {
                try {
                    replyFromAI = (typeof data.reply === 'string') ? JSON.parse(data.reply) : data.reply;
                } catch (e) {
                    replyFromAI = { type: "text", content: data.reply.toString() };
                }

                botMessage = {
                    sender: 'BOT',
                    type: replyFromAI.type || 'text',
                    content: replyFromAI.content || "Sorry, I received an empty response."
                };

            } else {
                botMessage = { sender: 'BOT', type: 'text', content: data.message || 'Sorry, an error occurred.' };
            }
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Chat error:', error);
            let errorMessageText = "Sorry, I couldn't connect to the server.";
            if (error instanceof SyntaxError) {
                errorMessageText = "Error: Invalid response from server (Not JSON).";
            } else if (error.message.includes("DOCTYPE") || error.message.includes("404")) {
                errorMessageText = "Error: API endpoint not found. Check API URL.";
            } else if (error.message.includes("CORS")) {
                 errorMessageText = "Error: CORS policy is blocking the request.";
            }
            const errorMessage = { sender: 'BOT', type: 'text', content: errorMessageText };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- कैलकुलेटर सबमिट हैंडलर ---
    const handleCalculatorSubmit = async (data) => {
        setIsLoading(true);
        
        const legBVs = data.legs.map(leg => leg.bv || 0).join(', ');
        const userCalcMessage = {
            sender: 'USER',
            type: 'text',
            content: `Calculating for: Self BV: ${data.selfBV || 0}, Legs: [${legBVs}]`
        };
        setMessages(prev => [
            ...prev.slice(0, -1), 
            userCalcMessage
        ]);

        const API_URL = process.env.REACT_APP_API_URL;

        try {
            const response = await fetch(`${API_URL}/api/chat/calculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data), 
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result = await response.json(); 
            
            const botReply = {
                sender: 'BOT',
                type: result.reply.type || 'text',
                content: result.reply.content
            };
            setMessages(prev => [...prev, botReply]);

        } catch (error) {
            console.error('Calculation error:', error);
            const errorMessage = { sender: 'BOT', type: 'text', content: "Sorry, I couldn't calculate. Please try again."};
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- वीडियो कार्ड पर क्लिक हैंडलर ---
    const handlePlayVideo = (videoContent) => {
        if (onNavigateToVideo) {
            onNavigateToVideo(videoContent);
            onClose(); 
        }
    };

    // --- Mute / Unmute ---
    const toggleMute = () => {
        const nextMuteState = !isMuted;
        setIsMuted(nextMuteState);
        if (nextMuteState) {
            window.speechSynthesis.cancel(); // अगर म्यूट किया है, तो बोलना बंद करें
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
                    <p>{isLoading ? 'typing...' : 'online'}</p>
                </div>
                
                {/* Mute Button */}
                <button 
                    onClick={toggleMute} 
                    className="menu-btn"
                    title={isMuted ? "Turn sound on" : "Turn sound off"}
                >
                    {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                </button>
                
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    className="close-btn-header"
                >
                    <X size={24} />
                </button>
            </div>
            
            {/* --- चैट बॉडी --- */}
            <div className="chat-body" ref={chatBodyRef}>
                <div className="chat-background-image"></div>
                
                {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.sender.toLowerCase()}`}>
                        
                        <div className={`message-bubble ${msg.type || 'text'}`}>
                            
                            {msg.type === 'text' && (
                                <div className="text-content" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br />') }} />
                            )}

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

                            {msg.type === 'calculator' && (
                                <div className="card-message calculator-card">
                                    <div className="card-body">
                                        <strong className="card-title"><Calculator size={18} /> Commission Calculator</strong>
                                        {msg.content && <p>{msg.content}</p>}
                                        <CommissionCalculator 
                                            onSubmit={handleCalculatorSubmit} 
                                            isLoading={isLoading} 
                                        />
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
            
            {/* ❌ AI मोड मेनू को हटा दिया गया है */}
        </div>
    );
}

export default ChatWindow;