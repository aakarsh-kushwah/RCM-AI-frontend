// src/components/ChatWindow.js

import React, { useState, useEffect, useRef } from 'react';
// ✅ नए आइकन्स: Volume2 (Unmute) और VolumeX (Mute)
import { SendHorizontal, Mic, X, MoreVertical, Video, ShoppingBag, BookOpen, UserCheck, Award, Calculator, Volume2, VolumeX } from 'lucide-react'; 
import './ChatWindow.css'; 
import CommissionCalculator from './CommissionCalculator'; // कैलकुलेटर कंपोनेंट

// --- Speech Synthesis (TTS) को तैयार करें ---
const synth = window.speechSynthesis;
let voices = [];

// आवाज़ों को लोड करने के लिए एक हेल्पर (यह ज़रूरी है)
function loadVoices() {
    voices = synth.getVoices();
}
// अगर आवाज़ें तुरंत लोड नहीं होती हैं, तो उन्हें 'onvoiceschanged' पर लोड करें
if (typeof synth.onvoiceschanged !== 'undefined') {
    synth.onvoiceschanged = loadVoices;
}
loadVoices(); // पहली बार लोड करने की कोशिश करें


// --- Speech Recognition (STT) ---
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
    
    // ✅ 1. TTS (आवाज़) के लिए नया स्टेट
    const [isMuted, setIsMuted] = useState(true); // डिफ़ॉल्ट रूप से म्यूट

    const chatBodyRef = useRef(null);
    const recognitionRef = useRef(recognition);

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

    // ✅ 2. TTS (आवाज़) के लिए नया 'speak' फ़ंक्शन
    const speak = (text) => {
        // अगर म्यूट है, या टेक्स्ट नहीं है, या ब्राउज़र सपोर्ट नहीं करता, तो कुछ न करें
        if (isMuted || !text || !synth) return;

        // बोलने से पहले पुराना कुछ भी चल रहा हो तो रोकें
        synth.cancel();

        // AI का जवाब अक्सर Markdown (जैसे **) या URLs के साथ आता है, उन्हें साफ़ करें
        const cleanText = text
            .replace(/\*\*/g, '') // Bold (**) हटाएँ
            .replace(/---/g, '')  // लाइन (---) हटाएँ
            .replace(/\n/g, ' ')   // नई लाइन को स्पेस (space) से बदलें
            .replace(/(https?:\/\/[^\s]+)/g, ' link '); // URLs को "link" पढ़ें

        const utterance = new SpeechSynthesisUtterance(cleanText);

        // हिंदी (hi-IN) आवाज़ ढूँढने की कोशिश करें
        if (voices.length === 0) loadVoices(); // आवाज़ें दोबारा लोड करें
        
        const hindiVoice = voices.find(v => v.lang === 'hi-IN') || voices.find(v => v.lang.startsWith('hi-'));
        
        if (hindiVoice) {
            utterance.voice = hindiVoice;
        } else {
            utterance.lang = 'hi-IN'; // अगर न मिले, तो ब्राउज़र को हिंदी ढूँढने दें
        }
        
        utterance.rate = 0.95; // थोड़ा धीमा बोलें
        utterance.pitch = 1.0;

        synth.speak(utterance);
    };

    // ✅ 3. जब भी नया मैसेज आए, उसे बोलें (अगर BOT का है)
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];

        // अगर म्यूट नहीं है, और आखिरी मैसेज BOT का है, और वह 'text' है
        if (!isMuted && lastMessage && lastMessage.sender === 'BOT' && lastMessage.type === 'text') {
            speak(lastMessage.content);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages]); // isMuted को यहाँ न डालें, वरना म्यूट करने पर भी बोलता रहेगा

    // ✅ 4. चैट बंद होने पर आवाज़ बंद करें
    useEffect(() => {
        // यह 'cleanup' (सफ़ाई) फ़ंक्शन है
        return () => {
            if (synth) {
                synth.cancel();
            }
        };
    }, []);

    // --- माइक बटन ---
    const handleMicClick = () => {
        if (!isSpeechApiAvailable) return alert("Sorry, your browser does not support speech recognition.");
        if (isListening) {
            recognitionRef.current.stop();
        } else { 
            synth.cancel(); // बोलना बंद करें
            setInput(''); 
            recognitionRef.current.start(); 
        }
    };

    // --- सेंड बटन (AI Chat) ---
    const handleSend = async () => {
        const messageToSend = input.trim();
        if (!messageToSend || isLoading) return;

        synth.cancel(); // बोलना बंद करें

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

    // ✅ 5. आवाज़ को Mute (म्यूट) / Unmute (अनम्यूट) करें
    const toggleMute = () => {
        const nextMuteState = !isMuted;
        setIsMuted(nextMuteState);
        if (nextMuteState) {
            synth.cancel(); // अगर म्यूट किया है, तो बोलना बंद करें
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
                
                {/* ✅ नया Mute (म्यूट) बटन */}
                <button 
                    onClick={toggleMute} 
                    className="menu-btn"
                    title={isMuted ? "Turn sound on" : "Turn sound off"}
                >
                    {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                </button>
                
                {/* Close (X) बटन */}
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
                            
                            {/* --- 1. टेक्स्ट मैसेज --- */}
                            {msg.type === 'text' && (
                                <div className="text-content" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br />') }} />
                            )}

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

                            {/* --- 4. कैलकुलेटर कार्ड --- */}
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
        </div>
    );
}

export default ChatWindow;