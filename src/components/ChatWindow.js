// src/components/ChatWindow.js

import React, { useState, useEffect, useRef } from 'react';
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
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;
        isSpeechApiAvailable = true;
    }
} catch (error) {
    console.error("Speech Recognition API is not supported in this browser.", error);
    isSpeechApiAvailable = false;
}

function ChatWindow({ onClose }) { // 'token' prop हटा दिया गया है
    const [messages, setMessages] = useState([
        { sender: 'BOT', type: 'text', content: 'Hi! I am the RCM AI Assistant. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isMuted, setIsMuted] = useState(true); 

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

    // --- आवाज़ (TTS) ---
    const [voices, setVoices] = useState([]);
    useEffect(() => {
        const loadVoices = () => {
            setVoices(window.speechSynthesis.getVoices());
        };
        loadVoices();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const speak = (text) => {
        const synth = window.speechSynthesis;
        // ✅ जांचें कि 'text' एक स्ट्रिंग है
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
    };

    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (!isMuted && lastMessage && lastMessage.sender === 'BOT' && lastMessage.type === 'text') {
            speak(lastMessage.content);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, isMuted, voices]); 

    useEffect(() => {
        const synth = window.speechSynthesis;
        return () => { if (synth) synth.cancel(); };
    }, []);

    // --- माइक बटन ---
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

    // --- सेंड बटन (AI Chat) ---
    const handleSend = async () => {
        const messageToSend = input.trim();
        if (!messageToSend || isLoading) return;

        const token = localStorage.getItem('token'); 

        if (!token) {
            console.error("Chat Error: No token found in localStorage. User is not authenticated.");
            setIsLoading(false); 
            setMessages(prev => [...prev, {
                sender: 'BOT', type: 'text', content: 'Error: You are not authorized. Please log in again.'
            }]);
            return; 
        }

        window.speechSynthesis.cancel(); 
        const userMessage = { sender: 'USER', type: 'text', content: messageToSend };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        const API_URL = process.env.REACT_APP_API_URL;

        if (!API_URL) {
             console.error("CRITICAL: REACT_APP_API_URL is not set.");
             setIsLoading(false);
             setMessages(prev => [...prev, { sender: 'BOT', type: 'text', content: 'Configuration error.' }]);
             return;
        }

        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ message: messageToSend }), 
            });
            
            if (response.status === 403) {
                throw new Error('Token is invalid or expired. Please log in again.');
            }
            if (!response.ok) throw new Error(await response.text()); 

            const data = await response.json(); 
            let botMessage;
            
            // --- 🌟 यही है क्रैश फिक्स ---
            let replyContent = "";
            if (data.success) {
                // जांचें कि data.reply स्ट्रिंग है या ऑब्जेक्ट
                if (typeof data.reply === 'string') {
                    replyContent = data.reply;
                } else if (typeof data.reply === 'object' && data.reply !== null && data.reply.content) {
                    // अगर यह ऑब्जेक्ट है, तो .content प्रॉपर्टी का उपयोग करें
                    replyContent = data.reply.content;
                } else {
                    replyContent = "Sorry, I received an unclear response.";
                }
                
                botMessage = {
                    sender: 'BOT', type: 'text',
                    content: replyContent || "Sorry, I received an empty response."
                };
            } else {
                botMessage = { sender: 'BOT', type: 'text', content: data.message || 'Sorry, an error occurred.' };
            }
            // --- 🌟 फिक्स समाप्त ---
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Chat error:', error);
            let errorMessageText = error.message || "Sorry, I couldn't connect to the server.";
            if (error.message.includes("Failed to fetch")) errorMessageText = "Cannot connect to server.";
            if (error instanceof SyntaxError) errorMessageText = "Error: Invalid response from server.";
            
            const errorMessage = { sender: 'BOT', type: 'text', content: errorMessageText };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Mute / Unmute ---
    const toggleMute = () => {
        setIsMuted(prev => !prev);
        if (!isMuted) {
            window.speechSynthesis.cancel(); 
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
            
            {/* --- चैट बॉडी --- */}
            <div className="chat-body" ref={chatBodyRef}>
                <div className="chat-background-image"></div>
                
                {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.sender.toLowerCase()}`}>
                        <div className={`message-bubble ${msg.type || 'text'}`}>
                            {msg.type === 'text' && (
                                // ✅ यह जांच सुनिश्चित करती है कि 'content' एक स्ट्रिंग है
                                <div 
                                  className="text-content" 
                                  dangerouslySetInnerHTML={{ __html: String(msg.content).replace(/\n/g, '<br />') }} 
                                />
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
                  _ </button>
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