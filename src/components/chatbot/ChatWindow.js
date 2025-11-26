import React, { useState, useEffect, useRef, useCallback } from 'react';
// Icons import (lucide-react library honi chahiye)
import { 
  SendHorizontal, Mic, X, Volume2, VolumeX, 
  MessageCircle, Sparkles, Minimize2, StopCircle 
} from 'lucide-react';
import './ChatWindow.css'; // ✅ CSS file import (Niche di gayi hai)

// --- CONFIGURATION ---
// 🟢 Apna WhatsApp number yahan dalein (Country code ke sath, bina '+')
// Example: 919876543210
const WHATSAPP_NUMBER = "919876543210"; 
const START_MSG = "Namaste RCM Assistant, mujhe business plan janna he.";

// --- SPEECH RECOGNITION SETUP (Browser Support check) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
try {
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'hi-IN'; // Hindi/English mix ke liye best
    recognition.interimResults = true;
  }
} catch (e) {
  console.error("Speech API Error:", e);
}

function ChatWindow({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Jai RCM! Mai apka AI Business Assistant hu. Bataiye aaj mai apki kya madad kar sakta hu?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Voice Mode State (Gemini Style Overlay)
  const [isVoiceMode, setIsVoiceMode] = useState(false); 
  const [liveTranscript, setLiveTranscript] = useState('');

  const chatBodyRef = useRef(null);
  const recognitionRef = useRef(recognition);

  // --- AUTO SCROLL ---
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, liveTranscript]);

  // --- SPEECH LOGIC ---
  useEffect(() => {
    if (!recognitionRef.current) return;
    const rec = recognitionRef.current;

    rec.onstart = () => setIsListening(true);
    rec.onend = () => {
        setIsListening(false);
        // Voice mode mein auto-send karein agar kuch bola gaya ho
        if (isVoiceMode && liveTranscript.trim()) {
            handleSend(liveTranscript);
        }
    };
    rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (isVoiceMode) {
            setLiveTranscript(transcript);
        } else {
            setInput(transcript);
        }
    };
  }, [isVoiceMode, liveTranscript]);

  // --- TTS (TEXT TO SPEECH) ---
  const speak = useCallback((text) => {
    if (isMuted || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hi-IN';
    utterance.rate = 1.0; // Speed normal rakhein
    window.speechSynthesis.speak(utterance);
  }, [isMuted]);

  // Naya message aane par AI bolega
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!isMuted && lastMsg?.role === 'assistant') {
        speak(lastMsg.content);
    }
  }, [messages, isMuted, speak]);

  // --- BUTTON HANDLERS ---
  const toggleListening = () => {
    if (!recognitionRef.current) return alert("Browser doesn't support speech.");
    if (isListening) recognitionRef.current.stop();
    else {
        setLiveTranscript(''); 
        recognitionRef.current.start();
    }
  };

  // ✅ WhatsApp Redirect Logic
  const openWhatsApp = () => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(START_MSG)}`;
    window.open(url, '_blank');
  };

  const handleSend = async (textOverride = null) => {
    const msgText = textOverride || input.trim();
    if (!msgText || isLoading) return;

    const token = localStorage.getItem('token');
    // Backend API URL (Apni .env setting ke hisaab se change karein)
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    setMessages(prev => [...prev, { role: 'user', content: msgText }]);
    setInput('');
    setLiveTranscript('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
            message: msgText, 
            chatHistory: messages.map(m => ({ role: m.role, content: m.content })) 
        })
      });
      const data = await res.json();
      const reply = data.success ? data.reply.content : "Server connection error.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Offline or Server Error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- RENDER: VOICE MODE OVERLAY ---
  if (isVoiceMode) {
    return (
      <div className="chat-window voice-mode">
        <div className="voice-header">
            <button onClick={() => setIsVoiceMode(false)} className="icon-btn"><Minimize2 size={24} /></button>
            <span className="live-badge">RCM Live</span>
        </div>
        
        <div className="voice-visualizer">
            <div className={`orb ${isListening ? 'listening' : ''} ${isLoading ? 'thinking' : ''}`}></div>
            <p className="voice-status">
                {isListening ? "Listening..." : isLoading ? "Thinking..." : "Go ahead, I'm listening"}
            </p>
            {liveTranscript && <p className="transcript">"{liveTranscript}"</p>}
        </div>

        <div className="voice-controls">
            <button className={`mic-fab ${isListening ? 'active' : ''}`} onClick={toggleListening}>
                {isListening ? <StopCircle size={32} /> : <Mic size={32} />}
            </button>
            <button className="icon-btn danger" onClick={() => setIsVoiceMode(false)}><X size={24} /></button>
        </div>
      </div>
    );
  }

  // --- RENDER: STANDARD CHAT MODE ---
  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="brand">
            <div className="avatar"><Sparkles size={18} /></div>
            <div className="info">
                <h3>RCM Assistant</h3>
                <span className="status">Online</span>
            </div>
        </div>
        <div className="actions">
            {/* 🟢 WhatsApp Button */}
            <button onClick={openWhatsApp} className="action-btn whatsapp" title="Chat on WhatsApp">
                <MessageCircle size={20} />
            </button>
            <button onClick={() => setIsVoiceMode(true)} className="action-btn" title="Voice Mode">
                <Mic size={20} />
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className="action-btn">
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button onClick={onClose} className="close-btn"><X size={22} /></button>
        </div>
      </div>

      <div className="chat-body" ref={chatBodyRef}>
        {messages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role}`}>
                <div className="msg-bubble">{msg.content}</div>
            </div>
        ))}
        {isLoading && <div className="msg-row assistant"><div className="typing-dots"><span>.</span><span>.</span><span>.</span></div></div>}
      </div>

      <div className="chat-footer">
        <div className="input-box">
            <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about RCM..."
                disabled={isLoading}
            />
            <button onClick={() => handleSend()} disabled={isLoading || !input.trim()}>
                <SendHorizontal size={20} />
            </button>
        </div>
      </div>
    </div>
  );
}

export default ChatWindow;